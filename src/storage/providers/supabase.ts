import { backend } from "../../backend/index.ts";
import type { StorageProvider, StorageObjectMetadata } from "../types.ts";

export class SupabaseStorageProvider implements StorageProvider {
  readonly kind = "supabase" as const;

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
    const result = await backend.storage.from(bucket).upload(objectKey, file, {
      contentType: options?.contentType,
      cacheControl: options?.cacheControl,
      upsert: options?.upsert,
    });

    if (result.error || !result.data) {
      throw result.error ?? new Error("Supabase upload failed");
    }

    const metadata: StorageObjectMetadata = {
      bucket,
      objectKey,
      provider: "supabase",
      mimeType: file.type || options?.contentType || "application/octet-stream",
      sizeBytes: file.size,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ownerId: options?.ownerId,
      metadata: options?.metadata,
    };

    return {
      url: await this.getUrl(bucket, objectKey),
      objectKey,
      metadata,
    };
  }

  async download(bucket: string, objectKey: string) {
    const result = await backend.storage.from(bucket).download(objectKey);
    if (result.error || !result.data) throw result.error ?? new Error("Supabase download failed");

    const metadata: StorageObjectMetadata = await this.getMetadata(bucket, objectKey);
    return { blob: result.data, metadata };
  }

  async getUrl(bucket: string, objectKey: string): Promise<string> {
    const { data } = backend.storage.from(bucket).getPublicUrl(objectKey);
    return data.publicUrl;
  }

  async getSignedUrl(bucket: string, objectKey: string, expiresIn = 3600) {
    const { data, error } = await backend.storage
      .from(bucket)
      .createSignedUrl(objectKey, expiresIn);
    if (error || !data) throw error ?? new Error("Could not create signed URL");
    return data.signedUrl;
  }

  async delete(bucket: string, objectKey: string) {
    const { error } = await backend.storage.from(bucket).remove([objectKey]);
    if (error) throw error;
  }

  async exists(bucket: string, objectKey: string) {
    try {
      const { data, error } = await backend.storage.from(bucket).list(objectKey, { limit: 1 });
      if (error) return false;
      return !!(data && data.some((entry) => entry.name === objectKey));
    } catch {
      return false;
    }
  }

  async list(bucket: string, prefix?: string) {
    const { data, error } = await backend.storage.from(bucket).list(prefix ?? "");
    if (error || !data) return [];
    return data.map((item) => item.name);
  }

  async getMetadata(bucket: string, objectKey: string): Promise<StorageObjectMetadata> {
    const url = await this.getUrl(bucket, objectKey);
    return {
      bucket,
      objectKey,
      provider: "supabase",
      mimeType: "application/octet-stream",
      sizeBytes: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: { url },
    };
  }

  async health() {
    return { ok: true, provider: "supabase" as const };
  }
}
