"use client";

import { useEffect, useState } from "react";
import type { Trip, Day } from "@/lib/itinerary";
import { guessIata, plusDays, flightsUrl, hotelUrl } from "@/lib/booking-links";

// v1 booking: honest hand-off to real booking sites with the trip pre-filled.
// Real in-app ticketing (Duffel/LiteAPI/Stripe) is the gated v2 build.

export default function Booking({ trip, days, onBack }: { trip: Trip; days: Day[]; onBack: () => void }) {
  const [origin, setOrigin] = useState("");
  const [originLabel, setOriginLabel] = useState("");
  const [destination, setDestination] = useState(guessIata(trip.destination));
  const [destLabel, setDestLabel] = useState(guessIata(trip.destination) ? `${trip.destination} (${guessIata(trip.destination)})` : "");
  const [departDate, setDepart] = useState(plusDays(30));
  const [returnDate, setReturn] = useState(plusDays(30 + Math.min(trip.days, 21)));
  const adults = Math.max(1, trip.party);

  useEffect(() => {
    if (destination) return;
    fetch(`/api/airports?q=${encodeURIComponent(trip.destination)}`).then((r) => r.json()).then((d) => {
      const a = d.results?.[0];
      if (a) { setDestination(a.iata); setDestLabel(`${a.city} (${a.iata})`); }
    }).catch(() => {});
  }, [destination, trip.destination]);

  // Unique hotels from the plan, in order.
  const hotels = Array.from(new Map(days.map((d) => [d.hotel.name, { name: d.hotel.name, city: d.city }])).values());
  const ready = /^[A-Z]{3}$/.test(origin) && /^[A-Z]{3}$/.test(destination);

  return (
    <section className="mx-auto max-w-2xl px-6 pb-24 pt-4 animate-fade">
      <div className="mb-5 flex items-center justify-between">
        <button onClick={onBack} className="text-sm text-[#15110c]/50 transition hover:text-[#e8643c]">← Back to plan</button>
        <span className="text-xs text-[#15110c]/40">Booking · {trip.destination}</span>
      </div>

      <h2 className="text-2xl font-semibold tracking-tight">Book your {trip.days}-day {trip.destination} trip</h2>
      <p className="mt-1 text-sm text-[#15110c]/55">We send you straight to trusted sites with live prices, your trip pre-filled. In-app booking is coming soon.</p>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <AirportInput label="Flying from" initial={originLabel} onSelect={(iata, d) => { setOrigin(iata); setOriginLabel(d); }} />
        <AirportInput label="Going to" initial={destLabel} onSelect={(iata, d) => { setDestination(iata); setDestLabel(d); }} />
        <Field label="Depart"><input type="date" value={departDate} onChange={(e) => setDepart(e.target.value)} className="ipt" /></Field>
        <Field label="Return"><input type="date" value={returnDate} onChange={(e) => setReturn(e.target.value)} className="ipt" /></Field>
      </div>

      {/* Flights */}
      <div className="mt-6 rounded-2xl border border-[#15110c]/10 bg-white p-5">
        <div className="flex items-center gap-2 font-semibold">✈️ Flights</div>
        <p className="mt-1 text-sm text-[#15110c]/55">{ready ? `${origin} → ${destination}, ${adults} traveller${adults > 1 ? "s" : ""}` : "Pick your airports above"}</p>
        <a
          href={ready ? flightsUrl(origin, destination, departDate, returnDate, adults) : undefined}
          target="_blank"
          rel="noreferrer"
          aria-disabled={!ready}
          className={`mt-3 inline-block rounded-xl px-5 py-3 text-sm font-semibold text-white transition ${ready ? "bg-[#e8643c] hover:bg-[#d4502a] active:scale-95" : "cursor-not-allowed bg-[#e8643c]/40"}`}
        >
          Search flights on Skyscanner ↗
        </a>
      </div>

      {/* Hotels from the actual plan */}
      <div className="mt-4 rounded-2xl border border-[#15110c]/10 bg-white p-5">
        <div className="flex items-center gap-2 font-semibold">🏨 The hotels in your plan</div>
        <p className="mt-1 text-sm text-[#15110c]/55">Book the exact stays from your itinerary, your dates pre-filled.</p>
        <ul className="mt-3 space-y-2">
          {hotels.map((h) => (
            <li key={h.name} className="flex items-center justify-between gap-3 rounded-xl border border-[#15110c]/10 bg-[#faf7f2] px-4 py-2.5 text-sm">
              <span className="min-w-0 truncate">{h.name} <span className="text-[#15110c]/45">· {h.city}</span></span>
              <a href={hotelUrl(`${h.name} ${h.city}`, departDate, returnDate, adults)} target="_blank" rel="noreferrer" className="shrink-0 font-medium text-[#e8643c] underline-offset-2 hover:underline">Book ↗</a>
            </li>
          ))}
        </ul>
        <a href={hotelUrl(trip.destination, departDate, returnDate, adults)} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-medium text-[#15110c]/60 underline-offset-2 hover:text-[#e8643c] hover:underline">Or browse all hotels in {trip.destination} ↗</a>
      </div>

      <p className="mt-6 text-center text-xs text-[#15110c]/40">Booking happens on Skyscanner and Booking.com. We never see your card. In-app one-click booking is on the way.</p>

      <style>{`.ipt{width:100%;border:1px solid rgba(21,17,12,.12);border-radius:12px;padding:10px 12px;font-size:14px;outline:none;background:#fff}.ipt:focus{border-color:#e8643c}`}</style>
    </section>
  );
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
