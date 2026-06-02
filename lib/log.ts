// Structured logging. Emits JSON lines that Vercel (and any log drain) capture.
// captureError is the single choke point for errors, so wiring Sentry later
// (set SENTRY_DSN, swap the body of captureError) only touches one function.

type Level = "info" | "warn" | "error";

function emit(level: Level, event: string, data?: Record<string, unknown>) {
  const line = JSON.stringify({ level, event, ts: new Date().toISOString(), ...data });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (event: string, data?: Record<string, unknown>) => emit("info", event, data),
  warn: (event: string, data?: Record<string, unknown>) => emit("warn", event, data),
};

// Normalizes any thrown value into an observable error record.
export function captureError(event: string, err: unknown, data?: Record<string, unknown>) {
  const e = err as { message?: string; stack?: string };
  emit("error", event, {
    error: e?.message ?? String(err),
    stack: e?.stack?.split("\n").slice(0, 4).join(" | "),
    ...data,
  });
}
