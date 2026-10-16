-- Sources skipped for quota on the last run (e.g. YouTube), so the score is shown as incomplete
-- ("more opinions coming") instead of "not enough talk", and re-read after the quota resets.
ALTER TABLE "Title" ADD COLUMN "missingSources" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Titles already scored without any YouTube data (most were scored while the quota was used up):
-- mark them and re-read them just after Google's next reset (midnight Pacific).
UPDATE "Title"
SET "missingSources" = ARRAY['YOUTUBE'],
    "nextRefreshAt" = ((date_trunc('day', now() AT TIME ZONE 'America/Los_Angeles') + interval '1 day 5 minutes') AT TIME ZONE 'America/Los_Angeles')
WHERE "scoreState" IN ('INSUFFICIENT', 'EARLY')
  AND cardinality("youtubeVideoIds") = 0
  AND NOT (COALESCE("sourceCounts", '{}'::jsonb) ? 'YOUTUBE');
