-- Add league ownership to team catalog so each quiniela has isolated teams.
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "leagueId" TEXT;

-- Replace global unique code with per-league unique code.
DROP INDEX IF EXISTS "Team_code_key";
CREATE INDEX IF NOT EXISTS "Team_leagueId_name_idx" ON "Team"("leagueId", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "Team_leagueId_code_key" ON "Team"("leagueId", "code");

-- Link team to league.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Team_leagueId_fkey'
  ) THEN
    ALTER TABLE "Team"
    ADD CONSTRAINT "Team_leagueId_fkey"
    FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
