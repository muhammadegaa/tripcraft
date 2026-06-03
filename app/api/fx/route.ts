// Live USD-based exchange rates, cached for 12h. Free, no key. Used to show
// every price in one currency the user picks, instead of mixing GBP flights
// with USD hotels. Falls back to a static table if the provider is down so the
// UI always has something sane.
const FALLBACK: Record<string, number> = {
  USD: 1, EUR: 0.92, GBP: 0.79, IDR: 16200, SGD: 1.35, JPY: 157, AUD: 1.52, MYR: 4.7, THB: 36, KRW: 1370,
};

export async function GET() {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      next: { revalidate: 60 * 60 * 12 },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`fx ${res.status}`);
    const json = await res.json();
    const rates = json?.rates;
    if (!rates || typeof rates.USD !== "number") throw new Error("bad fx payload");
    return Response.json({ base: "USD", rates, source: "live" });
  } catch {
    return Response.json({ base: "USD", rates: FALLBACK, source: "fallback" });
  }
}
