# Tripcraft — Production Readiness Plan

Goal: a real, production-grade, YC-worthy AI travel product. No fakes, no theater.
Everything the UI claims must be true.

---

## 1. Brutally honest current state

| Feature | State |
|---|---|
| AI itinerary (Claude) | Real **when funded** — currently OUT OF CREDITS, serving canned plans |
| Place photos / ratings / reviews (Google Places) | **Real** |
| Flight search (Duffel) | **Real** offers |
| Flight booking / "ticket" | **FAKE** — sandbox can't book real-airline offers, so we mint a fake reference |
| Hotel search + book (LiteAPI) | Real, but **sandbox** (not production inventory/payments) |
| Payment (Stripe) | Real Payment Element, **test mode** |
| Directions | **FAKE** — hardcoded map squiggle, fixed "8 min", generic steps |
| Live companion | **FAKE** — mocked GPS + time + progress |
| Trip agent | **FAKE** — canned keyword replies, scripted "thinking" |
| Itinerary prices | **FAKE** — invented by the LLM, not quotes |
| Currency | **INCONSISTENT** — flights GBP, hotels USD, budget IDR, total summed with a hardcoded FX table |
| Auth + My Trips + airport autocomplete | **Real** |
| Error handling / observability / tests | **Missing** |

Verdict: a strong prototype, **not launch-ready**. Shipping as-is would mislead users.

---

## 2. The one decision that shapes everything: the booking model

Real in-app flight + hotel booking with real money is a **regulated, gated, multi-week** effort
(Duffel live accreditation, LiteAPI production, Stripe as merchant-of-record, refunds/liability,
likely a registered business + travel-seller compliance). It cannot be "made real" by code alone.

So pick the v1 launch shape:

- **A — Real planner + affiliate booking (recommended for a fast, honest launch).**
  Real itinerary, real places, real directions, accounts. Booking = deep-link/affiliate to
  real OTAs (Skyscanner, Booking.com, Kiwi). 100% real and honest, monetizable, shippable in days.
  In-app booking becomes v2 once accreditations land.
- **B — Hold launch for real in-app booking.** Weeks-to-months, blocked on external approvals.

This plan assumes **A** for v1 and **B** as v2. Change if you disagree.

---

## 3. Phased roadmap

### Phase 0 — Honesty + foundations (1-2 days, all code)
- Remove every fake: delete the mocked **live companion**, the canned **agent** (or rebuild as a
  real Claude tool-use agent later), the fake **flight ticket** confirmation, the fake **directions**.
- Replace directions with **real**: Google Directions API (route, distance, turn-by-turn) or a
  real "Open in Google Maps" deep link.
- Stop silent fakery: if Claude fails, show an **honest error/retry**, never a canned plan dressed
  as real. Mark canned content only in explicit dev mode.
- Error handling on every API route (typed errors, timeouts, retries w/ backoff).
- Observability: Sentry (errors) + structured logs + uptime check.
- Security: restrict the Google Maps key (HTTP referrer + API allowlist), server-only secrets,
  tighten Firestore rules, durable rate limiting (Upstash/Vercel KV), input validation.

### Phase 1 — Real planner launch (3-5 days, code; needs your accounts)
- **Claude**: funded credits + streaming generation + caching + graceful real errors.
- **Itinerary**: real places (Places), real directions, honest "from ~X" price ranges (not fake exact).
- **Currency**: one canonical currency end-to-end (chosen by user/market). Request supplier prices
  in it where the API allows (LiteAPI takes a currency; Duffel returns source currency, so use a
  real FX rate provider and show the original alongside). No hardcoded FX, no mixed symbols.
- **Booking handoff**: real affiliate deep links per flight/hotel (Skyscanner/Booking.com/Kiwi).
- **Accounts**: Google sign-in (enable provider + domains + rules), My Trips, save/share/email.
- **UI/UX pass** (YC-worthy): design system, real loading/skeleton/empty/error states, mobile-first,
  distinctive brand, micro-interactions, accessibility (keyboard, ARIA, contrast).
- **Legal**: privacy policy, terms, cookie/consent, GDPR-safe email capture.
- **Testing + CI**: unit tests for core logic, Playwright e2e for the critical flow, CI on every PR.
- **Perf**: image optimization, caching, Core Web Vitals green.

### Phase 2 — Real in-app booking (weeks, gated on YOU)
- Duffel **live** accreditation → real flight PNRs, passenger/ancillaries/changes/refunds.
- LiteAPI **production** + contracts.
- Stripe **live** + merchant-of-record + refund/dispute handling + business entity.
- Real e-ticket + voucher emails, order management, customer support surface.
- Rebuild the agent as a real Claude tool-use agent that searches + books for real.

---

## 4. Production-grade cross-cutting checklist
- Errors: typed API errors, user-facing error/retry/empty/loading states, no swallowed failures.
- Reliability: timeouts, retries+backoff, idempotency on writes/orders, durable rate limits.
- Observability: Sentry, request logging, alerts, uptime, key business events.
- Security: secret hygiene, API key restrictions, Firestore rules, input sanitization, auth on writes.
- Performance: streaming, caching, image opt, bundle budget, CWV.
- Accessibility: WCAG AA (keyboard, focus, ARIA, contrast).
- Testing: unit + e2e + CI gate.
- Legal/compliance: privacy, terms, consent, data retention, travel-seller rules (for booking).

---

## 5. What YOU must obtain (I can't code these)
- [ ] Claude credits (unblocks planning today)
- [ ] Google Maps Platform billing on + key restrictions
- [ ] Affiliate accounts (Skyscanner/Booking.com/Kiwi) for v1 booking links
- [ ] Domain + final brand/name
- [ ] (v2) Duffel live accreditation, LiteAPI production, Stripe live + MoR, business entity, travel-seller compliance

---

## 6. First execution slice (on your approval)
Phase 0 in one pass: cut all fakes, real directions, honest errors, Sentry, key restrictions,
durable rate limiting. Then Phase 1 UI/UX + planner hardening.
