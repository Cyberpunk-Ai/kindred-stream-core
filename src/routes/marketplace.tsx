import { Suspense, lazy } from "react";
import { pageSeo } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";

const Page = lazy(() => import("@/pages/Marketplace"));

export const Route = createFileRoute("/marketplace")({
  head: () =>
    pageSeo({
      title: "Gaming Marketplace | GameFlex",
      description:
        "Buy and sell accounts, skins, coaching and in-game items with escrow-protected payments.",
    }),
  component: () => (
    <Suspense
      fallback={<div className="p-6 text-sm text-muted-foreground">Loading marketplace…</div>}
    >
      <Page />
    </Suspense>
  ),
});
