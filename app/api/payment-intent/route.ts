import Stripe from "stripe";

// Creates a PaymentIntent for the trip total. Stripe issues the real receipt
// (hosted receipt_url + emails it via receipt_email), in test mode too, so we
// never hand-roll a receipt. Graceful: no key returns { simulated:true } and the
// booking flow proceeds without a charge.
const ZERO_DECIMAL = new Set(["jpy", "krw", "vnd", "clp", "bif", "djf", "gnf", "kmf", "mga", "pyg", "rwf", "ugx", "vuv", "xaf", "xof", "xpf"]);

export async function POST(req: Request) {
  const key = process.env.STRIPE_SECRET_KEY;
  let body: { amount?: number; currency?: string; email?: string; destination?: string } = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const major = Math.max(1, Math.round(Number(body.amount) || 0));
  const currency = (body.currency || "usd").toLowerCase();
  const email = (body.email || "").trim();
  if (!key) return Response.json({ simulated: true });

  try {
    const stripe = new Stripe(key);
    const minor = ZERO_DECIMAL.has(currency) ? major : major * 100;
    const intent = await stripe.paymentIntents.create({
      amount: minor,
      currency,
      automatic_payment_methods: { enabled: true },
      description: `Tripcraft booking: ${body.destination || "trip"}`,
      receipt_email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined,
      metadata: { destination: body.destination || "" },
    });
    return Response.json({ clientSecret: intent.client_secret, paymentIntentId: intent.id });
  } catch (e) {
    return Response.json({ simulated: true, error: String(e) });
  }
}
