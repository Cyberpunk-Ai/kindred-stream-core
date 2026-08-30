-- ============================================================================
-- Realtime coverage for live updates that the app actually depends on.
--
-- This migration ensures the tables used by chat, squad activity, notifications,
-- presence-driven channels, tournament pages, and match updates are included in
-- the Supabase realtime publication and have suitable replica identity for UPDATE
-- events.
-- ============================================================================

-- Ensure realtime publication exists for the active project.
-- The default Supabase publication is created automatically by the platform.

DO $$
BEGIN
  -- Common live tables used by the app.
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
  -- Ignore failures if a table is missing in older schema states; this migration is
  -- designed to be safe across environments that have already run earlier migrations.
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

-- Realtime RLS status review:
--
-- - messages: SELECT/INSERT/UPDATE allowed for conversation participants
-- - notifications: SELECT/UPDATE/DELETE on own row; INSERT for authenticated users
-- - squad_messages: members only
-- - squad_invites / squad_join_requests: involved users or squad officers
-- - tournaments / matches / registrations: public read; admin write
-- - conversations: participants only
--
-- Presence channels (used for online/presence) are channel-scoped and do not rely
-- on table-level realtime publication membership. They are authorized by the app's
-- authenticated channel subscription and the table RLS on the underlying records.
