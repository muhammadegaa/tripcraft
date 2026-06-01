// Real flight search via Duffel (sandbox/live). Round-trip when returnDate is
// given. Returns offers + the offer_request passenger IDs (needed to create an
// order). Graceful demo offers without a token so the flow is always clickable.
type Slice = { from: string; to: string; depart: string; arrive: string; dur: string; stops: number };
type Offer = { id: string; airline: string; airlineLogo: string | null; price: string; currency: string; expiresAt: string | null; out: Slice; ret: Slice | null };

function iso(d?: string) {
  if (!d) return "";
  const m = d.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  return m ? [m[1] && `${m[1]}h`, m[2] && `${m[2]}m`].filter(Boolean).join(" ") : "";
}
function hhmm(t?: string) {
  if (!t) return "";
  const d = t.slice(11, 16);
  return d || t;
}
function sliceOf(s: Record<string, unknown> | undefined): Slice {
  const segs = ((s?.segments as Record<string, unknown>[]) ?? []);
  const a = segs[0] ?? {};
  const b = segs[segs.length - 1] ?? {};
  const o = a.origin as Record<string, unknown> | undefined;
  const d = b.destination as Record<string, unknown> | undefined;
  return {
    from: String(o?.iata_code ?? ""),
    to: String(d?.iata_code ?? ""),
    depart: hhmm(a.departing_at as string),
    arrive: hhmm(b.arriving_at as string),
    dur: iso(s?.duration as string),
    stops: Math.max(0, segs.length - 1),
  };
}

function demo(origin: string, dest: string, roundTrip: boolean): { offers: Offer[]; passengers: { id: string }[] } {
  const mk = (id: string, airline: string, price: string): Offer => ({
    id, airline, airlineLogo: null, price, currency: "IDR", expiresAt: null,
    out: { from: origin, to: dest, depart: "23:55", arrive: "08:40", dur: "7h 45m", stops: 0 },
    ret: roundTrip ? { from: dest, to: origin, depart: "11:20", arrive: "17:05", dur: "7h 45m", stops: 0 } : null,
  });
  return { offers: [mk("demo_1", "Garuda Indonesia", "7,250,000"), mk("demo_2", "Singapore Airlines", "8,900,000"), mk("demo_3", "Scoot", "5,480,000")], passengers: [{ id: "demo_p1" }] };
}

export async function POST(req: Request) {
  let body: { origin?: string; destination?: string; departDate?: string; returnDate?: string; adults?: number } = {};
  try { body = await req.json(); } catch { return Response.json({ error: "bad request" }, { status: 400 }); }
  const origin = (body.origin || "").toUpperCase().trim();
  const destination = (body.destination || "").toUpperCase().trim();
  const departDate = body.departDate || "";
  const returnDate = body.returnDate || "";
  const adults = Math.max(1, body.adults ?? 1);
  if (!/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination) || !/^\d{4}-\d{2}-\d{2}$/.test(departDate)) {
    return Response.json({ error: "Need 3-letter airport codes and a departure date." }, { status: 400 });
  }
  const roundTrip = /^\d{4}-\d{2}-\d{2}$/.test(returnDate);

  const token = process.env.DUFFEL_API_TOKEN;
  if (!token) return Response.json({ source: "demo", ...demo(origin, destination, roundTrip) });

  try {
    const slices: Record<string, string>[] = [{ origin, destination, departure_date: departDate }];
    if (roundTrip) slices.push({ origin: destination, destination: origin, departure_date: returnDate });
    const res = await fetch("https://api.duffel.com/air/offer_requests?return_offers=true", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Duffel-Version": "v2", "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ data: { slices, passengers: Array.from({ length: adults }, () => ({ type: "adult" })), cabin_class: "economy" } }),
    });
    if (!res.ok) throw new Error(`duffel ${res.status}`);
    const json = await res.json();
    const data = json?.data ?? {};
    const passengers = (data.passengers ?? []).map((p: { id: string }) => ({ id: p.id }));
    const offers: Offer[] = (data.offers ?? []).slice(0, 12).map((o: Record<string, unknown>) => {
      const sl = (o.slices as Record<string, unknown>[]) ?? [];
      const owner = o.owner as Record<string, unknown> | undefined;
      return {
        id: String(o.id),
        airline: String(owner?.name ?? "Airline"),
        airlineLogo: (owner?.logo_symbol_url as string) ?? null,
        price: String(o.total_amount ?? ""),
        currency: String(o.total_currency ?? ""),
        expiresAt: (o.expires_at as string) ?? null,
        out: sliceOf(sl[0]),
        ret: roundTrip ? sliceOf(sl[1]) : null,
      };
    });
    return Response.json({ source: "duffel", offers, passengers });
  } catch (e) {
    return Response.json({ source: "fallback", error: String(e), ...demo(origin, destination, roundTrip) });
  }
}
