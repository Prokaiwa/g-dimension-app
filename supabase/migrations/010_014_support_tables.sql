-- =============================================================================
-- G-DIMENSION — Migration 010: car_contacts
-- =============================================================================
-- A per-car contact book. Think: mechanic's number, parts guy, detailer,
-- insurance agent. Shown on the Snapshot for quick "hand to a mechanic" use
-- case and accessible from Garage → Contacts sub-screen.
-- display_order allows user-defined sort (drag-to-reorder, future feature).
-- =============================================================================

create table if not exists public.car_contacts (
  id              uuid primary key default gen_random_uuid(),
  car_id          uuid not null references public.cars(id) on delete cascade,

  label           text not null,          -- e.g. "Mechanic", "Insurance", "Tuner"
  name            text,
  phone           text,
  email           text,                   -- Added: useful for shop correspondence
  website         text,                   -- Added: shop website / portfolio
  notes           text,
  display_order   integer not null default 0,

  created_at      timestamptz not null default now()
);

comment on table  public.car_contacts is 'Per-car contact book. Mechanic, parts vendor, detailer, insurance, etc.';

create index if not exists car_contacts_car_id
  on public.car_contacts (car_id, display_order asc);

alter table public.car_contacts enable row level security;


-- =============================================================================
-- G-DIMENSION — Migration 011: car_documents
-- =============================================================================
-- Important car documents: registration, insurance cards, title, emissions
-- certificates, inspection reports, warranty docs, purchase papers.
-- Stored in the `car-photos` bucket (documents sub-path) or a dedicated
-- documents bucket (see storage config).
-- expiry_date is the key field: car_reminders can be auto-created from it.
-- =============================================================================

create table if not exists public.car_documents (
  id              uuid primary key default gen_random_uuid(),
  car_id          uuid not null references public.cars(id) on delete cascade,

  doc_type        text not null
                    check (doc_type in (
                      'registration','insurance','title','emissions',
                      'inspection','warranty','purchase','other'
                    )),
  label           text,                   -- Custom label, e.g. "State Farm Policy 2024"
  file_url        text,                   -- Storage URL
  file_type       text check (file_type in ('image','pdf')),
  file_name       text,                   -- Original filename

  issued_date     date,
  expiry_date     date,                   -- Used for reminder auto-creation

  created_at      timestamptz not null default now()
);

comment on table  public.car_documents is 'Important car documents. Registration, insurance, title, emissions, etc.';
comment on column public.car_documents.expiry_date is 'Key field for reminder auto-creation. Insurance and registration use this.';

create index if not exists car_documents_car_id
  on public.car_documents (car_id);

create index if not exists car_documents_expiry
  on public.car_documents (car_id, expiry_date)
  where expiry_date is not null;

alter table public.car_documents enable row level security;


-- =============================================================================
-- G-DIMENSION — Migration 012: car_reminders
-- =============================================================================
-- Reminders tied to a car: registration renewal, insurance expiry, next oil
-- change, emissions test, lease end, warranty expiry.
-- Due dates can be calendar-based (due_date) or mileage-based (due_mileage).
-- A reminder can have both — whichever comes first triggers the alert.
-- =============================================================================

create table if not exists public.car_reminders (
  id              uuid primary key default gen_random_uuid(),
  car_id          uuid not null references public.cars(id) on delete cascade,

  title           text not null,
  category        text check (category in (
                    'registration','insurance','emissions','inspection',
                    'warranty','lease','service','other'
                  )),
  notes           text,

  -- Trigger conditions (one or both)
  due_date        date,               -- Calendar trigger
  due_mileage     integer,            -- Mileage trigger (stored in miles)

  -- State
  is_complete     boolean not null default false,
  completed_at    timestamptz,        -- When was it marked complete

  -- Linked document (optional — auto-link from car_documents.expiry_date)
  document_id     uuid references public.car_documents(id) on delete set null,

  created_at      timestamptz not null default now()
);

comment on table  public.car_reminders is 'Car-specific reminders. Registration, insurance, service intervals, mileage-based alerts.';
comment on column public.car_reminders.due_mileage is 'Mileage-based trigger. Stored in miles. Compare to cars.current_mileage.';
comment on column public.car_reminders.document_id is 'Optional link to car_documents. Auto-created from document expiry dates.';

create index if not exists car_reminders_car_id
  on public.car_reminders (car_id)
  where is_complete = false;

create index if not exists car_reminders_due_date
  on public.car_reminders (car_id, due_date)
  where is_complete = false and due_date is not null;

alter table public.car_reminders enable row level security;


-- =============================================================================
-- G-DIMENSION — Migration 013: error_logs
-- =============================================================================
-- Application error tracking. Fed by:
--   - React error boundary (global unhandled errors)
--   - try/catch blocks around every Supabase call
--   - Upload failure tracking
--   - Auth error logging
-- user_id is nullable: auth errors can occur before user context is available.
-- The RLS policy must allow INSERT with null user_id — done via service role
-- bypass or anon role INSERT permission (see 015_rls_policies.sql).
-- =============================================================================

create table if not exists public.error_logs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references public.users(id) on delete set null,
  -- NULL = error occurred before auth context, or during auth flow

  session_id      text,               -- Browser/tab session identifier (not DB session)
  error_type      text,               -- 'auth', 'upload', 'database', 'render', 'network'
  message         text,
  stack_trace     text,
  route           text,               -- React Router route where error occurred
  metadata        jsonb,              -- Additional context: HTTP status, file size, etc.
  app_version     text,               -- Semver for correlating errors to deploys

  created_at      timestamptz not null default now()
);

comment on table  public.error_logs is 'Application error tracking. Nullable user_id for pre-auth errors.';
comment on column public.error_logs.session_id is 'Browser tab identifier — NOT the sessions table. Used to correlate errors in a single session.';
comment on column public.error_logs.metadata is 'Flexible JSON context: HTTP status codes, file sizes, retry counts, etc.';

-- Time-based query for error monitoring
create index if not exists error_logs_created_at
  on public.error_logs (created_at desc);

create index if not exists error_logs_user_id
  on public.error_logs (user_id)
  where user_id is not null;

create index if not exists error_logs_error_type
  on public.error_logs (error_type, created_at desc);

alter table public.error_logs enable row level security;


-- =============================================================================
-- G-DIMENSION — Migration 014: analytics_events
-- =============================================================================
-- Custom event tracking layer on top of Vercel Analytics (Part 17).
-- Captures key product events for funnel analysis, feature usage, and
-- eventually the data asset that could be monetized via API access.
--
-- TRACKED EVENTS (Part 17):
--   add_car, add_session, add_job, job_status_changed, timeline_entry_created,
--   origin_entry_created, build_sheet_copied, pdf_exported, photo_uploaded,
--   upgrade_click, upgrade_completed, snapshot_viewed, public_profile_viewed
--
-- FORWARD-LOOKING — API PRODUCT:
--   This table (anonymized, aggregated) becomes the G-Dimension data product.
--   "What parts are most commonly installed on Nissan S14s?"
--   "What's the average build investment for a 350Z?"
--   To sell API keys to this data:
--     1. api_keys table (user_id, key_hash, plan, rate_limit, created_at)
--     2. api_requests table (key_id, endpoint, created_at) for billing
--     3. Materialized views on analytics_events + jobs for the actual queries
--   The analytics_events data model is already designed for this future.
-- =============================================================================

create table if not exists public.analytics_events (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references public.users(id) on delete set null,
  -- NULL = anonymous event (public profile views, etc.)

  event_name      text not null,
  properties      jsonb,              -- Flexible event-specific data
  -- Examples:
  -- add_car:       { car_id, make, model, year }
  -- add_session:   { session_id, type, job_count }
  -- upgrade_click: { from_screen, trigger_reason }
  -- pdf_exported:  { car_id, page_count }

  platform        text,               -- 'pwa', 'ios', 'android' — for post-native launch
  app_version     text,

  created_at      timestamptz not null default now()
);

comment on table  public.analytics_events is 'Custom product analytics. Feeds future API data product and funnel analysis.';
comment on column public.analytics_events.properties is 'Event-specific JSON payload. Schema varies by event_name.';
comment on column public.analytics_events.platform is 'pwa/ios/android — used post-native-launch to separate platform funnels.';

create index if not exists analytics_events_user_id
  on public.analytics_events (user_id, created_at desc)
  where user_id is not null;

create index if not exists analytics_events_event_name
  on public.analytics_events (event_name, created_at desc);

-- For the future API product: aggregate queries by car make/model
-- This will use a materialized view, not a direct table index.
-- Placeholder for documentation:
-- CREATE MATERIALIZED VIEW api_parts_popularity AS
--   SELECT j.brand, j.category, vm.make_name, vmo.model_name,
--          COUNT(*) as install_count, AVG(j.cost) as avg_cost
--   FROM jobs j JOIN sessions s ON s.id = j.session_id
--   JOIN cars c ON c.id = s.car_id
--   LEFT JOIN vehicle_makes vm ON vm.id = c.make_id
--   LEFT JOIN vehicle_models vmo ON vmo.id = c.model_id
--   WHERE j.status = 'installed' AND c.is_public = true
--   GROUP BY j.brand, j.category, vm.make_name, vmo.model_name;

alter table public.analytics_events enable row level security;
