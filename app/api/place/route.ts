// Real place enrichment via Google Places API (New): photo + rating + one
// review, in a single searchText call. Graceful: no key returns { enabled:false }
// so the UI just shows the text plan. Cached per query at the edge.
const ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const FIELDS = "places.id,places.rating,places.userRatingCount,places.photos,places.reviews";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q) return Response.json({ enabled: false, reason: "no_query" });

  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return Response.json({ enabled: false, reason: "no_key" });

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": FIELDS,
      },
      body: JSON.stringify({ textQuery: q, maxResultCount: 1 }),
      // cache identical place lookups for a day
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return Response.json({ enabled: true, found: false });
    const json = await res.json();
    const p = json?.places?.[0];
    if (!p) return Response.json({ enabled: true, found: false });

    const review = p.reviews?.[0];
    const photoNames: string[] = (p.photos ?? []).map((ph: { name?: string }) => ph?.name).filter(Boolean).slice(0, 8);
    return Response.json({
      enabled: true,
      found: true,
      rating: p.rating ?? null,
      reviews: p.userRatingCount ?? null,
      photoName: photoNames[0] ?? null,
      photoNames,
      review: review
        ? { text: (review.text?.text ?? "").slice(0, 160), author: review.authorAttribution?.displayName ?? null, rating: review.rating ?? null }
        : null,
    });
  } catch {
    return Response.json({ enabled: true, found: false });
  }
}
