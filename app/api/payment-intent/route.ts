import Stripe from "stripe";

// Creates a PaymentIntent for the fixed concierge deposit. Returns a
// clientSecret the in-app Payment Element confirms (no redirect). When no
// STRIPE_SECRET_KEY is set, returns { simulated: true } so the UI falls back to
// a believable mock checkout — the app stays clickable with zero config.
//
// IDR is a 2-decimal currency in Stripe: set STRIPE_DEPOSIT_AMOUNT in the
// smallest unit (IDR 750.000 → 75000000). Your Stripe account must support IDR,
// or switch STRIPE_DEPOSIT_CURRENCY to one it does.
export async function POST() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return Response.json({ simulated: true });

  try {
    const stripe = new Stripe(key);
    let amount = parseInt(process.env.STRIPE_DEPOSIT_AMOUNT || "75000000", 10);
    let currency = (process.env.STRIPE_DEPOSIT_CURRENCY || "idr").toLowerCase();
    // If a managed Price exists, it is the source of truth for pricing.
    if (process.env.STRIPE_PRICE_ID) {
      const price = await stripe.prices.retrieve(process.env.STRIPE_PRICE_ID);
      if (price.unit_amount) amount = price.unit_amount;
      if (price.currency) currency = price.currency;
    }
    const intent = await stripe.paymentIntents.create({
      amount,
      currency,
      // Card-only keeps the checkout clean (no Link "save info" bloat). For the
      // real Indonesian launch, add local rails (QRIS, GoPay/OVO, VA) here.
      payment_method_types: ["card"],
      description: "Tripcraft concierge deposit",
    });
    return Response.json({ clientSecret: intent.client_secret });
  } catch (e) {
    // Misconfigured key / unsupported currency → don't break the flow.
    return Response.json({ simulated: true, error: String(e) });
  }
}
