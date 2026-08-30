import { pageSeo } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import Page from "@/pages/social/SquadDetail";

export const Route = createFileRoute("/teams/$id")({
  head: () =>
    pageSeo({
      title: "Squad Room | GameFlex",
      description: "Squad chat, roster ranks and tournament planning for your GameFlex clan.",
      noindex: true,
    }),
  component: Page,
});
