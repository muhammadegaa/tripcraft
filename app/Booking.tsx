"use client";

import { useEffect, useState } from "react";
import type { Trip, Day } from "@/lib/itinerary";
import { guessIata, plusDays } from "@/lib/booking-links";
import { useCurrency } from "@/app/currency";
import { useGallery } from "@/app/Lightbox";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { convert, formatMoney } from "@/lib/currency";
import { Plane, Hotel, ArrowRight, Check, ShieldCheck, User, Ticket, Images, Star, MapPin, Calendar } from "lucide-react";

const STRIPE_PK = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = STRIPE_PK ? loadStripe(STRIPE_PK) : null;

type Slice = { from: string; to: string; depart: string; arrive: string; dur: string; stops: number };
type Offer = { id: string; airline: string; airlineLogo: string | null; price: string; currency: string; out: Slice; ret: Slice | null };
type HotelOpt = { id: string; name: string; photo: string | null; stars: number | null; rating: number | null; reviews: number | null; price: number | null; currency: string; offerId: string | null };
type Traveler = { first: string; last: string };

export type FlightTicket = { ref: string; airline: string; from: string; to: string; depart: string; arrive: string; roundTrip: boolean; price: number; currency: string };
export type HotelVoucher = { id: string; name: string; checkin: string; checkout: string; nights: number; price: number; currency: string };
export type Confirmation = {
  destination: string;
  passengers: string[];
  flight: FlightTicket | null;
  hotel: HotelVoucher | null;
  totalDisplay: string;
  emailedTo: string | null;
  receiptUrl: string | null;
};

export default function Booking({ trip, days, onBack, onBooked }: {
  trip: Trip; days: Day[]; onBack: () => void;
  onBooked?: (b: { confirmation: Confirmation; status: string }) => void;
}) {
  const { show, currency, rates } = useCurrency();
  const { open: openGallery } = useGallery();

  const [origin, setOrigin] = useState("");
  const [originLabel, setOriginLabel] = useState("");
  const [destination, setDestination] = useState(guessIata(trip.destination));
  const [destLabel, setDestLabel] = useState(guessIata(trip.destination) ? `${trip.destination} (${guessIata(trip.destination)})` : "");
  const [departDate, setDepart] = useState(plusDays(30));
  const [returnDate, setReturn] = useState(plusDays(30 + Math.min(trip.days, 21)));
  const adults = Math.max(1, trip.party);

  const [flights, setFlights] = useState<{ loading: boolean; offers: Offer[]; passengers: { id: string }[]; source: string; error: string }>({ loading: false, offers: [], passengers: [], source: "", error: "" });
  const [hotels, setHotels] = useState<{ loading: boolean; list: HotelOpt[]; source: string; error: string }>({ loading: false, list: [], source: "", error: "" });
  const [pickedFlight, setPickedFlight] = useState<Offer | null>(null);
  const [pickedHotel, setPickedHotel] = useState<HotelOpt | null>(null);

  const [step, setStep] = useState<"flights" | "stay" | "review" | "payment" | "confirming" | "done">("flights");
  const [travelers, setTravelers] = useState<Traveler[]>(Array.from({ length: adults }, () => ({ first: "", last: "" })));
  const [contactEmail, setContactEmail] = useState("");
  const [bookingError, setBookingError] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [clientSecret, setClientSecret] = useState("");
  const [payIntentId, setPayIntentId] = useState("");
  const [payLoading, setPayLoading] = useState(false);

  useEffect(() => {
    if (destination) return;
    fetch(`/api/airports?q=${encodeURIComponent(trip.destination)}`).then((r) => r.json()).then((d) => {
      const a = d.results?.[0];
      if (a) { setDestination(a.iata); setDestLabel(`${a.city} (${a.iata})`); }
    }).catch(() => {});
  }, [destination, trip.destination]);

  const ready = /^[A-Z]{3}$/.test(origin) && /^[A-Z]{3}$/.test(destination);
  const nights = days.length || trip.days;
  function num(v: string | number) { return typeof v === "number" ? v : Number(String(v).replace(/[^0-9.]/g, "")); }

  async function searchFlights() {
    if (!ready) return;
    setFlights((s) => ({ ...s, loading: true, error: "" }));
    try {
      const r = await fetch("/api/flights/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ origin, destination, departDate, returnDate, adults }) });
      const d = await r.json();
      if (d.error) setFlights({ loading: false, offers: [], passengers: [], source: "", error: d.error });
      else setFlights({ loading: false, offers: d.offers ?? [], passengers: d.passengers ?? [], source: d.source ?? "", error: "" });
    } catch { setFlights({ loading: false, offers: [], passengers: [], source: "", error: "Could not load flights. Try again." }); }
  }
  async function searchHotels() {
    setHotels((s) => ({ ...s, loading: true, error: "" }));
    try {
      const r = await fetch("/api/hotels/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ destination: trip.destination, checkin: departDate, checkout: returnDate, adults }) });
      const d = await r.json();
      if (d.error) setHotels({ loading: false, list: [], source: "", error: d.error });
      else setHotels({ loading: false, list: d.hotels ?? [], source: d.source ?? "", error: "" });
    } catch { setHotels({ loading: false, list: [], source: "", error: "Could not load hotels. Try again." }); }
  }
  async function viewHotelPhotos(h: HotelOpt) {
    try {
      const d = await (await fetch(`/api/hotels/details?id=${encodeURIComponent(h.id)}`)).json();
      const imgs: string[] = d.images?.length ? d.images : h.photo ? [h.photo] : [];
      if (imgs.length) openGallery(imgs, h.name);
    } catch { if (h.photo) openGallery([h.photo], h.name); }
  }

  useEffect(() => { searchHotels(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useEffect(() => { if (ready) searchFlights(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [ready, departDate, returnDate]);

  function totalNum(): number {
    let t = 0;
    if (pickedFlight) { const v = convert(num(pickedFlight.price), pickedFlight.currency, currency, rates); if (v != null) t += v; }
    if (pickedHotel && pickedHotel.price != null) { const v = convert(pickedHotel.price, pickedHotel.currency, currency, rates); if (v != null) t += v; }
    return Math.round(t);
  }
  const totalStr = (() => { const t = totalNum(); return t > 0 ? formatMoney(t, currency) : ""; })();

  function validate(): boolean {
    setBookingError("");
    if (!pickedFlight && !pickedHotel) { setBookingError("Pick a flight or a hotel to continue."); return false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) { setBookingError("Enter a valid email for your tickets."); return false; }
    if (travelers.some((t) => !t.first.trim() || !t.last.trim())) { setBookingError("Enter every traveller's first and last name."); return false; }
    return true;
  }

  async function proceedToPayment() {
    if (!validate()) return;
    const amount = totalNum();
    if (!stripePromise || amount <= 0) { confirmBooking(); return; }
    setPayLoading(true);
    try {
      const d = await (await fetch("/api/payment-intent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ amount, currency, email: contactEmail, destination: trip.destination }) })).json();
      if (d.simulated || !d.clientSecret) { confirmBooking(); return; }
      setClientSecret(d.clientSecret); setPayIntentId(d.paymentIntentId || ""); setStep("payment");
    } catch { confirmBooking(); } finally { setPayLoading(false); }
  }

  async function confirmBooking(paymentIntentId?: string) {
    if (!validate()) { setStep("review"); return; }
    setStep("confirming");
    try {
      let flight: FlightTicket | null = null;
      let hotel: HotelVoucher | null = null;

      if (pickedFlight) {
        const pax = (flights.passengers.length ? flights.passengers : travelers.map((_, i) => ({ id: `p${i + 1}` })))
          .map((p, i) => ({ id: p.id, given_name: travelers[i]?.first || "Guest", family_name: travelers[i]?.last || "Traveller" }));
        const d = await (await fetch("/api/flights/order", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ offerId: pickedFlight.id, amount: pickedFlight.price, currency: pickedFlight.currency, email: contactEmail, passengers: pax }) })).json();
        if (!d.ok) throw new Error("Flight booking failed. Please try again.");
        flight = { ref: d.bookingReference, airline: pickedFlight.airline, from: pickedFlight.out.from, to: pickedFlight.out.to, depart: pickedFlight.out.depart, arrive: pickedFlight.out.arrive, roundTrip: !!pickedFlight.ret, price: num(pickedFlight.price), currency: pickedFlight.currency };
      }
      if (pickedHotel) {
        const d = await (await fetch("/api/hotels/book", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ offerId: pickedHotel.offerId, email: contactEmail, guests: travelers.map((t) => ({ firstName: t.first, lastName: t.last })) }) })).json();
        if (!d.ok) throw new Error("Hotel booking failed. Please try again.");
        hotel = { id: d.bookingId, name: pickedHotel.name, checkin: departDate, checkout: returnDate, nights, price: num(pickedHotel.price ?? 0), currency: pickedHotel.currency };
      }

      let totalDisplay = "";
      const parts: number[] = [];
      if (flight) { const v = convert(flight.price, flight.currency, currency, rates); if (v != null) parts.push(v); }
      if (hotel) { const v = convert(hotel.price, hotel.currency, currency, rates); if (v != null) parts.push(v); }
      if (parts.length) totalDisplay = formatMoney(parts.reduce((a, b) => a + b, 0), currency);

      let receiptUrl: string | null = null;
      if (paymentIntentId) {
        try { receiptUrl = (await (await fetch(`/api/payment-receipt?pi=${encodeURIComponent(paymentIntentId)}`)).json()).receiptUrl ?? null; } catch { /* best effort */ }
      }

      const conf: Confirmation = { destination: trip.destination, passengers: travelers.map((t) => `${t.first} ${t.last}`.trim()), flight, hotel, totalDisplay, emailedTo: null, receiptUrl };

      try {
        const ed = await (await fetch("/api/booking-email", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: contactEmail, destination: trip.destination, receiptUrl,
            flight: flight ? { airline: flight.airline, route: `${flight.from} → ${flight.to}${flight.roundTrip ? " → " + flight.from : ""}`, times: `${flight.depart}–${flight.arrive}`, ref: flight.ref } : null,
            hotel: hotel ? { name: hotel.name, nights: hotel.nights, id: hotel.id } : null,
            total: totalDisplay,
            flightDisplay: flight ? show(flight.price, flight.currency) : null,
            hotelDisplay: hotel ? show(hotel.price, hotel.currency) : null,
          }),
        })).json();
        if (ed.sent) conf.emailedTo = contactEmail;
      } catch { /* email best effort */ }

      setConfirmation(conf);
      onBooked?.({ confirmation: conf, status: "booked" });
      setStep("done");
    } catch (e) {
      setBookingError(e instanceof Error ? e.message : "Booking failed. Please try again.");
      setStep("review");
    }
  }

  if (step === "done" && confirmation) return <Tickets conf={confirmation} show={show} onBack={onBack} />;

  // ── stepper chrome ──
  const stepIndex = step === "flights" ? 0 : step === "stay" ? 1 : step === "review" ? 2 : 3;

  return (
    <section className="mx-auto max-w-2xl px-6 pb-40 pt-4 animate-fade">
      <div className="mb-5 flex items-center justify-between">
        <button onClick={onBack} className="text-sm text-[#15110c]/50 transition hover:text-[#e8643c]">← Back to plan</button>
        <span className="text-xs text-[#15110c]/40">Booking · {trip.destination}</span>
      </div>
      <Stepper current={stepIndex} />

      {/* STEP 1 — FLIGHTS */}
      {step === "flights" && (
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Choose your flights</h2>
          <p className="mt-1 text-sm text-[#15110c]/55">Live fares in {currency}. Pick one, or skip and book a hotel only.</p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <AirportInput label="Flying from" initial={originLabel} onSelect={(iata, d) => { setOrigin(iata); setOriginLabel(d); }} />
            <AirportInput label="Going to" initial={destLabel} onSelect={(iata, d) => { setDestination(iata); setDestLabel(d); }} />
            <Field label="Depart"><input type="date" value={departDate} onChange={(e) => setDepart(e.target.value)} className="ipt" /></Field>
            <Field label="Return"><input type="date" value={returnDate} onChange={(e) => setReturn(e.target.value)} className="ipt" /></Field>
          </div>
          <div className="mt-5">
            {!ready ? <Empty>Pick your departure airport to see live fares.</Empty>
              : flights.loading ? <Loading label="Finding flights" />
              : flights.error ? <ErrorBox msg={flights.error} onRetry={searchFlights} />
              : (
                <div className="space-y-2">
                  {flights.source === "demo" && <div className="text-xs text-[#15110c]/45">Sample fares. Connect a flight key for live inventory.</div>}
                  {flights.offers.map((o) => (
                    <button key={o.id} onClick={() => setPickedFlight((p) => p?.id === o.id ? null : o)} className={card(pickedFlight?.id === o.id)}>
                      {o.airlineLogo
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={o.airlineLogo} alt={o.airline} className="size-8 rounded object-contain" />
                        : <span className="grid size-8 place-items-center rounded bg-[#15110c]/5"><Plane strokeWidth={1.75} className="size-4 text-[#15110c]/60" /></span>}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{o.airline}</div>
                        <div className="text-xs text-[#15110c]/55">{o.out.depart}–{o.out.arrive} · {o.out.stops === 0 ? "nonstop" : `${o.out.stops} stop${o.out.stops > 1 ? "s" : ""}`}{o.ret ? " · round trip" : ""}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-semibold">{show(num(o.price), o.currency)}</div>
                        <div className="text-[10px] text-[#15110c]/45">{pickedFlight?.id === o.id ? "selected" : "select"}</div>
                      </div>
                    </button>
                  ))}
                  {!flights.offers.length && <Empty>No flights for these dates. Try different ones.</Empty>}
                </div>
              )}
          </div>
          <NextBar
            hint={pickedFlight ? `Flight selected · ${show(num(pickedFlight.price), pickedFlight.currency)}` : "No flight selected"}
            cta={pickedFlight ? "Continue to stay" : "Skip flights"}
            onNext={() => setStep("stay")}
          />
        </div>
      )}

      {/* STEP 2 — STAY */}
      {step === "stay" && (
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Choose your stay</h2>
          <p className="mt-1 text-sm text-[#15110c]/55">{nights} nights in {trip.destination}, live rates in {currency}.</p>
          <div className="mt-5">
            {hotels.loading ? <Loading label="Finding hotels" />
              : hotels.error ? <ErrorBox msg={hotels.error} onRetry={searchHotels} />
              : (
                <div className="space-y-2">
                  {hotels.source === "demo" && <div className="text-xs text-[#15110c]/45">Sample rates. Connect a hotel key for live inventory.</div>}
                  {hotels.list.map((h) => (
                    <div key={h.id} className={card(pickedHotel?.id === h.id)}>
                      <button type="button" onClick={() => viewHotelPhotos(h)} aria-label={`View photos of ${h.name}`} className="group relative size-20 shrink-0 overflow-hidden rounded-lg bg-[#15110c]/5">
                        {h.photo
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={h.photo} alt={h.name} className="size-full object-cover transition group-hover:scale-105" />
                          : <span className="grid size-full place-items-center"><Hotel strokeWidth={1.5} className="size-6 text-[#15110c]/30" /></span>}
                        <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-gradient-to-t from-black/70 to-transparent pb-1 pt-4 text-[10px] font-medium text-white opacity-0 transition group-hover:opacity-100"><Images strokeWidth={2} className="size-3" /> Photos</span>
                      </button>
                      <button type="button" onClick={() => setPickedHotel((p) => p?.id === h.id ? null : h)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{h.name}</div>
                          <div className="flex items-center gap-1 text-xs text-[#15110c]/55">
                            {h.rating ? <><Star strokeWidth={0} fill="#e8643c" className="size-3" />{h.rating}/10{h.reviews ? ` (${h.reviews.toLocaleString()})` : ""}</> : null}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          {h.price != null ? <div className="text-sm font-semibold">{show(h.price, h.currency)}</div> : <div className="text-xs text-[#15110c]/45">see rates</div>}
                          <div className="text-[10px] text-[#15110c]/45">{pickedHotel?.id === h.id ? "selected" : `${nights} nights`}</div>
                        </div>
                      </button>
                    </div>
                  ))}
                  {!hotels.list.length && <Empty>No hotels for these dates.</Empty>}
                </div>
              )}
          </div>
          <NextBar
            back={() => setStep("flights")}
            hint={pickedHotel ? `Stay selected · ${pickedHotel.price != null ? show(pickedHotel.price, pickedHotel.currency) : ""}` : "No hotel selected"}
            cta={pickedHotel ? "Continue" : "Skip hotel"}
            onNext={() => (pickedFlight || pickedHotel) ? setStep("review") : setBookingError("Pick a flight or hotel to continue.")}
          />
          {bookingError && <p className="mt-3 text-center text-sm text-[#e8643c]">{bookingError}</p>}
        </div>
      )}

      {/* STEP 3 — REVIEW + TRAVELLERS */}
      {(step === "review" || step === "confirming") && (
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Review and travellers</h2>
          <p className="mt-1 text-sm text-[#15110c]/55">Names as on the passport. Your tickets go to this email.</p>

          <div className="mt-5 rounded-2xl border border-[#15110c]/10 bg-white p-5">
            <div className="text-sm font-semibold">Your trip</div>
            {pickedFlight && <SummaryRow icon={<Plane strokeWidth={1.75} className="size-4 text-[#e8643c]" />} title={pickedFlight.airline} sub={`${pickedFlight.out.from} → ${pickedFlight.out.to}`} value={show(num(pickedFlight.price), pickedFlight.currency)} />}
            {pickedHotel && <SummaryRow icon={<Hotel strokeWidth={1.75} className="size-4 text-[#e8643c]" />} title={pickedHotel.name} sub={`${nights} nights`} value={pickedHotel.price != null ? show(pickedHotel.price, pickedHotel.currency) : "—"} />}
            {totalStr && <div className="mt-3 flex items-center justify-between border-t border-[#15110c]/8 pt-3 text-sm font-semibold"><span>Total</span><span>{totalStr}</span></div>}
          </div>

          <div className="mt-5 space-y-3">
            {travelers.map((t, i) => (
              <div key={i} className="grid grid-cols-2 gap-3">
                <input value={t.first} onChange={(e) => setTravelers((a) => a.map((x, j) => j === i ? { ...x, first: e.target.value } : x))} placeholder={`Traveller ${i + 1} first name`} className="ipt" />
                <input value={t.last} onChange={(e) => setTravelers((a) => a.map((x, j) => j === i ? { ...x, last: e.target.value } : x))} placeholder="Last name" className="ipt" />
              </div>
            ))}
            <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="Email for your tickets" className="ipt" />
          </div>

          {bookingError && <p className="mt-3 text-sm text-[#e8643c]">{bookingError}</p>}
          <NextBar
            back={() => setStep("stay")}
            busy={step === "confirming" || payLoading}
            busyLabel={payLoading ? "Preparing payment…" : "Booking…"}
            hint={totalStr ? `Total ${totalStr}` : ""}
            cta={stripePromise ? "Continue to payment" : "Confirm and book"}
            onNext={proceedToPayment}
          />
        </div>
      )}

      {/* STEP 4 — PAYMENT */}
      {step === "payment" && clientSecret && stripePromise && (
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Payment</h2>
          <p className="mt-1 text-sm text-[#15110c]/55">Secure payment by Stripe. Test card 4242 4242 4242 4242, any future date and CVC.</p>
          <div className="mt-5 rounded-2xl border border-[#15110c]/10 bg-white p-5">
            <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "stripe", variables: { colorPrimary: "#e8643c" } } }}>
              <PaymentForm total={totalStr} onBack={() => setStep("review")} onPaid={() => confirmBooking(payIntentId)} />
            </Elements>
          </div>
          <p className="mt-3 text-center text-xs text-[#15110c]/40">Stripe issues your receipt. Flight and hotel confirmations come from our partners.</p>
        </div>
      )}

      <style>{IPT}</style>
    </section>
  );
}

/* ── Tickets view (reused from My Trips) ── */
export function Tickets({ conf, show, onBack }: { conf: Confirmation; show: (a: number, f: string) => string; onBack: () => void }) {
  return (
    <section className="mx-auto max-w-xl px-6 pb-24 pt-10 animate-fade">
      <div className="text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-[#1f9d6b]/15 text-[#1f9d6b]"><Check strokeWidth={2.5} className="size-7" /></div>
        <span className="mt-4 inline-block rounded-full border border-[#15110c]/15 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#15110c]/55">Test booking · demo of the live flow</span>
        <h2 className="mt-4 text-2xl font-semibold tracking-tight">You are going to {conf.destination}</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-[#15110c]/60">
          Your tickets are below and saved to My Trips.{conf.emailedTo ? <> A copy is on the way to <span className="font-medium text-[#15110c]">{conf.emailedTo}</span>.</> : ""}
        </p>
      </div>

      <div className="mt-8 space-y-5">
        {conf.flight && <BoardingPass f={conf.flight} passengers={conf.passengers} show={show} />}
        {conf.hotel && <HotelVoucherCard h={conf.hotel} guest={conf.passengers[0] || "Guest"} show={show} />}
        {conf.totalDisplay && (
          <div className="flex items-center justify-between rounded-2xl bg-[#15110c] px-5 py-4 text-white">
            <span className="text-sm font-medium opacity-80">Total paid</span>
            <span className="text-lg font-semibold">{conf.totalDisplay}</span>
          </div>
        )}
        {conf.receiptUrl && (
          <a href={conf.receiptUrl} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-xl border border-[#15110c]/15 bg-white px-5 py-3 text-sm font-semibold text-[#15110c] transition hover:border-[#e8643c] hover:text-[#e8643c]">
            <Ticket strokeWidth={1.75} className="size-4" /> View your Stripe receipt
          </a>
        )}
      </div>

      <button onClick={onBack} className="mx-auto mt-8 block text-sm text-[#15110c]/50 transition hover:text-[#e8643c]">← Back</button>
    </section>
  );
}

function BoardingPass({ f, passengers, show }: { f: FlightTicket; passengers: string[]; show: (a: number, c: string) => string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#15110c]/10 bg-white shadow-soft">
      <div className="flex items-center justify-between bg-[#15110c] px-5 py-3 text-white">
        <div className="flex items-center gap-2 font-semibold"><Plane strokeWidth={1.75} className="size-4 text-[#e8643c]" /> {f.airline}</div>
        <span className="text-[11px] uppercase tracking-wide opacity-60">{f.roundTrip ? "Round trip" : "One way"} · E-ticket</span>
      </div>
      <div className="flex items-center justify-between px-6 py-6">
        <div><div className="text-3xl font-bold tracking-tight">{f.from}</div><div className="mt-1 text-xs text-[#15110c]/50">Depart {f.depart}</div></div>
        <div className="flex flex-1 items-center px-3 text-[#e8643c]/40">
          <span className="h-px flex-1 bg-current" /><Plane strokeWidth={2} className="mx-1 size-4 text-[#e8643c]" /><span className="h-px flex-1 bg-current" />
        </div>
        <div className="text-right"><div className="text-3xl font-bold tracking-tight">{f.to}</div><div className="mt-1 text-xs text-[#15110c]/50">Arrive {f.arrive}</div></div>
      </div>
      <div className="relative border-t border-dashed border-[#15110c]/20">
        <span className="absolute -left-2 -top-2 size-4 rounded-full bg-[#faf7f2]" /><span className="absolute -right-2 -top-2 size-4 rounded-full bg-[#faf7f2]" />
      </div>
      <div className="grid grid-cols-2 gap-3 px-6 py-4 text-sm">
        <div><div className="text-[11px] uppercase tracking-wide text-[#15110c]/45">Passenger{passengers.length > 1 ? "s" : ""}</div><div className="font-medium">{passengers.join(", ") || "Guest"}</div></div>
        <div className="text-right"><div className="text-[11px] uppercase tracking-wide text-[#15110c]/45">Booking reference</div><div className="font-mono text-base font-bold tracking-widest text-[#e8643c]">{f.ref}</div></div>
      </div>
    </div>
  );
}

function HotelVoucherCard({ h, guest, show }: { h: HotelVoucher; guest: string; show: (a: number, c: string) => string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#15110c]/10 bg-white shadow-soft">
      <div className="flex items-center justify-between bg-[#15110c] px-5 py-3 text-white">
        <div className="flex items-center gap-2 font-semibold"><Hotel strokeWidth={1.75} className="size-4 text-[#e8643c]" /> Hotel voucher</div>
        <span className="text-[11px] uppercase tracking-wide opacity-60">Confirmed</span>
      </div>
      <div className="px-6 py-5">
        <div className="text-lg font-semibold">{h.name}</div>
        <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
          <div><div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-[#15110c]/45"><Calendar strokeWidth={2} className="size-3" /> Check in</div><div className="mt-0.5 font-medium">{h.checkin}</div></div>
          <div><div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-[#15110c]/45"><Calendar strokeWidth={2} className="size-3" /> Check out</div><div className="mt-0.5 font-medium">{h.checkout}</div></div>
          <div><div className="text-[11px] uppercase tracking-wide text-[#15110c]/45">Nights</div><div className="mt-0.5 font-medium">{h.nights}</div></div>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-[#15110c]/8 pt-3 text-sm">
          <div><div className="text-[11px] uppercase tracking-wide text-[#15110c]/45">Guest</div><div className="font-medium">{guest}</div></div>
          <div className="text-right"><div className="text-[11px] uppercase tracking-wide text-[#15110c]/45">Booking number</div><div className="font-mono text-base font-bold tracking-widest text-[#e8643c]">{h.id}</div></div>
        </div>
      </div>
    </div>
  );
}

/* ── stepper + shared bits ── */
function Stepper({ current }: { current: number }) {
  const steps = ["Flights", "Stay", "Travellers", "Payment"];
  return (
    <div className="mb-6 flex items-center">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center">
          <div className="flex items-center gap-2">
            <span className={`grid size-6 place-items-center rounded-full text-xs font-semibold transition ${i < current ? "bg-[#1f9d6b] text-white" : i === current ? "bg-[#e8643c] text-white" : "bg-[#15110c]/8 text-[#15110c]/45"}`}>
              {i < current ? <Check strokeWidth={3} className="size-3.5" /> : i + 1}
            </span>
            <span className={`hidden text-xs font-medium sm:block ${i === current ? "text-[#15110c]" : "text-[#15110c]/45"}`}>{s}</span>
          </div>
          {i < steps.length - 1 && <div className="mx-2 h-px w-6 bg-[#15110c]/15 sm:w-8" />}
        </div>
      ))}
    </div>
  );
}

function NextBar({ back, hint, cta, onNext, busy, busyLabel }: { back?: () => void; hint: string; cta: string; onNext: () => void; busy?: boolean; busyLabel?: string }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#15110c]/10 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-6 py-3">
        <div className="min-w-0 text-sm">
          {back && <button onClick={back} className="text-[#15110c]/50 transition hover:text-[#e8643c]">← Back</button>}
          <div className="truncate text-xs text-[#15110c]/55">{hint}</div>
        </div>
        <button onClick={onNext} disabled={busy} className="flex shrink-0 items-center gap-2 rounded-xl bg-[#e8643c] px-5 py-3 text-sm font-semibold text-white transition active:scale-95 hover:bg-[#d4502a] disabled:opacity-50">
          {busy ? <><Spin /> {busyLabel || "Working…"}</> : <>{cta} <ArrowRight strokeWidth={2} className="size-4" /></>}
        </button>
      </div>
    </div>
  );
}

function PaymentForm({ total, onPaid, onBack }: { total: string; onPaid: () => void; onBack: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function pay() {
    if (!stripe || !elements) return;
    setBusy(true); setErr("");
    const { error, paymentIntent } = await stripe.confirmPayment({ elements, redirect: "if_required" });
    if (error) { setErr(error.message || "Payment failed. Check your card details."); setBusy(false); return; }
    if (paymentIntent && (paymentIntent.status === "succeeded" || paymentIntent.status === "processing")) { onPaid(); return; }
    setErr("Payment did not complete. Please try again."); setBusy(false);
  }
  return (
    <>
      <PaymentElement />
      {err && <p className="mt-3 text-sm text-[#e8643c]">{err}</p>}
      <div className="mt-4 flex items-center gap-3">
        <button onClick={onBack} disabled={busy} className="text-sm text-[#15110c]/50 transition hover:text-[#e8643c] disabled:opacity-40">← Back</button>
        <button onClick={pay} disabled={!stripe || busy} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#e8643c] px-5 py-3.5 text-sm font-semibold text-white transition active:scale-[0.98] hover:bg-[#d4502a] disabled:opacity-50">
          {busy ? <><Spin /> Processing…</> : <><ShieldCheck strokeWidth={1.75} className="size-4" /> Pay {total}</>}
        </button>
      </div>
    </>
  );
}

const IPT = `.ipt{width:100%;border:1px solid rgba(21,17,12,.12);border-radius:12px;padding:10px 12px;font-size:14px;outline:none;background:#fff}.ipt:focus{border-color:#e8643c}`;
function card(active: boolean) {
  return `flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${active ? "border-[#e8643c] bg-[#e8643c]/5 ring-1 ring-[#e8643c]" : "border-[#15110c]/10 bg-white hover:border-[#15110c]/25"}`;
}
function SummaryRow({ icon, title, sub, value }: { icon: React.ReactNode; title: string; sub: string; value: string }) {
  return (
    <div className="mt-3 flex items-center gap-3 text-sm">
      <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#e8643c]/10">{icon}</div>
      <div className="min-w-0 flex-1"><div className="truncate font-medium">{title}</div><div className="text-xs text-[#15110c]/50">{sub}</div></div>
      <div className="shrink-0 font-semibold">{value}</div>
    </div>
  );
}
function Spin() { return <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />; }
function Empty({ children }: { children: React.ReactNode }) { return <div className="rounded-2xl border border-dashed border-[#15110c]/15 bg-[#faf7f2] px-4 py-6 text-center text-sm text-[#15110c]/50">{children}</div>; }
function Loading({ label }: { label: string }) { return <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-[#15110c]/5" />)}<p className="text-center text-xs text-[#15110c]/40">{label}…</p></div>; }
function ErrorBox({ msg, onRetry }: { msg: string; onRetry: () => void }) { return <div className="rounded-2xl border border-[#e8643c]/25 bg-[#e8643c]/5 px-4 py-4 text-sm text-[#15110c]/70">{msg} <button onClick={onRetry} className="font-medium text-[#e8643c] hover:underline">Retry</button></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1 block text-xs font-medium text-[#15110c]/50">{label}</span>{children}</label>; }

function AirportInput({ label, initial, onSelect }: { label: string; initial?: string; onSelect: (iata: string, display: string) => void }) {
  const [q, setQ] = useState(initial ?? "");
  const [list, setList] = useState<{ iata: string; name: string; city: string }[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => { if (initial) setQ(initial); }, [initial]);
  useEffect(() => {
    if (q.trim().length < 2 || !open) { setList([]); return; }
    const t = setTimeout(async () => {
      try { const r = await fetch(`/api/airports?q=${encodeURIComponent(q)}`); setList((await r.json()).results || []); } catch { /* ignore */ }
    }, 220);
    return () => clearTimeout(t);
  }, [q, open]);
  return (
    <label className="relative block">
      <span className="mb-1 block text-xs font-medium text-[#15110c]/50">{label}</span>
      <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} placeholder="City or airport" className="ipt" />
      {open && list.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-[#15110c]/12 bg-white shadow-lg">
          {list.map((a) => (
            <button key={a.iata + a.name} type="button" onMouseDown={(e) => { e.preventDefault(); onSelect(a.iata, `${a.city} (${a.iata})`); setQ(`${a.city} (${a.iata})`); setOpen(false); }} className="block w-full px-3 py-2 text-left text-sm transition hover:bg-[#faf7f2]">
              <span className="font-medium">{a.city}</span> <span className="text-xs text-[#15110c]/50">{a.iata} · {a.name}</span>
            </button>
          ))}
        </div>
      )}
    </label>
  );
}
