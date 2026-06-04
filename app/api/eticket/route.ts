import { buildTicketPdf, type TicketPayload } from "@/lib/eticket";

// Returns the same e-ticket/voucher PDF that is emailed, so tickets are
// downloadable straight from the app (Tickets view / My Trips).
export async function POST(req: Request) {
  let body: TicketPayload;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  if (!body.flight && !body.hotel) return Response.json({ error: "nothing booked" }, { status: 400 });

  const pdf = await buildTicketPdf(body);
  const ref = body.flight?.ref || body.hotel?.id || "tickets";
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="tripcraft-eticket-${ref}.pdf"`,
    },
  });
}
