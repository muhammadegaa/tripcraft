import Stripe from "stripe";

// Creates a PaymentIntent for the trip total (flights + hotels). Amount in major
// units; we convert to the smallest unit. Graceful: no key returns
// { simulated:true } so the UI falls back to a mock payment.
const ZERO_DECIMAL = new Set(["jpy", "krw", "vnd", "idr0"]); // idr handled as 2-decimal below

export async function POST(req: Request) {
  const key = process.env.STRIPE_SECRET_KEY;
  let body: { amount?: number; currency?: string } = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const major = Math.max(1, Math.round(Number(body.amount) || 0));
  const currency = (body.currency || "usd").toLowerCase();
  if (!key) return Response.json({ simulated: true });

  try {
    const stripe = new Stripe(key);
    const minor = ZERO_DECIMAL.has(currency) ? major : major * 100;
    const intent = await stripe.paymentIntents.create({
      amount: minor,
      currency,
      payment_method_types: ["card"],
      description: "Tripcraft trip booking",
    });
    return Response.json({ clientSecret: intent.client_secret });
  } catch (e) {
    return Response.json({ simulated: true, error: String(e) });
  }
}
