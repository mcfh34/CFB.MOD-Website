export const marketModelCalibration = {
  minimumWeek: 5,
  atsEdgeThreshold: 3,
  atsPositionThreshold: 2.5,
  totalEdgeThreshold: 4,
  totalRecommendationsEnabled: false,
  trainingSeasons: "2021–2024",
  holdoutSeason: 2025,
  trainingAtsAccuracy: 0.54333,
  holdoutAtsAccuracy: 0.60563,
  holdoutAtsPicks: 71,
  trainingTotalAccuracy: 0.53267,
  holdoutTotalAccuracy: 0.47899,
  holdoutTotalPicks: 119,
} as const;

export type MarketProjectionInput = {
  week: number;
  postseason?: boolean;
  homeTeam?: string;
  awayTeam?: string;
  modelHomeSpread: number;
  modelTotal: number;
  homeYpa: number;
  awayYpa: number;
  homeYpc: number;
  awayYpc: number;
  homeDefenseIndex: number;
  awayDefenseIndex: number;
  vegasSpread: number | null;
  vegasTotal: number | null;
  actualMargin?: number | null;
  actualTotal?: number | null;
};

const sign = (value: number) => value > 0 ? 1 : value < 0 ? -1 : 0;

export type TotalDiagnosticInput = {
  week: number;
  postseason?: boolean;
  modelTotal: number;
  vegasTotal: number | null;
  actualTotal?: number | null;
};

/**
 * Grades the frozen four-point O/U test even while public total recommendations
 * remain disabled. This keeps the validation ledger honest and visible without
 * presenting a failed holdout threshold as a supported betting recommendation.
 */
export function evaluateTotalDiagnostic(input: TotalDiagnosticInput) {
  const eligibleWeek = input.postseason || input.week >= marketModelCalibration.minimumWeek;
  const totalEdge = input.vegasTotal === null ? null : input.modelTotal - input.vegasTotal;
  const qualified = Boolean(
    eligibleWeek
    && totalEdge !== null
    && Math.abs(totalEdge) >= marketModelCalibration.totalEdgeThreshold,
  );
  const recommendation = !qualified || totalEdge === null ? "PASS" : totalEdge > 0 ? "OVER" : "UNDER";
  const actualTotalEdge = input.actualTotal === null || input.actualTotal === undefined || input.vegasTotal === null
    ? null
    : input.actualTotal - input.vegasTotal;
  const result = actualTotalEdge === null
    ? null
    : !qualified || totalEdge === null ? "PASS"
      : actualTotalEdge === 0 ? "PUSH"
        : sign(totalEdge) === sign(actualTotalEdge) ? "W" : "L";
  return { eligibleWeek, totalEdge, qualified, recommendation, result };
}

/**
 * Market decisions are intentionally selective. The score model still forecasts
 * every game, while an ATS pick needs independent position-unit confirmation
 * and at least three points of market separation. Total edges remain visible,
 * but strong total recommendations are paused because the frozen 2025 holdout
 * failed to clear 50% at the selected threshold.
 */
export function evaluateMarketProjection(input: MarketProjectionInput) {
  const eligibleWeek = input.postseason || input.week >= marketModelCalibration.minimumWeek;
  const spreadEdge = input.vegasSpread === null ? null : input.vegasSpread - input.modelHomeSpread;
  const totalEdge = input.vegasTotal === null ? null : input.modelTotal - input.vegasTotal;
  const totalDiagnostic = evaluateTotalDiagnostic(input);
  const positionScore =
    (input.homeYpa - input.awayYpa) / 0.75
    + (input.homeYpc - input.awayYpc) / 0.40
    + (input.awayDefenseIndex - input.homeDefenseIndex) / 0.06;
  const spreadQualified = Boolean(
    eligibleWeek
    && spreadEdge !== null
    && sign(spreadEdge) !== 0
    && Math.abs(spreadEdge) >= marketModelCalibration.atsEdgeThreshold
    && sign(spreadEdge) === sign(positionScore)
    && Math.abs(positionScore) >= marketModelCalibration.atsPositionThreshold,
  );
  const totalQualified = Boolean(
    marketModelCalibration.totalRecommendationsEnabled
    && totalDiagnostic.qualified,
  );
  const spreadRecommendation = !spreadQualified || spreadEdge === null
    ? "PASS"
    : spreadEdge > 0 ? `${input.homeTeam ?? "HOME"} ATS` : `${input.awayTeam ?? "AWAY"} ATS`;
  const totalRecommendation = !totalQualified || totalEdge === null
    ? "PASS"
    : totalEdge > 0 ? "OVER" : "UNDER";

  const atsActual = input.actualMargin === null || input.actualMargin === undefined || input.vegasSpread === null
    ? null
    : input.actualMargin + input.vegasSpread;
  const spreadResult = input.actualMargin === null || input.actualMargin === undefined || input.vegasSpread === null
    ? null
    : !spreadQualified || spreadEdge === null ? "PASS"
      : atsActual === 0 || spreadEdge === 0 ? "PUSH"
        : sign(spreadEdge) === sign(atsActual!) ? "W" : "L";
  const actualTotalEdge = input.actualTotal === null || input.actualTotal === undefined || input.vegasTotal === null
    ? null
    : input.actualTotal - input.vegasTotal;
  const totalResult = input.actualTotal === null || input.actualTotal === undefined || input.vegasTotal === null
    ? null
    : !totalQualified || totalEdge === null ? "PASS"
      : actualTotalEdge === 0 || totalEdge === 0 ? "PUSH"
        : sign(totalEdge) === sign(actualTotalEdge!) ? "W" : "L";

  return {
    eligibleWeek,
    spreadEdge,
    totalEdge,
    positionScore,
    spreadQualified,
    totalQualified,
    spreadRecommendation,
    totalRecommendation,
    spreadResult,
    totalResult,
    totalDiagnosticQualified: totalDiagnostic.qualified,
    totalDiagnosticRecommendation: totalDiagnostic.recommendation,
    totalDiagnosticResult: totalDiagnostic.result,
  };
}
