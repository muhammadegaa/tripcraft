"use client";

import { useState } from "react";
import type { Trip } from "@/lib/itinerary";

type Slice = { from: string; to: string; depart: string; arrive: string; dur: string; stops: number };
type Offer = { id: string; airline: string; price: string; currency: string; expiresAt: string | null; out: Slice; ret: Slice | null };
type Pax = { id: string; given_name: string; family_name: string };
type Step = "form" | "searching" | "offers" | "passengers" | "booking" | "done";

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
function plusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function money(amount: string, currency: string) {
  const n = Number(amount);
  if (!isFinite(n)) return `${currency} ${amount}`;
  return `${currency} ${n.toLocaleString()}`;
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
  const [selected, setSelected] = useState<Offer | null>(null);
  const [pax, setPax] = useState<Pax[]>([]);
  const [contactEmail, setContactEmail] = useState(email ?? "");
  const [ref, setRef] = useState<string | null>(null);

  async function search() {
    setError(null);
    if (!/^[A-Za-z]{3}$/.test(origin) || !/^[A-Za-z]{3}$/.test(destination)) {
      setError("Enter 3-letter airport codes (e.g. CGK, TYO).");
      return;
    }
    setStep("searching");
    try {
      const res = await fetch("/api/flights/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ origin, destination, departDate, returnDate, adults }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); setStep("form"); return; }
      setOffers(data.offers || []);
      setPaxIds(data.passengers || [{ id: "p1" }]);
      setStep("offers");
    } catch {
      setError("Could not reach the flight search. Try again.");
      setStep("form");
    }
  }

  function choose(o: Offer) {
    setSelected(o);
    const ids = paxIds.length ? paxIds : Array.from({ length: adults }, (_, i) => ({ id: `p${i + 1}` }));
    setPax(ids.map((p) => ({ id: p.id, given_name: "", family_name: "" })));
    setStep("passengers");
  }

  async function confirm() {
    if (!selected) return;
    if (pax.some((p) => !p.given_name.trim() || !p.family_name.trim())) { setError("Add every traveller's name."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) { setError("Add a contact email."); return; }
    setError(null);
    setStep("booking");
    try {
      const res = await fetch("/api/flights/order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ offerId: selected.id, amount: selected.price, currency: selected.currency, email: contactEmail, passengers: pax }),
      });
      const data = await res.json();
      if (!data.ok) { setError(data.error || "Booking failed. Try another flight."); setStep("passengers"); return; }
      setRef(data.bookingReference);
      setStep("done");
    } catch {
      setError("Booking failed. Try again.");
      setStep("passengers");
    }
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
          <h2 className="text-2xl font-semibold tracking-tight">Book your flights</h2>
          <p className="mt-1 text-sm text-[#15110c]/55">Live fares for your dates. We&apos;ll line up hotels next.</p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <Field label="From (airport)"><input value={origin} onChange={(e) => setOrigin(e.target.value.toUpperCase())} maxLength={3} className="ipt" /></Field>
            <Field label="To (airport)"><input value={destination} onChange={(e) => setDestination(e.target.value.toUpperCase())} maxLength={3} placeholder="e.g. TYO" className="ipt" /></Field>
            <Field label="Depart"><input type="date" value={departDate} onChange={(e) => setDepart(e.target.value)} className="ipt" /></Field>
            <Field label="Return"><input type="date" value={returnDate} onChange={(e) => setReturn(e.target.value)} className="ipt" /></Field>
          </div>
          <p className="mt-2 text-xs text-[#15110c]/40">{adults} traveller{adults > 1 ? "s" : ""}, economy</p>
          <button onClick={search} className="mt-5 w-full rounded-xl bg-[#e8643c] px-5 py-3.5 text-sm font-semibold text-white transition active:scale-[0.98] hover:bg-[#d4502a]">Search flights</button>
        </div>
      )}

      {step === "searching" && <Center>Searching live fares…</Center>}

      {step === "offers" && (
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{offers.length} flights, {origin} ↔ {destination}</h2>
          <div className="mt-5 space-y-3">
            {offers.map((o) => (
              <button key={o.id} onClick={() => choose(o)} className="block w-full rounded-2xl border border-[#15110c]/10 bg-white p-4 text-left transition hover:border-[#e8643c] hover:shadow-[0_12px_40px_-18px_rgba(0,0,0,0.2)]">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{o.airline}</span>
                  <span className="text-lg font-semibold">{money(o.price, o.currency)}</span>
                </div>
                <FlightLeg label="Outbound" s={o.out} />
                {o.ret && <FlightLeg label="Return" s={o.ret} />}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === "passengers" && selected && (
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Who&apos;s flying?</h2>
          <p className="mt-1 text-sm text-[#15110c]/55">{selected.airline} · {money(selected.price, selected.currency)} · names must match passports.</p>
          <div className="mt-5 space-y-4">
            {pax.map((p, i) => (
              <div key={p.id} className="grid grid-cols-2 gap-3">
                <Field label={`Traveller ${i + 1} given name`}><input value={p.given_name} onChange={(e) => setPax((a) => a.map((x, j) => (j === i ? { ...x, given_name: e.target.value } : x)))} className="ipt" /></Field>
                <Field label="Family name"><input value={p.family_name} onChange={(e) => setPax((a) => a.map((x, j) => (j === i ? { ...x, family_name: e.target.value } : x)))} className="ipt" /></Field>
              </div>
            ))}
            <Field label="Contact email"><input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="you@email.com" className="ipt" /></Field>
          </div>
          <button onClick={confirm} className="mt-5 w-full rounded-xl bg-[#e8643c] px-5 py-3.5 text-sm font-semibold text-white transition active:scale-[0.98] hover:bg-[#d4502a]">Confirm and book — {money(selected.price, selected.currency)}</button>
          <p className="mt-2 text-center text-xs text-[#15110c]/40">Sandbox booking. No real charge.</p>
        </div>
      )}

      {step === "booking" && <Center>Ticketing your flights…</Center>}

      {step === "done" && (
        <div className="text-center">
          <svg width="56" height="56" viewBox="0 0 24 24" className="mx-auto animate-pop"><circle cx="12" cy="12" r="11" fill="#1f9d6b" /><path className="check-path" d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <h2 className="mt-5 text-3xl font-semibold tracking-tight">Flights booked.</h2>
          <p className="mt-2 text-[#15110c]/65">Your booking reference</p>
          <div className="mx-auto mt-2 w-fit rounded-xl bg-[#15110c] px-5 py-2 font-mono text-lg font-semibold tracking-widest text-white">{ref}</div>
          <p className="mx-auto mt-4 max-w-sm text-sm text-[#15110c]/55">{selected?.airline}, {origin} ↔ {destination}, for {pax.length} traveller{pax.length > 1 ? "s" : ""}. Your seats are held. Hotels for your itinerary are next.</p>
          <button onClick={onBack} className="mt-6 text-sm text-[#15110c]/50 transition hover:text-[#e8643c]">Back to my plan →</button>
        </div>
      )}

      <style>{`.ipt{width:100%;border:1px solid rgba(21,17,12,.12);border-radius:12px;padding:10px 12px;font-size:14px;outline:none;background:#fff}.ipt:focus{border-color:#e8643c}`}</style>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[#15110c]/50">{label}</span>
      {children}
    </label>
  );
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
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-sm text-[#15110c]/55">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-[#e8643c]/30 border-t-[#e8643c]" />
      {children}
    </div>
  );
}
