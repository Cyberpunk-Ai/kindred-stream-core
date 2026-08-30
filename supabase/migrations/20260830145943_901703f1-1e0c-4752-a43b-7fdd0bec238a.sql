-- TOURNAMENT LOBBY SIZE
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS lobby_size integer;
ALTER TABLE public.tournaments ADD CONSTRAINT tournaments_lobby_size_positive CHECK (lobby_size IS NULL OR lobby_size > 0) NOT VALID;

-- PROFILES ------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS platform public.platform_type,
  ADD COLUMN IF NOT EXISTS favorite_genres text[] NOT NULL DEFAULT '{}';

-- REWARDS -------------------------------------------------------------------
ALTER TABLE public.rewards
  ADD COLUMN IF NOT EXISTS title text;

-- SQUAD CHAT ----------------------------------------------------------------
ALTER TABLE public.squad_messages
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS squad_messages_squad_created_idx
  ON public.squad_messages (squad_id, created_at DESC);

DROP POLICY IF EXISTS "squad_messages_officer_update" ON public.squad_messages;
CREATE POLICY "squad_messages_officer_update" ON public.squad_messages
  FOR UPDATE TO authenticated
  USING (public.is_squad_officer(squad_id, auth.uid()))
  WITH CHECK (public.is_squad_officer(squad_id, auth.uid()));

-- SQUAD PLANNER -------------------------------------------------------------
ALTER TABLE public.squad_events
  ADD COLUMN IF NOT EXISTS game public.game_type,
  ADD COLUMN IF NOT EXISTS starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'tournament',
  ADD COLUMN IF NOT EXISTS rsvps jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.squad_events SET starts_at = scheduled_at WHERE starts_at IS NULL;
ALTER TABLE public.squad_events ALTER COLUMN scheduled_at DROP NOT NULL;

CREATE INDEX IF NOT EXISTS squad_events_squad_starts_idx
  ON public.squad_events (squad_id, starts_at);

DROP POLICY IF EXISTS "squad_events_member_rsvp" ON public.squad_events;
CREATE POLICY "squad_events_member_rsvp" ON public.squad_events
  FOR UPDATE TO authenticated
  USING (public.is_squad_member(squad_id, auth.uid()))
  WITH CHECK (public.is_squad_member(squad_id, auth.uid()));

-- ACCOUNT DELETION ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  DELETE FROM public.user_roles WHERE user_id = uid;
  DELETE FROM public.notifications WHERE user_id = uid;
  DELETE FROM public.user_achievements WHERE user_id = uid;
  DELETE FROM public.user_follows WHERE follower_id = uid OR following_id = uid;
  DELETE FROM public.user_statuses WHERE user_id = uid;
  DELETE FROM public.squad_members WHERE user_id = uid;
  DELETE FROM public.leaderboard_stats WHERE user_id = uid;
  DELETE FROM public.profiles WHERE user_id = uid;
  DELETE FROM auth.users WHERE id = uid;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_account() FROM public;
GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;

-- STORAGE OBJECT POLICIES ---------------------------------------------------
DO $$
BEGIN
  DROP POLICY IF EXISTS "public_media_read" ON storage.objects;
  DROP POLICY IF EXISTS "public_media_insert" ON storage.objects;
  DROP POLICY IF EXISTS "public_media_update_own" ON storage.objects;
  DROP POLICY IF EXISTS "public_media_delete_own" ON storage.objects;
  DROP POLICY IF EXISTS "tournament_images_admin_write" ON storage.objects;
  DROP POLICY IF EXISTS "tournament_images_admin_update" ON storage.objects;
  DROP POLICY IF EXISTS "tournament_images_admin_delete" ON storage.objects;
  DROP POLICY IF EXISTS "screenshots_owner_read" ON storage.objects;
  DROP POLICY IF EXISTS "screenshots_owner_write" ON storage.objects;
  DROP POLICY IF EXISTS "screenshots_owner_delete" ON storage.objects;
  DROP POLICY IF EXISTS "messages_owner_read" ON storage.objects;
  DROP POLICY IF EXISTS "messages_owner_write" ON storage.objects;
  DROP POLICY IF EXISTS "messages_owner_delete" ON storage.objects;
  DROP POLICY IF EXISTS "backups_admin_read" ON storage.objects;
  DROP POLICY IF EXISTS "backups_admin_write" ON storage.objects;
  DROP POLICY IF EXISTS "backups_admin_delete" ON storage.objects;
END $$;

CREATE POLICY "public_media_read" ON storage.objects FOR SELECT
  USING (bucket_id IN ('avatars','posts','stories','short-videos','status-media','reels','flex'));

CREATE POLICY "public_media_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('avatars','posts','stories','short-videos','status-media','reels','flex'));

CREATE POLICY "public_media_update_own" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id IN ('avatars','posts','stories','short-videos','status-media','reels','flex') AND owner = auth.uid());

CREATE POLICY "public_media_delete_own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id IN ('avatars','posts','stories','short-videos','status-media','reels','flex') AND owner = auth.uid());

CREATE POLICY "tournaments_admin_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('tournaments','tournament-images') AND public.has_role(auth.uid(),'admin'));

CREATE POLICY "tournaments_admin_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id IN ('tournaments','tournament-images') AND public.has_role(auth.uid(),'admin'));

CREATE POLICY "tournaments_admin_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id IN ('tournaments','tournament-images') AND public.has_role(auth.uid(),'admin'));

CREATE POLICY "achievements_admin_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'achievements' AND public.has_role(auth.uid(),'admin'));

CREATE POLICY "achievements_admin_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'achievements' AND public.has_role(auth.uid(),'admin'));

CREATE POLICY "achievements_admin_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'achievements' AND public.has_role(auth.uid(),'admin'));

CREATE POLICY "rewards_admin_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'rewards' AND public.has_role(auth.uid(),'admin'));

CREATE POLICY "rewards_admin_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'rewards' AND public.has_role(auth.uid(),'admin'));

CREATE POLICY "rewards_admin_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'rewards' AND public.has_role(auth.uid(),'admin'));

CREATE POLICY "marketplace_owner_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'marketplace');

CREATE POLICY "marketplace_owner_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'marketplace' AND owner = auth.uid());

CREATE POLICY "marketplace_owner_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'marketplace' AND (owner = auth.uid() OR public.has_role(auth.uid(),'admin')));

CREATE POLICY "marketplace_owner_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'marketplace' AND (owner = auth.uid() OR public.has_role(auth.uid(),'admin')));

CREATE POLICY "messages_owner_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'messages' AND owner = auth.uid());

CREATE POLICY "messages_owner_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'messages');

CREATE POLICY "messages_owner_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'messages' AND owner = auth.uid());

CREATE POLICY "support_user_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('support','screenshots'));

CREATE POLICY "support_admin_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN ('support','screenshots') AND (owner = auth.uid() OR public.has_role(auth.uid(),'admin')));

CREATE POLICY "support_admin_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id IN ('support','screenshots') AND public.has_role(auth.uid(),'admin'));

CREATE POLICY "support_admin_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id IN ('support','screenshots') AND public.has_role(auth.uid(),'admin'));

CREATE POLICY "backups_admin_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'backups' AND public.has_role(auth.uid(),'admin'));

CREATE POLICY "backups_admin_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'backups' AND public.has_role(auth.uid(),'admin'));

CREATE POLICY "backups_admin_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'backups' AND public.has_role(auth.uid(),'admin'));

-- REALTIME COVERAGE ---------------------------------------------------------
DO $$
BEGIN
  ALTER TABLE public.conversations REPLICA IDENTITY FULL;
  ALTER TABLE public.messages REPLICA IDENTITY FULL;
  ALTER TABLE public.notifications REPLICA IDENTITY FULL;
  ALTER TABLE public.user_statuses REPLICA IDENTITY FULL;
  ALTER TABLE public.squad_invites REPLICA IDENTITY FULL;
  ALTER TABLE public.squad_members REPLICA IDENTITY FULL;
  ALTER TABLE public.squad_messages REPLICA IDENTITY FULL;
  ALTER TABLE public.squad_join_requests REPLICA IDENTITY FULL;
  ALTER TABLE public.squad_events REPLICA IDENTITY FULL;
  ALTER TABLE public.tournaments REPLICA IDENTITY FULL;
  ALTER TABLE public.registrations REPLICA IDENTITY FULL;
  ALTER TABLE public.matches REPLICA IDENTITY FULL;
  ALTER TABLE public.leaderboard_stats REPLICA IDENTITY FULL;
  ALTER TABLE public.rewards REPLICA IDENTITY FULL;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.messages; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.user_statuses; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.squad_invites; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.squad_members; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.squad_messages; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.squad_join_requests; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.squad_events; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.tournaments; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.registrations; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.matches; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.leaderboard_stats; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.rewards; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;