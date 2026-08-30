import { createFileRoute } from "@tanstack/react-router";

const SITE_URL = "https://gameflex.co.ke";

const URLS = [
  { path: "/", lastmod: "2026-08-25" },
  { path: "/about", lastmod: "2026-08-25" },
  { path: "/how-it-works", lastmod: "2026-08-25" },
  { path: "/tournaments", lastmod: "2026-08-25" },
  { path: "/leaderboard", lastmod: "2026-08-25" },
  { path: "/game-rooms", lastmod: "2026-08-25" },
  { path: "/marketplace", lastmod: "2026-08-25" },
  { path: "/achievements", lastmod: "2026-08-25" },
  { path: "/explore", lastmod: "2026-08-25" },
  { path: "/flex", lastmod: "2026-08-25" },
  { path: "/faqs", lastmod: "2026-08-25" },
  { path: "/help", lastmod: "2026-08-25" },
  { path: "/contact", lastmod: "2026-08-25" },
  { path: "/fair-play", lastmod: "2026-08-25" },
  { path: "/terms", lastmod: "2026-08-25" },
  { path: "/privacy", lastmod: "2026-08-25" },
] as const;

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: () => {
        const urls = URLS.map(
          ({ path, lastmod }) => `  <url>
    <loc>${escapeXml(`${SITE_URL}${path}`)}</loc>
    <lastmod>${lastmod}</lastmod>
  </url>`,
        ).join("\n");

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

        return new Response(xml, {
          status: 200,
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control":
              "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
            "X-Content-Type-Options": "nosniff",
          },
        });
      },
    },
  },
});