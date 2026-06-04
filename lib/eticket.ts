import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";

// Tripcraft issues its own e-ticket and voucher documents, exactly like every
// OTA does in production: Duffel/LiteAPI return booking DATA (PNR, references,
// fares) — the customer-facing document is always rendered by the platform.
// This renders that data into the PDF that is emailed and downloadable in-app.

const INK = rgb(0.082, 0.067, 0.047); // #15110c
const ACCENT = rgb(0.91, 0.392, 0.235); // #e8643c
const CREAM = rgb(0.98, 0.969, 0.949); // #faf7f2
const GRAY = rgb(0.55, 0.52, 0.49);
const GREEN = rgb(0.122, 0.616, 0.42); // #1f9d6b
const WHITE = rgb(1, 1, 1);
const LINE = rgb(0.88, 0.86, 0.83);

const W = 595.28; // A4
const H = 841.89;
const M = 52; // page margin

export type TicketFlight = { ref: string; airline: string; from: string; to: string; depart: string; arrive: string; date?: string | null; returnDate?: string | null; cabin?: string | null };
export type TicketHotel = { id: string; name: string; checkin?: string | null; checkout?: string | null; nights: number };
export type TicketPayload = {
  destination: string;
  passengers: string[];
  flight?: TicketFlight | null;
  hotel?: TicketHotel | null;
  flightDisplay?: string | null;
  hotelDisplay?: string | null;
  total?: string | null;
};

// Helvetica is WinAnsi-only; downgrade smart punctuation, strip the rest
// (hotel names regularly carry accents and dashes).
function txt(s: unknown): string {
  return String(s ?? "")
    .normalize("NFKD")
    .replace(/[–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/[̀-ͯ]/g, "").replace(/[^\x20-\xFF]/g, "").replace(/\s{2,}/g, " ").trim();
}

function fmtDate(d?: string | null): string {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return d ? txt(d) : "";
  const [y, m, day] = d.split("-").map(Number);
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${day} ${MON[m - 1]} ${y}`;
}

type Fonts = { reg: PDFFont; bold: PDFFont; mono: PDFFont };

function pageChrome(page: PDFPage, f: Fonts, docLabel: string) {
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: CREAM });
  page.drawRectangle({ x: 0, y: H - 72, width: W, height: 72, color: INK });
  page.drawText("TRIPCRAFT", { x: M, y: H - 46, size: 15, font: f.bold, color: WHITE });
  const label = docLabel.toUpperCase();
  const lw = f.reg.widthOfTextAtSize(label, 8.5);
  page.drawText(label, { x: W - M - lw, y: H - 44, size: 8.5, font: f.reg, color: rgb(0.72, 0.7, 0.67) });
}

function pageFooter(page: PDFPage, f: Fonts, issued: string) {
  const badge = "TEST BOOKING - DEMO OF THE LIVE FLOW";
  const bw = f.bold.widthOfTextAtSize(badge, 7.5);
  page.drawRectangle({ x: (W - bw - 20) / 2, y: 96, width: bw + 20, height: 18, borderColor: LINE, borderWidth: 1, color: WHITE });
  page.drawText(badge, { x: (W - bw) / 2, y: 102, size: 7.5, font: f.bold, color: GRAY });
  const note = `Issued by Tripcraft on ${issued}. Booking references come from our flight and hotel partners. Keep this document for check-in.`;
  const nw = f.reg.widthOfTextAtSize(note, 7.5);
  page.drawText(note, { x: (W - nw) / 2, y: 76, size: 7.5, font: f.reg, color: GRAY });
}

function label(page: PDFPage, f: Fonts, text: string, x: number, y: number, alignRightAt?: number) {
  const t = text.toUpperCase();
  const x2 = alignRightAt != null ? alignRightAt - f.reg.widthOfTextAtSize(t, 7.5) : x;
  page.drawText(t, { x: x2, y, size: 7.5, font: f.reg, color: GRAY });
}

function value(page: PDFPage, f: Fonts, text: string, x: number, y: number, size = 11, alignRightAt?: number, font?: PDFFont, color = INK) {
  const fnt = font ?? f.bold;
  const x2 = alignRightAt != null ? alignRightAt - fnt.widthOfTextAtSize(text, size) : x;
  page.drawText(text, { x: x2, y, size, font: fnt, color });
}

function dashedLine(page: PDFPage, x1: number, x2: number, y: number) {
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 1, color: LINE, dashArray: [4, 4] });
}

function confirmedHeading(page: PDFPage, f: Fonts, destination: string, ref: string, refLabel: string) {
  let y = H - 120;
  page.drawText("CONFIRMED", { x: M, y, size: 9, font: f.bold, color: GREEN });
  y -= 28;
  page.drawText(`Trip to ${txt(destination)}`, { x: M, y, size: 22, font: f.bold, color: INK });
  label(page, f, refLabel, 0, y + 20, W - M);
  value(page, f, txt(ref), 0, y, 21, W - M, f.mono, ACCENT);
  return y - 44;
}

export function flightPage(doc: PDFDocument, f: Fonts, p: TicketPayload, issued: string) {
  const fl = p.flight!;
  const page = doc.addPage([W, H]);
  pageChrome(page, f, "E-ticket · Itinerary receipt");
  let y = confirmedHeading(page, f, p.destination, fl.ref, "Booking reference (PNR)");

  // ticket card
  const cardTop = y;
  const cardH = 240;
  page.drawRectangle({ x: M, y: cardTop - cardH, width: W - 2 * M, height: cardH, color: WHITE, borderColor: LINE, borderWidth: 1 });
  const cx = M + 26;
  const cr = W - M - 26;
  y = cardTop - 34;
  page.drawText(txt(fl.airline), { x: cx, y, size: 13, font: f.bold, color: INK });
  const trip = `${fl.returnDate ? "ROUND TRIP" : "ONE WAY"} · ${txt(fl.cabin || "Economy").toUpperCase()}`;
  value(page, f, trip, 0, y + 1, 8, cr, f.reg, GRAY);

  // route: big codes + connecting line
  y -= 58;
  page.drawText(txt(fl.from), { x: cx, y, size: 38, font: f.bold, color: INK });
  value(page, f, txt(fl.to), 0, y, 38, cr);
  const fromW = f.bold.widthOfTextAtSize(txt(fl.from), 38);
  const toW = f.bold.widthOfTextAtSize(txt(fl.to), 38);
  const lineY = y + 13;
  page.drawLine({ start: { x: cx + fromW + 16, y: lineY }, end: { x: cr - toW - 26, y: lineY }, thickness: 1, color: ACCENT, opacity: 0.45 });
  // arrowhead
  page.drawLine({ start: { x: cr - toW - 26, y: lineY }, end: { x: cr - toW - 33, y: lineY + 3.5 }, thickness: 1, color: ACCENT });
  page.drawLine({ start: { x: cr - toW - 26, y: lineY }, end: { x: cr - toW - 33, y: lineY - 3.5 }, thickness: 1, color: ACCENT });
  y -= 16;
  page.drawText(`Depart ${txt(fl.depart)}`, { x: cx, y, size: 9, font: f.reg, color: GRAY });
  value(page, f, `Arrive ${txt(fl.arrive)}`, 0, y, 9, cr, f.reg, GRAY);

  y -= 26;
  dashedLine(page, M + 14, W - M - 14, y);

  y -= 24;
  label(page, f, p.passengers.length > 1 ? "Passengers" : "Passenger", cx, y);
  label(page, f, "Date", 0, y, cr);
  y -= 16;
  page.drawText(txt(p.passengers.join(", ") || "Guest").slice(0, 70), { x: cx, y, size: 11, font: f.bold, color: INK });
  const dates = fl.returnDate ? `${fmtDate(fl.date)} - ${fmtDate(fl.returnDate)}` : fmtDate(fl.date);
  value(page, f, dates, 0, y, 11, cr);

  y -= 26;
  label(page, f, "Booking reference", cx, y);
  label(page, f, "Fare", 0, y, cr);
  y -= 18;
  page.drawText(txt(fl.ref), { x: cx, y, size: 14, font: f.mono, color: ACCENT });
  value(page, f, txt(p.flightDisplay || ""), 0, y, 12, cr);

  pageFooter(page, f, issued);
}

export function hotelPage(doc: PDFDocument, f: Fonts, p: TicketPayload, issued: string) {
  const h = p.hotel!;
  const page = doc.addPage([W, H]);
  pageChrome(page, f, "Hotel voucher");
  let y = confirmedHeading(page, f, p.destination, h.id, "Booking number");

  const cardTop = y;
  const cardH = 210;
  page.drawRectangle({ x: M, y: cardTop - cardH, width: W - 2 * M, height: cardH, color: WHITE, borderColor: LINE, borderWidth: 1 });
  const cx = M + 26;
  const cr = W - M - 26;
  y = cardTop - 38;
  page.drawText(txt(h.name).slice(0, 58), { x: cx, y, size: 16, font: f.bold, color: INK });

  y -= 36;
  label(page, f, "Check in", cx, y);
  label(page, f, "Check out", cx + 160, y);
  label(page, f, "Nights", 0, y, cr);
  y -= 16;
  page.drawText(fmtDate(h.checkin), { x: cx, y, size: 11, font: f.bold, color: INK });
  page.drawText(fmtDate(h.checkout), { x: cx + 160, y, size: 11, font: f.bold, color: INK });
  value(page, f, String(h.nights), 0, y, 11, cr);

  y -= 26;
  dashedLine(page, M + 14, W - M - 14, y);

  y -= 24;
  label(page, f, "Guest", cx, y);
  label(page, f, "Booking number", 0, y, cr);
  y -= 16;
  page.drawText(txt(p.passengers[0] || "Guest"), { x: cx, y, size: 11, font: f.bold, color: INK });
  value(page, f, txt(h.id), 0, y, 13, cr, f.mono, ACCENT);

  if (p.hotelDisplay) {
    y -= 26;
    label(page, f, "Stay total", cx, y + 1);
    value(page, f, txt(p.hotelDisplay), 0, y, 12, cr);
  }

  pageFooter(page, f, issued);
}

export async function buildTicketPdf(p: TicketPayload): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Tripcraft tickets - ${txt(p.destination)}`);
  doc.setAuthor("Tripcraft");
  const f: Fonts = {
    reg: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    mono: await doc.embedFont(StandardFonts.CourierBold),
  };
  const issued = fmtDate(new Date().toISOString().slice(0, 10));
  if (p.flight) flightPage(doc, f, p, issued);
  if (p.hotel) hotelPage(doc, f, p, issued);
  return doc.save();
}
