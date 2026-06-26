export const EXACT_SCORE_POINTS = 3;
export const CORRECT_WINNER_POINTS = 1;
export const EXACT_DRAW_WITH_PENALTIES_POINTS = 3.5;
export const DRAW_WITH_PENALTIES_POINTS = 1.5;

function isDraw(home: number, away: number) {
  return home === away;
}

export function calcPoints(
  predHome: number,
  predAway: number,
  finalHome: number,
  finalAway: number,
  predPenaltyWinnerIsHome?: boolean | null,
  finalPenaltyWinnerIsHome?: boolean | null
) {
  const exactScore = predHome === finalHome && predAway === finalAway;
  const predIsDraw = isDraw(predHome, predAway);
  const finalIsDraw = isDraw(finalHome, finalAway);
  const hasCorrectPenaltyWinner =
    predIsDraw &&
    finalIsDraw &&
    predPenaltyWinnerIsHome !== null &&
    predPenaltyWinnerIsHome !== undefined &&
    finalPenaltyWinnerIsHome !== null &&
    finalPenaltyWinnerIsHome !== undefined &&
    predPenaltyWinnerIsHome === finalPenaltyWinnerIsHome;

  if (exactScore) {
    return hasCorrectPenaltyWinner ? EXACT_DRAW_WITH_PENALTIES_POINTS : EXACT_SCORE_POINTS;
  }

  const predDiff = predHome - predAway;
  const finalDiff = finalHome - finalAway;

  if (predDiff === 0 && finalDiff === 0) {
    return hasCorrectPenaltyWinner ? DRAW_WITH_PENALTIES_POINTS : CORRECT_WINNER_POINTS;
  }

  if (predDiff === 0 || finalDiff === 0) return 0;

  const sameWinner =
    (predDiff > 0 && finalDiff > 0) ||
    (predDiff < 0 && finalDiff < 0);

  return sameWinner ? CORRECT_WINNER_POINTS : 0;
}
