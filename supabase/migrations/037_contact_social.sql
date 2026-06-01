-- =============================================================================
-- G-DIMENSION — Migration 037: contact social link
-- =============================================================================
-- One optional social/profile link per contact (Instagram, Facebook, etc.) —
-- shown after Website on the Contacts screen, opened in a new tab like Website.
-- Additive, non-destructive. user_contacts already has RLS + grants (035).
-- =============================================================================

alter table public.user_contacts
  add column if not exists social text;

comment on column public.user_contacts.social is
  'Optional social/profile URL (Instagram, Facebook, etc.). Free-form link.';
