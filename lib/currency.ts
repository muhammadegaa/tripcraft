// One place for money. Rates are USD-based (1 USD = rates[code]), fetched live
// from /api/fx, so converting GBP flights and USD hotels into a single display
// currency uses real rates, not a hardcoded table. That makes a combined total
// honest.

export type Currency = { code: string; symbol: string; name: string };

export const CURRENCIES: Currency[] = [
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "IDR", symbol: "Rp", name: "Indonesian Rupiah" },
  { code: "SGD", symbol: "S$", name: "Singapore Dollar" },
  { code: "JPY", symbol: "¥", name: "Japanese Yen" },
  { code: "AUD", symbol: "A$", name: "Australian Dollar" },
];

const ZERO_DECIMAL = new Set(["IDR", "JPY", "KRW"]);

export function convert(amount: number, from: string, to: string, rates: Record<string, number> | null): number | null {
  if (!isFinite(amount)) return null;
  if (from === to) return amount;
  if (!rates || !rates[from] || !rates[to]) return null;
  return (amount / rates[from]) * rates[to];
}

export function formatMoney(amount: number, code: string): string {
  if (!isFinite(amount)) return "";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
      maximumFractionDigits: ZERO_DECIMAL.has(code) ? 0 : (amount >= 100 ? 0 : 2),
    }).format(amount);
  } catch {
    return `${code} ${Math.round(amount).toLocaleString()}`;
  }
}

// Best-effort parse of a freeform price string to a number. Generation outputs
// clean USD like "$120", so this handles "$120", "1,260", "120.50".
export function parseAmount(s: string | number | null | undefined): number | null {
  if (s == null) return null;
  if (typeof s === "number") return isFinite(s) ? s : null;
  const cleaned = s.replace(/[^0-9.]/g, "");
  const n = Number(cleaned);
  return isFinite(n) && n > 0 ? n : null;
}
