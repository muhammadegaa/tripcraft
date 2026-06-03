"use client";

import { useEffect } from "react";

// Scroll reveals. Where the browser supports native scroll-driven animations
// (animation-timeline: view()), CSS handles it and this does nothing. Otherwise
// it adds .is-visible as elements enter. Honors prefers-reduced-motion.
export default function Reveal() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (CSS.supports?.("animation-timeline: view()")) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      document.querySelectorAll("[data-reveal]").forEach((el) => el.classList.add("is-visible"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) { e.target.classList.add("is-visible"); io.unobserve(e.target); }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.12 }
    );
    document.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return null;
}
