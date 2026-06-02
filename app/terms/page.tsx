import Link from "next/link";
import { config } from "@/lib/config";

export const metadata = { title: `Terms · ${config.brandName}` };

export default function Terms() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <Link href="/" className="text-sm text-[#15110c]/50 transition hover:text-[#e8643c]">← Back</Link>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">Terms of use</h1>
      <p className="mt-2 text-sm text-[#15110c]/50">Last updated June 2, 2026</p>

      <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-[#15110c]/75">
        <p>
          {config.brandName} helps you plan trips. By using it you agree to these terms. They are short and written to be read.
        </p>

        <Section title="What we provide">
          <p>
            We generate a suggested itinerary from what you tell us, and show you real places, photos, and directions. Plans are a starting point, not a guarantee. Opening hours, prices, availability, and travel times change. Check the details before you rely on them.
          </p>
        </Section>

        <Section title="Prices and booking">
          <p>
            Prices shown inside a plan are <strong>estimates</strong>, not quotes. When you book, we send you to partner sites (Skyscanner, Booking.com) where you see live prices and complete the purchase. Your booking is a contract between you and that provider, under their terms. We are not the travel agent or merchant for those bookings.
          </p>
        </Section>

        <Section title="Your responsibilities">
          <ul className="list-disc space-y-1 pl-5">
            <li>Give accurate information when planning, and verify anything that matters (visas, passports, health rules, opening times).</li>
            <li>Use the service for lawful, personal trip planning.</li>
            <li>Do not abuse, scrape, or overload the service.</li>
          </ul>
        </Section>

        <Section title="Liability">
          <p>
            {config.brandName} is provided as is. We do our best to be accurate but we are not liable for losses from relying on a plan, a missed connection, a closed venue, or anything that happens on a partner site. Where the law allows, our liability is limited to what you paid us, which for the free planner is nothing.
          </p>
        </Section>

        <Section title="Changes">
          <p>
            We may update these terms as the product grows. Material changes will be reflected by the date at the top of this page.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions: <a className="text-[#e8643c] underline-offset-2 hover:underline" href={`mailto:${config.contactEmail}`}>{config.contactEmail}</a>.
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
