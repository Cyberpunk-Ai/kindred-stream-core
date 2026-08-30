/**
 * Vendor-neutral client error reporting.
 *
 * Set `VITE_ERROR_REPORTING_URL` to forward errors to any collector
 * (Sentry tunnel, Logflare, your own endpoint). When unset, errors are only
 * logged to the console outside production.
 */
const ENDPOINT = (import.meta.env as Record<string, string | undefined>)[
  "VITE_ERROR_REPORTING_URL"
];

export function reportError(error: unknown, context?: Record<string, unknown>) {
  if (import.meta.env.MODE !== "production") {
    console.error("[Error Report]", error, context);
  }

  if (!ENDPOINT || typeof window === "undefined") return;

  const payload = {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    url: window.location.href,
    timestamp: new Date().toISOString(),
    context,
  };

  void fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    /* reporting must never break the app */
  });
}
