-- CreateTable
CREATE TABLE "FinalistTeam" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "logoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinalistTeam_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinalistTeam_code_key" ON "FinalistTeam"("code");

-- Seed finalist teams from existing Team table, preserving IDs so existing picks remain valid.
INSERT INTO "FinalistTeam" ("id", "name", "code", "logoUrl", "createdAt")
SELECT "id", "name", "code", "logoUrl", "createdAt"
FROM "Team"
ON CONFLICT ("id") DO NOTHING;

-- Drop old foreign keys to Team
ALTER TABLE "FinalPick" DROP CONSTRAINT "FinalPick_finalist1TeamId_fkey";
ALTER TABLE "FinalPick" DROP CONSTRAINT "FinalPick_finalist2TeamId_fkey";
ALTER TABLE "FinalPick" DROP CONSTRAINT "FinalPick_championTeamId_fkey";

-- Add new foreign keys to FinalistTeam
ALTER TABLE "FinalPick" ADD CONSTRAINT "FinalPick_finalist1TeamId_fkey" FOREIGN KEY ("finalist1TeamId") REFERENCES "FinalistTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinalPick" ADD CONSTRAINT "FinalPick_finalist2TeamId_fkey" FOREIGN KEY ("finalist2TeamId") REFERENCES "FinalistTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinalPick" ADD CONSTRAINT "FinalPick_championTeamId_fkey" FOREIGN KEY ("championTeamId") REFERENCES "FinalistTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
