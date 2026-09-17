CREATE INDEX IF NOT EXISTS budget_user_source_idx ON public.budget_targets (user_id, source_file);
CREATE INDEX IF NOT EXISTS uploaded_datasets_user_file_idx ON public.uploaded_datasets (user_id, file_name);

CREATE OR REPLACE FUNCTION public.purge_dataset_batch(p_table text, p_source_file text, p_org_id uuid DEFAULT NULL, p_limit integer DEFAULT 5000)
RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_deleted integer := 0;
BEGIN
  IF p_table NOT IN ('transactions', 'payroll_records', 'budget_targets', 'arap_records') THEN
    RAISE EXCEPTION 'Unsupported table %', p_table;
  END IF;

  EXECUTE format(
    'WITH doomed AS (
       SELECT id FROM public.%I
       WHERE user_id = auth.uid()
         AND source_file = $1
         AND ($2::uuid IS NULL OR org_id = $2::uuid)
       LIMIT $3
     )
     DELETE FROM public.%I t USING doomed d WHERE t.id = d.id', p_table, p_table)
  USING p_source_file, p_org_id, p_limit;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.purge_dataset_batch(text, text, uuid, integer) TO authenticated;