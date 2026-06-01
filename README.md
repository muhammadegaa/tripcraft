# Tripcraft

Describe a trip in plain language → a constraint-perfect, day-by-day itinerary you can book in-app, plus a live day-of companion.

- **Plan** — Claude turns "14 days in Japan, 3 people, IDR 65M, hotels near stations, no train over 2h" into a real itinerary (hotels, tickets, stops, directions).
- **Book** — in-app Stripe deposit (Payment Element, no redirect).
- **Live companion** — where you are vs. where the plan says you should be, next move, re-flow when plans change.

## Stack
Next.js (App Router) · Tailwind v4 · Claude (`claude-haiku-4-5`) · Stripe · Firebase (anon auth + Firestore) · Vercel.

Every integration degrades gracefully: with no keys, the app runs on canned itineraries + simulated checkout + no persistence, and lights up each capability as its keys land.

## Setup
```bash
npm install
cp .env.local.example .env.local   # fill in what you have (all optional)
npm run dev
```

Stripe pricing (one-time, creates a Product + Price in your Stripe account):
```bash
node --env-file=.env.local scripts/setup-stripe.mjs
```
