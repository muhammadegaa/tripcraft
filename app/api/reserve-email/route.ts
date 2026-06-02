import { Resend } from "resend";
import type { Day } from "@/lib/itinerary";
import { flightsToDestUrl, hotelUrl, plusDays } from "@/lib/booking-links";
import { captureError } from "@/lib/log";

// Emails the traveler their full plan plus real booking links. Server-side
// (secret key). Graceful: with no RESEND_API_KEY it no-ops so the app never
// breaks; with a key it actually delivers. To email arbitrary recipients you
// need a verified domain in Resend and a matching RESEND_FROM (otherwise Resend
// only delivers to your own account email).
const FROM = process.env.RESEND_FROM || "Tripcraft <onboarding@resend.dev>";
// Always-available Resend sender. Works with no verified domain but only
// delivers to your own Resend account email. We fall back to it when the
// custom domain in RESEND_FROM is not yet verified, so plans still arrive.
const FALLBACK_FROM = "Tripcraft <onboarding@resend.dev>";

function errMsg(e: unknown): string {
  const o = e as { message?: string };
  return o?.message ?? (typeof e === "string" ? e : JSON.stringify(e));
}

function esc(s: string) {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] || c));
}

function btn(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:#e8643c;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 16px;border-radius:10px">${label}</a>`;
}

function buildHtml(destination: string, days: Day[], party: number): string {
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

  // Unique hotels from the plan, each with a real booking link.
  const checkin = plusDays(30);
  const checkout = plusDays(30 + Math.max(1, days.length));
  const hotels = Array.from(new Map(days.map((d) => [d.hotel.name, { name: d.hotel.name, city: d.city }])).values());
  const hotelRows = hotels
    .map((h) => `<tr><td style="padding:6px 0;font-size:14px">${esc(h.name)} <span style="color:#999">· ${esc(h.city)}</span></td>
      <td style="padding:6px 0;text-align:right"><a href="${hotelUrl(`${h.name} ${h.city}`, checkin, checkout, party)}" style="color:#e8643c;font-weight:600;text-decoration:none;font-size:14px">Book ↗</a></td></tr>`)
    .join("");

  return `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#15110c">
    <h2 style="margin:0 0 4px">Your ${esc(destination)} plan</h2>
    <p style="color:#666;margin:0 0 20px">Hotels by the station, no train over 2 hours, on your budget. Book each piece below in a couple of taps.</p>

    <div style="border:1px solid #eee;border-radius:14px;padding:16px;margin:0 0 22px">
      <div style="font-weight:600;margin:0 0 8px">✈️ Flights</div>
      <p style="color:#666;font-size:13px;margin:0 0 12px">Search live fares to ${esc(destination)} for ${party} traveller${party > 1 ? "s" : ""}.</p>
      ${btn(flightsToDestUrl(destination, party), "Search flights ↗")}
      <div style="font-weight:600;margin:18px 0 8px">🏨 Hotels in your plan</div>
      <table style="width:100%;border-collapse:collapse">${hotelRows}</table>
    </div>

    <div style="font-weight:600;margin:0 0 10px">Your day by day</div>
    ${rows}

    <p style="color:#999;font-size:12px;margin-top:24px">Prices in the plan are estimates. Booking and payment happen on Skyscanner and Booking.com. Reply any time and a real person will read it.</p>
  </div>`;
}

export async function POST(req: Request) {
  const key = process.env.RESEND_API_KEY;
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
  if (!key) return Response.json({ sent: false, reason: "no_key" });

  const resend = new Resend(key);
  const html = buildHtml(destination, days, party);
  const subject = `Your ${destination} plan, ready to book`;

  async function send(from: string) {
    return resend.emails.send({ from, to: email, subject, html });
  }

  try {
    let { error } = await send(FROM);
    // If the custom domain isn't verified yet, retry from the always-available
    // sender so the traveler still gets their plan.
    if (error && FROM !== FALLBACK_FROM && /not verified|domain/i.test(errMsg(error))) {
      captureError("reserve_email_domain_unverified", error, { from: FROM });
      ({ error } = await send(FALLBACK_FROM));
    }
    if (error) {
      captureError("reserve_email_failed", error, { destination });
      return Response.json({ sent: false, reason: errMsg(error) });
    }
    return Response.json({ sent: true });
  } catch (e) {
    captureError("reserve_email_error", e, { destination });
    return Response.json({ sent: false, reason: errMsg(e) });
  }
}
