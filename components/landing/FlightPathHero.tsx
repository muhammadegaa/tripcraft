"use client";

import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";

function Chip({ city, className }: { city: string; className: string }) {
  return (
    <div className={`absolute flex items-center gap-1.5 rounded-full border border-[#15110c]/8 bg-white/90 px-3 py-1.5 text-xs font-medium text-[#15110c]/75 shadow-soft backdrop-blur ${className}`}>
      <MapPin strokeWidth={2} className="size-3.5 text-[#e8643c]" />
      {city}
    </div>
  );
}

// A plane glides along a curved flight path while the dashed trail draws in
// behind it. The plane is an SVG element animated with SMIL animateMotion along
// the same path, so it stays locked to the curve and scales with the viewBox at
// any width (no CSS offset-path coordinate mismatch). Reduced-motion renders a
// tasteful "almost there" still.
const ARC = "M 60 250 C 190 70, 430 70, 560 250";
const SPLINES = "0 0 1 1; 0.65 0 0.35 1; 0 0 1 1"; // hold, glide, hold
const KEYTIMES = "0; 0.06; 0.94; 1";

export default function FlightPathHero() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(m.matches);
    const on = () => setReduced(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);

  return (
    <div className="relative mx-auto w-full max-w-[620px]">
      <div className="animate-drift pointer-events-none absolute left-1/2 top-[28%] -z-10 h-56 w-80 -translate-x-1/2 rounded-full bg-[#e8643c]/15 blur-3xl" />

      {/* floating destinations reinforce 'anywhere' */}
      <Chip city="Lisbon" className="left-0 top-[58%] animate-float" />
      <Chip city="Tokyo" className="left-1/2 top-1 hidden -translate-x-1/2 animate-float-2 sm:flex" />
      <Chip city="Bali" className="right-0 top-[54%] animate-float-3" />

      <svg viewBox="0 0 620 300" className="w-full overflow-visible" aria-hidden="true">

        {/* faint full arc */}
        <path d={ARC} stroke="#e8643c" strokeOpacity="0.16" strokeWidth="2" strokeLinecap="round" fill="none" />

        {/* dashed trail that draws in */}
        <path d={ARC} pathLength={1} stroke="#e8643c" strokeWidth="2.5" strokeLinecap="round" fill="none"
          strokeDasharray={reduced ? "0.018 0.026" : "1 1"} strokeDashoffset={reduced ? 0 : 1}>
          {!reduced && (
            <animate attributeName="stroke-dashoffset" dur="11s" repeatCount="indefinite"
              values="1; 1; 0; 0" keyTimes={KEYTIMES} calcMode="spline" keySplines={SPLINES} />
          )}
          {!reduced && (
            <animate attributeName="stroke-dasharray" dur="11s" repeatCount="indefinite"
              values="0 1; 1 0; 1 0; 0 1" keyTimes={KEYTIMES} calcMode="spline" keySplines={SPLINES} />
          )}
        </path>

        {/* origin pin (pulsing) */}
        <circle cx="60" cy="250" r="5" fill="#15110c" />
        <circle cx="60" cy="250" r="5" fill="none" stroke="#e8643c" strokeWidth="2">
          {!reduced && <animate attributeName="r" dur="2.6s" repeatCount="indefinite" values="5; 14; 5" calcMode="spline" keySplines="0.16 1 0.3 1; 0.16 1 0.3 1" />}
          {!reduced && <animate attributeName="opacity" dur="2.6s" repeatCount="indefinite" values="0.5; 0; 0.5" />}
        </circle>
        {/* destination pin */}
        <circle cx="560" cy="250" r="5.5" fill="#e8643c" />

        {/* the plane, centered on (0,0), pointing +x, moved along the arc */}
        <g>
          <g transform="scale(1.15)">
            <path d="M -11 -7 L 13 0 L -11 7 L -4 0 Z" fill="#15110c" />
            <path d="M -11 7 L -4 0 L 13 0 Z" fill="#15110c" fillOpacity="0.55" />
            <path d="M -4 0 L 13 0" stroke="#faf7f2" strokeWidth="0.8" strokeOpacity="0.5" />
          </g>
          {!reduced ? (
            <>
              <animateMotion dur="11s" repeatCount="indefinite" rotate="auto"
                keyPoints="0; 0; 1; 1" keyTimes={KEYTIMES} calcMode="spline" keySplines={SPLINES} path={ARC} />
              <animate attributeName="opacity" dur="11s" repeatCount="indefinite"
                values="0; 1; 1; 0; 0" keyTimes="0; 0.06; 0.9; 0.96; 1"
                calcMode="spline" keySplines="0.4 0 1 1; 0 0 1 1; 0.4 0 1 1; 0 0 1 1" />
            </>
          ) : (
            // static: parked near the destination, trail mostly drawn
            <animateMotion dur="0.001s" fill="freeze" keyPoints="0.8; 0.8" keyTimes="0;1" path={ARC} rotate="auto" />
          )}
        </g>
      </svg>
    </div>
  );
}
