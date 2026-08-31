-- ============================================================
-- Social experience upgrade (additive, idempotent, non-destructive)
-- ============================================================

-- 1. Posts: multi-image gallery, repost counter, edit marker
ALTER TABLE public.user_statuses
  ADD COLUMN IF NOT EXISTS media_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS reposts_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS edited_at timestamptz;

-- 2. Comments: threaded replies
ALTER TABLE public.status_comments
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.status_comments(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS replies_count integer NOT NULL DEFAULT 0;

-- 3. Reposts
CREATE TABLE IF NOT EXISTS public.status_reposts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status_id uuid NOT NULL REFERENCES public.user_statuses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (status_id, user_id)
);

GRANT SELECT, INSERT, DELETE ON public.status_reposts TO authenticated;
GRANT SELECT ON public.status_reposts TO anon;
GRANT ALL ON public.status_reposts TO service_role;

ALTER TABLE public.status_reposts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "status_reposts_select_all" ON public.status_reposts;
CREATE POLICY "status_reposts_select_all" ON public.status_reposts
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "status_reposts_insert_own" ON public.status_reposts;
CREATE POLICY "status_reposts_insert_own" ON public.status_reposts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "status_reposts_delete_own" ON public.status_reposts;
CREATE POLICY "status_reposts_delete_own" ON public.status_reposts
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 4. Server-maintained counters (replaces app-side read-modify-write)
CREATE OR REPLACE FUNCTION public.sync_status_likes_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.user_statuses s
     SET likes_count = (SELECT count(*) FROM public.status_likes l WHERE l.status_id = s.id)
   WHERE s.id = COALESCE(NEW.status_id, OLD.status_id);
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.sync_status_reposts_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.user_statuses s
     SET reposts_count = (SELECT count(*) FROM public.status_reposts r WHERE r.status_id = s.id)
   WHERE s.id = COALESCE(NEW.status_id, OLD.status_id);
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.sync_status_comment_counts()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  sid uuid := COALESCE(NEW.status_id, OLD.status_id);
  pid uuid := COALESCE(NEW.parent_id, OLD.parent_id);
BEGIN
  UPDATE public.user_statuses s
     SET comments_count = (
       SELECT count(*) FROM public.status_comments c
        WHERE c.status_id = s.id AND c.parent_id IS NULL
     )
   WHERE s.id = sid;

  IF pid IS NOT NULL THEN
    UPDATE public.status_comments c
       SET replies_count = (
         SELECT count(*) FROM public.status_comments r WHERE r.parent_id = c.id
       )
     WHERE c.id = pid;
  END IF;
  RETURN NULL;
END; $$;

REVOKE EXECUTE ON FUNCTION public.sync_status_likes_count() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_status_reposts_count() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_status_comment_counts() FROM anon, authenticated;

DROP TRIGGER IF EXISTS status_likes_sync_count ON public.status_likes;
CREATE TRIGGER status_likes_sync_count
  AFTER INSERT OR DELETE ON public.status_likes
  FOR EACH ROW EXECUTE FUNCTION public.sync_status_likes_count();

DROP TRIGGER IF EXISTS status_reposts_sync_count ON public.status_reposts;
CREATE TRIGGER status_reposts_sync_count
  AFTER INSERT OR DELETE ON public.status_reposts
  FOR EACH ROW EXECUTE FUNCTION public.sync_status_reposts_count();

DROP TRIGGER IF EXISTS status_comments_sync_count ON public.status_comments;
CREATE TRIGGER status_comments_sync_count
  AFTER INSERT OR DELETE ON public.status_comments
  FOR EACH ROW EXECUTE FUNCTION public.sync_status_comment_counts();

-- 5. One-time backfill so existing counters match reality
UPDATE public.user_statuses s SET
  likes_count    = COALESCE((SELECT count(*) FROM public.status_likes l WHERE l.status_id = s.id), 0),
  comments_count = COALESCE((SELECT count(*) FROM public.status_comments c WHERE c.status_id = s.id AND c.parent_id IS NULL), 0),
  reposts_count  = COALESCE((SELECT count(*) FROM public.status_reposts r WHERE r.status_id = s.id), 0);

-- 6. Indexes for cursor pagination and interaction lookups
CREATE INDEX IF NOT EXISTS idx_user_statuses_feed_cursor
  ON public.user_statuses (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_user_statuses_permanent_cursor
  ON public.user_statuses (created_at DESC, id DESC) WHERE expires_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_statuses_user_created
  ON public.user_statuses (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_statuses_media_type_created
  ON public.user_statuses (media_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_status_likes_user ON public.status_likes (user_id, status_id);
CREATE INDEX IF NOT EXISTS idx_status_likes_status ON public.status_likes (status_id);
CREATE INDEX IF NOT EXISTS idx_status_saves_user ON public.status_saves (user_id, status_id);
CREATE INDEX IF NOT EXISTS idx_status_comments_status_created
  ON public.status_comments (status_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_status_comments_parent_created
  ON public.status_comments (parent_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_status_reposts_user ON public.status_reposts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_follows_follower ON public.user_follows (follower_id, following_id);
CREATE INDEX IF NOT EXISTS idx_user_follows_following ON public.user_follows (following_id);
