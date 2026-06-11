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

  if (predDiff === 0 && finalDiff === 0) return CORRECT_WINNER_POINTS;
  if (predDiff === 0 || finalDiff === 0) return 0;

  const sameWinner =
    (predDiff > 0 && finalDiff > 0) ||
    (predDiff < 0 && finalDiff < 0);

  return sameWinner ? CORRECT_WINNER_POINTS : 0;
}
