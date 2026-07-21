-- 078_reminder_recurrence.sql
-- PENDING — apply in the Supabase SQL editor (after 077).
--
-- Recurring service reminders (native-app feature). car_reminders was one-shot
-- (due_date / due_mileage + is_complete). These two columns make a reminder
-- repeat: when a recurring reminder is marked complete, the app creates the
-- next occurrence (due_date + recur_months, and/or due_mileage stepped by
-- recur_miles from the current odometer). Either, both, or neither may be set;
-- NULL/NULL = a plain one-shot reminder (unchanged behaviour).
--
-- Delivery of the reminder itself is on-device local notifications in the
-- native (Capacitor) app — no push infrastructure required. The web PWA keeps
-- showing reminders in-app; it just can't fire background notifications.
--
-- Additive nullable columns on a table that already has RLS
-- (car_reminders_all_owner) + authenticated grants — no policy/grant change.
-- Idempotent.

alter table public.car_reminders
  add column if not exists recur_months int,
  add column if not exists recur_miles  int;

comment on column public.car_reminders.recur_months is
  'Recurrence: repeat every N months. On complete, the app spawns the next occurrence at due_date + N months. NULL = no time recurrence.';
comment on column public.car_reminders.recur_miles is
  'Recurrence: repeat every N miles. On complete, the app spawns the next occurrence at (current odometer) + N miles. NULL = no mileage recurrence.';

notify pgrst, 'reload schema';
