import Link from "next/link";
import { config } from "@/lib/config";

export const metadata = { title: `Privacy · ${config.brandName}` };

export default function Privacy() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <Link href="/" className="text-sm text-[#15110c]/50 transition hover:text-[#e8643c]">← Back</Link>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">Privacy</h1>
      <p className="mt-2 text-sm text-[#15110c]/50">Last updated June 2, 2026</p>

      <div className="prose-tight mt-8 space-y-6 text-[15px] leading-relaxed text-[#15110c]/75">
        <p>
          {config.brandName} is a trip planner. This page explains, in plain terms, what we collect and why.
          We keep it minimal on purpose.
        </p>

        <Section title="What we collect">
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Your trip brief.</strong> The text you type to plan a trip, so we can build the itinerary.</li>
            <li><strong>Your email, only if you give it.</strong> When you ask us to email you a plan, we store that address to send it and the occasional travel tip.</li>
            <li><strong>Saved trips.</strong> If you sign in, the itineraries you save are stored against your account so you can come back to them.</li>
            <li><strong>Basic usage events.</strong> Anonymous counts (a plan was generated, a page was viewed) to understand what works. No tracking pixels, no ad networks.</li>
          </ul>
        </Section>

        <Section title="Services we use">
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Anthropic (Claude)</strong> generates your itinerary from your brief.</li>
            <li><strong>Google Places</strong> supplies photos, ratings, and reviews for places in your plan.</li>
            <li><strong>Firebase</strong> handles sign-in and stores your saved trips.</li>
            <li><strong>Resend</strong> delivers the plan to your inbox when you ask for it.</li>
          </ul>
          <p className="mt-3">When you choose to book, we hand you off to partner sites (Skyscanner, Booking.com). Payment happens there, not here. We never see or store your card.</p>
        </Section>

        <Section title="What we do not do">
          <ul className="list-disc space-y-1 pl-5">
            <li>We do not sell your data.</li>
            <li>We do not store payment details.</li>
            <li>We do not email you without you asking, beyond the plan you requested and rare product updates you can opt out of.</li>
          </ul>
        </Section>

        <Section title="Your choices">
          <p>
            Want your email removed or your saved trips deleted? Email <a className="text-[#e8643c] underline-offset-2 hover:underline" href={`mailto:${config.contactEmail}`}>{config.contactEmail}</a> and we will do it. Every marketing email has an unsubscribe link.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about privacy: <a className="text-[#e8643c] underline-offset-2 hover:underline" href={`mailto:${config.contactEmail}`}>{config.contactEmail}</a>.
          </p>
        </Section>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold text-[#15110c]">{title}</h2>
      {children}
    </section>
  );
}
