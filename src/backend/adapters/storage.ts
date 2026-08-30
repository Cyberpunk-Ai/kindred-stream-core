import { backendConfig } from "../config.ts";
import type { StorageApi, StorageFileApi } from "../types.ts";

/**
 * Object-storage adapter for S3, Cloudflare R2 or a self-hosted VPS gateway.
 *
 * The adapter speaks a small HTTP contract against `VITE_STORAGE_API_URL`, so
 * any provider can be plugged in behind that endpoint:
 *
 *   POST   {api}/{bucket}/upload            multipart form-data (`file`, `path`)
 *   POST   {api}/{bucket}/remove            { paths: string[] }
 *   POST   {api}/{bucket}/sign              { path, expiresIn } -> { url }
 *   GET    {api}/{bucket}/list?prefix=...   -> { objects: [{ name }] }
 *   GET    {api}/{bucket}/object?path=...   -> raw bytes
 *
 * Public URLs are built from `VITE_STORAGE_PUBLIC_URL` (CDN or bucket domain).
 */
function joinUrl(...parts: string[]): string {
  return parts
    .filter(Boolean)
    .map((part, index) => (index === 0 ? part.replace(/\/+$/, "") : part.replace(/^\/+|\/+$/g, "")))
    .join("/");
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function createUnavailableStorage(message: string): StorageApi {
  const unavailable = () => Promise.reject(new Error(message));
  return {
    from() {
      return {
        upload: unavailable,
        remove: unavailable,
        list: unavailable,
        download: unavailable,
        createSignedUrl: unavailable,
        getPublicUrl(path) {
          return { data: { publicUrl: path } };
        },
      };
    },
  };
}

function createHttpStorage(apiUrl: string, publicUrl?: string): StorageApi {
  return {
    from(bucket: string): StorageFileApi {
      const base = joinUrl(apiUrl, bucket);

      return {
        async upload(path, file, options) {
          try {
            let body: FormData;
            if (file instanceof FormData) {
              body = file;
            } else {
              body = new FormData();
              const blob =
                file instanceof Blob
                  ? file
                  : new Blob([file as ArrayBuffer], {
                      type: options?.contentType ?? "application/octet-stream",
                    });
              body.append("file", blob);
            }
            body.append("path", path);
            if (options?.upsert) body.append("upsert", "true");
            if (options?.cacheControl) body.append("cacheControl", options.cacheControl);

            const res = await fetch(joinUrl(base, "upload"), { method: "POST", body });
            if (!res.ok) throw new Error(`Upload failed (${res.status})`);
            return { data: { path }, error: null };
          } catch (error) {
            return { data: null, error: toError(error) };
          }
        },

        async remove(paths) {
          try {
            const res = await fetch(joinUrl(base, "remove"), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ paths }),
            });
            if (!res.ok) throw new Error(`Remove failed (${res.status})`);
            return { data: await res.json().catch(() => null), error: null };
          } catch (error) {
            return { data: null, error: toError(error) };
          }
        },

        async list(prefix, options) {
          try {
            const params = new URLSearchParams({ prefix: prefix ?? "" });
            if (options) params.set("options", JSON.stringify(options));
            const res = await fetch(`${joinUrl(base, "list")}?${params.toString()}`);
            if (!res.ok) throw new Error(`List failed (${res.status})`);
            const json = (await res.json()) as { objects?: { name: string }[] };
            return { data: json.objects ?? [], error: null };
          } catch (error) {
            return { data: null, error: toError(error) };
          }
        },

        async download(path) {
          try {
            const res = await fetch(`${joinUrl(base, "object")}?path=${encodeURIComponent(path)}`);
            if (!res.ok) throw new Error(`Download failed (${res.status})`);
            return { data: await res.blob(), error: null };
          } catch (error) {
            return { data: null, error: toError(error) };
          }
        },

        async createSignedUrl(path, expiresIn) {
          try {
            const res = await fetch(joinUrl(base, "sign"), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ path, expiresIn }),
            });
            if (!res.ok) throw new Error(`Signing failed (${res.status})`);
            const json = (await res.json()) as { url?: string; signedUrl?: string };
            const signedUrl = json.url ?? json.signedUrl;
            if (!signedUrl) throw new Error("Signing response missing url");
            return { data: { signedUrl }, error: null };
          } catch (error) {
            return { data: null, error: toError(error) };
          }
        },

        getPublicUrl(path) {
          if (!publicUrl && apiUrl === "/api/storage") {
            return {
              data: {
                publicUrl: `${joinUrl(apiUrl, bucket, "object")}?path=${encodeURIComponent(path)}`,
              },
            };
          }
          const origin = publicUrl ?? apiUrl;
          return { data: { publicUrl: joinUrl(origin, bucket, path) } };
        },
      };
    },
  };
}

/** Returns the configured external storage API. Supabase is never a fallback. */
export function getStorageOverride(): StorageApi | undefined {
  const apiUrl = backendConfig.storageApiUrl;
  if (!apiUrl && backendConfig.storage === "r2") {
    return createHttpStorage("/api/storage");
  }
  if (!apiUrl) {
    return createUnavailableStorage(
      `Storage provider ${backendConfig.storage} is not configured. Set VITE_STORAGE_API_URL for uploads and private file access.`,
    );
  }
  return createHttpStorage(apiUrl, backendConfig.storagePublicUrl);
}
