// Proxies a Google Places photo so the API key never reaches the browser.
// /api/place-photo?name=places/PID/photos/PHOTOID  →  the image bytes.
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const name = sp.get("name");
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!name || !key || !name.startsWith("places/")) {
    return new Response(null, { status: 404 });
  }
  // Optional larger size for the gallery (clamped). Thumbnails use the default.
  const h = Math.min(1600, Math.max(120, Number(sp.get("h")) || 400));
  const w = Math.min(1600, Math.max(120, Number(sp.get("w")) || 640));
  try {
    const url = `https://places.googleapis.com/v1/${name}/media?maxHeightPx=${h}&maxWidthPx=${w}&key=${key}`;
    const res = await fetch(url, { next: { revalidate: 604800 } });
    if (!res.ok) return new Response(null, { status: 404 });
    const buf = await res.arrayBuffer();
    return new Response(buf, {
      headers: {
        "Content-Type": res.headers.get("content-type") || "image/jpeg",
        "Cache-Control": "public, max-age=604800, immutable",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
