-- Sentinel Alpha — Supabase 스키마
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하세요.

-- ─────────────────────────────────────────────
-- 1. 사용자 프로필
-- ─────────────────────────────────────────────
create table if not exists public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  name              text not null default '사용자',
  membership        text not null default 'FREE'
                    check (membership in ('FREE', 'BASIC', 'PREMIUM', 'BUSINESS')),
  membership_expiry timestamptz,
  created_at        timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- 본인 행만 읽기/쓰기 가능
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- 회원가입 시 프로필 자동 생성 (이메일/구글 로그인 모두 커버)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'full_name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────
-- 2. 관심 물건 (즐겨찾기) — 기기 간 동기화용
-- ─────────────────────────────────────────────
create table if not exists public.favorites (
  user_id     uuid not null references auth.users(id) on delete cascade,
  case_number text not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, case_number)
);

alter table public.favorites enable row level security;

drop policy if exists "favorites_own" on public.favorites;
create policy "favorites_own" on public.favorites
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
