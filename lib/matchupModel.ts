import { baselines, modelCalibration } from "../app/modelData";
import { advancedMetricKeys, projectAdvancedSide, type AdvancedProfile, type AdvancedProfileSide } from "./advancedMetrics";
import { assessOffensiveViability } from "./offensiveViability";
import {
  buildPossessionScoreReceipt,
  calibrateGameMargin,
  calibrateGameTotal,
  estimatePoints,
  expectedPossessions,
  projectionGuardrails,
} from "./scoringModel";

export type MatchupEvidence = {
  gamesPlayed: number;
  scheduleStrength: number;
  bestOpponentStrength: number;
  qualityWinStrength: number;
  reliability: number;
};

export type MatchupTeamInput = {
  offense: readonly number[];
  defense: readonly number[];
  evidence?: MatchupEvidence | null;
  advanced?: AdvancedProfile | null;
};

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
const average = (values: readonly number[]) => values.reduce((sum, value) => sum + Number(value), 0) / Math.max(1, values.length);

function weightedTop(values: readonly number[], weights: readonly number[]) {
  const ordered = [...values].sort((a, b) => b - a).slice(0, weights.length);
  if (!ordered.length) return 0;
  const used = weights.slice(0, ordered.length);
  return ordered.reduce((sum, value, index) => sum + value * used[index], 0) / used.reduce((sum, value) => sum + value, 0);
}

export const preseasonMatchupEvidence: MatchupEvidence = {
  gamesPlayed: 0,
  scheduleStrength: 0.5,
  bestOpponentStrength: 0.5,
  qualityWinStrength: 0.35,
  reliability: 0.72,
};

/**
 * Converts the opponents a team has actually faced into a confidence level for
 * translating its efficiency to a new opponent. Conference labels and roster
 * brand are intentionally absent: the proof comes only from the connected
 * results network, the strongest opponents, and quality wins.
 */
export function buildMatchupEvidence(
  opponentStrengths: readonly number[],
  winStrengths: readonly number[],
  gamesPlayed = opponentStrengths.length,
): MatchupEvidence {
  const games = Math.max(0, gamesPlayed);
  if (!games || !opponentStrengths.length) return { ...preseasonMatchupEvidence, gamesPlayed: games };

  const normalizedOpponents = opponentStrengths.map((value) => clamp(Number(value), 0, 1));
  const normalizedWins = winStrengths.map((value) => clamp(Number(value), 0, 1));
  const bestOpponentStrength = weightedTop(normalizedOpponents, [0.55, 0.3, 0.15]);
  const averageOpponentStrength = average(normalizedOpponents);
  const scheduleStrength = 0.68 * bestOpponentStrength + 0.32 * averageOpponentStrength;
  const qualityWinStrength = normalizedWins.length ? weightedTop(normalizedWins, [0.6, 0.25, 0.15]) : 0;
  const sampleMaturity = clamp(games / 8, 0, 1);
  const scheduleProof = clamp((scheduleStrength - 0.22) / 0.62, 0, 1);

  // A mature team that has only played a closed weak network retains a wide
  // uncertainty band. One or more credible opponents/wins raises confidence
  // quickly, regardless of conference membership.
  const reliability = clamp(
    0.28 + 0.18 * sampleMaturity + 0.44 * scheduleProof + 0.1 * qualityWinStrength,
    modelCalibration.matchupEvidenceFloor,
    0.98,
  );

  return { gamesPlayed: games, scheduleStrength, bestOpponentStrength, qualityWinStrength, reliability };
}

function validatedIndex(value: number, evidence: MatchupEvidence, favorable: boolean) {
  const safe = clamp(Number(value) || 1, 0.45, 1.8);
  const weakSchedule = clamp((modelCalibration.matchupProofTarget - evidence.scheduleStrength) / modelCalibration.matchupProofTarget, 0, 1);
  const favorablePenalty = favorable ? 0.16 * weakSchedule * (1 - evidence.qualityWinStrength) : 0;
  const validation = clamp(evidence.reliability - favorablePenalty, modelCalibration.matchupEvidenceFloor, 1);
  return Math.exp(Math.log(safe) * validation);
}

function validateAdvancedSide(side: AdvancedProfileSide, evidence: MatchupEvidence, defense: boolean): AdvancedProfileSide {
  return {
    raw: { ...side.raw },
    index: Object.fromEntries(advancedMetricKeys.map((key) => {
      const metric = side.index[key];
      if (metric === null || !Number.isFinite(metric)) return [key, null];
      return [key, validatedIndex(metric, evidence, defense ? metric < 1 : metric > 1)];
    })) as AdvancedProfileSide["index"],
  };
}

function validateAdvancedProfile(profile: AdvancedProfile | null | undefined, evidence: MatchupEvidence): AdvancedProfile | null {
  if (!profile) return null;
  const completionCoverage = clamp(
    profile.coverage.completionGames / Math.max(4, profile.coverage.advancedGames),
    0.35,
    1,
  );
  const completionMetrics = new Set(["completionRate", "yardsPerCompletion"]);
  const stabilizeCompletionMetrics = (side:AdvancedProfileSide) => ({
    ...side,
    index:Object.fromEntries(Object.entries(side.index).map(([key, metric]) => [
      key,
      metric === null || !completionMetrics.has(key) ? metric : Math.exp(Math.log(metric) * completionCoverage),
    ])) as AdvancedProfileSide["index"],
  });
  return {
    ...profile,
    baseline: { ...profile.baseline },
    offense: stabilizeCompletionMetrics(validateAdvancedSide(profile.offense, evidence, false)),
    defense: stabilizeCompletionMetrics(validateAdvancedSide(profile.defense, evidence, true)),
    coverage: { ...profile.coverage },
  };
}

/**
 * Uses a conservative, schedule-aware translation of a team's profile. Good
 * offense (>1) and good defense (<1) need proof; weaknesses are not erased as
 * aggressively. Volume is mostly retained because pace is less opponent-led.
 */
export function validateMatchupProfile(team: MatchupTeamInput) {
  const evidence = team.evidence ?? preseasonMatchupEvidence;
  const passVolumeReliability = clamp((Number(team.offense[3] ?? 1) - 0.45) / 0.55, 0.55, 1);
  const passDefenseVolumeReliability = clamp((Number(team.defense[3] ?? 1) - 0.45) / 0.55, 0.55, 1);
  const selectivePassReliability = passVolumeReliability * passVolumeReliability;
  const selectivePassDefenseReliability = passDefenseVolumeReliability * passDefenseVolumeReliability;
  const offense = team.offense.map((value, index) => {
    if (index >= 3) return Math.exp(Math.log(clamp(Number(value) || 1, 0.45, 1.8)) * (0.82 + 0.18 * evidence.reliability));
    const validated = validatedIndex(value, evidence, Number(value) > 1);
    // Option and service-academy passing games often post a high YPA on a very
    // small, play-action-heavy sample. Preserve the advantage, but do not
    // treat 10–15 selective throws as equally repeatable as a full passing
    // workload against a new opponent.
    return index === 1 && Number(value) > 1 ? Math.exp(Math.log(validated) * selectivePassReliability) : validated;
  });
  const defense = team.defense.map((value, index) => {
    if (index >= 3) return Math.exp(Math.log(clamp(Number(value) || 1, 0.45, 1.8)) * (0.82 + 0.18 * evidence.reliability));
    const validated = validatedIndex(value, evidence, Number(value) < 1);
    return index === 1 && Number(value) < 1 ? Math.exp(Math.log(validated) * selectivePassDefenseReliability) : validated;
  });
  return { offense, defense, evidence, advanced: validateAdvancedProfile(team.advanced, evidence) };
}

export function projectCalibratedMatchup(
  home: MatchupTeamInput,
  away: MatchupTeamInput,
  neutral: boolean,
  homeOutcomeRating?: number,
  awayOutcomeRating?: number,
) {
  const calibratedHome = validateMatchupProfile(home);
  const calibratedAway = validateMatchupProfile(away);
  const side = (
    offense: readonly number[],
    defense: readonly number[],
    offenseAdvanced: AdvancedProfile | null,
    defenseAdvanced: AdvancedProfile | null,
  ) => {
    const directYpa = baselines.ypa * Number(offense[1] ?? 1) * Number(defense[1] ?? 1);
    const directYpc = baselines.ypc * Number(offense[2] ?? 1) * Number(defense[2] ?? 1);
    const advanced = projectAdvancedSide(offenseAdvanced, defenseAdvanced, directYpc, directYpa, baselines.ypc, baselines.ypa);
    const ypa = advanced?.pass.adjustedYpa ?? directYpa;
    const ypc = advanced?.run.adjustedYpc ?? directYpc;
    const patt = baselines.patt * Number(offense[3] ?? 1) * Number(defense[3] ?? 1);
    const ratt = baselines.ratt * Number(offense[4] ?? 1) * Number(defense[4] ?? 1);
    const ypp = (ypa * patt + ypc * ratt) / Math.max(1, patt + ratt);
    const baseScore = estimatePoints({
      ypp,
      ypa,
      ypc,
      passAttempts: patt,
      rushAttempts: ratt,
      scoringProjection: advanced?.scoringPoints,
    });
    return {
      ypa,
      ypc,
      patt,
      ratt,
      ypp,
      baseScore,
      advanced,
    };
  };

  const homeStats = side(calibratedHome.offense, calibratedAway.defense, calibratedHome.advanced, calibratedAway.advanced);
  const awayStats = side(calibratedAway.offense, calibratedHome.defense, calibratedAway.advanced, calibratedHome.advanced);
  const possessions = expectedPossessions(
    { passAttempts: homeStats.patt, rushAttempts: homeStats.ratt, advanced: homeStats.advanced },
    { passAttempts: awayStats.patt, rushAttempts: awayStats.ratt, advanced: awayStats.advanced },
  );
  const homeViability = assessOffensiveViability(homeStats.advanced);
  const awayViability = assessOffensiveViability(awayStats.advanced);
  const homeReceipt = buildPossessionScoreReceipt(homeStats.advanced, calibratedHome.advanced, possessions, homeViability, homeStats.baseScore);
  const awayReceipt = buildPossessionScoreReceipt(awayStats.advanced, calibratedAway.advanced, possessions, awayViability, awayStats.baseScore);
  const homeField = neutral ? 0 : modelCalibration.homeFieldAdvantage;
  const statisticalMargin = homeReceipt.rawExpectedPoints - awayReceipt.rawExpectedPoints;
  const hasOutcomeRatings = Number.isFinite(homeOutcomeRating) && Number.isFinite(awayOutcomeRating);
  const outcomeMargin = hasOutcomeRatings
    ? (Number(homeOutcomeRating) - Number(awayOutcomeRating)) / modelCalibration.eloPointsPerPoint + homeField
    : statisticalMargin;
  const weakestEvidence = Math.min(calibratedHome.evidence.reliability, calibratedAway.evidence.reliability);
  const evidenceGap = Math.abs(calibratedHome.evidence.reliability - calibratedAway.evidence.reliability);
  const outcomeBlend = hasOutcomeRatings
    ? clamp(modelCalibration.outcomeBlend + 0.2 * (1 - weakestEvidence) + 0.1 * evidenceGap, modelCalibration.outcomeBlend, modelCalibration.matchupOutcomeBlendCeiling)
    : 0;
  const proofScore = (evidence: MatchupEvidence) =>
    0.4 * evidence.scheduleStrength
    + 0.2 * evidence.bestOpponentStrength
    + 0.25 * evidence.qualityWinStrength
    + 0.15 * evidence.reliability;
  const proofAdjustment = modelCalibration.matchupProofMarginWeight
    * (proofScore(calibratedHome.evidence) - proofScore(calibratedAway.evidence));
  const proofGap = proofScore(calibratedHome.evidence) - proofScore(calibratedAway.evidence);
  const total = calibrateGameTotal(homeReceipt, awayReceipt);
  const unboundedMargin = calibrateGameMargin(statisticalMargin, outcomeMargin, proofGap, neutral);
  // This is only a mathematical coherence guard: the regression remains the
  // source of the margin and total, but it cannot assign a negative team score.
  const margin = clamp(unboundedMargin, -Math.max(1, total - 1), Math.max(1, total - 1));
  const homeScore = total / 2 + margin / 2;
  const awayScore = total / 2 - margin / 2;
  homeReceipt.finalExpectedPoints = homeScore;
  awayReceipt.finalExpectedPoints = awayScore;
  const viabilityVolatility = 2.2 * Math.max(homeViability.risk, awayViability.risk);
  const volatility = 11.8 + viabilityVolatility + Math.abs(average(calibratedHome.offense.slice(0, 3)) - average(calibratedAway.offense.slice(0, 3))) * 2;
  const homeWinProbability = 1 / (1 + Math.exp(-margin / 11.8));
  const warnings = projectionGuardrails(homeScore, awayScore, possessions);

  return {
    homeScore,
    awayScore,
    margin,
    homeWinProbability,
    modelHomeSpread: -margin,
    modelTotal: homeScore + awayScore,
    homeStats: { ...homeStats, score: homeScore, scoreReceipt: homeReceipt, viability: homeViability },
    awayStats: { ...awayStats, score: awayScore, scoreReceipt: awayReceipt, viability: awayViability },
    calibratedHome,
    calibratedAway,
    statisticalMargin,
    outcomeMargin,
    outcomeBlend,
    proofAdjustment,
    proofGap,
    possessions,
    volatility,
    warnings,
  };
}
