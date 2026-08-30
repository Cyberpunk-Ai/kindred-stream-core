import { Suspense, lazy } from "react";
import { pageSeo } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";

const Page = lazy(() => import("@/pages/admin/analytics"));

export const Route = createFileRoute("/admin/analytics")({
  head: () =>
    pageSeo({
      title: "Admin Analytics | GameFlex",
      description:
        "Traffic, retention, revenue and engagement analytics for the GameFlex platform.",
      noindex: true,
    }),
  component: () => (
    <Suspense
      fallback={<div className="p-6 text-sm text-muted-foreground">Loading analytics…</div>}
    >
      <Page />
    </Suspense>
  ),
});
