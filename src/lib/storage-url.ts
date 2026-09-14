import { backend, backendConfig } from "@/backend";

/**
 * Returns the URL that gets stored on a record for an uploaded object.
 *
 * On object storage (R2/S3/VPS gateway) the URL must be stable: presigned links
 * expire (24h at most), so a signed link stored on a post would become a dead
 * image. The gateway route serves objects with credentials held server-side, so
 * a plain object URL is both stable and safe.
 *
 * On the managed backend, buckets are private and public URLs 400, so a
 * long-lived signed URL is minted instead.
 */
const TEN_YEARS_IN_SECONDS = 60 * 60 * 24 * 365 * 10;

export async function getStorageUrl(
  bucket: string,
  path: string,
  expiresIn: number = TEN_YEARS_IN_SECONDS,
): Promise<string> {
  if (backendConfig.storage !== "supabase") {
    const url = backend.storage.from(bucket).getPublicUrl(path)?.data?.publicUrl;
    if (!url) throw new Error("Could not build a link for the uploaded file. Please try again.");
    return url;
  }

  const { data, error } = await backend.storage.from(bucket).createSignedUrl(path, expiresIn);

  if (error || !data?.signedUrl) {
    // Never fall back to a public URL: private buckets return 400 for those,
    // which would silently persist a dead link on the record.
    console.error("[storage] failed to sign URL", { bucket, path, error });
    throw error ?? new Error("Could not create a link for the uploaded file. Please try again.");
  }

  return data.signedUrl;
}
