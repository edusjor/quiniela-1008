-- Add penalty winner fields and allow decimal points for predictions.
ALTER TABLE "Match"
ADD COLUMN "finalPenaltyWinnerIsHome" BOOLEAN;

ALTER TABLE "Prediction"
ADD COLUMN "predPenaltyWinnerIsHome" BOOLEAN,
ALTER COLUMN "points" TYPE DOUBLE PRECISION USING "points"::DOUBLE PRECISION;
