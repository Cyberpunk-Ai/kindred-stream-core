import { Suspense, lazy } from "react";
import { pageSeo } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";

const Page = lazy(() => import("@/pages/Messages"));

export const Route = createFileRoute("/messages")({
  head: () =>
    pageSeo({
      title: "Messages | GameFlex",
      description: "Private and team chat with the players you compete alongside.",
      noindex: true,
    }),
  component: () => (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading messages…</div>}>
      <Page />
    </Suspense>
  ),
});
