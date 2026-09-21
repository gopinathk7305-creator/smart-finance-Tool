CREATE TABLE public.dataset_monthly (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  source_file text NOT NULL,
  month_index int NOT NULL,
  month_label text NOT NULL,
  revenue numeric NOT NULL DEFAULT 0,
  expense numeric NOT NULL DEFAULT 0,
  profit numeric NOT NULL DEFAULT 0,
  cash numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source_file, month_index)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dataset_monthly TO authenticated;
GRANT ALL ON public.dataset_monthly TO service_role;

ALTER TABLE public.dataset_monthly ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own monthly rows select" ON public.dataset_monthly
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own monthly rows insert" ON public.dataset_monthly
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own monthly rows update" ON public.dataset_monthly
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own monthly rows delete" ON public.dataset_monthly
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE INDEX dataset_monthly_user_file_idx ON public.dataset_monthly (user_id, source_file, month_index);

-- Precompute Revenue vs Expense and the running cash balance for one dataset.
-- SECURITY INVOKER: RLS on transactions and dataset_monthly scopes every read
-- and write to the calling user.
CREATE OR REPLACE FUNCTION public.refresh_dataset_monthly(p_source_file text DEFAULT NULL)
RETURNS SETOF public.dataset_monthly
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_file text := COALESCE(p_source_file, '__all__');
BEGIN
  DELETE FROM public.dataset_monthly
   WHERE user_id = auth.uid() AND source_file = v_file;

  INSERT INTO public.dataset_monthly
    (user_id, source_file, month_index, month_label, revenue, expense, profit, cash)
  SELECT
    auth.uid(),
    v_file,
    m.idx,
    to_char(to_date(m.idx::text, 'MM'), 'Mon'),
    m.revenue,
    m.expense,
    m.revenue - m.expense,
    8500000 + SUM(m.revenue - m.expense) OVER (ORDER BY m.idx)
  FROM (
    SELECT
      g.idx,
      COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END), 0) AS revenue,
      COALESCE(SUM(CASE WHEN t.type <> 'income' THEN t.amount ELSE 0 END), 0) AS expense
    FROM generate_series(1, 12) AS g(idx)
    LEFT JOIN public.transactions t
      ON t.user_id = auth.uid()
     AND t.txn_date IS NOT NULL
     AND EXTRACT(MONTH FROM t.txn_date)::int = g.idx
     AND (p_source_file IS NULL OR t.source_file = p_source_file)
    GROUP BY g.idx
  ) m;

  RETURN QUERY
  SELECT * FROM public.dataset_monthly
   WHERE user_id = auth.uid() AND source_file = v_file
   ORDER BY month_index;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_dataset_monthly(text) TO authenticated;