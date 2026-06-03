// Full hotel detail (photos, description) via LiteAPI, fetched on demand when a
// user opens a hotel's gallery. Graceful: demo id / no key returns empty so the
// UI falls back to the single search thumbnail.
const BASE = "https://api.liteapi.travel/v3.0";

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id")?.trim();
  const key = process.env.LITEAPI_KEY;
  if (!id) return Response.json({ images: [], reason: "no_id" }, { status: 400 });
  if (id.startsWith("demo_") || !key) return Response.json({ images: [], source: "demo" });

  try {
    const r = await fetch(`${BASE}/data/hotel?hotelId=${encodeURIComponent(id)}`, {
      headers: { "X-API-Key": key, accept: "application/json" },
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(8000),
    });
    const d = (await r.json())?.data ?? {};
    const raw = (d.hotelImages ?? d.images ?? []) as Array<Record<string, unknown>>;
    const images = raw
      .map((i) => String(i.urlHd || i.url || ""))
      .filter((u) => u.startsWith("http"))
      .slice(0, 12);
    const desc = typeof d.hotelDescription === "string" ? d.hotelDescription.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 360) : null;
    return Response.json({ source: "liteapi", name: d.name ?? null, description: desc, images });
  } catch {
    return Response.json({ images: [], source: "error" });
  }
}
