import { useCallback, useEffect, useRef, useState } from "react";
import {
  UploadCancelledError,
  bucketLimitBytes,
  detectMediaType,
  formatBytes,
  uploadMedia,
  type UploadResult,
} from "@/lib/uploads/upload-manager";

export type UploadItemStatus = "queued" | "uploading" | "done" | "error" | "cancelled";

export interface UploadItem {
  id: string;
  file: File;
  previewUrl: string;
  mediaType: "image" | "video" | "file";
  status: UploadItemStatus;
  percent: number;
  phase: string;
  attempt: number;
  error?: string;
  result?: UploadResult;
}

interface Options {
  bucket: string;
  userId?: string | null;
  maxFiles?: number;
}

function newId() {
  return `u_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Manages a queue of media uploads with progress, retry, cancellation and
 * recovery. The queue is the single source of truth for the composer UI, so a
 * post is only ever created from uploads that actually completed.
 */
export function useMediaUpload({ bucket, userId, maxFiles = 10 }: Options) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const controllers = useRef(new Map<string, AbortController>());
  const itemsRef = useRef<UploadItem[]>([]);
  itemsRef.current = items;

  useEffect(
    () => () => {
      controllers.current.forEach((c) => c.abort());
      itemsRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    },
    [],
  );

  const patch = useCallback((id: string, next: Partial<UploadItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...next } : item)));
  }, []);

  const run = useCallback(
    async (item: UploadItem) => {
      if (!userId) {
        patch(item.id, { status: "error", error: "You must be signed in to upload." });
        return;
      }
      const controller = new AbortController();
      controllers.current.set(item.id, controller);
      patch(item.id, { status: "uploading", percent: 0, error: undefined, phase: "validating" });
      try {
        const result = await uploadMedia({
          bucket,
          userId,
          file: item.file,
          signal: controller.signal,
          onProgress: (p) =>
            patch(item.id, { percent: p.percent, phase: p.phase, attempt: p.attempt }),
        });
        patch(item.id, { status: "done", percent: 100, result, phase: "done" });
      } catch (error) {
        if (error instanceof UploadCancelledError) {
          patch(item.id, { status: "cancelled", error: "Cancelled" });
        } else {
          patch(item.id, {
            status: "error",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      } finally {
        controllers.current.delete(item.id);
      }
    },
    [bucket, patch, userId],
  );

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const limit = bucketLimitBytes(bucket);
      const incoming = Array.from(files);
      const room = Math.max(0, maxFiles - itemsRef.current.length);
      const accepted: UploadItem[] = [];
      const rejected: string[] = [];

      incoming.slice(0, room).forEach((file) => {
        if (file.size > limit) {
          rejected.push(`${file.name} (${formatBytes(file.size)} > ${formatBytes(limit)})`);
          return;
        }
        accepted.push({
          id: newId(),
          file,
          previewUrl: URL.createObjectURL(file),
          mediaType: detectMediaType(file),
          status: "queued",
          percent: 0,
          phase: "queued",
          attempt: 1,
        });
      });

      if (incoming.length > room) {
        rejected.push(`Only ${maxFiles} files per post`);
      }

      if (accepted.length) {
        setItems((prev) => [...prev, ...accepted]);
        accepted.forEach((item) => void run(item));
      }
      return { accepted: accepted.length, rejected };
    },
    [bucket, maxFiles, run],
  );

  const retry = useCallback(
    (id: string) => {
      const item = itemsRef.current.find((i) => i.id === id);
      if (item) void run(item);
    },
    [run],
  );

  const cancel = useCallback((id: string) => {
    controllers.current.get(id)?.abort();
  }, []);

  const remove = useCallback((id: string) => {
    controllers.current.get(id)?.abort();
    setItems((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  }, []);

  const move = useCallback((id: string, direction: -1 | 1) => {
    setItems((prev) => {
      const index = prev.findIndex((i) => i.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    controllers.current.forEach((c) => c.abort());
    controllers.current.clear();
    setItems((prev) => {
      prev.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      return [];
    });
  }, []);

  const busy = items.some((i) => i.status === "uploading" || i.status === "queued");
  const failed = items.filter((i) => i.status === "error" || i.status === "cancelled");
  const completed = items.filter((i) => i.status === "done");

  return { items, addFiles, retry, cancel, remove, move, reset, busy, failed, completed };
}
