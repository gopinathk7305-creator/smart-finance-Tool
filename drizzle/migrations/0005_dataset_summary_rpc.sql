CREATE INDEX IF NOT EXISTS transactions_user_source_date_idx ON public.transactions (user_id, source_file, txn_date);
CREATE INDEX IF NOT EXISTS payroll_user_source_idx ON public.payroll_records (user_id, source_file);
CREATE INDEX IF NOT EXISTS arap_user_source_idx ON public.arap_records (user_id, source_file);

CREATE OR REPLACE FUNCTION public.dataset_summary(
  p_source_file text DEFAULT NULL,
  p_start date DEFAULT NULL,
  p_end date DEFAULT NULL
)
RETURNS TABLE (
  revenue numeric,
  expenses numeric,
  tax_deductions numeric,
  overdue_count integer,
  duplicate_count integer,
  txn_count integer,
  payroll_count integer,
  arap_count integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH t AS (
    SELECT * FROM public.transactions
    WHERE (p_source_file IS NULL OR source_file = p_source_file)
      AND (p_start IS NULL OR txn_date >= p_start)
      AND (p_end IS NULL OR txn_date <= p_end)
  ),
  dupes AS (
    SELECT SUM(c - 1)::int AS n FROM (
      SELECT COUNT(*) AS c FROM t GROUP BY txn_date, vendor_client, amount HAVING COUNT(*) > 1
    ) g
  ),
  p AS (
    SELECT * FROM public.payroll_records
    WHERE (p_source_file IS NULL OR source_file = p_source_file)
  ),
  a AS (
    SELECT * FROM public.arap_records
    WHERE (p_source_file IS NULL OR source_file = p_source_file)
      AND (p_start IS NULL OR COALESCE(invoice_date, due_date) >= p_start)
      AND (p_end IS NULL OR COALESCE(invoice_date, due_date) <= p_end)
  )
  SELECT
    COALESCE((SELECT SUM(amount) FROM t WHERE type = 'income'), 0),
    COALESCE((SELECT SUM(amount) FROM t WHERE type <> 'income'), 0),
    COALESCE((SELECT SUM(pf_deduction + tds_deduction) FROM p), 0),
    COALESCE((SELECT COUNT(*)::int FROM a WHERE status = 'outstanding'), 0),
    COALESCE((SELECT n FROM dupes), 0),
    (SELECT COUNT(*)::int FROM t),
    (SELECT COUNT(*)::int FROM p),
    (SELECT COUNT(*)::int FROM a)
$$;

GRANT EXECUTE ON FUNCTION public.dataset_summary(text, date, date) TO authenticated;