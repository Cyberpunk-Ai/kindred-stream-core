import type { StorageProvider, StorageObjectMetadata } from "../types.ts";

function env(name: string): string | undefined {
  const viteValue =
    typeof import.meta !== "undefined"
      ? (import.meta.env as Record<string, string | undefined>)?.[`VITE_${name}`]
      : undefined;
  const processValue =
    typeof process !== "undefined"
      ? (process.env as Record<string, string | undefined>)?.[name]
      : undefined;
  return (viteValue ?? processValue)?.trim() || undefined;
}

function joinUrl(...parts: string[]) {
  return parts
    .filter(Boolean)
    .map((part, index) => (index === 0 ? part.replace(/\/+$/, "") : part.replace(/^\/+|\/+$/g, "")))
    .join("/");
}

function ensureObjectKey(objectKey: string) {
  const normalized = objectKey.trim().split("/").filter(Boolean).join("/");
  if (!normalized || normalized.includes("..") || normalized.includes("\\")) {
    throw new Error("Invalid object key");
  }
  return normalized;
}

export class R2StorageProvider implements StorageProvider {
  readonly kind = "r2" as const;

  private readonly apiUrl = env("STORAGE_API_URL");
  private readonly publicUrl = env("STORAGE_PUBLIC_URL") ?? this.apiUrl;

  private requireApiUrl() {
    if (!this.apiUrl) {
      throw new Error("R2 storage gateway is not configured. Set STORAGE_API_URL.");
    }
    return this.apiUrl;
  }

  private endpoint(bucket: string, operation: string) {
    return joinUrl(this.requireApiUrl(), bucket, operation);
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
    const normalizedKey = ensureObjectKey(objectKey);
    const form = new FormData();
    form.append("file", file, normalizedKey.split("/").pop() ?? "upload.bin");
    form.append("path", normalizedKey);
    if (options?.upsert) form.append("upsert", "true");
    if (options?.contentType) form.append("contentType", options.contentType);
    const response = await fetch(this.endpoint(bucket, "upload"), { method: "POST", body: form });
    if (!response.ok) throw new Error(`R2 upload failed (${response.status})`);
    const url = await this.getUrl(bucket, objectKey);
    const metadata: StorageObjectMetadata = {
      bucket,
      objectKey: normalizedKey,
      provider: "r2",
      mimeType: file.type || options?.contentType || "application/octet-stream",
      sizeBytes: file.size,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ownerId: options?.ownerId,
      metadata: options?.metadata,
    };
    return { url, objectKey, metadata };
  }

  async download(bucket: string, objectKey: string) {
    const normalizedKey = ensureObjectKey(objectKey);
    const response = await fetch(
      `${this.endpoint(bucket, "object")}?path=${encodeURIComponent(normalizedKey)}`,
    );
    if (!response.ok) throw new Error(`R2 download failed (${response.status})`);
    return { blob: await response.blob(), metadata: await this.getMetadata(bucket, normalizedKey) };
  }

  async getUrl(bucket: string, objectKey: string): Promise<string> {
    if (!this.publicUrl) {
      throw new Error("R2 public URL is not configured. Set STORAGE_PUBLIC_URL.");
    }
    return joinUrl(this.publicUrl, bucket, ensureObjectKey(objectKey));
  }

  async getSignedUrl(bucket: string, objectKey: string, expiresIn = 3600) {
    const response = await fetch(this.endpoint(bucket, "sign"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: ensureObjectKey(objectKey), expiresIn }),
    });
    if (!response.ok) throw new Error(`R2 signing failed (${response.status})`);
    const result = (await response.json()) as { url?: string; signedUrl?: string };
    const signedUrl = result.url ?? result.signedUrl;
    if (!signedUrl) throw new Error("R2 signing response missing URL");
    return signedUrl;
  }

  async delete(bucket: string, objectKey: string) {
    const response = await fetch(this.endpoint(bucket, "remove"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths: [ensureObjectKey(objectKey)] }),
    });
    if (!response.ok) throw new Error(`R2 delete failed (${response.status})`);
  }

  async exists(bucket: string, objectKey: string) {
    const response = await fetch(
      `${this.endpoint(bucket, "list")}?prefix=${encodeURIComponent(ensureObjectKey(objectKey))}`,
    );
    if (!response.ok) return false;
    const result = (await response.json()) as { objects?: { name: string }[] };
    return !!result.objects?.some((entry) => entry.name === ensureObjectKey(objectKey));
  }

  async list(bucket: string, prefix?: string) {
    const query = prefix ? `?prefix=${encodeURIComponent(ensureObjectKey(prefix))}` : "";
    const response = await fetch(`${this.endpoint(bucket, "list")}${query}`);
    if (!response.ok) throw new Error(`R2 list failed (${response.status})`);
    const result = (await response.json()) as { objects?: { name: string }[] };
    return result.objects?.map((item) => item.name) ?? [];
  }

  async getMetadata(bucket: string, objectKey: string): Promise<StorageObjectMetadata> {
    const url = await this.getUrl(bucket, objectKey);
    return {
      bucket,
      objectKey,
      provider: "r2",
      mimeType: "application/octet-stream",
      sizeBytes: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: { url },
    };
  }

  async health() {
    return {
      ok: true,
      provider: "r2" as const,
      details: {
        storageApiUrlConfigured: Boolean(this.apiUrl),
        storagePublicUrlConfigured: Boolean(this.publicUrl),
      },
    };
  }
}
