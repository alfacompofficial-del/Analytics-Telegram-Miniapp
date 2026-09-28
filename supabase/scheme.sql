create table if not exists public.telegram_profiles (
  telegram_user_id bigint primary key check (telegram_user_id > 0),
  first_name text not null default '',
  last_name text not null default '',
  username text,
  language_code text,
  is_premium boolean,
  is_bot boolean not null default false,
  allows_write_to_pm boolean,
  added_to_attachment_menu boolean,
  last_seen_source text not null default 'mini_app'
    check (last_seen_source in ('mini_app', 'bot_start')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.telegram_profiles enable row level security;

revoke all on table public.telegram_profiles from anon, authenticated;
grant all on table public.telegram_profiles to service_role;

