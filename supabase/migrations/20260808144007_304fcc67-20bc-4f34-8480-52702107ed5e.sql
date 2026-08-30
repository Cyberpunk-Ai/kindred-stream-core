-- ============ STORAGE POLICIES ============
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
  USING (bucket_id IN ('avatars','status-media','tournament-images','reels','flex'));

CREATE POLICY "public_media_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('avatars','status-media','reels','flex'));

CREATE POLICY "public_media_update_own" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id IN ('avatars','status-media','reels','flex') AND owner = auth.uid());

CREATE POLICY "public_media_delete_own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id IN ('avatars','status-media','reels','flex') AND owner = auth.uid());

CREATE POLICY "tournament_images_admin_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'tournament-images' AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "tournament_images_admin_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'tournament-images' AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "tournament_images_admin_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'tournament-images' AND public.has_role(auth.uid(),'admin'));

CREATE POLICY "screenshots_owner_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'screenshots' AND (owner = auth.uid() OR public.has_role(auth.uid(),'admin')));
CREATE POLICY "screenshots_owner_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'screenshots');
CREATE POLICY "screenshots_owner_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'screenshots' AND (owner = auth.uid() OR public.has_role(auth.uid(),'admin')));

CREATE POLICY "messages_owner_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'messages' AND owner = auth.uid());
CREATE POLICY "messages_owner_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'messages');
CREATE POLICY "messages_owner_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'messages' AND owner = auth.uid());

CREATE POLICY "backups_admin_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'backups' AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "backups_admin_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'backups' AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "backups_admin_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'backups' AND public.has_role(auth.uid(),'admin'));

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_squad_member(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_squad_captain(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_squad_officer(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_squad_invite_response() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_squad_invite() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_captain_as_member() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_squad_message() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_join_request() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_join_request_response() FROM anon, authenticated;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_source text;

-- ============ PROFILES: protect privileged columns ============
CREATE OR REPLACE FUNCTION public.protect_profile_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    NEW.wallet_balance   := OLD.wallet_balance;
    NEW.is_verified      := OLD.is_verified;
    NEW.followers_count  := OLD.followers_count;
    NEW.following_count  := OLD.following_count;
    NEW.user_id          := OLD.user_id;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.protect_profile_columns() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_protect_columns ON public.profiles;
CREATE TRIGGER profiles_protect_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_columns();

DROP POLICY IF EXISTS "profiles_admin_manage" ON public.profiles;
CREATE POLICY "profiles_admin_manage" ON public.profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "leaderboard_own_write" ON public.leaderboard_stats;
DROP POLICY IF EXISTS "leaderboard_admin_write" ON public.leaderboard_stats;
CREATE POLICY "leaderboard_admin_write" ON public.leaderboard_stats FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "rewards_own" ON public.rewards;
DROP POLICY IF EXISTS "rewards_read_own" ON public.rewards;
DROP POLICY IF EXISTS "rewards_admin_write" ON public.rewards;
CREATE POLICY "rewards_read_own" ON public.rewards FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "rewards_admin_write" ON public.rewards FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "payments_own" ON public.payments;
DROP POLICY IF EXISTS "payments_read_own" ON public.payments;
DROP POLICY IF EXISTS "payments_insert_own" ON public.payments;
DROP POLICY IF EXISTS "payments_admin_write" ON public.payments;
CREATE POLICY "payments_read_own" ON public.payments FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "payments_insert_own" ON public.payments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND status = 'pending' AND verified_by IS NULL AND verified_at IS NULL);
CREATE POLICY "payments_admin_write" ON public.payments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "user_achievements_insert_own" ON public.user_achievements;
CREATE POLICY "user_achievements_admin_write" ON public.user_achievements FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "analytics_insert_any" ON public.analytics_events;
CREATE POLICY "analytics_insert_own" ON public.analytics_events FOR INSERT
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "statuses_admin_manage" ON public.user_statuses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "comments_admin_manage" ON public.status_comments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "squads_admin_manage" ON public.squads FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "squad_messages_admin_manage" ON public.squad_messages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "squad_members_admin_manage" ON public.squad_members FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "registrations_admin_manage" ON public.registrations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "whatsapp_admin_manage" ON public.whatsapp_messages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "referrals_admin_manage" ON public.referrals FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ SUPER ADMIN ============
CREATE OR REPLACE FUNCTION public.grant_admin_for_verified_domain()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.email IS NOT NULL
     AND (
       lower(NEW.email) = 'gameflex254@gmail.com'
       OR (NEW.email_confirmed_at IS NOT NULL
           AND lower(split_part(NEW.email, '@', 2)) = 'gameflex.co.ke')
     ) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'moderator')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.grant_admin_for_verified_domain() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created_grant_admin ON auth.users;
CREATE TRIGGER on_auth_user_created_grant_admin
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.grant_admin_for_verified_domain();

DROP TRIGGER IF EXISTS on_auth_user_confirmed_grant_admin ON auth.users;
CREATE TRIGGER on_auth_user_confirmed_grant_admin
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION public.grant_admin_for_verified_domain();

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::app_role FROM auth.users u
WHERE lower(u.email) = 'gameflex254@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

CREATE OR REPLACE FUNCTION public.protect_super_admin_roles()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_email text;
BEGIN
  SELECT lower(email) INTO target_email FROM auth.users WHERE id = OLD.user_id;
  IF target_email = 'gameflex254@gmail.com' THEN
    RAISE EXCEPTION 'The super admin account''s roles cannot be modified';
  END IF;
  RETURN OLD;
END; $$;
REVOKE ALL ON FUNCTION public.protect_super_admin_roles() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS user_roles_protect_super_admin ON public.user_roles;
CREATE TRIGGER user_roles_protect_super_admin
  BEFORE DELETE OR UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.protect_super_admin_roles();

-- ============ REWARD / PAYMENT COLUMN PROTECTION ============
CREATE OR REPLACE FUNCTION public.protect_reward_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    NEW.user_id       := OLD.user_id;
    NEW.tournament_id := OLD.tournament_id;
    NEW.type          := OLD.type;
    NEW.amount        := OLD.amount;
    NEW.description   := OLD.description;
    NEW.expires_at    := OLD.expires_at;
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'claimed' THEN
      RAISE EXCEPTION 'Only claiming is allowed';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.protect_reward_columns() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS rewards_protect_columns ON public.rewards;
CREATE TRIGGER rewards_protect_columns BEFORE UPDATE ON public.rewards
  FOR EACH ROW EXECUTE FUNCTION public.protect_reward_columns();

CREATE POLICY "rewards_claim_own" ON public.rewards FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.protect_payment_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    NEW.user_id          := OLD.user_id;
    NEW.tournament_id    := OLD.tournament_id;
    NEW.amount           := OLD.amount;
    NEW.status           := OLD.status;
    NEW.verified_by      := OLD.verified_by;
    NEW.verified_at      := OLD.verified_at;
    NEW.rejection_reason := OLD.rejection_reason;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.protect_payment_columns() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS payments_protect_columns ON public.payments;
CREATE TRIGGER payments_protect_columns BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.protect_payment_columns();

CREATE POLICY "payments_attach_proof_own" ON public.payments FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND status = 'pending') WITH CHECK (auth.uid() = user_id);

-- ============ SQUAD COLOR + TOURNAMENT PARTICIPANT SYNC ============
ALTER TABLE public.squads ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '142 76% 45%';

CREATE OR REPLACE FUNCTION public.sync_tournament_participants()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tid uuid;
BEGIN
  tid := COALESCE(NEW.tournament_id, OLD.tournament_id);
  UPDATE public.tournaments t
     SET current_participants = (
       SELECT count(*) FROM public.registrations r
        WHERE r.tournament_id = tid
          AND r.status IN ('pending','confirmed','checked_in')
     )
   WHERE t.id = tid;
  RETURN NULL;
END; $$;
REVOKE ALL ON FUNCTION public.sync_tournament_participants() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_tournament_participants ON public.registrations;
CREATE TRIGGER trg_sync_tournament_participants
AFTER INSERT OR UPDATE OR DELETE ON public.registrations
FOR EACH ROW EXECUTE FUNCTION public.sync_tournament_participants();

ALTER TABLE public.tournaments REPLICA IDENTITY FULL;
ALTER TABLE public.registrations REPLICA IDENTITY FULL;
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.tournaments; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.registrations; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ============ ACHIEVEMENTS CATALOGUE + AUTOMATION ============
INSERT INTO public.achievements (name, description, icon, points, category, requirement_type, requirement_value) VALUES
('Profile Pro','Complete your profile with avatar, bio and game handle','user-check',150,'profile','profile_complete',1),
('First Blood','Win your first match','swords',100,'competition','wins',1),
('Rising Star','Win 5 matches','flame',250,'competition','wins',5),
('Veteran','Win 25 matches','shield',600,'competition','wins',25),
('Legend','Win 100 matches','crown',2000,'competition','wins',100),
('Contender','Play your first tournament','trophy',100,'participation','tournaments_played',1),
('Regular','Play 5 tournaments','calendar',300,'participation','tournaments_played',5),
('Grinder','Play 25 tournaments','activity',800,'participation','tournaments_played',25),
('Point Hunter','Earn 500 ranking points','target',300,'competition','points',500),
('Point Master','Earn 2500 ranking points','zap',900,'competition','points',2500),
('First Payday','Earn your first winnings','wallet',200,'earnings','earnings',1),
('Big Earner','Earn KES 10,000 in winnings','banknote',1000,'earnings','earnings',10000),
('Recruiter','Refer 3 players','user-plus',300,'social','referrals',3),
('Ambassador','Refer 10 players','megaphone',900,'social','referrals',10),
('Getting Known','Reach 10 followers','users',200,'social','followers',10),
('Influencer','Reach 100 followers','star',800,'social','followers',100),
('Squad Up','Join a squad','users-round',100,'social','squads',1),
('First Post','Share your first status','message-square',75,'social','posts',1),
('Storyteller','Share 20 statuses','book-open',400,'social','posts',20)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.evaluate_achievements(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m jsonb; rec record;
BEGIN
  IF _user_id IS NULL THEN RETURN; END IF;

  SELECT jsonb_build_object(
    'profile_complete', CASE WHEN p.username IS NOT NULL AND coalesce(p.avatar_url,'') <> ''
                              AND coalesce(p.bio,'') <> '' AND coalesce(p.game_handle,'') <> ''
                         THEN 1 ELSE 0 END,
    'followers', coalesce(p.followers_count, 0),
    'wins', coalesce(s.wins, 0),
    'tournaments_played', coalesce(s.tournaments_played, 0),
    'points', coalesce(s.points, 0),
    'earnings', coalesce(s.earnings, 0),
    'referrals', (SELECT count(*) FROM public.referrals r WHERE r.referrer_id = _user_id),
    'squads', (SELECT count(*) FROM public.squad_members sm WHERE sm.user_id = _user_id),
    'posts', (SELECT count(*) FROM public.user_statuses us WHERE us.user_id = _user_id)
  )
  INTO m
  FROM public.profiles p
  LEFT JOIN public.leaderboard_stats s ON s.user_id = p.user_id
  WHERE p.user_id = _user_id;

  IF m IS NULL THEN RETURN; END IF;

  FOR rec IN
    SELECT a.id, a.name, a.points
    FROM public.achievements a
    WHERE (m ->> a.requirement_type) IS NOT NULL
      AND (m ->> a.requirement_type)::numeric >= a.requirement_value
      AND NOT EXISTS (
        SELECT 1 FROM public.user_achievements ua
        WHERE ua.user_id = _user_id AND ua.achievement_id = a.id
      )
  LOOP
    INSERT INTO public.user_achievements (user_id, achievement_id)
    VALUES (_user_id, rec.id)
    ON CONFLICT (user_id, achievement_id) DO NOTHING;

    INSERT INTO public.notifications (user_id, type, title, message, action_url)
    VALUES (_user_id, 'system', 'Achievement unlocked',
            rec.name || ' — +' || rec.points || ' points', '/achievements');
  END LOOP;
END; $$;
REVOKE ALL ON FUNCTION public.evaluate_achievements(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_evaluate_achievements_self()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.evaluate_achievements(COALESCE(NEW.user_id, OLD.user_id));
  RETURN NULL;
END; $$;
REVOKE ALL ON FUNCTION public.trg_evaluate_achievements_self() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_evaluate_achievements_referrer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.evaluate_achievements(COALESCE(NEW.referrer_id, OLD.referrer_id));
  RETURN NULL;
END; $$;
REVOKE ALL ON FUNCTION public.trg_evaluate_achievements_referrer() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_evaluate_achievements_following()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.evaluate_achievements(COALESCE(NEW.following_id, OLD.following_id));
  RETURN NULL;
END; $$;
REVOKE ALL ON FUNCTION public.trg_evaluate_achievements_following() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS achievements_on_profile ON public.profiles;
CREATE TRIGGER achievements_on_profile AFTER INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.trg_evaluate_achievements_self();

DROP TRIGGER IF EXISTS achievements_on_stats ON public.leaderboard_stats;
CREATE TRIGGER achievements_on_stats AFTER INSERT OR UPDATE ON public.leaderboard_stats
FOR EACH ROW EXECUTE FUNCTION public.trg_evaluate_achievements_self();

DROP TRIGGER IF EXISTS achievements_on_squad_member ON public.squad_members;
CREATE TRIGGER achievements_on_squad_member AFTER INSERT ON public.squad_members
FOR EACH ROW EXECUTE FUNCTION public.trg_evaluate_achievements_self();

DROP TRIGGER IF EXISTS achievements_on_status ON public.user_statuses;
CREATE TRIGGER achievements_on_status AFTER INSERT ON public.user_statuses
FOR EACH ROW EXECUTE FUNCTION public.trg_evaluate_achievements_self();

DROP TRIGGER IF EXISTS achievements_on_referral ON public.referrals;
CREATE TRIGGER achievements_on_referral AFTER INSERT OR UPDATE ON public.referrals
FOR EACH ROW EXECUTE FUNCTION public.trg_evaluate_achievements_referrer();

DROP TRIGGER IF EXISTS achievements_on_follow ON public.user_follows;
CREATE TRIGGER achievements_on_follow AFTER INSERT ON public.user_follows
FOR EACH ROW EXECUTE FUNCTION public.trg_evaluate_achievements_following();

-- ============ PLAYER STATS RECOMPUTE ============
CREATE OR REPLACE FUNCTION public.recompute_player_stats(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _wins int; _losses int; _played int; _earnings numeric;
BEGIN
  IF _user_id IS NULL THEN RETURN; END IF;

  SELECT count(*) FILTER (WHERE m.winner_id = _user_id),
         count(*) FILTER (WHERE m.winner_id IS NOT NULL AND m.winner_id <> _user_id)
    INTO _wins, _losses
  FROM public.matches m
  WHERE m.status = 'completed' AND _user_id IN (m.player1_id, m.player2_id);

  SELECT count(DISTINCT r.tournament_id) INTO _played
  FROM public.registrations r
  WHERE r.user_id = _user_id AND r.status IN ('confirmed','checked_in');

  SELECT coalesce(sum(rw.amount), 0) INTO _earnings
  FROM public.rewards rw
  WHERE rw.user_id = _user_id AND rw.type = 'prize';

  INSERT INTO public.leaderboard_stats (user_id, wins, losses, tournaments_played, earnings, points)
  VALUES (_user_id, _wins, _losses, _played, _earnings, _wins * 10 + _played * 5)
  ON CONFLICT (user_id) DO UPDATE
    SET wins = EXCLUDED.wins,
        losses = EXCLUDED.losses,
        tournaments_played = EXCLUDED.tournaments_played,
        earnings = EXCLUDED.earnings,
        points = EXCLUDED.points,
        updated_at = now();
END; $$;
REVOKE ALL ON FUNCTION public.recompute_player_stats(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_recompute_stats_match()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.recompute_player_stats(u) FROM (
    SELECT DISTINCT unnest(ARRAY[NEW.player1_id, NEW.player2_id, OLD.player1_id, OLD.player2_id]) AS u
  ) s WHERE u IS NOT NULL;
  RETURN NULL;
END; $$;
REVOKE ALL ON FUNCTION public.trg_recompute_stats_match() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_recompute_stats_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.recompute_player_stats(COALESCE(NEW.user_id, OLD.user_id));
  RETURN NULL;
END; $$;
REVOKE ALL ON FUNCTION public.trg_recompute_stats_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS stats_on_match ON public.matches;
CREATE TRIGGER stats_on_match AFTER INSERT OR UPDATE ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.trg_recompute_stats_match();

DROP TRIGGER IF EXISTS stats_on_registration ON public.registrations;
CREATE TRIGGER stats_on_registration AFTER INSERT OR UPDATE OR DELETE ON public.registrations
FOR EACH ROW EXECUTE FUNCTION public.trg_recompute_stats_user();

DROP TRIGGER IF EXISTS stats_on_reward ON public.rewards;
CREATE TRIGGER stats_on_reward AFTER INSERT OR UPDATE OR DELETE ON public.rewards
FOR EACH ROW EXECUTE FUNCTION public.trg_recompute_stats_user();

-- ============ REALTIME ============
ALTER TABLE public.leaderboard_stats REPLICA IDENTITY FULL;
ALTER TABLE public.user_achievements REPLICA IDENTITY FULL;
ALTER TABLE public.matches REPLICA IDENTITY FULL;
ALTER TABLE public.rewards REPLICA IDENTITY FULL;
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.leaderboard_stats; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.user_achievements; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.matches; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.rewards; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;