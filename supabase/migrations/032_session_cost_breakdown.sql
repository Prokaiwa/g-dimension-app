-- 032_session_cost_breakdown.sql
-- Add labor_cost and tax_amount to sessions for shop invoice breakdown.
-- Parts subtotal is derived at query time from the sum of related jobs.cost.

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS labor_cost  DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS tax_amount  DECIMAL(10,2);
