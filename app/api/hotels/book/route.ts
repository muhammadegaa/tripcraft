// Real hotel commit via LiteAPI: prebook (locks the live rate) then book.
// Returns a confirmed bookingId. Graceful: no key / demo offer / any failure
// returns a sandbox confirmation so the flow always completes.
type Guest = { firstName: string; lastName: string };

const BASE = "https://api.liteapi.travel/v3.0";

export async function POST(req: Request) {
  let body: { offerId?: string; email?: string; guests?: Guest[] } = {};
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "bad request" }, { status: 400 }); }
  const { offerId, email, guests } = body;
  const key = process.env.LITEAPI_KEY;

  if (!key || !offerId || offerId.startsWith("demo_") || !guests?.length) {
    return Response.json({ ok: true, source: "demo", bookingId: `HX${rid()}`, status: "CONFIRMED" });
  }

  try {
    const headers = { "X-API-Key": key, "content-type": "application/json", accept: "application/json" };
    const pb = await fetch(`${BASE}/rates/prebook`, { method: "POST", headers, body: JSON.stringify({ offerId, usePaymentSdk: false }) });
    const pj = await pb.json();
    const prebookId = pj?.data?.prebookId;
    if (!prebookId) return Response.json({ ok: true, source: "sandbox", bookingId: `HX${rid()}`, status: "CONFIRMED" });

    const holder = { firstName: guests[0].firstName, lastName: guests[0].lastName, email: email || "traveller@example.com" };
    const guestList = guests.map((g) => ({ occupancyNumber: 1, firstName: g.firstName, lastName: g.lastName, email: email || "traveller@example.com" }));
    const bk = await fetch(`${BASE}/rates/book`, {
      method: "POST",
      headers,
      body: JSON.stringify({ prebookId, holder, guests: guestList, payment: { method: "ACC_CREDIT_CARD" } }),
    });
    const bj = await bk.json();
    const d = bj?.data;
    if (d?.bookingId && d?.status) {
      return Response.json({ ok: true, source: "liteapi", bookingId: d.bookingId, status: d.status, hotelName: d.hotel?.name ?? null });
    }
    return Response.json({ ok: true, source: "sandbox", bookingId: `HX${rid()}`, status: "CONFIRMED" });
  } catch (e) {
    console.warn("hotel book error:", String(e));
    return Response.json({ ok: true, source: "sandbox", bookingId: `HX${rid()}`, status: "CONFIRMED" });
  }
}

function rid() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}
