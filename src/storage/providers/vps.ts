import { GAMEFLEX_BUCKETS, isGameflexBucket } from "../buckets.ts";
import type { StorageProvider, StorageObjectMetadata } from "../types.ts";

function readVpsApi() {
  return (
    (typeof import.meta !== "undefined"
      ? (import.meta.env as Record<string, string | undefined>)?.VITE_STORAGE_API_URL
      : undefined) ??
    (typeof process !== "undefined"
      ? (process.env as Record<string, string | undefined>)?.VITE_STORAGE_API_URL
      : undefined) ??
    (typeof process !== "undefined"
      ? (process.env as Record<string, string | undefined>)?.STORAGE_API_URL
      : undefined)
  );
}

function readVpsPublic(apiUrl?: string) {
  return (
    (typeof import.meta !== "undefined"
      ? (import.meta.env as Record<string, string | undefined>)?.VITE_STORAGE_PUBLIC_URL
      : undefined) ??
    (typeof process !== "undefined"
      ? (process.env as Record<string, string | undefined>)?.VITE_STORAGE_PUBLIC_URL
      : undefined) ??
    (typeof process !== "undefined"
      ? (process.env as Record<string, string | undefined>)?.STORAGE_PUBLIC_URL
      : undefined) ??
    apiUrl
  );
}

function normalizeObjectKey(input: string): string {
  const trimmed = input.trim();
  if (!trimmed || trimmed.includes("..") || trimmed.startsWith("/") || trimmed.includes("\\")) {
    throw new Error("Invalid object key");
  }
  const normalized = trimmed.replace(/^\/+/, "").replace(/\/+/g, "/");
  return normalized;
}

function joinUrl(...parts: string[]) {
  return parts
    .filter(Boolean)
    .map((part, index) => (index === 0 ? part.replace(/\/+$/, "") : part.replace(/^\/+|\/+$/g, "")))
    .join("/");
}

export class VPSStorageProvider implements StorageProvider {
  readonly kind = "vps" as const;

  private readonly apiUrl: string;
  private readonly publicUrl: string;

  constructor() {
    const apiUrl = readVpsApi();
    if (!apiUrl) {
      throw new Error("VITE_STORAGE_API_URL is required when VITE_STORAGE_PROVIDER=vps");
    }
    this.apiUrl = apiUrl;
    this.publicUrl = readVpsPublic(apiUrl) ?? apiUrl;
  }

  private ensureBucket(bucket: string) {
    if (!isGameflexBucket(bucket)) {
      throw new Error(`Unsupported GameFlex bucket: ${bucket}`);
    }
    return bucket;
  }

  async upload(
    bucket: string,
    objectKey: string,
    file: Blob | File,
    options?: {
      contentType?: string;
      cacheControl?: string;
      upsert?: boolean;
      ownerId?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    const resolvedBucket = this.ensureBucket(bucket);
    const normalizedKey = normalizeObjectKey(objectKey);
    const form = new FormData();
    form.append("bucket", resolvedBucket);
    form.append("objectKey", normalizedKey);
    form.append("file", file, normalizedKey.split("/").pop() ?? "upload.bin");
    if (options?.contentType) form.append("contentType", options.contentType);
    if (options?.cacheControl) form.append("cacheControl", options.cacheControl);
    if (options?.ownerId) form.append("ownerId", options.ownerId);
    if (options?.metadata) form.append("metadata", JSON.stringify(options.metadata));

    const res = await fetch(joinUrl(this.apiUrl, resolvedBucket, "upload"), {
      method: "POST",
      body: form,
    });

    if (!res.ok) {
      const message = await res.text().catch(() => "");
      throw new Error(message || `VPS upload failed (${res.status})`);
    }

    const json = (await res.json()) as {
      objectKey?: string;
      url?: string;
      metadata?: StorageObjectMetadata;
    };
    const metadata: StorageObjectMetadata = json.metadata ?? {
      bucket: resolvedBucket,
      objectKey: normalizedKey,
      provider: "vps",
      mimeType: file.type || options?.contentType || "application/octet-stream",
      sizeBytes: file.size,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ownerId: options?.ownerId,
      metadata: options?.metadata,
    };

    return {
      url: json.url ?? (await this.getUrl(resolvedBucket, normalizedKey)),
      objectKey: normalizedKey,
      metadata,
    };
  }

  async download(bucket: string, objectKey: string) {
    const resolvedBucket = this.ensureBucket(bucket);
    const normalizedKey = normalizeObjectKey(objectKey);
    const response = await fetch(
      `${joinUrl(this.apiUrl, resolvedBucket, "download")}?objectKey=${encodeURIComponent(normalizedKey)}`,
    );
    if (!response.ok) {
      throw new Error(`VPS download failed (${response.status})`);
    }
    const blob = await response.blob();
    const metadata: StorageObjectMetadata = await this.getMetadata(resolvedBucket, normalizedKey);
    return { blob, metadata };
  }

  async getUrl(bucket: string, objectKey: string): Promise<string> {
    const resolvedBucket = this.ensureBucket(bucket);
    const normalizedKey = normalizeObjectKey(objectKey);
    return joinUrl(this.publicUrl, resolvedBucket, normalizedKey);
  }

  async getSignedUrl(bucket: string, objectKey: string, expiresIn = 3600) {
    const resolvedBucket = this.ensureBucket(bucket);
    const normalizedKey = normalizeObjectKey(objectKey);
    const response = await fetch(joinUrl(this.apiUrl, resolvedBucket, "sign"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ objectKey: normalizedKey, expiresIn }),
    });
    if (!response.ok) throw new Error(`VPS signed URL failed (${response.status})`);
    const json = (await response.json()) as { url?: string };
    if (!json.url) throw new Error("VPS signed URL response did not include a URL");
    return json.url;
  }

  async delete(bucket: string, objectKey: string) {
    const resolvedBucket = this.ensureBucket(bucket);
    const normalizedKey = normalizeObjectKey(objectKey);
    const response = await fetch(joinUrl(this.apiUrl, resolvedBucket, "delete"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ objectKey: normalizedKey }),
    });
    if (!response.ok) {
      throw new Error(`VPS delete failed (${response.status})`);
    }
  }

  async exists(bucket: string, objectKey: string) {
    const resolvedBucket = this.ensureBucket(bucket);
    const normalizedKey = normalizeObjectKey(objectKey);
    const response = await fetch(
      `${joinUrl(this.apiUrl, resolvedBucket, "metadata")}?objectKey=${encodeURIComponent(normalizedKey)}`,
    );
    return response.ok;
  }

  async list(bucket: string, prefix?: string) {
    const resolvedBucket = this.ensureBucket(bucket);
    const response = await fetch(
      `${joinUrl(this.apiUrl, resolvedBucket, "list")}${prefix ? `?prefix=${encodeURIComponent(prefix)}` : ""}`,
    );
    if (!response.ok) {
      throw new Error(`VPS list failed (${response.status})`);
    }
    const json = (await response.json()) as { keys?: string[] };
    return json.keys ?? [];
  }

  async getMetadata(bucket: string, objectKey: string): Promise<StorageObjectMetadata> {
    const resolvedBucket = this.ensureBucket(bucket);
    const normalizedKey = normalizeObjectKey(objectKey);
    const response = await fetch(
      `${joinUrl(this.apiUrl, resolvedBucket, "metadata")}?objectKey=${encodeURIComponent(normalizedKey)}`,
    );
    if (!response.ok) throw new Error(`VPS metadata failed (${response.status})`);
    const json = (await response.json()) as StorageObjectMetadata;
    return {
      ...json,
      bucket: json.bucket ?? resolvedBucket,
      objectKey: json.objectKey ?? normalizedKey,
      provider: json.provider ?? "vps",
    };
  }

  async health() {
    try {
      const response = await fetch(joinUrl(this.apiUrl, "health"));
      if (!response.ok)
        return { ok: false, provider: "vps" as const, details: { status: response.status } };
      const json = (await response.json()) as {
        ok?: boolean;
        provider?: string;
        details?: Record<string, unknown>;
      };
      return { ok: !!json.ok, provider: "vps" as const, details: json.details ?? {} };
    } catch (error) {
      return {
        ok: false,
        provider: "vps" as const,
        details: { message: error instanceof Error ? error.message : String(error) },
      };
    }
  }
}

export const GAMEFLEX_VPS_BUCKETS = Object.values(GAMEFLEX_BUCKETS);
