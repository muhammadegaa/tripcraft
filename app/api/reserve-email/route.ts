import { Resend } from "resend";
import type { Day } from "@/lib/itinerary";

// Sends the reserved traveler their plan. Server-side (secret key). Graceful:
// with no RESEND_API_KEY it no-ops, so the app never breaks; with a key it
// actually delivers the itinerary. To email arbitrary recipients you need a
// verified domain in Resend and a matching RESEND_FROM.
const FROM = process.env.RESEND_FROM || "Tripcraft <onboarding@resend.dev>";

function esc(s: string) {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] || c));
}

function buildHtml(destination: string, days: Day[]): string {
  const rows = days
    .map((d) => {
      const stops = d.stops.map((s) => `<div style="margin:2px 0;color:#444"><span style="color:#999">${s.time}</span> ${esc(s.title)}</div>`).join("");
      return `<div style="margin:0 0 18px">
        <div style="font-weight:600">Day ${d.n} · ${esc(d.city)}, ${esc(d.area)}</div>
        <div style="font-size:13px;color:#666;margin:2px 0">🏨 ${esc(d.hotel.name)} · ${esc(d.hotel.walk)}</div>
        ${stops}
        <div style="font-size:13px;color:#e8643c;margin-top:4px">🍜 ${esc(d.food)}</div>
      </div>`;
    })
    .join("");
  return `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#15110c">
    <h2 style="margin:0 0 4px">Your ${esc(destination)} plan</h2>
    <p style="color:#666;margin:0 0 20px">Hotels by the station, no train over 2 hours, on your budget. We'll let you know the moment you can book it in-app.</p>
    ${rows}
    <p style="color:#999;font-size:12px;margin-top:24px">You're on the early-access list. Reply any time and a real person will read it.</p>
  </div>`;
}

export async function POST(req: Request) {
  const key = process.env.RESEND_API_KEY;
  let body: { email?: string; destination?: string; days?: Day[] } = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ sent: false, reason: "bad_request" }, { status: 400 });
  }
  const email = (body.email || "").trim();
  const destination = body.destination || "trip";
  const days = body.days || [];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ sent: false, reason: "bad_email" }, { status: 400 });
  }
  if (!key) return Response.json({ sent: false, reason: "no_key" });

  try {
    const resend = new Resend(key);
    const { error } = await resend.emails.send({
      from: FROM,
      to: email,
      subject: `Your ${destination} plan is reserved`,
      html: buildHtml(destination, days),
    });
    if (error) return Response.json({ sent: false, reason: String(error) });
    return Response.json({ sent: true });
  } catch (e) {
    return Response.json({ sent: false, reason: String(e) });
  }
}
