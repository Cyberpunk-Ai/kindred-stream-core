import { createFileRoute } from "@tanstack/react-router";

const SITE_URL = "https://gameflex.co.ke";

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: () => {
        const body = [
          "User-agent: *",
          "Allow: /",
          "",
          "Disallow: /admin",
          "Disallow: /settings",
          "Disallow: /wallet",
          "Disallow: /messages",
          "Disallow: /notifications",
          "",
          "User-agent: Googlebot",
          "Allow: /",
          "",
          "User-agent: Bingbot",
          "Allow: /",
          "",
          "User-agent: OAI-SearchBot",
          "Allow: /",
          "",
          "User-agent: OAI-AdsBot",
          "Allow: /",
          "",
          "User-agent: PerplexityBot",
          "Allow: /",
          "",
          "User-agent: ClaudeBot",
          "Allow: /",
          "",
          "User-agent: Amazonbot",
          "Allow: /",
          "",
          "User-agent: Applebot-Extended",
          "Allow: /",
          "",
          "User-agent: CloudflareBrowserRenderingCrawler",
          "Allow: /",
          "",
          `Sitemap: ${SITE_URL}/sitemap.xml`,
          "",
        ].join("\n");

        return new Response(body, {
          status: 200,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control":
              "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
            "X-Content-Type-Options": "nosniff",
          },
        });
      },
    },
  },
});