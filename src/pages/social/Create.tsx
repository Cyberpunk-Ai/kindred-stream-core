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
  Infinity as InfinityIcon,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { backend } from "@/backend";
import { useToast } from "@/hooks/use-toast";

const PUBLIC_POSTS_URL = "https://posts.gameflex.co.ke";

const POST_TYPES = [
  { emoji: "🏆", label: "Victory", id: "victory" },
  { emoji: "🎮", label: "Gameplay", id: "gameplay" },
  { emoji: "📸", label: "Screenshot", id: "screenshot" },
  { emoji: "🎬", label: "Clip", id: "clip" },
  { emoji: "📢", label: "Announce", id: "announcement" },
  { emoji: "👥", label: "Team", id: "team" },
];

const GRADIENTS = [
  {
    id: "neon",
    label: "Neon",
    css: "linear-gradient(135deg, hsl(142 76% 45%) 0%, hsl(180 100% 50%) 100%)",
  },
  {
    id: "victory",
    label: "Victory",
    css: "linear-gradient(135deg, hsl(45 100% 50%) 0%, hsl(142 76% 45%) 100%)",
  },
  {
    id: "forest",
    label: "Forest",
    css: "linear-gradient(135deg, hsl(142 76% 28%) 0%, hsl(160 80% 45%) 100%)",
  },
  {
    id: "midnight",
    label: "Midnight",
    css: "linear-gradient(135deg, hsl(220 80% 40%) 0%, hsl(142 76% 45%) 100%)",
  },
  {
    id: "ember",
    label: "Ember",
    css: "linear-gradient(135deg, hsl(25 100% 55%) 0%, hsl(142 76% 45%) 100%)",
  },
  {
    id: "aurora",
    label: "Aurora",
    css: "linear-gradient(135deg, hsl(280 80% 55%) 0%, hsl(142 76% 45%) 100%)",
  },
];

export default function Create() {
  const { user } = useAuth();
  const nav = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [fileType, setFileType] = useState<"image" | "video" | null>(null);
  const [caption, setCaption] = useState("");
  const [postType, setPostType] = useState("victory");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [textMode, setTextMode] = useState(false);
  const [gradient, setGradient] = useState(GRADIENTS[0].css);

  const handleFile = (f?: File | null) => {
    if (!f) return;

    if (!f.type.startsWith("image/") && !f.type.startsWith("video/")) {
      toast({
        title: "Images and videos only",
        variant: "destructive",
      });
      return;
    }

    setFile(f);
    setFileType(f.type.startsWith("video/") ? "video" : "image");
    setFilePreview(URL.createObjectURL(f));
    setTextMode(false);
  };

  const clearFile = () => {
    if (filePreview) {
      URL.revokeObjectURL(filePreview);
    }

    setFile(null);
    setFilePreview(null);
    setFileType(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!user) {
        throw new Error("Not signed in");
      }

      let mediaUrl: string | null = null;

      if (file) {
        let uploadPayload: Blob = file;
        let ext = file.name.split(".").pop()?.toLowerCase() || "jpg";

        if (fileType === "image") {
          const { compressImageFile } = await import(
            "@/utils/media-optimizer"
          );

          uploadPayload = await compressImageFile(file, 3840, 0.98);

          ext =
            file.type === "image/png"
              ? "png"
              : file.type === "image/webp"
                ? "webp"
                : "jpg";
        }

        const path = `${user.id}/post-${Date.now()}.${ext}`;

        const { error: uploadError } = await backend.storage
          .from("posts")
          .upload(path, uploadPayload, {
            contentType: fileType === "image" ? file.type : file.type,
            upsert: false,
          });

        if (uploadError) {
          throw uploadError;
        }

        mediaUrl = `${PUBLIC_POSTS_URL}/${path}`;
      }

      const { error } = await backend.from("user_statuses").insert({
        user_id: user.id,
        content: caption.trim() || null,
        media_url: mediaUrl,
        media_type: fileType,
        expires_at: null,
      });

      if (error) {
        throw error;
      }
    },

    onSuccess: () => {
      toast({
        title: "Posted!",
      });

      queryClient.invalidateQueries({
        queryKey: ["feed"],
      });

      queryClient.invalidateQueries({
        queryKey: ["my-posts"],
      });

      queryClient.invalidateQueries({
        queryKey: ["profile-counts"],
      });

      queryClient.invalidateQueries({
        queryKey: ["player-user-posts"],
      });

      queryClient.invalidateQueries({
        queryKey: ["player-profile-counts"],
      });

      nav("/social");
    },

    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : "Failed to publish post.";

      toast({
        title: message,
        variant: "destructive",
      });
    },
  });

  if (!user) {
    return (
      <SocialLayout title="Create">
        <p className="py-20 text-center text-muted-foreground">
          Sign in to create a post.
        </p>
      </SocialLayout>
    );
  }

  const canPost = Boolean(caption.trim() || file);

  return (
    <SocialLayout title="New Post">
      <div className="mx-auto max-w-xl px-4 pb-10 md:px-0">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={(event) => handleFile(event.target.files?.[0])}
        />

        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Media
            </span>

            {!filePreview && (
              <button
                type="button"
                onClick={() => setTextMode((value) => !value)}
                className="text-xs font-semibold text-primary hover:underline"
              >
                {textMode
                  ? "← Upload instead"
                  : "Use text gradient →"}
              </button>
            )}
          </div>

          {filePreview ? (
            <div className="relative aspect-video overflow-hidden rounded-2xl bg-black shadow-md">
              {fileType === "video" ? (
                <video
                  src={filePreview}
                  controls
                  className="h-full w-full object-cover"
                />
              ) : (
                <img
                  src={filePreview}
                  alt="Post preview"
                  className="h-full w-full object-cover"
                />
              )}

              <button
                type="button"
                onClick={clearFile}
                aria-label="Remove media"
                className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md transition-colors hover:bg-black/80"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : textMode ? (
            <div
              className="relative flex aspect-video cursor-pointer items-center justify-center overflow-hidden rounded-2xl p-8 text-center shadow-md"
              style={{ background: gradient }}
            >
              <div
                className="pointer-events-none absolute inset-0 opacity-10"
                style={{
                  backgroundImage:
                    "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
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
                <p className="text-sm font-semibold">
                  Upload photo or video
                </p>

                <p className="mt-0.5 text-xs text-muted-foreground">
                  Click to browse
                </p>
              </div>
            </button>
          )}

          {textMode && !filePreview && (
            <div className="scrollbar-hide mt-3 flex gap-2 overflow-x-auto pb-0.5">
              {GRADIENTS.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => setGradient(item.css)}
                  className={cn(
                    "relative h-9 w-14 shrink-0 overflow-hidden rounded-lg transition-all hover:scale-105",
                    gradient === item.css
                      ? "ring-2 ring-primary ring-offset-1 ring-offset-background"
                      : "",
                  )}
                  style={{ background: item.css }}
                  title={item.label}
                  aria-label={`Use ${item.label} gradient`}
                >
                  {gradient === item.css && (
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

          <p className="mt-1 text-right text-xs text-muted-foreground">
            {caption.length}/2200
          </p>
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
                <span className="text-base leading-none">
                  {type.emoji}
                </span>

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
              {
                id: "public",
                icon: Globe,
                label: "Everyone",
              },
              {
                id: "private",
                icon: Lock,
                label: "Followers",
              },
            ].map(({ id, icon: Icon, label }) => (
              <button
                type="button"
                key={id}
                onClick={() =>
                  setVisibility(id as "public" | "private")
                }
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
          disabled={!canPost || uploadMutation.isPending}
          onClick={() => uploadMutation.mutate()}
        >
          {uploadMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Posting…
            </>
          ) : (
            "Publish Post"
          )}
        </Button>
      </div>
    </SocialLayout>
  );
}