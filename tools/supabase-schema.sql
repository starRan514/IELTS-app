-- 雅思 28 周 PWA · Supabase 数据库 schema
-- 在 Supabase 控制台 → SQL Editor → New query 中粘贴整段执行
-- 启用行级安全（RLS），每个用户只能读写自己的数据

-- ========================================
-- 1. profiles：用户设置（与 auth.users 1:1）
-- ========================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  settings     jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;
create policy "profiles_self" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- ========================================
-- 2. progress：四科完成进度
-- ========================================
create table if not exists public.progress (
  user_id  uuid not null references auth.users(id) on delete cascade,
  mod      text not null,           -- 'r' | 'l' | 'w' | 's'
  week     int  not null,
  done     boolean not null default true,
  score    text,
  at       timestamptz not null default now(),
  primary key (user_id, mod, week)
);

alter table public.progress enable row level security;
create policy "progress_self" on public.progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ========================================
-- 3. vocab：单词卡（SM-2 SRS）
-- ========================================
create table if not exists public.vocab (
  id          text not null primary key,  -- 客户端用 crypto.randomUUID() 生成
  user_id     uuid not null references auth.users(id) on delete cascade,
  term        text not null,
  context     text not null default '',
  source      text not null default '',
  week        int,
  meaning     text not null default '',
  mnemonic    text not null default '',
  association text not null default '',
  example     text not null default '',
  mnemonic_at bigint,                    -- 毫秒时间戳
  reps        int  not null default 0,
  ease        real not null default 2.3,
  interval    int  not null default 0,
  due         bigint not null default 0,
  lapses      int  not null default 0
);

alter table public.vocab enable row level security;
create policy "vocab_self" on public.vocab
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ========================================
-- 4. drafts：写作草稿
-- ========================================
create table if not exists public.drafts (
  user_id     uuid not null references auth.users(id) on delete cascade,
  key         text not null,            -- 形如 'w12' 或 't1-3'
  text        text not null default '',
  updated_at  timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.drafts enable row level security;
create policy "drafts_self" on public.drafts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ========================================
-- 5. customs：导入的自定义材料
-- ========================================
create table if not exists public.customs (
  id          text not null primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  type        text not null default '',
  size        bigint not null default 0,
  text        text not null default '',
  chars       bigint not null default 0,
  imported_at timestamptz not null default now()
);

alter table public.customs enable row level security;
create policy "customs_self" on public.customs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ========================================
-- 6. 推荐关闭邮箱确认（方便自己测试）
-- 操作：Authentication → Providers → Email → 关闭 "Confirm email"
-- 也可保持开启（生产环境更安全），但需到邮箱点确认链接才能登录
-- ========================================
