import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@/lib/router-compat";
import { backend } from "@/backend";
import { useAuth } from "@/lib/auth-context";
import { recommendationService } from "@/services/recommendations/RecommendationService";
import { recommendationEventService } from "@/services/recommendations/RecommendationEventService";
import { formatDistanceToNow } from "date-fns";
import {
  Heart,
  MessageCircle,
  Send,
  Bookmark,
  Trash2,
  TrendingUp,
  RefreshCw,
  MoreHorizontal,
  Users,
  Pencil,
  Flag,
  EyeOff,
  Share2,
  Check,
  Infinity as InfinityIcon,
} from "lucide-react";
import { resolveStoryGradient } from "@/features/stories/gradients";
import { shareContent } from "@/lib/share";
import { MediaGallery } from "@/components/social/media-gallery";
import { useFeed } from "@/features/social/hooks/useFeed";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { StatusComments } from "@/components/social/status-comments";
import { useToast } from "@/hooks/use-toast";
import { readSavedPosts, writeSavedPosts, recordStatusView } from "@/lib/social-analytics";
import { motion, AnimatePresence } from "framer-motion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function sanitizeText(t: string) {
  return t.replace(/<[^>]*>/g, "").trim();
}

function AutoplayVideo({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) el.play().catch(() => {});
        else el.pause();
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <video
      ref={ref}
      src={src}
      muted
      loop
      playsInline
      preload="metadata"
      onClick={(e) => {
        e.currentTarget.muted = !e.currentTarget.muted;
      }}
      className="w-full max-h-[600px] object-cover"
    />
  );
}

function getSessionSeed(): number {
  if (typeof window === "undefined") return 0.5;
  try {
    let seed = sessionStorage.getItem("feedSeed");
    if (!seed) {
      seed = "0.42";
      sessionStorage.setItem("feedSeed", seed);
    }
    return parseFloat(seed);
  } catch {
    return 0.5;
  }
}

function seededRandom(seed: number): number {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}

// ─── Edit post dialog ─────────────────────────────────────────────────────────

function EditPostDialog({
  status,
  open,
  onOpenChange,
}: {
  status: any;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [text, setText] = useState(status?.content ?? "");
  useEffect(() => {
    if (status) setText(status?.content ?? "");
  }, [status]);

  const mut = useMutation({
    mutationFn: async () => {
      const { error } = await backend
        .from("user_statuses")
        .update({ content: text.trim() })
        .eq("id", status.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-statuses"] });
      toast({ title: "Post updated" });
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit post</DialogTitle>
        </DialogHeader>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={280}
          rows={4}
          className="w-full rounded-xl bg-secondary/50 border border-border/50 text-sm px-4 py-3 resize-none focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
          placeholder="What's on your mind?"
        />
        <p className="text-[11px] text-muted-foreground text-right -mt-2">{text.length}/280</p>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={!text.trim() || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Three-dot menu ───────────────────────────────────────────────────────────

function PostMenu({
  status,
  isOwner,
  isSaved,
  onEdit,
  onDelete,
  onSave,
  onShare,
  onReport,
  onHide,
}: {
  status: any;
  isOwner: boolean;
  isSaved: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onSave: () => void;
  onShare: () => void;
  onReport: () => void;
  onHide: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <MoreHorizontal className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-52 rounded-xl border-border/50 bg-card/95 backdrop-blur-md"
      >
        {isOwner ? (
          <>
            <DropdownMenuItem onClick={onEdit} className="gap-2.5 cursor-pointer rounded-lg">
              <Pencil className="h-4 w-4 text-muted-foreground" />
              <span>Edit post</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onDelete}
              className="gap-2.5 cursor-pointer rounded-lg text-destructive focus:text-destructive focus:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4" />
              <span>Delete post</span>
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem onClick={onSave} className="gap-2.5 cursor-pointer rounded-lg">
              <Bookmark
                className={cn(
                  "h-4 w-4",
                  isSaved ? "fill-foreground text-foreground" : "text-muted-foreground",
                )}
              />
              <span>{isSaved ? "Unsave" : "Save post"}</span>
              {isSaved && <Check className="h-3.5 w-3.5 ml-auto text-primary" />}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onShare} className="gap-2.5 cursor-pointer rounded-lg">
              <Share2 className="h-4 w-4 text-muted-foreground" />
              <span>Share</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onHide} className="gap-2.5 cursor-pointer rounded-lg">
              <EyeOff className="h-4 w-4 text-muted-foreground" />
              <span>Hide post</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onReport}
              className="gap-2.5 cursor-pointer rounded-lg text-destructive focus:text-destructive focus:bg-destructive/10"
            >
              <Flag className="h-4 w-4" />
              <span>Report</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Feed ─────────────────────────────────────────────────────────────────────

export function StatusFeed({
  mode = "foryou",
  focusPostId,
}: {
  mode?: "foryou" | "trending" | "following";
  /** Pins a shared/deep-linked post at the top of the feed. */
  focusPostId?: string;
} = {}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const viewedRef = useRef<Set<string>>(new Set());
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [trendingKey, setTrendingKey] = useState(0);

  // UI state
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [savedPosts, setSavedPosts] = useState<Set<string>>(new Set());
  const [hiddenPosts, setHiddenPosts] = useState<Set<string>>(new Set());
  const [editTarget, setEditTarget] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [likeAnimations, setLikeAnimations] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user?.id) {
      setSavedPosts(new Set());
      return;
    }

    const hydrated = readSavedPosts(window.localStorage, user.id);
    setSavedPosts(new Set(hydrated));
  }, [user?.id]);

  // ── cursor-paginated feed (keyset pagination + react-query caching) ──
  const feed = useFeed(mode, user?.id ?? null, focusPostId ?? null);
  const {
    posts,
    isLoading,
    isError,
    error: feedError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = feed;

  // Keep the local "saved" set in sync with what the server hydrated.
  useEffect(() => {
    if (!user?.id || !posts.length) return;
    const serverSaved = posts.filter((p) => p.isSaved).map((p) => p.id);
    if (!serverSaved.length) return;
    setSavedPosts((prev) => {
      const next = new Set(prev);
      serverSaved.forEach((id) => next.add(id));
      return next;
    });
  }, [posts, user?.id]);

  const likeMut = {
    mutate: ({ statusId, isLiked }: { statusId: string; isLiked: boolean }) => {
      if (!user) {
        toast({ title: "Sign in to like posts", variant: "destructive" });
        return;
      }
      feed.like.mutate(
        { postId: statusId, liked: isLiked },
        {
          onSuccess: () => {
            if (!isLiked) {
              void recommendationEventService.recordEvent({
                userId: user.id,
                entityType: "post",
                entityId: statusId,
                action: "like",
                metadata: { source: mode },
              });
            }
          },
        },
      );
    },
  };

  const saveMut = {
    mutate: ({ statusId, isSaved }: { statusId: string; isSaved: boolean }) => {
      if (!user) {
        toast({ title: "Sign in to save posts" });
        return;
      }
      setSavedPosts((prev) => {
        const next = new Set(prev);
        if (isSaved) next.delete(statusId);
        else next.add(statusId);
        writeSavedPosts(window.localStorage, user.id, Array.from(next));
        return next;
      });
      feed.save.mutate(
        { postId: statusId, saved: isSaved },
        {
          onSuccess: () => {
            toast({ title: isSaved ? "Removed from saved" : "Post saved!" });
            if (!isSaved) {
              void recommendationEventService.recordEvent({
                userId: user.id,
                entityType: "post",
                entityId: statusId,
                action: "save",
                metadata: { source: mode },
              });
            }
          },
          onError: () => {
            setSavedPosts((prev) => {
              const next = new Set(prev);
              if (isSaved) next.add(statusId);
              else next.delete(statusId);
              writeSavedPosts(window.localStorage, user.id, Array.from(next));
              return next;
            });
            toast({ title: "Couldn't update saved posts", variant: "destructive" });
          },
        },
      );
    },
  };

  const visible = useMemo(() => posts.filter((s) => !hiddenPosts.has(s.id)), [posts, hiddenPosts]);

  // ── real-time counters ──
  // Counters are maintained by the database, so live updates only need to
  // patch the affected post in place. Refetching the whole feed here is what
  // used to make posts jump around and reset the heart the moment you tapped it.
  const patchPost = feed.patchPost;
  useEffect(() => {
    const ch = backend
      .channel("feed-realtime")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "user_statuses" },
        (payload: any) => {
          const row = payload?.new;
          if (!row?.id) return;
          patchPost(row.id, {
            likes_count: row.likes_count ?? 0,
            comments_count: row.comments_count ?? 0,
            reposts_count: row.reposts_count ?? 0,
            views_count: row.views_count ?? 0,
            content: row.content ?? null,
          });
        },
      )
      .subscribe();
    return () => {
      backend.removeChannel(ch);
    };
  }, [patchPost]);

  const incrementView = useCallback(
    async (id: string) => {
      try {
        await recordStatusView(backend, id, user?.id);
        void recommendationEventService.recordEvent({
          userId: user?.id ?? null,
          entityType: "post",
          entityId: id,
          action: "view",
          metadata: { source: mode },
        });
      } catch {
        /* non-critical: ignore */
      }
    },
    [user?.id, mode],
  );

  // ── view counting ──
  useEffect(() => {
    if (!visible.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const id = (entry.target as HTMLElement).dataset.statusId;
          if (id && !viewedRef.current.has(id)) {
            viewedRef.current.add(id);
            incrementView(id);
          }
        }
      },
      { threshold: 0.5 },
    );
    document.querySelectorAll("[data-status-id]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [visible, incrementView]);

  // ── infinite scroll sentinel: prefetches the next page before the user hits the end ──
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, visible.length]);

  // ── mutations ──

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await backend.from("user_statuses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-statuses"] });
      setDeleteTarget(null);
      toast({ title: "Post deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleDoubleTap = (statusId: string, isLiked: boolean) => {
    if (!user) return;
    setLikeAnimations((prev) => new Set(prev).add(statusId));
    setTimeout(
      () =>
        setLikeAnimations((prev) => {
          const n = new Set(prev);
          n.delete(statusId);
          return n;
        }),
      800,
    );
    if (!isLiked) likeMut.mutate({ statusId, isLiked });
  };

  const handleShare = async (status: any) => {
    const outcome = await shareContent({
      target: "post",
      id: status.id,
      title: "Check out this post on GameFlex",
    });
    void recommendationEventService.recordEvent({
      userId: user?.id ?? null,
      entityType: "post",
      entityId: status.id,
      action: "share",
      metadata: { authorId: status.user_id, mediaType: status.media_type, source: mode },
    });
    if (outcome.method === "clipboard") toast({ title: "Link copied!" });
    if (outcome.method === "manual") toast({ title: "Share link ready", description: outcome.url });
  };

  const recentPosts = useMemo(() => {
    if (mode !== "following") return 0;
    const t = Date.now() - 2 * 3_600_000;
    return posts.filter((s) => new Date(s.created_at).getTime() > t).length;
  }, [posts, mode]);

  // ── loading ──
  if (isLoading)
    return (
      <div className="space-y-6">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="animate-pulse md:border md:border-border/50 md:rounded-xl md:bg-card"
          >
            <div className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-muted" />
              <div className="space-y-2">
                <div className="h-4 bg-muted rounded w-24" />
                <div className="h-3 bg-muted rounded w-16" />
              </div>
            </div>
            <div className="w-full aspect-square bg-muted" />
          </div>
        ))}
      </div>
    );

  if (visible.length === 0) {
    if (mode === "following")
      return (
        <div className="text-center py-16 px-4">
          <div className="rounded-full bg-muted w-20 h-20 flex items-center justify-center mx-auto mb-4 border-2 border-border/50">
            <Users className="h-10 w-10 text-muted-foreground" />
          </div>
          <p className="font-semibold text-xl mb-2">Follow more players</p>
          <p className="text-sm text-muted-foreground mb-6">
            See what gamers are up to in your feed.
          </p>
          <Button asChild className="rounded-full font-bold">
            <Link to="/explore">Find Players</Link>
          </Button>
        </div>
      );
    return (
      <div className="text-center py-16 px-4">
        <div className="rounded-full bg-muted w-20 h-20 flex items-center justify-center mx-auto mb-4 border-2 border-border/50">
          <MessageCircle className="h-10 w-10 text-muted-foreground" />
        </div>
        <p className="font-semibold text-xl mb-1">No posts yet</p>
        <p className="text-sm text-muted-foreground">Be the first to share what's on your mind</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2 md:space-y-6">
        {mode === "following" && recentPosts > 0 && (
          <div className="mx-4 md:mx-0 flex justify-center">
            <div
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              className="bg-primary/20 backdrop-blur-md rounded-full px-4 py-1.5 text-xs text-primary font-bold flex items-center gap-2 cursor-pointer border border-primary/30"
            >
              <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              New Posts
            </div>
          </div>
        )}

        {mode === "trending" && (
          <div className="mx-4 md:mx-0 flex items-center justify-between bg-card border border-border/50 rounded-xl px-4 py-3">
            <div className="flex items-center gap-2 text-primary font-bold">
              <TrendingUp className="h-5 w-5" />
              <span>Trending Gaming Content</span>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setTrendingKey((k) => k + 1)}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        )}

        {visible.map((status: any, idx: number) => {
          const isOwner = user?.id === status.user_id;
          const isSaved = savedPosts.has(status.id);

          return (
            <motion.div
              key={status.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: Math.min(idx * 0.04, 0.3) }}
              className="bg-card md:border md:border-border/50 md:rounded-2xl md:overflow-hidden pb-3 md:pb-0 border-b border-border/20 last:border-b-0"
              data-status-id={status.id}
              data-is-last={idx === visible.length - 1}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-3 md:p-4">
                <div className="flex items-center gap-3">
                  <Link
                    to={
                      user && status.user_id === user.id
                        ? "/social/profile"
                        : `/player/${status.user_id}`
                    }
                  >
                    <div
                      className={cn(
                        "p-[2px] rounded-full",
                        status.isFollowing && "bg-gradient-to-tr from-primary to-accent",
                      )}
                    >
                      <Avatar className="h-9 w-9 border-2 border-background cursor-pointer hover:opacity-90 transition-opacity">
                        <AvatarImage src={status.profile?.avatar_url} />
                        <AvatarFallback className="font-bold bg-secondary">
                          {status.profile?.username?.charAt(0).toUpperCase() ?? "?"}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                  </Link>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                      <Link
                        to={
                          user && status.user_id === user.id
                            ? "/social/profile"
                            : `/player/${status.user_id}`
                        }
                        className="font-bold text-[15px] hover:text-muted-foreground transition-colors"
                      >
                        {status.profile?.username ?? "Unknown"}
                      </Link>
                      {mode === "trending" && idx < 3 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-black uppercase tracking-wider">
                          #{idx + 1}
                        </span>
                      )}
                      <Link
                        to={`/post/${status.id}`}
                        className="text-muted-foreground text-sm hover:text-foreground transition-colors"
                        aria-label="Open this post"
                      >
                        ·{" "}
                        {formatDistanceToNow(new Date(status.created_at), { addSuffix: false })
                          .replace("about ", "")
                          .replace("less than a minute", "now")
                          .replace(" hours", "h")
                          .replace(" hour", "h")
                          .replace(" minutes", "m")
                          .replace(" minute", "m")}
                      </Link>
                    </div>
                  </div>
                </div>
                <PostMenu
                  status={status}
                  isOwner={isOwner}
                  isSaved={isSaved}
                  onEdit={() => setEditTarget(status)}
                  onDelete={() => setDeleteTarget(status.id)}
                  onSave={() => saveMut.mutate({ statusId: status.id, isSaved })}
                  onShare={() => handleShare(status)}
                  onReport={() => {
                    void recommendationEventService.recordEvent({
                      userId: user?.id ?? null,
                      entityType: "post",
                      entityId: status.id,
                      action: "report",
                      metadata: { authorId: status.user_id, source: mode },
                    });
                    toast({
                      title: "Report submitted",
                      description: "Thanks for keeping GameFlex safe.",
                    });
                  }}
                  onHide={() => {
                    setHiddenPosts((prev) => new Set(prev).add(status.id));
                    void recommendationEventService.recordEvent({
                      userId: user?.id ?? null,
                      entityType: "post",
                      entityId: status.id,
                      action: "hide",
                      metadata: { authorId: status.user_id, source: mode },
                    });
                    toast({ title: "Post hidden" });
                  }}
                />
              </div>

              {/* Media / Gradient */}
              {status.media_url ? (
                <div
                  className="relative w-full bg-black overflow-hidden cursor-pointer"
                  onDoubleClick={() => handleDoubleTap(status.id, status.isLiked)}
                >
                  {status.media_type === "video" ? (
                    <div className="aspect-[4/5] sm:aspect-auto sm:max-h-[600px] overflow-hidden flex items-center justify-center">
                      <AutoplayVideo src={status.media_url} />
                    </div>
                  ) : Array.isArray(status.media_urls) && status.media_urls.length > 1 ? (
                    <MediaGallery urls={status.media_urls as string[]} />
                  ) : (
                    <div className="aspect-[4/5] sm:aspect-auto overflow-hidden">
                      <img
                        loading="lazy"
                        decoding="async"
                        src={status.media_url}
                        alt="Status media"
                        className="w-full h-full sm:h-auto sm:max-h-[600px] object-cover"
                      />
                    </div>
                  )}
                  <AnimatePresence>
                    {likeAnimations.has(status.id) && (
                      <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: [0, 1.3, 1.1], opacity: [0, 1, 1] }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        transition={{ duration: 0.35 }}
                        className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
                      >
                        <Heart className="h-28 w-28 text-[#ff3040] fill-[#ff3040] drop-shadow-[0_0_50px_rgba(255,48,64,0.7)]" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : status.content ? (
                <div
                  className="relative w-full aspect-square flex items-center justify-center cursor-pointer select-none overflow-hidden"
                  style={{ background: resolveStoryGradient(status.media_type, idx) }}
                  onDoubleClick={() => handleDoubleTap(status.id, status.isLiked)}
                >
                  <div
                    className="absolute inset-0 opacity-[0.07] pointer-events-none"
                    style={{
                      backgroundImage:
                        "radial-gradient(circle at 1px 1px, white 1px, transparent 1px)",
                      backgroundSize: "28px 28px",
                    }}
                  />
                  <p className="relative z-10 text-white font-bold text-2xl leading-snug text-center px-8 drop-shadow-lg line-clamp-6 tracking-tight">
                    {sanitizeText(status.content)}
                  </p>
                  <AnimatePresence>
                    {likeAnimations.has(status.id) && (
                      <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: [0, 1.3, 1.1], opacity: [0, 1, 1] }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        transition={{ duration: 0.35 }}
                        className="absolute inset-0 flex items-center justify-center pointer-events-none z-20"
                      >
                        <Heart className="h-28 w-28 text-[#ff3040] fill-[#ff3040] drop-shadow-[0_0_50px_rgba(255,48,64,0.7)]" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : null}

              {/* Action Bar */}
              <div className="p-3 md:px-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <button
                    onClick={() =>
                      user
                        ? likeMut.mutate({ statusId: status.id, isLiked: status.isLiked })
                        : toast({ title: "Sign in to like posts" })
                    }
                    className="hover:opacity-60 transition-opacity active:scale-90"
                  >
                    <Heart
                      className={cn(
                        "h-[26px] w-[26px] transition-colors",
                        status.isLiked ? "fill-[#ff3040] text-[#ff3040]" : "text-foreground",
                      )}
                    />
                  </button>
                  <button
                    onClick={() =>
                      setExpandedComments((prev) => {
                        const next = new Set(prev);
                        if (next.has(status.id)) next.delete(status.id);
                        else next.add(status.id);
                        return next;
                      })
                    }
                    className="hover:opacity-60 transition-opacity active:scale-90"
                  >
                    <MessageCircle
                      className={cn(
                        "h-[26px] w-[26px] transition-colors",
                        expandedComments.has(status.id)
                          ? "fill-foreground text-foreground"
                          : "text-foreground",
                      )}
                    />
                  </button>
                  <button
                    className="hover:opacity-60 transition-opacity active:scale-90"
                    onClick={() => handleShare(status)}
                  >
                    <Send className="h-[26px] w-[26px] text-foreground" />
                  </button>
                </div>
                <button
                  onClick={() =>
                    user
                      ? saveMut.mutate({ statusId: status.id, isSaved })
                      : toast({ title: "Sign in to save posts" })
                  }
                  className="hover:opacity-60 transition-opacity active:scale-90"
                >
                  <Bookmark
                    className={cn(
                      "h-[26px] w-[26px] transition-colors",
                      isSaved ? "fill-foreground text-foreground" : "text-foreground",
                    )}
                  />
                </button>
              </div>

              {/* Likes & Content */}
              <div className="px-3 md:px-4 pb-2">
                <div className="font-bold text-[14px] mb-1">
                  {(status.likes_count ?? 0).toLocaleString()}{" "}
                  {(status.likes_count ?? 0) === 1 ? "like" : "likes"}
                </div>
                {status.content && (
                  <div className="text-[14px] leading-[18px]">
                    <span className="font-bold mr-2">{status.profile?.username}</span>
                    {sanitizeText(status.content)
                      .split(" ")
                      .map((word: string, i: number) =>
                        word.startsWith("#") ? (
                          <span key={i} className="text-primary hover:underline cursor-pointer">
                            {word}{" "}
                          </span>
                        ) : (
                          <span key={i}>{word} </span>
                        ),
                      )}
                  </div>
                )}
                <StatusComments
                  statusId={status.id}
                  commentsCount={status.comments_count ?? 0}
                  open={expandedComments.has(status.id)}
                />
              </div>
            </motion.div>
          );
        })}

        {/* Infinite-scroll sentinel + end-of-feed handling */}
        <div ref={sentinelRef} aria-hidden className="h-px w-full" />

        {isFetchingNextPage && (
          <div className="space-y-6 py-4" aria-live="polite">
            {[1, 2].map((i) => (
              <div key={i} className="animate-pulse md:border md:border-border/50 md:rounded-xl">
                <div className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-muted" />
                  <div className="space-y-2">
                    <div className="h-4 bg-muted rounded w-24" />
                    <div className="h-3 bg-muted rounded w-16" />
                  </div>
                </div>
                <div className="w-full aspect-square bg-muted" />
              </div>
            ))}
          </div>
        )}

        {hasNextPage && !isFetchingNextPage && (
          <div className="text-center py-6">
            <Button
              variant="outline"
              className="rounded-full font-bold"
              onClick={() => void fetchNextPage()}
            >
              Load more posts
            </Button>
          </div>
        )}

        {!hasNextPage && visible.length > 0 && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <InfinityIcon className="h-4 w-4" />
            You&apos;re all caught up
          </div>
        )}
      </div>

      {/* Edit dialog */}
      <EditPostDialog
        status={editTarget}
        open={!!editTarget}
        onOpenChange={(v) => !v && setEditTarget(null)}
      />

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this post?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMut.isPending}
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget)}
            >
              {deleteMut.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
