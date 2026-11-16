# Financials (admin)

`/admin/finance` is the financial command centre: overview, customers and payers, transactions, subscriptions, failed payments, refunds and disputes, reports, and forecasting. It is admin-only. Every API call goes through `verifyAdmin`, which checks the `admin` role and 2FA status server-side. The mirror collections have no client rule, so only firebase-admin can read them.

## Where the numbers come from

| Source | How it reaches the dashboard |
|---|---|
| **Stripe**: website subscriptions, program and coaching purchases | Mirrored into `finCustomers`, `finSubscriptions`, `finInvoices`, `finCharges`, `finRefunds` and `finDisputes`, keyed by Stripe id. |
| **Google Play** via RevenueCat | Each purchase or renewal event is written to `finStoreEvents`, keyed by RevenueCat event id. |

The Stripe mirror is kept current three ways:
1. A backfill or catch-up sync (`POST /api/admin/finance/sync`; the "Import from Stripe", "Sync" and "Full resync" buttons). This only reads from Stripe.
2. The existing Stripe webhook. After its own work, it upserts the event's object.
3. An automatic catch-up when the mirror is more than 10 minutes old.

Writing a record again overwrites it, so syncs, webhook redeliveries and overlaps cannot double-count anything.

For Google Play:
- RevenueCat reports the store price before Google's commission and tax. The dashboard shows it separately, labelled "gross", and never adds it to Stripe net.
- History before the ledger existed is not available without a RevenueCat API key. The dashboard shows the date the ledger started.

**Stripe webhook events to enable** (Dashboard → Developers → Webhooks), so the mirror is live between syncs:
- `charge.succeeded`, `charge.failed`, `charge.refunded`, `charge.refund.updated`
- `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`
- `invoice.created`, `invoice.finalized`, `invoice.paid`, `invoice.payment_failed`, `invoice.updated`, `invoice.voided`, `invoice.marked_uncollectible`
- `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
- `customer.created`, `customer.updated`

Events you don't enable are still picked up by the catch-up sync. The one exception is plan-change history, which only the webhook can record (see Limitations).

## Definitions

Every figure is for **one currency**. Amounts are integers in the currency's minor unit (pence, cents; whole yen for zero-decimal currencies). Figures in different currencies are never added together. Date grouping uses the admin's browser timezone.

| Metric | Definition |
|---|---|
| Gross revenue | Succeeded Stripe charges created in the period, as charged to the customer. Discounts are already deducted by Stripe. If Stripe Tax is used, tax is included. Before Stripe fees. |
| Refunds | Succeeded refunds created in the period. Pending refunds are shown separately. |
| Disputes lost | Disputes with status `lost`, by dispute date. |
| Net collected | Gross − refunds − disputes lost. |
| Stripe fees | From each charge's balance transaction, where it is in the same currency. Shown as information only; not subtracted from net. |
| MRR | The monthly value of subscriptions that are paying now: active or past due, past any trial, not paused. Yearly ÷ 12, weekly × 52.1775 ÷ 12, daily × 365.25 ÷ 12, divided by the interval count. Forever and repeating discounts are applied while active. Trials are not MRR. |
| New / churned MRR | Subscriptions whose paid period started / ended in the period, valued at the price in force then. |
| Expansion / contraction MRR | Price changes recorded by the webhook (`customer.subscription.updated` with previous items). Stripe keeps no price history, so these are tracked from the first sync onward. |
| ARR | MRR × 12. |
| Paying customers | Distinct customers with at least one paying subscription now. On trial and scheduled-to-cancel are shown separately. |
| ARPU | MRR ÷ paying customers, both "now" (monthly). |
| Customer churn | Customers paying at the start of the period who are not paying at its end. A scheduled cancellation is **not** churn until the paid period ends. |
| Revenue churn | Churned MRR ÷ MRR at period start. |
| LTV (actual) | Net collected per customer who ever paid. |
| LTV (estimated) | ARPU ÷ average monthly churn. Only shown with at least 3 months and 20 customer-months of history; capped at 60 × ARPU. |
| Failed payments | Charges with status `failed` in the period. |
| Outstanding | Open invoices that have had at least one failed attempt (amount remaining). |
| Recovered | Invoices paid in the period after more than one attempt. |
| Recovery rate | Recovered ÷ (recovered + outstanding + written off in period). |
| Refund rate | Refunds ÷ gross, in the period. |

### Transaction types

Taken from the invoice's `billing_reason`:

| Type | Meaning |
|---|---|
| `initial` | `subscription_create` |
| `renewal` | `subscription_cycle` (also used for other recurring reasons) |
| `plan_change` | `subscription_update` |
| `one_time` | No subscription invoice (program purchases, trial fees) |
| `failed` | A failed charge |
| `refund`, `chargeback` | Separate rows linked to the original charge |

### Subscription statuses

| Status | Meaning |
|---|---|
| Active | Active. |
| Cancels at period end | Active with `cancel_at_period_end`. |
| Trial | Trialing. |
| Past due | Past due. |
| Payment failed | Stripe `unpaid`. |
| Cancelled | Stopped immediately. |
| Expired | Ran to the end of a period it was set to stop at, or `incomplete_expired`. |
| Incomplete | Incomplete. |
| Paused | Payment collection paused. |
| One-time | No subscription. |

## Forecast

The forecast is an **estimate, not collected revenue**.

For every active, trialing or past-due subscription that is not set to cancel, each future billing date within the horizon is counted at its price. Each one is weighted by:
- a survival factor, `(1 − monthly churn)^months-ahead`;
- for a trial, the trial conversion rate;
- for a past-due subscription, the recovery rate (50% assumed).

| Assumption | Values |
|---|---|
| Churn, three scenarios | Conservative = max(1.5 × churn, churn + 2 pts); expected = measured churn; optimistic = 0.5 × churn |
| Measured churn | Used only with 3+ months and 20+ customer-months of history. Otherwise 5% is assumed and labelled as an assumption. Never below 1% a month. |
| Trial conversion | Measured from trials that have ended, once at least 5 have ended. Otherwise 50% is assumed. |

New sign-ups are not included. Projected MRR and ARR apply the same churn to today's MRR.

## Actions and audit

- **Refunds** (`POST /api/admin/finance/refund`):
  - Need an explicit `REFUND` confirmation.
  - The amount is checked against what Stripe says is still refundable on the charge, at the time of the request.
  - A client request id is sent as the Stripe idempotency key, so a double click refunds once.
  - Access changes and partner clawbacks then follow from the existing `charge.refunded` webhook, exactly as for a refund made in the Stripe dashboard.
- **Never automatic:** nothing in the finance screens charges a customer or changes a payment method.
- **Audit log:** syncs, refunds (issued, refused and failed) and exports are written to `finAudit` with the admin's uid.
- **Exports** (`GET /api/admin/finance/export?kind=…`):
  - Built server-side from the same functions as the screens, for the selected range and currency.
  - CSV, with formula-injection escaping.

## Privacy

No card numbers, CVCs, fingerprints or bank details are stored. The mirror keeps the card brand and last 4 digits (as on Stripe receipts), the country, and the failure message Stripe returns.

## Limitations

- **Plan-change history:** expansion and contraction before the first sync can't be reconstructed, because Stripe stores no price history. Past MRR uses the current price for subscriptions with no recorded change.
- **Google Play:** only events from the ledger's start date onward, at gross store price.
- **Scale:** the mirror is read in full per report, cached per server instance until it changes. This suits up to tens of thousands of records. Beyond that, move the aggregates to scheduled pre-computation.
