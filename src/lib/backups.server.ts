import type { SupabaseClient } from "@supabase/supabase-js";

export const BACKUP_BUCKET = "backups";
export const MAX_RETAINED = 3;
export const STORAGE_COPY_LIMIT_BYTES = 50 * 1024 * 1024;

export const BACKUP_TABLES = [
  "profiles",
  "user_roles",
  "tournaments",
  "matches",
  "game_rooms",
  "payments",
  "registrations",
  "user_statuses",
  "status_likes",
  "status_comments",
  "status_saves",
  "user_follows",
  "achievements",
  "user_achievements",
  "leaderboard_stats",
  "notifications",
  "marketplace_listings",
  "conversations",
  "messages",
  "support_tickets",
  "ticket_messages",
  "referrals",
  "rewards",
  "activity_feed",
  "whatsapp_messages",
  "squads",
  "squad_members",
  "squad_invites",
  "squad_messages",
  "squad_events",
  "squad_join_requests",
  "analytics_events",
] as const;

/** Canonical storage buckets for backup purposes */
export const STORAGE_BUCKETS = [
  "avatars",
  "posts",
  "stories",
  "short-videos",
  "tournaments",
  "achievements",
  "rewards",
  "marketplace",
  "messages",
  "support",
  "backups",
];

type Admin = SupabaseClient<any, any, any>;

export async function assertAdmin(supabase: Admin, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error("Could not verify permissions");
  if (!data) throw new Error("Forbidden: administrators only");
}

async function listAllObjects(admin: Admin, bucket: string, prefix = ""): Promise<string[]> {
  const out: string[] = [];
  const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error || !data) return out;
  for (const entry of data) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.id === null && !entry.metadata) {
      out.push(...(await listAllObjects(admin, bucket, path)));
    } else {
      out.push(path);
    }
  }
  return out;
}

export async function runBackup(
  admin: Admin,
  backupId: string,
  opts: { includeDatabase: boolean; includeStorage: boolean },
) {
  const folder = `snapshots/${backupId}`;
  let sizeBytes = 0;
  const tableCounts: Record<string, number> = {};
  let fileCount = 0;

  if (opts.includeDatabase) {
    const dump: Record<string, unknown[]> = {};
    for (const table of BACKUP_TABLES) {
      const { data, error } = await admin.from(table).select("*");
      if (error) throw new Error(`Failed reading ${table}: ${error.message}`);
      dump[table] = data ?? [];
      tableCounts[table] = data?.length ?? 0;
    }
    const body = JSON.stringify(
      { version: 1, created_at: new Date().toISOString(), tables: dump },
      null,
      2,
    );
    sizeBytes += new TextEncoder().encode(body).length;
    const { error: upErr } = await admin.storage
      .from(BACKUP_BUCKET)
      .upload(`${folder}/database.json`, new Blob([body], { type: "application/json" }), {
        upsert: true,
        contentType: "application/json",
      });
    if (upErr) throw new Error(`Failed storing database snapshot: ${upErr.message}`);
  }

  if (opts.includeStorage) {
    const manifest: { bucket: string; path: string; copied: boolean }[] = [];
    let copied = 0;
    for (const bucket of STORAGE_BUCKETS) {
      const paths = await listAllObjects(admin, bucket);
      for (const path of paths) {
        let didCopy = false;
        if (copied < STORAGE_COPY_LIMIT_BYTES) {
          const { data: file } = await admin.storage.from(bucket).download(path);
          if (file) {
            const { error: copyErr } = await admin.storage
              .from(BACKUP_BUCKET)
              .upload(`${folder}/storage/${bucket}/${path}`, file, { upsert: true });
            if (!copyErr) {
              didCopy = true;
              copied += file.size;
              sizeBytes += file.size;
            }
          }
        }
        manifest.push({ bucket, path, copied: didCopy });
        fileCount += 1;
      }
    }
    const manifestBody = JSON.stringify({ files: manifest }, null, 2);
    sizeBytes += new TextEncoder().encode(manifestBody).length;
    await admin.storage
      .from(BACKUP_BUCKET)
      .upload(
        `${folder}/storage-manifest.json`,
        new Blob([manifestBody], { type: "application/json" }),
        { upsert: true, contentType: "application/json" },
      );
  }

  return { folder, sizeBytes, tableCounts, fileCount };
}

export async function removeBackupFiles(admin: Admin, folder: string) {
  const queue = [folder];
  const files: string[] = [];
  while (queue.length) {
    const prefix = queue.pop()!;
    const { data } = await admin.storage.from(BACKUP_BUCKET).list(prefix, { limit: 1000 });
    for (const entry of data ?? []) {
      const path = `${prefix}/${entry.name}`;
      if (entry.id === null && !entry.metadata) queue.push(path);
      else files.push(path);
    }
  }
  if (files.length) await admin.storage.from(BACKUP_BUCKET).remove(files);
}

export async function pruneBackups(admin: Admin) {
  const { data } = await admin
    .from("backups")
    .select("id, storage_path, pinned")
    .eq("pinned", false)
    .eq("status", "completed")
    .order("created_at", { ascending: false });
  const stale = (data ?? []).slice(MAX_RETAINED);
  for (const row of stale) {
    if (row.storage_path) await removeBackupFiles(admin, row.storage_path);
    await admin.from("backups").delete().eq("id", row.id);
  }
  return stale.length;
}
