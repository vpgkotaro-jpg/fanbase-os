-- Supabase (Postgres) schema for Startupathon. Matches section 2-3 of the plan doc.
-- Status: syntax not yet verified (no local Postgres). If running this in the Supabase SQL Editor raises an error, fix that line.
-- Assumes: uses Supabase auth.users and auth.uid(); Postgres 15 or later.
--
-- Additions to plan section 2-3 (with reasons)
--   ideas.ai_community_id : the community the AI chose; kept separate from the community_id the fan picked when posting
--   ideas.ai_spam / ai_injection : flags for spam / injected instructions; used to exclude rows from the fan-facing public view
--   idea_groups.community_id : lets us look up which community a group belongs to (optional)
--   announcements.published_at: NULL = draft
--   inbox_messages (added 2026-11-01): inbox for pasted DMs. Not used in the first submission (plan 2-1); same for idea_groups and votes
--   creator_settings (added 2026-11-01): preferences passed to the AI. Split out because everyone can read creators
--   ideas.ai_highlight / ai_highlight_reason (added 2026-11-01): highlight flag and reason. Not exposed in the public view
--   comments (added 2026-11-01): replies between members
--   announcements.idea_id (added 2026-11-01): the first release creates no groups, so link directly to the chosen post
--   members (added 2026-11-01): for the task "organize followers into communities". Plan 2-1, item 2
--
-- AI results are written from the server side (service_role key). Never expose the service_role key to the browser.

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- Tables
-- ------------------------------------------------------------

create table public.creators (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null unique references auth.users (id) on delete cascade,
  display_name  text not null check (char_length(display_name) between 1 and 80),
  slug          text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  bio           text check (char_length(bio) <= 1000),
  icon_url      text,
  created_at    timestamptz not null default now()
);

create table public.communities (
  id            uuid primary key default gen_random_uuid(),
  creator_id    uuid not null references public.creators (id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 60),
  description   text check (char_length(description) <= 500),
  created_at    timestamptz not null default now()
);

create table public.idea_groups (
  id                    uuid primary key default gen_random_uuid(),
  creator_id            uuid not null references public.creators (id) on delete cascade,
  community_id          uuid references public.communities (id) on delete set null,
  representative_summary text not null check (char_length(representative_summary) between 1 and 300),
  idea_count            integer not null default 1 check (idea_count >= 0),
  created_at            timestamptz not null default now()
);

create table public.ideas (
  id               uuid primary key default gen_random_uuid(),
  community_id     uuid not null references public.communities (id) on delete cascade,
  author_name      text check (char_length(author_name) <= 60),
  email            text check (email is null or (char_length(email) <= 254 and email like '%_@_%')),
  body             text not null check (char_length(body) between 1 and 2000),
  ai_kind          text check (ai_kind in ('idea', 'project', 'collab', 'question', 'other')),
  ai_summary       text check (char_length(ai_summary) <= 300),
  ai_community_id  uuid references public.communities (id) on delete set null,
  ai_spam          boolean not null default false,
  ai_injection     boolean not null default false,
  ai_highlight     boolean not null default false,
  ai_highlight_reason text check (char_length(ai_highlight_reason) <= 300),
  group_id         uuid references public.idea_groups (id) on delete set null,
  vote_count       integer not null default 0 check (vote_count >= 0),
  status           text not null default 'new' check (status in ('new', 'selected', 'announced')),
  created_at       timestamptz not null default now()
);

create table public.votes (
  id         uuid primary key default gen_random_uuid(),
  idea_id    uuid not null references public.ideas (id) on delete cascade,
  device_id  text not null check (char_length(device_id) between 8 and 100),
  created_at timestamptz not null default now(),
  constraint votes_one_per_device unique (idea_id, device_id)
);

create table public.announcements (
  id             uuid primary key default gen_random_uuid(),
  creator_id     uuid not null references public.creators (id) on delete cascade,
  idea_id        uuid references public.ideas (id) on delete set null,
  idea_group_id  uuid references public.idea_groups (id) on delete set null,
  title          text check (char_length(title) <= 100),
  body           text not null check (char_length(body) between 1 and 3000),
  published_at   timestamptz,           -- NULL means draft
  created_at     timestamptz not null default now()
);

create table public.usage_events (
  id          bigint generated always as identity primary key,
  creator_id  uuid not null references public.creators (id) on delete cascade,
  event_name  text not null check (event_name in
                ('login', 'dashboard_open', 'idea_received', 'group_viewed', 'announcement_drafted', 'announcement_published')),
  created_at  timestamptz not null default now()
);

create table public.members (
  id            uuid primary key default gen_random_uuid(),
  community_id  uuid not null references public.communities (id) on delete cascade,
  display_name  text check (char_length(display_name) <= 80),
  email         text check (char_length(email) <= 254),
  created_at    timestamptz not null default now(),
  check (display_name is not null or email is not null)
);

create table public.inbox_messages (
  id              uuid primary key default gen_random_uuid(),
  creator_id      uuid not null references public.creators (id) on delete cascade,
  sender_label    text check (char_length(sender_label) <= 100),
  body            text not null check (char_length(body) between 1 and 4000),
  ai_category     text check (ai_category in ('needs_reply', 'collab', 'fan_voice', 'spam')),
  ai_summary      text check (char_length(ai_summary) <= 300),
  ai_opportunity  boolean not null default false,
  handled         boolean not null default false,
  created_at      timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Indexes (for foreign keys and list ordering)
-- ------------------------------------------------------------

create index communities_creator_idx    on public.communities (creator_id);
create index ideas_community_created_idx on public.ideas (community_id, created_at desc);
create index ideas_group_idx            on public.ideas (group_id);
create index ideas_status_idx           on public.ideas (status);
create index ideas_ai_community_idx     on public.ideas (ai_community_id);
create index idea_groups_creator_idx    on public.idea_groups (creator_id);
create index announcements_creator_pub_idx on public.announcements (creator_id, published_at desc);
create index announcements_group_idx    on public.announcements (idea_group_id);
create index usage_events_creator_created_idx on public.usage_events (creator_id, created_at desc);
-- votes: UNIQUE (idea_id, device_id) also serves as the idea_id index

-- ------------------------------------------------------------
-- Automatic vote count updates (fans cannot update ideas, so a trigger increments/decrements)
-- ------------------------------------------------------------

create or replace function public.bump_vote_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.ideas set vote_count = vote_count + 1 where id = new.idea_id;
  elsif tg_op = 'DELETE' then
    update public.ideas set vote_count = greatest(vote_count - 1, 0) where id = old.idea_id;
  end if;
  return null;
end;
$$;

create trigger votes_count_trg
after insert or delete on public.votes
for each row execute function public.bump_vote_count();

-- ------------------------------------------------------------
-- Public view (excludes the email column and internal AI flags)
-- It reads with the view owner's privileges, so it can show rows to fans without going through ideas RLS.
-- Supabase's Security Advisor may warn about a "SECURITY DEFINER view"; this is intentional.
-- ------------------------------------------------------------

create view public.ideas_public as
select
  i.id,
  i.community_id,
  i.author_name,
  i.body,
  i.ai_kind,
  i.ai_summary,
  i.group_id,
  i.vote_count,
  i.status,
  i.created_at
from public.ideas i
where i.ai_spam = false
  and i.ai_injection = false
  and i.ai_kind is not null;  -- not public until AI classification is done (so spam never shows even briefly)

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------

alter table public.creators       enable row level security;
alter table public.communities    enable row level security;
alter table public.idea_groups    enable row level security;
alter table public.ideas          enable row level security;
alter table public.votes          enable row level security;
alter table public.announcements  enable row level security;
alter table public.usage_events   enable row level security;

-- whether it is the user's own creators row
create or replace function public.owns_creator(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.creators c where c.id = cid and c.user_id = auth.uid());
$$;

create or replace function public.owns_community(comid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.communities cm
    join public.creators c on c.id = cm.creator_id
    where cm.id = comid and c.user_id = auth.uid()
  );
$$;

-- creators: public info is readable by anyone. Only the owner can write
create policy creators_public_read on public.creators
  for select to anon, authenticated using (true);
create policy creators_owner_insert on public.creators
  for insert to authenticated with check (user_id = auth.uid());
create policy creators_owner_update on public.creators
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy creators_owner_delete on public.creators
  for delete to authenticated using (user_id = auth.uid());

-- communities: anyone can read. Only the owner can write
create policy communities_public_read on public.communities
  for select to anon, authenticated using (true);
create policy communities_owner_insert on public.communities
  for insert to authenticated with check (public.owns_creator(creator_id));
create policy communities_owner_update on public.communities
  for update to authenticated using (public.owns_creator(creator_id)) with check (public.owns_creator(creator_id));
create policy communities_owner_delete on public.communities
  for delete to authenticated using (public.owns_creator(creator_id));

-- ideas: fans can only post (insert). Reads go through the ideas_public view
-- Allow only initial values so fans cannot set AI columns or vote counts when posting
create policy ideas_fan_insert on public.ideas
  for insert to anon, authenticated
  with check (
    status = 'new'
    and vote_count = 0
    and ai_kind is null
    and ai_summary is null
    and ai_community_id is null
    and ai_spam = false
    and ai_injection = false
    and ai_highlight = false
    and ai_highlight_reason is null
    and group_id is null
  );
-- Creators can read, update, and delete rows addressed to their own communities (emails are readable here too)
create policy ideas_owner_read on public.ideas
  for select to authenticated using (public.owns_community(community_id));
create policy ideas_owner_update on public.ideas
  for update to authenticated using (public.owns_community(community_id)) with check (public.owns_community(community_id));
create policy ideas_owner_delete on public.ideas
  for delete to authenticated using (public.owns_community(community_id));

-- anon is not granted read privilege on ideas at all (double safety, even without a policy)
revoke select on public.ideas from anon;
grant select on public.ideas_public to anon, authenticated;
-- Note: fan posts are insert-only. In supabase-js, do not chain .select() after .insert(...)
-- (doing so makes RETURNING require select privilege and fail).

-- idea_groups: creators only
create policy idea_groups_owner_all on public.idea_groups
  for all to authenticated using (public.owns_creator(creator_id)) with check (public.owns_creator(creator_id));

-- votes: fans can only add votes. They cannot read them (device IDs stay hidden). Duplicates are blocked by UNIQUE
-- Fans cannot read ideas, so existence checks use a function with owner privileges
create or replace function public.idea_is_votable(iid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.ideas i where i.id = iid and i.ai_spam = false and i.ai_injection = false and i.ai_kind is not null);  -- only posts visible in the public view (no replies or votes before AI classification)
$$;

create policy votes_fan_insert on public.votes
  for insert to anon, authenticated
  with check (public.idea_is_votable(idea_id));
create policy votes_owner_read on public.votes
  for select to authenticated using (
    exists (select 1 from public.ideas i where i.id = idea_id and public.owns_community(i.community_id))
  );
revoke select on public.votes from anon;

-- announcements: only published ones are readable by everyone. Drafts and edits are owner-only
create policy announcements_public_read on public.announcements
  for select to anon, authenticated using (published_at is not null);
create policy announcements_owner_all on public.announcements
  for all to authenticated using (public.owns_creator(creator_id)) with check (public.owns_creator(creator_id));

-- usage_events: read/write only your own. Not shown to fans
create policy usage_events_owner_read on public.usage_events
  for select to authenticated using (public.owns_creator(creator_id));
create policy usage_events_owner_insert on public.usage_events
  for insert to authenticated with check (public.owns_creator(creator_id));

-- Narrow default privileges that anon / authenticated may receive via unexpected paths (double protection with RLS)
revoke all on public.usage_events from anon;
revoke all on public.idea_groups from anon;

-- inbox_messages: the creator only. Not readable by fans
create index inbox_messages_creator_created_idx on public.inbox_messages (creator_id, created_at desc);
alter table public.inbox_messages enable row level security;
create policy inbox_messages_owner_all on public.inbox_messages
  for all to authenticated using (public.owns_creator(creator_id)) with check (public.owns_creator(creator_id));
revoke all on public.inbox_messages from anon;

-- members: fans can only join (insert). Only creators can read (emails stay hidden)
-- Rejoining with the same email is blocked by UNIQUE. The app treats 23505 as "already joined" and succeeds without showing an error
create unique index members_community_email_key on public.members (community_id, lower(email)) where email is not null;
create index members_community_created_idx on public.members (community_id, created_at desc);
alter table public.members enable row level security;
create policy members_fan_insert on public.members
  for insert to anon, authenticated with check (true);
create policy members_owner_read on public.members
  for select to authenticated using (public.owns_community(community_id));
create policy members_owner_update on public.members
  for update to authenticated using (public.owns_community(community_id)) with check (public.owns_community(community_id));
create policy members_owner_delete on public.members
  for delete to authenticated using (public.owns_community(community_id));
revoke select on public.members from anon;

-- creator_settings: the creator only. Not readable by fans
create table public.creator_settings (
  creator_id     uuid primary key references public.creators (id) on delete cascade,
  ai_preferences text check (char_length(ai_preferences) <= 500),
  updated_at     timestamptz not null default now()
);
alter table public.creator_settings enable row level security;
create policy creator_settings_owner_all on public.creator_settings
  for all to authenticated using (public.owns_creator(creator_id)) with check (public.owns_creator(creator_id));
revoke all on public.creator_settings from anon;

-- comments: replies between members. Writable without login, readable by anyone. No email column
-- idea_is_votable checks "is the post free of spam / injection flags", so it is shared with votes
-- Only the creator of the target community can delete. Nobody may edit
create table public.comments (
  id           uuid primary key default gen_random_uuid(),
  idea_id      uuid not null references public.ideas (id) on delete cascade,
  author_name  text check (char_length(author_name) <= 60),
  body         text not null check (char_length(body) between 1 and 1000),
  created_at   timestamptz not null default now()
);
create index comments_idea_created_idx on public.comments (idea_id, created_at);
alter table public.comments enable row level security;
create policy comments_public_read on public.comments
  for select to anon, authenticated using (public.idea_is_votable(idea_id));
create policy comments_fan_insert on public.comments
  for insert to anon, authenticated with check (public.idea_is_votable(idea_id));
create policy comments_owner_delete on public.comments
  for delete to authenticated using (
    exists (select 1 from public.ideas i where i.id = idea_id and public.owns_community(i.community_id))
  );
