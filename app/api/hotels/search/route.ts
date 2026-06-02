// Real hotel search via LiteAPI: list hotels in a city, then live rates for the
// dates. Returns bookable options with photo + rating + price. Graceful demo
// without a key. POST { destination, checkin, checkout, adults }
type HotelOption = { id: string; name: string; photo: string | null; stars: number | null; rating: number | null; reviews: number | null; price: number | null; currency: string; offerId: string | null };

const DEST: Record<string, { city: string; country: string }> = {
  japan: { city: "Tokyo", country: "JP" }, tokyo: { city: "Tokyo", country: "JP" }, kyoto: { city: "Kyoto", country: "JP" }, osaka: { city: "Osaka", country: "JP" },
  bali: { city: "Denpasar", country: "ID" }, indonesia: { city: "Jakarta", country: "ID" }, jakarta: { city: "Jakarta", country: "ID" },
  korea: { city: "Seoul", country: "KR" }, seoul: { city: "Seoul", country: "KR" }, busan: { city: "Busan", country: "KR" },
  thailand: { city: "Bangkok", country: "TH" }, bangkok: { city: "Bangkok", country: "TH" }, singapore: { city: "Singapore", country: "SG" },
  vietnam: { city: "Ho Chi Minh City", country: "VN" }, taiwan: { city: "Taipei", country: "TW" },
  portugal: { city: "Lisbon", country: "PT" }, lisbon: { city: "Lisbon", country: "PT" }, italy: { city: "Rome", country: "IT" }, rome: { city: "Rome", country: "IT" },
  france: { city: "Paris", country: "FR" }, paris: { city: "Paris", country: "FR" }, spain: { city: "Madrid", country: "ES" }, london: { city: "London", country: "GB" },
};
function resolveDest(destination: string): { city: string; country: string } | null {
  const key = destination.toLowerCase().split(/[\s,]+/).find((w) => DEST[w]);
  return key ? DEST[key] : null;
}

function ratePrice(rate: Record<string, unknown> | undefined): { amount: number | null; currency: string } {
  const rr = (rate?.retailRate as Record<string, unknown>) ?? {};
  const total = rr.total as Array<{ amount?: number; currency?: string }> | undefined;
  if (total?.[0]?.amount != null) return { amount: Number(total[0].amount), currency: total[0].currency ?? "USD" };
  if (rr.amount != null) return { amount: Number(rr.amount), currency: String(rr.currency ?? "USD") };
  return { amount: null, currency: "USD" };
}

function demo(): HotelOption[] {
  return [
    { id: "demo_h1", name: "The Station Hotel, Central", photo: null, stars: 4, rating: 8.7, reviews: 1240, price: 110, currency: "USD", offerId: "demo_o1" },
    { id: "demo_h2", name: "Riverside Boutique Stay", photo: null, stars: 4, rating: 9.1, reviews: 880, price: 145, currency: "USD", offerId: "demo_o2" },
    { id: "demo_h3", name: "Old Town Budget Inn", photo: null, stars: 3, rating: 8.2, reviews: 2100, price: 72, currency: "USD", offerId: "demo_o3" },
  ];
}

export async function POST(req: Request) {
  let body: { destination?: string; checkin?: string; checkout?: string; adults?: number } = {};
  try { body = await req.json(); } catch { return Response.json({ error: "bad request" }, { status: 400 }); }
  const { destination = "", checkin = "", checkout = "", adults = 2 } = body;
  const key = process.env.LITEAPI_KEY;
  const dest = resolveDest(destination);
  if (!key || !dest || !/^\d{4}-\d{2}-\d{2}$/.test(checkin)) {
    return Response.json({ source: "demo", hotels: demo() });
  }

  try {
    const h = await fetch(`https://api.liteapi.travel/v3.0/data/hotels?countryCode=${dest.country}&cityName=${encodeURIComponent(dest.city)}&limit=12`, { headers: { "X-API-Key": key, accept: "application/json" } });
    const hotels = ((await h.json()).data ?? []) as Record<string, unknown>[];
    if (!hotels.length) return Response.json({ source: "demo", hotels: demo() });
    const byId = new Map(hotels.map((x) => [String(x.id), x]));
    const ids = hotels.map((x) => String(x.id));

    const r = await fetch("https://api.liteapi.travel/v3.0/hotels/rates", {
      method: "POST",
      headers: { "X-API-Key": key, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ hotelIds: ids, occupancies: [{ adults }], checkin, checkout, currency: "USD", guestNationality: "US" }),
    });
    const rated = ((await r.json()).data ?? []) as Record<string, unknown>[];
    const out: HotelOption[] = [];
    for (const row of rated) {
      const meta = byId.get(String(row.hotelId));
      if (!meta) continue;
      const rt = (row.roomTypes as Record<string, unknown>[])?.[0];
      const rate = (rt?.rates as Record<string, unknown>[])?.[0];
      const { amount, currency } = ratePrice(rate);
      if (amount == null) continue;
      out.push({
        id: String(row.hotelId),
        name: String(meta.name ?? "Hotel"),
        photo: (meta.main_photo as string) ?? (meta.thumbnail as string) ?? null,
        stars: (meta.stars as number) ?? null,
        rating: (meta.rating as number) ?? null,
        reviews: (meta.reviewCount as number) ?? null,
        price: Math.round(amount),
        currency,
        offerId: (rt?.offerId as string) ?? null,
      });
    }
    out.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    return Response.json({ source: "liteapi", hotels: out.slice(0, 8).length ? out.slice(0, 8) : demo() });
  } catch (e) {
    return Response.json({ source: "fallback", error: String(e), hotels: demo() });
  }
}
