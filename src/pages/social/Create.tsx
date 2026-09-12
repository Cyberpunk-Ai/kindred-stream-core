import { useState, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { useNavigate } from "@/lib/router-compat";
import { SocialLayout } from "@/components/social/social-nav";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Upload,
  X,
  Globe,
  Lock,
  Loader2,
  Check,
  ImageIcon,
  Video,
  AlertCircle,
  RotateCcw,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { backend } from "@/backend";
import { useToast } from "@/hooks/use-toast";
import { useMediaUpload } from "@/features/social/hooks/useMediaUpload";
import { bucketLimitBytes, formatBytes } from "@/lib/uploads/upload-manager";
import { STORY_GRADIENTS, encodeTextStoryType } from "@/features/stories/gradients";

const MEDIA_BUCKET = "posts";
const MAX_FILES = 10;

const POST_TYPES = [
  { emoji: "🏆", label: "Victory", id: "victory" },
  { emoji: "🎮", label: "Gameplay", id: "gameplay" },
  { emoji: "📸", label: "Screenshot", id: "screenshot" },
  { emoji: "🎬", label: "Clip", id: "clip" },
  { emoji: "📢", label: "Announce", id: "announcement" },
  { emoji: "👥", label: "Team", id: "team" },
];

export default function Create() {
  const { user } = useAuth();
  const nav = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [caption, setCaption] = useState("");
  const [postType, setPostType] = useState("victory");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [textMode, setTextMode] = useState(false);
  const [gradientId, setGradientId] = useState(STORY_GRADIENTS[0].id);

  const uploads = useMediaUpload({ bucket: MEDIA_BUCKET, userId: user?.id, maxFiles: MAX_FILES });
  const limit = bucketLimitBytes(MEDIA_BUCKET);
  const gradientCss =
    STORY_GRADIENTS.find((g) => g.id === gradientId)?.css ?? STORY_GRADIENTS[0].css;

  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const { rejected } = uploads.addFiles(files);
    setTextMode(false);
    if (rejected.length) {
      toast({
        title: "Some files were skipped",
        description: rejected.join(", "),
        variant: "destructive",
      });
    }
  };

  const publish = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      if (uploads.busy) throw new Error("Wait for uploads to finish");

      const done = uploads.completed;
      const urls = done.map((item) => item.result!.url);
      const firstVideo = done.find((item) => item.mediaType === "video");
      const isTextCard = !urls.length && textMode;

      const { error } = await backend.from("user_statuses").insert({
        user_id: user.id,
        content: caption.trim() || null,
        post_type: postType,
        media_url: urls[0] ?? null,
        media_urls: urls,
        // A caption-only card keeps its chosen gradient, encoded in media_type.
        media_type: urls.length
          ? firstVideo
            ? "video"
            : "image"
          : isTextCard
            ? encodeTextStoryType(gradientId)
            : null,
        expires_at: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Posted!", description: "Your post is live." });
      uploads.reset();
      queryClient.invalidateQueries({ queryKey: ["social", "feed"] });
      queryClient.invalidateQueries({ queryKey: ["my-posts"] });
      queryClient.invalidateQueries({ queryKey: ["profile-counts"] });
      queryClient.invalidateQueries({ queryKey: ["player-user-posts"] });
      queryClient.invalidateQueries({ queryKey: ["player-profile-counts"] });
      nav("/social");
    },
    onError: (error: unknown) => {
      toast({
        title: error instanceof Error ? error.message : "Failed to publish post.",
        variant: "destructive",
      });
    },
  });

  if (!user) {
    return (
      <SocialLayout title="Create">
        <p className="py-20 text-center text-muted-foreground">Sign in to create a post.</p>
      </SocialLayout>
    );
  }

  const hasFailures = uploads.failed.length > 0;
  const canPost =
    (caption.trim().length > 0 || uploads.completed.length > 0) &&
    !uploads.busy &&
    !publish.isPending;

  return (
    <SocialLayout title="New Post">
      <div className="mx-auto max-w-xl px-4 pb-10 md:px-0">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(event) => {
            handleFiles(event.target.files);
            event.target.value = "";
          }}
        />

        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Media
            </span>

            {uploads.items.length === 0 && (
              <button
                type="button"
                onClick={() => setTextMode((value) => !value)}
                className="text-xs font-semibold text-primary hover:underline"
              >
                {textMode ? "← Upload instead" : "Use text gradient →"}
              </button>
            )}
          </div>

          {uploads.items.length > 0 ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
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

                  <button
                    type="button"
                    aria-label="Remove attachment"
                    onClick={() => uploads.remove(item.id)}
                    className="absolute right-1 top-1 rounded-full bg-background/80 p-1 hover:bg-background"
                  >
                    <X className="h-3 w-3" />
                  </button>

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

              {uploads.items.length < MAX_FILES && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Add more media"
                  className="flex aspect-square items-center justify-center rounded-xl border-2 border-dashed border-border/60 text-muted-foreground hover:border-primary/50"
                >
                  <Upload className="h-5 w-5" />
                </button>
              )}
            </div>
          ) : textMode ? (
            <div
              className="relative flex aspect-video items-center justify-center overflow-hidden rounded-2xl p-8 text-center shadow-md"
              style={{ background: gradientCss }}
            >
              <div
                className="pointer-events-none absolute inset-0 opacity-10"
                style={{
                  backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
                  backgroundSize: "24px 24px",
                }}
              />
              <p className="z-10 text-xl font-bold leading-snug text-white drop-shadow-xl">
                {caption || "Your caption appears here…"}
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="group flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border/60 bg-secondary/30 transition-all hover:border-primary/50 hover:bg-secondary/50"
            >
              <div className="flex gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 transition-transform group-hover:scale-105">
                  <ImageIcon className="h-6 w-6 text-primary" />
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 transition-transform group-hover:scale-105">
                  <Video className="h-6 w-6 text-primary" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold">Upload photos or a video</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Up to {MAX_FILES} photos · {formatBytes(limit)} each
                </p>
              </div>
            </button>
          )}

          {hasFailures && (
            <p className="mt-2 text-xs text-destructive">
              {uploads.failed.length} attachment(s) didn&apos;t upload. Retry or remove them before
              posting.
            </p>
          )}

          {textMode && uploads.items.length === 0 && (
            <div className="scrollbar-hide mt-3 flex gap-2 overflow-x-auto pb-0.5">
              {STORY_GRADIENTS.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => setGradientId(item.id)}
                  className={cn(
                    "relative h-9 w-14 shrink-0 overflow-hidden rounded-lg transition-all hover:scale-105",
                    gradientId === item.id
                      ? "ring-2 ring-primary ring-offset-1 ring-offset-background"
                      : "",
                  )}
                  style={{ background: item.css }}
                  title={item.label}
                  aria-label={`Use ${item.label} gradient`}
                >
                  {gradientId === item.id && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Check className="h-3.5 w-3.5 stroke-[3] text-white drop-shadow" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mb-4">
          <Textarea
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            placeholder="Write a caption…"
            maxLength={2200}
            className="min-h-[90px] resize-none border-border/50 bg-secondary/30 text-sm"
          />
          <p className="mt-1 text-right text-xs text-muted-foreground">{caption.length}/2200</p>
        </div>

        <div className="mb-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Type
          </p>
          <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-0.5">
            {POST_TYPES.map((type) => (
              <button
                type="button"
                key={type.id}
                onClick={() => setPostType(type.id)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-all",
                  postType === type.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border/50 bg-secondary/30 hover:bg-secondary/60",
                )}
              >
                <span className="text-base leading-none">{type.emoji}</span>
                {type.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Audience
          </p>
          <div className="flex gap-3">
            {[
              { id: "public", icon: Globe, label: "Everyone" },
              { id: "private", icon: Lock, label: "Followers" },
            ].map(({ id, icon: Icon, label }) => (
              <button
                type="button"
                key={id}
                onClick={() => setVisibility(id as "public" | "private")}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-semibold transition-all",
                  visibility === id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/50 bg-secondary/30 hover:bg-secondary/50",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </div>

        <Button
          size="lg"
          className="h-12 w-full rounded-xl font-bold"
          disabled={!canPost}
          onClick={() => publish.mutate()}
        >
          {publish.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Posting…
            </>
          ) : uploads.busy ? (
            "Uploading…"
          ) : (
            "Publish Post"
          )}
        </Button>
      </div>
    </SocialLayout>
  );
}
