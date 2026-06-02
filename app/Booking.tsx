"use client";

import { useEffect, useState } from "react";
import type { Trip, Day } from "@/lib/itinerary";
import { guessIata, plusDays } from "@/lib/booking-links";

// In-platform booking: real flight (Duffel) and hotel (LiteAPI) search rendered
// inside the app, no external tabs. Browsing, prices, and selection are real and
// live. The final card payment is the one externally-gated step (travel-seller
// accreditation), so we save the picks and are honest about it. No fake tickets.

type Slice = { from: string; to: string; depart: string; arrive: string; dur: string; stops: number };
type Offer = { id: string; airline: string; airlineLogo: string | null; price: string; currency: string; out: Slice; ret: Slice | null };
type Hotel = { id: string; name: string; photo: string | null; stars: number | null; rating: number | null; reviews: number | null; price: number | null; currency: string };

function money(amount: string | number, currency: string) {
  const n = typeof amount === "string" ? Number(amount.replace(/[^\d.]/g, "")) : amount;
  if (!isFinite(n)) return `${currency} ${amount}`;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${currency} ${Math.round(n).toLocaleString()}`;
  }
}

type PickSummary = { label: string; sub: string };

export default function Booking({ trip, days, onBack, onSavePicks }: { trip: Trip; days: Day[]; onBack: () => void; onSavePicks?: (picks: { flight: PickSummary | null; hotel: PickSummary | null }) => Promise<boolean> }) {
  const [origin, setOrigin] = useState("");
  const [originLabel, setOriginLabel] = useState("");
  const [destination, setDestination] = useState(guessIata(trip.destination));
  const [destLabel, setDestLabel] = useState(guessIata(trip.destination) ? `${trip.destination} (${guessIata(trip.destination)})` : "");
  const [departDate, setDepart] = useState(plusDays(30));
  const [returnDate, setReturn] = useState(plusDays(30 + Math.min(trip.days, 21)));
  const adults = Math.max(1, trip.party);

  const [flights, setFlights] = useState<{ loading: boolean; offers: Offer[]; source: string; error: string }>({ loading: false, offers: [], source: "", error: "" });
  const [hotels, setHotels] = useState<{ loading: boolean; list: Hotel[]; source: string; error: string }>({ loading: false, list: [], source: "", error: "" });
  const [pickedFlight, setPickedFlight] = useState<Offer | null>(null);
  const [pickedHotel, setPickedHotel] = useState<Hotel | null>(null);
  const [reserved, setReserved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function reserve() {
    if (saving) return;
    setSaving(true);
    const picks = {
      flight: pickedFlight ? { label: `${pickedFlight.airline} ${money(pickedFlight.price, pickedFlight.currency)}`, sub: `${pickedFlight.out.from} → ${pickedFlight.out.to} · ${pickedFlight.out.depart}–${pickedFlight.out.arrive}` } : null,
      hotel: pickedHotel ? { label: `${pickedHotel.name}${pickedHotel.price != null ? ` ${money(pickedHotel.price, pickedHotel.currency)}` : ""}`, sub: `${trip.days} nights` } : null,
    };
    const ok = onSavePicks ? await onSavePicks(picks) : true;
    setSaving(false);
    if (ok) setReserved(true);
  }

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
      if (d.error) setFlights({ loading: false, offers: [], source: "", error: d.error });
      else setFlights({ loading: false, offers: d.offers ?? [], source: d.source ?? "", error: "" });
    } catch {
      setFlights({ loading: false, offers: [], source: "", error: "Could not load flights. Try again." });
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

  // Hotels need no origin, so load them as soon as we're on this page.
  useEffect(() => { searchHotels(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  // Auto-search flights once both airports are set.
  useEffect(() => { if (ready) searchFlights(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [ready, departDate, returnDate]);

  if (reserved) return <Reserved trip={trip} flight={pickedFlight} hotel={pickedHotel} onBack={() => setReserved(false)} />;

  return (
    <section className="mx-auto max-w-2xl px-6 pb-40 pt-4 animate-fade">
      <div className="mb-5 flex items-center justify-between">
        <button onClick={onBack} className="text-sm text-[#15110c]/50 transition hover:text-[#e8643c]">← Back to plan</button>
        <span className="text-xs text-[#15110c]/40">Booking · {trip.destination}</span>
      </div>

      <h2 className="text-2xl font-semibold tracking-tight">Book your {trip.days}-day {trip.destination} trip</h2>
      <p className="mt-1 text-sm text-[#15110c]/55">Live flight and hotel prices, right here. Pick what you want, no new tabs.</p>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <AirportInput label="Flying from" initial={originLabel} onSelect={(iata, d) => { setOrigin(iata); setOriginLabel(d); }} />
        <AirportInput label="Going to" initial={destLabel} onSelect={(iata, d) => { setDestination(iata); setDestLabel(d); }} />
        <Field label="Depart"><input type="date" value={departDate} onChange={(e) => setDepart(e.target.value)} className="ipt" /></Field>
        <Field label="Return"><input type="date" value={returnDate} onChange={(e) => setReturn(e.target.value)} className="ipt" /></Field>
      </div>

      {/* Flights */}
      <div className="mt-6">
        <div className="flex items-center justify-between">
          <div className="font-semibold">✈️ Flights {flights.source === "demo" && <SampleTag />}</div>
          {ready && !flights.loading && <button onClick={searchFlights} className="text-xs font-medium text-[#e8643c] hover:underline">Refresh</button>}
        </div>
        {!ready ? (
          <Empty>Pick your departure airport to see live fares.</Empty>
        ) : flights.loading ? (
          <Loading label="Finding flights" />
        ) : flights.error ? (
          <ErrorBox msg={flights.error} onRetry={searchFlights} />
        ) : (
          <div className="mt-3 space-y-2">
            {flights.offers.map((o) => (
              <button
                key={o.id}
                onClick={() => setPickedFlight((p) => (p?.id === o.id ? null : o))}
                className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${pickedFlight?.id === o.id ? "border-[#e8643c] bg-[#e8643c]/5 ring-1 ring-[#e8643c]" : "border-[#15110c]/10 bg-white hover:border-[#15110c]/25"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {o.airlineLogo ? <img src={o.airlineLogo} alt={o.airline} className="h-7 w-7 rounded object-contain" /> : <span className="grid h-7 w-7 place-items-center rounded bg-[#15110c]/5 text-xs">✈️</span>}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{o.airline}</div>
                  <div className="text-xs text-[#15110c]/55">{o.out.depart}–{o.out.arrive} · {o.out.dur} · {o.out.stops === 0 ? "nonstop" : `${o.out.stops} stop${o.out.stops > 1 ? "s" : ""}`}{o.ret ? " · round trip" : ""}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-semibold">{money(o.price, o.currency)}</div>
                  <div className="text-[10px] text-[#15110c]/45">{pickedFlight?.id === o.id ? "selected" : "select"}</div>
                </div>
              </button>
            ))}
            {!flights.offers.length && <Empty>No flights found for these dates. Try different ones.</Empty>}
          </div>
        )}
      </div>

      {/* Hotels */}
      <div className="mt-8">
        <div className="flex items-center justify-between">
          <div className="font-semibold">🏨 Hotels in {trip.destination} {hotels.source === "demo" && <SampleTag />}</div>
          {!hotels.loading && <button onClick={searchHotels} className="text-xs font-medium text-[#e8643c] hover:underline">Refresh</button>}
        </div>
        {hotels.loading ? (
          <Loading label="Finding hotels" />
        ) : hotels.error ? (
          <ErrorBox msg={hotels.error} onRetry={searchHotels} />
        ) : (
          <div className="mt-3 space-y-2">
            {hotels.list.map((h) => (
              <button
                key={h.id}
                onClick={() => setPickedHotel((p) => (p?.id === h.id ? null : h))}
                className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${pickedHotel?.id === h.id ? "border-[#e8643c] bg-[#e8643c]/5 ring-1 ring-[#e8643c]" : "border-[#15110c]/10 bg-white hover:border-[#15110c]/25"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {h.photo ? <img src={h.photo} alt={h.name} className="h-14 w-14 shrink-0 rounded-lg object-cover" /> : <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-[#15110c]/5 text-lg">🏨</span>}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{h.name}</div>
                  <div className="text-xs text-[#15110c]/55">{h.stars ? `${h.stars}★` : ""}{h.rating ? `${h.stars ? " · " : ""}${h.rating}/10${h.reviews ? ` (${h.reviews.toLocaleString()})` : ""}` : ""}</div>
                </div>
                <div className="shrink-0 text-right">
                  {h.price != null ? <div className="text-sm font-semibold">{money(h.price, h.currency)}</div> : <div className="text-xs text-[#15110c]/45">see rates</div>}
                  <div className="text-[10px] text-[#15110c]/45">{pickedHotel?.id === h.id ? "selected" : `${trip.days} nights`}</div>
                </div>
              </button>
            ))}
            {!hotels.list.length && <Empty>No hotels found for these dates.</Empty>}
          </div>
        )}
      </div>

      <p className="mt-8 text-center text-xs text-[#15110c]/40">Prices are live from our flight and hotel partners. Secure in-app payment is the final step, switching on with our booking licence.</p>

      {(pickedFlight || pickedHotel) && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#15110c]/10 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-6 py-3">
            <div className="min-w-0 text-sm">
              <div className="font-semibold">Your picks</div>
              <div className="truncate text-xs text-[#15110c]/55">
                {pickedFlight ? `✈️ ${pickedFlight.airline} ${money(pickedFlight.price, pickedFlight.currency)}` : "no flight yet"}
                {" · "}
                {pickedHotel ? `🏨 ${pickedHotel.name}${pickedHotel.price != null ? ` ${money(pickedHotel.price, pickedHotel.currency)}` : ""}` : "no hotel yet"}
              </div>
            </div>
            <button onClick={reserve} disabled={saving} className="shrink-0 rounded-xl bg-[#e8643c] px-5 py-3 text-sm font-semibold text-white transition active:scale-95 hover:bg-[#d4502a] disabled:opacity-50">{saving ? "Saving…" : "Save my picks →"}</button>
          </div>
        </div>
      )}

      <style>{`.ipt{width:100%;border:1px solid rgba(21,17,12,.12);border-radius:12px;padding:10px 12px;font-size:14px;outline:none;background:#fff}.ipt:focus{border-color:#e8643c}`}</style>
    </section>
  );
}

function Reserved({ trip, flight, hotel, onBack }: { trip: Trip; flight: Offer | null; hotel: Hotel | null; onBack: () => void }) {
  return (
    <section className="mx-auto max-w-xl px-6 pb-24 pt-10 text-center animate-fade">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#1f9d6b]/15 text-2xl">✓</div>
      <h2 className="mt-5 text-2xl font-semibold tracking-tight">Picks saved to your {trip.destination} trip</h2>
      <p className="mx-auto mt-3 max-w-md text-[15px] text-[#15110c]/65">
        Saved to your account, you will find them under My Trips on any device. Secure card payment is the one step we are switching on with our booking licence, and we will email you the moment you can pay and ticket right here.
      </p>
      <div className="mt-6 space-y-2 text-left">
        {flight && (
          <div className="rounded-2xl border border-[#15110c]/10 bg-white p-4 text-sm">
            <div className="font-semibold">✈️ {flight.airline}</div>
            <div className="mt-1 text-xs text-[#15110c]/55">{flight.out.from} → {flight.out.to} · {flight.out.depart}–{flight.out.arrive} · {money(flight.price, flight.currency)}</div>
          </div>
        )}
        {hotel && (
          <div className="rounded-2xl border border-[#15110c]/10 bg-white p-4 text-sm">
            <div className="font-semibold">🏨 {hotel.name}</div>
            <div className="mt-1 text-xs text-[#15110c]/55">{trip.days} nights{hotel.price != null ? ` · ${money(hotel.price, hotel.currency)}` : ""}</div>
          </div>
        )}
      </div>
      <button onClick={onBack} className="mt-7 text-sm text-[#15110c]/50 transition hover:text-[#e8643c]">← Back to options</button>
    </section>
  );
}

function SampleTag() {
  return <span className="ml-1 rounded-full bg-[#15110c]/8 px-2 py-0.5 text-[10px] font-medium text-[#15110c]/55">sample · connect key for live</span>;
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="mt-3 rounded-2xl border border-dashed border-[#15110c]/15 bg-[#faf7f2] px-4 py-6 text-center text-sm text-[#15110c]/50">{children}</div>;
}
function Loading({ label }: { label: string }) {
  return (
    <div className="mt-3 space-y-2">
      {[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-[#15110c]/5" />)}
      <p className="text-center text-xs text-[#15110c]/40">{label}…</p>
    </div>
  );
}
function ErrorBox({ msg, onRetry }: { msg: string; onRetry: () => void }) {
  return (
    <div className="mt-3 rounded-2xl border border-[#e8643c]/25 bg-[#e8643c]/5 px-4 py-4 text-sm text-[#15110c]/70">
      {msg} <button onClick={onRetry} className="font-medium text-[#e8643c] hover:underline">Retry</button>
    </div>
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
