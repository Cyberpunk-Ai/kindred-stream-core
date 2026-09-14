-- ============================================================================
-- GameFlex — production social alignment
-- ----------------------------------------------------------------------------
-- Brings the live database up to what the current app expects.
-- Safe to run on production: additive only, fully idempotent, no drops of
-- existing tables/columns, no data deletion (except exact duplicate rows in
-- interaction tables, which must go before their uniqueness rules exist).
-- Re-running it is a no-op.
--
-- How to apply: open the SQL editor for the live project, paste this whole
-- file, run it once.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Posts: multi-image support, reposts counter, edit marker
-- ---------------------------------------------------------------------------
alter table public.user_statuses
  add column if not exists media_urls    jsonb   not null default '[]'::jsonb,
  add column if not exists reposts_count integer not null default 0,
  add column if not exists edited_at     timestamptz;

-- Existing single-image posts become one-item galleries.
update public.user_statuses
   set media_urls = jsonb_build_array(media_url)
 where media_url is not null
   and (media_urls is null or jsonb_array_length(media_urls) = 0);

-- ---------------------------------------------------------------------------
-- 2. Comments: threaded replies
-- ---------------------------------------------------------------------------
alter table public.status_comments
  add column if not exists parent_id     uuid references public.status_comments(id) on delete cascade,
  add column if not exists replies_count integer not null default 0;

-- ---------------------------------------------------------------------------
-- 3. Reposts
-- ---------------------------------------------------------------------------
create table if not exists public.status_reposts (
  id         uuid primary key default gen_random_uuid(),
  status_id  uuid not null references public.user_statuses(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  comment    text,
  created_at timestamptz not null default now()
);

grant select, insert, delete on public.status_reposts to authenticated;
grant select on public.status_reposts to anon;
grant all on public.status_reposts to service_role;

alter table public.status_reposts enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='status_reposts' and policyname='Reposts are viewable by everyone') then
    create policy "Reposts are viewable by everyone" on public.status_reposts for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='status_reposts' and policyname='Users can repost') then
    create policy "Users can repost" on public.status_reposts for insert to authenticated with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='status_reposts' and policyname='Users can remove their repost') then
    create policy "Users can remove their repost" on public.status_reposts for delete to authenticated using (auth.uid() = user_id);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Views (de-duplicated, one row per viewer per post)
-- ---------------------------------------------------------------------------
create table if not exists public.status_views (
  id         uuid primary key default gen_random_uuid(),
  status_id  uuid not null references public.user_statuses(id) on delete cascade,
  user_id    uuid references auth.users(id) on delete set null,
  viewer_key text not null,
  created_at timestamptz not null default now()
);

grant select on public.status_views to authenticated;
grant all on public.status_views to service_role;

alter table public.status_views enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='status_views' and policyname='Authors can see their post views') then
    create policy "Authors can see their post views" on public.status_views for select to authenticated
      using (exists (select 1 from public.user_statuses s where s.id = status_id and s.user_id = auth.uid()));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Uniqueness rules (stop double likes / saves / reposts / follows /
--    duplicate squad join requests). Exact duplicates are collapsed first.
-- ---------------------------------------------------------------------------
delete from public.status_likes a using public.status_likes b
 where a.ctid < b.ctid and a.status_id = b.status_id and a.user_id = b.user_id;
create unique index if not exists status_likes_status_user_key on public.status_likes (status_id, user_id);

delete from public.status_saves a using public.status_saves b
 where a.ctid < b.ctid and a.status_id = b.status_id and a.user_id = b.user_id;
create unique index if not exists status_saves_status_user_key on public.status_saves (status_id, user_id);

create unique index if not exists status_reposts_status_user_key on public.status_reposts (status_id, user_id);
create unique index if not exists status_views_status_viewer_key on public.status_views (status_id, viewer_key);

delete from public.user_follows a using public.user_follows b
 where a.ctid < b.ctid and a.follower_id = b.follower_id and a.following_id = b.following_id;
create unique index if not exists user_follows_pair_key on public.user_follows (follower_id, following_id);

-- This is the "conflict" error when sending a squad join request: the app
-- upserts on (squad_id, user_id) and that constraint did not exist.
delete from public.squad_join_requests a using public.squad_join_requests b
 where a.ctid < b.ctid and a.squad_id = b.squad_id and a.user_id = b.user_id;
do $$ begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.squad_join_requests'::regclass and conname = 'squad_join_requests_squad_user_key'
  ) then
    alter table public.squad_join_requests
      add constraint squad_join_requests_squad_user_key unique (squad_id, user_id);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.squad_members'::regclass and conname = 'squad_members_squad_user_key'
  ) then
    delete from public.squad_members a using public.squad_members b
     where a.ctid < b.ctid and a.squad_id = b.squad_id and a.user_id = b.user_id;
    alter table public.squad_members
      add constraint squad_members_squad_user_key unique (squad_id, user_id);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Counters maintained by the database (never by the client)
-- ---------------------------------------------------------------------------
create or replace function public.sync_status_likes_count()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  update public.user_statuses s
     set likes_count = (select count(*) from public.status_likes l where l.status_id = s.id)
   where s.id = coalesce(new.status_id, old.status_id);
  return null;
end $$;

create or replace function public.sync_status_reposts_count()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  update public.user_statuses s
     set reposts_count = (select count(*) from public.status_reposts r where r.status_id = s.id)
   where s.id = coalesce(new.status_id, old.status_id);
  return null;
end $$;

create or replace function public.sync_status_comment_counts()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  sid uuid := coalesce(new.status_id, old.status_id);
  pid uuid := coalesce(new.parent_id, old.parent_id);
begin
  update public.user_statuses s
     set comments_count = (
       select count(*) from public.status_comments c
        where c.status_id = s.id and c.parent_id is null
     )
   where s.id = sid;

  if pid is not null then
    update public.status_comments c
       set replies_count = (select count(*) from public.status_comments r where r.parent_id = c.id)
     where c.id = pid;
  end if;
  return null;
end $$;

drop trigger if exists status_likes_sync_count on public.status_likes;
create trigger status_likes_sync_count after insert or delete on public.status_likes
  for each row execute function public.sync_status_likes_count();

drop trigger if exists status_reposts_sync_count on public.status_reposts;
create trigger status_reposts_sync_count after insert or delete on public.status_reposts
  for each row execute function public.sync_status_reposts_count();

drop trigger if exists status_comments_sync_count on public.status_comments;
create trigger status_comments_sync_count after insert or delete on public.status_comments
  for each row execute function public.sync_status_comment_counts();

-- ---------------------------------------------------------------------------
-- 7. De-duplicated view recording
-- ---------------------------------------------------------------------------
create or replace function public.record_status_view(_status_id uuid, _viewer_key text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare inserted boolean := false;
begin
  if _status_id is null or _viewer_key is null or length(_viewer_key) = 0 then return; end if;

  insert into public.status_views (status_id, user_id, viewer_key)
  values (_status_id, auth.uid(), _viewer_key)
  on conflict (status_id, viewer_key) do nothing;

  get diagnostics inserted = row_count;

  if inserted then
    update public.user_statuses
       set views_count = coalesce(views_count, 0) + 1
     where id = _status_id;
  end if;
end $$;

grant execute on function public.record_status_view(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. Indexes for the cursor-paginated feed, profiles and comments
-- ---------------------------------------------------------------------------
create index if not exists user_statuses_feed_cursor_idx on public.user_statuses (created_at desc, id desc);
create index if not exists user_statuses_user_created_idx on public.user_statuses (user_id, created_at desc);
create index if not exists status_comments_status_created_idx on public.status_comments (status_id, created_at desc);
create index if not exists status_comments_parent_created_idx on public.status_comments (parent_id, created_at desc);
create index if not exists status_likes_user_idx on public.status_likes (user_id);
create index if not exists status_saves_user_idx on public.status_saves (user_id);
create index if not exists status_reposts_user_idx on public.status_reposts (user_id);
create index if not exists user_follows_follower_idx on public.user_follows (follower_id);
create index if not exists user_follows_following_idx on public.user_follows (following_id);
create index if not exists squad_members_user_idx on public.squad_members (user_id);
create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 9. Correct every existing counter once
-- ---------------------------------------------------------------------------
update public.user_statuses s set
  likes_count    = (select count(*) from public.status_likes l where l.status_id = s.id),
  comments_count = (select count(*) from public.status_comments c where c.status_id = s.id and c.parent_id is null),
  reposts_count  = (select count(*) from public.status_reposts r where r.status_id = s.id);

update public.status_comments c
   set replies_count = (select count(*) from public.status_comments r where r.parent_id = c.id);

update public.profiles p set
  followers_count = (select count(*) from public.user_follows f where f.following_id = p.user_id),
  following_count = (select count(*) from public.user_follows f where f.follower_id  = p.user_id);

commit;
