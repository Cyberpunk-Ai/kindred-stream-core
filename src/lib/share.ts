/**
 * Canonical, stable, shareable links for public social content.
 *
 * The origin is never hardcoded: at runtime we use the current origin, and on
 * the server we fall back to `VITE_PUBLIC_SITE_URL` so environments (dev /
 * staging / production) stay switchable through configuration only.
 */

export function siteOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  const configured =
    (import.meta as unknown as { env?: Record<string, string | undefined> }).env
      ?.VITE_PUBLIC_SITE_URL ?? "";
  return configured.replace(/\/+$/, "");
}

export const shareLinks = {
  post: (id: string) => `/post/${id}`,
  profile: (userId: string) => `/player/${userId}`,
  creator: (userId: string) => `/creator/${userId}`,
  reel: (id: string) => `/flex?v=${encodeURIComponent(id)}`,
  story: (userId: string) => `/stories?u=${encodeURIComponent(userId)}`,
  tournament: (id: string) => `/tournaments/${id}`,
} as const;

export type ShareTarget = keyof typeof shareLinks;

export function absoluteUrl(path: string): string {
  return `${siteOrigin()}${path.startsWith("/") ? path : `/${path}`}`;
}

export function shareUrlFor(target: ShareTarget, id: string): string {
  return absoluteUrl(shareLinks[target](id));
}

export interface ShareOutcome {
  method: "share" | "clipboard" | "manual";
  url: string;
}

/**
 * Uses the native share sheet when available, otherwise copies the link.
 * Never throws — callers get a result they can turn into user feedback.
 */
export async function shareContent(options: {
  target: ShareTarget;
  id: string;
  title?: string;
  text?: string;
}): Promise<ShareOutcome> {
  const url = shareUrlFor(options.target, options.id);
  const nav = typeof navigator !== "undefined" ? navigator : undefined;

  if (nav?.share) {
    try {
      await nav.share({ title: options.title ?? "GameFlex", text: options.text, url });
      return { method: "share", url };
    } catch {
      /* user dismissed or unsupported — fall through to copy */
    }
  }

  try {
    await nav?.clipboard?.writeText(url);
    return { method: "clipboard", url };
  } catch {
    return { method: "manual", url };
  }
}
