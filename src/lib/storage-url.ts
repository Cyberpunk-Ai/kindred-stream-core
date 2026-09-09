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
    // Never fall back to a public URL: private buckets return 400 for those,
    // which would silently persist a dead link on the record.
    console.error("[storage] failed to sign URL", { bucket, path, error });
    throw error ?? new Error("Could not create a link for the uploaded file. Please try again.");
  }

  return data.signedUrl;
}
