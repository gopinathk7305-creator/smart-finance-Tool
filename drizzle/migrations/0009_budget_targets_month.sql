ALTER TABLE public.budget_targets
  ADD COLUMN IF NOT EXISTS month text NOT NULL DEFAULT 'Annual';