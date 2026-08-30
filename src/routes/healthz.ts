import { createFileRoute } from "@tanstack/react-router";

/**
 * Liveness/readiness probe for load balancers, Docker, Kubernetes and uptime
 * monitors. Intentionally dependency-free so it stays green even when the
 * database is degraded (use /readyz semantics in your orchestrator if you need
 * a dependency check).
 */
export const Route = createFileRoute("/healthz")({
  server: {
    handlers: {
      GET: () =>
        new Response(JSON.stringify({ status: "ok", uptime: process.uptime() }), {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          },
        }),
    },
  },
});
