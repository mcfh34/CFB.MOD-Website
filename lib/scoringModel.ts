import type { AdvancedProfile, AdvancedSideProjection } from "./advancedMetrics";
import type { OffensiveViability } from "./offensiveViability";

export type ScoringModelInput = {
  ypp: number;
  ypa: number;
  ypc: number;
  passAttempts: number;
  rushAttempts: number;
  scoringProjection?: number | null;
};

export type PossessionFeatureName =
  | "driveAnchor"
  | "scoringAnchor"
  | "efficiency"
  | "explosiveness"
  | "finishing"
  | "protection"
  | "fieldPosition"
  | "viability"
  | "runPassBalance"
  | "dataQuality";

export type PossessionFeatures = Record<PossessionFeatureName, number>;

export type ScoreModelContribution = {
  id: PossessionFeatureName;
  label: string;
  standardizedValue: number;
  pointsPerPossession: number;
};

/**
 * A score receipt is deliberately possession based. No displayed line is an
 * independent point deduction; every signal enters the single regularized
 * points-per-possession model once.
 */
export type PossessionScoreReceipt = {
  expectedPossessions: number;
  expectedPointsPerPossession: number;
  rawExpectedPoints: number;
  finalExpectedPoints: number;
  features: PossessionFeatures;
  contributions: ScoreModelContribution[];
  viability: OffensiveViability;
  warnings: string[];
};

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
const average = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
const finite = (value: number | null | undefined, fallback: number) => Number.isFinite(value) ? Number(value) : fallback;
const ratio = (value: number | null | undefined, baseline: number | null | undefined) => {
  const denominator = finite(baseline, 1);
  return denominator === 0 ? 1 : finite(value, denominator) / denominator;
};

/** Retained only as the transparent simple power-rating baseline. */
export const scoringModelCoefficients = {
  intercept: -15.44927,
  scoringProjection: 0.33234,
  expectedYards: 0.06270,
  expectedYardsSquared: -0.04965,
  ypp: 3.64554,
  passShare: -7.30533,
} as const;

export function scoringModelFeatures(input: ScoringModelInput) {
  const passAttempts = Math.max(0, Number(input.passAttempts) || 0);
  const rushAttempts = Math.max(0, Number(input.rushAttempts) || 0);
  const plays = Math.max(1, passAttempts + rushAttempts);
  const ypp = Math.max(0, Number(input.ypp) || 0);
  const expectedYards = ypp * plays;
  return {
    scoringProjection: Number.isFinite(input.scoringProjection) ? Number(input.scoringProjection) : 27,
    expectedYards,
    expectedYardsSquared: expectedYards ** 2 / 1000,
    ypp,
    passShare: passAttempts / plays,
  };
}

/**
 * Simple frozen comparison model. Attempts receive no standalone points and
 * matter only through productive yards and pass/run mix.
 */
export function estimatePoints(input: ScoringModelInput) {
  const features = scoringModelFeatures(input);
  const value = scoringModelCoefficients.intercept
    + scoringModelCoefficients.scoringProjection * features.scoringProjection
    + scoringModelCoefficients.expectedYards * features.expectedYards
    + scoringModelCoefficients.expectedYardsSquared * features.expectedYardsSquared
    + scoringModelCoefficients.ypp * features.ypp
    + scoringModelCoefficients.passShare * features.passShare;
  return Math.max(0, value);
}

const featureOrder: PossessionFeatureName[] = [
  "driveAnchor", "scoringAnchor", "efficiency", "explosiveness", "finishing",
  "protection", "fieldPosition", "viability", "runPassBalance", "dataQuality",
];

const featureLabels: Record<PossessionFeatureName, string> = {
  driveAnchor: "Drive production",
  scoringAnchor: "Scoring baseline",
  efficiency: "Down-to-down efficiency",
  explosiveness: "Explosive-play matchup",
  finishing: "Drive finishing",
  protection: "Protection and passing downs",
  fieldPosition: "Field position",
  viability: "Offensive viability interaction",
  runPassBalance: "Run/pass fallback",
  dataQuality: "Sample reliability",
};

/** Ridge-selected on 2021–2024 team-games; 2025 remained untouched. */
export const possessionModel = {
  trainingSeasons: "2021–2024",
  holdoutSeason: 2025,
  minimumWeek: 5,
  ridgeLambda: 40,
  pointsPerPossession: {
    intercept: 2.26768,
    coefficients: {
      driveAnchor: -0.10597,
      scoringAnchor: 0.31038,
      efficiency: 0.25925,
      explosiveness: 0.01102,
      finishing: -0.02957,
      protection: 0.11106,
      fieldPosition: -0.00001,
      viability: 0.03945,
      runPassBalance: 0.03984,
      dataQuality: -0.01243,
    } satisfies Record<PossessionFeatureName, number>,
    means: {
      driveAnchor: 2.53952,
      scoringAnchor: 2.31919,
      efficiency: -0.02226,
      explosiveness: -0.01005,
      finishing: -0.01831,
      protection: -0.02029,
      fieldPosition: 0.00529,
      viability: 0.39151,
      runPassBalance: -0.08161,
      dataQuality: 0.85315,
    } satisfies Record<PossessionFeatureName, number>,
    deviations: {
      driveAnchor: 0.66026,
      scoringAnchor: 0.56801,
      efficiency: 0.10497,
      explosiveness: 0.09208,
      finishing: 0.09146,
      protection: 0.15420,
      fieldPosition: 0.16878,
      viability: 0.20134,
      runPassBalance: 0.13489,
      dataQuality: 0.18755,
    } satisfies Record<PossessionFeatureName, number>,
  },
  total: {
    intercept: 54.19688,
    coefficients: { rawTotal: 5.45371, possessions: -0.34563, explosiveness: 0.56571, viability: -0.40552 },
    means: { rawTotal: 54.27935, possessions: 12.00504, explosiveness: -0.01005, viability: 0.39151 },
    deviations: { rawTotal: 7.92682, possessions: 0.95084, explosiveness: 0.06741, viability: 0.12505 },
  },
  margin: {
    intercept: 2.58979,
    coefficients: { rawMargin: 6.34574, outcomeMargin: 4.34035, proofGap: 1.01674, homeField: 0.66560 },
    means: { rawMargin: 0.16429, outcomeMargin: 1.55572, proofGap: 0.00201, homeField: 0.90307 },
    deviations: { rawMargin: 9.68395, outcomeMargin: 5.18116, proofGap: 0.13171, homeField: 0.29586 },
  },
} as const;

export function expectedPossessions(
  home: { passAttempts: number; rushAttempts: number; advanced: AdvancedSideProjection | null },
  away: { passAttempts: number; rushAttempts: number; advanced: AdvancedSideProjection | null },
) {
  const implied = (side: typeof home) => {
    const plays = clamp(side.passAttempts + side.rushAttempts, 48, 88);
    const playsPerDrive = clamp(finite(side.advanced?.overall.playsPerDrive, 5.85), 4.2, 8.2);
    return plays / playsPerDrive;
  };
  // Both teams share the same game-level possession environment. Averaging
  // prevents one offense's pace from being counted twice in the total.
  return clamp((implied(home) + implied(away)) / 2, 8.5, 15.5);
}

export function buildPossessionFeatures(
  projection: AdvancedSideProjection | null,
  profile: AdvancedProfile | null,
  possessions: number,
  viability: OffensiveViability,
  simpleBaselinePoints = 27,
): PossessionFeatures {
  if (!projection || !profile) {
    const scoringAnchor = clamp(simpleBaselinePoints / Math.max(1, possessions), 0.45, 5.4);
    return {
      driveAnchor: scoringAnchor,
      scoringAnchor,
      efficiency: 0,
      explosiveness: 0,
      finishing: 0,
      protection: 0,
      fieldPosition: 0,
      viability: viability.risk,
      runPassBalance: 0,
      dataQuality: 0,
    };
  }
  const baseline = profile.baseline;
  const efficiency = average([
    Math.log(clamp(ratio(projection.overall.yardsPerPlay, baseline.yardsPerPlay), 0.55, 1.65)),
    Math.log(clamp(ratio(projection.overall.successRate, baseline.successRate), 0.55, 1.65)),
    finite(projection.overall.ppa, finite(baseline.ppa, 0.18)) - finite(baseline.ppa, 0.18),
  ]);
  const explosiveness = average([
    Math.log(clamp(ratio(projection.overall.explosiveness, baseline.explosiveness), 0.55, 1.75)),
    Math.log(clamp(ratio(projection.pass.passingExplosiveness, baseline.passingExplosiveness), 0.55, 1.75)),
    Math.log(clamp(ratio(projection.run.rushingExplosiveness, baseline.rushingExplosiveness), 0.55, 1.75)),
  ]);
  const finishing = average([
    Math.log(clamp(ratio(projection.overall.thirdDownSuccessRate, baseline.thirdDownSuccessRate), 0.55, 1.65)),
    Math.log(clamp(ratio(projection.overall.redZoneEfficiency, baseline.redZoneEfficiency), 0.65, 1.45)),
  ]);
  const protection = average([
    Math.log(clamp(ratio(baseline.havocRate, projection.overall.havocRate), 0.55, 1.75)),
    Math.log(clamp(ratio(projection.pass.passingDownSuccessRate, baseline.passingDownSuccessRate), 0.55, 1.65)),
  ]);
  const runPassBalance = Math.min(
    Math.log(clamp(ratio(projection.run.rushingSuccessRate, baseline.rushingSuccessRate), 0.55, 1.65)),
    Math.log(clamp(ratio(projection.pass.passingSuccessRate, baseline.passingSuccessRate), 0.55, 1.65)),
  );
  const fieldPosition = (
    finite(projection.specialTeams.fieldPosition, finite(baseline.fieldPosition, 25)) - finite(baseline.fieldPosition, 25)
  ) / 10 + finite(projection.specialTeams.hiddenYards, 0) / 100;
  const pointsPerDrive = finite(projection.overall.pointsPerDrive, finite(baseline.pointsPerDrive, 2.45));
  const scoringPoints = finite(projection.scoringPoints, finite(profile.offense.raw.pointsPerGame, simpleBaselinePoints));
  return {
    driveAnchor: clamp(pointsPerDrive, 0.45, 5.4),
    scoringAnchor: clamp(scoringPoints / Math.max(1, possessions), 0.45, 5.4),
    efficiency,
    explosiveness,
    finishing,
    protection,
    fieldPosition: clamp(fieldPosition, -1.5, 1.5),
    viability: viability.risk,
    runPassBalance,
    dataQuality: clamp(profile.coverage.advancedGames / 8, 0, 1),
  };
}

export function predictPointsPerPossession(features: PossessionFeatures) {
  const model = possessionModel.pointsPerPossession;
  return clamp(model.intercept + featureOrder.reduce((sum, id) => (
    sum + model.coefficients[id] * (features[id] - model.means[id]) / model.deviations[id]
  ), 0), 0.2, 5.8);
}

export function buildPossessionScoreReceipt(
  projection: AdvancedSideProjection | null,
  profile: AdvancedProfile | null,
  possessions: number,
  viability: OffensiveViability,
  simpleBaselinePoints = 27,
): PossessionScoreReceipt {
  const features = buildPossessionFeatures(projection, profile, possessions, viability, simpleBaselinePoints);
  const model = possessionModel.pointsPerPossession;
  const contributions = featureOrder.map((id) => {
    const standardizedValue = (features[id] - model.means[id]) / model.deviations[id];
    return { id, label: featureLabels[id], standardizedValue, pointsPerPossession: standardizedValue * model.coefficients[id] };
  });
  const expectedPointsPerPossession = predictPointsPerPossession(features);
  const rawExpectedPoints = expectedPointsPerPossession * possessions;
  const warnings: string[] = [];
  if (rawExpectedPoints < 3) warnings.push("Sub-three-point offense requires elite defensive evidence and should be reviewed.");
  if (possessions < 9.2 && (projection?.overall.playsPerDrive ?? 6) < 5.2) warnings.push("Fast-play profile conflicts with an unusually low possession estimate.");
  return { expectedPossessions: possessions, expectedPointsPerPossession, rawExpectedPoints, finalExpectedPoints: rawExpectedPoints, features, contributions, viability, warnings };
}

function standardizedPrediction(
  model: { intercept: number; coefficients: Record<string, number>; means: Record<string, number>; deviations: Record<string, number> },
  values: Record<string, number>,
) {
  return model.intercept + Object.keys(model.coefficients).reduce((sum, key) => (
    sum + model.coefficients[key] * (values[key] - model.means[key]) / model.deviations[key]
  ), 0);
}

/** Separate total layer: tempo and shared game environment are only counted once. */
export function calibrateGameTotal(home: PossessionScoreReceipt, away: PossessionScoreReceipt) {
  return Math.max(0, standardizedPrediction(possessionModel.total, {
    rawTotal: home.rawExpectedPoints + away.rawExpectedPoints,
    possessions: home.expectedPossessions,
    explosiveness: average([home.features.explosiveness, away.features.explosiveness]),
    viability: average([home.features.viability, away.features.viability]),
  }));
}

/** Separate margin layer: scoring, outcome strength and resume proof each enter once. */
export function calibrateGameMargin(rawMargin: number, outcomeMargin: number, proofGap: number, neutral: boolean) {
  return standardizedPrediction(possessionModel.margin, {
    rawMargin,
    outcomeMargin,
    proofGap,
    homeField: neutral ? 0 : 1,
  });
}

export function projectionGuardrails(homePoints: number, awayPoints: number, possessions: number, marketTotal: number | null = null) {
  const total = homePoints + awayPoints;
  const warnings: string[] = [];
  if (total < 20) warnings.push("Low total: both offenses project near the historical bottom tail.");
  if (homePoints < 3 || awayPoints < 3) warnings.push("One offense projects below three points; verify defensive evidence and data completeness.");
  if (homePoints < 10 && awayPoints < 10) warnings.push("Both offenses project below ten points, an exceptionally rare FBS outcome.");
  if (possessions < 9) warnings.push("Very low expected possession count materially suppresses this total.");
  if (marketTotal !== null && Math.abs(total - marketTotal) >= 14) warnings.push("Large market disagreement requires a clear matchup explanation.");
  return warnings;
}

export const scoringModelValidation = {
  trainingSeasons: possessionModel.trainingSeasons,
  holdoutSeason: possessionModel.holdoutSeason,
  minimumWeek: possessionModel.minimumWeek,
  holdoutGames: 613,
  holdoutScoreMae: 8.82974,
  legacyHoldoutScoreMae: 10.57430,
  holdoutMarginMae: 12.15447,
  legacyHoldoutMarginMae: 12.36703,
  holdoutTotalMae: 12.63082,
  legacyHoldoutTotalMae: 17.59629,
  holdoutBrier: 0.18833,
  legacyHoldoutBrier: 0.18896,
  projectedAverageTotal: 53.10211,
  actualAverageTotal: 52.18271,
  legacyAverageTotal: 41.27992,
  projectedBelowTwenty: 0,
  legacyBelowTwenty: 0.05873,
  totalRecommendationsEnabled: false,
  totalRecommendationReason: "The 2025 holdout total-edge sample won 47.9%; totals remain informational until a later holdout validates the threshold.",
} as const;

export const validationBySeason = [
  { season: 2021, previousScoreMae:11.16740, currentScoreMae:9.27665, previousTotalMae:18.35592, currentTotalMae:12.89366, previousSpreadMae:13.51093, currentSpreadMae:13.17907, actualAverageTotal:55.43894, currentAverageTotal:53.82954 },
  { season: 2022, previousScoreMae:10.49610, currentScoreMae:9.10120, previousTotalMae:16.91247, currentTotalMae:13.18595, previousSpreadMae:12.67112, currentSpreadMae:12.19732, actualAverageTotal:53.79329, currentAverageTotal:54.77896 },
  { season: 2023, previousScoreMae:11.04243, currentScoreMae:9.20516, previousTotalMae:17.64505, currentTotalMae:12.69936, previousSpreadMae:13.57386, currentSpreadMae:13.06719, actualAverageTotal:53.60069, currentAverageTotal:54.44678 },
  { season: 2024, previousScoreMae:11.08151, currentScoreMae:9.08689, previousTotalMae:18.19547, currentTotalMae:13.05157, previousSpreadMae:12.59613, currentSpreadMae:12.33599, actualAverageTotal:53.98179, currentAverageTotal:53.83349 },
  { season: 2025, previousScoreMae:10.57430, currentScoreMae:8.82974, previousTotalMae:17.59629, currentTotalMae:12.63082, previousSpreadMae:12.36703, currentSpreadMae:12.15447, actualAverageTotal:52.18271, currentAverageTotal:53.10211 },
] as const;

export const holdoutBaselineComparison = [
  { model:"Previous v14",scoreMae:10.57430,spreadMae:12.36703,totalMae:17.59629,straightUp:0.70636,brier:0.18896 },
  { model:"Possession v15",scoreMae:8.82974,spreadMae:12.15447,totalMae:12.63082,straightUp:0.69494,brier:0.18833 },
  { model:"Simple rating",scoreMae:9.03525,spreadMae:12.67402,totalMae:12.69337,straightUp:0.70147,brier:0.19789 },
  { model:"Closing market",scoreMae:null,spreadMae:11.74062,totalMae:12.39070,straightUp:null,brier:null },
] as const;

export const holdoutProjectionDistribution = {
  projected:{averageTotal:53.10211,below20:0,below30:0,below40:0.00326,below50:0.30179,below60:0.89233,below70:1,shutouts:0,oneScore:0.57749,blowouts:0.05546},
  actual:{averageTotal:52.18271,below20:0.00816,below30:0.07341,below40:0.22023,below50:0.46982,below60:0.70473,below70:0.84666,shutouts:0.02121,oneScore:0.39478,blowouts:0.31811},
} as const;

export const holdoutMarketCalibration = {
  ats:{training:{wins:163,losses:137,pushes:8,passed:2003,accuracy:0.54333},holdout:{wins:43,losses:28,pushes:0,passed:542,accuracy:0.60563}},
  totals:{training:{wins:375,losses:329,pushes:13,passed:1492,accuracy:0.53267},holdout:{wins:57,losses:62,pushes:0,passed:494,accuracy:0.47899}},
} as const;
