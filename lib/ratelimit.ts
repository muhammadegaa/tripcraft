// Durable per-key rate limiting. Uses Upstash Redis REST when configured (one
// shared counter across all serverless instances) and falls back to a
// per-instance in-memory counter otherwise, so dev and unconfigured deploys
// still work. The in-memory path is best-effort only: on Vercel each instance
// has its own map, so configure Upstash in production to actually cap spend.

const REST_URL = process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const mem = new Map<string, { n: number; reset: number }>();

function memLimited(key: string, max: number, windowSec: number): boolean {
  const now = Date.now();
  const cur = mem.get(key);
  if (!cur || now > cur.reset) {
    mem.set(key, { n: 1, reset: now + windowSec * 1000 });
    return false;
  }
  cur.n += 1;
  return cur.n > max;
}

// Returns true when the caller is OVER the limit and should be refused.
export async function rateLimited(key: string, max: number, windowSec: number): Promise<boolean> {
  if (!REST_URL || !REST_TOKEN) return memLimited(key, max, windowSec);
  try {
    const res = await fetch(`${REST_URL}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${REST_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify([
        ["INCR", `rl:${key}`],
        ["EXPIRE", `rl:${key}`, String(windowSec), "NX"],
      ]),
      cache: "no-store",
    });
    if (!res.ok) return memLimited(key, max, windowSec);
    const out = (await res.json()) as { result: number }[];
    const n = Number(out?.[0]?.result ?? 0);
    return n > max;
  } catch {
    return memLimited(key, max, windowSec);
  }
}
