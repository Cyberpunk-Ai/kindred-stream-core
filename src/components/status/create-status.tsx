import { useState, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { Link } from "@/lib/router-compat";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { backend } from "@/backend";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Image as ImageIcon,
  Video,
  Smile,
  X,
  RotateCcw,
  ArrowLeft,
  ArrowRight,
  AlertCircle,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { useMediaUpload } from "@/features/social/hooks/useMediaUpload";
import { bucketLimitBytes, formatBytes } from "@/lib/uploads/upload-manager";

const MEDIA_BUCKET = "posts";
const MAX_FILES = 10;

export function CreateStatus() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [content, setContent] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const uploads = useMediaUpload({ bucket: MEDIA_BUCKET, userId: user?.id, maxFiles: MAX_FILES });
  const limit = bucketLimitBytes(MEDIA_BUCKET);

  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const { rejected } = uploads.addFiles(files);
    if (rejected.length) {
      toast({
        title: "Some files were skipped",
        description: rejected.join(", "),
        variant: "destructive",
      });
    }
  };

  const createPost = useMutation({
    mutationFn: async (text: string) => {
      if (!user) throw new Error("Not authenticated");
      if (uploads.busy) throw new Error("Wait for uploads to finish");

      const done = uploads.completed;
      const urls = done.map((item) => item.result!.url);
      const firstVideo = done.find((item) => item.mediaType === "video");

      const { error } = await backend.from("user_statuses").insert({
        user_id: user.id,
        content: text.trim() || null,
        expires_at: null,
        media_url: urls[0] ?? null,
        media_urls: urls,
        media_type: urls.length ? (firstVideo ? "video" : "image") : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setContent("");
      setIsExpanded(false);
      uploads.reset();
      queryClient.invalidateQueries({ queryKey: ["user-statuses"] });
      queryClient.invalidateQueries({ queryKey: ["social", "feed"] });
      toast({ title: "Posted!", description: "Your post is live." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to post", description: err.message, variant: "destructive" });
    },
  });

  if (!user) return null;

  const hasFailures = uploads.failed.length > 0;
  const isSubmitting = createPost.isPending;
  const canPost =
    (content.trim().length > 0 || uploads.completed.length > 0) &&
    content.length <= 280 &&
    !uploads.busy &&
    !isSubmitting;

  return (
    <div className="bg-card border-b border-border/50 md:border md:rounded-xl p-4 mb-4 shadow-sm md:mx-0 transition-all duration-300">
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <div className="flex gap-3">
        <Link to="/social/profile">
          <Avatar className="h-10 w-10 shrink-0 cursor-pointer hover:opacity-90 transition-opacity">
            <AvatarImage src={profile?.avatar_url ?? ""} />
            <AvatarFallback className="bg-muted">
              {(profile?.username ?? "U").charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </Link>
        <div className="flex-1">
          <div
            className={cn(
              "w-full rounded-2xl bg-secondary/30 transition-all duration-300 cursor-text",
              isExpanded ? "min-h-[100px] p-3" : "h-10 px-4 flex items-center",
            )}
            onClick={() => !isExpanded && setIsExpanded(true)}
          >
            {isExpanded ? (
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="What's on your mind, Gamer?"
                aria-label="Post text"
                className="w-full bg-transparent border-none outline-none resize-none placeholder:text-muted-foreground text-sm min-h-[80px]"
                autoFocus
              />
            ) : (
              <span className="text-sm text-muted-foreground">What's on your mind, Gamer?</span>
            )}
          </div>

          {/* Upload queue: previews, progress, retry, cancel, reorder */}
          {uploads.items.length > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {uploads.items.map((item, index) => (
                <div
                  key={item.id}
                  className="relative aspect-square overflow-hidden rounded-xl border border-border/50 bg-secondary/30"
                >
                  {item.mediaType === "video" ? (
                    <video src={item.previewUrl} className="h-full w-full object-cover" muted />
                  ) : (
                    <img
                      src={item.previewUrl}
                      alt={`Attachment ${index + 1}`}
                      className="h-full w-full object-cover"
                    />
                  )}

                  {(item.status === "uploading" || item.status === "queued") && (
                    <div className="absolute inset-x-0 bottom-0 bg-background/80 px-1.5 py-1">
                      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${item.percent}%` }}
                        />
                      </div>
                      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                        {item.phase === "uploading" ? `${item.percent}%` : item.phase}
                        {item.attempt > 1 ? ` · retry ${item.attempt}` : ""}
                      </p>
                    </div>
                  )}

                  {item.status === "done" && (
                    <span className="absolute bottom-1 left-1 rounded-full bg-primary/90 p-0.5 text-primary-foreground">
                      <Check className="h-3 w-3" />
                    </span>
                  )}

                  {(item.status === "error" || item.status === "cancelled") && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-background/85 p-1 text-center">
                      <AlertCircle className="h-4 w-4 text-destructive" />
                      <p className="line-clamp-2 text-[10px] text-muted-foreground">{item.error}</p>
                      <button
                        type="button"
                        onClick={() => uploads.retry(item.id)}
                        className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold"
                      >
                        <RotateCcw className="h-3 w-3" /> Retry
                      </button>
                    </div>
                  )}

                  <div className="absolute right-1 top-1 flex gap-1">
                    <button
                      type="button"
                      aria-label="Remove attachment"
                      onClick={() => uploads.remove(item.id)}
                      className="rounded-full bg-background/80 p-1 hover:bg-background"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>

                  {uploads.items.length > 1 && (
                    <div className="absolute left-1 top-1 flex gap-1">
                      <button
                        type="button"
                        aria-label="Move left"
                        disabled={index === 0}
                        onClick={() => uploads.move(item.id, -1)}
                        className="rounded-full bg-background/80 p-1 disabled:opacity-40"
                      >
                        <ArrowLeft className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        aria-label="Move right"
                        disabled={index === uploads.items.length - 1}
                        onClick={() => uploads.move(item.id, 1)}
                        className="rounded-full bg-background/80 p-1 disabled:opacity-40"
                      >
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {hasFailures && (
            <p className="mt-2 text-xs text-destructive">
              {uploads.failed.length} attachment(s) didn&apos;t upload. Retry or remove them before
              posting.
            </p>
          )}

          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden flex items-center justify-between mt-3 pt-3 border-t border-border/50"
              >
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Add photos"
                    className="h-8 w-8 text-primary rounded-full hover:bg-primary/10"
                    onClick={() => imageInputRef.current?.click()}
                    disabled={isSubmitting}
                  >
                    <ImageIcon className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Add a video"
                    className="h-8 w-8 text-primary rounded-full hover:bg-primary/10"
                    onClick={() => videoInputRef.current?.click()}
                    disabled={isSubmitting}
                  >
                    <Video className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Emoji"
                    className="h-8 w-8 text-muted-foreground rounded-full"
                  >
                    <Smile className="h-4 w-4" />
                  </Button>
                  <span className="ml-1 hidden text-[11px] text-muted-foreground sm:inline">
                    up to {formatBytes(limit)} each
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "text-xs",
                      content.length > 250 ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {content.length}/280
                  </span>
                  <Button
                    size="sm"
                    className="h-8 px-4 rounded-full font-bold bg-primary text-primary-foreground hover:bg-primary/90"
                    disabled={!canPost}
                    onClick={() => createPost.mutate(content)}
                  >
                    {isSubmitting ? "Posting…" : uploads.busy ? "Uploading…" : "Post"}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
