ALTER TABLE "League" ALTER COLUMN "tournamentId" DROP NOT NULL;
ALTER TABLE "Match" ALTER COLUMN "tournamentId" DROP NOT NULL;

ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "leagueId" TEXT;

CREATE INDEX IF NOT EXISTS "Match_leagueId_kickoffAt_idx" ON "Match"("leagueId", "kickoffAt");

INSERT INTO "Match" (
  "id",
  "tournamentId",
  "leagueId",
  "homeTeamId",
  "awayTeamId",
  "kickoffAt",
  "lockAt",
  "finalHome",
  "finalAway",
  "createdAt"
)
SELECT
  CONCAT(l."id", '_migrated_', m."id"),
  l."tournamentId",
  l."id",
  m."homeTeamId",
  m."awayTeamId",
  m."kickoffAt",
  m."lockAt",
  m."finalHome",
  m."finalAway",
  m."createdAt"
FROM "League" l
JOIN "Match" m ON m."tournamentId" = l."tournamentId"
LEFT JOIN "Match" existing
  ON existing."leagueId" = l."id"
 AND existing."homeTeamId" = m."homeTeamId"
 AND existing."awayTeamId" = m."awayTeamId"
 AND existing."kickoffAt" = m."kickoffAt"
WHERE existing."id" IS NULL;

UPDATE "Prediction" p
SET "matchId" = migrated."id"
FROM "League" l,
     "Match" old_match,
     "Match" migrated
WHERE p."leagueId" = l."id"
  AND p."matchId" = old_match."id"
  AND old_match."tournamentId" = l."tournamentId"
  AND migrated."leagueId" = l."id"
  AND migrated."homeTeamId" = old_match."homeTeamId"
  AND migrated."awayTeamId" = old_match."awayTeamId"
  AND migrated."kickoffAt" = old_match."kickoffAt"
  AND migrated."id" <> old_match."id";