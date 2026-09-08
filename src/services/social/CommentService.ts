import { backend } from "@/backend";

/**
 * Paginated, threaded comments.
 *
 * Top-level comments are keyset paginated newest-first; replies are fetched on
 * demand per parent. Nothing ever fetches "all comments for a post".
 */

export interface CommentAuthor {
  user_id: string;
  username: string;
  avatar_url: string | null;
}

export interface CommentItem {
  id: string;
  status_id: string;
  parent_id: string | null;
  user_id: string;
  content: string;
  replies_count: number;
  is_encrypted?: boolean;
  created_at: string;
  profile?: CommentAuthor | null;
  /** Set while an optimistic comment has not been confirmed yet. */
  pending?: boolean;
}

export interface CommentPage {
  items: CommentItem[];
  nextCursor: string | null;
}

export const COMMENT_PAGE_SIZE = 10;
export const REPLY_PAGE_SIZE = 5;

const COLUMNS =
  "id, status_id, parent_id, user_id, content, replies_count, is_encrypted, created_at";

async function attachProfiles(rows: any[]): Promise<CommentItem[]> {
  if (!rows.length) return [];
  const ids = [...new Set(rows.map((r) => r.user_id))];
  const { data } = await backend
    .from("profiles")
    .select("user_id, username, avatar_url")
    .in("user_id", ids);
  const map = new Map((data ?? []).map((p: any) => [p.user_id, p] as const));
  return rows.map((row) => ({
    ...row,
    replies_count: row.replies_count ?? 0,
    profile: map.get(row.user_id) ?? null,
  })) as CommentItem[];
}

export class CommentService {
  async getPage(
    statusId: string,
    cursor?: string | null,
    limit = COMMENT_PAGE_SIZE,
  ): Promise<CommentPage> {
    let query = backend
      .from("status_comments")
      .select(COLUMNS)
      .eq("status_id", statusId)
      .is("parent_id", null)
      .order("created_at", { ascending: false })
      .limit(limit + 1);

    if (cursor) query = query.lt("created_at", cursor);

    const { data, error } = await query;
    if (error) throw error;

    const rows = data ?? [];
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: await attachProfiles(pageRows),
      nextCursor: hasMore ? (pageRows[pageRows.length - 1] as any).created_at : null,
    };
  }

  async getReplies(
    parentId: string,
    cursor?: string | null,
    limit = REPLY_PAGE_SIZE,
  ): Promise<CommentPage> {
    let query = backend
      .from("status_comments")
      .select(COLUMNS)
      .eq("parent_id", parentId)
      .order("created_at", { ascending: true })
      .limit(limit + 1);

    if (cursor) query = query.gt("created_at", cursor);

    const { data, error } = await query;
    if (error) throw error;
    const rows = data ?? [];
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: await attachProfiles(pageRows),
      nextCursor: hasMore ? (pageRows[pageRows.length - 1] as any).created_at : null,
    };
  }

  async add(input: {
    statusId: string;
    userId: string;
    content: string;
    parentId?: string | null;
  }): Promise<CommentItem> {
    const content = input.content.trim();
    if (!content) throw new Error("Comment cannot be empty");
    if (content.length > 1000) throw new Error("Comment is too long (1000 characters max)");

    const { data, error } = await backend
      .from("status_comments")
      .insert({
        status_id: input.statusId,
        user_id: input.userId,
        content,
        parent_id: input.parentId ?? null,
      })
      .select(COLUMNS)
      .single();
    if (error) throw error;
    const [withProfile] = await attachProfiles([data]);
    return withProfile;
  }

  async remove(commentId: string): Promise<void> {
    const { error } = await backend.from("status_comments").delete().eq("id", commentId);
    if (error) throw error;
  }
}

export const commentService = new CommentService();
