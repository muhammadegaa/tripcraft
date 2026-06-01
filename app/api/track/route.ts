// Minimal funnel tracker. In dev it logs to your terminal so you can watch the
// funnel live. On Vercel it lands in Function Logs. For the real experiment,
// also add Vercel Analytics or Plausible — but money in your payment dashboard
// is the only metric that decides go/kill.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log(`[funnel] ${body.event}`, JSON.stringify(body.data ?? {}));
  } catch {
    // ignore malformed beacons
  }
  return new Response(null, { status: 204 });
}
