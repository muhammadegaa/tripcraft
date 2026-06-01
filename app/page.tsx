"use client";

import { useEffect, useRef, useState } from "react";
import { config } from "@/lib/config";
import { burstConfetti } from "@/lib/confetti";
import { saveTrip, saveLead } from "@/lib/firebase";
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
  { label: "🍜 Japan food trip", prompt: "10 days in Japan in November, 2 people, IDR 45M budget. We're obsessed with food — ramen, sushi, izakaya, markets. Hotels walkable to train stations, no transit leg over 2 hours." },
  { label: "🌸 Cherry blossom", prompt: "8 days in Japan in late March for cherry blossoms, 2 people, IDR 40M. We love gardens, temples, and street food. Hotels near stations, no train over 2 hours." },
  { label: "👨‍👩‍👧 Family Japan", prompt: "7 days in Tokyo and nearby, family of 4 with two kids (6 and 9), IDR 60M. Theme parks, easy relaxed days, kid-friendly food. Hotels right by a station, only short transit." },
  { label: "🏝️ Bali reset", prompt: "6 days in Bali, 2 people, IDR 20M. Beaches, cafes, yoga, sunsets. Relaxed pace, nice stays close to the action, no long drives." },
  { label: "🇰🇷 Seoul 5 days", prompt: "5 days in Seoul, 2 people, IDR 25M. Korean BBQ, cafes, shopping, palaces. Hotels near the subway, no long transfers." },
  { label: "🎒 Budget backpack", prompt: "12 days across Japan on a tight budget, 1 person, IDR 25M. Hostels near stations, cheap eats, free sights, no transit over 2 hours." },
];
const MOCK_DAY = 3;
const MOCK_NOW = "11:05";

type Phase = "input" | "generating" | "plan" | "live" | "reserved";
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
  return parts.length ? `About how we travel — ${parts.join("; ")}. Tailor the plan to this.` : "";
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function track(event: string, data?: Record<string, unknown>) {
  try {
    const body = JSON.stringify({ event, data });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/track", body);
    else fetch("/api/track", { method: "POST", body, keepalive: true });
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

export default function Page() {
  const [phase, setPhase] = useState<Phase>("input");
  const [input, setInput] = useState("");
  const [trip, setTrip] = useState<Trip | null>(null);
  const [days, setDays] = useState<Day[]>([]);
  const [pendingDays, setPendingDays] = useState<Day[] | null>(null);
  const [step, setStep] = useState(0);
  const [tripId, setTripId] = useState<string>("");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [reserveOpen, setReserveOpen] = useState(false);
  const [reservedEmail, setReservedEmail] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [onboarded, setOnboarded] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [directions, setDirections] = useState<Stop | null>(null);
  const [agentOpen, setAgentOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [improving, setImproving] = useState(false);
  const idRef = useRef(1);
  const nextId = () => idRef.current++;

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
        pushToast("Sharpened your trip — tweak anything", "✨");
      }
    } catch {
      /* leave input as-is */
    } finally {
      setImproving(false);
    }
  }

  function handleGenerate() {
    if (input.trim().length < 8) return;
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
      setPendingDays(data?.days?.length ? data.days : generate(t));
    } catch {
      setPendingDays(generate(t));
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
    track("reserved", { persisted, destination: trip?.destination });
    saveTrip(tripId, { status: "reserved", leadEmail: email.toLowerCase() });
    setReservedEmail(email);
    setReserveOpen(false);
    setPhase("reserved");
    setTimeout(burstConfetti, 250);
  }

  function commit() {
    track("preview_live", { destination: trip?.destination });
    setPhase("live");
  }

  function reflowToday() {
    setDays((ds) =>
      ds.map((d, i) =>
        i === MOCK_DAY - 1 ? { ...d, stops: d.stops.map((s, si) => (si > 0 ? { ...s, time: addMin(s.time, 30) } : s)) } : d
      )
    );
    pushToast("Day re-flowed around your location", "✦");
  }

  function shareTrip() {
    track("share_click");
    const url = typeof window !== "undefined" ? window.location.origin : "";
    const text = `I just planned my ${trip?.destination ?? "trip"} on Tripcraft — describe your trip and it builds the whole thing, hotels by the station and no long trains. Try it:`;
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator.share({ title: "Tripcraft", text, url }).catch(() => {});
    } else if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(`${text} ${url}`).then(() => pushToast("Link copied — share it", "🔗"));
    }
  }

  function decide(textRaw: string): { steps: string[]; reply: string; action?: () => void } {
    const t = textRaw.toLowerCase();
    const city = trip ? days[0]?.city : "";
    if (/(late|behind|re-?flow|delay|slow down|catch up)/.test(t))
      return {
        steps: ["Reading your live location…", "Recalculating today's timings…", "Protecting your 17:30 plan"],
        reply: "Done. I pushed your afternoon back 30 minutes and kept your evening locked in. No need to rush.",
        action: reflowToday,
      };
    if (/(relax|chill|less|lighter|tired|easy)/.test(t))
      return {
        steps: ["Reviewing your pacing…", "Finding the busiest day", "Loosening the schedule"],
        reply: "I lightened your busiest day — fewer stops, longer meals, a slow afternoon. Want it across the whole trip?",
      };
    if (/(cheap|budget|save|afford|expensive)/.test(t))
      return {
        steps: ["Comparing nearby hotels…", "Checking station distance & ratings", "Swapping 2 stays"],
        reply: "Swapped two hotels for 4.5★ ones still 5 minutes from the station — roughly IDR 6jt under budget. Want me to keep those?",
      };
    if (/(book|reserve|pay|buy|everything|confirm|access)/.test(t))
      return {
        steps: [],
        reply: "Booking opens soon — reserve your spot and you'll be first in line, with your plan saved to your inbox.",
        action: openReserve,
      };
    if (/(food|eat|restaurant|ramen|sushi|hungry|dinner)/.test(t))
      return {
        steps: ["Scanning your food days…", "Matching to your taste"],
        reply: `In ${city || "your trip"} I'd hit the spot by your hotel tonight, then the market tasting tomorrow. Want those pinned?`,
      };
    return {
      steps: [],
      reply: "I can re-flow your days, swap hotels to hit budget, or get you early access to book. What would help?",
    };
  }

  async function send(textRaw: string) {
    const text = textRaw.trim();
    if (!text || busy) return;
    setAgentOpen(true);
    setBusy(true);
    setMsgs((m) => [...m, { id: nextId(), role: "user", text }]);
    track("agent_message");
    const aId = nextId();
    setMsgs((m) => [...m, { id: aId, role: "agent", pending: true, steps: [] }]);
    const plan = decide(text);
    for (const s of plan.steps) {
      await delay(560);
      setMsgs((m) => m.map((x) => (x.id === aId ? { ...x, steps: [...(x.steps ?? []), s] } : x)));
    }
    await delay(plan.steps.length ? 420 : 650);
    setMsgs((m) => m.map((x) => (x.id === aId ? { ...x, pending: false, text: plan.reply } : x)));
    plan.action?.();
    setBusy(false);
  }

  function restart() {
    setPhase("input");
    setInput("");
    setMsgs([]);
    setReservedEmail("");
  }

  const showAgent = phase === "plan" || phase === "live";

  return (
    <main className="min-h-screen bg-[#faf7f2] text-[#15110c]">
      <Nav live={phase === "live"} />

      {phase === "input" && (
        <div className="animate-fade">
          <Hero input={input} setInput={setInput} onGenerate={handleGenerate} onImprove={improveBrief} improving={improving} />
          <HowItWorks />
        </div>
      )}
      {phase === "generating" && <Generating step={step} trip={trip!} />}
      {phase === "plan" && (
        <Plan trip={trip!} days={days} onDirections={setDirections} onCommit={commit} onReserve={openReserve} onRestart={restart} />
      )}
      {phase === "live" && (
        <Live trip={trip!} days={days} onDirections={setDirections} onReflow={() => send("I'm running late")} onReserve={openReserve} onBack={() => setPhase("plan")} />
      )}
      {phase === "reserved" && (
        <Reserved trip={trip!} days={days} email={reservedEmail} onShare={shareTrip} onRestart={restart} />
      )}

      {showAgent && <AgentFab open={agentOpen} onToggle={() => setAgentOpen((v) => !v)} />}
      {showAgent && agentOpen && <AgentPanel msgs={msgs} busy={busy} onSend={send} onClose={() => setAgentOpen(false)} />}

      {profileOpen && <ProfileModal onSubmit={submitProfile} onSkip={skipProfile} />}
      {reserveOpen && <ReserveSheet destination={trip?.destination} onSubmit={submitReserve} onClose={() => setReserveOpen(false)} />}
      {directions && <Directions stop={directions} onClose={() => setDirections(null)} />}
      <Toaster toasts={toasts} />
      <Footer />
    </main>
  );
}

/* ─────────────────────────── chrome ─────────────────────────── */

function Nav({ live }: { live: boolean }) {
  return (
    <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
      <div className="flex items-center gap-2 font-semibold tracking-tight">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#e8643c] text-white">◐</span>
        {config.brandName}
      </div>
      <span className="flex items-center gap-1.5 rounded-full border border-[#15110c]/10 bg-white px-3 py-1 text-xs font-medium text-[#15110c]/70">
        {live && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#1f9d6b]" />}
        {live ? "Live companion · preview" : "Free · no signup to try"}
      </span>
    </header>
  );
}

function Hero({ input, setInput, onGenerate, onImprove, improving }: { input: string; setInput: (s: string) => void; onGenerate: () => void; onImprove: () => void; improving: boolean }) {
  const canImprove = input.trim().length >= 3 && !improving;
  return (
    <section className="mx-auto max-w-3xl px-6 pb-10 pt-10 text-center">
      <p className="mb-4 text-sm font-medium text-[#e8643c] animate-rise">Constraint-perfect trip planning · booking opens soon</p>
      <h1 className="text-balance text-4xl font-semibold leading-tight tracking-tight sm:text-5xl animate-rise">
        Your whole Japan trip,<br />planned to the minute.
      </h1>
      <p className="mx-auto mt-5 max-w-xl text-balance text-lg text-[#15110c]/65 animate-rise">
        Describe your trip in plain words. We build a real day-by-day plan — hotels you can walk to the station from, no train over 2 hours, on your budget. Reserve now and you&apos;re first to book it all when we open.
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
          placeholder="…or describe your own: 10 days in Japan, 2 people, IDR 40M, love ramen and onsen, hotels walkable to stations, no train over 2 hours"
          rows={4}
          className="w-full resize-none rounded-xl bg-transparent p-3 text-left text-[15px] outline-none placeholder:text-[#15110c]/35"
        />
        <div className="flex flex-wrap items-center justify-between gap-3 px-1 pb-1">
          <button onClick={onImprove} disabled={!canImprove} title="Let AI sharpen your trip into a clear, complete brief" className="rounded-xl border border-[#15110c]/15 px-3.5 py-2.5 text-sm font-medium text-[#15110c] transition active:scale-95 enabled:hover:border-[#e8643c] enabled:hover:text-[#e8643c] disabled:opacity-40">
            {improving ? "✨ Improving…" : "✨ Improve my brief"}
          </button>
          <button onClick={onGenerate} disabled={input.trim().length < 8} className="rounded-xl bg-[#15110c] px-5 py-3 text-sm font-semibold text-white transition active:scale-95 enabled:hover:bg-[#e8643c] disabled:opacity-40">See my plan — free →</button>
        </div>
      </div>
      <p className="mt-3 text-xs text-[#15110c]/45 animate-rise">New here? Pick a template, then hit <span className="font-medium text-[#15110c]/70">✨ Improve</span> to shape it — or just type and go.</p>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-[#15110c]/50 animate-rise">
        <span>✓ A real plan in ~20 seconds</span>
        <span>✓ Every train under 2 hours</span>
        <span>✓ First access to book it</span>
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

function Plan({ trip, days, onDirections, onCommit, onReserve, onRestart }: {
  trip: Trip; days: Day[]; onDirections: (s: Stop) => void; onCommit: () => void; onReserve: () => void; onRestart: () => void;
}) {
  const legs = days.reduce((n, d) => n + d.tickets.length, 0);
  return (
    <section className="mx-auto max-w-3xl px-6 pb-40 pt-4 animate-fade">
      <div className="mb-6 flex items-center justify-between">
        <button onClick={onRestart} className="text-sm text-[#15110c]/50 transition hover:text-[#e8643c]">← Start over</button>
        <span className="text-xs text-[#15110c]/40">Draft · prices are estimates</span>
      </div>
      <h2 className="text-3xl font-semibold tracking-tight animate-rise">{trip.days} days in {trip.destination}</h2>
      <p className="mt-2 text-[#15110c]/60 animate-rise">{trip.party} travellers · {trip.budget} · {trip.interests}</p>
      <div className="mt-5 flex flex-wrap gap-2 animate-rise">
        <Badge>✓ {days.length} nights near stations</Badge>
        <Badge>✓ {legs} legs, none over 2h</Badge>
        <Badge>✓ Door-to-door directions</Badge>
      </div>
      <ol className="stagger mt-8 space-y-4">
        {days.map((d) => (
          <PlanDay key={d.n} d={d} onDirections={onDirections} />
        ))}
      </ol>
      <StickyBar>
        <div className="text-sm">
          <span className="font-semibold">Want this trip?</span>
          <span className="text-[#15110c]/55"> Reserve it — we&apos;ll email the plan and get you in first to book.</span>
        </div>
        <div className="flex gap-2">
          <button onClick={onCommit} className="rounded-xl border border-[#15110c]/15 px-4 py-3 text-sm font-medium transition active:scale-95 hover:border-[#e8643c] hover:text-[#e8643c]">See it live →</button>
          <button onClick={onReserve} className="rounded-xl bg-[#e8643c] px-5 py-3 text-sm font-semibold text-white transition active:scale-95 hover:bg-[#d4502a]">Reserve my trip</button>
        </div>
      </StickyBar>
    </section>
  );
}

function PlanDay({ d, onDirections }: { d: Day; onDirections: (s: Stop) => void }) {
  return (
    <li className="overflow-hidden rounded-2xl border border-[#15110c]/10 bg-white transition hover:shadow-[0_12px_40px_-18px_rgba(0,0,0,0.25)]">
      <div className="flex items-baseline justify-between gap-4 border-b border-[#15110c]/8 px-5 py-3">
        <h3 className="font-semibold">Day {d.n} · {d.city}<span className="font-normal text-[#15110c]/50"> — {d.area}</span></h3>
        <span className="shrink-0 text-xs text-[#1f9d6b]">longest leg {d.maxLeg}</span>
      </div>
      <div className="space-y-3 px-5 py-4">
        {d.tickets.map((t, i) => (
          <InfoRow key={i} icon={t.icon} title={t.mode} sub={`${t.from} → ${t.to} · ${t.depart}–${t.arrive} · ${t.dur} · ~${t.price}`} flag={t.flag} />
        ))}
        <InfoRow icon="🏨" title={d.hotel.name} sub={`★ ${d.hotel.rating} · ${d.hotel.walk} · ~${d.hotel.price}`} />
        <ol className="mt-1 space-y-3 border-l border-[#15110c]/10 pl-4">
          {d.stops.map((s, i) => (
            <li key={i} className="relative">
              <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-[#e8643c]" />
              <div className="flex items-baseline gap-2 text-sm">
                <span className="font-mono text-xs text-[#15110c]/45">{s.time}</span>
                <span className="font-medium">{s.title}</span>
              </div>
              <p className="mt-0.5 text-xs text-[#15110c]/55">
                ↳ {s.directions}{" "}
                <button onClick={() => onDirections(s)} className="font-medium text-[#e8643c] underline-offset-2 hover:underline">directions ↗</button>
              </p>
              {s.tip && <p className="mt-1 text-xs text-[#15110c]/55">💡 {s.tip}</p>}
            </li>
          ))}
        </ol>
        <p className="pt-1 text-sm text-[#e8643c]">🍜 {d.food}</p>
      </div>
    </li>
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

/* ─────────────────────────── live ─────────────────────────── */

function Live({ trip, days, onDirections, onReflow, onReserve, onBack }: { trip: Trip; days: Day[]; onDirections: (s: Stop) => void; onReflow: () => void; onReserve: () => void; onBack: () => void }) {
  const dayIndex = Math.max(1, Math.min(MOCK_DAY, days.length));
  const today = days[dayIndex - 1];
  const now = toMin(MOCK_NOW);
  const currentIdx = Math.max(0, today.stops.map((s) => toMin(s.time) <= now).lastIndexOf(true));
  const current = today.stops[currentIdx];
  const next = today.stops.find((s) => toMin(s.time) > now);
  const minsToNext = next ? toMin(next.time) - now : 0;
  const progress = Math.round((dayIndex / days.length) * 100);

  return (
    <section className="mx-auto max-w-2xl px-6 pb-32 pt-2 animate-fade">
      <div className="mb-5 flex items-center justify-between">
        <button onClick={onBack} className="text-sm text-[#15110c]/50 transition hover:text-[#e8643c]">← Back to plan</button>
        <span className="font-mono text-xs text-[#15110c]/45">a preview of day {dayIndex}</span>
      </div>

      <div className="rounded-2xl border border-[#15110c]/10 bg-white p-5 animate-rise">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold">Here&apos;s how a day feels on the ground</span>
          <span className="text-[#15110c]/50">Day {dayIndex} of {days.length}</span>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[#15110c]/8">
          <div className="h-full rounded-full bg-[#e8643c] transition-all duration-700" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-2 text-xs text-[#15110c]/50">{trip.destination} · {today.city} · the app keeps you on track in real time</p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-[#15110c]/10 bg-white p-5 animate-rise">
          <div className="text-xs font-medium uppercase tracking-wide text-[#15110c]/40">📍 You&apos;re here</div>
          <div className="mt-1 font-semibold">{current.place}</div>
          <div className="mt-1 text-xs text-[#15110c]/55">{today.city}</div>
        </div>
        <div className="rounded-2xl border border-[#15110c]/10 bg-white p-5 animate-rise">
          <div className="text-xs font-medium uppercase tracking-wide text-[#15110c]/40">🎯 You should be</div>
          <div className="mt-1 font-semibold">{current.title}</div>
          <div className="mt-1 text-xs text-[#1f9d6b]">On track · scheduled {current.time}</div>
        </div>
      </div>

      {next && (
        <div className="mt-4 rounded-2xl border border-[#e8643c]/30 bg-[#e8643c]/5 p-5 animate-rise">
          <div className="text-xs font-medium uppercase tracking-wide text-[#e8643c]">Next up · in {minsToNext} min</div>
          <div className="mt-1 text-lg font-semibold">{next.time} · {next.title}</div>
          <p className="mt-1 text-sm text-[#15110c]/60">↳ {next.directions}</p>
          <button onClick={() => onDirections(next)} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#e8643c] px-4 py-2 text-sm font-semibold text-white transition active:scale-95 hover:bg-[#d4502a] animate-ring">Start walking directions ↗</button>
        </div>
      )}

      <h3 className="mt-8 text-sm font-medium uppercase tracking-wide text-[#15110c]/40">Today · {today.area}</h3>
      <ol className="mt-3 space-y-2">
        {today.stops.map((s, i) => {
          const state = i < currentIdx ? "done" : i === currentIdx ? "now" : "next";
          return (
            <li key={i} className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm transition ${state === "now" ? "border-[#e8643c]/40 bg-white" : "border-[#15110c]/10 bg-white"}`}>
              <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] ${state === "done" ? "bg-[#1f9d6b] text-white" : state === "now" ? "bg-[#e8643c] text-white" : "bg-[#15110c]/10 text-[#15110c]/40"}`}>{state === "done" ? "✓" : state === "now" ? "•" : "○"}</span>
              <span className="font-mono text-xs text-[#15110c]/45">{s.time}</span>
              <span className={state === "done" ? "text-[#15110c]/40 line-through" : ""}>{s.title}</span>
            </li>
          );
        })}
        <li className="flex items-center gap-3 rounded-xl border border-[#15110c]/10 bg-white px-4 py-3 text-sm">
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#15110c]/10 text-[11px] text-[#15110c]/40">○</span>
          <span className="font-mono text-xs text-[#15110c]/45">tonight</span>
          <span>🏨 {today.hotel.name}</span>
        </li>
      </ol>

      <StickyBar narrow>
        <div className="text-sm">
          <span className="font-semibold">Like the sound of this?</span>
          <span className="text-[#15110c]/55"> Reserve your trip and be first to book it all.</span>
        </div>
        <div className="flex gap-2">
          <button onClick={onReflow} className="rounded-xl border border-[#15110c]/15 px-4 py-3 text-sm font-medium transition active:scale-95 hover:border-[#e8643c] hover:text-[#e8643c]">Re-flow my day</button>
          <button onClick={onReserve} className="rounded-xl bg-[#e8643c] px-5 py-3 text-sm font-semibold text-white transition active:scale-95 hover:bg-[#d4502a]">Reserve my trip</button>
        </div>
      </StickyBar>
    </section>
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
      <h3 className="text-lg font-semibold">Quick — how do you travel?</h3>
      <p className="mt-1 text-sm text-[#15110c]/55">Three taps and your plan fits you. Or skip and we&apos;ll go with your brief.</p>

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
      <button onClick={onSkip} className="mt-2 w-full text-center text-sm text-[#15110c]/50 transition hover:text-[#e8643c]">Skip — just use my brief</button>
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
      <h3 className="text-lg font-semibold">Reserve your {destination ?? "trip"}</h3>
      <p className="mt-1 text-sm text-[#15110c]/55">
        We&apos;re opening booking to a small group first. Drop your email — we&apos;ll send this plan and let you know the moment you can book it in-app.
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
        {saving ? (<><Spinner /> Reserving…</>) : (<>Reserve my spot</>)}
      </button>
      <p className="mt-3 text-center text-xs text-[#15110c]/40">No spam — just your plan and a heads-up when booking opens.</p>
    </Sheet>
  );
}

function Reserved({ trip, days, email, onShare, onRestart }: { trip: Trip; days: Day[]; email: string; onShare: () => void; onRestart: () => void }) {
  const steps = [
    ["Your plan, in your inbox", `We're sending the full ${trip.destination} itinerary to ${email}.`],
    ["We line up the real prices", "When booking opens, we pull live flight + hotel prices for your dates — no guesswork."],
    ["You book first", "Early-access travelers get to book the whole trip in-app before anyone else."],
  ];
  return (
    <section className="mx-auto max-w-xl px-6 pb-24 pt-10 text-center animate-fade">
      <SuccessCheck />
      <h2 className="mt-5 text-3xl font-semibold tracking-tight">You&apos;re in.</h2>
      <p className="mx-auto mt-3 max-w-md text-[#15110c]/65">
        Your {trip.days}-day {trip.destination} trip is reserved. We&apos;ll email it to <span className="font-medium text-[#15110c]">{email}</span> and tell you the moment booking opens.
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

/* ─────────────────────────── directions ─────────────────────────── */

function Directions({ stop, onClose }: { stop: Stop; onClose: () => void }) {
  const steps = ["Head out and follow the main pedestrian route", stop.directions, `Arrive at ${stop.place}`];
  return (
    <Sheet onClose={onClose}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Walking to {stop.title}</h3>
        <span className="rounded-full bg-[#1f9d6b]/10 px-2.5 py-1 text-xs font-medium text-[#1f9d6b]">~8 min · 0.6 km</span>
      </div>
      <div className="relative mt-4 h-36 overflow-hidden rounded-xl border border-[#15110c]/10 bg-[#eef2f0]">
        <div className="absolute inset-0 opacity-60" style={{ backgroundImage: "linear-gradient(#15110c11 1px,transparent 1px),linear-gradient(90deg,#15110c11 1px,transparent 1px)", backgroundSize: "22px 22px" }} />
        <svg viewBox="0 0 320 144" className="absolute inset-0 h-full w-full">
          <path d="M40 116 L120 96 L150 60 L250 40" fill="none" stroke="#e8643c" strokeWidth="4" strokeLinecap="round" strokeDasharray="2 10" />
          <circle cx="40" cy="116" r="7" fill="#15110c" />
          <circle cx="250" cy="40" r="8" fill="#e8643c" />
        </svg>
        <span className="absolute bottom-2 left-3 rounded bg-white/90 px-2 py-0.5 text-[11px] font-medium">You</span>
        <span className="absolute right-3 top-2 rounded bg-[#e8643c] px-2 py-0.5 text-[11px] font-medium text-white">{stop.title}</span>
      </div>
      <ol className="mt-4 space-y-3">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3 text-sm">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#15110c] text-xs font-semibold text-white">{i + 1}</span>
            <span className="pt-0.5 text-[#15110c]/75">{s}</span>
          </li>
        ))}
      </ol>
      <button onClick={onClose} className="mt-5 w-full rounded-xl bg-[#15110c] px-5 py-3 text-sm font-semibold text-white transition active:scale-95 hover:bg-[#e8643c]">Got it</button>
    </Sheet>
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

/* ─────────────────────────── agent ─────────────────────────── */

function AgentFab({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} className="fixed bottom-[88px] right-5 z-40 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#15110c] text-xl text-white shadow-[0_10px_30px_-8px_rgba(0,0,0,0.5)] transition active:scale-90 hover:bg-[#e8643c]" aria-label="Trip agent">
      <span className={open ? "" : "animate-pulse"}>{open ? "✕" : "✦"}</span>
    </button>
  );
}

function AgentPanel({ msgs, busy, onSend, onClose }: { msgs: Msg[]; busy: boolean; onSend: (t: string) => void; onClose: () => void }) {
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { scrollRef.current?.scrollTo({ top: 9e9, behavior: "smooth" }); }, [msgs]);
  const chips = ["I'm running late", "Make it more relaxed", "Find cheaper hotels", "Reserve my trip"];
  function submit() { if (!text.trim()) return; onSend(text); setText(""); }
  return (
    <div className="fixed bottom-0 right-0 z-40 flex h-[78vh] w-full flex-col border-l border-t border-[#15110c]/10 bg-white shadow-2xl animate-sheet sm:bottom-[88px] sm:right-5 sm:h-[560px] sm:w-[380px] sm:rounded-2xl sm:border">
      <div className="flex items-center justify-between border-b border-[#15110c]/8 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#e8643c] text-white">✦</span>
          <div className="text-sm font-semibold">Trip agent</div>
        </div>
        <button onClick={onClose} className="text-[#15110c]/40 hover:text-[#15110c]">✕</button>
      </div>
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {msgs.length === 0 && (
          <div className="rounded-xl bg-[#faf7f2] p-4 text-sm text-[#15110c]/70">
            Hi — ask me to re-flow your days, swap hotels to hit budget, or get you early access to book.
          </div>
        )}
        {msgs.map((m) => (m.role === "user" ? (
          <div key={m.id} className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-[#15110c] px-3.5 py-2 text-sm text-white animate-rise">{m.text}</div>
        ) : (
          <div key={m.id} className="w-fit max-w-[90%] animate-rise">
            {m.steps && m.steps.length > 0 && (
              <ul className="mb-1.5 space-y-1">
                {m.steps.map((s, i) => (<li key={i} className="flex items-center gap-2 text-xs text-[#15110c]/55"><span className="text-[#1f9d6b]">✓</span>{s}</li>))}
              </ul>
            )}
            {m.pending ? (
              <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-[#faf7f2] px-3.5 py-3">
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-[#15110c]/40" />
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-[#15110c]/40" />
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-[#15110c]/40" />
              </div>
            ) : (
              <div className="rounded-2xl rounded-bl-sm bg-[#faf7f2] px-3.5 py-2.5 text-sm text-[#15110c]/85">{m.text}</div>
            )}
          </div>
        )))}
      </div>
      <div className="border-t border-[#15110c]/8 p-3">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {chips.map((c) => (<button key={c} onClick={() => onSend(c)} disabled={busy} className="rounded-full border border-[#15110c]/12 px-2.5 py-1 text-xs text-[#15110c]/70 transition hover:border-[#e8643c] hover:text-[#e8643c] disabled:opacity-40">{c}</button>))}
        </div>
        <div className="flex items-center gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Ask your trip agent…" className="flex-1 rounded-xl border border-[#15110c]/12 px-3 py-2.5 text-sm outline-none focus:border-[#e8643c]" />
          <button onClick={submit} disabled={busy || !text.trim()} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e8643c] text-white transition active:scale-90 hover:bg-[#d4502a] disabled:opacity-40">↑</button>
        </div>
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
    ["Tell us in plain words", "Dates, budget, who's coming, your dealbreakers. No forms."],
    ["We plan the whole thing", "Hotels by the station, every train under 2 hours, balanced to your budget — door to door."],
    ["Reserve and book first", "Save your plan and get early access to book it all in-app, then a live guide for each day."],
  ];
  return (
    <section className="mx-auto max-w-3xl px-6 py-16">
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
  return <footer className="mx-auto max-w-5xl px-6 py-10 text-center text-xs text-[#15110c]/40">{config.brandName} — trips that respect the rules you actually care about.</footer>;
}
