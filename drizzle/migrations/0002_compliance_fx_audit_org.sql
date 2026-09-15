CREATE TABLE public.compliance_filings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  filing_key TEXT NOT NULL DEFAULT '',
  filing_type TEXT NOT NULL DEFAULT '',
  period TEXT NOT NULL DEFAULT '',
  due_date DATE,
  amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'filed',
  ack_number TEXT NOT NULL DEFAULT '',
  filed_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_filings TO authenticated;
GRANT ALL ON public.compliance_filings TO service_role;
ALTER TABLE public.compliance_filings ENABLE ROW LEVEL SECURITY;
CREATE POLICY compliance_own ON public.compliance_filings FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE UNIQUE INDEX compliance_filings_unique ON public.compliance_filings (user_id, COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), filing_key, period);

CREATE TABLE public.fx_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  rate_to_inr NUMERIC NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fx_rates TO authenticated;
GRANT ALL ON public.fx_rates TO service_role;
ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY fx_own ON public.fx_rates FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE UNIQUE INDEX fx_rates_unique ON public.fx_rates (user_id, COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), currency);

CREATE TABLE public.org_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  depreciation_annual NUMERIC NOT NULL DEFAULT 0,
  tax_regime TEXT NOT NULL DEFAULT '25',
  surcharge_band TEXT NOT NULL DEFAULT 'auto',
  base_currency TEXT NOT NULL DEFAULT 'INR',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_settings TO authenticated;
GRANT ALL ON public.org_settings TO service_role;
ALTER TABLE public.org_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_settings_own ON public.org_settings FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE UNIQUE INDEX org_settings_unique ON public.org_settings (user_id, COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid));

ALTER TABLE public.audit_findings ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;
ALTER TABLE public.audit_findings ADD COLUMN IF NOT EXISTS fingerprint TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS audit_findings_fp ON public.audit_findings (user_id, fingerprint);