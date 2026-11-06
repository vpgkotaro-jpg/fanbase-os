-- Startupathon 用 Supabase (Postgres) スキーマ。準備と計画.md 2-3 に対応。
-- 状態：構文確認は未実行（手元に Postgres が無いため）。Supabase の SQL Editor で流すときにエラーが出たら、その行を直す。
-- 前提：Supabase の auth.users と auth.uid() を使う。Postgres 15 以上を想定。
--
-- 計画書 2-3 からの追加（理由つき）
--   ideas.ai_community_id : AIが選んだコミュニティ。fanが投稿時に選んだ community_id とは別に持つ
--   ideas.ai_spam / ai_injection : スパム・命令文混入の目印。ファン向け公開ビューから外すため
--   idea_groups.community_id : まとまりの所属を引けるように（任意）
--   announcements.published_at は NULL = 下書き
--   inbox_messages（2026-11-01 追加）: DM 貼り付けの受信箱。1回目の提出では使わない（計画書 2-1）。idea_groups と votes も同じ
--   creator_settings（2026-11-01 追加）: AI に伝える好み。creators は全員が読めるので分けた
--   ideas.ai_highlight / ai_highlight_reason（2026-11-01 追加）: 注目の印と理由。公開ビューには出さない
--   comments（2026-11-01 追加）: メンバー同士の返信
--   announcements.idea_id（2026-11-01 追加）: 1回目はまとまりを作らないので、選んだ投稿に直接つなぐ
--   members（2026-11-01 追加）: 課題の「フォロワーをコミュニティに整理する」用。計画書 2-1 の 2
--
-- AIの結果の書き込みは、サーバー側（service_role キー）から行う。service_role キーはブラウザに出さない。

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 表
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
  published_at   timestamptz,           -- NULL は下書き
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
-- インデックス（外部キーと一覧の並び順に使うもの）
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
-- votes は UNIQUE (idea_id, device_id) が idea_id の索引を兼ねる

-- ------------------------------------------------------------
-- 賛成数の自動更新（ファンは ideas を更新できないので、トリガーで増減）
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
-- 公開用ビュー（メール欄と内部のAIフラグを含めない）
-- ビューの所有者権限で読むので、ideas の RLS を通らずにファンへ見せられる。
-- Supabase の Security Advisor が「SECURITY DEFINER ビュー」と警告する場合があるが、意図したもの。
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
  and i.ai_kind is not null;  -- AIの分類が済むまでは公開しない（スパムが一瞬でも出ないように）

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

-- 自分の creators 行か
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

-- creators：公開情報はだれでも読める。書けるのは本人だけ
create policy creators_public_read on public.creators
  for select to anon, authenticated using (true);
create policy creators_owner_insert on public.creators
  for insert to authenticated with check (user_id = auth.uid());
create policy creators_owner_update on public.creators
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy creators_owner_delete on public.creators
  for delete to authenticated using (user_id = auth.uid());

-- communities：読むのはだれでも。書けるのは持ち主だけ
create policy communities_public_read on public.communities
  for select to anon, authenticated using (true);
create policy communities_owner_insert on public.communities
  for insert to authenticated with check (public.owns_creator(creator_id));
create policy communities_owner_update on public.communities
  for update to authenticated using (public.owns_creator(creator_id)) with check (public.owns_creator(creator_id));
create policy communities_owner_delete on public.communities
  for delete to authenticated using (public.owns_creator(creator_id));

-- ideas：ファンは投稿（insert）だけ。読むのは ideas_public ビュー経由
-- 投稿時に AI の欄や賛成数を勝手に入れられないよう、初期値だけを許す
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
-- クリエイターは自分のコミュニティ宛ての行を読み・更新・削除できる（メールもここで読める）
create policy ideas_owner_read on public.ideas
  for select to authenticated using (public.owns_community(community_id));
create policy ideas_owner_update on public.ideas
  for update to authenticated using (public.owns_community(community_id)) with check (public.owns_community(community_id));
create policy ideas_owner_delete on public.ideas
  for delete to authenticated using (public.owns_community(community_id));

-- anon には ideas の読み取り権限そのものを与えない（ポリシーが無くても、二重の安全として）
revoke select on public.ideas from anon;
grant select on public.ideas_public to anon, authenticated;
-- 注意：ファンの投稿は insert のみ。supabase-js では .insert(...) の後に .select() を付けない
-- （付けると RETURNING が select 権限を要求して失敗する）。

-- idea_groups：クリエイターだけ
create policy idea_groups_owner_all on public.idea_groups
  for all to authenticated using (public.owns_creator(creator_id)) with check (public.owns_creator(creator_id));

-- votes：ファンは賛成の追加だけ。読めない（端末識別を見せない）。重複は UNIQUE が止める
-- ファンは ideas を読めないので、存在確認は所有者権限の関数で行う
create or replace function public.idea_is_votable(iid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.ideas i where i.id = iid and i.ai_spam = false and i.ai_injection = false and i.ai_kind is not null);  -- 公開ビューに出ている投稿だけ（AI分類前は返信・応援できない）
$$;

create policy votes_fan_insert on public.votes
  for insert to anon, authenticated
  with check (public.idea_is_votable(idea_id));
create policy votes_owner_read on public.votes
  for select to authenticated using (
    exists (select 1 from public.ideas i where i.id = idea_id and public.owns_community(i.community_id))
  );
revoke select on public.votes from anon;

-- announcements：公開済みだけ全員が読める。下書きと編集は持ち主だけ
create policy announcements_public_read on public.announcements
  for select to anon, authenticated using (published_at is not null);
create policy announcements_owner_all on public.announcements
  for all to authenticated using (public.owns_creator(creator_id)) with check (public.owns_creator(creator_id));

-- usage_events：自分の分だけ読み書き。ファンには見せない
create policy usage_events_owner_read on public.usage_events
  for select to authenticated using (public.owns_creator(creator_id));
create policy usage_events_owner_insert on public.usage_events
  for insert to authenticated with check (public.owns_creator(creator_id));

-- 想定外の経路で anon / authenticated に付く既定権限を狭める（RLS と二重で守る）
revoke all on public.usage_events from anon;
revoke all on public.idea_groups from anon;

-- inbox_messages：クリエイター本人だけ。ファンからは読めない
create index inbox_messages_creator_created_idx on public.inbox_messages (creator_id, created_at desc);
alter table public.inbox_messages enable row level security;
create policy inbox_messages_owner_all on public.inbox_messages
  for all to authenticated using (public.owns_creator(creator_id)) with check (public.owns_creator(creator_id));
revoke all on public.inbox_messages from anon;

-- members：ファンは参加（insert）だけ。読めるのはクリエイターだけ（メールを見せない）
-- 同じメールでの再参加は UNIQUE で止まる。アプリ側は 23505 を「参加済み」として成功扱いにし、エラーを見せない
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

-- creator_settings：クリエイター本人だけ。ファンからは読めない
create table public.creator_settings (
  creator_id     uuid primary key references public.creators (id) on delete cascade,
  ai_preferences text check (char_length(ai_preferences) <= 500),
  updated_at     timestamptz not null default now()
);
alter table public.creator_settings enable row level security;
create policy creator_settings_owner_all on public.creator_settings
  for all to authenticated using (public.owns_creator(creator_id)) with check (public.owns_creator(creator_id));
revoke all on public.creator_settings from anon;

-- comments：メンバー同士の返信。ログインなしで書けて、だれでも読める。メール欄は持たない
-- idea_is_votable は「スパムや命令文の印が付いていない投稿か」の判定なので、賛成と共用する
-- 消せるのは投稿先コミュニティのクリエイターだけ。書き換えはだれにも許さない
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
