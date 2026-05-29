-- Add title and category to sessions for grouped mod entries on the Build Sheet.
-- title: the Build Sheet display name (e.g. "Built Block")
-- category: the MOD_GROUPS id where the group appears ('power','chassis','exterior','interior','other')
-- Both nullable — only modification sessions created via the new batch flow have these populated.

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS category text;
