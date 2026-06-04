import { sendEmail } from "@/lib/email";
import { buildTicketPdf } from "@/lib/eticket";

// Booking confirmation email: a boarding-pass-style flight e-ticket and a hotel
// voucher with the real booking references, plus the Stripe receipt link — and
// the actual e-ticket/voucher document attached as a PDF, the way every OTA
// issues its own documents in production. Uses table-based, inline-styled HTML
// for broad email-client support. Delivery goes through lib/email
// (Gmail SMTP -> Resend), so it works with no custom domain.

function esc(s: unknown) {
  return String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] || c));
}
function fmtDate(d?: string | null) {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return d || "";
  const [y, m, day] = d.split("-").map(Number);
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${day} ${MON[m - 1]} ${y}`;
}

type Flight = { ref: string; airline: string; from: string; to: string; depart: string; arrive: string; date?: string | null; returnDate?: string | null } | null;
type Hotel = { id: string; name: string; checkin?: string; checkout?: string; nights: number } | null;

function boardingPass(f: NonNullable<Flight>, passengers: string[], price: string | null): string {
  return `
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border:1px solid #ececec;border-radius:16px;overflow:hidden;margin:0 0 16px">
    <tr><td style="background:#15110c;color:#fff;padding:12px 18px;font-weight:700;font-size:15px">✈ ${esc(f.airline)}<span style="float:right;font-weight:500;font-size:11px;letter-spacing:.08em;opacity:.65;text-transform:uppercase">${f.returnDate ? "Round trip" : "One way"} · E-ticket</span></td></tr>
    <tr><td style="padding:20px 22px 16px">
      <table width="100%"><tr>
        <td style="vertical-align:top"><div style="font-size:30px;font-weight:800;line-height:1">${esc(f.from)}</div><div style="color:#888;font-size:12px;margin-top:4px">Depart ${esc(f.depart)}</div></td>
        <td style="text-align:center;color:#e8643c;font-size:18px;vertical-align:middle">— ✈ —</td>
        <td style="vertical-align:top;text-align:right"><div style="font-size:30px;font-weight:800;line-height:1">${esc(f.to)}</div><div style="color:#888;font-size:12px;margin-top:4px">Arrive ${esc(f.arrive)}</div></td>
      </tr></table>
    </td></tr>
    <tr><td style="border-top:1px dashed #d8d8d8;padding:0"></td></tr>
    <tr><td style="padding:14px 22px">
      <table width="100%" style="font-size:13px">
        <tr><td style="color:#999;text-transform:uppercase;letter-spacing:.06em;font-size:11px;padding-bottom:2px">Passenger${passengers.length > 1 ? "s" : ""}</td><td style="text-align:right;color:#999;text-transform:uppercase;letter-spacing:.06em;font-size:11px;padding-bottom:2px">Date</td></tr>
        <tr><td style="font-weight:600">${esc(passengers.join(", ") || "Guest")}</td><td style="text-align:right;font-weight:600">${esc(fmtDate(f.date))}${f.returnDate ? " &rarr; " + esc(fmtDate(f.returnDate)) : ""}</td></tr>
        <tr><td colspan="2" style="padding-top:10px"></td></tr>
        <tr><td style="color:#999;text-transform:uppercase;letter-spacing:.06em;font-size:11px">Booking reference</td><td style="text-align:right;color:#999;text-transform:uppercase;letter-spacing:.06em;font-size:11px">Fare</td></tr>
        <tr><td style="font-family:monospace;font-weight:700;font-size:17px;letter-spacing:.12em;color:#e8643c">${esc(f.ref)}</td><td style="text-align:right;font-weight:700">${esc(price || "")}</td></tr>
      </table>
    </td></tr>
  </table>`;
}

function voucher(h: NonNullable<Hotel>, guest: string, price: string | null): string {
  return `
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border:1px solid #ececec;border-radius:16px;overflow:hidden;margin:0 0 16px">
    <tr><td style="background:#15110c;color:#fff;padding:12px 18px;font-weight:700;font-size:15px">🏨 Hotel voucher<span style="float:right;font-weight:500;font-size:11px;letter-spacing:.08em;opacity:.65;text-transform:uppercase">Confirmed</span></td></tr>
    <tr><td style="padding:18px 22px">
      <div style="font-size:18px;font-weight:700">${esc(h.name)}</div>
      <table width="100%" style="margin-top:12px;font-size:13px">
        <tr>
          <td style="color:#999;text-transform:uppercase;letter-spacing:.06em;font-size:11px">Check in</td>
          <td style="color:#999;text-transform:uppercase;letter-spacing:.06em;font-size:11px">Check out</td>
          <td style="color:#999;text-transform:uppercase;letter-spacing:.06em;font-size:11px;text-align:right">Nights</td>
        </tr>
        <tr><td style="font-weight:600">${esc(fmtDate(h.checkin))}</td><td style="font-weight:600">${esc(fmtDate(h.checkout))}</td><td style="font-weight:600;text-align:right">${esc(h.nights)}</td></tr>
        <tr><td colspan="3" style="border-top:1px solid #eee;padding-top:10px;margin-top:6px"></td></tr>
        <tr><td colspan="2" style="color:#999;text-transform:uppercase;letter-spacing:.06em;font-size:11px">Guest</td><td style="text-align:right;color:#999;text-transform:uppercase;letter-spacing:.06em;font-size:11px">Booking number</td></tr>
        <tr><td colspan="2" style="font-weight:600">${esc(guest)}</td><td style="text-align:right;font-family:monospace;font-weight:700;font-size:15px;letter-spacing:.1em;color:#e8643c">${esc(h.id)}</td></tr>
        ${price ? `<tr><td colspan="2" style="padding-top:8px;color:#999;font-size:12px">Stay total</td><td style="text-align:right;padding-top:8px;font-weight:700">${esc(price)}</td></tr>` : ""}
      </table>
    </td></tr>
  </table>`;
}

function buildHtml(p: { destination: string; passengers: string[]; flight: Flight; hotel: Hotel; flightDisplay: string | null; hotelDisplay: string | null; total: string; receiptUrl: string | null }): string {
  const guest = p.passengers[0] || "Guest";
  return `<div style="background:#faf7f2;padding:24px 0;font-family:-apple-system,system-ui,Segoe UI,Roboto,sans-serif;color:#15110c">
    <div style="max-width:560px;margin:0 auto;padding:0 20px">
      <div style="text-align:center;margin-bottom:20px">
        <div style="display:inline-block;background:#1f9d6b;color:#fff;width:34px;height:34px;border-radius:50%;line-height:34px;font-size:18px">&#10003;</div>
        <div style="margin-top:8px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#888">Test booking · demo of the live flow</div>
        <h1 style="margin:8px 0 4px;font-size:24px">You are going to ${esc(p.destination)}</h1>
        <p style="color:#777;margin:0;font-size:14px">Your e-ticket is attached as a PDF. Keep the booking references handy.</p>
      </div>
      ${p.flight ? boardingPass(p.flight, p.passengers, p.flightDisplay) : ""}
      ${p.hotel ? voucher(p.hotel, guest, p.hotelDisplay) : ""}
      ${p.total ? `<table width="100%" style="background:#15110c;color:#fff;border-radius:14px"><tr><td style="padding:15px 20px;font-weight:600">Total paid</td><td style="padding:15px 20px;text-align:right;font-weight:700;font-size:18px">${esc(p.total)}</td></tr></table>` : ""}
      ${p.receiptUrl ? `<p style="text-align:center;margin:18px 0 0"><a href="${esc(p.receiptUrl)}" style="display:inline-block;background:#fff;border:1px solid #ddd;border-radius:10px;padding:11px 18px;color:#15110c;text-decoration:none;font-weight:600;font-size:14px">View your Stripe receipt &#8599;</a></p>` : ""}
      <p style="color:#999;font-size:12px;margin-top:24px;text-align:center;line-height:1.6">Payment receipt issued by Stripe. Booking references are real confirmations from our flight and hotel partners. Live ticketing switches on with our travel licence.</p>
    </div>
  </div>`;
}

export async function POST(req: Request) {
  let body: {
    email?: string; destination?: string; receiptUrl?: string | null; passengers?: string[];
    flight?: Flight; hotel?: Hotel; total?: string; flightDisplay?: string | null; hotelDisplay?: string | null;
  } = {};
  try { body = await req.json(); } catch { return Response.json({ sent: false, reason: "bad_request" }, { status: 400 }); }

  const email = (body.email || "").trim();
  const destination = body.destination || "your trip";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ sent: false, reason: "bad_email" }, { status: 400 });
  if (!body.flight && !body.hotel) return Response.json({ sent: false, reason: "nothing_booked" }, { status: 400 });

  const html = buildHtml({
    destination, passengers: body.passengers ?? [], flight: body.flight ?? null, hotel: body.hotel ?? null,
    flightDisplay: body.flightDisplay ?? null, hotelDisplay: body.hotelDisplay ?? null, total: body.total || "", receiptUrl: body.receiptUrl ?? null,
  });
  const pdf = await buildTicketPdf({
    destination, passengers: body.passengers ?? [], flight: body.flight ?? null, hotel: body.hotel ?? null,
    flightDisplay: body.flightDisplay ?? null, hotelDisplay: body.hotelDisplay ?? null, total: body.total ?? null,
  });
  const ref = body.flight?.ref || body.hotel?.id || "tickets";
  const result = await sendEmail({
    to: email, subject: `Your ${destination} tickets are confirmed`, html,
    attachments: [{ filename: `tripcraft-eticket-${ref}.pdf`, content: Buffer.from(pdf) }],
  });
  return Response.json(result);
}
