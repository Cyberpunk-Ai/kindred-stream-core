import { backend } from "@/backend";

/**
 * Deletes stories created > 24 hours ago (where expires_at is non-null) from database & storage.
 * Permanent posts (where expires_at is null) remain unaffected and are preserved indefinitely.
 */
export async function cleanupExpiredStories() {
  try {
    const nowIso = new Date().toISOString();
    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Select statuses that are stories (expires_at is non-null) and have passed their 24h expiration
    const { data: expired } = await backend
      .from("user_statuses")
      .select("id, media_url, media_type, expires_at")
      .not("expires_at", "is", null)
      .or(`expires_at.lte.${nowIso},created_at.lt.${cutoff24h}`);

    if (expired && expired.length > 0) {
      const idsToDelete = expired.map((s) => s.id);

      // Clean up files in stories bucket (canonical) or status-media (legacy)
      for (const item of expired) {
        if (item.media_url) {
          try {
            let filePath: string | undefined;
            const storiesParts = item.media_url.split("/stories/");
            const legacyParts = item.media_url.split("/status-media/");

            if (storiesParts[1]) {
              filePath = decodeURIComponent(storiesParts[1].split("?")[0]);
              await backend.storage.from("stories").remove([filePath]);
            } else if (legacyParts[1]) {
              // Fallback for legacy media
              filePath = decodeURIComponent(legacyParts[1].split("?")[0]);
              await backend.storage.from("stories").remove([filePath]);
            }
          } catch {
            // storage deletion error ignore
          }
        }
      }

      // Delete expired rows from database
      await backend.from("user_statuses").delete().in("id", idsToDelete);
    }
  } catch (err) {
    console.error("Error during story cleanup:", err);
  }
}
