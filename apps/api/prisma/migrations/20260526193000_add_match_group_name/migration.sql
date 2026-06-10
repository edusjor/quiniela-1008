-- Add an optional group label to matches so admin can create/edit grouped fixtures.
ALTER TABLE "Match"
ADD COLUMN "groupName" VARCHAR(64);
