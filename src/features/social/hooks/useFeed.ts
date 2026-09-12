import { useCallback, useMemo } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { backend } from "@/backend";
import {
  cursorOf,
  feedService,
  type FeedMode,
  type FeedPage,
  type FeedPost,
} from "@/services/social/FeedService";

export const feedKey = (mode: FeedMode, viewerId?: string | null, focusPostId?: string | null) =>
  ["social", "feed", mode, viewerId ?? "anon", focusPostId ?? "all"] as const;

type FeedData = InfiniteData<FeedPage, string | null>;

/**
 * Infinite, cursor-paginated feed with de-duplication, background caching and
 * optimistic interactions that roll back safely on failure.
 */
export function useFeed(mode: FeedMode, viewerId?: string | null) {
  const qc = useQueryClient();
  const key = feedKey(mode, viewerId);

  const query = useInfiniteQuery<FeedPage, Error, FeedData, typeof key, string | null>({
    queryKey: key,
    initialPageParam: null,
    queryFn: ({ pageParam }) => feedService.getPage({ mode, viewerId, cursor: pageParam ?? null }),
    getNextPageParam: (last) =>
      last.nextCursor
        ? cursorOf({ created_at: last.nextCursor.createdAt, id: last.nextCursor.id })
        : undefined,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    retry: 2,
  });

  /** Flattened + de-duplicated so a post can never render twice. */
  const posts = useMemo(() => {
    const seen = new Set<string>();
    const out: FeedPost[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const post of page.items) {
        if (seen.has(post.id)) continue;
        seen.add(post.id);
        out.push(post);
      }
    }
    return out;
  }, [query.data]);

  const patchPost = useCallback(
    (id: string, patch: Partial<FeedPost>) => {
      qc.setQueryData<FeedData>(key, (old) =>
        old
          ? {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                items: page.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
              })),
            }
          : old,
      );
    },
    [qc, key],
  );

  const snapshot = useCallback(() => qc.getQueryData<FeedData>(key), [qc, key]);
  const restore = useCallback(
    (data?: FeedData) => {
      if (data) qc.setQueryData(key, data);
    },
    [qc, key],
  );

  const like = useMutation({
    mutationFn: async ({ postId, liked }: { postId: string; liked: boolean }) => {
      if (!viewerId) throw new Error("Sign in to like posts");
      if (liked) {
        const { error } = await backend
          .from("status_likes")
          .delete()
          .eq("status_id", postId)
          .eq("user_id", viewerId);
        if (error) throw error;
      } else {
        // Unique (status_id, user_id) makes a double-tap idempotent server-side.
        const { error } = await backend
          .from("status_likes")
          .insert({ status_id: postId, user_id: viewerId });
        if (error && !/duplicate key/i.test(error.message ?? "")) throw error;
      }
    },
    onMutate: async ({ postId, liked }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = snapshot();
      const current = posts.find((p) => p.id === postId);
      patchPost(postId, {
        isLiked: !liked,
        likes_count: Math.max(0, (current?.likes_count ?? 0) + (liked ? -1 : 1)),
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => restore((ctx as { prev?: FeedData } | undefined)?.prev),
  });

  const save = useMutation({
    mutationFn: async ({ postId, saved }: { postId: string; saved: boolean }) => {
      if (!viewerId) throw new Error("Sign in to save posts");
      if (saved) {
        const { error } = await backend
          .from("status_saves")
          .delete()
          .eq("status_id", postId)
          .eq("user_id", viewerId);
        if (error) throw error;
      } else {
        const { error } = await backend
          .from("status_saves")
          .insert({ status_id: postId, user_id: viewerId });
        if (error && !/duplicate key/i.test(error.message ?? "")) throw error;
      }
    },
    onMutate: async ({ postId, saved }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = snapshot();
      patchPost(postId, { isSaved: !saved });
      return { prev };
    },
    onError: (_e, _v, ctx) => restore((ctx as { prev?: FeedData } | undefined)?.prev),
  });

  const repost = useMutation({
    mutationFn: async ({ postId, reposted }: { postId: string; reposted: boolean }) => {
      if (!viewerId) throw new Error("Sign in to repost");
      if (reposted) {
        const { error } = await backend
          .from("status_reposts")
          .delete()
          .eq("status_id", postId)
          .eq("user_id", viewerId);
        if (error) throw error;
      } else {
        const { error } = await backend
          .from("status_reposts")
          .insert({ status_id: postId, user_id: viewerId });
        if (error && !/duplicate key/i.test(error.message ?? "")) throw error;
      }
    },
    onMutate: async ({ postId, reposted }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = snapshot();
      const current = posts.find((p) => p.id === postId);
      patchPost(postId, {
        isReposted: !reposted,
        reposts_count: Math.max(0, (current?.reposts_count ?? 0) + (reposted ? -1 : 1)),
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => restore((ctx as { prev?: FeedData } | undefined)?.prev),
  });

  return { ...query, posts, patchPost, like, save, repost };
}
