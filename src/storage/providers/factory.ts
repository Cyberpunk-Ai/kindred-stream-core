import type { StorageProvider, StorageProviderKind } from "../types.ts";
import { GAMEFLEX_BUCKETS } from "../buckets.ts";
import { VPSStorageProvider } from "./vps.ts";
import { R2StorageProvider } from "./r2.ts";
import { S3StorageProvider } from "./s3.ts";
import { SupabaseStorageProvider } from "./supabase.ts";

export function resolveStorageProviderName(): StorageProviderKind {
  const raw =
    (typeof import.meta !== "undefined"
      ? (import.meta.env as Record<string, string | undefined>)?.VITE_STORAGE_PROVIDER
      : undefined) ??
    (typeof process !== "undefined"
      ? (process.env as Record<string, string | undefined>)?.VITE_STORAGE_PROVIDER
      : undefined) ??
    (typeof process !== "undefined"
      ? (process.env as Record<string, string | undefined>)?.STORAGE_PROVIDER
      : undefined) ??
    "r2";

  if (raw === "supabase" || raw === "vps" || raw === "r2" || raw === "s3") return raw;
  throw new Error(`Unsupported storage provider: ${raw}`);
}

export async function getStorageProvider(): Promise<StorageProvider> {
  return createStorageProvider();
}

export function createStorageProvider(): StorageProvider {
  const providerName = resolveStorageProviderName();

  if (providerName === "supabase") return new SupabaseStorageProvider();
  if (providerName === "vps") return new VPSStorageProvider();
  if (providerName === "s3") return new S3StorageProvider();
  return new R2StorageProvider();
}

export const DEFAULT_MEDIA_BUCKETS = Object.values(GAMEFLEX_BUCKETS);
