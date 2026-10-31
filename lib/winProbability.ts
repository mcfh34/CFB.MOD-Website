/** A single margin-to-probability scale fitted on 2021–24 Week 5+ FBS games. */
export const winProbabilityCalibration = {
  marginScale: 8,
  rosterUncertaintyScale: 2,
  trainingSeasons: "2021–2024",
  diagnosticSeason: 2025,
  minimumWeek: 5,
} as const;

export function calibratedHomeWinProbability(margin: number, rosterUncertainty = 0) {
  const scale = winProbabilityCalibration.marginScale
    + winProbabilityCalibration.rosterUncertaintyScale * Math.max(0, rosterUncertainty);
  return 1 / (1 + Math.exp(-margin / scale));
}
