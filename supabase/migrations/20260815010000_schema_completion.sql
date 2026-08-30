-- ---------------------------------------------------------------------------
-- Schema completion migration
--
-- The application referenced profile fields, squad chat/planner fields, reward
-- titles and an account-deletion RPC that were never created in the original
-- migrations. Every statement is idempotent, so this file is safe to re-run.
--
-- Apply with either:
--   supabase db push                     (after copying into supabase/migrations/)
--   psql "$DATABASE_URL" -f db/migrations/20260815010000_schema_completion.sql
-- ---------------------------------------------------------------------------

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

-- Captains/officers may pin or unpin any message in their squad.
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

-- Backfill the canonical timestamp column, then relax the legacy one.
UPDATE public.squad_events SET starts_at = scheduled_at WHERE starts_at IS NULL;
ALTER TABLE public.squad_events ALTER COLUMN scheduled_at DROP NOT NULL;

CREATE INDEX IF NOT EXISTS squad_events_squad_starts_idx
  ON public.squad_events (squad_id, starts_at);

-- Members (not only officers) must be able to record their own RSVP.
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
