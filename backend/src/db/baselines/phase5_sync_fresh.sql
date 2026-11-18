-- Fresh-install baseline for new, empty Brush Beats databases.
-- Matches the post-002 household-sync schema, without dropping existing tables.
-- Existing deployments MUST use reviewed forward-only migrations; do not run this against populated databases.


create table if not exists accounts (
  account_id text primary key,
  email text unique,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists households (
  household_id text primary key,
  household_name text not null,
  owner_account_id text references accounts(account_id) on delete set null,
  subscription_tier text not null default 'free',
  active_user_id text,
  migration_source text not null default 'manual',
  sync_status text not null default 'local-only',
  reward_settings jsonb not null default '{}'::jsonb,
  goal_settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists members (
  user_id text primary key,
  household_id text not null references households(household_id) on delete cascade,
  name text not null,
  avatar text,
  birth_year integer,
  age_group text not null default 'unknown',
  tooth_stage text not null default 'unknown',
  top_teeth_count integer not null default 0,
  bottom_teeth_count integer not null default 0,
  total_teeth_count integer not null default 0,
  is_active boolean not null default false,
  is_archived boolean not null default false,
  member_preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sync_version integer not null default 1,
  is_deleted boolean not null default false,
  deleted_at timestamptz
);

create table if not exists brushing_sessions (
  session_id text primary key,
  user_id text not null references members(user_id) on delete cascade,
  household_id text not null references households(household_id) on delete cascade,
  session_type text not null default 'brushing',
  started_at timestamptz not null,
  completed_at timestamptz,
  duration_seconds integer not null default 0,
  target_duration_seconds integer not null default 120,
  song_id text,
  song_title text,
  artist_name text,
  bpm_used integer not null default 0,
  top_teeth_count integer not null default 0,
  bottom_teeth_count integer not null default 0,
  total_teeth_count integer not null default 0,
  performance_rating text,
  completed boolean not null default false,
  source text not null default 'app',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sync_version integer not null default 1,
  is_deleted boolean not null default false,
  deleted_at timestamptz
);

create table if not exists achievements (
  achievement_id text primary key,
  user_id text not null references members(user_id) on delete cascade,
  household_id text not null references households(household_id) on delete cascade,
  achievement_type text not null default 'milestone',
  title text not null default 'Achievement',
  description text not null default '',
  tier text not null default 'bronze',
  category text not null default 'consistency',
  awarded_at timestamptz not null default now(),
  related_session_id text,
  source_event_type text,
  source_event_id text,
  source_event_at timestamptz,
  source_context jsonb,
  progress_value integer not null default 0,
  points_awarded integer not null default 0,
  is_seen boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sync_version integer not null default 1,
  is_deleted boolean not null default false,
  deleted_at timestamptz
);

create index if not exists idx_members_household_id on members (household_id);
create index if not exists idx_members_household_active on members (household_id, is_deleted, is_archived, updated_at desc);
create index if not exists idx_brushing_sessions_user_id on brushing_sessions (user_id);
create index if not exists idx_brushing_sessions_started_at on brushing_sessions (started_at desc);
create index if not exists idx_achievements_user_id on achievements (user_id);