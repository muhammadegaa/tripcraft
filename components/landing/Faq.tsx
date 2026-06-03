"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

const ITEMS = [
  ["Is it free to plan a trip?", "Yes. Describe your trip and get a full day-by-day plan for free. You only pay when you book flights and hotels, at the live partner price."],
  ["Where does my booking actually happen?", "Inside the app. You pick real flights and hotels, pay securely through Stripe, and get a confirmation and receipt by email. No hopping between tabs."],
  ["Which destinations are supported?", "Anywhere. Tripcraft plans trips worldwide, with real places, photos, directions, and live flight and hotel inventory."],
  ["How does it handle my budget and constraints?", "You set the budget, dates, pace, and any dealbreakers. The plan honors them: stays near transit, no exhausting travel days, everything inside your number."],
  ["What about my data?", "We store only what we need to build and save your trips, and never sell it. See our privacy policy for the details."],
];

export default function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="mx-auto max-w-2xl divide-y divide-[#15110c]/10">
      {ITEMS.map(([q, a], i) => (
        <div key={i} data-reveal>
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="flex w-full items-center justify-between gap-4 py-5 text-left"
            aria-expanded={open === i}
          >
            <span className="text-[17px] font-medium text-[#15110c]">{q}</span>
            <Plus strokeWidth={2} className={`size-5 shrink-0 text-[#e8643c] transition-transform duration-300 ${open === i ? "rotate-45" : ""}`} />
          </button>
          <div className={`grid transition-all duration-300 ease-out ${open === i ? "grid-rows-[1fr] pb-5 opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
            <div className="overflow-hidden">
              <p className="max-w-prose text-[15px] leading-relaxed text-[#15110c]/60">{a}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
