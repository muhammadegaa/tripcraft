// Airport / city autocomplete via Duffel place suggestions, so people search
// "Jakarta" instead of typing "CGK". Small static fallback without a token.
const STATIC = [
  { iata: "CGK", name: "Soekarno-Hatta", city: "Jakarta" }, { iata: "DPS", name: "Ngurah Rai", city: "Bali" },
  { iata: "TYO", name: "Tokyo (all)", city: "Tokyo" }, { iata: "HND", name: "Haneda", city: "Tokyo" }, { iata: "KIX", name: "Kansai", city: "Osaka" },
  { iata: "SIN", name: "Changi", city: "Singapore" }, { iata: "BKK", name: "Suvarnabhumi", city: "Bangkok" }, { iata: "ICN", name: "Incheon", city: "Seoul" },
  { iata: "LIS", name: "Humberto Delgado", city: "Lisbon" }, { iata: "FCO", name: "Fiumicino", city: "Rome" }, { iata: "CDG", name: "Charles de Gaulle", city: "Paris" },
  { iata: "LHR", name: "Heathrow", city: "London" }, { iata: "SGN", name: "Tan Son Nhat", city: "Ho Chi Minh City" }, { iata: "TPE", name: "Taoyuan", city: "Taipei" },
];

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim().toLowerCase() ?? "";
  if (q.length < 2) return Response.json({ results: [] });

  const token = process.env.DUFFEL_API_TOKEN;
  if (!token) {
    return Response.json({ results: STATIC.filter((a) => `${a.city} ${a.name} ${a.iata}`.toLowerCase().includes(q)).slice(0, 6) });
  }
  try {
    const res = await fetch(`https://api.duffel.com/places/suggestions?query=${encodeURIComponent(q)}`, {
      headers: { Authorization: `Bearer ${token}`, "Duffel-Version": "v2", Accept: "application/json" },
      next: { revalidate: 86400 },
    });
    const data = ((await res.json())?.data ?? []) as Record<string, unknown>[];
    const results = data
      .filter((p) => p.iata_code)
      .slice(0, 6)
      .map((p) => ({ iata: String(p.iata_code), name: String(p.name ?? ""), city: String(p.city_name ?? p.name ?? "") }));
    return Response.json({ results });
  } catch {
    return Response.json({ results: STATIC.filter((a) => `${a.city} ${a.iata}`.toLowerCase().includes(q)).slice(0, 6) });
  }
}
