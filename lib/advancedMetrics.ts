export const advancedMetricKeys = [
  "pointsPerGame",
  "yardsPerPlay",
  "successRate",
  "explosiveness",
  "ppa",
  "pointsPerDrive",
  "playsPerDrive",
  "lineYards",
  "secondLevelYards",
  "openFieldYards",
  "stuffRate",
  "powerSuccess",
  "rushingSuccessRate",
  "rushingExplosiveness",
  "rushingPpa",
  "completionRate",
  "yardsPerCompletion",
  "passingSuccessRate",
  "passingExplosiveness",
  "passingPpa",
  "standardDownSuccessRate",
  "standardDownExplosiveness",
  "standardDownPpa",
  "passingDownSuccessRate",
  "passingDownExplosiveness",
  "passingDownPpa",
  "havocRate",
  "frontSevenHavoc",
  "dbHavoc",
  "thirdDownSuccessRate",
  "redZoneEfficiency",
  "fieldPosition",
  "netPunting",
  "puntReturn",
  "kickReturn",
  "hiddenYards",
  "turnoverMargin",
  "penaltyYards",
] as const;

export type AdvancedMetricKey = (typeof advancedMetricKeys)[number];
export type AdvancedMetricValues = Record<AdvancedMetricKey, number | null>;

export type AdvancedProfileSide = {
  raw: AdvancedMetricValues;
  index: AdvancedMetricValues;
};

export type AdvancedProfile = {
  source: "cfbd-advanced";
  rushingDefinition: "line-and-open-field-proxy";
  passingDefinition: "box-score-and-cfbd-proxy";
  baseline: AdvancedMetricValues;
  offense: AdvancedProfileSide;
  defense: AdvancedProfileSide;
  coverage: {
    advancedGames: number;
    completionGames: number;
  };
};

export type AdvancedRunProjection = {
  lineYards: number | null;
  secondLevelYards: number | null;
  openFieldYards: number | null;
  yardsBeyondLine: number | null;
  stuffRate: number | null;
  powerSuccess: number | null;
  rushingSuccessRate: number | null;
  rushingExplosiveness: number | null;
  rushingPpa: number | null;
  trenchIndex: number | null;
  secondLevelIndex: number | null;
  componentIndex: number | null;
  directYpc: number;
  adjustedYpc: number;
  adjustment: number;
};

export type AdvancedPassProjection = {
  completionRate: number | null;
  yardsPerCompletion: number | null;
  passingSuccessRate: number | null;
  passingExplosiveness: number | null;
  passingPpa: number | null;
  standardDownSuccessRate: number | null;
  standardDownExplosiveness: number | null;
  standardDownPpa: number | null;
  passingDownSuccessRate: number | null;
  passingDownExplosiveness: number | null;
  passingDownPpa: number | null;
  qbEfficiencyIndex: number | null;
  receiverSpaceIndex: number | null;
  downLeverageIndex: number | null;
  componentYpa: number | null;
  componentIndex: number | null;
  directYpa: number;
  adjustedYpa: number;
  adjustment: number;
};

export type AdvancedSideProjection = {
  scoringPoints: number | null;
  overall: {
    yardsPerPlay: number | null;
    successRate: number | null;
    explosiveness: number | null;
    ppa: number | null;
    pointsPerDrive: number | null;
    playsPerDrive: number | null;
    thirdDownSuccessRate: number | null;
    redZoneEfficiency: number | null;
    havocRate: number | null;
    frontSevenHavoc: number | null;
    dbHavoc: number | null;
  };
  specialTeams: {
    fieldPosition: number | null;
    netPunting: number | null;
    puntReturn: number | null;
    kickReturn: number | null;
    hiddenYards: number | null;
    turnoverMargin: number | null;
    penaltyYards: number | null;
  };
  run: AdvancedRunProjection;
  pass: AdvancedPassProjection;
};

const inverseMetricKeys = new Set<AdvancedMetricKey>(["stuffRate", "havocRate", "frontSevenHavoc", "dbHavoc", "penaltyYards"]);
const ppaMetricKeys = new Set<AdvancedMetricKey>(["ppa", "rushingPpa", "passingPpa", "standardDownPpa", "passingDownPpa"]);
const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

export function emptyAdvancedMetricValues(): AdvancedMetricValues {
  return Object.fromEntries(advancedMetricKeys.map((key) => [key, null])) as AdvancedMetricValues;
}

export type PassingEfficiencyInputs = {
  passAttempts: number;
  passCompletions: number | null;
  passYards?: number | null;
  yardsPerAttempt?: number | null;
};

/**
 * Exact box-score identities used throughout the X-ray. Yards per completion
 * can be calculated either directly (yards / completions) or equivalently as
 * yards per attempt divided by completion rate. Tracking-only air yards and
 * YAC are deliberately not inferred.
 */
export function derivePassingEfficiency(input: PassingEfficiencyInputs) {
  const attempts = Number(input.passAttempts);
  const completions = input.passCompletions === null ? null : Number(input.passCompletions);
  const suppliedYpa = input.yardsPerAttempt === null || input.yardsPerAttempt === undefined ? null : Number(input.yardsPerAttempt);
  const passYards = input.passYards === null || input.passYards === undefined ? null : Number(input.passYards);
  const yardsPerAttempt = Number.isFinite(suppliedYpa) ? suppliedYpa
    : Number.isFinite(passYards) && attempts > 0 ? Number(passYards) / attempts
      : null;
  const completionRate = completions !== null && Number.isFinite(completions) && attempts > 0
    ? completions / attempts
    : null;
  const yardsPerCompletion = completionRate !== null && completionRate > 0 && yardsPerAttempt !== null
    ? yardsPerAttempt / completionRate
    : completions !== null && completions > 0 && Number.isFinite(passYards) ? Number(passYards) / completions
      : null;
  return { completionRate, yardsPerAttempt, yardsPerCompletion };
}

function finiteOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function metricValues(input: unknown): AdvancedMetricValues {
  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  return Object.fromEntries(advancedMetricKeys.map((key) => [key, finiteOrNull(source[key])])) as AdvancedMetricValues;
}

export function parseAdvancedProfile(input: unknown): AdvancedProfile | null {
  let value = input;
  if (typeof input === "string") {
    try {
      value = JSON.parse(input) as unknown;
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const offense = row.offense && typeof row.offense === "object" ? row.offense as Record<string, unknown> : {};
  const defense = row.defense && typeof row.defense === "object" ? row.defense as Record<string, unknown> : {};
  const coverage = row.coverage && typeof row.coverage === "object" ? row.coverage as Record<string, unknown> : {};
  const parsed: AdvancedProfile = {
    source: "cfbd-advanced",
    rushingDefinition: "line-and-open-field-proxy",
    passingDefinition: "box-score-and-cfbd-proxy",
    baseline: metricValues(row.baseline),
    offense: { raw: metricValues(offense.raw), index: metricValues(offense.index) },
    defense: { raw: metricValues(defense.raw), index: metricValues(defense.index) },
    coverage: {
      advancedGames: Math.max(0, Math.trunc(finiteOrNull(coverage.advancedGames) ?? 0)),
      completionGames: Math.max(0, Math.trunc(finiteOrNull(coverage.completionGames) ?? 0)),
    },
  };
  const available = advancedMetricKeys.some((key) => parsed.offense.raw[key] !== null || parsed.defense.raw[key] !== null);
  return available ? parsed : null;
}

/** Converts a raw metric to the common convention: >1 good offense, <1 good defense. */
export function advancedMetricIndex(key: AdvancedMetricKey, raw: number | null, baseline: number | null) {
  if (raw === null || baseline === null || !Number.isFinite(raw) || !Number.isFinite(baseline)) return null;
  if (ppaMetricKeys.has(key)) return clamp(Math.exp(raw - baseline), 0.3, 2.2);
  if (inverseMetricKeys.has(key)) return raw > 0 && baseline > 0 ? baseline / raw : null;
  return baseline > 0 ? raw / baseline : null;
}

function averageAvailable(values: Array<number | null>) {
  const valid = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

function pairedBaseline(first: AdvancedProfile | null | undefined, second: AdvancedProfile | null | undefined, key: AdvancedMetricKey) {
  return averageAvailable([first?.baseline[key] ?? null, second?.baseline[key] ?? null]);
}

function matchupIndex(
  offense: AdvancedProfile | null | undefined,
  defense: AdvancedProfile | null | undefined,
  key: AdvancedMetricKey,
) {
  const offenseIndex = offense?.offense.index[key] ?? null;
  const defenseIndex = defense?.defense.index[key] ?? null;
  if (offenseIndex === null || defenseIndex === null) return null;
  return offenseIndex * defenseIndex;
}

function matchupValue(
  offense: AdvancedProfile | null | undefined,
  defense: AdvancedProfile | null | undefined,
  key: AdvancedMetricKey,
) {
  const baseline = pairedBaseline(offense, defense, key);
  const index = matchupIndex(offense, defense, key);
  if (baseline === null || index === null || index <= 0) return null;
  if (ppaMetricKeys.has(key)) return baseline + Math.log(index);
  if (inverseMetricKeys.has(key)) return baseline / index;
  return baseline * index;
}

function geometricIndex(values: Array<{ value: number | null; weight: number }>) {
  const available = values.filter((item): item is { value: number; weight: number } => item.value !== null && Number.isFinite(item.value) && item.value > 0);
  const totalWeight = available.reduce((sum, item) => sum + item.weight, 0);
  if (!available.length || totalWeight <= 0) return null;
  return Math.exp(available.reduce((sum, item) => sum + Math.log(item.value) * item.weight, 0) / totalWeight);
}

/**
 * Decomposes YPC/YPA into schedule-adjusted position and play-style proxies.
 * The correction stays bounded because several components describe the same
 * play; this diagnoses the cause of an edge without double-counting it.
 */
export function projectAdvancedSide(
  offense: AdvancedProfile | null | undefined,
  defense: AdvancedProfile | null | undefined,
  directYpc: number,
  directYpa: number,
  baselineYpc: number,
  baselineYpa: number,
): AdvancedSideProjection | null {
  if (!offense || !defense) return null;

  const scoringPoints = matchupValue(offense, defense, "pointsPerGame");
  const yardsPerPlay = matchupValue(offense, defense, "yardsPerPlay");
  const successRate = matchupValue(offense, defense, "successRate");
  const explosiveness = matchupValue(offense, defense, "explosiveness");
  const ppa = matchupValue(offense, defense, "ppa");
  const pointsPerDrive = matchupValue(offense, defense, "pointsPerDrive");
  const playsPerDrive = matchupValue(offense, defense, "playsPerDrive");
  const thirdDownSuccessRate = matchupValue(offense, defense, "thirdDownSuccessRate");
  const redZoneEfficiency = matchupValue(offense, defense, "redZoneEfficiency");
  const havocRate = matchupValue(offense, defense, "havocRate");
  const frontSevenHavoc = matchupValue(offense, defense, "frontSevenHavoc");
  const dbHavoc = matchupValue(offense, defense, "dbHavoc");
  const lineYards = matchupValue(offense, defense, "lineYards");
  const secondLevelYards = matchupValue(offense, defense, "secondLevelYards");
  const openFieldYards = matchupValue(offense, defense, "openFieldYards");
  const stuffRate = matchupValue(offense, defense, "stuffRate");
  const powerSuccess = matchupValue(offense, defense, "powerSuccess");
  const rushingSuccessRate = matchupValue(offense, defense, "rushingSuccessRate");
  const rushingExplosiveness = matchupValue(offense, defense, "rushingExplosiveness");
  const rushingPpa = matchupValue(offense, defense, "rushingPpa");
  const yardsBeyondLine = secondLevelYards === null && openFieldYards === null
    ? null
    : (secondLevelYards ?? 0) + (openFieldYards ?? 0);
  const trenchIndex = geometricIndex([
    { value: matchupIndex(offense, defense, "lineYards"), weight: 0.42 },
    { value: matchupIndex(offense, defense, "stuffRate"), weight: 0.34 },
    { value: matchupIndex(offense, defense, "powerSuccess"), weight: 0.24 },
  ]);
  const secondLevelIndex = geometricIndex([
    { value: matchupIndex(offense, defense, "secondLevelYards"), weight: 0.31 },
    { value: matchupIndex(offense, defense, "openFieldYards"), weight: 0.22 },
    { value: matchupIndex(offense, defense, "rushingSuccessRate"), weight: 0.23 },
    { value: matchupIndex(offense, defense, "rushingExplosiveness"), weight: 0.14 },
    { value: matchupIndex(offense, defense, "rushingPpa"), weight: 0.10 },
  ]);
  const runComponentIndex = geometricIndex([
    { value: trenchIndex, weight: 0.50 },
    { value: secondLevelIndex, weight: 0.32 },
    { value: matchupIndex(offense, defense, "rushingSuccessRate"), weight: 0.10 },
    { value: matchupIndex(offense, defense, "rushingPpa"), weight: 0.08 },
  ]);
  const directRunIndex = Math.max(0.05, directYpc / Math.max(0.1, baselineYpc));
  const runAdjustment = runComponentIndex === null
    ? 1
    : clamp(Math.exp(0.30 * (Math.log(runComponentIndex) - Math.log(directRunIndex))), 0.86, 1.14);
  const adjustedYpc = directYpc * runAdjustment;

  const completionRate = matchupValue(offense, defense, "completionRate");
  const yardsPerCompletion = matchupValue(offense, defense, "yardsPerCompletion");
  const passingSuccessRate = matchupValue(offense, defense, "passingSuccessRate");
  const passingExplosiveness = matchupValue(offense, defense, "passingExplosiveness");
  const passingPpa = matchupValue(offense, defense, "passingPpa");
  const standardDownSuccessRate = matchupValue(offense, defense, "standardDownSuccessRate");
  const standardDownExplosiveness = matchupValue(offense, defense, "standardDownExplosiveness");
  const standardDownPpa = matchupValue(offense, defense, "standardDownPpa");
  const passingDownSuccessRate = matchupValue(offense, defense, "passingDownSuccessRate");
  const passingDownExplosiveness = matchupValue(offense, defense, "passingDownExplosiveness");
  const passingDownPpa = matchupValue(offense, defense, "passingDownPpa");
  const boxScoreYpa = completionRate === null || yardsPerCompletion === null ? null : completionRate * yardsPerCompletion;
  const boxScoreBaseline = (pairedBaseline(offense, defense, "completionRate") ?? 0)
    * (pairedBaseline(offense, defense, "yardsPerCompletion") ?? 0);
  const boxScoreIndex = boxScoreYpa === null || boxScoreBaseline <= 0 ? null : boxScoreYpa / boxScoreBaseline;
  const qbEfficiencyIndex = geometricIndex([
    { value: matchupIndex(offense, defense, "completionRate"), weight: 0.34 },
    { value: matchupIndex(offense, defense, "passingSuccessRate"), weight: 0.29 },
    { value: matchupIndex(offense, defense, "passingPpa"), weight: 0.22 },
    { value: matchupIndex(offense, defense, "passingDownSuccessRate"), weight: 0.15 },
  ]);
  const receiverSpaceIndex = geometricIndex([
    { value: matchupIndex(offense, defense, "yardsPerCompletion"), weight: 0.45 },
    { value: matchupIndex(offense, defense, "passingExplosiveness"), weight: 0.35 },
    { value: matchupIndex(offense, defense, "standardDownExplosiveness"), weight: 0.20 },
  ]);
  const downLeverageIndex = geometricIndex([
    { value: matchupIndex(offense, defense, "standardDownSuccessRate"), weight: 0.24 },
    { value: matchupIndex(offense, defense, "standardDownPpa"), weight: 0.21 },
    { value: matchupIndex(offense, defense, "passingDownSuccessRate"), weight: 0.31 },
    { value: matchupIndex(offense, defense, "passingDownPpa"), weight: 0.24 },
  ]);
  const passComponentIndex = geometricIndex([
    { value: boxScoreIndex, weight: 0.42 },
    { value: qbEfficiencyIndex, weight: 0.24 },
    { value: receiverSpaceIndex, weight: 0.17 },
    { value: downLeverageIndex, weight: 0.17 },
  ]);
  const directPassIndex = Math.max(0.05, directYpa / Math.max(0.1, baselineYpa));
  const passAdjustment = passComponentIndex === null
    ? 1
    : clamp(Math.exp(0.30 * (Math.log(passComponentIndex) - Math.log(directPassIndex))), 0.88, 1.12);
  const adjustedYpa = directYpa * passAdjustment;

  return {
    scoringPoints,
    overall: {
      yardsPerPlay, successRate, explosiveness, ppa, pointsPerDrive, playsPerDrive,
      thirdDownSuccessRate, redZoneEfficiency, havocRate, frontSevenHavoc, dbHavoc,
    },
    specialTeams: {
      fieldPosition: matchupValue(offense, defense, "fieldPosition"),
      netPunting: matchupValue(offense, defense, "netPunting"),
      puntReturn: matchupValue(offense, defense, "puntReturn"),
      kickReturn: matchupValue(offense, defense, "kickReturn"),
      hiddenYards: matchupValue(offense, defense, "hiddenYards") ?? (()=>{
        const fieldPosition=matchupValue(offense,defense,"fieldPosition");
        const baseline=pairedBaseline(offense,defense,"fieldPosition");
        // When tracking-level returns are unavailable, field position is the
        // model's explicitly labeled special-teams proxy. Roughly 10.5 drives
        // turns each yard of average starting position into season-style
        // hidden yards for a single game.
        return fieldPosition===null||baseline===null?null:(fieldPosition-baseline)*10.5;
      })(),
      turnoverMargin: matchupValue(offense, defense, "turnoverMargin"),
      penaltyYards: matchupValue(offense, defense, "penaltyYards"),
    },
    run: {
      lineYards, secondLevelYards, openFieldYards, yardsBeyondLine, stuffRate, powerSuccess,
      rushingSuccessRate, rushingExplosiveness, rushingPpa, trenchIndex, secondLevelIndex,
      componentIndex: runComponentIndex, directYpc, adjustedYpc, adjustment: runAdjustment,
    },
    pass: {
      completionRate, yardsPerCompletion, passingSuccessRate, passingExplosiveness, passingPpa,
      standardDownSuccessRate, standardDownExplosiveness, standardDownPpa,
      passingDownSuccessRate, passingDownExplosiveness, passingDownPpa,
      qbEfficiencyIndex, receiverSpaceIndex, downLeverageIndex,
      componentYpa: boxScoreYpa, componentIndex: passComponentIndex,
      directYpa, adjustedYpa, adjustment: passAdjustment,
    },
  };
}
