ALTER TABLE public.uploaded_datasets
  ADD COLUMN IF NOT EXISTS base_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

UPDATE public.uploaded_datasets SET base_name = file_name WHERE base_name = '';

CREATE INDEX IF NOT EXISTS uploaded_datasets_base_name_idx
  ON public.uploaded_datasets (user_id, base_name, version DESC);