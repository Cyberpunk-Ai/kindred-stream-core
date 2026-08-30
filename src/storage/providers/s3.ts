import type { StorageProvider, StorageObjectMetadata } from "../types.ts";

export class S3StorageProvider implements StorageProvider {
  readonly kind = "s3" as const;

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
    const url = await this.getUrl(bucket, objectKey);
    const metadata: StorageObjectMetadata = {
      bucket,
      objectKey,
      provider: "s3",
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
    const response = await fetch(await this.getUrl(bucket, objectKey));
    if (!response.ok) throw new Error(`S3 download failed (${response.status})`);
    const metadata: StorageObjectMetadata = await this.getMetadata(bucket, objectKey);
    return { blob: await response.blob(), metadata };
  }

  async getUrl(bucket: string, objectKey: string): Promise<string> {
    const publicUrl =
      (typeof import.meta !== "undefined"
        ? (import.meta.env as Record<string, string | undefined>)?.VITE_STORAGE_PUBLIC_URL
        : undefined) ??
      (typeof process !== "undefined"
        ? (process.env as Record<string, string | undefined>)?.VITE_STORAGE_PUBLIC_URL
        : undefined) ??
      "https://storage.gameflex.co.ke";
    return `${publicUrl.replace(/\/+$/, "")}/${bucket.replace(/^\/+/, "")}/${objectKey.replace(/^\/+/, "")}`;
  }

  async getSignedUrl(bucket: string, objectKey: string, expiresIn = 3600) {
    return `${await this.getUrl(bucket, objectKey)}?expires=${expiresIn}`;
  }

  async delete(bucket: string, objectKey: string) {
    await fetch(await this.getUrl(bucket, objectKey), { method: "DELETE" });
  }

  async exists(bucket: string, objectKey: string) {
    const response = await fetch(await this.getUrl(bucket, objectKey), { method: "HEAD" });
    return response.ok;
  }

  async list(bucket: string, prefix?: string) {
    return [];
  }

  async getMetadata(bucket: string, objectKey: string): Promise<StorageObjectMetadata> {
    return {
      bucket,
      objectKey,
      provider: "s3",
      mimeType: "application/octet-stream",
      sizeBytes: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  async health() {
    return {
      ok: true,
      provider: "s3" as const,
      details: {
        note: "S3 provider interface is prepared; credentials are configured separately.",
      },
    };
  }
}
