import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listBackups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertAdmin } = await import("@/lib/backups.server");
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("backups")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { label?: string; includeStorage?: boolean }) => input ?? {})
  .handler(async ({ data, context }) => {
    const { assertAdmin, runBackup, pruneBackups } = await import("@/lib/backups.server");
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const includeStorage = data.includeStorage !== false;
    const { data: row, error } = await supabaseAdmin
      .from("backups")
      .insert({
        label:
          data.label?.trim() ||
          `Snapshot ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
        status: "pending",
        includes_database: true,
        includes_storage: includeStorage,
        created_by: context.userId,
      })
      .select()
      .single();
    if (error || !row) throw new Error(error?.message ?? "Could not start backup");

    try {
      const result = await runBackup(supabaseAdmin as never, row.id, {
        includeDatabase: true,
        includeStorage,
      });
      await supabaseAdmin
        .from("backups")
        .update({
          status: "completed",
          storage_path: result.folder,
          size_bytes: result.sizeBytes,
          table_counts: result.tableCounts,
          storage_file_count: result.fileCount,
          completed_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      const removed = await pruneBackups(supabaseAdmin as never);
      return { id: row.id, removed };
    } catch (err) {
      await supabaseAdmin
        .from("backups")
        .update({ status: "failed", error: (err as Error).message })
        .eq("id", row.id);
      throw err;
    }
  });

export const setBackupPinned = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; pinned: boolean }) => input)
  .handler(async ({ data, context }) => {
    const { assertAdmin, pruneBackups } = await import("@/lib/backups.server");
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("backups")
      .update({ pinned: data.pinned })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    if (!data.pinned) await pruneBackups(supabaseAdmin as never);
    return { ok: true };
  });

export const deleteBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { assertAdmin, removeBackupFiles } = await import("@/lib/backups.server");
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("backups")
      .select("storage_path")
      .eq("id", data.id)
      .maybeSingle();
    if (row?.storage_path) await removeBackupFiles(supabaseAdmin as never, row.storage_path);
    const { error } = await supabaseAdmin.from("backups").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getBackupDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import("@/lib/backups.server");
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("backups")
      .select("storage_path")
      .eq("id", data.id)
      .maybeSingle();
    if (!row?.storage_path) throw new Error("Backup files not found");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("backups")
      .createSignedUrl(`${row.storage_path}/database.json`, 60 * 10);
    if (error || !signed) throw new Error(error?.message ?? "Could not create download link");
    return { url: signed.signedUrl };
  });
