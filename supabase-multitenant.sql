-- ============================================================
-- יומן עבודה — הפרדת נתונים דו-ישיבתית (multi-tenant)
-- הרץ פעם אחת ב-Supabase SQL Editor:
-- https://supabase.com/dashboard/project/kxbtskqobynewvnckaaz/sql
-- ============================================================

-- ── ראשון לציון ──
CREATE TABLE IF NOT EXISTS public.kv_rishon (
  key   TEXT PRIMARY KEY,
  value TEXT
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kv_rishon TO anon, authenticated, service_role;
ALTER TABLE public.kv_rishon ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kv_rishon_all ON public.kv_rishon;
CREATE POLICY kv_rishon_all ON public.kv_rishon FOR ALL USING (true) WITH CHECK (true);

-- ── רמת אביב ──
CREATE TABLE IF NOT EXISTS public.kv_ramataviv (
  key   TEXT PRIMARY KEY,
  value TEXT
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kv_ramataviv TO anon, authenticated, service_role;
ALTER TABLE public.kv_ramataviv ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kv_ramataviv_all ON public.kv_ramataviv;
CREATE POLICY kv_ramataviv_all ON public.kv_ramataviv FOR ALL USING (true) WITH CHECK (true);

-- ── שמירה על הנתונים הקיימים: העתק את טבלת kv הקיימת (ראשון לציון) ל-kv_rishon ──
-- (רץ רק אם קיימת טבלת kv ישנה; לא דורס נתונים קיימים ב-kv_rishon)
INSERT INTO public.kv_rishon (key, value)
SELECT key, value FROM public.kv
ON CONFLICT (key) DO NOTHING;

-- רמת אביב מתחילה ריקה (ישיבה חדשה) — אין מה להעתיק.
