-- 1. Attach the (already existing) counter functions as triggers ------------
DROP TRIGGER IF EXISTS trg_sync_status_likes_count ON public.status_likes;
CREATE TRIGGER trg_sync_status_likes_count
AFTER INSERT OR DELETE ON public.status_likes
FOR EACH ROW EXECUTE FUNCTION public.sync_status_likes_count();

DROP TRIGGER IF EXISTS trg_sync_status_comment_counts ON public.status_comments;
CREATE TRIGGER trg_sync_status_comment_counts
AFTER INSERT OR DELETE ON public.status_comments
FOR EACH ROW EXECUTE FUNCTION public.sync_status_comment_counts();

DROP TRIGGER IF EXISTS trg_sync_status_reposts_count ON public.status_reposts;
CREATE TRIGGER trg_sync_status_reposts_count
AFTER INSERT OR DELETE ON public.status_reposts
FOR EACH ROW EXECUTE FUNCTION public.sync_status_reposts_count();

-- 2. Backfill drifted counters ---------------------------------------------
UPDATE public.user_statuses s SET
  likes_count    = COALESCE((SELECT count(*) FROM public.status_likes   l WHERE l.status_id = s.id), 0),
  reposts_count  = COALESCE((SELECT count(*) FROM public.status_reposts r WHERE r.status_id = s.id), 0),
  comments_count = COALESCE((SELECT count(*) FROM public.status_comments c WHERE c.status_id = s.id AND c.parent_id IS NULL), 0);

UPDATE public.status_comments c SET
  replies_count = COALESCE((SELECT count(*) FROM public.status_comments r WHERE r.parent_id = c.id), 0);

-- 3. De-duplicated view tracking -------------------------------------------
CREATE TABLE IF NOT EXISTS public.status_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status_id uuid NOT NULL REFERENCES public.user_statuses(id) ON DELETE CASCADE,
  user_id uuid,
  viewer_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS status_views_unique ON public.status_views (status_id, viewer_key);
CREATE INDEX IF NOT EXISTS status_views_status_idx ON public.status_views (status_id);

GRANT SELECT ON public.status_views TO authenticated;
GRANT ALL ON public.status_views TO service_role;

ALTER TABLE public.status_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS status_views_select_own ON public.status_views;
CREATE POLICY status_views_select_own ON public.status_views
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 4. Safe view counter callable by anyone -----------------------------------
CREATE OR REPLACE FUNCTION public.record_status_view(_status_id uuid, _viewer_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted boolean := false;
BEGIN
  IF _status_id IS NULL OR _viewer_key IS NULL OR length(_viewer_key) = 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.status_views (status_id, user_id, viewer_key)
  VALUES (_status_id, auth.uid(), _viewer_key)
  ON CONFLICT (status_id, viewer_key) DO NOTHING;

  GET DIAGNOSTICS inserted = ROW_COUNT;

  IF inserted THEN
    UPDATE public.user_statuses
       SET views_count = COALESCE(views_count, 0) + 1
     WHERE id = _status_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.record_status_view(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.record_status_view(uuid, text) TO anon, authenticated;