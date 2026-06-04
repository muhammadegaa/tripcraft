import { test, expect } from "@playwright/test";

// Backend contract tests. Tolerant of live keys (local) vs demo (CI). Never
// triggers a real booking (uses demo_ offer ids) or sends an email (only hits
// validation paths of the email routes).
test.describe("api", () => {
  test("GET /api/fx returns usable rates", async ({ request }) => {
    const r = await request.get("/api/fx");
    expect(r.ok()).toBeTruthy();
    const d = await r.json();
    expect(d.rates.USD).toBe(1);
    expect(typeof d.rates.EUR).toBe("number");
    expect(["live", "fallback"]).toContain(d.source);
  });

  test("GET /api/place responds with enrichment shape", async ({ request }) => {
    const r = await request.get("/api/place?q=" + encodeURIComponent("Belem Tower Lisbon"));
    expect(r.ok()).toBeTruthy();
    const d = await r.json();
    expect(d).toHaveProperty("enabled");
    if (d.found) expect(Array.isArray(d.photoNames)).toBeTruthy();
  });

  test("GET /api/airports autocompletes", async ({ request }) => {
    const r = await request.get("/api/airports?q=lond");
    expect(r.ok()).toBeTruthy();
    expect(Array.isArray((await r.json()).results)).toBeTruthy();
  });

  test("POST /api/flights/search returns offers", async ({ request }) => {
    const r = await request.post("/api/flights/search", {
      data: { origin: "CGK", destination: "LIS", departDate: "2026-08-01", returnDate: "2026-08-08", adults: 2 },
    });
    expect(r.ok()).toBeTruthy();
    const d = await r.json();
    expect(Array.isArray(d.offers)).toBeTruthy();
    if (d.offers.length) {
      expect(d.offers[0]).toHaveProperty("id");
      expect(d.offers[0]).toHaveProperty("currency");
    }
  });

  test("POST /api/hotels/search returns hotels", async ({ request }) => {
    const r = await request.post("/api/hotels/search", {
      data: { destination: "Lisbon", checkin: "2026-08-01", checkout: "2026-08-05", adults: 2 },
    });
    expect(r.ok()).toBeTruthy();
    const d = await r.json();
    expect(Array.isArray(d.hotels)).toBeTruthy();
    if (d.hotels.length) expect(d.hotels[0]).toHaveProperty("currency");
  });

  test("GET /api/hotels/details returns image array", async ({ request }) => {
    const r = await request.get("/api/hotels/details?id=demo_x");
    expect(r.ok()).toBeTruthy();
    expect(Array.isArray((await r.json()).images)).toBeTruthy();
  });

  test("POST /api/payment-intent creates an intent or simulates", async ({ request }) => {
    const r = await request.post("/api/payment-intent", { data: { amount: 200, currency: "usd", email: "test@example.com", destination: "Lisbon" } });
    expect(r.ok()).toBeTruthy();
    const d = await r.json();
    expect(Boolean(d.clientSecret) || d.simulated === true).toBeTruthy();
  });

  test("GET /api/payment-receipt is graceful on bad id", async ({ request }) => {
    const r = await request.get("/api/payment-receipt?pi=pi_nope");
    expect(r.ok()).toBeTruthy();
    expect(await r.json()).toHaveProperty("receiptUrl");
  });

  test("POST /api/generate validates and returns a known source", async ({ request }) => {
    const short = await request.post("/api/generate", { data: { input: "hi" } });
    expect(short.status()).toBe(400);
    const r = await request.post("/api/generate", { data: { input: "4 days in Lisbon, 2 people, seafood and viewpoints, hotels near a station" } });
    expect(r.ok()).toBeTruthy();
    const d = await r.json();
    expect(["claude", "canned", "fallback", "rate_limited"]).toContain(d.source);
    expect(Array.isArray(d.days)).toBeTruthy();
  });

  test("POST /api/improve returns a sharpened brief", async ({ request }) => {
    const r = await request.post("/api/improve", { data: { input: "trip to japan" } });
    expect(r.ok()).toBeTruthy();
    expect(typeof (await r.json()).improved).toBe("string");
  });

  test("POST /api/flights/order books a demo offer", async ({ request }) => {
    const r = await request.post("/api/flights/order", {
      data: { offerId: "demo_1", passengers: [{ id: "p1", given_name: "Ega", family_name: "S" }] },
    });
    expect(r.ok()).toBeTruthy();
    const d = await r.json();
    expect(d.ok).toBeTruthy();
    expect(typeof d.bookingReference).toBe("string");
  });

  test("POST /api/hotels/book books a demo offer", async ({ request }) => {
    const r = await request.post("/api/hotels/book", {
      data: { offerId: "demo_o1", email: "test@example.com", guests: [{ firstName: "Ega", lastName: "S" }] },
    });
    expect(r.ok()).toBeTruthy();
    const d = await r.json();
    expect(d.ok).toBeTruthy();
    expect(typeof d.bookingId).toBe("string");
  });

  test("POST /api/eticket returns a real PDF e-ticket", async ({ request }) => {
    const r = await request.post("/api/eticket", {
      data: {
        destination: "Tokyo",
        passengers: ["Ega S"],
        flight: { ref: "TC9K2LM", airline: "ANA", from: "CGK", to: "HND", depart: "06:15", arrive: "15:40", date: "2026-07-04", returnDate: "2026-07-11" },
        hotel: { id: "HX7P31Q", name: "Hotel Niwa Tokyo", checkin: "2026-07-04", checkout: "2026-07-11", nights: 7 },
        flightDisplay: "$520", hotelDisplay: "$780", total: "$1,300",
      },
    });
    expect(r.ok()).toBeTruthy();
    expect(r.headers()["content-type"]).toContain("application/pdf");
    const body = await r.body();
    expect(body.subarray(0, 5).toString()).toBe("%PDF-");
    expect(body.length).toBeGreaterThan(1000);
  });

  test("POST /api/eticket rejects an empty booking", async ({ request }) => {
    const r = await request.post("/api/eticket", { data: { destination: "Tokyo", passengers: [] } });
    expect(r.status()).toBe(400);
  });

  test("email routes reject bad input without sending", async ({ request }) => {
    const b = await request.post("/api/booking-email", { data: { email: "not-an-email", flight: { ref: "X", airline: "Y", route: "A-B", times: "1-2" } } });
    expect(b.status()).toBe(400);
    expect((await b.json()).reason).toBe("bad_email");

    const re = await request.post("/api/reserve-email", { data: { email: "not-an-email", destination: "Lisbon", days: [] } });
    expect(re.status()).toBe(400);
  });
});
