/**
 * Provider-agnostic OAuth sign-in.
 *
 * Uses the configured backend auth provider (Supabase by default) directly, so
 * the app has no dependency on any hosting-platform SDK. Which social
 * providers are offered is controlled by `VITE_OAUTH_PROVIDERS`.
 */
import { backend } from "@/backend";

export type OAuthProvider = "google" | "apple" | "azure" | "github" | "discord";

const DEFAULT_PROVIDERS: OAuthProvider[] = ["google"];

function readEnv(name: string): string | undefined {
  const value =
    (import.meta.env as Record<string, string | undefined>)[name] ??
    (typeof process !== "undefined"
      ? (process.env as Record<string, string | undefined>)[name.replace(/^VITE_/, "")]
      : undefined);
  return value && value.trim() !== "" ? value.trim() : undefined;
}

/** Social providers enabled for this deployment. */
export const enabledOAuthProviders: OAuthProvider[] =
  (readEnv("VITE_OAUTH_PROVIDERS")
    ?.split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean) as OAuthProvider[] | undefined) ?? DEFAULT_PROVIDERS;

export function isOAuthProviderEnabled(provider: OAuthProvider): boolean {
  return enabledOAuthProviders.includes(provider);
}

export interface OAuthResult {
  error: Error | null;
  redirected?: boolean;
}

/**
 * Starts a redirect-based OAuth flow. On success the browser navigates to the
 * provider, so this promise usually never resolves in the calling component.
 */
export async function signInWithOAuthProvider(
  provider: OAuthProvider,
  options?: { redirectTo?: string; scopes?: string; queryParams?: Record<string, string> },
): Promise<OAuthResult> {
  const redirectTo =
    options?.redirectTo ??
    (typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined);

  try {
    const { error } = await backend.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        ...(options?.scopes ? { scopes: options.scopes } : {}),
        ...(options?.queryParams ? { queryParams: options.queryParams } : {}),
      },
    });
    if (error) return { error: new Error(error.message) };
    return { error: null, redirected: true };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }
}
