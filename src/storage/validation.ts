export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const GAMEFLEX_ALLOWED_MIME_TYPES = {
  avatars: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  posts: ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm", "image/gif"],
  stories: ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm", "image/gif"],
  "short-videos": ["video/mp4", "video/webm", "video/quicktime", "video/x-matroska"],
  messages: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "video/mp4",
    "video/webm",
    "application/pdf",
  ],
  tournaments: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  achievements: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  rewards: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  marketplace: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  support: ["image/jpeg", "image/png", "image/webp", "application/pdf", "text/plain"],
  backups: [],
} as const;

export const MAX_UPLOAD_BYTES_BY_BUCKET = {
  avatars: MAX_UPLOAD_BYTES,
  posts: MAX_UPLOAD_BYTES,
  stories: MAX_UPLOAD_BYTES,
  "short-videos": MAX_UPLOAD_BYTES,
  messages: MAX_UPLOAD_BYTES,
  tournaments: MAX_UPLOAD_BYTES,
  achievements: MAX_UPLOAD_BYTES,
  rewards: MAX_UPLOAD_BYTES,
  marketplace: MAX_UPLOAD_BYTES,
  support: MAX_UPLOAD_BYTES,
  backups: MAX_UPLOAD_BYTES,
} as const;

export function sanitizeObjectKey(input: string): string {
  const value = String(input ?? "").trim();
  if (!value) throw new Error("Object key is required");
  if (value.includes("..") || value.startsWith("/") || value.startsWith("\\")) {
    throw new Error("Invalid object key: path traversal is not allowed");
  }
  const normalized = value.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/");
  if (!normalized || normalized.includes("..")) {
    throw new Error("Invalid object key: invalid path segments");
  }
  return normalized;
}

export function createStableObjectKey(
  bucket: string,
  userId: string,
  seed: string,
  ext?: string,
): string {
  const cleanedBucket = sanitizeObjectKey(bucket);
  const cleanedUserId = sanitizeObjectKey(userId || "anon");
  const safeSeed = sanitizeObjectKey(seed).replace(/\s+/g, "-");
  const base = `${cleanedBucket}/${cleanedUserId}/${safeSeed}`;
  if (ext) {
    const cleanExt = ext
      .replace(/^\.+/, "")
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .toLowerCase();
    return cleanExt ? `${base}.${cleanExt}` : base;
  }
  return base;
}

export function isValidMimeType(bucket: string, mimeType?: string): boolean {
  const allowed = (GAMEFLEX_ALLOWED_MIME_TYPES as Record<string, readonly string[]>)[bucket] ?? [];
  if (!allowed.length) return true;
  if (!mimeType) return false;
  return allowed.includes(mimeType.toLowerCase());
}

export function validateUploadLimits(
  file: Blob | File,
  mimeType: string | undefined,
  bucket: string,
): void {
  const limit = (MAX_UPLOAD_BYTES_BY_BUCKET as Record<string, number>)[bucket] ?? MAX_UPLOAD_BYTES;
  if (file.size > limit) {
    throw new Error(`File exceeds the ${limit / (1024 * 1024)} MB size limit for ${bucket}`);
  }
  if (!isValidMimeType(bucket, mimeType ?? file.type)) {
    throw new Error(`MIME type ${mimeType ?? file.type} is not allowed for bucket ${bucket}`);
  }
}

export async function readMagicBytes(file: Blob | File, bytes = 16): Promise<Uint8Array> {
  const slice = file.slice(0, bytes);
  const arrayBuffer = await slice.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

export function isLikelyJpeg(signature: Uint8Array): boolean {
  return signature.length >= 2 && signature[0] === 0xff && signature[1] === 0xd8;
}

export function isLikelyPng(signature: Uint8Array): boolean {
  return (
    signature.length >= 8 &&
    signature[0] === 0x89 &&
    signature[1] === 0x50 &&
    signature[2] === 0x4e &&
    signature[3] === 0x47
  );
}

export function isLikelyGif(signature: Uint8Array): boolean {
  return (
    signature.length >= 6 && signature[0] === 0x47 && signature[1] === 0x49 && signature[2] === 0x46
  );
}

export function isLikelyWebp(signature: Uint8Array): boolean {
  return (
    signature.length >= 12 &&
    signature[0] === 0x52 &&
    signature[1] === 0x49 &&
    signature[2] === 0x46 &&
    signature[3] === 0x46 &&
    signature[8] === 0x57 &&
    signature[9] === 0x45 &&
    signature[10] === 0x42 &&
    signature[11] === 0x50
  );
}

export function isLikelyMp4(signature: Uint8Array): boolean {
  return (
    signature.length >= 12 &&
    signature[4] === 0x66 &&
    signature[5] === 0x74 &&
    signature[6] === 0x79 &&
    signature[7] === 0x70
  );
}

export async function validateMagicBytes(
  file: Blob | File,
  bucket: string,
  mimeType?: string,
): Promise<void> {
  const value = (mimeType ?? file.type ?? "").toLowerCase();
  if (!value) return;
  const bytes = await readMagicBytes(file);
  if ((value.includes("jpeg") || value.includes("jpg")) && !isLikelyJpeg(bytes))
    throw new Error("Image signature does not match JPEG");
  if (value.includes("png") && !isLikelyPng(bytes))
    throw new Error("Image signature does not match PNG");
  if (value.includes("gif") && !isLikelyGif(bytes))
    throw new Error("Image signature does not match GIF");
  if (value.includes("webp") && !isLikelyWebp(bytes))
    throw new Error("Image signature does not match WebP");
  if (
    (value.includes("mp4") ||
      value.includes("quicktime") ||
      value.includes("matroska") ||
      value.includes("webm")) &&
    !isLikelyMp4(bytes)
  ) {
    if (!(
      value.includes("webm") &&
      bytes.length >= 4 &&
      bytes[0] === 0x1a &&
      bytes[1] === 0x45 &&
      bytes[2] === 0xdf &&
      bytes[3] === 0xa3
    )) {
      throw new Error("Video signature does not match the declared media type");
    }
  }
}
