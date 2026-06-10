export const EXACT_SCORE_POINTS = 3;
export const CORRECT_WINNER_POINTS = 1;

export function calcPoints(
  predHome: number,
  predAway: number,
  finalHome: number,
  finalAway: number
) {
  if (predHome === finalHome && predAway === finalAway) return EXACT_SCORE_POINTS;

  const predDiff = predHome - predAway;
  const finalDiff = finalHome - finalAway;

  // If either prediction or final result is a draw, there is no winner to compare.
  if (predDiff === 0 || finalDiff === 0) return 0;

  const sameWinner =
    (predDiff > 0 && finalDiff > 0) ||
    (predDiff < 0 && finalDiff < 0);

  return sameWinner ? CORRECT_WINNER_POINTS : 0;
}
