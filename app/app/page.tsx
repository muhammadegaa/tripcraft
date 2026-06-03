"use client";

import { useEffect, useRef, useState } from "react";
import { config } from "@/lib/config";
import { burstConfetti } from "@/lib/confetti";
import { saveTrip, saveLead, onAuthChange, signInWithGoogle, signOutUser, listTrips, type TripUser } from "@/lib/firebase";
import { CurrencyProvider, useCurrency } from "@/app/currency";
import { CURRENCIES, parseAmount } from "@/lib/currency";
import { GalleryProvider, useGallery } from "@/app/Lightbox";
import { track as vaTrack } from "@vercel/analytics";
import Booking from "@/app/Booking";
import {
  parseTrip,
  generate,
  GENERATING_STEPS,
  type Trip,
  type Day,
  type Hotel,
  type Ticket,
  type Stop,
} from "@/lib/itinerary";

const TEMPLATES = [
  { label: "🇮🇹 Italy, art & coast", prompt: "10 days in Italy in May, 2 people, around €4,500. Rome, Florence, then the Amalfi coast. We love art, long lunches, and walkable old towns. No more than one big move every three days." },
  { label: "🇯🇵 Japan, food & rail", prompt: "14 days in Japan in November, 2 people, around $4,500. We live for food: ramen, sushi, markets. Hotels a short walk from the station, and no train ride over 2 hours." },
  { label: "🇹🇭 Thailand islands", prompt: "9 days in Thailand, a couple, about $2,500. Two nights in Bangkok, then island-hopping. Beaches, street food, easy ferries, no early-morning flights." },
  { label: "🇵🇹 Portugal road trip", prompt: "8 days in Portugal in spring, 2 people, around €3,000. Lisbon, Sintra, and the Algarve by car. Seafood, viewpoints, walkable towns, no drive over 2 hours." },
  { label: "🇰🇷 Seoul + Busan", prompt: "6 days in South Korea, 2 friends, about $1,800. Seoul then Busan by KTX. Korean BBQ, cafes, palaces, hotels right by the subway." },
  { label: "👨‍👩‍👧 Family Europe", prompt: "7 days in Europe with two kids (6 and 9), around €6,000. Easy pace, a castle or a theme park, kid-friendly food, central hotels, short transfers only." },
];

type Phase = "input" | "generating" | "plan" | "live" | "reserved" | "booking" | "trips";
type TripBooking = {
  destination: string;
  flight: { ref: string; airline: string; route: string; times: string; price: number; currency: string } | null;
  hotel: { id: string; name: string; nights: number; price: number; currency: string } | null;
  totalDisplay: string;
  emailedTo: string | null;
  receiptUrl?: string | null;
};
type SavedTrip = { id: string; trip?: Trip; days?: Day[]; status?: string; booking?: TripBooking; updatedAt?: unknown };
type Msg = { id: number; role: "user" | "agent"; text?: string; steps?: string[]; pending?: boolean };
type Toast = { id: number; text: string; icon: string };
type Profile = { pace: string | null; interests: string[]; mustHaves: string[] };

const PACES = ["Chill", "Balanced", "Packed"];
const INTERESTS = ["Food", "Culture", "Nature", "Nightlife", "Shopping", "Relax"];
const MUSTHAVES = ["Halal food", "Vegetarian", "Kid-friendly", "Accessible"];

function profileToText(p: Profile | null): string {
  if (!p) return "";
  const parts: string[] = [];
  if (p.pace) parts.push(`a ${p.pace.toLowerCase()} pace`);
  if (p.interests.length) parts.push(`really into ${p.interests.join(", ").toLowerCase()}`);
  if (p.mustHaves.length) parts.push(`must-haves: ${p.mustHaves.join(", ").toLowerCase()}`);
  return parts.length ? `About how we travel: ${parts.join("; ")}. Tailor the plan to this.` : "";
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function track(event: string, data?: Record<string, unknown>) {
  // Vercel Analytics custom events — queryable in the Analytics tab (prod only).
  try {
    vaTrack(event, data as Record<string, string | number | boolean | null>);
  } catch {
    /* no-op */
  }
}
function toMin(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function addMin(t: string, mins: number) {
  const v = toMin(t) + mins;
  return `${String(Math.floor(v / 60) % 24).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
}
function newId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `t_${Date.now()}`;
  }
}
// In-platform interactive maps. Keyless Google Maps embed renders a real,
// pannable map inside an iframe (no new tab, no API key). `q` for a single
// place, `saddr`/`daddr` (with +to: waypoints) for a walking route.
function placeEmbedUrl(place: string) {
  return `https://maps.google.com/maps?q=${encodeURIComponent(place)}&z=15&output=embed`;
}
function routeEmbedUrl(origin: string, points: string[]) {
  const daddr = points.map(encodeURIComponent).join("+to:");
  return `https://maps.google.com/maps?saddr=${encodeURIComponent(origin)}&daddr=${daddr}&output=embed`;
}

export default function Page() {
  const [phase, setPhase] = useState<Phase>("input");
  const [input, setInput] = useState("");
  const [trip, setTrip] = useState<Trip | null>(null);
  const [days, setDays] = useState<Day[]>([]);
  const [pendingDays, setPendingDays] = useState<Day[] | null>(null);
  const [planSource, setPlanSource] = useState<string>("claude");
  const [step, setStep] = useState(0);
  const [tripId, setTripId] = useState<string>("");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [reserveOpen, setReserveOpen] = useState(false);
  const [reservedEmail, setReservedEmail] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [onboarded, setOnboarded] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [improving, setImproving] = useState(false);
  const [user, setUser] = useState<TripUser | null>(null);
  const [trips, setTrips] = useState<SavedTrip[]>([]);
  const [tripsLoading, setTripsLoading] = useState(false);
  const idRef = useRef(1);
  const nextId = () => idRef.current++;

  useEffect(() => onAuthChange(setUser), []);

  // Deep link from the plan email: /?book=1&dest=...&days=...&party=... opens the
  // in-app booking page directly (live flights + hotels), no external tabs.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    if (!sp.get("book")) return;
    const dest = (sp.get("dest") || "").trim();
    if (!dest) return;
    const d = Math.max(1, Number(sp.get("days")) || 4);
    const party = Math.max(1, Number(sp.get("party")) || 2);
    setTrip(parseTrip(`${d} days in ${dest}, ${party} people`));
    setDays([]);
    setTripId(newId());
    setOnboarded(true);
    setPhase("booking");
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  async function signIn(): Promise<TripUser | null> {
    const u = await signInWithGoogle();
    if (u) { track("sign_in"); pushToast(`Signed in as ${u.name ?? u.email ?? "you"}`, "👋"); }
    return u;
  }
  async function signOut() {
    await signOutUser();
    setTrips([]);
    pushToast("Signed out", "👋");
  }
  async function openTrips() {
    if (!user) { await signIn(); return; }
    track("open_trips");
    setPhase("trips");
    setTripsLoading(true);
    setTrips((await listTrips(user.uid)) as SavedTrip[]);
    setTripsLoading(false);
  }
  // Persist a completed booking onto the trip so the confirmation + numbers show
  // up in My Trips. Best effort: saves only if signed in (booking still works
  // for guests via the email confirmation).
  function saveBooking(b: { confirmation: TripBooking; status: string }) {
    const id = tripId || newId();
    if (!tripId) setTripId(id);
    saveTrip(id, { trip, status: b.status, booking: b.confirmation });
    track("booking_completed", { destination: trip?.destination ?? "" });
  }

  function openSavedTrip(t: SavedTrip) {
    if (!t.trip || !t.days) return;
    setTrip(t.trip);
    setDays(t.days);
    setTripId(t.id);
    setOnboarded(true);
    track("reopen_trip", { destination: t.trip.destination });
    setPhase("plan");
  }

  function pushToast(text: string, icon = "✓") {
    const id = nextId();
    setToasts((t) => [...t, { id, text, icon }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }

  async function improveBrief() {
    const text = input.trim();
    if (text.length < 3 || improving) return;
    setImproving(true);
    track("improve_used");
    try {
      const res = await fetch("/api/improve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: text }),
      });
      const data = await res.json();
      if (data?.improved) {
        setInput(data.improved);
        pushToast("Sharpened your trip. Tweak anything", "✨");
      }
    } catch {
      /* leave input as-is */
    } finally {
      setImproving(false);
    }
  }

  async function handleGenerate() {
    if (input.trim().length < 8) return;
    // Gate: planning requires a real account, so trips are saved to a person
    // and we know who we are building for.
    if (!user) {
      track("generate_signin_gate");
      const u = await signIn();
      if (!u) { pushToast("Sign in to build and save your plan", "🔒"); return; }
    }
    if (!onboarded) {
      track("onboarding_open");
      setProfileOpen(true);
      return;
    }
    runGeneration(profile);
  }

  function submitProfile(p: Profile) {
    setProfile(p);
    setOnboarded(true);
    setProfileOpen(false);
    track("onboarding_done", { pace: p.pace, interests: p.interests.length, mustHaves: p.mustHaves.length });
    runGeneration(p);
  }
  function skipProfile() {
    setOnboarded(true);
    setProfileOpen(false);
    track("onboarding_skipped");
    runGeneration(null);
  }

  async function runGeneration(p: Profile | null) {
    const text = input.trim();
    const t = parseTrip(text);
    const id = newId();
    setTrip(t);
    setTripId(id);
    setStep(0);
    setPendingDays(null);
    setPhase("generating");
    const ptext = profileToText(p);
    track("generate_started", { destination: t.destination, days: t.days, profiled: !!ptext });
    const brief = ptext ? `${text}\n\n${ptext}` : text;
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: brief }),
      });
      const data = await res.json();
      // "claude" is a live, made-for-you plan. "canned" (no key) and "fallback"
      // (AI credits exhausted) render a sample itinerary so the full flow stays
      // demonstrable end to end, clearly flagged as a sample in the UI, never
      // passed off as a live generation.
      if (data?.days?.length && ["claude", "canned", "fallback"].includes(data.source)) {
        setPlanSource(data.source);
        setPendingDays(data.days);
      } else if (data?.source === "rate_limited") {
        track("generate_rate_limited");
        pushToast("A bit too many requests. Give it a minute and try again.", "⚠️");
        setPhase("input");
      } else {
        track("generate_failed", { source: data?.source });
        pushToast("We couldn't build your plan right now. Please try again in a moment.", "⚠️");
        setPhase("input");
      }
    } catch {
      track("generate_error");
      pushToast("Something went wrong building your plan. Please try again.", "⚠️");
      setPhase("input");
    }
  }

  useEffect(() => {
    if (phase !== "generating") return;
    if (step < GENERATING_STEPS.length) {
      const t = setTimeout(() => setStep((s) => s + 1), 2200);
      return () => clearTimeout(t);
    }
    if (pendingDays && trip) {
      setDays(pendingDays);
      saveTrip(tripId, { input, trip, days: pendingDays, status: "planned", profile });
      track("plan_viewed", { destination: trip.destination });
      setPhase("plan");
    }
  }, [phase, step, pendingDays, trip, tripId, input]);

  function openReserve() {
    track("reserve_open");
    setReserveOpen(true);
  }
  function goBooking() {
    track("booking_open", { destination: trip?.destination ?? "" });
    setPhase("booking");
  }

  async function submitReserve(email: string) {
    const persisted = await saveLead(email, {
      destination: trip?.destination,
      days: trip?.days,
      party: trip?.party,
      budget: trip?.budget,
      tripText: trip?.raw,
      tripId,
      status: "reserved",
    });
    track("reserved", { persisted, destination: trip?.destination ?? "" });
    saveTrip(tripId, { status: "reserved", leadEmail: email.toLowerCase() });
    // Send the traveler their plan (server-side via Resend). Fire-and-forget.
    try {
      fetch("/api/reserve-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, destination: trip?.destination, days, party: trip?.party }),
      });
    } catch {
      /* email is best-effort; the lead is already saved */
    }
    setReservedEmail(email);
    setReserveOpen(false);
    setPhase("reserved");
    setTimeout(burstConfetti, 250);
  }

  function shareTrip() {
    track("share_click");
    const url = typeof window !== "undefined" ? window.location.origin : "";
    const text = `I just planned my ${trip?.destination ?? "trip"} on Tripcraft. Describe your trip and it builds the whole thing, with real places, photos and directions. Try it:`;
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator.share({ title: "Tripcraft", text, url }).catch(() => {});
    } else if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(`${text} ${url}`).then(() => pushToast("Link copied, go share it", "🔗"));
    }
  }

  function restart() {
    setPhase("input");
    setInput("");
    setReservedEmail("");
  }

  return (
    <CurrencyProvider>
    <GalleryProvider>
    <main className="min-h-screen bg-[#faf7f2] text-[#15110c]">
      <Nav user={user} onSignIn={signIn} onSignOut={signOut} onMyTrips={openTrips} onHome={restart} />

      {phase === "input" && (
        <div className="animate-fade">
          <Hero input={input} setInput={setInput} onGenerate={handleGenerate} onImprove={improveBrief} improving={improving} signedIn={!!user} />
          <HowItWorks />
        </div>
      )}
      {phase === "generating" && <Generating step={step} trip={trip!} />}
      {phase === "plan" && (
        <Plan trip={trip!} days={days} demo={planSource !== "claude"} onBooking={goBooking} onReserve={openReserve} onRestart={restart} />
      )}
      {phase === "booking" && (
        <Booking trip={trip!} days={days} onBack={() => setPhase("plan")} onBooked={saveBooking} />
      )}
      {phase === "trips" && (
        <TripsDashboard trips={trips} loading={tripsLoading} onOpen={openSavedTrip} onNew={restart} />
      )}
      {phase === "reserved" && (
        <Reserved trip={trip!} days={days} email={reservedEmail} onShare={shareTrip} onRestart={restart} />
      )}

      {profileOpen && <ProfileModal onSubmit={submitProfile} onSkip={skipProfile} />}
      {reserveOpen && <ReserveSheet destination={trip?.destination} onSubmit={submitReserve} onClose={() => setReserveOpen(false)} />}
      <Toaster toasts={toasts} />
      <Footer />
    </main>
    </GalleryProvider>
    </CurrencyProvider>
  );
}

function CurrencySelect() {
  const { currency, setCurrency } = useCurrency();
  return (
    <label className="relative flex items-center" title="Display currency">
      <select
        value={currency}
        onChange={(e) => setCurrency(e.target.value)}
        className="cursor-pointer appearance-none rounded-full border border-[#15110c]/15 bg-white py-1.5 pl-3 pr-7 text-sm font-medium text-[#15110c]/70 outline-none transition hover:border-[#e8643c]"
      >
        {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
      </select>
      <span className="pointer-events-none absolute right-2.5 text-[10px] text-[#15110c]/40">▾</span>
    </label>
  );
}

/* ─────────────────────────── chrome ─────────────────────────── */

function Nav({ user, onSignIn, onSignOut, onMyTrips, onHome }: { user: TripUser | null; onSignIn: () => void; onSignOut: () => void; onMyTrips: () => void; onHome: () => void }) {
  return (
    <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
      <button onClick={onHome} className="flex items-center gap-2 font-semibold tracking-tight">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#e8643c] text-sm font-bold text-white">{config.brandName.charAt(0)}</span>
        {config.brandName}
      </button>
      <div className="flex items-center gap-3">
        <CurrencySelect />
        {user ? (
          <>
            <button onClick={onMyTrips} className="text-sm font-medium text-[#15110c]/70 transition hover:text-[#e8643c]">My trips</button>
            <button onClick={onSignOut} className="flex items-center gap-2" title="Sign out">
              {user.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.photo} alt="" className="h-7 w-7 rounded-full" referrerPolicy="no-referrer" />
              ) : (
                <span className="grid h-7 w-7 place-items-center rounded-full bg-[#15110c] text-xs font-semibold text-white">{(user.name ?? user.email ?? "?").charAt(0).toUpperCase()}</span>
              )}
            </button>
          </>
        ) : (
          <button onClick={onSignIn} className="rounded-full border border-[#15110c]/15 bg-white px-3.5 py-1.5 text-sm font-medium transition hover:border-[#e8643c] hover:text-[#e8643c]">Sign in</button>
        )}
      </div>
    </header>
  );
}

function statusLabel(s?: string): { text: string; cls: string } {
  switch (s) {
    case "booked": return { text: "Booked", cls: "bg-[#1f9d6b]/10 text-[#1f9d6b]" };
    case "picks_selected": return { text: "Flights + hotel picked", cls: "bg-[#1f9d6b]/10 text-[#1f9d6b]" };
    case "reserved": return { text: "Emailed", cls: "bg-[#e8643c]/10 text-[#e8643c]" };
    default: return { text: "Planned", cls: "bg-[#15110c]/8 text-[#15110c]/60" };
  }
}

function TripsDashboard({ trips, loading, onOpen, onNew }: { trips: SavedTrip[]; loading: boolean; onOpen: (t: SavedTrip) => void; onNew: () => void }) {
  const valid = trips.filter((t) => t.trip && t.days);
  return (
    <section className="mx-auto max-w-3xl px-6 pb-24 pt-4 animate-fade">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-3xl font-semibold tracking-tight">Your trips</h2>
        <button onClick={onNew} className="rounded-xl bg-[#15110c] px-4 py-2.5 text-sm font-semibold text-white transition active:scale-95 hover:bg-[#e8643c]">Plan a new trip</button>
      </div>
      {loading ? (
        <div className="flex justify-center py-20"><span className="h-6 w-6 animate-spin rounded-full border-2 border-[#e8643c]/30 border-t-[#e8643c]" /></div>
      ) : valid.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#15110c]/15 p-10 text-center">
          <p className="text-[#15110c]/60">No saved trips yet. The ones you plan while signed in show up here, ready to pick back up.</p>
          <button onClick={onNew} className="mt-4 rounded-xl bg-[#e8643c] px-5 py-3 text-sm font-semibold text-white transition active:scale-95 hover:bg-[#d4502a]">Plan your first trip</button>
        </div>
      ) : (
        <ol className="stagger space-y-3">
          {valid.map((t) => {
            const st = statusLabel(t.status);
            return (
              <li key={t.id}>
                <button onClick={() => onOpen(t)} className="flex w-full items-center justify-between gap-4 rounded-2xl border border-[#15110c]/10 bg-white p-5 text-left transition hover:border-[#e8643c] hover:shadow-[0_12px_40px_-18px_rgba(0,0,0,0.2)]">
                  <div className="min-w-0">
                    <div className="font-semibold">{t.trip!.days} days in {t.trip!.destination}</div>
                    <div className="mt-1 truncate text-sm text-[#15110c]/55">{t.trip!.party} travellers · {t.trip!.budget} · {(t.days?.length ?? 0)} nights</div>
                    {t.booking && (t.booking.flight || t.booking.hotel) && (
                      <div className="mt-1.5 truncate text-xs text-[#1f9d6b]">
                        {t.booking.flight ? `✈️ ${t.booking.flight.airline} · ${t.booking.flight.ref}` : ""}
                        {t.booking.flight && t.booking.hotel ? " · " : ""}
                        {t.booking.hotel ? `🏨 ${t.booking.hotel.name} · ${t.booking.hotel.id}` : ""}
                      </div>
                    )}
                  </div>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${st.cls}`}>{st.text}</span>
                </button>
                {t.booking?.receiptUrl && (
                  <a href={t.booking.receiptUrl} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1 px-1 text-xs font-medium text-[#15110c]/55 transition hover:text-[#e8643c]">🧾 View Stripe receipt ↗</a>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function Hero({ input, setInput, onGenerate, onImprove, improving, signedIn }: { input: string; setInput: (s: string) => void; onGenerate: () => void; onImprove: () => void; improving: boolean; signedIn: boolean }) {
  const canImprove = input.trim().length >= 3 && !improving;
  return (
    <section className="mx-auto max-w-3xl px-6 pb-10 pt-10 text-center">
      <p className="mb-4 text-sm font-medium text-[#e8643c] animate-rise">Plan any trip, anywhere, in plain words</p>
      <h1 className="text-balance text-4xl font-semibold leading-tight tracking-tight sm:text-[3.4rem] sm:leading-[1.05] animate-rise">
        Your whole trip,<br />planned to the minute.
      </h1>
      <p className="mx-auto mt-5 max-w-xl text-balance text-lg text-[#15110c]/65 animate-rise">
        Tell us where you&apos;re headed, however you&apos;d say it out loud. We turn it into a real day-by-day plan that holds up: stays in the right neighbourhoods, no exhausting travel days, everything inside your budget. Then book every flight and hotel through trusted sites in a couple of taps.
      </p>

      <div className="mt-7 animate-rise">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#15110c]/40">Start from a template</p>
        <div className="flex flex-wrap justify-center gap-2">
          {TEMPLATES.map((t) => (
            <button key={t.label} onClick={() => setInput(t.prompt)} className="rounded-full border border-[#15110c]/12 bg-white px-3 py-1.5 text-sm text-[#15110c]/75 transition active:scale-95 hover:border-[#e8643c] hover:text-[#e8643c]">
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-[#15110c]/10 bg-white p-3 shadow-[0_1px_0_rgba(0,0,0,0.03),0_18px_50px_-18px_rgba(0,0,0,0.22)] animate-rise">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="…or describe your own: 12 days in Portugal, 2 people, €3k, love seafood and clifftop views, walkable towns, no drive over 2 hours"
          rows={4}
          className="w-full resize-none rounded-xl bg-transparent p-3 text-left text-[15px] outline-none placeholder:text-[#15110c]/35"
        />
        <div className="flex flex-wrap items-center justify-between gap-3 px-1 pb-1">
          <button onClick={onImprove} disabled={!canImprove} title="Let AI sharpen your trip into a clear, complete brief" className="rounded-xl border border-[#15110c]/15 px-3.5 py-2.5 text-sm font-medium text-[#15110c] transition active:scale-95 enabled:hover:border-[#e8643c] enabled:hover:text-[#e8643c] disabled:opacity-40">
            {improving ? "✨ Improving…" : "✨ Improve my brief"}
          </button>
          <button onClick={onGenerate} disabled={input.trim().length < 8} className="rounded-xl bg-[#15110c] px-5 py-3 text-sm font-semibold text-white transition active:scale-95 enabled:hover:bg-[#e8643c] disabled:opacity-40">{signedIn ? "See my plan, free →" : "Sign in to plan, free →"}</button>
        </div>
      </div>
      <p className="mt-3 text-xs text-[#15110c]/45 animate-rise">New here? Pick a template, then hit <span className="font-medium text-[#15110c]/70">✨ Improve</span> to shape it, or just type and go.</p>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-[#15110c]/50 animate-rise">
        <span>✓ A real plan in seconds</span>
        <span>✓ Built around your rules</span>
        <span>✓ Anywhere in the world</span>
      </div>
    </section>
  );
}

function Generating({ step, trip }: { step: number; trip: Trip }) {
  const finishing = step >= GENERATING_STEPS.length;
  return (
    <section className="mx-auto max-w-xl px-6 py-16 animate-fade">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-[#e8643c] text-xl text-white animate-ring">✦</div>
        <p className="text-sm text-[#15110c]/55">
          Building {trip.days} days in <span className="font-medium text-[#15110c]">{trip.destination}</span>
        </p>
      </div>
      <ul className="space-y-3">
        {GENERATING_STEPS.map((label, i) => {
          const state = i < step ? "done" : i === step ? "active" : "todo";
          return (
            <li key={label} className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-all duration-300 ${state === "todo" ? "border-[#15110c]/5 text-[#15110c]/30" : "border-[#15110c]/10 bg-white text-[#15110c]"}`}>
              <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] transition ${state === "done" ? "bg-[#1f9d6b] text-white" : state === "active" ? "bg-[#e8643c] text-white animate-pulse" : "bg-[#15110c]/10 text-transparent"}`}>
                {state === "done" ? "✓" : state === "active" ? "•" : ""}
              </span>
              {label}
            </li>
          );
        })}
      </ul>
      {finishing && (
        <div className="mt-4 flex items-center justify-center gap-2 text-sm text-[#15110c]/50">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#e8643c]/30 border-t-[#e8643c]" />
          Putting your day-by-day together…
        </div>
      )}
    </section>
  );
}

/* ─────────────────────────── plan ─────────────────────────── */

function Plan({ trip, days, demo, onBooking, onReserve, onRestart }: {
  trip: Trip; days: Day[]; demo?: boolean; onBooking: () => void; onReserve: () => void; onRestart: () => void;
}) {
  const legs = days.reduce((n, d) => n + d.tickets.length, 0);
  return (
    <section className="mx-auto max-w-3xl px-6 pb-40 pt-4 animate-fade">
      <div className="mb-6 flex items-center justify-between">
        <button onClick={onRestart} className="text-sm text-[#15110c]/50 transition hover:text-[#e8643c]">← Start over</button>
        <span className="text-xs text-[#15110c]/40">Draft · prices are estimates</span>
      </div>
      {demo && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-[#e8643c]/25 bg-[#e8643c]/5 px-4 py-3 text-sm">
          <span className="mt-0.5 shrink-0 rounded-full bg-[#e8643c] px-2 py-0.5 text-[11px] font-semibold text-white">Demo</span>
          <p className="text-[#15110c]/70">This is a <span className="font-medium">sample itinerary</span> so you can walk the full flow. With AI credits connected, this is generated live for your exact brief. Everything after this, places, photos, booking, payment, is real.</p>
        </div>
      )}
      <h2 className="text-3xl font-semibold tracking-tight animate-rise">{trip.days} days in {trip.destination}</h2>
      <p className="mt-2 text-[#15110c]/60 animate-rise">{trip.party} travellers · {trip.budget} · {trip.interests}</p>
      <div className="mt-5 flex flex-wrap gap-2 animate-rise">
        <Badge>✓ {days.length} nights, stays in the right spots</Badge>
        <Badge>✓ {legs} travel legs, all kept short</Badge>
        <Badge>✓ Door-to-door directions</Badge>
      </div>
      <ol className="stagger mt-8 space-y-4">
        {days.map((d) => (
          <PlanDay key={d.n} d={d} />
        ))}
      </ol>
      <button onClick={onReserve} className="mx-auto mt-8 block text-sm text-[#15110c]/45 transition hover:text-[#e8643c]">Not ready to book? Email me this plan instead →</button>
      <StickyBar>
        <div className="text-sm">
          <span className="font-semibold">Ready to make it real?</span>
          <span className="text-[#15110c]/55"> Book your flights now, hotels next.</span>
        </div>
        <button onClick={onBooking} className="rounded-xl bg-[#e8643c] px-5 py-3 text-sm font-semibold text-white transition active:scale-95 hover:bg-[#d4502a]">Continue to booking →</button>
      </StickyBar>
    </section>
  );
}

// Plan prices are generated in USD; show them in the user's chosen currency.
function priceIn(raw: string, show: (amount: number, from: string) => string): string {
  const n = parseAmount(raw);
  return n ? show(n, "USD") : raw;
}

function PlanDay({ d }: { d: Day }) {
  const { show } = useCurrency();
  return (
    <li className="overflow-hidden rounded-2xl border border-[#15110c]/10 bg-white transition hover:shadow-[0_12px_40px_-18px_rgba(0,0,0,0.25)]">
      <div className="flex items-baseline justify-between gap-4 border-b border-[#15110c]/8 px-5 py-3">
        <h3 className="font-semibold">Day {d.n} · {d.city}<span className="font-normal text-[#15110c]/50">, {d.area}</span></h3>
        <span className="shrink-0 text-xs text-[#1f9d6b]">longest leg {d.maxLeg}</span>
      </div>
      <div className="space-y-3 px-5 py-4">
        {d.tickets.map((t, i) => (
          <InfoRow key={i} icon={t.icon} title={t.mode} sub={`${t.from} → ${t.to} · ${t.depart}–${t.arrive} · ${t.dur} · ~${priceIn(t.price, show)}`} flag={t.flag} />
        ))}
        <HotelRow hotel={d.hotel} city={d.city} />
        <ol className="mt-1 space-y-3">
          {d.stops.map((s, i) => (
            <StopRow key={i} stop={s} city={d.city} />
          ))}
        </ol>
        {d.stops.length > 0 && (
          <EmbedMap src={routeEmbedUrl(`${d.hotel.name}, ${d.city}`, d.stops.map((s) => `${s.place}, ${d.city}`))} label={`See the day ${d.n} walking route`} />
        )}
        <p className="pt-1 text-sm text-[#e8643c]">🍜 {d.food}</p>
      </div>
    </li>
  );
}

/* place enrichment: real photo + rating + review via Google Places (graceful) */
type PlaceData = { enabled?: boolean; found?: boolean; rating?: number | null; reviews?: number | null; photoName?: string | null; photoNames?: string[]; review?: { text: string; author: string | null; rating: number | null } | null };
const placeCache = new Map<string, PlaceData>();

function usePlace(place?: string): PlaceData | undefined {
  const [data, setData] = useState<PlaceData | undefined>(() => (place ? placeCache.get(place) : undefined));
  useEffect(() => {
    if (!place) return;
    if (placeCache.has(place)) { setData(placeCache.get(place)); return; }
    let on = true;
    fetch(`/api/place?q=${encodeURIComponent(place)}`)
      .then((r) => r.json())
      .then((d: PlaceData) => { placeCache.set(place, d); if (on) setData(d); })
      .catch(() => {});
    return () => { on = false; };
  }, [place]);
  return data;
}

function PlaceThumb({ place, data, size = "sm" }: { place: string; data?: PlaceData; size?: "sm" | "lg" }) {
  const { open } = useGallery();
  const names = data?.photoNames?.length ? data.photoNames : data?.photoName ? [data.photoName] : [];
  const src = names[0] ? `/api/place-photo?name=${encodeURIComponent(names[0])}` : null;
  const dims = size === "lg" ? "h-24 w-24" : "h-16 w-16";
  const clickable = names.length > 0;

  function openGallery(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!names.length) return;
    open(names.map((n) => `/api/place-photo?name=${encodeURIComponent(n)}&w=1280&h=960`), place);
  }

  return (
    <button
      type="button"
      onClick={openGallery}
      disabled={!clickable}
      aria-label={clickable ? `View photos of ${place}` : place}
      className={`group relative ${dims} shrink-0 overflow-hidden rounded-lg bg-[#15110c]/5 ${clickable ? "cursor-zoom-in" : "cursor-default"}`}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={place} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-lg text-[#15110c]/20">📍</div>
      )}
      {data?.rating ? (
        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-1.5 pb-0.5 pt-3 text-left text-[10px] font-semibold text-white">★ {data.rating}</span>
      ) : null}
      {names.length > 1 ? (
        <span className="absolute right-1 top-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">{names.length} 📷</span>
      ) : null}
    </button>
  );
}

function HotelRow({ hotel, city }: { hotel: Hotel; city: string }) {
  const q = `${hotel.name} ${city}`;
  const d = usePlace(q);
  const { show } = useCurrency();
  return (
    <div className="flex gap-3 rounded-xl border border-[#15110c]/10 bg-[#faf7f2] p-3">
      <PlaceThumb place={q} data={d} size="lg" />
      <div className="min-w-0 flex-1 text-sm">
        <div className="truncate font-medium">🏨 {hotel.name}</div>
        <div className="mt-1 text-xs text-[#15110c]/55">
          {d?.rating ? `★ ${d.rating} (${(d.reviews ?? 0).toLocaleString()})` : `★ ${hotel.rating}`} · {hotel.walk} · ~{priceIn(hotel.price, show)}
        </div>
        {d?.review?.text ? (
          <p className="mt-1.5 line-clamp-2 text-xs italic text-[#15110c]/55">“{d.review.text}”{d.review.author ? `, ${d.review.author}` : ""}</p>
        ) : null}
      </div>
    </div>
  );
}

function StopRow({ stop, city }: { stop: Stop; city: string }) {
  const d = usePlace(stop.place);
  return (
    <li className="flex gap-3">
      <PlaceThumb place={stop.place} data={d} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 text-sm">
          <span className="font-mono text-xs text-[#15110c]/45">{stop.time}</span>
          <span className="font-medium">{stop.title}</span>
          {d?.rating ? <span className="shrink-0 text-xs text-[#15110c]/45">★ {d.rating}</span> : null}
        </div>
        <p className="mt-0.5 text-xs text-[#15110c]/55">↳ {stop.directions}</p>
        {stop.tip && <p className="mt-1 text-xs text-[#15110c]/55">💡 {stop.tip}</p>}
        <EmbedMap src={placeEmbedUrl(`${stop.place}, ${city}`)} />
      </div>
    </li>
  );
}

// Collapsible interactive map embedded in the page. The iframe only mounts when
// opened, so a plan with many stops doesn't load dozens of maps at once.
function EmbedMap({ src, label = "View on map" }: { src: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1.5">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 text-xs font-medium text-[#e8643c] underline-offset-2 hover:underline"
      >
        🗺️ {open ? "Hide map" : label} <span className="text-[10px]">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="mt-2 overflow-hidden rounded-xl border border-[#15110c]/10">
          <iframe
            src={src}
            title={label}
            loading="lazy"
            className="h-56 w-full"
            style={{ border: 0 }}
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        </div>
      )}
    </div>
  );
}

function InfoRow({ icon, title, sub, flag }: { icon: string; title: string; sub: string; flag?: string }) {
  return (
    <div className="rounded-xl border border-[#15110c]/10 bg-[#faf7f2] px-4 py-3">
      <div className="min-w-0 text-sm">
        <div className="truncate font-medium">{icon} {title}</div>
        <div className="mt-1 text-xs text-[#15110c]/55">{sub}</div>
      </div>
      {flag && <div className="mt-1 text-xs text-[#1f9d6b]">✓ {flag}</div>}
    </div>
  );
}

function Sheet({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/30 animate-fade" onClick={onClose} />
      <div className="animate-sheet relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-[#15110c]/10 bg-white p-6 shadow-2xl sm:rounded-3xl">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[#15110c]/15 sm:hidden" />
        {children}
      </div>
    </div>
  );
}

/* ─────────────────────────── primitives ─────────────────────────── */

function StickyBar({ children, narrow }: { children: React.ReactNode; narrow?: boolean }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#15110c]/10 bg-white/85 backdrop-blur">
      <div className={`mx-auto flex ${narrow ? "max-w-2xl" : "max-w-3xl"} flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between`}>{children}</div>
    </div>
  );
}

function Toaster({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="fixed left-1/2 top-5 z-[70] flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <div key={t.id} className="animate-toast flex items-center gap-2 rounded-full bg-[#15110c] px-4 py-2.5 text-sm font-medium text-white shadow-lg">
          <span>{t.icon}</span>{t.text}
        </div>
      ))}
    </div>
  );
}

function SuccessCheck() {
  return (
    <svg width="56" height="56" viewBox="0 0 24 24" className="mx-auto animate-pop">
      <circle cx="12" cy="12" r="11" fill="#1f9d6b" />
      <path className="check-path" d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Spinner() {
  return <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />;
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-[#1f9d6b]/10 px-3 py-1 text-xs font-medium text-[#1f9d6b]">{children}</span>;
}

function HowItWorks() {
  const steps = [
    ["Tell us in plain words", "Where you're going, your dates, budget, who's coming, your dealbreakers. No forms."],
    ["We plan the whole thing", "Stays in the right neighbourhoods, no exhausting travel days, every booking inside your budget. Door to door."],
    ["Book it for real", "Send yourself the plan, then book every flight and hotel through trusted sites with your dates already filled in."],
  ];
  return (
    <section id="how" className="mx-auto max-w-3xl px-6 py-16">
      <h2 className="text-center text-sm font-medium uppercase tracking-wide text-[#15110c]/40">How it works</h2>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {steps.map(([t, d], i) => (
          <div key={t} className="rounded-2xl border border-[#15110c]/10 bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-[0_12px_40px_-18px_rgba(0,0,0,0.25)]">
            <div className="mb-2 text-sm font-semibold text-[#e8643c]">{String(i + 1).padStart(2, "0")}</div>
            <h3 className="font-semibold">{t}</h3>
            <p className="mt-1 text-sm text-[#15110c]/60">{d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="mt-8 border-t border-[#15110c]/8">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 px-6 py-12 text-center">
        <div className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#e8643c] text-sm font-bold text-white">{config.brandName.charAt(0)}</span>
          {config.brandName}
        </div>
        <p className="max-w-sm text-sm text-[#15110c]/55">Describe any trip and get a plan that respects the rules you actually care about. Anywhere in the world.</p>
        <div className="mt-2 flex items-center gap-4 text-xs text-[#15110c]/45">
          <a href="/privacy" className="transition hover:text-[#e8643c]">Privacy</a>
          <a href="/terms" className="transition hover:text-[#e8643c]">Terms</a>
        </div>
        <p className="text-xs text-[#15110c]/35">© 2026 {config.brandName}</p>
      </div>
    </footer>
  );
}
/* ─────────────────────────── onboarding (3-tap profile) ─────────────────────────── */

function ProfileModal({ onSubmit, onSkip }: { onSubmit: (p: Profile) => void; onSkip: () => void }) {
  const [pace, setPace] = useState<string | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [mustHaves, setMustHaves] = useState<string[]>([]);
  const toggle = (arr: string[], set: (v: string[]) => void, v: string) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <Sheet onClose={onSkip}>
      <h3 className="text-lg font-semibold">How do you like to travel?</h3>
      <p className="mt-1 text-sm text-[#15110c]/55">Three taps and your plan fits you. Or skip and we&apos;ll go off your brief.</p>

      <Group label="Your pace">
        {PACES.map((p) => (
          <Chip key={p} active={pace === p} onClick={() => setPace(pace === p ? null : p)}>{p}</Chip>
        ))}
      </Group>
      <Group label="You're into">
        {INTERESTS.map((v) => (
          <Chip key={v} active={interests.includes(v)} onClick={() => toggle(interests, setInterests, v)}>{v}</Chip>
        ))}
      </Group>
      <Group label="Must-haves">
        {MUSTHAVES.map((v) => (
          <Chip key={v} active={mustHaves.includes(v)} onClick={() => toggle(mustHaves, setMustHaves, v)}>{v}</Chip>
        ))}
      </Group>

      <button onClick={() => onSubmit({ pace, interests, mustHaves })} className="mt-5 w-full rounded-xl bg-[#e8643c] px-5 py-3.5 text-sm font-semibold text-white transition active:scale-[0.98] hover:bg-[#d4502a]">
        Build my plan →
      </button>
      <button onClick={onSkip} className="mt-2 w-full text-center text-sm text-[#15110c]/50 transition hover:text-[#e8643c]">Skip, just use my brief</button>
    </Sheet>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-[#15110c]/40">{label}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3.5 py-2 text-sm transition active:scale-95 ${active ? "border-[#e8643c] bg-[#e8643c] text-white" : "border-[#15110c]/15 bg-white text-[#15110c]/75 hover:border-[#e8643c]/50"}`}
    >
      {children}
    </button>
  );
}

/* ─────────────────────────── reserve + confirmation ─────────────────────────── */

function ReserveSheet({ destination, onSubmit, onClose }: { destination?: string; onSubmit: (email: string) => Promise<void>; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  async function submit() {
    if (!valid || saving) return;
    setSaving(true);
    await onSubmit(email);
  }
  return (
    <Sheet onClose={saving ? undefined : onClose}>
      <h3 className="text-lg font-semibold">Email yourself this plan</h3>
      <p className="mt-1 text-sm text-[#15110c]/55">
        Drop your email and we&apos;ll send the full {destination ?? "trip"} itinerary so you have it on the road. Book whenever you&apos;re ready.
      </p>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="you@email.com"
        autoFocus
        className="mt-4 w-full rounded-xl border border-[#15110c]/12 px-4 py-3 text-sm outline-none focus:border-[#e8643c]"
      />
      <button onClick={submit} disabled={!valid || saving} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#e8643c] px-5 py-3.5 text-sm font-semibold text-white transition active:scale-[0.98] hover:bg-[#d4502a] disabled:opacity-50">
        {saving ? (<><Spinner /> Sending…</>) : (<>Email me my plan</>)}
      </button>
      <p className="mt-3 text-center text-xs text-[#15110c]/40">No spam. Just your plan, and the occasional travel tip. See our <a href="/privacy" target="_blank" className="underline underline-offset-2 hover:text-[#e8643c]">privacy policy</a>.</p>
    </Sheet>
  );
}

function Reserved({ trip, days, email, onShare, onRestart }: { trip: Trip; days: Day[]; email: string; onShare: () => void; onRestart: () => void }) {
  const steps = [
    ["Your plan, in your inbox", `We're sending the full ${trip.destination} itinerary to ${email}.`],
    ["Book when you're ready", "Open the plan and book each flight and hotel through trusted sites, dates already filled in."],
    ["A guide for the road", "Every stop links straight to Google Maps directions, so you always know where you're going next."],
  ];
  return (
    <section className="mx-auto max-w-xl px-6 pb-24 pt-10 text-center animate-fade">
      <SuccessCheck />
      <h2 className="mt-5 text-3xl font-semibold tracking-tight">Sent. Check your inbox.</h2>
      <p className="mx-auto mt-3 max-w-md text-[#15110c]/65">
        Your {trip.days}-day {trip.destination} plan is on its way to <span className="font-medium text-[#15110c]">{email}</span>. Book it whenever you&apos;re ready, no rush.
      </p>

      <div className="mt-7 rounded-2xl border border-[#15110c]/10 bg-white p-5 text-left">
        <div className="text-sm font-semibold">{trip.days} days in {trip.destination}</div>
        <div className="mt-1 text-xs text-[#15110c]/55">{trip.party} travellers · {trip.budget} · {days.length} nights near stations</div>
      </div>

      <h3 className="mt-8 text-sm font-medium uppercase tracking-wide text-[#15110c]/40">What happens next</h3>
      <ol className="mt-3 space-y-3 text-left">
        {steps.map(([t, d], i) => (
          <li key={t} className="flex gap-3 rounded-xl border border-[#15110c]/10 bg-white p-4">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#15110c] text-xs font-semibold text-white">{i + 1}</span>
            <div>
              <div className="text-sm font-medium">{t}</div>
              <div className="mt-0.5 text-xs text-[#15110c]/55">{d}</div>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-8 rounded-2xl bg-[#15110c] p-5 text-left text-white">
        <div className="text-sm font-semibold">Know someone planning {trip.destination}?</div>
        <p className="mt-1 text-sm text-white/70">Send them their own plan in 20 seconds. It genuinely helps us open booking sooner.</p>
        <button onClick={onShare} className="mt-3 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#15110c] transition active:scale-95 hover:bg-white/90">Share Tripcraft</button>
      </div>

      <button onClick={onRestart} className="mt-6 text-sm text-[#15110c]/50 transition hover:text-[#e8643c]">Plan another trip →</button>
    </section>
  );
}

