"use client";

import { useEffect, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import type { Trip } from "@/lib/itinerary";

type Slice = { from: string; to: string; depart: string; arrive: string; dur: string; stops: number };
type Offer = { id: string; airline: string; price: string; currency: string; expiresAt: string | null; out: Slice; ret: Slice | null };
type Hotel = { id: string; name: string; photo: string | null; stars: number | null; rating: number | null; reviews: number | null; price: number | null; currency: string; offerId: string | null };
type Pax = { id: string; given_name: string; family_name: string };
type Step = "form" | "searching" | "offers" | "hotels" | "travellers" | "payment" | "booking" | "done";

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) : null;

const CITY_IATA: Record<string, string> = {
  japan: "TYO", tokyo: "TYO", osaka: "KIX", kyoto: "KIX", bali: "DPS", indonesia: "CGK", jakarta: "CGK",
  korea: "SEL", seoul: "SEL", busan: "PUS", thailand: "BKK", bangkok: "BKK", singapore: "SIN", vietnam: "SGN",
  taiwan: "TPE", portugal: "LIS", lisbon: "LIS", italy: "ROM", rome: "ROM", france: "PAR", paris: "PAR",
  spain: "MAD", europe: "LON", london: "LON",
};
function guessIata(dest: string): string {
  const key = dest.toLowerCase().split(/[\s,]+/).find((w) => CITY_IATA[w]);
  return key ? CITY_IATA[key] : "";
}
function plusDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function nightsBetween(a: string, b: string, fallback: number): number {
  const d = (new Date(b).getTime() - new Date(a).getTime()) / 86400000;
  return d > 0 ? Math.round(d) : fallback;
}
function num(s: string) { const n = Number(s); return isFinite(n) ? n : 0; }

// Static FX to USD so the trip total is coherent across suppliers (sandbox).
const FX: Record<string, number> = { USD: 1, GBP: 1.27, EUR: 1.08, IDR: 0.000063, JPY: 0.0064, SGD: 0.74, KRW: 0.00073, THB: 0.027, VND: 0.00004, TWD: 0.031, AUD: 0.66, CAD: 0.73 };
function toUSD(amount: number, currency: string): number {
  return amount * (FX[currency?.toUpperCase()] ?? 1);
}

export default function Booking({ trip, email, onBack }: { trip: Trip; email?: string; onBack: () => void }) {
  const [step, setStep] = useState<Step>("form");
  const [origin, setOrigin] = useState("CGK");
  const [destination, setDestination] = useState(guessIata(trip.destination));
  const [departDate, setDepart] = useState(plusDays(30));
  const [returnDate, setReturn] = useState(plusDays(30 + Math.min(trip.days, 21)));
  const [adults] = useState(Math.max(1, trip.party));
  const [error, setError] = useState<string | null>(null);

  const [offers, setOffers] = useState<Offer[]>([]);
  const [paxIds, setPaxIds] = useState<{ id: string }[]>([]);
  const [flight, setFlight] = useState<Offer | null>(null);

  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [hotelsLoading, setHotelsLoading] = useState(false);
  const [hotel, setHotel] = useState<Hotel | null>(null);

  const [pax, setPax] = useState<Pax[]>([]);
  const [contactEmail, setContactEmail] = useState(email ?? "");

  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paySimulated, setPaySimulated] = useState(false);
  const [ref, setRef] = useState<string | null>(null);
  const [hotelRef, setHotelRef] = useState<string | null>(null);

  const nights = nightsBetween(departDate, returnDate, Math.min(trip.days, 14));
  const flightAmt = flight ? Math.round(toUSD(num(flight.price), flight.currency)) : 0;
  const hotelAmt = hotel?.price ? Math.round(toUSD(hotel.price, hotel.currency)) * nights : 0;
  const total = flightAmt + hotelAmt;

  async function search() {
    setError(null);
    if (!/^[A-Za-z]{3}$/.test(origin) || !/^[A-Za-z]{3}$/.test(destination)) { setError("Enter 3-letter airport codes (e.g. CGK, TYO)."); return; }
    setStep("searching");
    try {
      const res = await fetch("/api/flights/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ origin, destination, departDate, returnDate, adults }) });
      const data = await res.json();
      if (data.error) { setError(data.error); setStep("form"); return; }
      setOffers(data.offers || []);
      setPaxIds(data.passengers || [{ id: "p1" }]);
      setStep("offers");
    } catch { setError("Could not reach flight search. Try again."); setStep("form"); }
  }

  async function chooseFlight(o: Offer) {
    setFlight(o);
    setStep("hotels");
    setHotelsLoading(true);
    try {
      const res = await fetch("/api/hotels/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ destination: trip.destination, checkin: departDate, checkout: returnDate, adults }) });
      const data = await res.json();
      setHotels(data.hotels || []);
    } catch { setHotels([]); }
    setHotelsLoading(false);
  }

  function toTravellers() {
    const ids = paxIds.length ? paxIds : Array.from({ length: adults }, (_, i) => ({ id: `p${i + 1}` }));
    setPax(ids.map((p) => ({ id: p.id, given_name: "", family_name: "" })));
    setStep("travellers");
  }

  async function toPayment() {
    if (pax.some((p) => !p.given_name.trim() || !p.family_name.trim())) { setError("Add every traveller's name."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) { setError("Add a contact email."); return; }
    setError(null);
    setStep("payment");
    try {
      const res = await fetch("/api/payment-intent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ amount: total, currency: "usd" }) });
      const data = await res.json();
      if (data.clientSecret && stripePromise) setClientSecret(data.clientSecret);
      else setPaySimulated(true);
    } catch { setPaySimulated(true); }
  }

  async function placeOrder() {
    setStep("booking");
    let flightRef = "CONFIRMED";
    try {
      const res = await fetch("/api/flights/order", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ offerId: flight!.id, amount: flight!.price, currency: flight!.currency, email: contactEmail, passengers: pax }) });
      flightRef = (await res.json()).bookingReference || "CONFIRMED";
    } catch { /* keep fallback */ }
    if (hotel?.offerId) {
      try {
        const hb = await fetch("/api/hotels/book", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ offerId: hotel.offerId, email: contactEmail, guests: pax.map((p) => ({ firstName: p.given_name, lastName: p.family_name })) }) });
        const hj = await hb.json();
        setHotelRef(hj.bookingId ?? null);
      } catch { /* hotel best-effort */ }
    }
    setRef(flightRef);
    setStep("done");
  }

  return (
    <section className="mx-auto max-w-2xl px-6 pb-24 pt-4 animate-fade">
      <div className="mb-5 flex items-center justify-between">
        <button onClick={step === "form" ? onBack : () => setStep("form")} className="text-sm text-[#15110c]/50 transition hover:text-[#e8643c]">← Back</button>
        <span className="text-xs text-[#15110c]/40">Booking · {trip.destination}</span>
      </div>
      {error && <p className="mb-4 rounded-xl bg-[#e8643c]/10 px-4 py-2.5 text-sm text-[#e8643c]">{error}</p>}

      {step === "form" && (
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Book your trip</h2>
          <p className="mt-1 text-sm text-[#15110c]/55">Live flight and hotel prices for your dates, paid in one go.</p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <Field label="From (airport)"><input value={origin} onChange={(e) => setOrigin(e.target.value.toUpperCase())} maxLength={3} className="ipt" /></Field>
            <Field label="To (airport)"><input value={destination} onChange={(e) => setDestination(e.target.value.toUpperCase())} maxLength={3} placeholder="e.g. TYO" className="ipt" /></Field>
            <Field label="Depart"><input type="date" value={departDate} onChange={(e) => setDepart(e.target.value)} className="ipt" /></Field>
            <Field label="Return"><input type="date" value={returnDate} onChange={(e) => setReturn(e.target.value)} className="ipt" /></Field>
          </div>
          <p className="mt-2 text-xs text-[#15110c]/40">{adults} traveller{adults > 1 ? "s" : ""} · {nights} nights · economy</p>
          <button onClick={search} className="mt-5 w-full rounded-xl bg-[#e8643c] px-5 py-3.5 text-sm font-semibold text-white transition active:scale-[0.98] hover:bg-[#d4502a]">Search flights and hotels</button>
        </div>
      )}

      {step === "searching" && <Center>Searching live fares…</Center>}

      {step === "offers" && (
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{offers.length} flights, {origin} ↔ {destination}</h2>
          <div className="mt-5 space-y-3">
            {offers.map((o) => (
              <button key={o.id} onClick={() => chooseFlight(o)} className="block w-full rounded-2xl border border-[#15110c]/10 bg-white p-4 text-left transition hover:border-[#e8643c] hover:shadow-[0_12px_40px_-18px_rgba(0,0,0,0.2)]">
                <div className="flex items-center justify-between"><span className="font-medium">{o.airline}</span><span className="text-lg font-semibold">{o.currency} {num(o.price).toLocaleString()}</span></div>
                <FlightLeg label="Outbound" s={o.out} />
                {o.ret && <FlightLeg label="Return" s={o.ret} />}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === "hotels" && (
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Where you&apos;ll stay</h2>
          <p className="mt-1 text-sm text-[#15110c]/55">{nights} nights in {trip.destination}. Prices are per night.</p>
          {hotelsLoading ? <Center>Finding hotels…</Center> : (
            <div className="mt-5 space-y-3">
              {hotels.map((h) => (
                <button key={h.id} onClick={() => { setHotel(h); toTravellers(); }} className="flex w-full items-center gap-3 rounded-2xl border border-[#15110c]/10 bg-white p-3 text-left transition hover:border-[#e8643c] hover:shadow-[0_12px_40px_-18px_rgba(0,0,0,0.2)]">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-[#15110c]/5">
                    {h.photo ? (/* eslint-disable-next-line @next/next/no-img-element */ <img src={h.photo} alt="" className="h-full w-full object-cover" />) : <div className="flex h-full w-full items-center justify-center text-lg text-[#15110c]/20">🏨</div>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{h.name}</div>
                    <div className="mt-1 text-xs text-[#15110c]/55">{h.stars ? "★".repeat(h.stars) + " · " : ""}{h.rating ? `${h.rating}/10 (${(h.reviews ?? 0).toLocaleString()})` : ""}</div>
                  </div>
                  <div className="shrink-0 text-right"><div className="font-semibold">{h.currency} {h.price?.toLocaleString()}</div><div className="text-xs text-[#15110c]/45">per night</div></div>
                </button>
              ))}
              <button onClick={() => { setHotel(null); toTravellers(); }} className="w-full rounded-xl border border-[#15110c]/12 px-4 py-3 text-sm font-medium text-[#15110c]/60 transition hover:border-[#e8643c] hover:text-[#e8643c]">Skip hotels, flights only →</button>
            </div>
          )}
        </div>
      )}

      {step === "travellers" && flight && (
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Who&apos;s travelling?</h2>
          <p className="mt-1 text-sm text-[#15110c]/55">Names must match passports.</p>
          <div className="mt-5 space-y-4">
            {pax.map((p, i) => (
              <div key={p.id} className="grid grid-cols-2 gap-3">
                <Field label={`Traveller ${i + 1} given name`}><input value={p.given_name} onChange={(e) => setPax((a) => a.map((x, j) => (j === i ? { ...x, given_name: e.target.value } : x)))} className="ipt" /></Field>
                <Field label="Family name"><input value={p.family_name} onChange={(e) => setPax((a) => a.map((x, j) => (j === i ? { ...x, family_name: e.target.value } : x)))} className="ipt" /></Field>
              </div>
            ))}
            <Field label="Contact email"><input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="you@email.com" className="ipt" /></Field>
          </div>
          <button onClick={toPayment} className="mt-5 w-full rounded-xl bg-[#e8643c] px-5 py-3.5 text-sm font-semibold text-white transition active:scale-[0.98] hover:bg-[#d4502a]">Continue to payment</button>
        </div>
      )}

      {step === "payment" && (
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Review and pay</h2>
          <div className="mt-5 space-y-2 rounded-2xl border border-[#15110c]/10 bg-white p-5 text-sm">
            <Line label={`Flights · ${flight?.airline}`} val={`$${flightAmt.toLocaleString()}`} />
            {hotel && <Line label={`${hotel.name} · ${nights} nights`} val={`$${hotelAmt.toLocaleString()}`} />}
            <div className="my-2 border-t border-[#15110c]/8" />
            <div className="flex items-center justify-between font-semibold"><span>Total</span><span className="text-lg">${total.toLocaleString()}</span></div>
          </div>
          <div className="mt-5">
            {clientSecret && stripePromise ? (
              <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "flat", variables: { colorPrimary: "#e8643c", borderRadius: "12px" } } }}>
                <PayForm onPaid={placeOrder} total={total} />
              </Elements>
            ) : paySimulated ? (
              <SimPay onPaid={placeOrder} total={total} />
            ) : (
              <Center>Preparing secure checkout…</Center>
            )}
          </div>
          <p className="mt-3 text-center text-xs text-[#15110c]/40">🔒 Encrypted. Sandbox total in USD; no real charge.</p>
        </div>
      )}

      {step === "booking" && <Center>Confirming your trip…</Center>}

      {step === "done" && (
        <div className="text-center">
          <svg width="56" height="56" viewBox="0 0 24 24" className="mx-auto animate-pop"><circle cx="12" cy="12" r="11" fill="#1f9d6b" /><path className="check-path" d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <h2 className="mt-5 text-3xl font-semibold tracking-tight">Trip booked.</h2>
          <p className="mt-2 text-[#15110c]/65">Booking reference</p>
          <div className="mx-auto mt-2 w-fit rounded-xl bg-[#15110c] px-5 py-2 font-mono text-lg font-semibold tracking-widest text-white">{ref}</div>
          <div className="mx-auto mt-5 max-w-sm space-y-1 text-sm text-[#15110c]/65">
            <p>✈️ {flight?.airline}, {origin} ↔ {destination}, {pax.length} traveller{pax.length > 1 ? "s" : ""}</p>
            {hotel && <p>🏨 {hotel.name}, {nights} nights{hotelRef ? ` · ${hotelRef}` : ""}</p>}
            <p className="text-[#15110c]/45">Confirmation sent to {contactEmail}.</p>
          </div>
          <button onClick={onBack} className="mt-6 text-sm text-[#15110c]/50 transition hover:text-[#e8643c]">Back to my plan →</button>
        </div>
      )}

      <style>{`.ipt{width:100%;border:1px solid rgba(21,17,12,.12);border-radius:12px;padding:10px 12px;font-size:14px;outline:none;background:#fff}.ipt:focus{border-color:#e8643c}`}</style>
    </section>
  );
}

function PayForm({ onPaid, total }: { onPaid: () => void; total: number }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function pay() {
    if (!stripe || !elements) return;
    setBusy(true); setErr(null);
    const { error } = await stripe.confirmPayment({ elements, redirect: "if_required", confirmParams: { return_url: window.location.href } });
    if (error) { setErr(error.message ?? "Payment failed"); setBusy(false); } else onPaid();
  }
  return (
    <div>
      <PaymentElement options={{ defaultValues: { billingDetails: { address: { country: "ID" } } } }} />
      {err && <p className="mt-2 text-xs text-[#e8643c]">{err}</p>}
      <button onClick={pay} disabled={!stripe || busy} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#e8643c] px-5 py-3.5 text-sm font-semibold text-white transition active:scale-[0.98] hover:bg-[#d4502a] disabled:opacity-70">{busy ? <><Spin /> Processing…</> : <>Pay ${total.toLocaleString()}</>}</button>
    </div>
  );
}
function SimPay({ onPaid, total }: { onPaid: () => void; total: number }) {
  const [busy, setBusy] = useState(false);
  async function pay() { setBusy(true); await new Promise((r) => setTimeout(r, 1200)); onPaid(); }
  return (
    <div>
      <div className="flex items-center gap-3 rounded-xl border border-[#15110c]/10 px-4 py-3 text-sm"><span className="text-lg">💳</span><span className="text-[#15110c]/70">Visa •••• 4242</span><span className="ml-auto text-xs text-[#15110c]/40">change</span></div>
      <button onClick={pay} disabled={busy} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#e8643c] px-5 py-3.5 text-sm font-semibold text-white transition active:scale-[0.98] hover:bg-[#d4502a] disabled:opacity-70">{busy ? <><Spin /> Processing…</> : <>Pay ${total.toLocaleString()}</>}</button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-medium text-[#15110c]/50">{label}</span>{children}</label>;
}
function Line({ label, val }: { label: string; val: string }) {
  return <div className="flex items-center justify-between gap-3"><span className="min-w-0 truncate text-[#15110c]/70">{label}</span><span className="shrink-0 font-medium">{val}</span></div>;
}
function FlightLeg({ label, s }: { label: string; s: Slice }) {
  return (
    <div className="mt-2 flex items-center gap-3 text-sm text-[#15110c]/70">
      <span className="w-16 shrink-0 text-xs font-medium uppercase tracking-wide text-[#15110c]/40">{label}</span>
      <span className="font-mono">{s.depart}</span>
      <span className="flex-1 border-t border-dashed border-[#15110c]/20" />
      <span className="text-xs text-[#15110c]/45">{s.dur}{s.stops ? ` · ${s.stops} stop` : " · direct"}</span>
      <span className="flex-1 border-t border-dashed border-[#15110c]/20" />
      <span className="font-mono">{s.arrive}</span>
    </div>
  );
}
function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col items-center justify-center gap-3 py-20 text-sm text-[#15110c]/55"><Spin big />{children}</div>;
}
function Spin({ big }: { big?: boolean }) {
  return <span className={`${big ? "h-6 w-6" : "h-4 w-4"} animate-spin rounded-full border-2 border-[#e8643c]/30 border-t-[#e8643c]`} />;
}
