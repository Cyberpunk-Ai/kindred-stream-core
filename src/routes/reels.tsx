import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy URL: Reels was renamed to Flex. Keep the old path working.
export const Route = createFileRoute("/reels")({
  beforeLoad: () => {
    throw redirect({ to: "/flex", replace: true });
  },
});
