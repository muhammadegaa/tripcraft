import { Resend } from "resend";
import { captureError } from "@/lib/log";

// Booking confirmation email: booking numbers, a receipt, and the tickets. Same
// resilient sender as the plan email (falls back to onboarding@resend.dev when
// the custom domain isn't verified).
const FROM = process.env.RESEND_FROM || "Tripcraft <onboarding@resend.dev>";
const FALLBACK_FROM = "Tripcraft <onboarding@resend.dev>";

function errMsg(e: unknown): string {
  const o = e as { message?: string };
  return o?.message ?? (typeof e === "string" ? e : JSON.stringify(e));
}
function esc(s: string) {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] || c));
}

type Flight = { ref: string; airline: string; route: string; times: string } | null;
type Hotel = { id: string; name: string; nights: number } | null;

function buildHtml(destination: string, flight: Flight, hotel: Hotel, flightDisplay: string | null, hotelDisplay: string | null, total: string): string {
  const row = (label: string, value: string) => `<tr><td style="padding:6px 0;color:#666;font-size:14px">${esc(label)}</td><td style="padding:6px 0;text-align:right;font-size:14px;font-weight:600">${esc(value)}</td></tr>`;
  const block = (emoji: string, title: string, sub: string, refLabel: string, ref: string, price: string | null) => `
    <div style="border:1px solid #eee;border-radius:14px;padding:16px;margin:0 0 14px">
      <div style="font-weight:700;font-size:15px">${emoji} ${esc(title)}</div>
      <div style="color:#666;font-size:13px;margin:2px 0 10px">${esc(sub)}</div>
      <table style="width:100%;border-collapse:collapse">
        ${row(refLabel, ref)}
        ${price ? row("Price", price) : ""}
      </table>
    </div>`;

  return `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#15110c">
    <h2 style="margin:0 0 4px">You are booked for ${esc(destination)} 🎉</h2>
    <p style="color:#666;margin:0 0 20px">Here is your confirmation. Keep the booking numbers handy.</p>
    ${flight ? block("✈️", flight.airline, `${flight.route} · ${flight.times}`, "Booking reference", flight.ref, flightDisplay) : ""}
    ${hotel ? block("🏨", hotel.name, `${hotel.nights} nights`, "Booking number", hotel.id, hotelDisplay) : ""}
    ${total ? `<div style="display:flex;justify-content:space-between;background:#15110c;color:#fff;border-radius:14px;padding:14px 18px;font-weight:600"><span>Total</span><span>${esc(total)}</span></div>` : ""}
    <p style="color:#999;font-size:12px;margin-top:22px">Test booking while our live payment licence is being switched on. The booking numbers above are real confirmations from our flight and hotel partners. Reply any time and a real person will read it.</p>
  </div>`;
}

export async function POST(req: Request) {
  const key = process.env.RESEND_API_KEY;
  let body: {
    email?: string; destination?: string;
    flight?: Flight; hotel?: Hotel; total?: string; flightDisplay?: string | null; hotelDisplay?: string | null;
  } = {};
  try { body = await req.json(); } catch { return Response.json({ sent: false, reason: "bad_request" }, { status: 400 }); }

  const email = (body.email || "").trim();
  const destination = body.destination || "your trip";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ sent: false, reason: "bad_email" }, { status: 400 });
  if (!body.flight && !body.hotel) return Response.json({ sent: false, reason: "nothing_booked" }, { status: 400 });
  if (!key) return Response.json({ sent: false, reason: "no_key" });

  const html = buildHtml(destination, body.flight ?? null, body.hotel ?? null, body.flightDisplay ?? null, body.hotelDisplay ?? null, body.total || "");
  const subject = `Your ${destination} booking is confirmed`;
  const resend = new Resend(key);
  const send = (from: string) => resend.emails.send({ from, to: email, subject, html });

  try {
    let { error } = await send(FROM);
    if (error && FROM !== FALLBACK_FROM && /not verified|domain/i.test(errMsg(error))) {
      captureError("booking_email_domain_unverified", error, { from: FROM });
      ({ error } = await send(FALLBACK_FROM));
    }
    if (error) {
      captureError("booking_email_failed", error, { destination });
      return Response.json({ sent: false, reason: errMsg(error) });
    }
    return Response.json({ sent: true });
  } catch (e) {
    captureError("booking_email_error", e, { destination });
    return Response.json({ sent: false, reason: errMsg(e) });
  }
}
