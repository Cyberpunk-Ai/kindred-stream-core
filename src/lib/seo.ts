const BRAND = "GameFlex";
const DEFAULT_TITLE = "GameFlex | The World's Premier Gaming Ecosystem";
const DEFAULT_DESCRIPTION =
  "The world's premier gaming ecosystem. Discover the complete gaming experience on one platform.";

export interface PageSeoOptions {
  title?: string;
  description?: string;
  /** Ask crawlers to skip this page (utility, auth and error pages). */
  noindex?: boolean;
  /** Absolute https URL of a meaningful cover image for this page. */
  image?: string;
}

export interface PageSeoResult {
  meta: Array<Record<string, string>>;
}

export function pageSeo({
  title,
  description,
  noindex,
  image,
}: PageSeoOptions = {}): PageSeoResult {
  const clean = title?.replace(/\s*\|\s*GameFlex.*$/i, "").trim();
  const fullTitle = clean || DEFAULT_TITLE;
  const desc = description || DEFAULT_DESCRIPTION;

  const meta: Array<Record<string, string>> = [
    { title: fullTitle },
    { name: "description", content: desc },
    { property: "og:title", content: `${fullTitle} | ${BRAND}` },
    { property: "og:description", content: desc },
    { property: "og:site_name", content: BRAND },
    { property: "og:type", content: "website" },
    { property: "og:url", content: "https://gameflex.co.ke" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:site", content: "@GameFlex" },
  ];

  if (image) {
    meta.push({ property: "og:image", content: image });
    meta.push({ name: "twitter:image", content: image });
  }

  if (noindex) {
    meta.push({ name: "robots", content: "noindex, nofollow" });
  }

  return { meta };
}
