-- 085_moderation_grant_hardening.sql
-- Defence in depth for the 084 moderation tables (ADR-023 follow-up).
--
-- FOUND WHILE VERIFYING 084 LIVE: an ordinary signed-in user's attempt to
-- rewrite or delete their own report did not fail — it silently affected zero
-- rows:
--
--   PATCH  /rest/v1/content_reports?id=eq.<mine>  {"status":"dismissed"}  → 204, 0 rows
--   DELETE /rest/v1/content_reports?id=eq.<mine>                          → 204, 0 rows
--   POST   /rest/v1/moderation_blocked_terms      {...}                   → 42501 (RLS)
--
-- A missing GRANT produces `42501 permission denied for table …`. Getting a
-- clean 204 instead means the grant DOES allow update/delete and the only thing
-- refusing the write is the absence of a matching RLS policy. This database has
-- default privileges that hand `authenticated` full DML on new public tables,
-- so 084's deliberately narrow `grant select, insert` did not narrow anything —
-- exactly the layering trap 081 documented for column grants, one level up.
--
-- Today that is safe: RLS is doing the work correctly, and the audit trail was
-- verified intact after both attempts. It is fragile for one specific reason —
-- this codebase has twice shipped a policy written `for all` with no role
-- clause (081/082 both turned on that mistake). The day someone adds
-- `content_reports_all_own for all using (reporter_id = auth.uid())` as a
-- convenience, every reporter can silently edit or erase their own report, and
-- the evidence App Store Guideline 1.2 requires us to keep evaporates.
--
-- So make the grant the floor rather than relying on a policy never being
-- written: reports are APPEND-ONLY to their author, and the blocklist is
-- readable only through `username_rejection_reason()` (a definer function,
-- which needs no table grant at all).
--
-- Resolution stays possible because the four admin RPCs are `security definer`
-- and run with the function owner's rights, not the caller's — these revokes do
-- not touch them. Verified after applying: admin dismiss/hide/suspend all still
-- work; a reporter's PATCH and DELETE now fail loudly with 42501 instead of
-- quietly doing nothing.
--
-- `user_blocks` deliberately keeps DELETE — unblocking is a user action
-- (/settings/blocked), and a block list you cannot undo is a trapdoor.
--
-- Idempotent. Run in the Supabase SQL Editor.

-- Reports: insert and read your own, nothing else. Never edit, never delete.
revoke update, delete, truncate on public.content_reports from authenticated, anon;

-- Blocks: create and remove your own. Editing a block row means nothing.
revoke update, truncate on public.user_blocks from authenticated, anon;

-- Blocklist: no direct table access for anyone. The definer function is the API.
revoke select, insert, update, delete, truncate
  on public.moderation_blocked_terms from authenticated, anon;

notify pgrst, 'reload schema';
