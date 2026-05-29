-- Add title to sessions for grouped mod entries on the Build Sheet.
-- title: the Build Sheet display name (e.g. "Built Block")
-- Nullable — only modification sessions created via the batch flow have this populated.
-- Section placement on the Build Sheet is derived from the component jobs' categories,
-- not stored here.

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS title text;
