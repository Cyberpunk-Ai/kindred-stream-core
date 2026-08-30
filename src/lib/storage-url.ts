import { backend } from "@/backend";

/**
 * Storage buckets in this project are private (public buckets are disabled by
 * workspace policy), so `getPublicUrl` would return a URL that 400s.
 * Instead we mint a long-lived signed URL that can safely be stored alongside
 * the record and rendered later.
 */
const TEN_YEARS_IN_SECONDS = 60 * 60 * 24 * 365 * 10;

export async function getStorageUrl(
  bucket: string,
  path: string,
  expiresIn: number = TEN_YEARS_IN_SECONDS,
): Promise<string> {
  const { data, error } = await backend.storage.from(bucket).createSignedUrl(path, expiresIn);

  if (error || !data?.signedUrl) {
    // Fall back to the public URL shape so callers always get a string.
    return backend.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }

  return data.signedUrl;
}
