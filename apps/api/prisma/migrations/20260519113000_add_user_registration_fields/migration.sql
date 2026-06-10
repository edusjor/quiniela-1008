-- Registration now requires personal profile fields and purchase proof.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "fullName" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "nationalId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "birthDate" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "purchaseProofImage" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "followsInstagram" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS "User_nationalId_key" ON "User"("nationalId");
