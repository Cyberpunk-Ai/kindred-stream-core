import { pageSeo } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import Page from "@/pages/social/Teams";

export const Route = createFileRoute("/teams/")({
  head: () =>
    pageSeo({
      title: "Squads & Clans | GameFlex",
      description:
        "Create a squad, invite players, chat in a private squad room, plan tournaments and track every teammate's leaderboard rank.",
    }),
  component: Page,
});
