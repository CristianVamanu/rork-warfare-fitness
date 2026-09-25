# The store

Public at `/shop`. Anyone can browse and buy the open items; items marked
**earned, not given** need a signed-in member with a verified finish in one
of the challenges that unlock them. Printing and shipping is done by a
print-on-demand provider (Printify or Gelato); the app owns the storefront,
the checkout (Stripe) and the gate.

## One-time setup

1. **Pick the provider** in Admin → Store → Settings.
2. **Keys** in Admin → Integrations → Print-on-demand:
   - Printify: API token from printify.com → My profile → Connections → API tokens.
   - Gelato: API key from dashboard.gelato.com → Developer → API keys.
3. Back in Store → Settings, press **Test connection**. It lists your shops
   (Printify) or stores (Gelato); paste the id in and Save.
4. **Products** sync themselves. Publish (or edit, or delete) a product on
   the provider's site and its webhook (step 5) imports it into the shop:
   priced and on the shelf, unless you turned "straight on the shelf" off.
   - Pricing: Printify sends its retail price. Gelato does not, so the
     shop prices from Gelato's **cost × your markup** (Store → Settings,
     default 100% = ×2, rounded to .99). A price you type on a product
     wins over the markup, and survives later imports.
   - Gelato orders reference your store variant, so the design comes from
     Gelato. No print files to paste.
   - **Import from provider** still exists for a first pull or a resync.
   - "Earned, not given" and the unlocking challenges are set per product
     (or from the challenge editor's Rewards picker).
5. **Webhooks**, so status updates land the moment they happen (an hourly
   poll covers anything missed either way):
   - Printify: My profile → Connections → Webhooks → add
     `https://<your domain>/api/shop/webhooks/printify` for `order:updated`
     and `order:shipment:created`, set a secret, store it as
     `PRINTIFY_WEBHOOK_SECRET`.
   - Gelato: Developer → Webhooks → add
     `https://<your domain>/api/shop/webhooks/gelato` for
     `order_status_updated`, `order_item_tracking_code_updated`,
     `store_product_created`, `store_product_updated` and
     `store_product_deleted`, with a custom header
     `X-Webhook-Secret: <value>` stored as `GELATO_WEBHOOK_SECRET`.
6. Stripe: the existing webhook already receives `checkout.session.completed`;
   store orders ride on it. Nothing to add.

## Product images

Provider image links are copied into R2 at import (`shop/<providerProductId>/…`)
and the product stores the R2 URL. Gelato's preview links are signed and expire
within hours, which showed as broken-image icons on the shelf. Re-importing
refreshes any product whose pictures are not yet on R2. Needs the R2 secrets
in Admin → Integrations; without them the provider link is kept as-is.

## How an order moves

```
cart → /api/shop/checkout (reprices from Firestore, enforces the gate)
     → Stripe Checkout (address, phone, promo codes)
     → Stripe webhook: order paid → provider order placed → email "received"
     → provider webhook / hourly sync: production → shipped (email) → delivered
```

Members see their orders under Profile → Shop & orders, or `/shop/orders`.
Guests get a link with a token in the confirmation email.

If the hand-off to the provider fails (key missing, product unpublished,
provider down) the order shows **Needs attention** in Admin → Store → Orders
with the reason. Fix the cause and press **Retry**; an order is never sent
to the provider twice.

## Cron

`deploy.sh` installs `/api/shop/sync-orders` hourly at :37 alongside the
other jobs. `scripts/server-verify.sh` checks for it.
