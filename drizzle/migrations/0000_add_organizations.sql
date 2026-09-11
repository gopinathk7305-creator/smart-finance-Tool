CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY orgs_own ON public.organizations FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

ALTER TABLE public.transactions ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;
ALTER TABLE public.payroll_records ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;
ALTER TABLE public.budget_targets ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;
ALTER TABLE public.arap_records ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX idx_transactions_org ON public.transactions(org_id);
CREATE INDEX idx_payroll_org ON public.payroll_records(org_id);
CREATE INDEX idx_budget_org ON public.budget_targets(org_id);
CREATE INDEX idx_arap_org ON public.arap_records(org_id);