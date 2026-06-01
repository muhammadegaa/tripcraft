// One-time Stripe pricing setup. Run with:
//   node --env-file=.env.local scripts/setup-stripe.mjs
// Node loads the secret key from .env.local itself — it is never printed.
// Idempotent: re-running reuses the existing Tripcraft deposit product/price.
import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("✗ STRIPE_SECRET_KEY is not set in .env.local. Add it and re-run.");
  process.exit(1);
}

const amount = parseInt(process.env.STRIPE_DEPOSIT_AMOUNT || "75000000", 10);
const currency = (process.env.STRIPE_DEPOSIT_CURRENCY || "idr").toLowerCase();
const human = `${currency.toUpperCase()} ${(amount / 100).toLocaleString("en-US")}`;

const stripe = new Stripe(key);

try {
  // Reuse an existing tagged product if present.
  let product;
  try {
    const found = await stripe.products.search({
      query: "metadata['app']:'tripcraft' AND metadata['kind']:'deposit'",
    });
    product = found.data[0];
  } catch {
    /* search may lag right after creation; fall through to create */
  }
  if (!product) {
    product = await stripe.products.create({
      name: "Tripcraft concierge deposit",
      description: "Refundable deposit to book and manage the full trip.",
      metadata: { app: "tripcraft", kind: "deposit" },
    });
  }

  // Reuse a matching active price, else create one.
  const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
  let price = prices.data.find(
    (p) => p.unit_amount === amount && p.currency === currency && !p.recurring
  );
  if (!price) {
    price = await stripe.prices.create({
      product: product.id,
      unit_amount: amount,
      currency,
      metadata: { app: "tripcraft" },
    });
  }

  console.log("");
  console.log(`✓ Mode:    ${price.livemode ? "LIVE" : "TEST"}`);
  console.log(`✓ Product: ${product.id}`);
  console.log(`✓ Price:   ${price.id}  (${human})`);
  console.log("");
  console.log("Add this line to .env.local (the route will source the amount from Stripe):");
  console.log(`STRIPE_PRICE_ID=${price.id}`);
} catch (e) {
  // Stripe redacts keys in its own error messages; safe to surface.
  console.error("✗ Stripe setup failed:", e?.message || String(e));
  process.exit(1);
}
