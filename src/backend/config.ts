/**
 * Backend provider configuration.
 *
 * Every backend capability (data, auth, storage, realtime, functions) is
 * selected independently through environment variables so the app can be
 * moved off the default managed backend one capability at a time while serving
 * files through the Cloudflare R2 gateway.
 *
 * All values are read at module load from Vite's build-time env (browser safe)
 * with a `process.env` fallback for SSR.
 */

export type DataProvider = "supabase" | "rest";
export type AuthProvider = "supabase" | "custom";
export type StorageProvider = "supabase" | "s3" | "r2" | "vps";
export type RealtimeProvider = "supabase" | "none";

function env(name: string): string | undefined {
  const fromVite =
    typeof import.meta !== "undefined"
      ? (import.meta.env as Record<string, string | undefined> | undefined)?.[`VITE_${name}`]
      : undefined;
  const fromProcess =
    typeof process !== "undefined"
      ? (process.env as Record<string, string | undefined>)?.[name]
      : undefined;
  const value = fromVite ?? fromProcess;
  return value && value.trim() !== "" ? value.trim() : undefined;
}

function pick<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
  const raw = env(name)?.toLowerCase();
  return (allowed as readonly string[]).includes(raw ?? "") ? (raw as T) : fallback;
}

export const backendConfig = {
  data: pick<DataProvider>("BACKEND_PROVIDER", ["supabase", "rest"], "supabase"),
  auth: pick<AuthProvider>("AUTH_PROVIDER", ["supabase", "custom"], "supabase"),
  storage: pick<StorageProvider>("STORAGE_PROVIDER", ["supabase", "s3", "r2", "vps"], "r2"),
  realtime: pick<RealtimeProvider>("REALTIME_PROVIDER", ["supabase", "none"], "supabase"),

  /** Base URL of a PostgREST-compatible data API (used by the `rest` provider). */
  restUrl: env("BACKEND_REST_URL") ?? env("API_URL"),
  /** API key/token forwarded to the REST data API. */
  restKey: env("BACKEND_REST_KEY"),

  /** Base URL of an auth gateway (used by the `custom` auth provider). */
  authUrl: env("AUTH_API_URL"),

  /** Signing/upload gateway for S3, R2 or VPS storage. */
  storageApiUrl: env("STORAGE_API_URL"),
  /** Public/CDN base URL for objects, e.g. https://cdn.example.com. */
  storagePublicUrl: env("STORAGE_PUBLIC_URL"),
} as const;

export type BackendConfig = typeof backendConfig;

export const isDefaultBackend =
  backendConfig.data === "supabase" &&
  backendConfig.auth === "supabase" &&
  backendConfig.storage === "supabase" &&
  backendConfig.realtime === "supabase";
