// Shared affiliate booking-link builders, used by the in-app Booking page and
// the plan email so both point at the same real sites. Booking and payment
// happen on the partner site; we only deep-link in with the trip pre-filled.

const CITY_IATA: Record<string, string> = {
  japan: "TYO", tokyo: "TYO", osaka: "KIX", kyoto: "KIX", bali: "DPS", indonesia: "CGK", jakarta: "CGK",
  korea: "SEL", seoul: "SEL", busan: "PUS", thailand: "BKK", bangkok: "BKK", singapore: "SIN", vietnam: "SGN",
  taiwan: "TPE", portugal: "LIS", lisbon: "LIS", porto: "OPO", italy: "ROM", rome: "ROM", france: "PAR", paris: "PAR",
  spain: "MAD", europe: "LON", london: "LON",
};

export function guessIata(dest: string): string {
  const key = dest.toLowerCase().split(/[\s,]+/).find((w) => CITY_IATA[w]);
  return key ? CITY_IATA[key] : "";
}

export function plusDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function yymmdd(d: string) {
  return d.replace(/-/g, "").slice(2);
}

export function flightsUrl(origin: string, dest: string, depart: string, ret: string, adults: number): string {
  if (/^[A-Z]{3}$/.test(origin) && /^[A-Z]{3}$/.test(dest)) {
    return `https://www.skyscanner.net/transport/flights/${origin.toLowerCase()}/${dest.toLowerCase()}/${yymmdd(depart)}/${yymmdd(ret)}/?adults=${adults}`;
  }
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(`flights from ${origin} to ${dest} on ${depart} returning ${ret} for ${adults} adults`)}`;
}

// Origin is chosen later (in the Booking page), so the email links to a flight
// search for the destination only.
export function flightsToDestUrl(dest: string, adults: number): string {
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(`flights to ${dest} for ${adults} adults`)}`;
}

export function hotelUrl(query: string, checkin: string, checkout: string, adults: number): string {
  return `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(query)}&checkin=${checkin}&checkout=${checkout}&group_adults=${adults}`;
}
