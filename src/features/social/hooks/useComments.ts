import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  useQuery,
  type InfiniteData,
} from "@tanstack/react-query";
import {
  COMMENT_PAGE_SIZE,
  commentService,
  type CommentItem,
  type CommentPage,
} from "@/services/social/CommentService";

export const commentsKey = (statusId: string) => ["social", "comments", statusId] as const;
export const repliesKey = (parentId: string) => ["social", "replies", parentId] as const;

type CommentData = InfiniteData<CommentPage, string | null>;

export function useComments(statusId: string, enabled = true) {
  return useInfiniteQuery<
    CommentPage,
    Error,
    CommentData,
    ReturnType<typeof commentsKey>,
    string | null
  >({
    queryKey: commentsKey(statusId),
    initialPageParam: null,
    enabled: enabled && !!statusId,
    queryFn: ({ pageParam }) => commentService.getPage(statusId, pageParam, COMMENT_PAGE_SIZE),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

export function useReplies(parentId: string, enabled: boolean) {
  return useQuery({
    queryKey: repliesKey(parentId),
    enabled: enabled && !!parentId,
    queryFn: () => commentService.getReplies(parentId),
    staleTime: 30_000,
  });
}

export function useAddComment(statusId: string, userId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ content, parentId }: { content: string; parentId?: string | null }) => {
      if (!userId) throw new Error("Sign in to comment");
      return commentService.add({ statusId, userId, content, parentId });
    },
    onMutate: async ({ content, parentId }) => {
      if (parentId) return { optimisticId: null as string | null };
      await qc.cancelQueries({ queryKey: commentsKey(statusId) });
      const prev = qc.getQueryData<CommentData>(commentsKey(statusId));
      const optimisticId = `optimistic_${Date.now()}`;
      const optimistic: CommentItem = {
        id: optimisticId,
        status_id: statusId,
        parent_id: null,
        user_id: userId ?? "",
        content: content.trim(),
        replies_count: 0,
        created_at: new Date().toISOString(),
        pending: true,
      };
      qc.setQueryData<CommentData>(commentsKey(statusId), (old) =>
        old
          ? {
              ...old,
              pages: old.pages.map((page, index) =>
                index === 0 ? { ...page, items: [optimistic, ...page.items] } : page,
              ),
            }
          : old,
      );
      return { prev, optimisticId };
    },
    onError: (_error, _vars, ctx) => {
      const prev = (ctx as { prev?: CommentData } | undefined)?.prev;
      if (prev) qc.setQueryData(commentsKey(statusId), prev);
    },
    onSuccess: (created, { parentId }, ctx) => {
      const optimisticId = (ctx as { optimisticId?: string | null } | undefined)?.optimisticId;
      if (parentId) {
        qc.invalidateQueries({ queryKey: repliesKey(parentId) });
        qc.setQueryData<CommentData>(commentsKey(statusId), (old) =>
          old
            ? {
                ...old,
                pages: old.pages.map((page) => ({
                  ...page,
                  items: page.items.map((item) =>
                    item.id === parentId
                      ? { ...item, replies_count: (item.replies_count ?? 0) + 1 }
                      : item,
                  ),
                })),
              }
            : old,
        );
        return;
      }
      qc.setQueryData<CommentData>(commentsKey(statusId), (old) =>
        old
          ? {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                items: page.items.map((item) => (item.id === optimisticId ? created : item)),
              })),
            }
          : old,
      );
    },
  });
}

export function useDeleteComment(statusId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => commentService.remove(commentId),
    onMutate: async (commentId) => {
      await qc.cancelQueries({ queryKey: commentsKey(statusId) });
      const prev = qc.getQueryData<CommentData>(commentsKey(statusId));
      qc.setQueryData<CommentData>(commentsKey(statusId), (old) =>
        old
          ? {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                items: page.items.filter((item) => item.id !== commentId),
              })),
            }
          : old,
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      const prev = (ctx as { prev?: CommentData } | undefined)?.prev;
      if (prev) qc.setQueryData(commentsKey(statusId), prev);
    },
  });
}
