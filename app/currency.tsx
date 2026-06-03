"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { convert, formatMoney } from "@/lib/currency";

type Ctx = {
  currency: string;
  setCurrency: (c: string) => void;
  rates: Record<string, number> | null;
  // Convert `amount` from its native currency into the display currency and
  // format it. Falls back to the native currency if rates aren't loaded yet.
  show: (amount: number, from: string) => string;
};

const CurrencyCtx = createContext<Ctx | null>(null);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCur] = useState("USD");
  const [rates, setRates] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("tc_currency");
      if (saved) setCur(saved);
    } catch { /* ignore */ }
    fetch("/api/fx").then((r) => r.json()).then((d) => setRates(d.rates)).catch(() => {});
  }, []);

  function setCurrency(c: string) {
    setCur(c);
    try { localStorage.setItem("tc_currency", c); } catch { /* ignore */ }
  }

  function show(amount: number, from: string): string {
    const v = convert(amount, from, currency, rates);
    return v == null ? formatMoney(amount, from) : formatMoney(v, currency);
  }

  return <CurrencyCtx.Provider value={{ currency, setCurrency, rates, show }}>{children}</CurrencyCtx.Provider>;
}

export function useCurrency(): Ctx {
  const c = useContext(CurrencyCtx);
  if (!c) return { currency: "USD", setCurrency: () => {}, rates: null, show: (a, f) => formatMoney(a, f) };
  return c;
}
