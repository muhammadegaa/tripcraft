"use client";

import { useEffect, useState } from "react";
import type { Trip, Day } from "@/lib/itinerary";
import { guessIata, plusDays } from "@/lib/booking-links";
import { useCurrency } from "@/app/currency";

// In-platform booking that actually completes: pick real flights (Duffel) and
// hotels (LiteAPI), enter travellers, then book through the APIs and get a
// confirmation with booking numbers, a receipt, and an email. Sandbox keys
// produce real (test) confirmations; live keys produce real ones.

type Slice = { from: string; to: string; depart: string; arrive: string; dur: string; stops: number };
type Offer = { id: string; airline: string; airlineLogo: string | null; price: string; currency: string; out: Slice; ret: Slice | null };
type Hotel = { id: string; name: string; photo: string | null; stars: number | null; rating: number | null; reviews: number | null; price: number | null; currency: string; offerId: string | null };
type Traveler = { first: string; last: string };
type Confirmation = {
  destination: string;
  flight: { ref: string; airline: string; route: string; times: string; price: number; currency: string } | null;
  hotel: { id: string; name: string; nights: number; price: number; currency: string } | null;
  totalDisplay: string;
  emailedTo: string | null;
};

export default function Booking({ trip, days, onBack, onBooked }: {
  trip: Trip; days: Day[]; onBack: () => void;
  onBooked?: (b: { confirmation: Confirmation; status: string }) => void;
}) {
  const { show, currency, rates } = useCurrency();
  const [origin, setOrigin] = useState("");
  const [originLabel, setOriginLabel] = useState("");
  const [destination, setDestination] = useState(guessIata(trip.destination));
  const [destLabel, setDestLabel] = useState(guessIata(trip.destination) ? `${trip.destination} (${guessIata(trip.destination)})` : "");
  const [departDate, setDepart] = useState(plusDays(30));
  const [returnDate, setReturn] = useState(plusDays(30 + Math.min(trip.days, 21)));
  const adults = Math.max(1, trip.party);

  const [flights, setFlights] = useState<{ loading: boolean; offers: Offer[]; passengers: { id: string }[]; source: string; error: string }>({ loading: false, offers: [], passengers: [], source: "", error: "" });
  const [hotels, setHotels] = useState<{ loading: boolean; list: Hotel[]; source: string; error: string }>({ loading: false, list: [], source: "", error: "" });
  const [pickedFlight, setPickedFlight] = useState<Offer | null>(null);
  const [pickedHotel, setPickedHotel] = useState<Hotel | null>(null);

  const [step, setStep] = useState<"browse" | "details" | "confirming" | "done">("browse");
  const [travelers, setTravelers] = useState<Traveler[]>(Array.from({ length: adults }, () => ({ first: "", last: "" })));
  const [contactEmail, setContactEmail] = useState("");
  const [bookingError, setBookingError] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  useEffect(() => {
    if (destination) return;
    fetch(`/api/airports?q=${encodeURIComponent(trip.destination)}`).then((r) => r.json()).then((d) => {
      const a = d.results?.[0];
      if (a) { setDestination(a.iata); setDestLabel(`${a.city} (${a.iata})`); }
    }).catch(() => {});
  }, [destination, trip.destination]);

  const ready = /^[A-Z]{3}$/.test(origin) && /^[A-Z]{3}$/.test(destination);

  async function searchFlights() {
    if (!ready) return;
    setFlights((s) => ({ ...s, loading: true, error: "" }));
    try {
      const r = await fetch("/api/flights/search", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ origin, destination, departDate, returnDate, adults }),
      });
      const d = await r.json();
      if (d.error) setFlights({ loading: false, offers: [], passengers: [], source: "", error: d.error });
      else setFlights({ loading: false, offers: d.offers ?? [], passengers: d.passengers ?? [], source: d.source ?? "", error: "" });
    } catch {
      setFlights({ loading: false, offers: [], passengers: [], source: "", error: "Could not load flights. Try again." });
    }
  }

  async function searchHotels() {
    setHotels((s) => ({ ...s, loading: true, error: "" }));
    try {
      const r = await fetch("/api/hotels/search", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ destination: trip.destination, checkin: departDate, checkout: returnDate, adults }),
      });
      const d = await r.json();
      if (d.error) setHotels({ loading: false, list: [], source: "", error: d.error });
      else setHotels({ loading: false, list: d.hotels ?? [], source: d.source ?? "", error: "" });
    } catch {
      setHotels({ loading: false, list: [], source: "", error: "Could not load hotels. Try again." });
    }
  }

  useEffect(() => { searchHotels(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useEffect(() => { if (ready) searchFlights(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [ready, departDate, returnDate]);

  const nights = days.length || trip.days;
  function num(v: string | number) { return typeof v === "number" ? v : Number(String(v).replace(/[^0-9.]/g, "")); }

  async function confirmBooking() {
    setBookingError("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) { setBookingError("Enter a valid email for your confirmation."); return; }
    if (travelers.some((t) => !t.first.trim() || !t.last.trim())) { setBookingError("Enter every traveller's first and last name."); return; }
    setStep("confirming");
    try {
      let flightConf: Confirmation["flight"] = null;
      let hotelConf: Confirmation["hotel"] = null;

      if (pickedFlight) {
        const pax = (flights.passengers.length ? flights.passengers : travelers.map((_, i) => ({ id: `p${i + 1}` })))
          .map((p, i) => ({ id: p.id, given_name: travelers[i]?.first || "Guest", family_name: travelers[i]?.last || "Traveller" }));
        const r = await fetch("/api/flights/order", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ offerId: pickedFlight.id, amount: pickedFlight.price, currency: pickedFlight.currency, email: contactEmail, passengers: pax }),
        });
        const d = await r.json();
        if (!d.ok) throw new Error("Flight booking failed. Please try again.");
        flightConf = {
          ref: d.bookingReference, airline: pickedFlight.airline,
          route: `${pickedFlight.out.from} → ${pickedFlight.out.to}${pickedFlight.ret ? " → " + pickedFlight.out.from : ""}`,
          times: `${pickedFlight.out.depart}–${pickedFlight.out.arrive}`, price: num(pickedFlight.price), currency: pickedFlight.currency,
        };
      }

      if (pickedHotel) {
        const r = await fetch("/api/hotels/book", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ offerId: pickedHotel.offerId, email: contactEmail, guests: travelers.map((t) => ({ firstName: t.first, lastName: t.last })) }),
        });
        const d = await r.json();
        if (!d.ok) throw new Error("Hotel booking failed. Please try again.");
        hotelConf = { id: d.bookingId, name: pickedHotel.name, nights, price: num(pickedHotel.price ?? 0), currency: pickedHotel.currency };
      }

      // One total in the display currency (real FX), so flight + hotel add up honestly.
      const { convert, formatMoney } = await import("@/lib/currency");
      let totalDisplay = "";
      const parts: number[] = [];
      if (flightConf) { const v = convert(flightConf.price, flightConf.currency, currency, rates); if (v != null) parts.push(v); }
      if (hotelConf) { const v = convert(hotelConf.price, hotelConf.currency, currency, rates); if (v != null) parts.push(v); }
      if (parts.length) totalDisplay = formatMoney(parts.reduce((a, b) => a + b, 0), currency);

      const conf: Confirmation = { destination: trip.destination, flight: flightConf, hotel: hotelConf, totalDisplay, emailedTo: null };

      // Confirmation email with booking numbers + receipt (best effort).
      try {
        const er = await fetch("/api/booking-email", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: contactEmail, destination: trip.destination, displayCurrency: currency,
            flight: flightConf, hotel: hotelConf, total: totalDisplay,
            flightDisplay: flightConf ? show(flightConf.price, flightConf.currency) : null,
            hotelDisplay: hotelConf ? show(hotelConf.price, hotelConf.currency) : null,
          }),
        });
        const ed = await er.json();
        if (ed.sent) conf.emailedTo = contactEmail;
      } catch { /* email best effort */ }

      setConfirmation(conf);
      onBooked?.({ confirmation: conf, status: "booked" });
      setStep("done");
    } catch (e) {
      setBookingError(e instanceof Error ? e.message : "Booking failed. Please try again.");
      setStep("details");
    }
  }

  if (step === "done" && confirmation) return <Confirmed conf={confirmation} show={show} onBack={onBack} />;

  if (step === "details" || step === "confirming") {
    const busy = step === "confirming";
    return (
      <section className="mx-auto max-w-xl px-6 pb-24 pt-4 animate-fade">
        <button onClick={() => setStep("browse")} disabled={busy} className="text-sm text-[#15110c]/50 transition hover:text-[#e8643c] disabled:opacity-40">← Back to options</button>
        <h2 className="mt-4 text-2xl font-semibold tracking-tight">Who is travelling?</h2>
        <p className="mt-1 text-sm text-[#15110c]/55">Names as on the passport. We send the confirmation and tickets to your email.</p>

        <div className="mt-5 space-y-3">
          {travelers.map((t, i) => (
            <div key={i} className="grid grid-cols-2 gap-3">
              <input value={t.first} onChange={(e) => setTravelers((a) => a.map((x, j) => j === i ? { ...x, first: e.target.value } : x))} placeholder={`Traveller ${i + 1} first name`} className="ipt" />
              <input value={t.last} onChange={(e) => setTravelers((a) => a.map((x, j) => j === i ? { ...x, last: e.target.value } : x))} placeholder="Last name" className="ipt" />
            </div>
          ))}
          <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="Email for your confirmation" className="ipt" />
        </div>

        <div className="mt-6 rounded-2xl border border-[#15110c]/10 bg-white p-5">
          <div className="text-sm font-semibold">Your order</div>
          {pickedFlight && <Line label={`✈️ ${pickedFlight.airline}`} sub={`${pickedFlight.out.from} → ${pickedFlight.out.to}`} value={show(num(pickedFlight.price), pickedFlight.currency)} />}
          {pickedHotel && <Line label={`🏨 ${pickedHotel.name}`} sub={`${nights} nights`} value={pickedHotel.price != null ? show(pickedHotel.price, pickedHotel.currency) : "—"} />}
          {!pickedFlight && !pickedHotel && <p className="mt-2 text-sm text-[#15110c]/50">Nothing selected. Go back and pick a flight or hotel.</p>}
        </div>

        {bookingError && <p className="mt-3 text-sm text-[#e8643c]">{bookingError}</p>}

        <button onClick={confirmBooking} disabled={busy || (!pickedFlight && !pickedHotel)} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#e8643c] px-5 py-3.5 text-sm font-semibold text-white transition active:scale-[0.98] hover:bg-[#d4502a] disabled:opacity-50">
          {busy ? <><Spin /> Booking…</> : <>Confirm and book →</>}
        </button>
        <p className="mt-3 text-center text-xs text-[#15110c]/40">Test bookings until our live payment licence is on. You get a real confirmation number and email either way.</p>
        <style>{IPT}</style>
      </section>
    );
  }

  // step === "browse"
  return (
    <section className="mx-auto max-w-2xl px-6 pb-40 pt-4 animate-fade">
      <div className="mb-5 flex items-center justify-between">
        <button onClick={onBack} className="text-sm text-[#15110c]/50 transition hover:text-[#e8643c]">← Back to plan</button>
        <span className="text-xs text-[#15110c]/40">Booking · {trip.destination}</span>
      </div>

      <h2 className="text-2xl font-semibold tracking-tight">Book your {trip.days}-day {trip.destination} trip</h2>
      <p className="mt-1 text-sm text-[#15110c]/55">Live flight and hotel prices in {currency}. Pick what you want, then book it here.</p>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <AirportInput label="Flying from" initial={originLabel} onSelect={(iata, d) => { setOrigin(iata); setOriginLabel(d); }} />
        <AirportInput label="Going to" initial={destLabel} onSelect={(iata, d) => { setDestination(iata); setDestLabel(d); }} />
        <Field label="Depart"><input type="date" value={departDate} onChange={(e) => setDepart(e.target.value)} className="ipt" /></Field>
        <Field label="Return"><input type="date" value={returnDate} onChange={(e) => setReturn(e.target.value)} className="ipt" /></Field>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between">
          <div className="font-semibold">✈️ Flights {flights.source === "demo" && <SampleTag />}</div>
          {ready && !flights.loading && <button onClick={searchFlights} className="text-xs font-medium text-[#e8643c] hover:underline">Refresh</button>}
        </div>
        {!ready ? <Empty>Pick your departure airport to see live fares.</Empty>
          : flights.loading ? <Loading label="Finding flights" />
          : flights.error ? <ErrorBox msg={flights.error} onRetry={searchFlights} />
          : (
            <div className="mt-3 space-y-2">
              {flights.offers.map((o) => (
                <button key={o.id} onClick={() => setPickedFlight((p) => p?.id === o.id ? null : o)} className={card(pickedFlight?.id === o.id)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {o.airlineLogo ? <img src={o.airlineLogo} alt={o.airline} className="h-7 w-7 rounded object-contain" /> : <span className="grid h-7 w-7 place-items-center rounded bg-[#15110c]/5 text-xs">✈️</span>}
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
              {!flights.offers.length && <Empty>No flights found for these dates. Try different ones.</Empty>}
            </div>
          )}
      </div>

      <div className="mt-8">
        <div className="flex items-center justify-between">
          <div className="font-semibold">🏨 Hotels in {trip.destination} {hotels.source === "demo" && <SampleTag />}</div>
          {!hotels.loading && <button onClick={searchHotels} className="text-xs font-medium text-[#e8643c] hover:underline">Refresh</button>}
        </div>
        {hotels.loading ? <Loading label="Finding hotels" />
          : hotels.error ? <ErrorBox msg={hotels.error} onRetry={searchHotels} />
          : (
            <div className="mt-3 space-y-2">
              {hotels.list.map((h) => (
                <button key={h.id} onClick={() => setPickedHotel((p) => p?.id === h.id ? null : h)} className={card(pickedHotel?.id === h.id)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {h.photo ? <img src={h.photo} alt={h.name} className="h-14 w-14 shrink-0 rounded-lg object-cover" /> : <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-[#15110c]/5 text-lg">🏨</span>}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{h.name}</div>
                    <div className="text-xs text-[#15110c]/55">{h.stars ? `${h.stars}★` : ""}{h.rating ? `${h.stars ? " · " : ""}${h.rating}/10${h.reviews ? ` (${h.reviews.toLocaleString()})` : ""}` : ""}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    {h.price != null ? <div className="text-sm font-semibold">{show(h.price, h.currency)}</div> : <div className="text-xs text-[#15110c]/45">see rates</div>}
                    <div className="text-[10px] text-[#15110c]/45">{pickedHotel?.id === h.id ? "selected" : `${nights} nights`}</div>
                  </div>
                </button>
              ))}
              {!hotels.list.length && <Empty>No hotels found for these dates.</Empty>}
            </div>
          )}
      </div>

      <p className="mt-8 text-center text-xs text-[#15110c]/40">All prices shown in {currency} at live rates. Change currency in the top bar.</p>

      {(pickedFlight || pickedHotel) && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#15110c]/10 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-6 py-3">
            <div className="min-w-0 text-sm">
              <div className="font-semibold">Your trip</div>
              <div className="truncate text-xs text-[#15110c]/55">
                {pickedFlight ? `✈️ ${show(num(pickedFlight.price), pickedFlight.currency)}` : "no flight"}{" · "}
                {pickedHotel && pickedHotel.price != null ? `🏨 ${show(pickedHotel.price, pickedHotel.currency)}` : "no hotel"}
              </div>
            </div>
            <button onClick={() => setStep("details")} className="shrink-0 rounded-xl bg-[#e8643c] px-5 py-3 text-sm font-semibold text-white transition active:scale-95 hover:bg-[#d4502a]">Continue to book →</button>
          </div>
        </div>
      )}
      <style>{IPT}</style>
    </section>
  );
}

function Confirmed({ conf, show, onBack }: { conf: Confirmation; show: (a: number, f: string) => string; onBack: () => void }) {
  return (
    <section className="mx-auto max-w-xl px-6 pb-24 pt-10 animate-fade">
      <div className="text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#1f9d6b]/15 text-2xl">✓</div>
        <h2 className="mt-5 text-2xl font-semibold tracking-tight">Booked. You are going to {conf.destination}.</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-[#15110c]/60">
          {conf.emailedTo ? <>Confirmation and tickets are on the way to <span className="font-medium text-[#15110c]">{conf.emailedTo}</span>.</> : "Save your booking numbers below."}
        </p>
      </div>

      <div className="mt-7 space-y-3">
        {conf.flight && (
          <div className="rounded-2xl border border-[#15110c]/10 bg-white p-5">
            <div className="flex items-center justify-between">
              <div className="font-semibold">✈️ {conf.flight.airline}</div>
              <span className="rounded-full bg-[#1f9d6b]/10 px-2.5 py-1 text-xs font-medium text-[#1f9d6b]">Confirmed</span>
            </div>
            <div className="mt-1 text-sm text-[#15110c]/60">{conf.flight.route} · {conf.flight.times}</div>
            <div className="mt-3 flex items-center justify-between border-t border-[#15110c]/8 pt-3 text-sm">
              <span className="text-[#15110c]/55">Booking reference</span>
              <span className="font-mono font-semibold tracking-wider">{conf.flight.ref}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-sm">
              <span className="text-[#15110c]/55">Fare</span>
              <span className="font-medium">{show(conf.flight.price, conf.flight.currency)}</span>
            </div>
          </div>
        )}
        {conf.hotel && (
          <div className="rounded-2xl border border-[#15110c]/10 bg-white p-5">
            <div className="flex items-center justify-between">
              <div className="font-semibold">🏨 {conf.hotel.name}</div>
              <span className="rounded-full bg-[#1f9d6b]/10 px-2.5 py-1 text-xs font-medium text-[#1f9d6b]">Confirmed</span>
            </div>
            <div className="mt-1 text-sm text-[#15110c]/60">{conf.hotel.nights} nights</div>
            <div className="mt-3 flex items-center justify-between border-t border-[#15110c]/8 pt-3 text-sm">
              <span className="text-[#15110c]/55">Booking number</span>
              <span className="font-mono font-semibold tracking-wider">{conf.hotel.id}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-sm">
              <span className="text-[#15110c]/55">Stay</span>
              <span className="font-medium">{show(conf.hotel.price, conf.hotel.currency)}</span>
            </div>
          </div>
        )}
        {conf.totalDisplay && (
          <div className="flex items-center justify-between rounded-2xl bg-[#15110c] px-5 py-4 text-white">
            <span className="text-sm font-medium opacity-80">Total paid</span>
            <span className="text-lg font-semibold">{conf.totalDisplay}</span>
          </div>
        )}
      </div>

      <button onClick={onBack} className="mx-auto mt-7 block text-sm text-[#15110c]/50 transition hover:text-[#e8643c]">← Back to plan</button>
    </section>
  );
}

const IPT = `.ipt{width:100%;border:1px solid rgba(21,17,12,.12);border-radius:12px;padding:10px 12px;font-size:14px;outline:none;background:#fff}.ipt:focus{border-color:#e8643c}`;
function card(active: boolean) {
  return `flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${active ? "border-[#e8643c] bg-[#e8643c]/5 ring-1 ring-[#e8643c]" : "border-[#15110c]/10 bg-white hover:border-[#15110c]/25"}`;
}
function Line({ label, sub, value }: { label: string; sub: string; value: string }) {
  return (
    <div className="mt-2 flex items-center justify-between gap-3 text-sm">
      <div className="min-w-0"><span className="truncate font-medium">{label}</span> <span className="text-[#15110c]/45">· {sub}</span></div>
      <span className="shrink-0 font-medium">{value}</span>
    </div>
  );
}
function Spin() { return <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />; }
function SampleTag() { return <span className="ml-1 rounded-full bg-[#15110c]/8 px-2 py-0.5 text-[10px] font-medium text-[#15110c]/55">sample · connect key for live</span>; }
function Empty({ children }: { children: React.ReactNode }) { return <div className="mt-3 rounded-2xl border border-dashed border-[#15110c]/15 bg-[#faf7f2] px-4 py-6 text-center text-sm text-[#15110c]/50">{children}</div>; }
function Loading({ label }: { label: string }) {
  return <div className="mt-3 space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-[#15110c]/5" />)}<p className="text-center text-xs text-[#15110c]/40">{label}…</p></div>;
}
function ErrorBox({ msg, onRetry }: { msg: string; onRetry: () => void }) {
  return <div className="mt-3 rounded-2xl border border-[#e8643c]/25 bg-[#e8643c]/5 px-4 py-4 text-sm text-[#15110c]/70">{msg} <button onClick={onRetry} className="font-medium text-[#e8643c] hover:underline">Retry</button></div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-medium text-[#15110c]/50">{label}</span>{children}</label>;
}

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
