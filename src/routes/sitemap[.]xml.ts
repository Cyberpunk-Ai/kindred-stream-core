import { createFileRoute } from "@tanstack/react-router";
import { siteConfig } from "@/config/site";

const PATHS = [
  "/",
  "/about",
  "/how-it-works",
  "/tournaments",
  "/leaderboard",
  "/game-rooms",
  "/marketplace",
  "/achievements",
  "/explore",
  "/flex",
  "/faqs",
  "/help",
  "/contact",
  "/fair-play",
  "/terms",
  "/privacy",
] as const;

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/** Prefer the real request origin, then configured site URL — nothing hardcoded. */
function originOf(request: Request): string {
  try {
    return new URL(request.url).origin;
  } catch {
    return siteConfig.url;
  }
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const siteUrl = originOf(request);
        const lastmod = new Date().toISOString().slice(0, 10);
        const urls = PATHS.map(
          (path) => `  <url>
    <loc>${escapeXml(`${siteUrl}${path}`)}</loc>
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
            "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
            "X-Content-Type-Options": "nosniff",
          },
        });
      },
    },
  },
});
