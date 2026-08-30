import { backend } from "@/backend";
import type { Database } from "@/backend/database";
import { updateStatusCount } from "@/lib/social-analytics";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type ActivityItem = Database["public"]["Tables"]["activity_feed"]["Row"];
export type StatusItem = Database["public"]["Tables"]["user_statuses"]["Row"] & {
  profiles?: Profile;
  _count?: { likes: number; comments: number };
  liked?: boolean;
};

export class SocialService {
  async follow(followerId: string, followingId: string): Promise<{ error?: Error }> {
    try {
      const { error } = await backend
        .from("user_follows")
        .insert({ follower_id: followerId, following_id: followingId });
      if (error) throw error;
      return {};
    } catch (err: any) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  async unfollow(followerId: string, followingId: string): Promise<{ error?: Error }> {
    try {
      const { error } = await backend
        .from("user_follows")
        .delete()
        .eq("follower_id", followerId)
        .eq("following_id", followingId);
      if (error) throw error;
      return {};
    } catch (err: any) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  async getFollowers(userId: string): Promise<Profile[]> {
    try {
      const { data, error } = await backend
        .from("user_follows")
        .select("profiles!user_follows_follower_id_fkey(*)")
        .eq("following_id", userId);
      if (error) return [];
      return (data || []).map((d: any) => d.profiles) as Profile[];
    } catch (err) {
      return [];
    }
  }

  async getFollowing(userId: string): Promise<Profile[]> {
    try {
      const { data, error } = await backend
        .from("user_follows")
        .select("profiles!user_follows_following_id_fkey(*)")
        .eq("follower_id", userId);
      if (error) return [];
      return (data || []).map((d: any) => d.profiles) as Profile[];
    } catch (err) {
      return [];
    }
  }

  /** Followers list with a fallback to a handful of other profiles when there are none yet. */
  async getFollowersWithFallback(userId: string): Promise<Profile[]> {
    const { data: follows } = await backend
      .from("user_follows")
      .select("follower_id")
      .eq("following_id", userId);
    if (!follows?.length) {
      const { data: fallback } = await backend
        .from("profiles")
        .select("*")
        .neq("user_id", userId)
        .limit(5);
      return fallback ?? [];
    }
    const ids = follows.map((f: any) => f.follower_id);
    const { data: profiles } = await backend.from("profiles").select("*").in("user_id", ids);
    return profiles ?? [];
  }

  /** Following list with a fallback to a handful of other profiles when there are none yet. */
  async getFollowingWithFallback(userId: string): Promise<Profile[]> {
    const { data: follows } = await backend
      .from("user_follows")
      .select("following_id")
      .eq("follower_id", userId);
    if (!follows?.length) {
      const { data: fallback } = await backend
        .from("profiles")
        .select("*")
        .neq("user_id", userId)
        .limit(5);
      return fallback ?? [];
    }
    const ids = follows.map((f: any) => f.following_id);
    const { data: profiles } = await backend.from("profiles").select("*").in("user_id", ids);
    return profiles ?? [];
  }

  /** Mutual friends + following + followers graph, used by the Friends page. */
  async getSocialGraph(
    userId: string,
  ): Promise<{ mutual: Profile[]; following: Profile[]; followers: Profile[] }> {
    const [{ data: followingRes }, { data: followersRes }] = await Promise.all([
      backend.from("user_follows").select("following_id").eq("follower_id", userId),
      backend.from("user_follows").select("follower_id").eq("following_id", userId),
    ]);

    const followingSet = new Set((followingRes ?? []).map((f: any) => f.following_id));
    const followerSet = new Set((followersRes ?? []).map((f: any) => f.follower_id));
    const allIds = Array.from(new Set([...followingSet, ...followerSet]));

    if (allIds.length === 0) return { mutual: [], following: [], followers: [] };

    const { data: profiles } = await backend.from("profiles").select("*").in("user_id", allIds);
    const profileMap = new Map<string, Profile>((profiles ?? []).map((p: any) => [p.user_id, p]));

    const mutual: Profile[] = [];
    const following: Profile[] = [];
    const followers: Profile[] = [];

    allIds.forEach((id) => {
      const prof = profileMap.get(id);
      if (!prof) return;
      const isFollowing = followingSet.has(id);
      const isFollower = followerSet.has(id);
      if (isFollowing && isFollower) mutual.push(prof);
      if (isFollowing) following.push(prof);
      if (isFollower) followers.push(prof);
    });

    return { mutual, following, followers };
  }

  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    try {
      const { count } = await backend
        .from("user_follows")
        .select("*", { count: "exact", head: true })
        .eq("follower_id", followerId)
        .eq("following_id", followingId);
      return (count || 0) > 0;
    } catch {
      return false;
    }
  }

  async getActivityFeed(userId: string, limit: number = 20): Promise<ActivityItem[]> {
    try {
      const { data, error } = await backend
        .from("activity_feed")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) return [];
      return data as ActivityItem[];
    } catch {
      return [];
    }
  }

  /** Aggregated like/follow/comment activity across a user's own posts, used by the Activity page. */
  async getActivityEvents(
    userId: string,
  ): Promise<{ kind: "like" | "follow" | "comment"; actor: string; at: string }[]> {
    const { data: myPosts } = await backend
      .from("user_statuses")
      .select("id")
      .eq("user_id", userId);
    const ids = myPosts?.map((p: any) => p.id) ?? [];
    if (!ids.length) return [];

    const [{ data: likes }, { data: followers }, { data: comments }] = await Promise.all([
      backend
        .from("status_likes")
        .select("status_id, user_id, created_at")
        .in("status_id", ids)
        .order("created_at", { ascending: false })
        .limit(30),
      backend
        .from("user_follows")
        .select("follower_id, created_at")
        .eq("following_id", userId)
        .order("created_at", { ascending: false })
        .limit(30),
      backend
        .from("status_comments")
        .select("status_id, user_id, created_at")
        .in("status_id", ids)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

    const actorIds = [
      ...new Set([
        ...(likes ?? []).map((l: any) => l.user_id),
        ...(followers ?? []).map((f: any) => f.follower_id),
        ...(comments ?? []).map((c: any) => c.user_id),
      ]),
    ];
    if (!actorIds.length) return [];

    const { data: profs } = await backend
      .from("profiles")
      .select("user_id, username, avatar_url")
      .in("user_id", actorIds);
    const nameOf = (id: string): string =>
      profs?.find((p: any) => p.user_id === id)?.username ?? "Someone";

    const events: { kind: "like" | "follow" | "comment"; actor: string; at: string }[] = [];
    likes?.forEach((l: any) =>
      events.push({ kind: "like", actor: nameOf(l.user_id), at: l.created_at }),
    );
    followers?.forEach((f: any) =>
      events.push({ kind: "follow", actor: nameOf(f.follower_id), at: f.created_at }),
    );
    comments?.forEach((c: any) =>
      events.push({ kind: "comment", actor: nameOf(c.user_id), at: c.created_at }),
    );
    return events.sort((a, b) => +new Date(b.at) - +new Date(a.at));
  }

  async createStatus(
    userId: string,
    content: string,
    imageUrl?: string,
  ): Promise<{ status: StatusItem | null; error?: Error }> {
    try {
      const { data, error } = await backend
        .from("user_statuses")
        .insert({ user_id: userId, content, media_url: imageUrl })
        .select()
        .single();
      if (error) throw error;
      return { status: data as StatusItem };
    } catch (err: any) {
      return { status: null, error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  /** Creates a permanent post (never expires); optionally uploads media through MediaService first. */
  async createPost(
    userId: string,
    input: { content?: string | null; mediaUrl?: string | null; mediaType?: string | null },
  ): Promise<{ error?: Error }> {
    try {
      const { error } = await backend.from("user_statuses").insert({
        user_id: userId,
        content: input.content?.trim() || null,
        media_url: input.mediaUrl ?? null,
        media_type: input.mediaType ?? null,
        expires_at: null,
      });
      if (error) throw error;
      return {};
    } catch (err: any) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  async deleteStatus(statusId: string): Promise<{ error?: Error }> {
    try {
      const { error } = await backend.from("user_statuses").delete().eq("id", statusId);
      if (error) throw error;
      return {};
    } catch (err: any) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  async likeStatus(userId: string, statusId: string): Promise<{ error?: Error }> {
    try {
      const { error } = await backend
        .from("status_likes")
        .insert({ user_id: userId, status_id: statusId });
      if (error) throw error;
      return {};
    } catch (err: any) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  async unlikeStatus(userId: string, statusId: string): Promise<{ error?: Error }> {
    try {
      const { error } = await backend
        .from("status_likes")
        .delete()
        .eq("user_id", userId)
        .eq("status_id", statusId);
      if (error) throw error;
      return {};
    } catch (err: any) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  /** Toggles like state and keeps `likes_count` in sync. */
  async toggleStatusLike(
    userId: string,
    statusId: string,
    isLiked: boolean,
  ): Promise<{ error?: Error }> {
    try {
      if (isLiked) {
        await backend.from("status_likes").delete().eq("status_id", statusId).eq("user_id", userId);
        await updateStatusCount(backend, statusId, "likes_count", -1);
      } else {
        await backend.from("status_likes").insert({ status_id: statusId, user_id: userId });
        await updateStatusCount(backend, statusId, "likes_count", 1);
      }
      return {};
    } catch (err: any) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  /** Toggles a "save" of a status via the `status_saves` table. */
  async toggleStatusSave(
    userId: string,
    statusId: string,
    isSaved: boolean,
  ): Promise<{ error?: Error }> {
    try {
      if (isSaved) {
        await (backend as any)
          .from("status_saves")
          .delete()
          .eq("status_id", statusId)
          .eq("user_id", userId);
      } else {
        await (backend as any)
          .from("status_saves")
          .insert({ status_id: statusId, user_id: userId });
      }
      return {};
    } catch (err: any) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  async incrementStatusViews(statusId: string): Promise<void> {
    await updateStatusCount(backend, statusId, "views_count", 1);
  }

  async commentOnStatus(
    userId: string,
    statusId: string,
    content: string,
  ): Promise<{ comment: any; error?: Error }> {
    try {
      const { data, error } = await backend
        .from("status_comments")
        .insert({ user_id: userId, status_id: statusId, content })
        .select()
        .single();
      if (error) throw error;
      return { comment: data };
    } catch (err: any) {
      return { comment: null, error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  async getStatusFeed(userId?: string, limit: number = 20): Promise<StatusItem[]> {
    try {
      let query = backend
        .from("user_statuses")
        .select("*, profiles!inner(user_id, username, avatar_url)")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (userId) {
        query = query.eq("user_id", userId);
      }

      const { data, error } = await query;
      if (error) return [];

      return (data ?? []) as unknown as StatusItem[];
    } catch {
      return [];
    }
  }

  /** Weekly trending hashtags derived from recent status content. */
  async getTrendingTags(days: number = 7): Promise<[string, number][]> {
    const { subDays } = await import("date-fns");
    const weekAgo = subDays(new Date(), days).toISOString();
    const { data } = await backend
      .from("user_statuses")
      .select("content")
      .gte("created_at", weekAgo)
      .not("content", "is", null);
    const counts: Record<string, number> = {};
    data?.forEach((s: any) => {
      const matches = (s.content ?? "").match(/#[a-zA-Z0-9_]+/g) ?? [];
      matches.forEach((t: string) => {
        counts[t.toLowerCase()] = (counts[t.toLowerCase()] ?? 0) + 1;
      });
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);
  }

  /** Fallback explore feed (top-liked posts with media in the last week) when recommendations are empty. */
  async getExplorePostsFallback(limit: number = 24): Promise<any[]> {
    const { subDays } = await import("date-fns");
    const weekAgo = subDays(new Date(), 7).toISOString();
    const { data } = await backend
      .from("user_statuses")
      .select("*")
      .gte("created_at", weekAgo)
      .not("media_url", "is", null)
      .order("likes_count", { ascending: false })
      .limit(limit);
    return data ?? [];
  }

  /** Posts the user has liked, used as a stand-in "saved" list on the Saved page. */
  async getSavedPostsByLikes(userId: string): Promise<any[]> {
    const { data: likes } = await backend
      .from("status_likes")
      .select("status_id")
      .eq("user_id", userId);
    const ids = likes?.map((l: any) => l.status_id) ?? [];
    if (!ids.length) return [];
    const { data: posts } = await backend.from("user_statuses").select("*").in("id", ids);
    return posts ?? [];
  }

  /** Posts explicitly saved via `status_saves`, used on the profile Saved tab. */
  async getSavedPosts(userId: string): Promise<any[]> {
    const { data: saves } = await (backend as any)
      .from("status_saves")
      .select("status_id")
      .eq("user_id", userId);
    if (!saves?.length) return [];
    const ids = (saves as { status_id: string }[]).map((s) => s.status_id);
    const { data: savedData } = await backend
      .from("user_statuses")
      .select(
        "id, user_id, media_url, media_type, likes_count, comments_count, content, created_at",
      )
      .in("id", ids);
    return savedData ?? [];
  }

  /** Public creator profile page: profile + latest posts + follower/like totals. */
  async getCreatorProfile(
    id: string,
  ): Promise<{ profile: Profile | null; posts: any[]; followers: number; totalLikes: number }> {
    const [{ data: profile }, { data: posts }, { data: followers }, { data: likes }] =
      await Promise.all([
        backend.from("profiles").select("*").eq("user_id", id).maybeSingle(),
        backend
          .from("user_statuses")
          .select("*")
          .eq("user_id", id)
          .order("created_at", { ascending: false })
          .limit(12),
        backend
          .from("user_follows")
          .select("follower_id", { count: "exact", head: true })
          .eq("following_id", id),
        backend.from("user_statuses").select("likes_count").eq("user_id", id),
      ]);
    const totalLikes = likes?.reduce((s: number, p: any) => s + (p.likes_count ?? 0), 0) ?? 0;
    return {
      profile: (profile as Profile) ?? null,
      posts: posts ?? [],
      followers: (followers as any)?.count ?? 0,
      totalLikes,
    };
  }

  /** Full post detail with author + like state, used on the PostDetail page. */
  async getPostDetail(id: string, userId?: string): Promise<any | null> {
    const { data } = await backend.from("user_statuses").select("*").eq("id", id).maybeSingle();
    if (!data) return null;

    const [{ data: profile }, { data: userLike }] = await Promise.all([
      backend
        .from("profiles")
        .select("user_id, username, avatar_url")
        .eq("user_id", data.user_id)
        .maybeSingle(),
      userId
        ? backend
            .from("status_likes")
            .select("id")
            .eq("status_id", id)
            .eq("user_id", userId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    return { ...data, profile, isLiked: !!userLike };
  }

  /** Comments for a post/status, newest last, joined with commenter profile. */
  async getStatusComments(statusId: string): Promise<any[]> {
    const { data: commentsData } = await backend
      .from("status_comments")
      .select("*")
      .eq("status_id", statusId)
      .order("created_at", { ascending: true });
    if (!commentsData) return [];

    const userIds = [...new Set(commentsData.map((c: any) => c.user_id))];
    const { data: profiles } = await backend
      .from("profiles")
      .select("user_id, username, avatar_url")
      .in("user_id", userIds.length ? userIds : ["__none__"]);
    const profileMap = new Map(profiles?.map((p: any) => [p.user_id, p]) ?? []);

    return commentsData.map((c: any) => ({ ...c, profile: profileMap.get(c.user_id) }));
  }

  /** Comments joined directly with `profiles(*)`, used by the profile post modal. */
  async getPostCommentsWithProfiles(statusId: string): Promise<any[]> {
    const { data } = await backend
      .from("status_comments")
      .select("*, profiles(*)")
      .eq("status_id", statusId)
      .order("created_at", { ascending: true });
    return data ?? [];
  }

  /** Search flow used by the Search page: players, tournaments and posts in parallel. */
  async searchAll(query: string): Promise<{ players: any[]; tournaments: any[]; posts: any[] }> {
    const [{ data: players }, { data: tournaments }, { data: posts }] = await Promise.all([
      backend
        .from("profiles")
        .select("user_id, username, avatar_url")
        .ilike("username", `%${query}%`)
        .limit(10),
      backend.from("tournaments").select("id, title, game").ilike("title", `%${query}%`).limit(10),
      backend
        .from("user_statuses")
        .select("id, content, user_id")
        .ilike("content", `%${query}%`)
        .limit(10),
    ]);
    return { players: players ?? [], tournaments: tournaments ?? [], posts: posts ?? [] };
  }

  /** Flex (short video) feed fallback used when recommendations return nothing. */
  async getFlexesFallback(limit: number = 50): Promise<any[]> {
    const { data } = await backend
      .from("user_statuses")
      .select("*")
      .eq("media_type", "video")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (!data) return [];
    return this.attachProfiles(data);
  }

  /** Attaches lightweight profile info to a list of status-shaped rows. */
  async attachProfiles(rows: any[]): Promise<any[]> {
    const ids = [...new Set(rows.map((s: any) => s.user_id))];
    const { data: profiles } = await backend
      .from("profiles")
      .select("user_id, username, avatar_url")
      .in("user_id", ids.length ? ids : ["__none__"]);
    const map = new Map(profiles?.map((p: any) => [p.user_id, p]) ?? []);
    return rows.map((r: any) => ({ ...r, profile: map.get(r.user_id) }));
  }

  async getFlexComments(flexId: string): Promise<any[]> {
    try {
      return await this.getStatusComments(flexId);
    } catch {
      return [];
    }
  }

  async addFlexComment(userId: string, flexId: string, content: string): Promise<void> {
    await backend.from("status_comments").insert({ status_id: flexId, user_id: userId, content });
  }

  async toggleFlexLike(userId: string, flexId: string, isLiked: boolean): Promise<void> {
    if (isLiked) {
      await backend.from("status_likes").delete().eq("status_id", flexId).eq("user_id", userId);
    } else {
      await backend.from("status_likes").insert({ status_id: flexId, user_id: userId });
    }
  }

  async toggleFlexSave(userId: string, flexId: string, isSaved: boolean): Promise<void> {
    if (isSaved) {
      await (backend as any)
        .from("status_saves")
        .delete()
        .eq("status_id", flexId)
        .eq("user_id", userId);
    } else {
      await (backend as any).from("status_saves").insert({ status_id: flexId, user_id: userId });
    }
  }

  /** Posts belonging to the current user, used across the profile page tabs. */
  async getMyPosts(userId: string): Promise<any[]> {
    const { data } = await backend
      .from("user_statuses")
      .select(
        "id, user_id, media_url, media_type, likes_count, comments_count, content, created_at, expires_at",
      )
      .eq("user_id", userId)
      .is("expires_at", null)
      .order("created_at", { ascending: false });
    return data ?? [];
  }

  /** Follower/following/post counts, used on the profile header. */
  async getProfileCounts(
    userId: string,
  ): Promise<{ followers: number; following: number; posts: number }> {
    const [followers, following, statuses] = await Promise.all([
      backend
        .from("user_follows")
        .select("follower_id", { count: "exact", head: true })
        .eq("following_id", userId),
      backend
        .from("user_follows")
        .select("following_id", { count: "exact", head: true })
        .eq("follower_id", userId),
      backend
        .from("user_statuses")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
    ]);
    return {
      followers: followers.count ?? 0,
      following: following.count ?? 0,
      posts: statuses.count ?? 0,
    };
  }

  /** Active (non-expired) stories belonging to a user. */
  async getUserStories(userId: string): Promise<any[]> {
    const { data } = await backend
      .from("user_statuses")
      .select("*")
      .eq("user_id", userId)
      .not("expires_at", "is", null)
      .order("created_at", { ascending: false });
    return data ?? [];
  }

  /** Uploads a new avatar image and returns the versioned public URL. */
  async uploadAvatar(userId: string, file: File): Promise<{ url?: string; error?: Error }> {
    try {
      const { STORAGE_BUCKETS } = await import("@/backend/buckets");
      const { getStorageUrl } = await import("@/lib/storage-url");
      const rawExt = file.name.split(".").pop() || "jpg";
      const filePath = `${userId}/avatar_${Date.now()}.${rawExt}`;

      const { error: uploadError } = await backend.storage
        .from(STORAGE_BUCKETS.AVATARS)
        .upload(filePath, file, { upsert: true, cacheControl: "0" });
      if (uploadError) throw uploadError;

      const publicUrl = await getStorageUrl(STORAGE_BUCKETS.AVATARS, filePath);
      return { url: `${publicUrl}?v=${Date.now()}` };
    } catch (err: any) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }
}

export const socialService = new SocialService();
