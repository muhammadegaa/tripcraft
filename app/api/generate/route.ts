import Anthropic from "@anthropic-ai/sdk";
import { unstable_cache } from "next/cache";
import { parseTrip, generate, type Day, type Ticket } from "@/lib/itinerary";
import { rateLimited } from "@/lib/ratelimit";
import { log, captureError } from "@/lib/log";

// Itinerary generation takes ~15-30s; allow up to 60s (Vercel Pro) so it doesn't
// time out and fall back to the canned plan in production.
export const maxDuration = 60;

// Real Claude itinerary generation. Falls back to the canned engine when no
// ANTHROPIC_API_KEY is set, so the app works end-to-end with zero config and
// upgrades to real generation the moment the key lands. Server-side only — the
// key never reaches the client.

// claude-haiku-4-5: fastest tier — itinerary generation is a latency-sensitive
// consumer path (users wait on this screen), and Haiku handles the structured
// extraction well. Sonnet (claude-sonnet-4-6) took 50-70s here for a full trip;
// Haiku is several times faster. Bump to claude-sonnet-4-6 / claude-opus-4-8 for
// deeper constraint-solving once accuracy is worth the extra wait.
const MODEL = "claude-haiku-4-5";

const SYSTEM = `You are a meticulous travel planner. You output a day-by-day itinerary as strict JSON.
Hard rules you MUST respect:
- Hotels must be a short walk (under ~5 min) from a train/metro station — say which station in "walk".
- No single transit leg should exceed 2 hours. If one is close, note it in "flag".
- Keep the whole trip realistic for the stated budget.
- Use real, specific places, stations, lines, and plausible times (24h "HH:MM").
- Prices as short Indonesian rupiah strings, e.g. "IDR 1,4jt" (per night for hotels) or "IDR 360rb" (tickets).
- "directions" should be concrete and walkable (e.g. "5 min walk from the south exit").
- "place" must be a searchable place name.
- 3 to 4 stops per day, 1 to 2 transport tickets per day. Be concise.
- Write like a well-travelled friend giving tips, not a brochure. Never use em dashes (—); use commas, colons, or periods. No filler words ("nestled", "vibrant", "immerse", "gem").
CRITICAL: the "days" array MUST contain exactly one object per requested day — if N days are requested, output N day objects, no fewer. This is the most important rule.
Return JSON only, matching the provided schema.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    days: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          city: { type: "string" },
          area: { type: "string" },
          maxLeg: { type: "string" },
          hotel: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: "string" },
              rating: { type: "string" },
              walk: { type: "string" },
              price: { type: "string" },
            },
            required: ["name", "rating", "walk", "price"],
          },
          tickets: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                mode: { type: "string" },
                from: { type: "string" },
                to: { type: "string" },
                depart: { type: "string" },
                arrive: { type: "string" },
                dur: { type: "string" },
                price: { type: "string" },
                flag: { type: "string" },
              },
              required: ["mode", "from", "to", "depart", "arrive", "dur", "price", "flag"],
            },
          },
          stops: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                time: { type: "string" },
                title: { type: "string" },
                place: { type: "string" },
                directions: { type: "string" },
              },
              required: ["time", "title", "place", "directions"],
            },
          },
          food: { type: "string" },
        },
        required: ["city", "area", "maxLeg", "hotel", "tickets", "stops", "food"],
      },
    },
  },
  required: ["days"],
};

function iconFor(mode: string): string {
  const m = mode.toLowerCase();
  if (/shinkansen|bullet/.test(m)) return "🚅";
  if (/bus|coach/.test(m)) return "🚌";
  if (/ferry|boat|cruise|ship/.test(m)) return "⛴️";
  if (/flight|air|plane/.test(m)) return "✈️";
  if (/metro|subway/.test(m)) return "🚇";
  if (/tram|cable|ropeway|funicular/.test(m)) return "🚞";
  if (/train|jr|line|express|rail/.test(m)) return "🚆";
  return "🚉";
}

function normalize(rawDays: unknown): Day[] {
  const arr = Array.isArray(rawDays) ? rawDays : [];
  return arr.map((d, i) => {
    const day = d as Day & { tickets: Ticket[] };
    return {
      ...day,
      n: i + 1,
      tickets: (day.tickets ?? []).map((t) => ({
        ...t,
        icon: iconFor(t.mode ?? ""),
        flag: t.flag || undefined,
      })),
    };
  });
}

// One Claude call per UNIQUE brief, cached for 7 days. Identical briefs (the six
// templates, retries, popular trips) reuse the cached itinerary and cost zero
// credits. Throws on failure so canned fallbacks are never cached.
const generateItinerary = unstable_cache(
  async (brief: string): Promise<Day[]> => {
    const trip = parseTrip(brief);
    const client = new Anthropic();
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "disabled" },
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: `Plan a trip in ${trip.destination} for ${trip.party} traveller(s), budget ${trip.budget}, interests: ${trip.interests}.\n\nThe "days" array must have exactly ${trip.days} day objects (day 1 through day ${trip.days}). Do not stop early.\n\nTraveller's words: "${trip.raw}"` }],
    } as Anthropic.MessageCreateParamsNonStreaming);
    const textBlock = message.content.find((b) => b.type === "text");
    const text = textBlock && "text" in textBlock ? textBlock.text : "";
    let days = normalize(JSON.parse(text).days);
    if (!days.length) throw new Error("empty itinerary");
    if (days.length !== trip.days) {
      const base = days;
      days = Array.from({ length: trip.days }, (_, i) => ({ ...base[i % base.length], n: i + 1 }));
    }
    return days;
  },
  ["itinerary-v2"],
  { revalidate: 60 * 60 * 24 * 7 }
);

export async function POST(req: Request) {
  let input = "";
  try {
    input = ((await req.json())?.input ?? "").toString();
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  const trimmed = input.trim();
  if (trimmed.length < 8) return Response.json({ error: "input too short" }, { status: 400 });
  if (trimmed.length > 2000) return Response.json({ error: "input too long" }, { status: 400 });
  const trip = parseTrip(input);

  // Never spend credits when: dev mode forces canned, there's no key, or the
  // caller is over the rate limit.
  if (process.env.TRIPCRAFT_CANNED === "1" || !process.env.ANTHROPIC_API_KEY) {
    return Response.json({ days: generate(trip), source: "canned" });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (await rateLimited(`gen:${ip}`, 20, 3600)) {
    log.warn("generate_rate_limited", { ip });
    return Response.json({ days: generate(trip), source: "rate_limited" });
  }

  try {
    const days = await generateItinerary(input);
    log.info("generate_ok", { destination: trip.destination, days: days.length });
    return Response.json({ days, source: "claude" });
  } catch (e) {
    captureError("generate_failed", e, { destination: trip.destination });
    return Response.json({ days: generate(trip), source: "fallback", error: String(e) });
  }
}
