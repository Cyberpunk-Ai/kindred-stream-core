import { backend } from "@/backend";
import { getStorageUrl } from "@/lib/storage-url";
import {
  MAX_UPLOAD_BYTES_BY_BUCKET,
  MAX_UPLOAD_BYTES,
  sanitizeObjectKey,
  validateMagicBytes,
  validateUploadLimits,
} from "@/storage/validation";

/**
 * Resilient media upload pipeline.
 *
 * Responsibilities kept in one place so every surface (posts, stories, avatars,
 * marketplace, support) gets the same behaviour:
 *  - client-side validation (size / MIME / magic bytes) before any bytes leave
 *  - optional image optimisation without visible quality loss
 *  - real byte-level progress via a signed upload URL + XHR when the provider
 *    supports it, with a graceful fallback to a plain provider upload
 *  - automatic retry with exponential backoff on transient/network failures
 *  - cooperative cancellation through an AbortSignal
 *
 * The storage provider itself stays abstracted behind `backend.storage`, so the
 * underlying bucket host can change without touching callers.
 */

export type UploadPhase = "validating" | "optimizing" | "uploading" | "finalizing";

export interface UploadProgress {
  phase: UploadPhase;
  /** 0..1, byte-accurate while `phase === "uploading"` when supported. */
  loaded: number;
  total: number;
  percent: number;
  attempt: number;
}

export interface UploadRequest {
  bucket: string;
  userId: string;
  file: File;
  /** Optional stable key seed, defaults to a time+random seed. */
  seed?: string;
  signal?: AbortSignal;
  maxAttempts?: number;
  optimizeImages?: boolean;
  onProgress?: (progress: UploadProgress) => void;
}

export interface UploadResult {
  url: string;
  path: string;
  bucket: string;
  mediaType: "image" | "video" | "file";
  bytes: number;
}

export class UploadCancelledError extends Error {
  constructor() {
    super("Upload cancelled");
    this.name = "UploadCancelledError";
  }
}

const RETRYABLE = /network|timeout|failed to fetch|load failed|502|503|504|aborted by the server/i;

export function bucketLimitBytes(bucket: string): number {
  return (MAX_UPLOAD_BYTES_BY_BUCKET as Record<string, number>)[bucket] ?? MAX_UPLOAD_BYTES;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function detectMediaType(file: { type: string }): "image" | "video" | "file" {
  if (file.type.startsWith("image")) return "image";
  if (file.type.startsWith("video")) return "video";
  return "file";
}

function extensionFor(file: File, optimizedToWebp: boolean): string {
  if (optimizedToWebp) return "webp";
  const fromName = file.name.split(".").pop();
  if (fromName && /^[a-zA-Z0-9]{1,5}$/.test(fromName)) return fromName.toLowerCase();
  const fromType = file.type.split("/").pop();
  return (fromType || "bin").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new UploadCancelledError());
      },
      { once: true },
    );
  });
}

/** Uploads to a pre-signed URL so we can report true byte progress. */
function putWithProgress(
  url: string,
  body: Blob,
  contentType: string,
  onProgress: (loaded: number, total: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.setRequestHeader("content-type", contentType || "application/octet-stream");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded, event.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.ontimeout = () => reject(new Error("Upload timeout"));
    xhr.onabort = () => reject(new UploadCancelledError());
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(body);
  });
}

async function optimize(file: File): Promise<{ blob: Blob; toWebp: boolean }> {
  if (!file.type.startsWith("image") || file.type === "image/gif") {
    return { blob: file, toWebp: false };
  }
  try {
    const { compressImageFile } = await import("@/utils/media-optimizer");
    const compressed = await compressImageFile(file, 3840, 0.92);
    // Never trade quality for a larger file.
    if (compressed.size > 0 && compressed.size < file.size) {
      return { blob: compressed, toWebp: (compressed.type || "").includes("webp") };
    }
  } catch {
    /* optimisation is best-effort */
  }
  return { blob: file, toWebp: false };
}

async function uploadOnce(
  bucket: string,
  path: string,
  body: Blob,
  contentType: string,
  attempt: number,
  request: UploadRequest,
): Promise<void> {
  const report = (loaded: number, total: number) =>
    request.onProgress?.({
      phase: "uploading",
      loaded,
      total,
      percent: total ? Math.min(99, Math.round((loaded / total) * 100)) : 0,
      attempt,
    });

  const api = backend.storage.from(bucket) as unknown as {
    createSignedUploadUrl?: (
      p: string,
      opts?: { upsert?: boolean },
    ) => Promise<{ data?: { signedUrl?: string } | null; error?: unknown }>;
    upload: (
      p: string,
      f: Blob,
      o?: Record<string, unknown>,
    ) => Promise<{ error?: unknown } | { error: null }>;
  };

  if (typeof api.createSignedUploadUrl === "function") {
    try {
      const signed = await api.createSignedUploadUrl(path, { upsert: true });
      const signedUrl = signed?.data?.signedUrl;
      if (signedUrl) {
        report(0, body.size);
        await putWithProgress(signedUrl, body, contentType, report, request.signal);
        return;
      }
    } catch (error) {
      if (error instanceof UploadCancelledError) throw error;
      /* fall through to the plain upload path */
    }
  }

  // Fallback: provider upload without byte progress — report indeterminate.
  report(0, body.size);
  const result = await api.upload(path, body, {
    contentType,
    upsert: true,
    cacheControl: "31536000",
  });
  const error = (result as { error?: unknown }).error;
  if (error) throw error instanceof Error ? error : new Error(String(error));
  report(body.size, body.size);
}

export async function uploadMedia(request: UploadRequest): Promise<UploadResult> {
  const { bucket, userId, file, signal } = request;
  const maxAttempts = Math.max(1, request.maxAttempts ?? 3);

  const throwIfCancelled = () => {
    if (signal?.aborted) throw new UploadCancelledError();
  };

  throwIfCancelled();
  request.onProgress?.({ phase: "validating", loaded: 0, total: file.size, percent: 0, attempt: 1 });

  const limit = bucketLimitBytes(bucket);
  if (file.size > limit) {
    throw new Error(
      `${file.name} is ${formatBytes(file.size)} — the limit is ${formatBytes(limit)}.`,
    );
  }
  validateUploadLimits(file, file.type, bucket);
  await validateMagicBytes(file, bucket, file.type);
  throwIfCancelled();

  request.onProgress?.({
    phase: "optimizing",
    loaded: 0,
    total: file.size,
    percent: 0,
    attempt: 1,
  });
  const { blob, toWebp } =
    request.optimizeImages === false ? { blob: file as Blob, toWebp: false } : await optimize(file);
  throwIfCancelled();

  const seed = request.seed ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const ext = extensionFor(file, toWebp);
  const path = sanitizeObjectKey(`${userId}/${seed}.${ext}`);
  const contentType = toWebp ? "image/webp" : file.type || "application/octet-stream";

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await uploadOnce(bucket, path, blob, contentType, attempt, request);
      request.onProgress?.({
        phase: "finalizing",
        loaded: blob.size,
        total: blob.size,
        percent: 99,
        attempt,
      });
      const url = await getStorageUrl(bucket, path);
      request.onProgress?.({
        phase: "finalizing",
        loaded: blob.size,
        total: blob.size,
        percent: 100,
        attempt,
      });
      return {
        url,
        path,
        bucket,
        mediaType: detectMediaType(file),
        bytes: blob.size,
      };
    } catch (error) {
      if (error instanceof UploadCancelledError || signal?.aborted) throw new UploadCancelledError();
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const retryable = RETRYABLE.test(message);
      if (!retryable || attempt === maxAttempts) break;
      await sleep(Math.min(8000, 500 * 2 ** (attempt - 1)), signal);
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Upload failed: ${message}`);
}
