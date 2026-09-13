import { createFileRoute } from "@tanstack/react-router";

/**
 * Readiness probe: verifies the configured backend is reachable, so an
 * orchestrator (Dokploy, Docker, Kubernetes) only routes traffic to an
 * instance that can actually serve data. Kept cheap and cached-free.
 */
export const Route = createFileRoute("/readyz")({
  server: {
    handlers: {
      GET: async () => {
        const url = process.env["SUPABASE_URL"];
        const key = process.env["SUPABASE_PUBLISHABLE_KEY"];

        const checks: Record<string, string> = {
          server: "ok",
          config: url && key ? "ok" : "missing",
        };

        if (url && key) {
          try {
            const res = await fetch(`${url.replace(/\/+$/, "")}/auth/v1/health`, {
              headers: { apikey: key },
              signal: AbortSignal.timeout(4000),
            });
            checks["backend"] = res.ok ? "ok" : `http_${res.status}`;
          } catch {
            checks["backend"] = "unreachable";
          }
        }

        const ready = Object.values(checks).every((value) => value === "ok");
        return new Response(JSON.stringify({ status: ready ? "ready" : "degraded", checks }), {
          status: ready ? 200 : 503,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
