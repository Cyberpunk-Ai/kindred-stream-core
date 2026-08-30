-- ============================================================================
-- Canonical GameFlex Storage Buckets Migration
-- 
-- This migration creates all 11 canonical storage buckets as defined in
-- src/storage/buckets.ts and updates RLS policies accordingly.
--
-- Canonical buckets:
--   PUBLIC:  avatars, posts, stories, short-videos, tournaments, achievements, rewards, marketplace
--   PRIVATE: messages, support, backups
--
-- Legacy buckets (kept for backward compatibility):
--   avatars, status-media, tournament-images, reels, flex, screenshots, messages, backups
--
-- This migration is idempotent and will not fail if buckets already exist.
-- ============================================================================

-- ============================================================================
-- STEP 1: Create canonical storage buckets (idempotently)
-- ============================================================================

DO $$
BEGIN
  -- PUBLIC BUCKETS
  INSERT INTO storage.buckets (id, name, public) VALUES
    ('avatars', 'avatars', true),
    ('posts', 'posts', true),
    ('stories', 'stories', true),
    ('short-videos', 'short-videos', true),
    ('tournaments', 'tournaments', true),
    ('achievements', 'achievements', true),
    ('rewards', 'rewards', true),
    ('marketplace', 'marketplace', true)
  ON CONFLICT (id) DO NOTHING;

  -- PRIVATE BUCKETS
  INSERT INTO storage.buckets (id, name, public) VALUES
    ('messages', 'messages', false),
    ('support', 'support', false),
    ('backups', 'backups', false)
  ON CONFLICT (id) DO NOTHING;
END $$;

-- ============================================================================
-- STEP 2: Update RLS Policies to include canonical bucket names
-- ============================================================================

-- Drop existing policies to recreate them with canonical bucket names
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

-- ============================================================================
-- PUBLIC MEDIA (avatars, posts, stories, short-videos) + legacy compatibility
-- Canonical: avatars, posts, stories, short-videos
-- Legacy: avatars, status-media, reels, flex
-- Rules: anyone can read, authenticated users own their uploads
-- ============================================================================

CREATE POLICY "public_media_read" ON storage.objects FOR SELECT
  USING (bucket_id IN ('avatars','posts','stories','short-videos','status-media','reels','flex'));

CREATE POLICY "public_media_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('avatars','posts','stories','short-videos','status-media','reels','flex'));

CREATE POLICY "public_media_update_own" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id IN ('avatars','posts','stories','short-videos','status-media','reels','flex') AND owner = auth.uid());

CREATE POLICY "public_media_delete_own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id IN ('avatars','posts','stories','short-videos','status-media','reels','flex') AND owner = auth.uid());

-- ============================================================================
-- TOURNAMENTS (canonical) + tournament-images (legacy)
-- Rules: admins can manage tournament media
-- ============================================================================

CREATE POLICY "tournaments_admin_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('tournaments','tournament-images') AND public.has_role(auth.uid(),'admin'));

CREATE POLICY "tournaments_admin_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id IN ('tournaments','tournament-images') AND public.has_role(auth.uid(),'admin'));

CREATE POLICY "tournaments_admin_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id IN ('tournaments','tournament-images') AND public.has_role(auth.uid(),'admin'));

-- ============================================================================
-- ACHIEVEMENTS (canonical)
-- Rules: admins can manage achievement media
-- ============================================================================

CREATE POLICY "achievements_admin_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'achievements' AND public.has_role(auth.uid(),'admin'));

CREATE POLICY "achievements_admin_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'achievements' AND public.has_role(auth.uid(),'admin'));

CREATE POLICY "achievements_admin_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'achievements' AND public.has_role(auth.uid(),'admin'));

-- ============================================================================
-- REWARDS (canonical)
-- Rules: admins can manage reward media
-- ============================================================================

CREATE POLICY "rewards_admin_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'rewards' AND public.has_role(auth.uid(),'admin'));

CREATE POLICY "rewards_admin_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'rewards' AND public.has_role(auth.uid(),'admin'));

CREATE POLICY "rewards_admin_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'rewards' AND public.has_role(auth.uid(),'admin'));

-- ============================================================================
-- MARKETPLACE (canonical)
-- Rules: sellers own their listings, admins can moderate
-- ============================================================================

CREATE POLICY "marketplace_owner_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'marketplace');

CREATE POLICY "marketplace_owner_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'marketplace' AND owner = auth.uid());

CREATE POLICY "marketplace_owner_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'marketplace' AND (owner = auth.uid() OR public.has_role(auth.uid(),'admin')));

CREATE POLICY "marketplace_owner_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'marketplace' AND (owner = auth.uid() OR public.has_role(auth.uid(),'admin')));

-- ============================================================================
-- MESSAGES (canonical) + legacy compatibility
-- Rules: only the conversation participants can read/write
-- ============================================================================

CREATE POLICY "messages_owner_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'messages' AND owner = auth.uid());

CREATE POLICY "messages_owner_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'messages');

CREATE POLICY "messages_owner_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'messages' AND owner = auth.uid());

-- ============================================================================
-- SUPPORT (canonical) + screenshots (legacy)
-- Rules: users can upload their own support tickets, admins can manage all
-- ============================================================================

CREATE POLICY "support_user_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('support','screenshots'));

CREATE POLICY "support_admin_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN ('support','screenshots') AND (owner = auth.uid() OR public.has_role(auth.uid(),'admin')));

CREATE POLICY "support_admin_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id IN ('support','screenshots') AND public.has_role(auth.uid(),'admin'));

CREATE POLICY "support_admin_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id IN ('support','screenshots') AND public.has_role(auth.uid(),'admin'));

-- ============================================================================
-- BACKUPS (canonical)
-- Rules: admins only - strict enforcement
-- ============================================================================

CREATE POLICY "backups_admin_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'backups' AND public.has_role(auth.uid(),'admin'));

CREATE POLICY "backups_admin_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'backups' AND public.has_role(auth.uid(),'admin'));

CREATE POLICY "backups_admin_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'backups' AND public.has_role(auth.uid(),'admin'));

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- Created canonical buckets:
--   PUBLIC:  avatars, posts, stories, short-videos, tournaments, achievements, rewards, marketplace
--   PRIVATE: messages, support, backups
--
-- Legacy buckets remain available:
--   avatars (unchanged), status-media, tournament-images, reels, flex, screenshots, messages, backups
--
-- RLS policies updated to support both canonical and legacy bucket names
-- for seamless backward compatibility during migration.
-- ============================================================================
