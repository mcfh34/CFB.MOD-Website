import { advancedMetricKeys, type AdvancedMetricKey, type AdvancedMetricValues, type AdvancedProfile } from "./advancedMetrics";
import { blendAdvancedProfiles } from "./advancedProfileBuilder";

export type MetricTuple = [number, number, number, number, number];

export type PreseasonTransitionProfile = {
  season: number;
  week: number;
  team: string;
  gamesPlayed: number;
  off: MetricTuple;
  def: MetricTuple;
  oi: MetricTuple;
  di: MetricTuple;
  advanced?: AdvancedProfile | null;
  preseasonElo?: number;
  transitionDiagnostic?: PreseasonTransitionDiagnostic;
};

export type PreseasonTransitionInput = {
  season: number;
  team: string;
  conference: string | null;
  returningPpa: number | null;
  returningPassingPpa: number | null;
  returningReceivingPpa: number | null;
  returningRushingPpa: number | null;
  returningUsage: number | null;
  returningPassingUsage: number | null;
  returningReceivingUsage: number | null;
  returningRushingUsage: number | null;
  recruitingRank: number | null;
  recruitingPoints: number | null;
};

export type PreseasonHistoryRow = {
  season: number;
  profile: PreseasonTransitionProfile;
  finalElo?: number | null;
};

export type PreseasonTransitionCoefficients = {
  meanReversion: number;
  programTargetWeight: number;
  continuityScale: number;
  replacementScale: number;
  eloResidualPersistence: number;
  eloResidualStabilityBonus: number;
  talentContinuityBuffer: number;
  rosterAdjustmentCap: number;
  stabilityDeviationScale: number;
  breakoutScale: number;
};

export type PreseasonTransitionDiagnostic = {
  team: string;
  season: number;
  historySeasons: number[];
  previousFinalPower: number;
  programCenterPower: number;
  programStability: number;
  returningProduction: number | null;
  returningProductionSignal: number;
  passingContinuitySignal: number;
  rushingContinuitySignal: number;
  recruitingRank: number | null;
  recruitingPoints: number | null;
  replacementSignal: number;
  overallRosterAdjustment: number;
  passingRosterAdjustment: number;
  rushingRosterAdjustment: number;
  meanReversionAdjustment: number;
  priorFinalElo: number;
  preseasonElo: number;
  eloAdjustment: number;
  finalPowerAdjustment: number;
  dataCoverage: "full" | "partial" | "fallback";
};

export type EloGame = {
  gameId: string;
  week: number;
  startDate: string | null;
  seasonType?: string;
  neutralSite: boolean | number;
  homeTeam: string;
  homePoints: number;
  awayTeam: string;
  awayPoints: number;
};

export const LEGACY_PRESEASON_WEIGHTS = [0.4, 0.3, 0.2, 0.1] as const;

/**
 * Selected only after the point-in-time historical calibration in
 * preseasonBacktest.ts. The debug endpoint reports development, validation,
 * and audit-only performance so this constant can be changed without changing
 * the transition architecture.
 */
export const PRESEASON_TRANSITION_V2: PreseasonTransitionCoefficients = {
  meanReversion: 0.28,
  programTargetWeight: 0.85,
  continuityScale: 0.035,
  replacementScale: 0.026,
  eloResidualPersistence: 0,
  eloResidualStabilityBonus: 0.2,
  talentContinuityBuffer: 0.35,
  rosterAdjustmentCap: 0.045,
  stabilityDeviationScale: 0.12,
  breakoutScale: 0.16,
};

const PPA_KEYS = new Set<AdvancedMetricKey>(["ppa", "rushingPpa", "passingPpa", "standardDownPpa", "passingDownPpa"]);
const INVERSE_KEYS = new Set<AdvancedMetricKey>(["stuffRate", "havocRate", "frontSevenHavoc", "dbHavoc", "penaltyYards"]);
const PASSING_KEYS = new Set<AdvancedMetricKey>([
  "completionRate", "yardsPerCompletion", "passingSuccessRate", "passingExplosiveness", "passingPpa",
  "standardDownSuccessRate", "standardDownExplosiveness", "standardDownPpa",
  "passingDownSuccessRate", "passingDownExplosiveness", "passingDownPpa",
]);
const RUSHING_KEYS = new Set<AdvancedMetricKey>([
  "lineYards", "secondLevelYards", "openFieldYards", "stuffRate", "powerSuccess",
  "rushingSuccessRate", "rushingExplosiveness", "rushingPpa",
]);

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
const finite = (value: number | null | undefined): value is number => value !== null && value !== undefined && Number.isFinite(value);

function finiteAverage(values: Array<number | null | undefined>) {
  const rows = values.filter(finite);
  return rows.length ? rows.reduce((sum, value) => sum + value, 0) / rows.length : null;
}

function weightedAverage(rows: Array<{ value: number; weight: number }>, fallback = 0) {
  const valid = rows.filter((row) => Number.isFinite(row.value) && row.weight > 0);
  const weight = valid.reduce((sum, row) => sum + row.weight, 0);
  return weight ? valid.reduce((sum, row) => sum + row.value * row.weight, 0) / weight : fallback;
}

function weightedStandardDeviation(rows: Array<{ value: number; weight: number }>, center: number) {
  const valid = rows.filter((row) => Number.isFinite(row.value) && row.weight > 0);
  const weight = valid.reduce((sum, row) => sum + row.weight, 0);
  return weight ? Math.sqrt(valid.reduce((sum, row) => sum + row.weight * (row.value - center) ** 2, 0) / weight) : 0;
}

function centeredPercentile<T extends { team: string }>(rows: T[], accessor: (row: T) => number | null) {
  const values = rows.map((row) => ({ team: row.team, value: accessor(row) }))
    .filter((row): row is { team: string; value: number } => finite(row.value));
  const ordered = [...values].sort((left, right) => right.value - left.value || left.team.localeCompare(right.team));
  const output = new Map<string, number>();
  if (ordered.length < 2) return output;
  for (let start = 0; start < ordered.length;) {
    let end = start;
    while (end + 1 < ordered.length && Math.abs(ordered[end + 1].value - ordered[start].value) < 1e-10) end += 1;
    const percentile = 1 - ((start + end) / 2) / (ordered.length - 1);
    for (let index = start; index <= end; index += 1) output.set(ordered[index].team, percentile * 2 - 1);
    start = end + 1;
  }
  return output;
}

export function preseasonProfilePower(profile: Pick<PreseasonTransitionProfile, "oi" | "di">) {
  const offense = Math.exp(profile.oi.slice(0, 3).reduce((sum, value) => sum + Math.log(Math.max(0.05, value)), 0) / 3);
  const defense = Math.exp(profile.di.slice(0, 3).reduce((sum, value) => sum + Math.log(Math.max(0.05, value)), 0) / 3);
  return Math.log(offense) - Math.log(defense);
}

export function legacyPreseasonElo(profile: Pick<PreseasonTransitionProfile, "oi" | "di">, scale = 420) {
  return 1500 + clamp(preseasonProfilePower(profile) * scale, -240, 240);
}

function rawFromIndex(key: AdvancedMetricKey, baseline: number | null, index: number | null) {
  if (!finite(baseline) || !finite(index) || index <= 0) return null;
  if (PPA_KEYS.has(key)) return baseline + Math.log(index);
  if (INVERSE_KEYS.has(key)) return baseline / index;
  return baseline * index;
}

function programMetricCenter(history: PreseasonHistoryRow[], accessor: (profile: PreseasonTransitionProfile) => number) {
  const weights = [0.55, 0.3, 0.15];
  return weightedAverage(history.slice(1, 4).map((row, index) => ({ value: accessor(row.profile), weight: weights[index] ?? 0 })), 0);
}

function programState(history: PreseasonHistoryRow[], coefficients: PreseasonTransitionCoefficients) {
  const prior = history[0]?.profile;
  if (!prior) return { centerPower: 0, stability: 0, coverage: 0 };
  const older = history.slice(1, 4);
  if (!older.length) return { centerPower: 0, stability: 0, coverage: 0 };
  const weights = [0.55, 0.3, 0.15];
  const rows = older.map((row, index) => ({ value: preseasonProfilePower(row.profile), weight: weights[index] ?? 0 }));
  const centerPower = weightedAverage(rows);
  const deviation = weightedStandardDeviation(rows, centerPower);
  const coverage = Math.min(1, older.length / 3);
  const consistency = Math.exp(-0.5 * (deviation / coefficients.stabilityDeviationScale) ** 2);
  // Only a positive one-year jump is treated as a breakout penalty. A strong
  // program's single poor season therefore receives a measured pull back toward
  // its established level, while a one-year breakout has to re-prove itself.
  const positiveBreakout = Math.max(0, preseasonProfilePower(prior) - centerPower);
  const breakoutPenalty = Math.exp(-positiveBreakout / coefficients.breakoutScale);
  return {
    centerPower,
    stability: clamp(coverage * (0.35 + 0.65 * consistency) * breakoutPenalty, 0, 1),
    coverage,
  };
}

function transitionLogMetric(
  prior: number,
  programCenter: number,
  stability: number,
  rosterAdjustment: number,
  coefficients: PreseasonTransitionCoefficients,
  styleMetric = false,
) {
  const priorLog = Math.log(Math.max(0.05, prior));
  const centerLog = Math.log(Math.max(0.05, programCenter));
  const structuralTarget = coefficients.programTargetWeight * stability * centerLog;
  const rate = coefficients.meanReversion * (styleMetric ? 0.35 : 1);
  return Math.exp(priorLog + rate * (structuralTarget - priorLog) + (styleMetric ? 0 : rosterAdjustment));
}

function rosterAdjustment(
  continuity: number,
  replacement: number,
  coefficients: PreseasonTransitionCoefficients,
  continuityAvailable = true,
) {
  // Recruiting is replacement capacity, not an independent brand bonus. When
  // no returning-production observation exists there is no measured vacancy
  // for recruiting to replace, so the supported roster adjustment is zero.
  if (!continuityAvailable) return 0;
  const continuityLevel = (continuity + 1) / 2;
  const replacementNeed = 1 - continuityLevel;
  const buffer = continuity < 0 ? coefficients.talentContinuityBuffer * Math.max(0, replacement) * replacementNeed : 0;
  const continuityComponent = coefficients.continuityScale * continuity * (1 - buffer);
  const replacementComponent = coefficients.replacementScale * replacement * replacementNeed;
  return clamp(continuityComponent + replacementComponent, -coefficients.rosterAdjustmentCap, coefficients.rosterAdjustmentCap);
}

function transitionAdvanced(
  prior: AdvancedProfile | null | undefined,
  older: PreseasonHistoryRow[],
  stability: number,
  adjustments: { overall: number; passing: number; rushing: number },
  coefficients: PreseasonTransitionCoefficients,
) {
  if (!prior) return null;
  const side = (sideName: "offense" | "defense") => {
    const index = Object.fromEntries(advancedMetricKeys.map((key) => {
      const priorValue = prior[sideName].index[key];
      if (!finite(priorValue) || priorValue <= 0) return [key, null];
      const olderValues = older.slice(1, 4).map((row) => row.profile.advanced?.[sideName].index[key] ?? null).filter(finite);
      const programCenter = olderValues.length
        ? Math.exp(olderValues.reduce((sum, value) => sum + Math.log(Math.max(0.05, value)), 0) / olderValues.length)
        : 1;
      const signal = PASSING_KEYS.has(key) ? adjustments.passing : RUSHING_KEYS.has(key) ? adjustments.rushing : adjustments.overall;
      const signedSignal = sideName === "offense" ? signal : -signal * 0.8;
      return [key, clamp(transitionLogMetric(priorValue, programCenter, stability, signedSignal, coefficients), 0.55, 1.65)];
    })) as AdvancedMetricValues;
    const raw = Object.fromEntries(advancedMetricKeys.map((key) => [key, rawFromIndex(key, prior.baseline[key], index[key])])) as AdvancedMetricValues;
    return { raw, index };
  };
  return {
    ...prior,
    offense: side("offense"),
    defense: side("defense"),
  } satisfies AdvancedProfile;
}

export function buildPreseasonStateTransition(args: {
  season: number;
  teams: Iterable<string>;
  historyByTeam: Map<string, PreseasonHistoryRow[]>;
  inputs: PreseasonTransitionInput[];
  baselines: MetricTuple;
  coefficients?: PreseasonTransitionCoefficients;
}) {
  const coefficients = args.coefficients ?? PRESEASON_TRANSITION_V2;
  const inputs = args.inputs.filter((input) => input.season === args.season);
  const inputByTeam = new Map(inputs.map((input) => [input.team, input]));
  const overallPercentile = centeredPercentile(inputs, (input) => input.returningPpa ?? input.returningUsage);
  const passingPercentile = centeredPercentile(inputs, (input) => finiteAverage([
    input.returningPassingPpa, input.returningReceivingPpa, input.returningPassingUsage, input.returningReceivingUsage,
  ]) ?? input.returningPpa ?? input.returningUsage);
  const rushingPercentile = centeredPercentile(inputs, (input) => finiteAverage([
    input.returningRushingPpa, input.returningRushingUsage,
  ]) ?? input.returningPpa ?? input.returningUsage);
  const replacementPercentile = centeredPercentile(inputs, (input) => input.recruitingPoints ?? (input.recruitingRank === null ? null : -input.recruitingRank));

  const profiles: PreseasonTransitionProfile[] = [];
  for (const team of args.teams) {
    const history = [...(args.historyByTeam.get(team) ?? [])]
      .filter((row) => row.season < args.season)
      .sort((left, right) => right.season - left.season)
      .slice(0, 4);
    const prior = history[0]?.profile;
    const input = inputByTeam.get(team);
    if (!prior) {
      profiles.push({
        season: args.season, week: 0, team, gamesPlayed: 0,
        off: [...args.baselines], def: [...args.baselines], oi: [1, 1, 1, 1, 1], di: [1, 1, 1, 1, 1], advanced: null,
        preseasonElo: 1500,
        transitionDiagnostic: {
          team, season: args.season, historySeasons: [], previousFinalPower: 0, programCenterPower: 0, programStability: 0,
          returningProduction: input ? finiteAverage([input.returningPpa, input.returningUsage]) : null,
          returningProductionSignal: 0, passingContinuitySignal: 0, rushingContinuitySignal: 0,
          recruitingRank: input?.recruitingRank ?? null, recruitingPoints: input?.recruitingPoints ?? null, replacementSignal: 0,
          overallRosterAdjustment: 0, passingRosterAdjustment: 0, rushingRosterAdjustment: 0, meanReversionAdjustment: 0,
          priorFinalElo: 1500, preseasonElo: 1500, eloAdjustment: 0, finalPowerAdjustment: 0, dataCoverage: "fallback",
        },
      });
      continue;
    }

    const state = programState(history, coefficients);
    const overallReturning = input ? finiteAverage([input.returningPpa, input.returningUsage]) : null;
    const passingReturning = input ? finiteAverage([
      input.returningPassingPpa, input.returningReceivingPpa, input.returningPassingUsage, input.returningReceivingUsage,
    ]) ?? overallReturning : null;
    const rushingReturning = input ? finiteAverage([input.returningRushingPpa, input.returningRushingUsage]) ?? overallReturning : null;
    const overallSignal = overallPercentile.get(team) ?? 0;
    const passingSignal = passingPercentile.get(team) ?? overallSignal;
    const rushingSignal = rushingPercentile.get(team) ?? overallSignal;
    const replacementSignal = replacementPercentile.get(team) ?? 0;
    const overallAdjustment = rosterAdjustment(overallSignal, replacementSignal, coefficients, overallReturning !== null);
    const passingAdjustment = rosterAdjustment(passingSignal, replacementSignal, coefficients, passingReturning !== null);
    const rushingAdjustment = rosterAdjustment(rushingSignal, replacementSignal, coefficients, rushingReturning !== null);
    const programCenter = (tuple: "oi" | "di", index: number) => {
      const logCenter = programMetricCenter(history, (profile) => Math.log(Math.max(0.05, profile[tuple][index])));
      return Math.exp(logCenter);
    };
    const oi = prior.oi.map((value, index) => transitionLogMetric(
      value,
      programCenter("oi", index),
      state.stability,
      index === 1 ? passingAdjustment : index === 2 ? rushingAdjustment : overallAdjustment,
      coefficients,
      index >= 3,
    )) as MetricTuple;
    const di = prior.di.map((value, index) => transitionLogMetric(
      value,
      programCenter("di", index),
      state.stability,
      -overallAdjustment * 0.8,
      coefficients,
      index >= 3,
    )) as MetricTuple;
    const off = oi.map((value, index) => args.baselines[index] * value) as MetricTuple;
    const def = di.map((value, index) => args.baselines[index] * value) as MetricTuple;
    const next: PreseasonTransitionProfile = {
      season: args.season,
      week: 0,
      team,
      gamesPlayed: 0,
      off,
      def,
      oi,
      di,
      advanced: transitionAdvanced(prior.advanced, history, state.stability, {
        overall: overallAdjustment,
        passing: passingAdjustment,
        rushing: rushingAdjustment,
      }, coefficients),
    };
    const priorProfileElo = legacyPreseasonElo(prior);
    const transitionedProfileElo = legacyPreseasonElo(next);
    const priorFinalElo = finite(history[0]?.finalElo) ? Number(history[0].finalElo) : priorProfileElo;
    // Elo carries only result information that was not already represented by
    // the prior statistical profile. The transitioned profile supplies the new
    // season's base Elo, preventing statistical mean reversion and roster
    // adjustment from being applied a second time through the Elo channel.
    const priorResultResidual = clamp(priorFinalElo - priorProfileElo, -120, 120);
    const eloResidualPersistence = clamp(
      coefficients.eloResidualPersistence + coefficients.eloResidualStabilityBonus * state.stability,
      0,
      0.9,
    );
    const preseasonElo = clamp(transitionedProfileElo + eloResidualPersistence * priorResultResidual, 1260, 1780);
    next.preseasonElo = preseasonElo;
    const priorPower = preseasonProfilePower(prior);
    const nextPower = preseasonProfilePower(next);
    const rosterPower = 0.4 * overallAdjustment + 0.3 * passingAdjustment + 0.3 * rushingAdjustment + 0.8 * overallAdjustment;
    next.transitionDiagnostic = {
      team,
      season: args.season,
      historySeasons: history.map((row) => row.season),
      previousFinalPower: priorPower,
      programCenterPower: state.centerPower,
      programStability: state.stability,
      returningProduction: overallReturning,
      returningProductionSignal: overallSignal,
      passingContinuitySignal: passingSignal,
      rushingContinuitySignal: rushingSignal,
      recruitingRank: input?.recruitingRank ?? null,
      recruitingPoints: input?.recruitingPoints ?? null,
      replacementSignal,
      overallRosterAdjustment: overallAdjustment,
      passingRosterAdjustment: passingAdjustment,
      rushingRosterAdjustment: rushingAdjustment,
      meanReversionAdjustment: nextPower - priorPower - rosterPower,
      priorFinalElo,
      preseasonElo,
      eloAdjustment: preseasonElo - priorFinalElo,
      finalPowerAdjustment: nextPower - priorPower,
      dataCoverage: history.length >= 4 && overallReturning !== null && (input?.recruitingRank !== null || input?.recruitingPoints !== null) ? "full" : "partial",
    };
    profiles.push(next);
  }
  return profiles;
}

function legacyRosterSignals(inputs: PreseasonTransitionInput[]) {
  return {
    overall: centeredPercentile(inputs, (input) => input.returningPpa ?? input.returningUsage),
    passing: centeredPercentile(inputs, (input) => finiteAverage([
      input.returningPassingPpa, input.returningReceivingPpa, input.returningPassingUsage, input.returningReceivingUsage,
    ]) ?? input.returningPpa ?? input.returningUsage),
    rushing: centeredPercentile(inputs, (input) => finiteAverage([
      input.returningRushingPpa, input.returningRushingUsage,
    ]) ?? input.returningPpa ?? input.returningUsage),
    recruiting: centeredPercentile(inputs, (input) => input.recruitingPoints ?? (input.recruitingRank === null ? null : -input.recruitingRank)),
  };
}

const LEGACY_OFFENSE_ADVANCED_KEYS = new Set<AdvancedMetricKey>([
  "lineYards", "secondLevelYards", "openFieldYards", "completionRate", "yardsPerCompletion", "passingSuccessRate", "passingExplosiveness",
]);

function legacyAdjustedAdvanced(
  profile: AdvancedProfile | null,
  passingProof: number,
  rushingProof: number,
  defenseProof: number,
  passingMultiplier: number,
  rushingMultiplier: number,
  defenseMultiplier: number,
) {
  if (!profile) return null;
  const offenseIndex = { ...profile.offense.index };
  for (const key of LEGACY_OFFENSE_ADVANCED_KEYS) {
    const value = offenseIndex[key];
    if (!finite(value)) continue;
    const proof = PASSING_KEYS.has(key) ? passingProof : rushingProof;
    const multiplier = PASSING_KEYS.has(key) ? passingMultiplier : rushingMultiplier;
    offenseIndex[key] = clamp(Math.exp(Math.log(Math.max(0.55, value)) * proof) * multiplier, 0.72, 1.38);
  }
  const defenseIndex = Object.fromEntries(advancedMetricKeys.map((key) => {
    const value = profile.defense.index[key];
    return [key, finite(value) ? clamp(Math.exp(Math.log(Math.max(0.55, value)) * defenseProof) * defenseMultiplier, 0.72, 1.38) : null];
  })) as AdvancedMetricValues;
  const offenseRaw = Object.fromEntries(advancedMetricKeys.map((key) => [key, rawFromIndex(key, profile.baseline[key], offenseIndex[key])])) as AdvancedMetricValues;
  const defenseRaw = Object.fromEntries(advancedMetricKeys.map((key) => [key, rawFromIndex(key, profile.baseline[key], defenseIndex[key])])) as AdvancedMetricValues;
  return { ...profile, offense: { raw: offenseRaw, index: offenseIndex }, defense: { raw: defenseRaw, index: defenseIndex } } satisfies AdvancedProfile;
}

/** Exact 40/30/20/10 plus proof-factor implementation retained for backtests. */
export function buildLegacyPreseasonProfiles(args: {
  season: number;
  teams: Iterable<string>;
  historyByTeam: Map<string, PreseasonHistoryRow[]>;
  inputs: PreseasonTransitionInput[];
  baselines: MetricTuple;
  eloScale?: number;
}) {
  const inputs = args.inputs.filter((input) => input.season === args.season);
  const signals = legacyRosterSignals(inputs);
  const profiles: PreseasonTransitionProfile[] = [];
  for (const team of args.teams) {
    const history = [...(args.historyByTeam.get(team) ?? [])].filter((row) => row.season < args.season).sort((a, b) => b.season - a.season).slice(0, 4);
    const weightedTuple = (key: "off" | "def" | "oi" | "di", fallback: MetricTuple) => fallback.map((fallbackValue, metric) => {
      const rows = history.map((row) => ({ value: row.profile[key][metric], weight: LEGACY_PRESEASON_WEIGHTS[args.season - row.season - 1] ?? 0 })).filter((row) => row.weight > 0);
      return weightedAverage(rows, fallbackValue);
    }) as MetricTuple;
    const overall = signals.overall.get(team) ?? 0;
    const passing = signals.passing.get(team) ?? overall;
    const rushing = signals.rushing.get(team) ?? overall;
    const recruit = signals.recruiting.get(team) ?? 0;
    const normalized = (value: number) => (value + 1) / 2;
    const proof = [0.86 + 0.09 * normalized(overall) + 0.05 * normalized(recruit), 0.84 + 0.11 * normalized(passing) + 0.05 * normalized(recruit), 0.84 + 0.11 * normalized(rushing) + 0.05 * normalized(recruit), 1, 1];
    const defenseProof = 0.88 + 0.04 * normalized(overall) + 0.08 * normalized(recruit);
    const offenseMultipliers = [Math.exp(0.035 * overall + 0.012 * recruit), Math.exp(0.055 * passing + 0.012 * recruit), Math.exp(0.055 * rushing + 0.012 * recruit), 1, 1];
    const defenseMultiplier = Math.exp(-0.015 * recruit);
    const regress = (value: number, confidence: number) => Math.exp(Math.log(Math.max(0.55, value)) * confidence);
    const baseOi = weightedTuple("oi", [1, 1, 1, 1, 1]);
    const baseDi = weightedTuple("di", [1, 1, 1, 1, 1]);
    const oi = baseOi.map((value, index) => clamp(regress(value, proof[index]) * offenseMultipliers[index], 0.72, 1.38)) as MetricTuple;
    const di = baseDi.map((value, index) => clamp(regress(value, index < 3 ? defenseProof : 1) * (index < 3 ? defenseMultiplier : 1), 0.72, 1.38)) as MetricTuple;
    const blendedAdvanced=blendAdvancedProfiles(history.flatMap((row) => {
      const profile = row.profile.advanced;
      const weight = Number(LEGACY_PRESEASON_WEIGHTS[args.season - row.season - 1] ?? 0);
      return profile && weight > 0 ? [{ profile, weight }] : [];
    }));
    const profile: PreseasonTransitionProfile = {
      season: args.season, week: 0, team, gamesPlayed: 0,
      off: oi.map((value, index) => args.baselines[index] * value) as MetricTuple,
      def: di.map((value, index) => args.baselines[index] * value) as MetricTuple,
      oi, di,
      advanced: legacyAdjustedAdvanced(blendedAdvanced,proof[1],proof[2],defenseProof,offenseMultipliers[1],offenseMultipliers[2],defenseMultiplier),
    };
    profile.preseasonElo = legacyPreseasonElo(profile, args.eloScale ?? 420);
    profiles.push(profile);
  }
  return profiles;
}

/**
 * Result-only final Elo. It is intentionally independent of the statistical
 * preseason profile. The new preseason Elo therefore transitions once from
 * last season's result state instead of being rebuilt from an already-regressed
 * statistical state.
 */
export function calculateFinalEloRatings(games: EloGame[], teams: Iterable<string>, eloK = 24) {
  const allTeams = new Set([...teams, ...games.flatMap((game) => [game.homeTeam, game.awayTeam])]);
  const ratings = new Map([...allTeams].map((team) => [team, 1500]));
  const phase = (game: EloGame) => game.seasonType === "postseason" ? 1 : 0;
  for (const game of [...games].sort((left, right) => phase(left) - phase(right) || left.week - right.week || String(left.startDate).localeCompare(String(right.startDate)) || left.gameId.localeCompare(right.gameId))) {
    const homeRating = ratings.get(game.homeTeam) ?? 1500;
    const awayRating = ratings.get(game.awayTeam) ?? 1500;
    const homeField = game.neutralSite ? 0 : 45;
    const expectedHome = 1 / (1 + 10 ** ((awayRating - homeRating - homeField) / 400));
    const actualHome = game.homePoints === game.awayPoints ? 0.5 : game.homePoints > game.awayPoints ? 1 : 0;
    const margin = Math.abs(game.homePoints - game.awayPoints);
    const multiplier = clamp(Math.log(margin + 1) * (2.2 / (Math.abs(homeRating + homeField - awayRating) * 0.001 + 2.2)), 1, 2.25);
    const adjustment = eloK * multiplier * (actualHome - expectedHome);
    ratings.set(game.homeTeam, homeRating + adjustment);
    ratings.set(game.awayTeam, awayRating - adjustment);
  }
  return ratings;
}

export function preseasonTransitionCandidateGrid() {
  const candidates: PreseasonTransitionCoefficients[] = [];
  for (const meanReversion of [0.12, 0.28, 0.44, 0.6]) {
    for (const programTargetWeight of [0.65, 0.85]) {
      for (const [continuityScale, replacementScale] of [[0.018, 0.012], [0.035, 0.026]] as const) {
        for (const eloResidualPersistence of [0, 0.4, 0.75]) {
          candidates.push({
            ...PRESEASON_TRANSITION_V2,
            meanReversion,
            programTargetWeight,
            continuityScale,
            replacementScale,
            eloResidualPersistence,
          });
        }
      }
    }
  }
  return candidates;
}
