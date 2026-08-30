export type StorageProviderKind = "supabase" | "vps" | "r2" | "s3";

export const GAMEFLEX_STORAGE_PROVIDER_VALUES = ["supabase", "vps", "r2", "s3"] as const;

export interface StorageObjectMetadata {
  bucket: string;
  objectKey: string;
  provider: StorageProviderKind;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
  ownerId?: string;
  checksum?: string;
  metadata?: Record<string, unknown>;
}

export interface StorageUploadOptions {
  contentType?: string;
  cacheControl?: string;
  upsert?: boolean;
  ownerId?: string;
  metadata?: Record<string, unknown>;
}

export interface StorageDownloadResult {
  blob: Blob;
  metadata: StorageObjectMetadata;
}

export interface StorageProvider {
  readonly kind: StorageProviderKind;
  upload(
    bucket: string,
    objectKey: string,
    file: Blob | File,
    options?: StorageUploadOptions,
  ): Promise<{
    url: string;
    objectKey: string;
    metadata: StorageObjectMetadata;
  }>;
  download(bucket: string, objectKey: string): Promise<StorageDownloadResult>;
  getUrl(bucket: string, objectKey: string): Promise<string>;
  getSignedUrl(bucket: string, objectKey: string, expiresIn?: number): Promise<string>;
  delete(bucket: string, objectKey: string): Promise<void>;
  exists(bucket: string, objectKey: string): Promise<boolean>;
  list(bucket: string, prefix?: string): Promise<string[]>;
  getMetadata(bucket: string, objectKey: string): Promise<StorageObjectMetadata>;
  health(): Promise<{
    ok: boolean;
    provider: StorageProviderKind;
    details?: Record<string, unknown>;
  }>;
}
