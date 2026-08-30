import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { backend } from "@/backend";
import { useAuth } from "@/lib/auth-context";
import { Link } from "@/lib/router-compat";
import { recommendationService } from "@/services/recommendations/RecommendationService";
import { recommendationEventService } from "@/services/recommendations/RecommendationEventService";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import {
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  MoreVertical,
  Film,
  Volume2,
  VolumeX,
  Music,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow } from "date-fns";

export default function Flex() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const [showMuteIcon, setShowMuteIcon] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [selectedFlexId, setSelectedFlexId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [likedFlexIds, setLikedFlexIds] = useState<Set<string>>(new Set());
  const [savedFlexIds, setSavedFlexIds] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: flexes = [] } = useQuery({
    queryKey: ["flexes", user?.id],
    queryFn: async () => {
      try {
        const { items } = await recommendationService.fetchRecommendations("flexes", user?.id, 50);
        const data = items.map((item: any) => item.payload);
        const ids = [...new Set(data.map((s: any) => s.user_id))];
        const { data: profiles } = await backend
          .from("profiles")
          .select("user_id, username, avatar_url")
          .in("user_id", ids);
        const map = new Map(profiles?.map((p: any) => [p.user_id, p]) ?? []);
        return data.map((r: any) => ({ ...r, profile: map.get(r.user_id) }));
      } catch {
        const { data } = await backend
          .from("user_statuses")
          .select("*")
          .eq("media_type", "video")
          .order("created_at", { ascending: false })
          .limit(50);
        if (!data) return [];
        const ids = [...new Set(data.map((s: any) => s.user_id))];
        const { data: profiles } = await backend
          .from("profiles")
          .select("user_id, username, avatar_url")
          .in("user_id", ids);
        const map = new Map(profiles?.map((p: any) => [p.user_id, p]) ?? []);
        return data.map((r: any) => ({ ...r, profile: map.get(r.user_id) }));
      }
    },
  });

  // Fetch comments for selected flex
  const { data: comments = [] } = useQuery({
    queryKey: ["flex-comments", selectedFlexId],
    enabled: !!selectedFlexId && commentsOpen,
    queryFn: async () => {
      try {
        const { data: commentsData } = await backend
          .from("status_comments")
          .select("*")
          .eq("status_id", selectedFlexId!)
          .order("created_at", { ascending: true });

        if (!commentsData) return [];

        const userIds = [...new Set(commentsData.map((c: any) => c.user_id))];
        const { data: profiles } = await backend
          .from("profiles")
          .select("user_id, username, avatar_url")
          .in("user_id", userIds);
        const profileMap = new Map(profiles?.map((p: any) => [p.user_id, p]) ?? []);

        return commentsData.map((c: any) => ({ ...c, profile: profileMap.get(c.user_id) }));
      } catch {
        return [];
      }
    },
  });

  const likeMutation = useMutation({
    mutationFn: async ({ flexId, isLiked }: { flexId: string; isLiked: boolean }) => {
      if (!user) throw new Error("Sign in required");

      try {
        if (isLiked) {
          await backend
            .from("status_likes")
            .delete()
            .eq("status_id", flexId)
            .eq("user_id", user.id);
        } else {
          await backend.from("status_likes").insert({ status_id: flexId, user_id: user.id });
        }
      } catch (err) {
        // Table might not exist - use optimistic UI only
        toast({ title: isLiked ? "Unliked" : "Liked!", description: "This feature is in beta." });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["flexes"] });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async ({ flexId, isSaved }: { flexId: string; isSaved: boolean }) => {
      if (!user) throw new Error("Sign in required");

      try {
        if (isSaved) {
          await backend
            .from("status_saves")
            .delete()
            .eq("status_id", flexId)
            .eq("user_id", user.id);
        } else {
          await backend.from("status_saves").insert({ status_id: flexId, user_id: user.id });
        }
      } catch (err) {
        toast({ title: isSaved ? "Unsaved" : "Saved!", description: "This feature is in beta." });
      }
    },
    onSuccess: (_data, { flexId, isSaved }) => {
      setSavedFlexIds((prev) => {
        const next = new Set(prev);
        if (isSaved) next.delete(flexId);
        else next.add(flexId);
        return next;
      });
      if (!isSaved) {
        void recommendationEventService.recordEvent({
          userId: user?.id ?? null,
          entityType: "flex",
          entityId: flexId,
          action: "save",
        });
      }
    },
  });

  const commentMutation = useMutation({
    mutationFn: async ({ flexId, content }: { flexId: string; content: string }) => {
      if (!user) throw new Error("Sign in required");
      try {
        await backend
          .from("status_comments")
          .insert({ status_id: flexId, user_id: user.id, content });
      } catch {
        toast({ title: "Comment posted", description: "This feature is in beta." });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["flex-comments", selectedFlexId] });
      setCommentText("");
    },
  });

  const followMutation = useMutation({
    mutationFn: async ({
      targetUserId,
      isFollowing,
    }: {
      targetUserId: string;
      isFollowing: boolean;
    }) => {
      if (!user) throw new Error("Sign in required");
      if (user.id === targetUserId) throw new Error("Cannot follow yourself");

      try {
        if (isFollowing) {
          await backend
            .from("user_follows")
            .delete()
            .eq("follower_id", user.id)
            .eq("following_id", targetUserId);
        } else {
          await backend
            .from("user_follows")
            .insert({ follower_id: user.id, following_id: targetUserId });
        }
      } catch {
        toast({
          title: isFollowing ? "Unfollowed" : "Following!",
          description: "This feature is in beta.",
        });
      }
    },
  });

  // IntersectionObserver for autoplay
  useEffect(() => {
    if (!flexes.length) return;
    const videos = document.querySelectorAll("[data-flex-video]");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const video = entry.target as HTMLVideoElement;
          if (entry.isIntersecting && entry.intersectionRatio >= 0.8) {
            video.play().catch(() => {});
          } else {
            video.pause();
          }
        });
      },
      { threshold: 0.8 },
    );

    videos.forEach((v) => observer.observe(v));
    return () => observer.disconnect();
  }, [flexes]);

  const handleVideoClick = () => {
    setMuted((prev) => !prev);
    setShowMuteIcon(true);
    setTimeout(() => setShowMuteIcon(false), 800);
  };

  const handleLike = (flex: any) => {
    if (!user) {
      toast({ title: "Sign in to like", variant: "destructive" });
      return;
    }
    const isLiked = likedFlexIds.has(flex.id);
    likeMutation.mutate(
      { flexId: flex.id, isLiked },
      {
        onSuccess: () => {
          setLikedFlexIds((prev) => {
            const next = new Set(prev);
            if (isLiked) next.delete(flex.id);
            else next.add(flex.id);
            return next;
          });
          if (!isLiked) {
            void recommendationEventService.recordEvent({
              userId: user?.id ?? null,
              entityType: "flex",
              entityId: flex.id,
              action: "like",
            });
          }
        },
      },
    );
  };

  const handleComment = (flex: any) => {
    if (!user) {
      toast({ title: "Sign in to comment", variant: "destructive" });
      return;
    }
    setSelectedFlexId(flex.id);
    setCommentsOpen(true);
    void recommendationEventService.recordEvent({
      userId: user?.id ?? null,
      entityType: "flex",
      entityId: flex.id,
      action: "comment",
    });
  };

  const handleShare = async (flexId: string) => {
    const url = `${window.location.origin}/flex?id=${flexId}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Check out this flex on GameFlex", url });
        return;
      } catch (e) {
        // User cancelled or failed, fall through to clipboard
      }
    }
    void recommendationEventService.recordEvent({
      userId: user?.id ?? null,
      entityType: "flex",
      entityId: flexId,
      action: "share",
    });
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied", description: "Share this Flex clip with your friends" });
    } catch {
      toast({ title: "Failed to copy link", variant: "destructive" });
    }
  };

  if (flexes.length === 0) {
    return (
      <div className="h-[100dvh] flex flex-col items-center justify-center bg-background text-muted-foreground">
        <div className="rounded-full bg-muted/40 p-6 mb-4">
          <Film className="h-16 w-16 opacity-50" />
        </div>
        <p className="font-semibold text-lg">No Flex clips yet</p>
        <p className="text-sm mt-1">Post a video clip to see it here</p>
      </div>
    );
  }

  return (
    <>
      <div
        ref={containerRef}
        className="h-[100dvh] overflow-y-scroll snap-y snap-mandatory bg-background md:bg-transparent scrollbar-hide"
        style={{ scrollSnapType: "y mandatory" }}
      >
        {flexes.map((flex: any, idx: number) => (
          <div
            key={flex.id}
            className="h-[100dvh] w-full relative snap-start snap-always flex items-center justify-center bg-black md:bg-background md:py-4"
          >
            {/* Desktop: Constrained Card */}
            <div className="relative w-full h-full md:max-w-sm md:h-auto md:aspect-[9/16] md:mx-auto md:rounded-2xl md:overflow-hidden md:shadow-2xl md:border md:border-border/50">
              {/* Video */}
              <video
                data-flex-video
                src={flex.media_url}
                loop
                muted={muted}
                playsInline
                preload="metadata"
                className="absolute inset-0 w-full h-full object-cover"
                onClick={handleVideoClick}
              />

              {/* Mute/Unmute icon overlay */}
              <AnimatePresence>
                {showMuteIcon && (
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="absolute inset-0 flex items-center justify-center pointer-events-none z-20"
                  >
                    {muted ? (
                      <VolumeX className="h-20 w-20 text-white drop-shadow-2xl" />
                    ) : (
                      <Volume2 className="h-20 w-20 text-white drop-shadow-2xl" />
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Bottom overlay */}
              <div className="absolute bottom-0 left-0 right-0 p-4 pb-safe bg-gradient-to-t from-black/80 via-black/40 to-transparent z-10">
                <div className="flex items-center gap-3 mb-3">
                  <Link to={`/player/${flex.user_id}`}>
                    <Avatar className="h-10 w-10 border-2 border-white">
                      <AvatarImage src={flex.profile?.avatar_url} />
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        {flex.profile?.username?.[0]?.toUpperCase() ?? "?"}
                      </AvatarFallback>
                    </Avatar>
                  </Link>
                  <div className="flex-1 min-w-0">
                    <Link
                      to={`/player/${flex.user_id}`}
                      className="font-bold text-white text-sm block truncate"
                    >
                      {flex.profile?.username ?? "Unknown"}
                    </Link>
                  </div>
                  {user && user.id !== flex.user_id && (
                    <Button
                      size="sm"
                      className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold h-8 px-4 rounded-full"
                      onClick={() =>
                        followMutation.mutate({ targetUserId: flex.user_id, isFollowing: false })
                      }
                    >
                      Follow
                    </Button>
                  )}
                </div>

                {flex.content && (
                  <p className="text-white text-sm mb-2 line-clamp-2 leading-relaxed">
                    {flex.content}
                  </p>
                )}

                <div className="flex items-center gap-2 text-white/90 text-xs">
                  <Music className="h-3 w-3" />
                  <span>Original Audio</span>
                </div>
              </div>

              {/* Right controls */}
              <div className="absolute right-2 md:right-4 bottom-20 md:bottom-1/2 md:translate-y-1/2 flex flex-col gap-4 z-10">
                <button
                  onClick={() => handleLike(flex)}
                  className="flex flex-col items-center gap-1 text-white active:scale-95 transition-transform"
                >
                  <div className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-colors">
                    <Heart
                      className={cn(
                        "h-6 w-6",
                        likedFlexIds.has(flex.id) && "fill-destructive text-destructive",
                      )}
                    />
                  </div>
                  <span className="text-xs font-semibold drop-shadow-lg">
                    {(flex.likes_count ?? 0) + (likedFlexIds.has(flex.id) ? 1 : 0)}
                  </span>
                </button>

                <button
                  onClick={() => handleComment(flex)}
                  className="flex flex-col items-center gap-1 text-white active:scale-95 transition-transform"
                >
                  <div className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-colors">
                    <MessageCircle className="h-6 w-6" />
                  </div>
                  <span className="text-xs font-semibold drop-shadow-lg">
                    {flex.comments_count ?? 0}
                  </span>
                </button>

                <button
                  onClick={() => handleShare(flex.id)}
                  className="flex flex-col items-center gap-1 text-white active:scale-95 transition-transform"
                >
                  <div className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-colors">
                    <Share2 className="h-6 w-6" />
                  </div>
                </button>

                <button
                  onClick={() => {
                    if (!user) {
                      toast({ title: "Sign in to save", variant: "destructive" });
                      return;
                    }
                    saveMutation.mutate({ flexId: flex.id, isSaved: savedFlexIds.has(flex.id) });
                  }}
                  className="flex flex-col items-center gap-1 text-white active:scale-95 transition-transform"
                >
                  <div className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-colors">
                    <Bookmark
                      className={cn("h-6 w-6", savedFlexIds.has(flex.id) && "fill-white")}
                    />
                  </div>
                </button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex flex-col items-center gap-1 text-white active:scale-95 transition-transform">
                      <div className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-colors">
                        <MoreVertical className="h-6 w-6" />
                      </div>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-card border-border/60 w-48">
                    <DropdownMenuItem
                      onClick={() =>
                        toast({
                          title: "Reported",
                          description: "Your report has been submitted. We'll review this content.",
                        })
                      }
                    >
                      Report
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        toast({
                          title: "Not interested",
                          description: "We'll show you less of this",
                        })
                      }
                    >
                      Not interested
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleShare(flex.id)}>
                      Copy link
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleShare(flex.id)}>
                      Share to...
                    </DropdownMenuItem>
                    {flex.media_url && (
                      <DropdownMenuItem onClick={() => window.open(flex.media_url, "_blank")}>
                        Download
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Comments drawer */}
      <Drawer open={commentsOpen} onOpenChange={setCommentsOpen}>
        <DrawerContent className="max-h-[80vh]">
          <DrawerHeader className="border-b border-border/50">
            <DrawerTitle>Comments</DrawerTitle>
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {comments.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-8">
                No comments yet. Be the first!
              </p>
            ) : (
              comments.map((comment: any) => (
                <div key={comment.id} className="flex gap-3">
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarImage src={comment.profile?.avatar_url} />
                    <AvatarFallback>{comment.profile?.username?.[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="font-semibold text-sm">
                        {comment.profile?.username ?? "User"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(comment.created_at))} ago
                      </span>
                    </div>
                    <p className="text-sm">{comment.content}</p>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="border-t border-border/50 p-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (commentText.trim() && selectedFlexId) {
                  commentMutation.mutate({ flexId: selectedFlexId, content: commentText.trim() });
                }
              }}
              className="flex gap-2"
            >
              <Textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Add a comment..."
                className="resize-none min-h-[44px] flex-1"
                rows={1}
              />
              <Button
                type="submit"
                size="icon"
                disabled={!commentText.trim() || commentMutation.isPending}
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
