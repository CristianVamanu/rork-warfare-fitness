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
4. **Products**: design them on the provider's site, then Store → Products →
   **Import from provider**. Imported items start *off the shelf*. For each:
   set the price (Gelato does not carry a retail price; Printify's is
   imported), tick "earned, not given" and the challenges that unlock it if
   it is a reward, then switch it on.
   - Gelato only: every variant needs a **print file URL** (the design as a
     PNG/PDF at a public URL) or orders will fail to hand off.
5. **Webhooks**, so status updates land the moment they happen (an hourly
   poll covers anything missed either way):
   - Printify: My profile → Connections → Webhooks → add
     `https://<your domain>/api/shop/webhooks/printify` for `order:updated`
     and `order:shipment:created`, set a secret, store it as
     `PRINTIFY_WEBHOOK_SECRET`.
   - Gelato: Developer → Webhooks → add
     `https://<your domain>/api/shop/webhooks/gelato` for
     `order_status_updated` and `order_item_tracking_code_updated`, with a
     custom header `X-Webhook-Secret: <value>` stored as `GELATO_WEBHOOK_SECRET`.
6. Stripe: the existing webhook already receives `checkout.session.completed`;
   store orders ride on it. Nothing to add.

## How an order moves

```
cart → /api/shop/checkout (reprices from Firestore, enforces the gate)
     → Stripe Checkout (address, phone, promo codes)
     → Stripe webhook: order paid → provider order placed → email "received"
     → provider webhook / hourly sync: production → shipped (email) → delivered
```

Members see their orders under Profile → Shop & orders, or `/shop/orders`.
Guests get a link with a token in the confirmation email.

If the hand-off to the provider fails (key missing, print file missing,
provider down) the order shows **Needs attention** in Admin → Store → Orders
with the reason. Fix the cause and press **Retry**; an order is never sent
to the provider twice.

## Cron

`deploy.sh` installs `/api/shop/sync-orders` hourly at :37 alongside the
other jobs. `scripts/server-verify.sh` checks for it.
