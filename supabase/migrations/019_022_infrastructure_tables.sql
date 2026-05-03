-- =============================================================================
-- G-DIMENSION — Migration 019: user_flags
-- =============================================================================
-- Per-user feature flags for staged rollouts, beta access, and A/B testing.
--
-- HOW IT WORKS:
--   Each row = one flag enabled for one user.
--   No row = flag is off. Absence = disabled (default deny).
--   The app queries: SELECT flag FROM user_flags WHERE user_id = $1 AND enabled = true
--   Then checks if a specific flag is in the returned array.
--
-- USE CASES:
--   'beta_marketplace'     → Early access to marketplace before public launch
--   'new_timeline_ui'      → Testing a redesigned Timeline with select users
--   'api_access'           → Users with API key access (future monetization)
--   'pro_trial'            → 30-day Pro trial (before payments launch)
--   'debug_mode'           → Extra logging for users reporting specific bugs
--   'carquery_variants'    → Beta feature: CarQuery-sourced variant picker
--   'price_aggregator'     → Beta feature: Show market prices on job entries
--
-- STAGED ROLLOUT PATTERN:
--   1. Insert flag rows for you + beta testers
--   2. App gates the feature behind the flag check
--   3. When confident, insert flag for all users:
--      INSERT INTO user_flags (user_id, flag) SELECT id, 'new_feature' FROM users;
--   4. Eventually remove the flag check from code + clean up rows
-- =============================================================================

create table if not exists public.user_flags (
  user_id     uuid not null references public.users(id) on delete cascade,
  flag        text not null,
  enabled     boolean not null default true,
  -- Metadata
  granted_by  uuid references public.users(id) on delete set null,  -- Admin who granted it
  expires_at  timestamptz,            -- Optional expiry (for time-limited trials)
  created_at  timestamptz not null default now(),

  primary key (user_id, flag)
);

comment on table  public.user_flags is 'Per-user feature flags. Controls staged rollouts, beta access, A/B tests.';
comment on column public.user_flags.expires_at is 'Optional. Used for time-limited trials (pro_trial, beta_marketplace). App checks expires_at > now().';
comment on column public.user_flags.granted_by is 'Admin user who granted the flag. Null for system-granted flags.';

create index if not exists user_flags_user_id
  on public.user_flags (user_id)
  where enabled = true;

alter table public.user_flags enable row level security;

-- Users can read their own flags (to gate their own UI)
create policy "user_flags_select_owner"
  on public.user_flags for select
  using (auth.uid() = user_id);

-- Only service role can insert/update/delete flags (admin operations)
-- No user-facing write policy — flags are admin-controlled


-- =============================================================================
-- G-DIMENSION — Migration 020: audit_log
-- =============================================================================
-- Tamper-proof record of all significant data changes.
-- Answers: "Who changed this, what was it before, and when?"
--
-- TABLES AUDITED:
--   cars          → catch unauthorized or accidental edits to car records
--   jobs          → track status changes (installed → removed), cost edits
--   sessions      → track add_to_timeline changes, cost edits
--   timeline_entries → track any edits to the curated story
--
-- NOT AUDITED (too high-volume, low value):
--   analytics_events  → already a log
--   error_logs        → already a log
--   job_photos        → photo add/remove is low-risk
--
-- HOW IT WORKS:
--   Each audited table gets a TRIGGER that fires on UPDATE and DELETE.
--   INSERT is not audited (created_at on each table is sufficient).
--   The trigger captures old_data (JSON) and new_data (JSON) and inserts a row here.
--
-- FUTURE USE:
--   - Support: "Why does my build cost show differently?" → audit trail
--   - Marketplace: "This car's history was never modified" → provenance proof
--   - Compliance: If app ever handles financial transactions, audit logs are required
-- =============================================================================

create table if not exists public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.users(id) on delete set null,
  table_name  text not null,
  row_id      uuid not null,
  operation   text not null check (operation in ('UPDATE','DELETE')),
  old_data    jsonb,                  -- The row before the change (null for INSERT)
  new_data    jsonb,                  -- The row after the change (null for DELETE)
  changed_at  timestamptz not null default now()
);

comment on table  public.audit_log is 'Immutable audit trail for significant data changes. Key for support, marketplace provenance, and compliance.';
comment on column public.audit_log.old_data is 'Full row state before the change (JSON). Null for inserts.';
comment on column public.audit_log.new_data is 'Full row state after the change (JSON). Null for deletes.';
comment on column public.audit_log.user_id is 'Who made the change. Set null if user is deleted (preserve the history).';

-- Query patterns: find all changes to a specific row, or all changes by a user
create index if not exists audit_log_table_row
  on public.audit_log (table_name, row_id, changed_at desc);

create index if not exists audit_log_user_id
  on public.audit_log (user_id, changed_at desc)
  where user_id is not null;

create index if not exists audit_log_changed_at
  on public.audit_log (changed_at desc);

alter table public.audit_log enable row level security;

-- Users can read their own audit history (for transparency / "what happened to my data")
create policy "audit_log_select_owner"
  on public.audit_log for select
  using (auth.uid() = user_id);

-- No user INSERT — audit_log is written only by triggers (via service role context)
-- No UPDATE or DELETE — audit logs are immutable

-- =============================================================================
-- AUDIT TRIGGERS: Apply to cars, jobs, sessions, timeline_entries
-- =============================================================================

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_row_id  uuid;
begin
  -- Get the current user from auth context
  v_user_id := auth.uid();

  -- Determine the row_id being changed
  if TG_OP = 'DELETE' then
    v_row_id := old.id;
  else
    v_row_id := new.id;
  end if;

  insert into public.audit_log (user_id, table_name, row_id, operation, old_data, new_data)
  values (
    v_user_id,
    TG_TABLE_NAME,
    v_row_id,
    TG_OP,
    case when TG_OP in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when TG_OP in ('INSERT','UPDATE') then to_jsonb(new) else null end
  );

  if TG_OP = 'DELETE' then
    return old;
  else
    return new;
  end if;
end;
$$;

-- Apply to cars
create trigger cars_audit
  after update or delete on public.cars
  for each row execute procedure public.write_audit_log();

-- Apply to jobs (status changes are the most important)
create trigger jobs_audit
  after update or delete on public.jobs
  for each row execute procedure public.write_audit_log();

-- Apply to sessions (timeline changes, cost changes)
create trigger sessions_audit
  after update or delete on public.sessions
  for each row execute procedure public.write_audit_log();

-- Apply to timeline_entries (story edits)
create trigger timeline_entries_audit
  after update or delete on public.timeline_entries
  for each row execute procedure public.write_audit_log();


-- =============================================================================
-- G-DIMENSION — Migration 021: notification_preferences
-- =============================================================================
-- Push notification settings per user. Stored now so when native app launches
-- (iOS/Android — Part 1 of architecture), the data model is ready.
-- The PWA has no push notifications (browser push is unreliable on iOS Safari).
-- This table is used starting at native app launch.
--
-- PUSH TOKEN:
--   iOS and Android issue a unique push token per device per app install.
--   Stored here so the server can send targeted notifications.
--   Multiple devices = multiple rows (one per device).
--   Using a separate table from users to support multi-device.
-- =============================================================================

create table if not exists public.notification_preferences (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.users(id) on delete cascade,

  -- Notification categories (user-controlled toggles in Settings)
  reminders_enabled   boolean not null default true,
  -- Fires when: car_reminders.due_date is approaching (7 days out, 1 day out)
  -- Example: "Your registration expires in 7 days"

  milestones_enabled  boolean not null default true,
  -- Fires when: a build milestone is reached (1 year of ownership, 100k miles, etc)
  -- Example: "Your S14 just hit 1 year in the garage 🎉"

  marketing_enabled   boolean not null default false,
  -- Product updates, new features, G-Dimension community news
  -- Default OFF — explicit opt-in required (legal best practice)

  digest_enabled      boolean not null default false,
  -- Weekly "your build this week" summary
  -- Default OFF

  -- Device push token (one row per device)
  push_token          text,
  push_platform       text check (push_platform in ('ios','android','web')),

  -- Token validity
  token_active        boolean not null default true,
  token_updated_at    timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- One preference row per user per device
  constraint notification_preferences_user_device unique (user_id, push_token)
);

comment on table  public.notification_preferences is 'Push notification settings per user per device. Ready for native app launch.';
comment on column public.notification_preferences.push_token is 'Device-specific push token from APNs (iOS) or FCM (Android). One per device.';
comment on column public.notification_preferences.marketing_enabled is 'Default OFF — opt-in only. Required for CAN-SPAM/GDPR compliance.';
comment on column public.notification_preferences.token_active is 'Set false when APNs/FCM reports token as invalid. Prevents wasted push attempts.';

create index if not exists notification_preferences_user_id
  on public.notification_preferences (user_id);

create index if not exists notification_preferences_active_tokens
  on public.notification_preferences (push_token)
  where token_active = true and push_token is not null;

alter table public.notification_preferences enable row level security;

create policy "notification_preferences_all_owner"
  on public.notification_preferences for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger notification_preferences_set_updated_at
  before update on public.notification_preferences
  for each row execute procedure public.set_updated_at();
