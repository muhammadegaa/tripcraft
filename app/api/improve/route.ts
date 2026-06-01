import Anthropic from "@anthropic-ai/sdk";

// Turns a rough trip idea into a clear, plannable brief. Fast (Haiku), tiny
// output. Falls back to a light heuristic when no key is set.
const MODEL = "claude-haiku-4-5";

const SYSTEM = `You help a traveler turn a rough idea into a clear brief for a trip-planning app.
Rewrite their input into ONE concise first-person brief (2-3 sentences). Rules:
- Keep their stated intent and every specific they gave (destination, dates, people, budget, interests).
- Fill ONLY reasonable gaps to make it plannable: trip length, number of people, an approximate budget, 1-2 interests.
- If you add a budget, use Indonesian rupiah (e.g. "around IDR 40M"). Keep any currency the user already gave.
- Always end with the app's two signature constraints, worded as: hotels within a short walk of a train/transit station, and no transit leg over 2 hours. Use exactly "2 hours" — do not change the number.
- Do NOT invent named hotels, exact addresses, or specific dates the user didn't imply.
- Sound like a real person, not AI. Never use em dashes (—); use commas or periods. No filler.
- Output ONLY the rewritten brief. No preamble, no quotes, no bullet points.`;

function heuristic(input: string): string {
  let s = input.trim().replace(/\s+/g, " ");
  if (!/station|stasiun|near.*train/i.test(s)) s += ", hotels within walking distance of a train station";
  if (!/2 ?hours?|2 ?jam|transit/i.test(s)) s += ", and no transit leg over 2 hours";
  return s;
}

export async function POST(req: Request) {
  let input = "";
  try {
    input = ((await req.json())?.input ?? "").toString();
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  if (input.trim().length < 3) return Response.json({ error: "too short" }, { status: 400 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ improved: heuristic(input), source: "heuristic" });
  }

  try {
    const client = new Anthropic();
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      thinking: { type: "disabled" },
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: input }],
    } as Anthropic.MessageCreateParamsNonStreaming);
    const block = message.content.find((b) => b.type === "text");
    const improved = block && "text" in block ? block.text.trim() : "";
    return Response.json({ improved: improved || heuristic(input), source: improved ? "claude" : "heuristic" });
  } catch (e) {
    return Response.json({ improved: heuristic(input), source: "fallback", error: String(e) });
  }
}
