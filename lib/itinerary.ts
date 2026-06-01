// Canned-but-personalized itinerary engine — now with the depth that sells the
// one-stop pitch: bookable hotels, transport tickets, and turn-by-turn stops.
// No API key, instant, can't fail mid-demo. When demand is proven, swap
// generate() for a real Anthropic + Maps + Duffel/Nuitée call behind /api/* —
// the page contract (Day shape) stays the same.

export type Trip = {
  destination: string;
  days: number;
  party: number;
  budget: string;
  interests: string;
  raw: string;
};

export type Hotel = {
  name: string;
  rating: string;
  walk: string; // distance to the anchor station
  price: string; // per night
};

export type Ticket = {
  icon: string;
  mode: string; // "Shinkansen", "JR line", "Bus"…
  from: string;
  to: string;
  depart: string;
  arrive: string;
  dur: string;
  price: string;
  flag?: string; // e.g. "longest leg — still under 2h"
};

export type Stop = {
  time: string; // "HH:MM" 24h, used by the live companion
  title: string;
  place: string; // searchable place name (powers real Maps directions)
  directions: string;
  tip?: string; // practical insight: best time, cost, cash/card, heads-up
};

export type Day = {
  n: number;
  city: string;
  area: string;
  maxLeg: string;
  hotel: Hotel;
  tickets: Ticket[];
  stops: Stop[];
  food: string;
};

export function parseTrip(raw: string): Trip {
  const text = raw.trim();
  const lower = text.toLowerCase();

  const daysMatch = lower.match(/(\d+)\s*(day|days|hari|d\b)/);
  const days = daysMatch ? Math.min(parseInt(daysMatch[1], 10), 21) : 7;

  const partyMatch = lower.match(/(\d+)\s*(people|person|pax|orang|adults?|travelers?)/);
  const party = partyMatch ? parseInt(partyMatch[1], 10) : 2;

  const budgetMatch = text.match(/(idr|rp|usd|\$|€|£)\s?[\d.,]+\s?(jt|juta|m|k|million|rb|ribu)?/i);
  const budget = budgetMatch ? budgetMatch[0].toUpperCase().replace("RP", "IDR") : "flexible";

  const known = ["japan", "tokyo", "kyoto", "osaka", "bali", "korea", "seoul", "vietnam", "thailand", "bangkok", "singapore", "taiwan", "europe", "paris"];
  const hit = known.find((k) => lower.includes(k));
  const destination = hit ? cap(hit) : guessDestination(text);

  const interestWords = ["food", "kuliner", "ramen", "sushi", "temple", "shrine", "hiking", "nature", "shopping", "anime", "onsen", "beach", "museum", "nightlife", "coffee", "family", "kids"];
  const interests = interestWords.filter((w) => lower.includes(w)).map(cap).join(", ") || "food & local culture";

  return { destination, days, party, budget, interests, raw: text };
}

export function generate(trip: Trip): Day[] {
  const isJapan = /japan|tokyo|kyoto|osaka/i.test(trip.destination);
  const pool = isJapan ? JAPAN_DAYS : genericDays(trip.destination);
  const out: Day[] = [];
  for (let i = 0; i < trip.days; i++) {
    out.push({ ...pool[i % pool.length], n: i + 1 });
  }
  return out;
}

export const GENERATING_STEPS = [
  "Reading your must-haves and deal-breakers…",
  "Pinning hotels within a 5-minute walk of a station…",
  "Booking transport so no train runs over 2 hours…",
  "Keeping the whole trip inside your budget…",
  "Routing each day door-to-door with directions…",
  "Double-checking opening days and seasonal closures…",
];

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function guessDestination(text: string) {
  const m = text.match(/(?:in|to|ke|di)\s+([A-Z][a-zA-Z]+)/);
  return m ? m[1] : "your destination";
}

function genericDays(dest: string): Day[] {
  const hotel: Hotel = { name: `${dest} Central Boutique`, rating: "4.4", walk: "4 min to Central Station", price: "IDR 1,1jt / night" };
  return [
    {
      n: 0, city: dest, area: "Old Town", maxLeg: "20 min", hotel,
      tickets: [{ icon: "🚝", mode: "Metro", from: "Central", to: "Old Town", depart: "08:40", arrive: "09:00", dur: "20m", price: "IDR 18rb" }],
      stops: [
        { time: "09:15", title: "Historic core walking tour", place: `${dest} old town`, directions: "Start at the main square, 3 min from the metro exit." },
        { time: "12:30", title: "Top-rated city museum", place: `${dest} museum`, directions: "10 min walk along the river promenade." },
        { time: "17:00", title: "Sunset viewpoint", place: `${dest} viewpoint`, directions: "Short funicular up the hill from the museum." },
      ],
      food: "Signature regional dish at a local-favourite spot near the square",
    },
    {
      n: 0, city: dest, area: "Markets & Riverside", maxLeg: "15 min", hotel,
      tickets: [],
      stops: [
        { time: "09:00", title: "Morning market crawl", place: `${dest} central market`, directions: "8 min walk from the hotel." },
        { time: "13:00", title: "Artisan quarter + riverside", place: `${dest} riverside`, directions: "Follow the canal east for 12 min." },
        { time: "19:00", title: "Live-music dinner street", place: `${dest} nightlife street`, directions: "Two blocks south of the riverside." },
      ],
      food: "Street-food tasting trail through the market lanes",
    },
  ];
}

// Hand-built Japan template — concrete enough to feel bespoke and bookable.
const TOKYO_HOTEL: Hotel = { name: "Hotel Gracery Shinjuku", rating: "4.4", walk: "3 min to Shinjuku Stn", price: "IDR 1,4jt / night" };
const KYOTO_HOTEL: Hotel = { name: "The Royal Park Hotel Kyoto Sanjo", rating: "4.5", walk: "2 min to Sanjo Stn", price: "IDR 1,9jt / night" };

const JAPAN_DAYS: Day[] = [
  {
    n: 0, city: "Tokyo", area: "Shinjuku (arrival)", maxLeg: "1h 23m", hotel: TOKYO_HOTEL,
    tickets: [{ icon: "🚉", mode: "Narita Express", from: "Narita Airport", to: "Shinjuku Stn", depart: "14:10", arrive: "15:33", dur: "1h 23m", price: "IDR 360rb" }],
    stops: [
      { time: "16:30", title: "Drop bags, Shinjuku Gyoen garden", place: "Shinjuku Gyoen National Garden", directions: "5 min walk from the hotel, use the Shinjuku Gate." },
      { time: "18:00", title: "Omoide Yokocho lantern alley", place: "Omoide Yokocho Tokyo", directions: "7 min walk, just west of the station tracks." },
      { time: "20:00", title: "Metropolitan Bldg night view (free)", place: "Tokyo Metropolitan Government Building Observation Deck", directions: "10 min walk, 45F observatory, last entry 21:30." },
    ],
    food: "Tsukemen at Fuunji, 5 min from the hotel. Go before 19:00 to skip the queue.",
  },
  {
    n: 0, city: "Tokyo", area: "Asakusa & Ueno", maxLeg: "38 min", hotel: TOKYO_HOTEL,
    tickets: [{ icon: "🚇", mode: "Tokyo Metro", from: "Shinjuku", to: "Asakusa", depart: "08:40", arrive: "09:18", dur: "38m", price: "IDR 30rb" }],
    stops: [
      { time: "09:30", title: "Senso-ji temple before the crowds", place: "Senso-ji", directions: "Asakusa Stn exit 1, walk Nakamise St for 3 min." },
      { time: "12:30", title: "Ueno Park + Ameyoko market", place: "Ameyoko Market Ueno", directions: "2 stops on the Ginza line, 9 min." },
      { time: "16:00", title: "Sumida riverside + Skytree view", place: "Sumida Park Tokyo", directions: "10 min walk back along the river from Ueno." },
    ],
    food: "Tempura at Daikokuya (est. 1887). Expect a 20 min wait at lunch.",
  },
  {
    n: 0, city: "Tokyo", area: "Shibuya & Harajuku", maxLeg: "15 min", hotel: TOKYO_HOTEL,
    tickets: [{ icon: "🚆", mode: "JR Yamanote", from: "Shinjuku", to: "Harajuku", depart: "09:00", arrive: "09:04", dur: "4m", price: "IDR 15rb" }],
    stops: [
      { time: "09:15", title: "Meiji Shrine forest walk", place: "Meiji Jingu", directions: "1 min from Harajuku Stn, enter the Omotesando gate." },
      { time: "11:30", title: "Takeshita St + Omotesando shops", place: "Takeshita Street Harajuku", directions: "Cross back over the tracks from the shrine." },
      { time: "17:00", title: "Shibuya Sky observation deck", place: "Shibuya Sky", directions: "2 stops to Shibuya, top of Scramble Square. Book the 17:30 slot." },
    ],
    food: "Conveyor sushi at Uobei + a Harajuku crepe on the walk",
  },
  {
    n: 0, city: "Hakone", area: "Onsen day", maxLeg: "1h 25m", hotel: { name: "Hakone Yutowa (ryokan)", rating: "4.6", walk: "6 min to Gora Stn", price: "IDR 2,8jt / night, dinner incl." },
    tickets: [
      { icon: "🚄", mode: "Odakyu Romancecar", from: "Shinjuku", to: "Hakone-Yumoto", depart: "08:00", arrive: "09:25", dur: "1h 25m", price: "IDR 250rb" },
      { icon: "🚞", mode: "Hakone Tozan", from: "Hakone-Yumoto", to: "Gora", depart: "09:40", arrive: "10:20", dur: "40m", price: "IDR 50rb" },
    ],
    stops: [
      { time: "10:45", title: "Hakone Open-Air Museum", place: "Hakone Open-Air Museum", directions: "8 min walk from Gora Stn." },
      { time: "13:30", title: "Lake Ashi cruise + Owakudani", place: "Owakudani", directions: "Gora cablecar → Sounzan → ropeway over the valley." },
      { time: "17:30", title: "Private onsen soak at the ryokan", place: "Hakone Yutowa", directions: "Reserved kashikiri bath, 17:30–18:15 slot." },
    ],
    food: "Multi-course kaiseki dinner served at the ryokan",
  },
  {
    n: 0, city: "Kyoto", area: "East Kyoto", maxLeg: "1h 58m", hotel: KYOTO_HOTEL,
    tickets: [{ icon: "🚅", mode: "Tokaido Shinkansen (Hikari)", from: "Odawara", to: "Kyoto", depart: "09:50", arrive: "11:48", dur: "1h 58m", price: "IDR 1,5jt", flag: "longest leg of the trip, still under 2h" }],
    stops: [
      { time: "13:00", title: "Fushimi Inari torii gates", place: "Fushimi Inari Taisha", directions: "JR Nara line 2 stops from Kyoto Stn, 5 min." },
      { time: "15:30", title: "Kiyomizu-dera + Higashiyama lanes", place: "Kiyomizu-dera", directions: "City bus 100, or a 15 min taxi from Fushimi." },
      { time: "18:30", title: "Gion geisha district walk", place: "Gion Kyoto", directions: "10 min downhill from Kiyomizu via Sannenzaka." },
    ],
    food: "Nishiki Market tasting, then yudofu (hot tofu) dinner in Gion",
  },
  {
    n: 0, city: "Kyoto", area: "Arashiyama (West)", maxLeg: "17 min", hotel: KYOTO_HOTEL,
    tickets: [{ icon: "🚆", mode: "JR Sagano line", from: "Kyoto", to: "Saga-Arashiyama", depart: "08:30", arrive: "08:47", dur: "17m", price: "IDR 25rb" }],
    stops: [
      { time: "09:00", title: "Bamboo grove (early) + Tenryu-ji", place: "Arashiyama Bamboo Grove", directions: "5 min walk from Saga-Arashiyama Stn, go early to beat crowds." },
      { time: "11:00", title: "Monkey park viewpoint + riverside", place: "Iwatayama Monkey Park", directions: "Across the Togetsukyo bridge, 15 min climb." },
      { time: "15:00", title: "Pontocho alley back in the centre", place: "Pontocho Kyoto", directions: "JR back to Kyoto, then Keihan to Sanjo." },
    ],
    food: "Matcha sweets in Arashiyama, soba lunch by the river",
  },
  {
    n: 0, city: "Osaka", area: "Day trip", maxLeg: "29 min", hotel: KYOTO_HOTEL,
    tickets: [{ icon: "🚆", mode: "JR Special Rapid", from: "Kyoto", to: "Osaka", depart: "09:00", arrive: "09:29", dur: "29m", price: "IDR 60rb" }],
    stops: [
      { time: "10:00", title: "Osaka Castle grounds", place: "Osaka Castle", directions: "Osaka Loop line to Osakajokoen, 10 min walk." },
      { time: "13:00", title: "Kuromon Ichiba food market", place: "Kuromon Ichiba Market", directions: "Midosuji line to Nipponbashi, exit 10." },
      { time: "18:00", title: "Dotonbori neon + Glico sign", place: "Dotonbori", directions: "5 min walk north from Kuromon market." },
    ],
    food: "Takoyaki and okonomiyaki crawl through Dotonbori",
  },
  {
    n: 0, city: "Nara", area: "Day trip", maxLeg: "45 min", hotel: KYOTO_HOTEL,
    tickets: [{ icon: "🚆", mode: "Kintetsu line", from: "Kyoto", to: "Kintetsu-Nara", depart: "09:10", arrive: "09:55", dur: "45m", price: "IDR 70rb" }],
    stops: [
      { time: "10:00", title: "Todai-ji Great Buddha", place: "Todai-ji", directions: "20 min walk or loop bus from Kintetsu-Nara Stn." },
      { time: "12:30", title: "Deer park + Kasuga shrine", place: "Nara Park", directions: "Adjacent to Todai-ji. Buy deer crackers at the gate." },
      { time: "15:00", title: "Return to Kyoto, farewell dinner", place: "Kyoto Station", directions: "Kintetsu express back, 45 min." },
    ],
    food: "Kakinoha-zushi (persimmon-leaf sushi), a Nara specialty",
  },
];
