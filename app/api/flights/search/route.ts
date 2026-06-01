// Real flight search via Duffel — live, dynamic offers with real expiry.
// POST { origin, destination, date, adults?, children? } (origin/destination = IATA, e.g. CGK, NRT)
// → { offers: [{ id, airline, airlineLogo, price, currency, depart, arrive, duration, stops, expiresAt }], source }
// Without DUFFEL_API_TOKEN it returns clearly-labelled demo offers so the flow
// is buildable; with the token it returns real sandbox/live offers.

type Offer = {
  id: string;
  airline: string;
  airlineLogo: string | null;
  price: string;
  currency: string;
  depart: string;
  arrive: string;
  duration: string;
  stops: number;
  expiresAt: string | null;
};

function isoDuration(d?: string): string {
  if (!d) return "";
  const m = d.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) return "";
  return [m[1] && `${m[1]}h`, m[2] && `${m[2]}m`].filter(Boolean).join(" ");
}

function demoOffers(origin: string, destination: string): Offer[] {
  return [
    { id: "demo_1", airline: "Garuda Indonesia", airlineLogo: null, price: "7,250,000", currency: "IDR", depart: `${origin} 23:55`, arrive: `${destination} 08:40 +1`, duration: "7h 45m", stops: 0, expiresAt: null },
    { id: "demo_2", airline: "Singapore Airlines", airlineLogo: null, price: "8,900,000", currency: "IDR", depart: `${origin} 17:20`, arrive: `${destination} 07:05 +1`, duration: "10h 45m", stops: 1, expiresAt: null },
    { id: "demo_3", airline: "Scoot", airlineLogo: null, price: "5,480,000", currency: "IDR", depart: `${origin} 06:10`, arrive: `${destination} 18:30`, duration: "12h 20m", stops: 1, expiresAt: null },
  ];
}

export async function POST(req: Request) {
  let body: { origin?: string; destination?: string; date?: string; adults?: number; children?: number } = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  const origin = (body.origin || "").toUpperCase().trim();
  const destination = (body.destination || "").toUpperCase().trim();
  const date = body.date || "";
  const adults = Math.max(1, body.adults ?? 1);
  if (!/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: "need origin/destination IATA codes and a YYYY-MM-DD date" }, { status: 400 });
  }

  const token = process.env.DUFFEL_API_TOKEN;
  if (!token) return Response.json({ offers: demoOffers(origin, destination), source: "demo" });

  try {
    const passengers = Array.from({ length: adults }, () => ({ type: "adult" }));
    const res = await fetch("https://api.duffel.com/air/offer_requests?return_offers=true", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Duffel-Version": "v2",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        data: { slices: [{ origin, destination, departure_date: date }], passengers, cabin_class: "economy" },
      }),
    });
    if (!res.ok) throw new Error(`duffel ${res.status}`);
    const json = await res.json();
    const raw = json?.data?.offers ?? [];
    const offers: Offer[] = raw.slice(0, 8).map((o: Record<string, unknown>) => {
      const slice = (o.slices as Record<string, unknown>[])?.[0] ?? {};
      const segs = (slice.segments as Record<string, unknown>[]) ?? [];
      const first = segs[0] ?? {};
      const last = segs[segs.length - 1] ?? {};
      const owner = o.owner as Record<string, unknown> | undefined;
      return {
        id: String(o.id),
        airline: String(owner?.name ?? "Airline"),
        airlineLogo: (owner?.logo_symbol_url as string) ?? null,
        price: String(o.total_amount ?? ""),
        currency: String(o.total_currency ?? ""),
        depart: String(first.departing_at ?? ""),
        arrive: String(last.arriving_at ?? ""),
        duration: isoDuration(slice.duration as string),
        stops: Math.max(0, segs.length - 1),
        expiresAt: (o.expires_at as string) ?? null,
      };
    });
    return Response.json({ offers, source: "duffel" });
  } catch (e) {
    return Response.json({ offers: demoOffers(origin, destination), source: "fallback", error: String(e) });
  }
}
