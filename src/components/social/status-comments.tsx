import { useCallback, useEffect, useMemo, useState } from "react";
import { recommendationEventService } from "@/services/recommendations/RecommendationEventService";
import { useQueryClient } from "@tanstack/react-query";
import { backend } from "@/backend";
import { useAuth } from "@/lib/auth-context";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, Lock, Trash2 } from "lucide-react";
import { decryptMessage } from "@/lib/encryption";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import {
  commentsKey,
  useAddComment,
  useComments,
  useDeleteComment,
  useReplies,
} from "@/features/social/hooks/useComments";
import type { CommentItem } from "@/services/social/CommentService";

interface StatusCommentsProps {
  statusId: string;
  commentsCount: number;
  open?: boolean;
}

/** Legacy comments were stored encrypted and/or with a serialized reply prefix. */
function parseLegacyReply(content: string) {
  if (!content.startsWith("↩")) return { replyTo: null as string | null, body: content };
  const separator = content.indexOf("::");
  if (separator === -1) return { replyTo: null as string | null, body: content.slice(1) };
  return {
    replyTo: content.slice(1, separator).trim() || null,
    body: content.slice(separator + 2),
  };
}

async function decodeContent(content: string, isEncrypted?: boolean) {
  const { replyTo, body } = parseLegacyReply(content);
  let decoded = body;
  if (isEncrypted && body) {
    try {
      decoded = await decryptMessage(body);
    } catch {
      decoded = body;
    }
  }
  return replyTo ? `${replyTo}: ${decoded}` : decoded;
}

function timeAgo(iso: string) {
  return formatDistanceToNow(new Date(iso), { addSuffix: false })
    .replace("about ", "")
    .replace("less than a minute", "now")
    .replace(" hours", "h")
    .replace(" hour", "h")
    .replace(" minutes", "m")
    .replace(" minute", "m");
}

function CommentRow({
  comment,
  text,
  canDelete,
  onReply,
  onDelete,
}: {
  comment: CommentItem;
  text: string;
  canDelete: boolean;
  onReply: () => void;
  onDelete: () => void;
}) {
  const [showReplies, setShowReplies] = useState(false);
  const replies = useReplies(comment.id, showReplies);

  return (
    <div className="text-[14px] leading-[18px]">
      <div className="flex items-start gap-2">
        <Avatar className="h-7 w-7 shrink-0">
          <AvatarImage src={comment.profile?.avatar_url ?? ""} alt="" />
          <AvatarFallback className="bg-secondary text-[10px]">
            {comment.profile?.username?.charAt(0).toUpperCase() ?? "?"}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold tracking-tight">
              {comment.profile?.username ?? "Unknown"}
            </span>
            <span className="text-[11px] text-muted-foreground">{timeAgo(comment.created_at)}</span>
            {comment.is_encrypted && (
              <Lock className="h-3 w-3 text-muted-foreground opacity-50" aria-label="Encrypted" />
            )}
            {comment.pending && <span className="text-[11px] text-muted-foreground">Posting…</span>}
          </div>
          <p className="break-words">{text}</p>
          <div className="mt-1 flex items-center gap-3">
            <button
              type="button"
              onClick={onReply}
              className="text-[11px] uppercase tracking-wide text-primary/80 hover:text-primary"
            >
              Reply
            </button>
            {(comment.replies_count ?? 0) > 0 && (
              <button
                type="button"
                onClick={() => setShowReplies((v) => !v)}
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                {showReplies
                  ? "Hide replies"
                  : `View ${comment.replies_count} ${comment.replies_count === 1 ? "reply" : "replies"}`}
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={onDelete}
                aria-label="Delete comment"
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>

          {showReplies && (
            <div className="mt-2 space-y-2 border-l border-border/50 pl-3">
              {replies.isLoading && (
                <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading replies…
                </div>
              )}
              {replies.data?.items.map((reply) => (
                <div key={reply.id} className="text-[13px]">
                  <span className="mr-2 font-bold">{reply.profile?.username ?? "Unknown"}</span>
                  <span className="break-words">{reply.content}</span>
                </div>
              ))}
              {replies.isError && (
                <button
                  type="button"
                  onClick={() => void replies.refetch()}
                  className="text-[12px] text-primary"
                >
                  Couldn&apos;t load replies — retry
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function StatusComments({ statusId, commentsCount, open = false }: StatusCommentsProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [newComment, setNewComment] = useState("");
  const [isExpanded, setIsExpanded] = useState(open);
  const [replyTarget, setReplyTarget] = useState<CommentItem | null>(null);
  const [decoded, setDecoded] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (open) setIsExpanded(true);
  }, [open]);
  useEffect(() => {
    if (!isExpanded) setReplyTarget(null);
  }, [isExpanded]);

  const query = useComments(statusId, isExpanded);
  const addComment = useAddComment(statusId, user?.id ?? null);
  const deleteComment = useDeleteComment(statusId);

  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);

  // Only legacy rows need decoding; new comments are stored as plain text.
  useEffect(() => {
    let cancelled = false;
    const legacy = items.filter((c) => c.is_encrypted || c.content.startsWith("↩"));
    if (!legacy.length) return;
    (async () => {
      const map = new Map<string, string>();
      for (const comment of legacy) {
        map.set(comment.id, await decodeContent(comment.content, comment.is_encrypted));
      }
      if (!cancelled) setDecoded((prev) => new Map([...prev, ...map]));
    })();
    return () => {
      cancelled = true;
    };
  }, [items]);

  // Realtime nudges the cached list instead of refetching every page.
  useEffect(() => {
    if (!isExpanded) return;
    const channel = backend
      .channel(`comments-${statusId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "status_comments",
          filter: `status_id=eq.${statusId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: commentsKey(statusId), refetchType: "active" });
        },
      )
      .subscribe();
    return () => {
      backend.removeChannel(channel);
    };
  }, [statusId, isExpanded, queryClient]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const content = newComment.trim();
      if (!content) return;
      if (!user) {
        toast({ title: "Sign in to comment" });
        return;
      }
      const parentId = replyTarget?.id ?? null;
      setNewComment("");
      setReplyTarget(null);
      addComment.mutate(
        { content, parentId },
        {
          onSuccess: () => {
            void recommendationEventService.recordEvent({
              userId: user.id,
              entityType: "post",
              entityId: statusId,
              action: "comment",
            });
          },
          onError: (error: Error) => {
            setNewComment(content);
            toast({
              title: "Couldn't post comment",
              description: error.message,
              variant: "destructive",
            });
          },
        },
      );
    },
    [newComment, replyTarget, user, addComment, statusId, toast],
  );

  return (
    <div className="mt-1">
      {commentsCount > 0 && !isExpanded && (
        <button
          onClick={() => setIsExpanded(true)}
          className="text-[14px] text-muted-foreground hover:text-foreground transition-colors outline-none cursor-pointer"
        >
          View all {commentsCount} comments
        </button>
      )}

      {isExpanded && (
        <div className="mt-1 space-y-3">
          <button
            type="button"
            onClick={() => setIsExpanded(false)}
            className="text-[13px] text-muted-foreground hover:text-foreground transition-colors outline-none"
          >
            Hide comments
          </button>

          {query.isLoading && (
            <div className="space-y-3" aria-live="polite">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex animate-pulse items-start gap-2">
                  <div className="h-7 w-7 rounded-full bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-24 rounded bg-muted" />
                    <div className="h-3 w-3/4 rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {query.isError && (
            <div className="py-2 text-[13px] text-muted-foreground">
              Couldn&apos;t load comments.{" "}
              <button type="button" onClick={() => void query.refetch()} className="text-primary">
                Retry
              </button>
            </div>
          )}

          {!query.isLoading && !query.isError && items.length === 0 && (
            <p className="py-2 text-[13px] text-muted-foreground">
              No comments yet — be the first to reply.
            </p>
          )}

          <div className="space-y-3">
            {items.map((comment) => (
              <CommentRow
                key={comment.id}
                comment={comment}
                text={decoded.get(comment.id) ?? comment.content}
                canDelete={!!user && user.id === comment.user_id && !comment.pending}
                onReply={() => setReplyTarget(comment)}
                onDelete={() => deleteComment.mutate(comment.id)}
              />
            ))}
          </div>

          {query.hasNextPage && (
            <button
              type="button"
              onClick={() => void query.fetchNextPage()}
              disabled={query.isFetchingNextPage}
              className="text-[13px] text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {query.isFetchingNextPage ? "Loading…" : "Load more comments"}
            </button>
          )}
        </div>
      )}

      {replyTarget && (
        <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
          <span>Replying to {replyTarget.profile?.username ?? "this comment"}</span>
          <button
            type="button"
            onClick={() => setReplyTarget(null)}
            className="text-primary hover:text-primary/80"
          >
            Cancel
          </button>
        </div>
      )}

      {user && (
        <form onSubmit={handleSubmit} className="relative mt-2 flex items-center">
          <Avatar className="mr-3 h-7 w-7 shrink-0">
            <AvatarImage src={user.user_metadata?.avatar_url ?? ""} alt="" />
            <AvatarFallback className="bg-secondary text-[10px]">
              {user.email?.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <input
            type="text"
            aria-label="Add a comment"
            placeholder={replyTarget ? "Write a reply…" : "Add a comment..."}
            value={newComment}
            maxLength={1000}
            onChange={(e) => setNewComment(e.target.value)}
            className="flex-1 bg-transparent pr-10 text-[14px] outline-none placeholder:text-muted-foreground"
          />
          {newComment.trim() && (
            <button
              type="submit"
              disabled={addComment.isPending}
              className="absolute right-0 text-[14px] font-bold text-primary transition-colors hover:text-foreground disabled:opacity-50"
            >
              Post
            </button>
          )}
        </form>
      )}
    </div>
  );
}
