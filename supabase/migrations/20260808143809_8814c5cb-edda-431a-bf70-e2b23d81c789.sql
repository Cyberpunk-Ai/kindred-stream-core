-- ENUMS
CREATE TYPE public.app_role AS ENUM ('admin','moderator','user');
CREATE TYPE public.game_type AS ENUM ('fifa','cod','pubg','fortnite','apex','valorant','other');
CREATE TYPE public.listing_category AS ENUM ('account','items','coaching','other');
CREATE TYPE public.listing_status AS ENUM ('active','sold','cancelled');
CREATE TYPE public.match_status AS ENUM ('scheduled','live','completed','cancelled');
CREATE TYPE public.notification_type AS ENUM ('tournament','payment','match','system','whatsapp','squad');
CREATE TYPE public.payment_status AS ENUM ('pending','verified','rejected','refunded');
CREATE TYPE public.platform_type AS ENUM ('playstation','xbox','pc','mobile');
CREATE TYPE public.registration_status AS ENUM ('pending','confirmed','cancelled','checked_in');
CREATE TYPE public.reward_type AS ENUM ('prize','bonus','referral','achievement');
CREATE TYPE public.ticket_priority AS ENUM ('low','medium','high','urgent');
CREATE TYPE public.ticket_status AS ENUM ('open','in_progress','resolved','closed');
CREATE TYPE public.tournament_format AS ENUM ('single_elimination','double_elimination','round_robin','swiss');
CREATE TYPE public.tournament_status AS ENUM ('upcoming','registration_open','registration_closed','live','completed','cancelled');
CREATE TYPE public.squad_invite_status AS ENUM ('pending','accepted','rejected','cancelled');

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  username text NOT NULL,
  phone text,
  email text,
  avatar_url text,
  game_handle text,
  wallet_balance numeric DEFAULT 0,
  is_verified boolean DEFAULT false,
  referral_code text,
  bio text,
  followers_count integer DEFAULT 0,
  following_count integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_public_read" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- USER ROLES
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE POLICY "user_roles_read_own" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user_roles_admin_read" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "user_roles_admin_write" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- TOURNAMENTS
CREATE TABLE public.tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  game public.game_type NOT NULL,
  format public.tournament_format NOT NULL DEFAULT 'single_elimination',
  status public.tournament_status NOT NULL DEFAULT 'upcoming',
  entry_fee numeric NOT NULL DEFAULT 0,
  prize_pool numeric NOT NULL DEFAULT 0,
  max_participants integer NOT NULL DEFAULT 32,
  current_participants integer DEFAULT 0,
  start_date timestamptz NOT NULL,
  end_date timestamptz,
  registration_deadline timestamptz NOT NULL,
  rules text,
  image_url text,
  group_link text,
  live_stream_link text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournaments TO authenticated;
GRANT SELECT ON public.tournaments TO anon;
GRANT ALL ON public.tournaments TO service_role;
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tournaments_public_read" ON public.tournaments FOR SELECT USING (true);
CREATE POLICY "tournaments_admin_write" ON public.tournaments FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER tournaments_updated_at BEFORE UPDATE ON public.tournaments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- MATCHES
CREATE TABLE public.matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  round integer NOT NULL,
  match_number integer NOT NULL,
  player1_id uuid,
  player2_id uuid,
  player1_score integer DEFAULT 0,
  player2_score integer DEFAULT 0,
  winner_id uuid,
  status public.match_status NOT NULL DEFAULT 'scheduled',
  scheduled_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.matches TO authenticated;
GRANT SELECT ON public.matches TO anon;
GRANT ALL ON public.matches TO service_role;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "matches_public_read" ON public.matches FOR SELECT USING (true);
CREATE POLICY "matches_admin_write" ON public.matches FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- GAME ROOMS
CREATE TABLE public.game_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  match_id uuid REFERENCES public.matches(id) ON DELETE SET NULL,
  room_code text NOT NULL,
  password text,
  platform public.platform_type NOT NULL DEFAULT 'mobile',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_rooms TO authenticated;
GRANT ALL ON public.game_rooms TO service_role;
ALTER TABLE public.game_rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_rooms_read_auth" ON public.game_rooms FOR SELECT TO authenticated USING (true);
CREATE POLICY "game_rooms_admin_write" ON public.game_rooms FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- PAYMENTS
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  method text,
  status public.payment_status NOT NULL DEFAULT 'pending',
  transaction_code text,
  screenshot_url text,
  verified_by uuid,
  verified_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments_own" ON public.payments FOR ALL TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin')) WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- REGISTRATIONS
CREATE TABLE public.registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  status public.registration_status NOT NULL DEFAULT 'pending',
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  game_handle text NOT NULL,
  seed_number integer,
  lobby_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.registrations TO authenticated;
GRANT SELECT ON public.registrations TO anon;
GRANT ALL ON public.registrations TO service_role;
ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "registrations_public_read" ON public.registrations FOR SELECT USING (true);
CREATE POLICY "registrations_own_write" ON public.registrations FOR ALL TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin')) WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER registrations_updated_at BEFORE UPDATE ON public.registrations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- USER STATUSES
CREATE TABLE public.user_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  content text,
  media_url text,
  media_type text,
  likes_count integer DEFAULT 0,
  views_count integer DEFAULT 0,
  comments_count integer DEFAULT 0,
  post_type text DEFAULT 'status',
  game text,
  tournament_id uuid,
  tags text[],
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_statuses TO authenticated;
GRANT SELECT ON public.user_statuses TO anon;
GRANT ALL ON public.user_statuses TO service_role;
ALTER TABLE public.user_statuses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "statuses_public_read" ON public.user_statuses FOR SELECT USING (true);
CREATE POLICY "statuses_own_write" ON public.user_statuses FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.status_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status_id uuid NOT NULL REFERENCES public.user_statuses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (status_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.status_likes TO authenticated;
GRANT SELECT ON public.status_likes TO anon;
GRANT ALL ON public.status_likes TO service_role;
ALTER TABLE public.status_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "likes_public_read" ON public.status_likes FOR SELECT USING (true);
CREATE POLICY "likes_own_write" ON public.status_likes FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.status_saves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status_id uuid NOT NULL REFERENCES public.user_statuses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (status_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.status_saves TO authenticated;
GRANT ALL ON public.status_saves TO service_role;
ALTER TABLE public.status_saves ENABLE ROW LEVEL SECURITY;
CREATE POLICY "saves_own" ON public.status_saves FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.status_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status_id uuid NOT NULL REFERENCES public.user_statuses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL,
  is_encrypted boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.status_comments TO authenticated;
GRANT SELECT ON public.status_comments TO anon;
GRANT ALL ON public.status_comments TO service_role;
ALTER TABLE public.status_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comments_public_read" ON public.status_comments FOR SELECT USING (true);
CREATE POLICY "comments_own_write" ON public.status_comments FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.user_follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid NOT NULL,
  following_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (follower_id, following_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_follows TO authenticated;
GRANT SELECT ON public.user_follows TO anon;
GRANT ALL ON public.user_follows TO service_role;
ALTER TABLE public.user_follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "follows_public_read" ON public.user_follows FOR SELECT USING (true);
CREATE POLICY "follows_own_write" ON public.user_follows FOR ALL TO authenticated USING (auth.uid() = follower_id) WITH CHECK (auth.uid() = follower_id);

-- ACHIEVEMENTS
CREATE TABLE public.achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL,
  icon text NOT NULL DEFAULT 'trophy',
  points integer NOT NULL DEFAULT 0,
  category text NOT NULL DEFAULT 'general',
  requirement_type text NOT NULL,
  requirement_value integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.achievements TO authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON public.achievements TO authenticated;
GRANT ALL ON public.achievements TO service_role;
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "achievements_public_read" ON public.achievements FOR SELECT USING (true);
CREATE POLICY "achievements_admin_write" ON public.achievements FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.user_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  achievement_id uuid NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  earned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, achievement_id)
);
GRANT SELECT, INSERT ON public.user_achievements TO authenticated;
GRANT SELECT ON public.user_achievements TO anon;
GRANT ALL ON public.user_achievements TO service_role;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_achievements_public_read" ON public.user_achievements FOR SELECT USING (true);
CREATE POLICY "user_achievements_insert_own" ON public.user_achievements FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- LEADERBOARD
CREATE TABLE public.leaderboard_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  wins integer DEFAULT 0,
  losses integer DEFAULT 0,
  points integer DEFAULT 0,
  earnings numeric DEFAULT 0,
  tournaments_played integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.leaderboard_stats TO authenticated;
GRANT SELECT ON public.leaderboard_stats TO anon;
GRANT ALL ON public.leaderboard_stats TO service_role;
ALTER TABLE public.leaderboard_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leaderboard_public_read" ON public.leaderboard_stats FOR SELECT USING (true);
CREATE POLICY "leaderboard_own_write" ON public.leaderboard_stats FOR ALL TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin')) WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

-- NOTIFICATIONS
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type public.notification_type NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  is_read boolean DEFAULT false,
  action_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_read_own" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "notifications_update_own" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "notifications_delete_own" ON public.notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "notifications_insert_auth" ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);

-- new user handler (defined after profiles/user_roles/leaderboard_stats exist)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE admin_exists boolean;
BEGIN
  INSERT INTO public.profiles (user_id, username, email, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id,'user') ON CONFLICT DO NOTHING;

  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO admin_exists;
  IF NOT admin_exists THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id,'admin') ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.leaderboard_stats (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END; $$;

-- MARKETPLACE
CREATE TABLE public.marketplace_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  category public.listing_category NOT NULL DEFAULT 'other',
  price numeric NOT NULL,
  image_url text,
  status public.listing_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketplace_listings TO authenticated;
GRANT SELECT ON public.marketplace_listings TO anon;
GRANT ALL ON public.marketplace_listings TO service_role;
ALTER TABLE public.marketplace_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "listings_public_read" ON public.marketplace_listings FOR SELECT USING (true);
CREATE POLICY "listings_own_write" ON public.marketplace_listings FOR ALL TO authenticated USING (auth.uid() = seller_id OR public.has_role(auth.uid(),'admin')) WITH CHECK (auth.uid() = seller_id OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER listings_updated_at BEFORE UPDATE ON public.marketplace_listings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- CONVERSATIONS / MESSAGES
CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant1_id uuid NOT NULL,
  participant2_id uuid NOT NULL,
  last_message_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conversations_participants" ON public.conversations FOR ALL TO authenticated USING (auth.uid() IN (participant1_id, participant2_id)) WITH CHECK (auth.uid() IN (participant1_id, participant2_id));

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  content text NOT NULL,
  is_read boolean DEFAULT false,
  is_encrypted boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages_read_participants" ON public.messages FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND auth.uid() IN (c.participant1_id, c.participant2_id)));
CREATE POLICY "messages_insert_sender" ON public.messages FOR INSERT TO authenticated
WITH CHECK (auth.uid() = sender_id AND EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND auth.uid() IN (c.participant1_id, c.participant2_id)));
-- recipients must be able to flip is_read, so UPDATE is allowed for any participant
CREATE POLICY "messages_update_participants" ON public.messages FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND auth.uid() IN (c.participant1_id, c.participant2_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND auth.uid() IN (c.participant1_id, c.participant2_id)));
CREATE POLICY "messages_delete_sender" ON public.messages FOR DELETE TO authenticated USING (auth.uid() = sender_id);
CREATE INDEX messages_conversation_idx ON public.messages(conversation_id, created_at DESC);
CREATE INDEX messages_unread_idx ON public.messages(conversation_id, is_read);

-- SUPPORT
CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  subject text NOT NULL,
  description text NOT NULL,
  status public.ticket_status NOT NULL DEFAULT 'open',
  priority public.ticket_priority NOT NULL DEFAULT 'medium',
  assigned_to uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tickets_own" ON public.support_tickets FOR ALL TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin')) WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER tickets_updated_at BEFORE UPDATE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  message text NOT NULL,
  is_staff boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.ticket_messages TO authenticated;
GRANT ALL ON public.ticket_messages TO service_role;
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ticket_messages_access" ON public.ticket_messages FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id AND (t.user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))))
WITH CHECK (auth.uid() = user_id);

-- REFERRALS / REWARDS / ACTIVITY / WHATSAPP / ANALYTICS
CREATE TABLE public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL,
  referred_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  bonus_claimed boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "referrals_own" ON public.referrals FOR ALL TO authenticated USING (auth.uid() IN (referrer_id, referred_id) OR public.has_role(auth.uid(),'admin')) WITH CHECK (auth.uid() IN (referrer_id, referred_id) OR public.has_role(auth.uid(),'admin'));

CREATE TABLE public.rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tournament_id uuid REFERENCES public.tournaments(id) ON DELETE SET NULL,
  type public.reward_type NOT NULL,
  amount numeric NOT NULL,
  description text,
  status text DEFAULT 'pending',
  claimed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rewards TO authenticated;
GRANT ALL ON public.rewards TO service_role;
ALTER TABLE public.rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rewards_own" ON public.rewards FOR ALL TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin')) WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

CREATE TABLE public.activity_feed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  activity_type text NOT NULL,
  title text NOT NULL,
  description text,
  metadata jsonb,
  is_public boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.activity_feed TO authenticated;
GRANT SELECT ON public.activity_feed TO anon;
GRANT ALL ON public.activity_feed TO service_role;
ALTER TABLE public.activity_feed ENABLE ROW LEVEL SECURITY;
CREATE POLICY "activity_public_read" ON public.activity_feed FOR SELECT USING (is_public = true OR auth.uid() = user_id);
CREATE POLICY "activity_insert_own" ON public.activity_feed FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  phone text NOT NULL,
  message text NOT NULL,
  type text NOT NULL,
  status text DEFAULT 'pending',
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.whatsapp_messages TO authenticated;
GRANT ALL ON public.whatsapp_messages TO service_role;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "whatsapp_own" ON public.whatsapp_messages FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  event_name text NOT NULL,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.analytics_events TO anon, authenticated;
GRANT SELECT ON public.analytics_events TO authenticated;
GRANT ALL ON public.analytics_events TO service_role;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "analytics_insert_any" ON public.analytics_events FOR INSERT WITH CHECK (true);
CREATE POLICY "analytics_admin_read" ON public.analytics_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- SQUADS
CREATE TABLE public.squads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  tag text,
  description text,
  logo_url text,
  game public.game_type,
  captain_id uuid NOT NULL,
  max_members integer NOT NULL DEFAULT 6,
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.squads TO authenticated;
GRANT SELECT ON public.squads TO anon;
GRANT ALL ON public.squads TO service_role;
ALTER TABLE public.squads ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER squads_updated_at BEFORE UPDATE ON public.squads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.squad_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  squad_id uuid NOT NULL REFERENCES public.squads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member',
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (squad_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.squad_members TO authenticated;
GRANT SELECT ON public.squad_members TO anon;
GRANT ALL ON public.squad_members TO service_role;
ALTER TABLE public.squad_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_squad_member(_squad_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.squad_members WHERE squad_id = _squad_id AND user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.is_squad_captain(_squad_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.squads WHERE id = _squad_id AND captain_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.is_squad_officer(_squad_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.squad_members WHERE squad_id = _squad_id AND user_id = _user_id AND role IN ('captain','officer'));
$$;

CREATE POLICY "squads_public_read" ON public.squads FOR SELECT TO anon USING (is_public = true);
CREATE POLICY "squads_member_read" ON public.squads FOR SELECT TO authenticated USING (is_public = true OR public.is_squad_member(id, auth.uid()));
CREATE POLICY "squads_insert_captain" ON public.squads FOR INSERT TO authenticated WITH CHECK (auth.uid() = captain_id);
CREATE POLICY "squads_update_captain" ON public.squads FOR UPDATE TO authenticated USING (auth.uid() = captain_id);
CREATE POLICY "squads_delete_captain" ON public.squads FOR DELETE TO authenticated USING (auth.uid() = captain_id);

CREATE POLICY "squad_members_read" ON public.squad_members FOR SELECT USING (true);
CREATE POLICY "squad_members_join_self" ON public.squad_members FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR public.is_squad_captain(squad_id, auth.uid()));
CREATE POLICY "squad_members_leave" ON public.squad_members FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.is_squad_captain(squad_id, auth.uid()));
CREATE POLICY "squad_members_update_captain" ON public.squad_members FOR UPDATE TO authenticated USING (public.is_squad_captain(squad_id, auth.uid()));

CREATE TABLE public.squad_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  squad_id uuid NOT NULL REFERENCES public.squads(id) ON DELETE CASCADE,
  inviter_id uuid NOT NULL,
  invitee_id uuid NOT NULL,
  message text,
  status public.squad_invite_status NOT NULL DEFAULT 'pending',
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX squad_invites_unique_pending ON public.squad_invites (squad_id, invitee_id) WHERE status = 'pending';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.squad_invites TO authenticated;
GRANT ALL ON public.squad_invites TO service_role;
ALTER TABLE public.squad_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invites_read_involved" ON public.squad_invites FOR SELECT TO authenticated
USING (auth.uid() = invitee_id OR auth.uid() = inviter_id OR public.is_squad_captain(squad_id, auth.uid()));
CREATE POLICY "invites_create_captain" ON public.squad_invites FOR INSERT TO authenticated
WITH CHECK (auth.uid() = inviter_id AND public.is_squad_member(squad_id, auth.uid()));
CREATE POLICY "invites_respond_invitee" ON public.squad_invites FOR UPDATE TO authenticated
USING (auth.uid() = invitee_id OR auth.uid() = inviter_id) WITH CHECK (auth.uid() = invitee_id OR auth.uid() = inviter_id);
CREATE POLICY "invites_delete_inviter" ON public.squad_invites FOR DELETE TO authenticated USING (auth.uid() = inviter_id);
CREATE TRIGGER squad_invites_updated_at BEFORE UPDATE ON public.squad_invites FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.squad_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  squad_id uuid NOT NULL REFERENCES public.squads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.squad_messages TO authenticated;
GRANT ALL ON public.squad_messages TO service_role;
ALTER TABLE public.squad_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "squad_messages_member_read" ON public.squad_messages FOR SELECT TO authenticated USING (public.is_squad_member(squad_id, auth.uid()));
CREATE POLICY "squad_messages_member_write" ON public.squad_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND public.is_squad_member(squad_id, auth.uid()));
CREATE POLICY "squad_messages_delete_own" ON public.squad_messages FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.is_squad_captain(squad_id, auth.uid()));

CREATE TABLE public.squad_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  squad_id uuid NOT NULL REFERENCES public.squads(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  title text NOT NULL,
  description text,
  scheduled_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.squad_events TO authenticated;
GRANT ALL ON public.squad_events TO service_role;
ALTER TABLE public.squad_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "squad_events_member_read" ON public.squad_events FOR SELECT TO authenticated USING (public.is_squad_member(squad_id, auth.uid()));
CREATE POLICY "squad_events_officer_write" ON public.squad_events FOR ALL TO authenticated
USING (public.is_squad_officer(squad_id, auth.uid())) WITH CHECK (public.is_squad_officer(squad_id, auth.uid()) AND auth.uid() = created_by);

CREATE TABLE public.squad_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  squad_id uuid NOT NULL REFERENCES public.squads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  message text,
  status public.squad_invite_status NOT NULL DEFAULT 'pending',
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX squad_join_requests_unique_pending ON public.squad_join_requests (squad_id, user_id) WHERE status = 'pending';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.squad_join_requests TO authenticated;
GRANT ALL ON public.squad_join_requests TO service_role;
ALTER TABLE public.squad_join_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "join_requests_read" ON public.squad_join_requests FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.is_squad_officer(squad_id, auth.uid()));
CREATE POLICY "join_requests_create_own" ON public.squad_join_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "join_requests_respond" ON public.squad_join_requests FOR UPDATE TO authenticated
USING (auth.uid() = user_id OR public.is_squad_officer(squad_id, auth.uid()))
WITH CHECK (auth.uid() = user_id OR public.is_squad_officer(squad_id, auth.uid()));
CREATE POLICY "join_requests_delete_own" ON public.squad_join_requests FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER squad_join_requests_updated_at BEFORE UPDATE ON public.squad_join_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- SQUAD AUTOMATION
CREATE OR REPLACE FUNCTION public.handle_squad_invite_response()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE squad_name text;
BEGIN
  IF NEW.status <> OLD.status AND NEW.status IN ('accepted','rejected') THEN
    NEW.responded_at = now();
    SELECT name INTO squad_name FROM public.squads WHERE id = NEW.squad_id;
    IF NEW.status = 'accepted' THEN
      INSERT INTO public.squad_members (squad_id, user_id, role) VALUES (NEW.squad_id, NEW.invitee_id, 'member')
      ON CONFLICT (squad_id, user_id) DO NOTHING;
    END IF;
    INSERT INTO public.notifications (user_id, type, title, message, action_url)
    VALUES (NEW.inviter_id, 'squad',
      CASE WHEN NEW.status = 'accepted' THEN 'Squad invite accepted' ELSE 'Squad invite declined' END,
      COALESCE(squad_name,'Your squad') || ': invite was ' || NEW.status, '/squads');
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER squad_invite_response BEFORE UPDATE ON public.squad_invites FOR EACH ROW EXECUTE FUNCTION public.handle_squad_invite_response();

CREATE OR REPLACE FUNCTION public.notify_squad_invite()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE squad_name text;
BEGIN
  SELECT name INTO squad_name FROM public.squads WHERE id = NEW.squad_id;
  INSERT INTO public.notifications (user_id, type, title, message, action_url)
  VALUES (NEW.invitee_id, 'squad', 'Squad invite',
    'You have been invited to join ' || COALESCE(squad_name,'a squad'), '/squads');
  RETURN NEW;
END; $$;
CREATE TRIGGER squad_invite_created AFTER INSERT ON public.squad_invites FOR EACH ROW EXECUTE FUNCTION public.notify_squad_invite();

CREATE OR REPLACE FUNCTION public.notify_join_request()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE captain uuid; squad_name text;
BEGIN
  SELECT captain_id, name INTO captain, squad_name FROM public.squads WHERE id = NEW.squad_id;
  IF captain IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, action_url)
    VALUES (captain, 'squad', 'New join request',
      'Someone asked to join ' || COALESCE(squad_name,'your squad'), '/squads');
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER squad_join_request_created AFTER INSERT ON public.squad_join_requests FOR EACH ROW EXECUTE FUNCTION public.notify_join_request();

CREATE OR REPLACE FUNCTION public.handle_join_request_response()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE squad_name text;
BEGIN
  IF NEW.status <> OLD.status AND NEW.status IN ('accepted','rejected') THEN
    NEW.responded_at = now();
    SELECT name INTO squad_name FROM public.squads WHERE id = NEW.squad_id;
    IF NEW.status = 'accepted' THEN
      INSERT INTO public.squad_members (squad_id, user_id, role) VALUES (NEW.squad_id, NEW.user_id, 'member')
      ON CONFLICT (squad_id, user_id) DO NOTHING;
    END IF;
    INSERT INTO public.notifications (user_id, type, title, message, action_url)
    VALUES (NEW.user_id, 'squad',
      CASE WHEN NEW.status = 'accepted' THEN 'Join request accepted' ELSE 'Join request declined' END,
      COALESCE(squad_name,'The squad') || ': your request was ' || NEW.status, '/squads');
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER squad_join_request_response BEFORE UPDATE ON public.squad_join_requests FOR EACH ROW EXECUTE FUNCTION public.handle_join_request_response();

CREATE OR REPLACE FUNCTION public.handle_new_squad_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.squads SET updated_at = now() WHERE id = NEW.squad_id;
  RETURN NEW;
END; $$;
CREATE TRIGGER squad_message_created AFTER INSERT ON public.squad_messages FOR EACH ROW EXECUTE FUNCTION public.handle_new_squad_message();

CREATE OR REPLACE FUNCTION public.add_captain_as_member()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.squad_members (squad_id, user_id, role) VALUES (NEW.id, NEW.captain_id, 'captain')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER squads_add_captain AFTER INSERT ON public.squads FOR EACH ROW EXECUTE FUNCTION public.add_captain_as_member();

-- FUNCTION PRIVILEGES
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_squad_invite_response() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_squad_invite() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.add_captain_as_member() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_squad_message() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_join_request() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_join_request_response() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_squad_member(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_squad_captain(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_squad_officer(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_squad_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_squad_captain(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_squad_officer(uuid, uuid) TO authenticated;

-- BACKUPS (admin only)
CREATE TABLE public.backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL DEFAULT 'Snapshot',
  status text NOT NULL DEFAULT 'pending',
  includes_database boolean NOT NULL DEFAULT true,
  includes_storage boolean NOT NULL DEFAULT true,
  storage_path text,
  size_bytes bigint NOT NULL DEFAULT 0,
  table_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  storage_file_count integer NOT NULL DEFAULT 0,
  pinned boolean NOT NULL DEFAULT false,
  error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.backups TO authenticated;
GRANT ALL ON public.backups TO service_role;
ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backups_admin_all" ON public.backups FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX backups_created_idx ON public.backups(created_at DESC);

-- PERFORMANCE INDEXES
CREATE INDEX tournaments_status_idx ON public.tournaments(status, start_date);
CREATE INDEX registrations_tournament_idx ON public.registrations(tournament_id);
CREATE INDEX registrations_user_idx ON public.registrations(user_id);
CREATE INDEX payments_user_idx ON public.payments(user_id, created_at DESC);
CREATE INDEX matches_tournament_idx ON public.matches(tournament_id, round);
CREATE INDEX user_statuses_created_idx ON public.user_statuses(created_at DESC);
CREATE INDEX user_statuses_user_idx ON public.user_statuses(user_id);
CREATE INDEX status_comments_status_idx ON public.status_comments(status_id, created_at DESC);
CREATE INDEX user_follows_following_idx ON public.user_follows(following_id);
CREATE INDEX notifications_user_idx ON public.notifications(user_id, is_read, created_at DESC);
CREATE INDEX conversations_p1_idx ON public.conversations(participant1_id, last_message_at DESC);
CREATE INDEX conversations_p2_idx ON public.conversations(participant2_id, last_message_at DESC);
CREATE INDEX squad_members_user_idx ON public.squad_members(user_id);
CREATE INDEX squad_messages_squad_idx ON public.squad_messages(squad_id, created_at DESC);
CREATE INDEX squad_join_requests_squad_idx ON public.squad_join_requests(squad_id, status);

-- AUTH TRIGGER
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- REALTIME
ALTER PUBLICATION supabase_realtime ADD TABLE public.squad_invites;
ALTER PUBLICATION supabase_realtime ADD TABLE public.squad_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.squad_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_statuses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.squad_join_requests;