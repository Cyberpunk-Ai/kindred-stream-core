import { createStorageProvider, getStorageProvider } from "@/storage";
import type { StorageProvider } from "@/storage";
import {
  createStableObjectKey,
  MAX_UPLOAD_BYTES,
  sanitizeObjectKey,
  validateUploadLimits,
  validateMagicBytes,
} from "@/storage";

export interface IStorageProvider {
  upload(
    bucket: string,
    path: string,
    file: File,
    options?: any,
  ): Promise<{ url: string; path: string; error?: string }>;
  delete(bucket: string, path: string): Promise<{ error?: string }>;
  getPublicUrl(bucket: string, path: string): string;
  update(
    bucket: string,
    oldPath: string,
    newPath: string,
    file: File,
    options?: any,
  ): Promise<{ url: string; error?: string }>;
}

class CompatStorageProvider implements IStorageProvider {
  constructor(private readonly provider: StorageProvider) {}

  async upload(
    bucket: string,
    path: string,
    file: File,
    options?: any,
  ): Promise<{ url: string; path: string; error?: string }> {
    try {
      const objectKey = sanitizeObjectKey(path);
      validateUploadLimits(file, file.type, bucket);
      validateMagicBytes(file, bucket, file.type);
      const result = await this.provider.upload(bucket, objectKey, file, {
        ...options,
        contentType: file.type || options?.contentType,
      });
      return { url: result.url, path: result.objectKey, error: undefined };
    } catch (error: any) {
      return { url: "", path: "", error: error.message || String(error) };
    }
  }

  async delete(bucket: string, path: string): Promise<{ error?: string }> {
    try {
      await this.provider.delete(bucket, sanitizeObjectKey(path));
      return {};
    } catch (error: any) {
      return { error: error.message || String(error) };
    }
  }

  getPublicUrl(bucket: string, path: string): string {
    return `/storage/${bucket}/${sanitizeObjectKey(path)}`;
  }

  async update(
    bucket: string,
    oldPath: string,
    newPath: string,
    file: File,
    options?: any,
  ): Promise<{ url: string; error?: string }> {
    try {
      if (oldPath !== newPath) {
        const deleteResult = await this.delete(bucket, oldPath);
        if (deleteResult.error) throw new Error(deleteResult.error);
      }
      const result = await this.upload(bucket, newPath, file, { ...options, upsert: true });
      if (result.error) throw new Error(result.error);
      return { url: result.url };
    } catch (error: any) {
      return { url: "", error: error.message || String(error) };
    }
  }
}

export function createMediaProvider(): IStorageProvider {
  return new CompatStorageProvider(createStorageProvider());
}

export class MediaService {
  private provider: IStorageProvider;

  constructor(provider?: IStorageProvider) {
    this.provider = provider || createMediaProvider();
  }

  setProvider(provider: IStorageProvider) {
    this.provider = provider;
  }

  getProvider(): IStorageProvider {
    return this.provider;
  }

  async upload(
    bucket: string,
    path: string,
    file: File,
    options?: any,
  ): Promise<{ url: string; path: string; error?: string }> {
    return this.provider.upload(bucket, path, file, options);
  }

  async delete(bucket: string, path: string): Promise<{ error?: string }> {
    return this.provider.delete(bucket, path);
  }

  async update(
    bucket: string,
    oldPath: string,
    newPath: string,
    file: File,
  ): Promise<{ url: string; error?: string }> {
    return this.provider.update(bucket, oldPath, newPath, file, { upsert: true });
  }

  getPublicUrl(bucket: string, path: string): string {
    return this.provider.getPublicUrl(bucket, path);
  }

  async compress(file: File, _maxSizeMB: number = 2): Promise<File> {
    return new Promise((resolve) => resolve(file));
  }

  async generateThumbnail(file: File, _size: number = 256): Promise<File> {
    return new Promise((resolve) => resolve(file));
  }
}

export const mediaService = new MediaService();
export {
  MAX_UPLOAD_BYTES,
  createStableObjectKey,
  sanitizeObjectKey,
  validateUploadLimits,
  validateMagicBytes,
  getStorageProvider,
};
