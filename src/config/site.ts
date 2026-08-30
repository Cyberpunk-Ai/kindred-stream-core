/**
 * Site-wide configuration.
 *
 * Every deployment-specific value is read from the environment (with a safe
 * default) so nothing brand- or host-specific is hardcoded in components.
 */
function env(name: string): string | undefined {
  const fromVite =
    typeof import.meta !== "undefined"
      ? (import.meta.env as Record<string, string | undefined> | undefined)?.[name]
      : undefined;
  const fromProcess =
    typeof process !== "undefined"
      ? (process.env as Record<string, string | undefined>)?.[name.replace(/^VITE_/, "")]
      : undefined;
  const value = fromVite ?? fromProcess;
  return value && value.trim() !== "" ? value.trim() : undefined;
}

export const siteConfig = {
  name: env("VITE_APP_NAME") ?? "GameFlex",
  description:
    env("VITE_APP_DESCRIPTION") ??
    "The world's premier gaming ecosystem. Discover the complete gaming experience on one platform.",
  /** Canonical public origin, used for share links and absolute URLs. */
  url: env("VITE_SITE_URL") ?? "https://gameflex.co.ke",
  currency: env("VITE_CURRENCY") ?? "KES",
  supportEmail: env("VITE_SUPPORT_EMAIL") ?? "support@gameflex.co.ke",
  /** Default players per tournament lobby before players overflow into the next lobby. */
  defaultLobbySize: Number(env("VITE_DEFAULT_LOBBY_SIZE") ?? 16),
} as const;

/** Origin to use for share/referral links (prefers the real browser origin). */
export function publicOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return siteConfig.url;
}
