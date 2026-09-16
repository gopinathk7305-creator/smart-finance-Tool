CREATE TABLE public.uploaded_datasets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  org_id UUID,
  file_name TEXT NOT NULL,
  dataset_key TEXT NOT NULL,
  table_name TEXT NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0,
  column_names TEXT[] NOT NULL DEFAULT '{}',
  modules TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'synced',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.uploaded_datasets TO authenticated;
GRANT ALL ON public.uploaded_datasets TO service_role;

ALTER TABLE public.uploaded_datasets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own dataset metadata"
ON public.uploaded_datasets
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX uploaded_datasets_user_created_idx ON public.uploaded_datasets (user_id, created_at DESC);