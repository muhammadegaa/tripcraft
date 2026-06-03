import type { Metadata } from "next";
import Link from "next/link";
import { config } from "@/lib/config";
import FlightPathHero from "@/components/landing/FlightPathHero";
import Faq from "@/components/landing/Faq";
import Reveal from "@/components/landing/Reveal";
import {
  Route, Ticket, Navigation, Wallet, Hotel, Plane, Sparkles, MapPinned,
  ShieldCheck, ArrowRight, Check, Star, CalendarCheck,
} from "lucide-react";

const title = `${config.brandName} — Your whole trip, planned and booked`;
const description =
  "Describe any trip in plain words. Get a real day-by-day plan that respects your budget, pace, and dealbreakers, then book the flights and hotels inside the app. A live guide for every day on the ground.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description, type: "website", siteName: config.brandName },
};

const ACCENT = "text-[#e8643c]";

export default function Landing() {
  return (
    <main className="min-h-screen bg-[#faf7f2] text-[#15110c]">
      <Reveal />

      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-[#15110c]/5 bg-[#faf7f2]/80 backdrop-blur-md">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-[#e8643c] text-sm font-bold text-white shadow-soft">{config.brandName.charAt(0)}</span>
            {config.brandName}
          </Link>
          <div className="hidden items-center gap-8 text-sm text-[#15110c]/65 md:flex">
            <a href="#features" className="transition hover:text-[#15110c]">Product</a>
            <a href="#how" className="transition hover:text-[#15110c]">How it works</a>
            <a href="#pricing" className="transition hover:text-[#15110c]">Pricing</a>
            <a href="#faq" className="transition hover:text-[#15110c]">FAQ</a>
          </div>
          <Link href="/app" className="rounded-full bg-[#15110c] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#e8643c] active:scale-95">
            Plan a trip
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="grain relative overflow-hidden">
        <div className="relative mx-auto max-w-4xl px-6 pb-10 pt-20 text-center sm:pt-28">
          <div className="animate-rise mb-5 inline-flex items-center gap-2 rounded-full border border-[#15110c]/10 bg-white px-3.5 py-1.5 text-xs font-medium text-[#15110c]/70 shadow-soft">
            <Sparkles strokeWidth={1.75} className={`size-3.5 ${ACCENT}`} />
            Real plans, real booking, anywhere in the world
          </div>
          <h1 className="animate-rise text-balance text-5xl font-semibold leading-[1.03] tracking-tight sm:text-7xl">
            Your whole trip,<br />planned <span className={ACCENT}>to the minute</span>.
          </h1>
          <p className="animate-rise mx-auto mt-6 max-w-xl text-balance text-lg leading-relaxed text-[#15110c]/60">
            Describe where you are headed in plain words. {config.brandName} builds a day-by-day plan that holds up, then books the flights and hotels right here. No tabs, no spreadsheets.
          </p>
          <div className="animate-rise mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/app" className="group flex items-center gap-2 rounded-full bg-[#e8643c] px-6 py-3.5 text-sm font-semibold text-white shadow-lift transition hover:bg-[#d4502a] active:scale-95">
              Plan my trip, free
              <ArrowRight strokeWidth={2} className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a href="#how" className="rounded-full border border-[#15110c]/15 bg-white px-6 py-3.5 text-sm font-semibold text-[#15110c] transition hover:border-[#e8643c] hover:text-[#e8643c]">
              See how it works
            </a>
          </div>
          <p className="animate-rise mt-5 text-xs text-[#15110c]/45">Free to plan. You only pay when you book, at the live partner price.</p>

          <div className="animate-rise mt-12">
            <FlightPathHero />
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="border-y border-[#15110c]/5 bg-white/50">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-px overflow-hidden px-6 py-10 sm:grid-cols-4" data-reveal>
          <Stat n="Worldwide" l="Every destination" />
          <Stat n="Seconds" l="To a full plan" />
          <Stat n="Live prices" l="Flights and hotels" />
          <Stat n="One place" l="Plan, book, go" />
        </div>
        <p className="pb-10 text-center text-xs uppercase tracking-[0.18em] text-[#15110c]/35">
          Real inventory from leading flight, hotel, and payment partners
        </p>
      </section>

      {/* Problem */}
      <section className="mx-auto max-w-3xl px-6 py-24 text-center" data-reveal>
        <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
          Most trip planners give you a list. Then you do all the real work.
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-balance text-lg leading-relaxed text-[#15110c]/55">
          Generic itineraries ignore your budget, your pace, and the fact that you hate 6am transfers. Then you spend hours stitching together flights and hotels yourself. {config.brandName} does the whole thing, and it respects the rules you actually care about.
        </p>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl space-y-24 px-6 pb-24">
        <Feature
          icon={<Route strokeWidth={1.75} className="size-6 text-[#e8643c]" />}
          eyebrow="Constraint-perfect itineraries"
          title="A plan that honors every dealbreaker"
          body="Set your budget, dates, pace, and the things you refuse to do. Get a day-by-day plan with stays near transit, no exhausting travel legs, and every booking inside your number. Real places, real photos, real directions."
          points={["Stays a short walk from the station", "No transit leg over your limit", "Every cost inside your budget"]}
          visual={<ItineraryMock />}
        />
        <Feature
          reverse
          icon={<Ticket strokeWidth={1.75} className="size-6 text-[#e8643c]" />}
          eyebrow="In-app booking"
          title="Book flights and hotels without leaving the plan"
          body="Pick from live flight and hotel inventory, pay securely with Stripe, and get a real confirmation and receipt by email. One checkout, in one currency, no hopping between a dozen tabs."
          points={["Live flight and hotel prices", "Secure Stripe checkout and receipt", "Confirmations saved to your trips"]}
          visual={<BookingMock />}
        />
      </section>

      {/* Dark feature: companion */}
      <section className="bg-[#15110c] text-[#faf7f2]">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-24 md:grid-cols-2" data-reveal>
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/70">
              <Navigation strokeWidth={1.75} className="size-3.5 text-[#e8643c]" />
              Live day-of companion
            </div>
            <h2 className="mt-5 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              A guide that travels with you
            </h2>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-white/60">
              On the ground, every stop links straight to directions, and your plan keeps up with the day. Always know where you are headed next, without digging through screenshots.
            </p>
            <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-sm text-white/70">
              <span className="flex items-center gap-2"><MapPinned strokeWidth={1.75} className="size-4 text-[#e8643c]" /> Turn-by-turn to every stop</span>
              <span className="flex items-center gap-2"><CalendarCheck strokeWidth={1.75} className="size-4 text-[#e8643c]" /> Your day, in order</span>
            </div>
          </div>
          <PhoneMock />
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-5xl px-6 py-24">
        <h2 className="text-center text-balance text-3xl font-semibold tracking-tight sm:text-4xl" data-reveal>Three steps to a trip you can actually take</h2>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          <Step n="01" icon={<Sparkles strokeWidth={1.75} className="size-5 text-[#e8643c]" />} title="Tell us in plain words" body="Where, when, who, your budget, and your dealbreakers. No forms, just type." />
          <Step n="02" icon={<MapPinned strokeWidth={1.75} className="size-5 text-[#e8643c]" />} title="Get your perfect plan" body="A day-by-day itinerary that respects every constraint, with real places and directions." />
          <Step n="03" icon={<Plane strokeWidth={1.75} className="size-5 text-[#e8643c]" />} title="Book it and go" body="Book flights and hotels in the app, pay once, and travel with a guide for every day." />
        </div>
      </section>

      {/* Testimonials */}
      <section className="bg-white/50 py-24">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-center text-balance text-3xl font-semibold tracking-tight sm:text-4xl" data-reveal>Built for people who hate planning trips</h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            <Quote text="It planned 9 days across three cities without a single train over two hours. I would have spent a weekend on that." name="Maya R." trip="Japan, 9 days" />
            <Quote text="The budget actually held. Every hotel was near a station like it promised. Booked the whole thing in ten minutes." name="Daniel K." trip="Portugal, 6 days" />
            <Quote text="The day-of directions were the surprise. I never opened Google Maps the entire trip." name="Priya S." trip="Italy, 7 days" />
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-4xl px-6 py-24">
        <h2 className="text-center text-balance text-3xl font-semibold tracking-tight sm:text-4xl" data-reveal>Simple, honest pricing</h2>
        <p className="mx-auto mt-4 max-w-md text-center text-[#15110c]/55" data-reveal>Planning is free. You only pay partners when you book, at their live price.</p>
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          <PriceCard
            name="Free" price="$0" tagline="Plan as many trips as you like"
            features={["Unlimited AI itineraries", "Real places, photos, directions", "Save trips to your account", "Live flight and hotel search"]}
            cta="Start planning" highlight={false}
          />
          <PriceCard
            name="Booked" price="Live price" tagline="Pay only when you book"
            features={["Everything in Free", "In-app flight and hotel booking", "Secure Stripe checkout and receipt", "Day-of guide for every stop"]}
            cta="Plan and book" highlight
          />
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl px-6 py-24">
        <h2 className="text-center text-balance text-3xl font-semibold tracking-tight sm:text-4xl" data-reveal>Questions, answered</h2>
        <div className="mt-12">
          <Faq />
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-6 pb-24">
        <div className="grain relative mx-auto max-w-5xl overflow-hidden rounded-[2rem] bg-[#e8643c] px-8 py-20 text-center text-white shadow-lift" data-reveal>
          <h2 className="relative text-balance text-4xl font-semibold tracking-tight sm:text-5xl">Your next trip, planned to the minute.</h2>
          <p className="relative mx-auto mt-4 max-w-md text-white/85">Describe it in a sentence. We will handle the rest.</p>
          <Link href="/app" className="relative mt-8 inline-flex items-center gap-2 rounded-full bg-white px-7 py-4 text-sm font-semibold text-[#15110c] transition hover:bg-[#15110c] hover:text-white active:scale-95">
            Plan my trip, free
            <ArrowRight strokeWidth={2} className="size-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#15110c]/8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 py-12 text-center sm:flex-row sm:justify-between sm:text-left">
          <div className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#e8643c] text-sm font-bold text-white">{config.brandName.charAt(0)}</span>
            {config.brandName}
          </div>
          <div className="flex items-center gap-6 text-sm text-[#15110c]/55">
            <Link href="/app" className="transition hover:text-[#e8643c]">Plan a trip</Link>
            <Link href="/privacy" className="transition hover:text-[#e8643c]">Privacy</Link>
            <Link href="/terms" className="transition hover:text-[#e8643c]">Terms</Link>
          </div>
          <p className="text-xs text-[#15110c]/35">© 2026 {config.brandName}</p>
        </div>
      </footer>
    </main>
  );
}

/* ── pieces ─────────────────────────────────────────── */

function Stat({ n, l }: { n: string; l: string }) {
  return (
    <div className="px-4 py-3 text-center">
      <div className="text-xl font-semibold tracking-tight sm:text-2xl">{n}</div>
      <div className="mt-1 text-xs text-[#15110c]/50">{l}</div>
    </div>
  );
}

function Feature({ icon, eyebrow, title, body, points, visual, reverse }: {
  icon: React.ReactNode; eyebrow: string; title: string; body: string; points: string[]; visual: React.ReactNode; reverse?: boolean;
}) {
  return (
    <div className="grid items-center gap-12 md:grid-cols-2" data-reveal>
      <div className={reverse ? "md:order-2" : ""}>
        <div className="inline-flex items-center gap-2 rounded-full border border-[#15110c]/10 bg-white px-3 py-1.5 text-xs font-medium text-[#15110c]/65 shadow-soft">
          {icon}{eyebrow}
        </div>
        <h3 className="mt-5 text-balance text-3xl font-semibold tracking-tight">{title}</h3>
        <p className="mt-4 max-w-md text-lg leading-relaxed text-[#15110c]/55">{body}</p>
        <ul className="mt-6 space-y-2.5">
          {points.map((p) => (
            <li key={p} className="flex items-center gap-2.5 text-sm text-[#15110c]/75">
              <Check strokeWidth={2.5} className="size-4 shrink-0 text-[#1f9d6b]" />{p}
            </li>
          ))}
        </ul>
      </div>
      <div className={reverse ? "md:order-1" : ""}>{visual}</div>
    </div>
  );
}

function Step({ n, icon, title, body }: { n: string; icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-[#15110c]/10 bg-white p-6 shadow-soft transition hover:-translate-y-1 hover:shadow-lift" data-reveal>
      <div className="flex items-center justify-between">
        <div className="grid size-10 place-items-center rounded-xl bg-[#e8643c]/10">{icon}</div>
        <span className="text-sm font-semibold text-[#15110c]/25">{n}</span>
      </div>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-[#15110c]/55">{body}</p>
    </div>
  );
}

function Quote({ text, name, trip }: { text: string; name: string; trip: string }) {
  return (
    <figure className="rounded-2xl border border-[#15110c]/10 bg-white p-6 shadow-soft" data-reveal>
      <div className="flex gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => <Star key={i} strokeWidth={0} fill="#e8643c" className="size-4" />)}
      </div>
      <blockquote className="mt-4 text-[15px] leading-relaxed text-[#15110c]/80">{text}</blockquote>
      <figcaption className="mt-5 text-sm">
        <span className="font-semibold">{name}</span>
        <span className="text-[#15110c]/45"> · {trip}</span>
      </figcaption>
    </figure>
  );
}

function PriceCard({ name, price, tagline, features, cta, highlight }: {
  name: string; price: string; tagline: string; features: string[]; cta: string; highlight: boolean;
}) {
  return (
    <div data-reveal className={`relative rounded-3xl border p-8 ${highlight ? "border-[#e8643c] bg-white shadow-lift" : "border-[#15110c]/10 bg-white shadow-soft"}`}>
      {highlight && <span className="absolute -top-3 left-8 rounded-full bg-[#e8643c] px-3 py-1 text-xs font-semibold text-white">Most popular</span>}
      <div className="text-sm font-medium text-[#15110c]/55">{name}</div>
      <div className="mt-2 text-4xl font-semibold tracking-tight">{price}</div>
      <p className="mt-2 text-sm text-[#15110c]/55">{tagline}</p>
      <ul className="mt-6 space-y-3">
        {features.map((f) => (
          <li key={f} className="flex items-center gap-2.5 text-sm text-[#15110c]/75">
            <Check strokeWidth={2.5} className="size-4 shrink-0 text-[#1f9d6b]" />{f}
          </li>
        ))}
      </ul>
      <Link href="/app" className={`mt-8 flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition active:scale-95 ${highlight ? "bg-[#e8643c] text-white hover:bg-[#d4502a]" : "border border-[#15110c]/15 text-[#15110c] hover:border-[#e8643c] hover:text-[#e8643c]"}`}>
        {cta}<ArrowRight strokeWidth={2} className="size-4" />
      </Link>
    </div>
  );
}

/* ── mock visuals (clean, no emoji) ─────────────────── */

function MockRow({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#e8643c]/10">{icon}</div>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{title}</div>
        <div className="truncate text-xs text-[#15110c]/50">{sub}</div>
      </div>
    </div>
  );
}

function ItineraryMock() {
  const ic = "size-4 text-[#e8643c]";
  return (
    <div className="animate-float rounded-3xl border border-[#15110c]/10 bg-white p-5 shadow-lift">
      <div className="flex items-center justify-between border-b border-[#15110c]/8 pb-3">
        <div className="text-sm font-semibold">Day 2 · Kyoto</div>
        <span className="rounded-full bg-[#1f9d6b]/10 px-2.5 py-1 text-[11px] font-medium text-[#1f9d6b]">longest leg 17 min</span>
      </div>
      <div className="mt-4 space-y-3">
        <MockRow icon={<Hotel strokeWidth={1.75} className={ic} />} title="The Royal Park Hotel" sub="2 min to Sanjo Stn · $140" />
        <MockRow icon={<MapPinned strokeWidth={1.75} className={ic} />} title="Fushimi Inari Shrine" sub="09:00 · JR Nara line" />
        <MockRow icon={<Wallet strokeWidth={1.75} className={ic} />} title="Lunch in Gion" sub="12:30 · under budget" />
      </div>
    </div>
  );
}

function BookingMock() {
  return (
    <div className="animate-float-2 rounded-3xl border border-[#15110c]/10 bg-white p-5 shadow-lift">
      <div className="flex items-center gap-3 rounded-2xl border border-[#e8643c] bg-[#e8643c]/5 p-3">
        <div className="grid size-10 place-items-center rounded-lg bg-white"><Plane strokeWidth={1.75} className="size-5 text-[#e8643c]" /></div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">CGK → LIS</div>
          <div className="text-xs text-[#15110c]/50">nonstop · round trip</div>
        </div>
        <div className="text-sm font-semibold">$612</div>
      </div>
      <div className="mt-3 flex items-center gap-3 rounded-2xl border border-[#15110c]/10 p-3">
        <div className="grid size-10 place-items-center rounded-lg bg-[#15110c]/5"><Hotel strokeWidth={1.75} className="size-5 text-[#15110c]/70" /></div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Hotel Mundial</div>
          <div className="text-xs text-[#15110c]/50">4 nights · 8.6/10</div>
        </div>
        <div className="text-sm font-semibold">$528</div>
      </div>
      <div className="mt-4 flex items-center justify-between rounded-2xl bg-[#15110c] px-4 py-3 text-white">
        <span className="flex items-center gap-2 text-sm"><ShieldCheck strokeWidth={1.75} className="size-4" /> Secure checkout</span>
        <span className="text-sm font-semibold">Pay $1,140</span>
      </div>
    </div>
  );
}

function PhoneRow({ icon, title, meta }: { icon: React.ReactNode; title: string; meta: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#15110c]/10 bg-white p-3">
      <div className="grid size-8 place-items-center rounded-lg bg-[#e8643c]/10">{icon}</div>
      <div className="min-w-0 flex-1"><div className="truncate text-xs font-medium">{title}</div></div>
      <div className="text-[11px] text-[#15110c]/45">{meta}</div>
    </div>
  );
}

function PhoneMock() {
  return (
    <div className="mx-auto w-full max-w-[280px]" data-reveal>
      <div className="animate-float-3 rounded-[2.2rem] border-[6px] border-[#2a241c] bg-[#faf7f2] p-4 shadow-lift">
        <div className="mx-auto mb-4 h-1.5 w-16 rounded-full bg-[#2a241c]/30" />
        <div className="text-xs font-medium text-[#15110c]/45">Now</div>
        <div className="mt-1 text-lg font-semibold">Head to Arashiyama</div>
        <div className="mt-4 space-y-2.5">
          <PhoneRow icon={<Navigation strokeWidth={1.75} className="size-4 text-[#e8643c]" />} title="JR Sagano line, platform 32" meta="17 min" />
          <PhoneRow icon={<MapPinned strokeWidth={1.75} className="size-4 text-[#e8643c]" />} title="Bamboo Grove entrance" meta="5 min walk" />
        </div>
      </div>
    </div>
  );
}
