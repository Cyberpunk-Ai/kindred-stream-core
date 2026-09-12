import { useNavigate, useLocation } from "@/lib/router-compat";
import { useRef, useState, useEffect, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { backend } from "@/backend";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { calculateStoryExpiresAt } from "@/lib/story-utils";
import {
  Loader2,
  Upload,
  X,
  Image as ImageIcon,
  Video,
  ArrowLeft,
  Type,
  Check,
  AlertCircle,
  Clock,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  STORY_GRADIENTS,
  DEFAULT_STORY_GRADIENT,
  encodeTextStoryType,
} from "@/features/stories/gradients";
import { STORAGE_BUCKETS } from "@/backend/buckets";
import { getStorageUrl } from "@/lib/storage-url";

const MAX_BYTES = 25 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 60;
const MAX_TEXT_LENGTH = 180;
/** How many photos one story sequence can hold. */
const MAX_STORY_FRAMES = 10;

type Mode = "media" | "text";
type MediaKind = "image" | "video";

interface StoryFrame {
  id: string;
  file: File;
  preview: string;
  kind: MediaKind;
}

/** Reads the duration of a video File without uploading it. */
function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement("video");
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(el.duration);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that video file."));
    };
    el.src = url;
  });
}

function fileExtension(file: File): string {
  const fromName = file.name.split(".").pop();
  if (fromName && /^[a-z0-9]{1,5}$/i.test(fromName)) return fromName.toLowerCase();
  const fromType = file.type.split("/").pop();
  return fromType && /^[a-z0-9]{1,5}$/i.test(fromType) ? fromType.toLowerCase() : "bin";
}

export default function StoryNew() {
  const { user, isLoading: authLoading } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);

  const [mode, setMode] = useState<Mode>("media");
  const [items, setItems] = useState<StoryFrame[]>([]);
  const [active, setActive] = useState(0);
  const [caption, setCaption] = useState("");
  const [text, setText] = useState("");
  const [gradientId, setGradientId] = useState(DEFAULT_STORY_GRADIENT.id);
  const [dragging, setDragging] = useState(false);

  const gradientCss =
    STORY_GRADIENTS.find((g) => g.id === gradientId)?.css ?? DEFAULT_STORY_GRADIENT.css;

  useEffect(() => {
    if (!authLoading && !user) {
      nav(`/login?returnTo=${encodeURIComponent(location.pathname)}`);
    }
    // nav/location are new refs each render and would loop the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  // Keep the live preview URLs so they can all be revoked on unmount.
  const framesRef = useRef<StoryFrame[]>([]);
  framesRef.current = items;
  useEffect(
    () => () => {
      framesRef.current.forEach((frame) => URL.revokeObjectURL(frame.preview));
    },
    [],
  );

  const clearMedia = useCallback(() => {
    setItems((prev) => {
      prev.forEach((frame) => URL.revokeObjectURL(frame.preview));
      return [];
    });
    setActive(0);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      const target = prev.find((frame) => frame.id === id);
      if (target) URL.revokeObjectURL(target.preview);
      return prev.filter((frame) => frame.id !== id);
    });
    setActive(0);
    if (inputRef.current) inputRef.current.value = "";
  }, []);


  /** Validates one file and returns a frame, or null when it is rejected. */
  const validateFile = useCallback(
    async (f: File): Promise<StoryFrame | null> => {
      const isImage = f.type.startsWith("image/");
      const isVideo = f.type.startsWith("video/");
      if (!isImage && !isVideo) {
        toast({
          title: "Unsupported file",
          description: "Pick an image or a short video.",
          variant: "destructive",
        });
        return null;
      }
      if (f.size > MAX_BYTES) {
        toast({
          title: "File too large",
          description: "Stories are capped at 25 MB.",
          variant: "destructive",
        });
        return null;
      }
      if (isVideo) {
        try {
          const duration = await readVideoDuration(f);
          if (duration > MAX_VIDEO_SECONDS) {
            toast({
              title: "Video too long",
              description: `Story clips must be ${MAX_VIDEO_SECONDS} seconds or shorter.`,
              variant: "destructive",
            });
            return null;
          }
        } catch (err) {
          toast({
            title: "Unreadable video",
            description: (err as Error).message,
            variant: "destructive",
          });
          return null;
        }
      }

      return {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        file: f,
        preview: URL.createObjectURL(f),
        kind: isVideo ? "video" : "image",
      };
    },
    [toast],
  );

  /** Accepts a multi-select: several photos, or a single video clip. */
  const pickFiles = useCallback(
    async (list?: FileList | File[] | null) => {
      const incoming = Array.from(list ?? []);
      if (!incoming.length) return;

      const frames: StoryFrame[] = [];
      for (const f of incoming) {
        const frame = await validateFile(f);
        if (frame) frames.push(frame);
      }
      if (!frames.length) return;

      // A clip is always its own story, so a video replaces any photo queue.
      if (frames.some((frame) => frame.kind === "video")) {
        const clip = frames.find((frame) => frame.kind === "video")!;
        frames.filter((frame) => frame !== clip).forEach((f) => URL.revokeObjectURL(f.preview));
        setItems((prev) => {
          prev.forEach((f) => URL.revokeObjectURL(f.preview));
          return [clip];
        });
        setActive(0);
        return;
      }

      setItems((prev) => {
        const base = prev.some((frame) => frame.kind === "video") ? [] : prev;
        if (base !== prev) prev.forEach((f) => URL.revokeObjectURL(f.preview));
        const room = Math.max(0, MAX_STORY_FRAMES - base.length);
        if (frames.length > room) {
          toast({
            title: `Up to ${MAX_STORY_FRAMES} photos`,
            description: "The extra photos were skipped.",
          });
          frames.slice(room).forEach((f) => URL.revokeObjectURL(f.preview));
        }
        return [...base, ...frames.slice(0, room)];
      });
    },
    [toast, validateFile],
  );

  const publish = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("You need to be signed in to post a story.");

      if (mode === "text") {
        const body = text.trim();
        if (!body) throw new Error("Write something for your story first.");
        // Stories and posts both live in `user_statuses`; text stories encode
        // their gradient in `media_type` as `text:<gradientId>`.
        const { error } = await backend.from("user_statuses").insert({
          user_id: user.id,
          content: body,
          media_url: null,
          media_type: encodeTextStoryType(gradientId),
          expires_at: calculateStoryExpiresAt(),
        });
        if (error) throw error;
        return;
      }

      if (!file) throw new Error("Pick a photo or a short video first.");

      // Storage RLS scopes writes to a folder named after the owner's user id,
      // so the user id MUST be the first path segment.
      const path = `${user.id}/story-${Date.now()}.${fileExtension(file)}`;
      const { error: upErr } = await backend.storage
        .from(STORAGE_BUCKETS.STATUS_MEDIA)
        .upload(path, file, { cacheControl: "3600", contentType: file.type, upsert: false });
      if (upErr) throw upErr;

      const publicUrl = await getStorageUrl(STORAGE_BUCKETS.STATUS_MEDIA, path);

      const { error } = await backend.from("user_statuses").insert({
        user_id: user.id,
        content: caption.trim() || null,
        media_url: publicUrl,
        media_type: kind,
        expires_at: calculateStoryExpiresAt(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stories-grid"] });
      queryClient.invalidateQueries({ queryKey: ["stories-rail"] });
      queryClient.invalidateQueries({ queryKey: ["profile-stories"] });
      queryClient.invalidateQueries({ queryKey: ["my-stories"] });
      queryClient.invalidateQueries({ queryKey: ["player-stories"] });
      toast({ title: "Story published", description: "It stays live for 24 hours." });
      nav("/stories");
    },
    onError: (e: Error) =>
      toast({ title: "Could not publish", description: e.message, variant: "destructive" }),
  });

  if (authLoading || !user) return null;

  const canPublish = mode === "text" ? text.trim().length > 0 : !!file;

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <header className="sticky top-0 z-30 h-14 flex items-center justify-between px-4 bg-background/95 backdrop-blur-md border-b border-border/40">
        <button
          type="button"
          onClick={() => nav("/stories")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <h1 className="font-display font-semibold text-sm tracking-tight">Create Story</h1>
        <Button
          size="sm"
          className="h-8 px-4 text-xs font-bold"
          disabled={!canPublish || publish.isPending}
          onClick={() => publish.mutate()}
        >
          {publish.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Share"}
        </Button>
      </header>

      <div className="flex justify-center pt-4 pb-2 px-4">
        <div className="inline-flex items-center gap-0.5 p-1 rounded-lg bg-secondary/60">
          {(
            [
              { id: "media", icon: ImageIcon, label: "Photo / Video" },
              { id: "text", icon: Type, label: "Text" },
            ] as const
          ).map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setMode(id);
                clearMedia();
                setCaption("");
              }}
              className={cn(
                "flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-semibold transition-all",
                mode === id
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center px-4 py-4 gap-4 max-w-sm mx-auto w-full">
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => void pickFile(e.target.files?.[0])}
        />

        <AnimatePresence mode="wait">
          <motion.div
            key={mode + (preview ? "prev" : "empty")}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="w-full"
          >
            {mode === "text" ? (
              <div
                className="relative w-full rounded-2xl overflow-hidden shadow-xl"
                style={{ aspectRatio: "9/16", background: gradientCss }}
              >
                <div
                  className="absolute inset-0 opacity-10 pointer-events-none"
                  style={{
                    backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
                    backgroundSize: "24px 24px",
                  }}
                />
                <div className="absolute top-3 left-3 right-3 h-0.5 bg-white/30 rounded-full" />
                <div className="h-full flex items-center justify-center p-8 text-center">
                  {text.trim() ? (
                    <p className="font-display font-bold text-2xl text-white leading-snug drop-shadow-xl break-words">
                      {text}
                    </p>
                  ) : (
                    <p className="text-white/50 text-base font-medium">
                      Your story text appears here
                    </p>
                  )}
                </div>
              </div>
            ) : items.length > 0 ? (
              <div className="w-full space-y-3">
                <div
                  className="relative w-full rounded-2xl overflow-hidden shadow-xl bg-black"
                  style={{ aspectRatio: "9/16" }}
                >
                  {activeItem.kind === "video" ? (
                    <video
                      src={activeItem.preview}
                      className="w-full h-full object-cover"
                      autoPlay
                      muted
                      loop
                      playsInline
                    />
                  ) : (
                    <img
                      loading="lazy"
                      decoding="async"
                      src={activeItem.preview}
                      alt={`Story frame ${active + 1}`}
                      className="w-full h-full object-cover"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/30 pointer-events-none" />
                  {/* One progress segment per frame, like a real story */}
                  <div className="absolute top-3 left-3 right-3 flex gap-1">
                    {items.map((item, i) => (
                      <span
                        key={item.id}
                        className={cn(
                          "h-0.5 flex-1 rounded-full",
                          i === active ? "bg-white" : "bg-white/30",
                        )}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(activeItem.id)}
                    aria-label="Remove this frame"
                    className="absolute top-6 right-3 h-8 w-8 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/70 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {items.map((item, i) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActive(i)}
                      aria-label={`Show frame ${i + 1}`}
                      className={cn(
                        "relative h-16 w-12 shrink-0 overflow-hidden rounded-lg border-2 transition-all",
                        i === active ? "border-primary" : "border-transparent opacity-70",
                      )}
                    >
                      {item.kind === "video" ? (
                        <video src={item.preview} muted className="h-full w-full object-cover" />
                      ) : (
                        <img
                          src={item.preview}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      )}
                    </button>
                  ))}
                  {items.length < MAX_STORY_FRAMES && items[0]?.kind !== "video" && (
                    <button
                      type="button"
                      onClick={() => inputRef.current?.click()}
                      aria-label="Add more photos"
                      className="h-16 w-12 shrink-0 rounded-lg border-2 border-dashed border-border/60 text-muted-foreground hover:border-primary/50"
                    >
                      +
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {items.length > 1
                    ? `${items.length} frames will post as one story sequence.`
                    : "Add more photos to post a multi-photo story."}
                </p>
              </div>
            ) : (
              <div
                role="button"
                tabIndex={0}
                className={cn(
                  "relative w-full rounded-2xl overflow-hidden shadow-xl flex flex-col items-center justify-center gap-5 transition-all cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  dragging
                    ? "bg-primary/20 border-2 border-primary"
                    : "bg-secondary/40 border-2 border-dashed border-border/60 hover:border-primary/50 hover:bg-secondary/60",
                )}
                style={{ aspectRatio: "9/16" }}
                onClick={() => inputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    inputRef.current?.click();
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  void pickFiles(e.dataTransfer.files);
                }}
              >
                <div className="flex gap-3">
                  <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center">
                    <ImageIcon className="h-7 w-7 text-primary" />
                  </div>
                  <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Video className="h-7 w-7 text-primary" />
                  </div>
                </div>
                <div className="text-center px-6">
                  <p className="font-semibold text-base mb-1">Tap to upload</p>
                  <p className="text-xs text-muted-foreground">
                    Photo, or a clip up to {MAX_VIDEO_SECONDS}s · max 25 MB
                  </p>
                </div>
                <div
                  className="w-32 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-primary-foreground shadow-lg"
                  style={{
                    background: "linear-gradient(135deg, hsl(142 76% 45%), hsl(160 80% 42%))",
                  }}
                >
                  <Upload className="h-4 w-4 mr-1.5" /> Browse
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {mode === "text" ? (
          <>
            <div className="w-full">
              <textarea
                id="story-text-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={MAX_TEXT_LENGTH}
                placeholder="What's your story?"
                className="w-full rounded-xl bg-secondary/50 border border-border/50 text-sm px-4 py-3 resize-none h-20 focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
              />
              <p className="text-[11px] text-muted-foreground text-right mt-1">
                {text.length}/{MAX_TEXT_LENGTH}
              </p>
            </div>

            <div className="w-full">
              <p className="text-xs font-semibold text-muted-foreground mb-2">
                Background template
              </p>
              <div className="grid grid-cols-5 gap-2">
                {STORY_GRADIENTS.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setGradientId(g.id)}
                    aria-label={`${g.label} background`}
                    aria-pressed={gradientId === g.id}
                    className={cn(
                      "relative h-11 rounded-lg overflow-hidden transition-all hover:scale-105",
                      gradientId === g.id
                        ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                        : "",
                    )}
                    style={{ background: g.css }}
                  >
                    {gradientId === g.id && (
                      <span className="absolute inset-0 flex items-center justify-center">
                        <Check className="h-4 w-4 text-white drop-shadow-lg stroke-[3]" />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          items.length > 0 && (
            <div className="w-full space-y-2">
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                maxLength={MAX_TEXT_LENGTH}
                placeholder="Add a caption (optional)"
                className="w-full rounded-xl bg-secondary/50 border border-border/50 text-sm px-4 py-3 resize-none h-16 focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
              />
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <AlertCircle className="h-3 w-3 shrink-0" />
                Stories disappear after 24 hours.
              </p>
            </div>
          )
        )}

        <Button
          className="w-full h-12 font-bold text-sm rounded-xl shadow-md"
          disabled={!canPublish || publish.isPending}
          onClick={() => publish.mutate()}
        >
          {publish.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Publishing…
            </>
          ) : (
            "Share Story"
          )}
        </Button>
      </div>
    </div>
  );
}
