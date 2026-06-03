import type { Day } from "@/lib/itinerary";
import { sendEmail } from "@/lib/email";

// Emails the traveler their full plan plus a deep link into the in-app booking.
// Delivery goes through lib/email (Gmail SMTP -> Resend), so it works with no
// custom domain.

function esc(s: string) {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] || c));
}

function btn(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:#e8643c;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 16px;border-radius:10px">${label}</a>`;
}

function buildHtml(destination: string, days: Day[], party: number, appUrl: string): string {
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

  const bookUrl = `${appUrl}/app?book=1&dest=${encodeURIComponent(destination)}&days=${days.length}&party=${party}`;
  const bookBlock = appUrl
    ? `<div style="border:1px solid #eee;border-radius:14px;padding:16px;margin:0 0 22px;text-align:center">
        <div style="font-weight:600;margin:0 0 6px">Book it in the app</div>
        <p style="color:#666;font-size:13px;margin:0 0 14px">Live flights and hotels for ${party} traveller${party > 1 ? "s" : ""}, booked inside Tripcraft. No hopping between tabs.</p>
        ${btn(bookUrl, "Open booking →")}
      </div>`
    : "";

  return `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#15110c">
    <h2 style="margin:0 0 4px">Your ${esc(destination)} plan</h2>
    <p style="color:#666;margin:0 0 20px">Hotels by the station, no train over 2 hours, on your budget.</p>

    ${bookBlock}

    <div style="font-weight:600;margin:0 0 10px">Your day by day</div>
    ${rows}

    <p style="color:#999;font-size:12px;margin-top:24px">Prices in the plan are estimates. Reply any time and a real person will read it.</p>
  </div>`;
}

export async function POST(req: Request) {
  let body: { email?: string; destination?: string; days?: Day[]; party?: number } = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ sent: false, reason: "bad_request" }, { status: 400 });
  }
  const email = (body.email || "").trim();
  const destination = body.destination || "trip";
  const days = body.days || [];
  const party = Math.max(1, Number(body.party) || 1);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ sent: false, reason: "bad_email" }, { status: 400 });
  }
  if (!days.length) return Response.json({ sent: false, reason: "no_plan" }, { status: 400 });

  const host = req.headers.get("host");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || (host ? `https://${host}` : "");
  const html = buildHtml(destination, days, party, appUrl);
  const result = await sendEmail({ to: email, subject: `Your ${destination} plan, ready to book`, html });
  return Response.json(result);
}
