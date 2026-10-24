-- J2D Answer Practice activation migration
-- Run once in Supabase SQL Editor. Safe to rerun.
-- This makes the workbook's four question sheets available in the dedicated Answer Practice page.

ALTER TABLE public.question_answers
  ADD COLUMN IF NOT EXISTS integrity_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS typing_seconds integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS answer_version integer NOT NULL DEFAULT 1;

-- Import existing workbook questions into the separate practice bank.
-- Reference answers remain in the admin-only question_reference_answers table.
WITH source_questions AS (
  SELECT DISTINCT ON (
      CASE s.slug
        WHEN 'sql-v1' THEN 'SQL'
        WHEN 'pyspark-v0' THEN 'PySpark'
        WHEN 'databricks-v0' THEN 'Databricks'
        WHEN 'adf-skill-proficiency' THEN 'ADF'
      END,
      btrim(r.data->>'Question')
  )
    CASE s.slug
      WHEN 'sql-v1' THEN 'SQL'
      WHEN 'pyspark-v0' THEN 'PySpark'
      WHEN 'databricks-v0' THEN 'Databricks'
      WHEN 'adf-skill-proficiency' THEN 'ADF'
    END AS domain,
    COALESCE(NULLIF(btrim(r.data->>'Category'), ''), 'General') AS category,
    COALESCE(NULLIF(btrim(r.data->>'#'), ''), r.source_row::text) AS question_number,
    COALESCE(NULLIF(btrim(r.data->>'Level'), ''), 'Intermediate') AS difficulty,
    btrim(r.data->>'Question') AS question_text,
    r.sort_order
  FROM public.workbook_rows r
  JOIN public.workbook_sheets s ON s.id = r.sheet_id
  WHERE s.slug IN ('sql-v1', 'pyspark-v0', 'databricks-v0', 'adf-skill-proficiency')
    AND r.view_type = 'table'
    AND NULLIF(btrim(r.data->>'Question'), '') IS NOT NULL
  ORDER BY
    CASE s.slug
      WHEN 'sql-v1' THEN 'SQL'
      WHEN 'pyspark-v0' THEN 'PySpark'
      WHEN 'databricks-v0' THEN 'Databricks'
      WHEN 'adf-skill-proficiency' THEN 'ADF'
    END,
    btrim(r.data->>'Question'),
    r.sort_order
)
INSERT INTO public.question_bank
  (title, domain, difficulty, question_text, is_published)
SELECT
  domain || ' · ' || category || ' · Question ' || question_number,
  domain,
  CASE WHEN lower(difficulty) = 'unspecified' THEN 'Intermediate' ELSE difficulty END,
  question_text,
  true
FROM source_questions sq
WHERE NOT EXISTS (
  SELECT 1
  FROM public.question_bank existing
  WHERE existing.domain = sq.domain
    AND btrim(existing.question_text) = sq.question_text
);

-- Verify imported question counts by domain after running:
-- SELECT domain, count(*) AS published_questions
-- FROM public.question_bank
-- WHERE is_published
-- GROUP BY domain
-- ORDER BY domain;
