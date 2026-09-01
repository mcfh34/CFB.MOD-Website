import {
  advancedMetricIndex,
  advancedMetricKeys,
  derivePassingEfficiency,
  emptyAdvancedMetricValues,
  type AdvancedMetricKey,
  type AdvancedMetricValues,
  type AdvancedProfile,
} from "./advancedMetrics";

export type AdvancedBaseStatRow = {
  gameId: string;
  week: number;
  team: string;
  opponent: string;
  passYards: number;
  passAttempts: number;
  passCompletions: number | null;
  rushAttempts: number;
  totalYards?: number;
  yardsPerPlay?: number;
  turnovers?: number;
  points?: number | null;
};

export type AdvancedGameComponentRow = {
  gameId: string;
  season: number;
  week: number;
  team: string;
  opponent: string;
  offSuccessRate?: number | null;
  offExplosiveness?: number | null;
  offPpa?: number | null;
  offDrives?: number | null;
  offPlays?: number | null;
  offHavocRate?: number | null;
  offFrontSevenHavoc?: number | null;
  offDbHavoc?: number | null;
  offFieldPosition?: number | null;
  offLineYards: number | null;
  offSecondLevelYards: number | null;
  offOpenFieldYards: number | null;
  offStuffRate?: number | null;
  offPowerSuccess?: number | null;
  offRushingSuccessRate?: number | null;
  offRushingExplosiveness?: number | null;
  offRushingPpa?: number | null;
  offPassingSuccessRate: number | null;
  offPassingExplosiveness: number | null;
  offPassingPpa?: number | null;
  offStandardDownSuccessRate?: number | null;
  offStandardDownExplosiveness?: number | null;
  offStandardDownPpa?: number | null;
  offPassingDownSuccessRate?: number | null;
  offPassingDownExplosiveness?: number | null;
  offPassingDownPpa?: number | null;
  defLineYards: number | null;
  defSecondLevelYards: number | null;
  defOpenFieldYards: number | null;
  defStuffRate?: number | null;
  defPowerSuccess?: number | null;
  defRushingSuccessRate?: number | null;
  defRushingExplosiveness?: number | null;
  defRushingPpa?: number | null;
  defPassingSuccessRate: number | null;
  defPassingExplosiveness: number | null;
  defPassingPpa?: number | null;
  defStandardDownSuccessRate?: number | null;
  defStandardDownExplosiveness?: number | null;
  defStandardDownPpa?: number | null;
  defPassingDownSuccessRate?: number | null;
  defPassingDownExplosiveness?: number | null;
  defPassingDownPpa?: number | null;
  defSuccessRate?: number | null;
  defExplosiveness?: number | null;
  defPpa?: number | null;
  defDrives?: number | null;
  defPlays?: number | null;
  defHavocRate?: number | null;
  defFrontSevenHavoc?: number | null;
  defDbHavoc?: number | null;
  defFieldPosition?: number | null;
};

export type WeeklyAdvancedProfile = {
  season: number;
  week: number;
  team: string;
  gamesPlayed: number;
  advanced: AdvancedProfile;
};

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

function finite(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function weightedAverage(rows: Array<{ value: number | null; weight: number }>) {
  const valid = rows.filter((row) => finite(row.value) && row.weight > 0) as Array<{ value: number; weight: number }>;
  const weight = valid.reduce((sum, row) => sum + row.weight, 0);
  return weight > 0 ? valid.reduce((sum, row) => sum + row.value * row.weight, 0) / weight : null;
}

function indexValues(raw: AdvancedMetricValues, baseline: AdvancedMetricValues) {
  return Object.fromEntries(advancedMetricKeys.map((key) => [key, advancedMetricIndex(key, raw[key], baseline[key])])) as AdvancedMetricValues;
}

function aggregateSide(
  advancedRows: AdvancedGameComponentRow[],
  baseByGameTeam: Map<string, AdvancedBaseStatRow>,
  offense: boolean,
) {
  const baseRows = advancedRows.map((row) => baseByGameTeam.get(`${row.gameId}|${offense ? row.team : row.opponent}`)).filter((row): row is AdvancedBaseStatRow => Boolean(row));
  const baseById = new Map(baseRows.map((row) => [row.gameId, row]));
  const weighted = (accessor: (row: AdvancedGameComponentRow) => number | null, weight: "rush" | "pass") => weightedAverage(advancedRows.map((row) => ({
    value: accessor(row),
    weight: weight === "rush" ? (baseById.get(row.gameId)?.rushAttempts ?? 0) : (baseById.get(row.gameId)?.passAttempts ?? 0),
  })));
  const passAttempts = baseRows.reduce((sum, row) => sum + row.passAttempts, 0);
  const completionRows = baseRows.filter((row) => finite(row.passCompletions));
  const passCompletions = completionRows.reduce((sum, row) => sum + Number(row.passCompletions), 0);
  const completionAttempts = completionRows.reduce((sum, row) => sum + row.passAttempts, 0);
  const completionPassYards = completionRows.reduce((sum, row) => sum + row.passYards, 0);
  const passing = derivePassingEfficiency({
    passAttempts: completionAttempts,
    passCompletions: completionRows.length ? passCompletions : null,
    passYards: completionPassYards,
  });
  const values = emptyAdvancedMetricValues();
  values.pointsPerGame = weightedAverage(baseRows.map((row) => ({ value: row.points ?? null, weight: 1 })));
  values.yardsPerPlay = weightedAverage(baseRows.map((row) => ({ value: row.yardsPerPlay ?? null, weight: Math.max(1, row.passAttempts + row.rushAttempts) })));
  values.successRate = weightedAverage(advancedRows.map((row) => ({ value: (offense ? row.offSuccessRate : row.defSuccessRate) ?? null, weight: (offense ? row.offPlays : row.defPlays) ?? 1 })));
  values.explosiveness = weightedAverage(advancedRows.map((row) => ({ value: (offense ? row.offExplosiveness : row.defExplosiveness) ?? null, weight: (offense ? row.offPlays : row.defPlays) ?? 1 })));
  values.ppa = weightedAverage(advancedRows.map((row) => ({ value: (offense ? row.offPpa : row.defPpa) ?? null, weight: (offense ? row.offPlays : row.defPlays) ?? 1 })));
  const totalPoints = baseRows.reduce((sum, row) => sum + Number(row.points ?? 0), 0);
  const totalDrives = advancedRows.reduce((sum, row) => sum + Number((offense ? row.offDrives : row.defDrives) ?? 0), 0);
  const totalPlays = advancedRows.reduce((sum, row) => sum + Number((offense ? row.offPlays : row.defPlays) ?? 0), 0);
  values.pointsPerDrive = totalDrives > 0 ? totalPoints / totalDrives : null;
  values.playsPerDrive = totalDrives > 0 ? totalPlays / totalDrives : null;
  values.lineYards = weighted((row) => offense ? row.offLineYards : row.defLineYards, "rush");
  values.secondLevelYards = weighted((row) => offense ? row.offSecondLevelYards : row.defSecondLevelYards, "rush");
  values.openFieldYards = weighted((row) => offense ? row.offOpenFieldYards : row.defOpenFieldYards, "rush");
  values.stuffRate = weighted((row) => (offense ? row.offStuffRate : row.defStuffRate) ?? null, "rush");
  values.powerSuccess = weighted((row) => (offense ? row.offPowerSuccess : row.defPowerSuccess) ?? null, "rush");
  values.rushingSuccessRate = weighted((row) => (offense ? row.offRushingSuccessRate : row.defRushingSuccessRate) ?? null, "rush");
  values.rushingExplosiveness = weighted((row) => (offense ? row.offRushingExplosiveness : row.defRushingExplosiveness) ?? null, "rush");
  values.rushingPpa = weighted((row) => (offense ? row.offRushingPpa : row.defRushingPpa) ?? null, "rush");
  values.completionRate = passing.completionRate;
  values.yardsPerCompletion = passing.yardsPerCompletion;
  values.passingSuccessRate = weighted((row) => offense ? row.offPassingSuccessRate : row.defPassingSuccessRate, "pass");
  values.passingExplosiveness = weighted((row) => offense ? row.offPassingExplosiveness : row.defPassingExplosiveness, "pass");
  values.passingPpa = weighted((row) => (offense ? row.offPassingPpa : row.defPassingPpa) ?? null, "pass");
  values.standardDownSuccessRate = weighted((row) => (offense ? row.offStandardDownSuccessRate : row.defStandardDownSuccessRate) ?? null, "pass");
  values.standardDownExplosiveness = weighted((row) => (offense ? row.offStandardDownExplosiveness : row.defStandardDownExplosiveness) ?? null, "pass");
  values.standardDownPpa = weighted((row) => (offense ? row.offStandardDownPpa : row.defStandardDownPpa) ?? null, "pass");
  values.passingDownSuccessRate = weighted((row) => (offense ? row.offPassingDownSuccessRate : row.defPassingDownSuccessRate) ?? null, "pass");
  values.passingDownExplosiveness = weighted((row) => (offense ? row.offPassingDownExplosiveness : row.defPassingDownExplosiveness) ?? null, "pass");
  values.passingDownPpa = weighted((row) => (offense ? row.offPassingDownPpa : row.defPassingDownPpa) ?? null, "pass");
  values.havocRate = weightedAverage(advancedRows.map((row) => ({ value: (offense ? row.offHavocRate : row.defHavocRate) ?? null, weight: (offense ? row.offPlays : row.defPlays) ?? 1 })));
  values.frontSevenHavoc = weightedAverage(advancedRows.map((row) => ({ value: (offense ? row.offFrontSevenHavoc : row.defFrontSevenHavoc) ?? null, weight: (offense ? row.offPlays : row.defPlays) ?? 1 })));
  values.dbHavoc = weightedAverage(advancedRows.map((row) => ({ value: (offense ? row.offDbHavoc : row.defDbHavoc) ?? null, weight: (offense ? row.offPlays : row.defPlays) ?? 1 })));
  values.fieldPosition = weightedAverage(advancedRows.map((row) => ({ value: (offense ? row.offFieldPosition : row.defFieldPosition) ?? null, weight: (offense ? row.offDrives : row.defDrives) ?? 1 })));
  // CFBD's advanced game feed exposes passing-down success consistently across
  // the historical archive. It is the cleanest no-leakage late-down proxy when
  // a season's raw third-down split is unavailable.
  values.thirdDownSuccessRate = values.passingDownSuccessRate;
  values.turnoverMargin = weightedAverage(baseRows.map((row) => ({ value: row.turnovers === undefined ? null : -row.turnovers, weight: 1 })));
  return {
    values,
    advancedGames: advancedRows.length,
    completionGames: completionRows.length,
    passAttempts,
  };
}

function geometricMean(values: number[]) {
  return values.length ? Math.exp(values.reduce((sum, value) => sum + Math.log(Math.max(0.05, value)), 0) / values.length) : 1;
}

function adjustNetwork(
  raw: Map<string, { offense: AdvancedMetricValues; defense: AdvancedMetricValues }>,
  opponents: Map<string, string[]>,
  iterations: number,
) {
  let offense = new Map([...raw].map(([team, profile]) => [team, { ...profile.offense }]));
  let defense = new Map([...raw].map(([team, profile]) => [team, { ...profile.defense }]));
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const nextOffense = new Map<string, AdvancedMetricValues>();
    const nextDefense = new Map<string, AdvancedMetricValues>();
    for (const [team, profile] of raw) {
      const schedule = opponents.get(team) ?? [];
      const opponentAverage = (source: Map<string, AdvancedMetricValues>, key: AdvancedMetricKey) => {
        const values = schedule.map((opponent) => source.get(opponent)?.[key] ?? null).filter(finite);
        return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 1;
      };
      nextOffense.set(team, Object.fromEntries(advancedMetricKeys.map((key) => [
        key,
        profile.offense[key] === null ? null : profile.offense[key]! / Math.max(0.6, opponentAverage(defense, key)),
      ])) as AdvancedMetricValues);
      nextDefense.set(team, Object.fromEntries(advancedMetricKeys.map((key) => [
        key,
        profile.defense[key] === null ? null : profile.defense[key]! / Math.max(0.6, opponentAverage(offense, key)),
      ])) as AdvancedMetricValues);
    }
    for (const key of advancedMetricKeys) {
      const offenseMean = geometricMean([...nextOffense.values()].map((row) => row[key]).filter(finite));
      const defenseMean = geometricMean([...nextDefense.values()].map((row) => row[key]).filter(finite));
      for (const row of nextOffense.values()) if (row[key] !== null) row[key] = row[key]! / offenseMean;
      for (const row of nextDefense.values()) if (row[key] !== null) row[key] = row[key]! / defenseMean;
    }
    offense = nextOffense;
    defense = nextDefense;
  }
  return { offense, defense };
}

function blendedIndex(raw: number | null, adjusted: number | null, prior: number | null, games: number, priorGames = 1.25) {
  if (raw === null) return prior;
  const opponentAdjusted = adjusted === null ? raw : Math.exp(0.55 * Math.log(Math.max(0.05, raw)) + 0.45 * Math.log(Math.max(0.05, adjusted)));
  if (prior === null || games <= 0) return clamp(opponentAdjusted, 0.55, 1.65);
  return clamp(Math.exp((games * Math.log(Math.max(0.05, opponentAdjusted)) + priorGames * Math.log(Math.max(0.05, prior))) / (games + priorGames)), 0.55, 1.65);
}

export function buildWeeklyAdvancedProfiles(
  season: number,
  completedRegularGameIds: Set<string>,
  baseRows: AdvancedBaseStatRow[],
  advancedRows: AdvancedGameComponentRow[],
  eligibleTeams: Set<string>,
  preseasonProfiles: WeeklyAdvancedProfile[] = [],
  iterations = 5,
) {
  const base = baseRows.filter((row) => completedRegularGameIds.has(row.gameId));
  const advanced = advancedRows.filter((row) => completedRegularGameIds.has(row.gameId));
  const baseByGameTeam = new Map(base.map((row) => [`${row.gameId}|${row.team}`, row]));
  const prior = new Map(preseasonProfiles.map((row) => [row.team, row.advanced]));
  const maxWeek = Math.max(0, ...advanced.map((row) => row.week));
  const output: WeeklyAdvancedProfile[] = [];

  for (let week = 1; week <= maxWeek; week += 1) {
    const throughAdvanced = advanced.filter((row) => row.week <= week && eligibleTeams.has(row.team));
    const teams = [...new Set(throughAdvanced.map((row) => row.team))];
    const national = aggregateSide(throughAdvanced, baseByGameTeam, true).values;
    const raw = new Map<string, { offense: AdvancedMetricValues; defense: AdvancedMetricValues; advancedGames: number; completionGames: number; games: number }>();
    const schedules = new Map<string, string[]>();

    for (const team of teams) {
      const teamAdvanced = throughAdvanced.filter((row) => row.team === team);
      const teamBase = base.filter((row) => row.team === team && row.week <= week);
      const offense = aggregateSide(teamAdvanced, baseByGameTeam, true);
      const defense = aggregateSide(teamAdvanced, baseByGameTeam, false);
      raw.set(team, {
        offense: indexValues(offense.values, national),
        defense: indexValues(defense.values, national),
        advancedGames: offense.advancedGames,
        completionGames: Math.min(offense.completionGames, defense.completionGames),
        games: teamBase.length,
      });
      schedules.set(team, teamBase.map((row) => row.opponent));
    }

    const adjusted = adjustNetwork(new Map([...raw].map(([team, row]) => [team, { offense: row.offense, defense: row.defense }])), schedules, iterations);
    for (const team of teams) {
      const teamAdvanced = throughAdvanced.filter((row) => row.team === team);
      const offenseRaw = aggregateSide(teamAdvanced, baseByGameTeam, true).values;
      const defenseRaw = aggregateSide(teamAdvanced, baseByGameTeam, false).values;
      const row = raw.get(team)!;
      const priorProfile = prior.get(team);
      const offenseIndex = Object.fromEntries(advancedMetricKeys.map((key) => [
        key,
        blendedIndex(
          row.offense[key],
          adjusted.offense.get(team)?.[key] ?? null,
          key === "pointsPerGame" ? priorProfile?.offense.index[key] ?? 1 : priorProfile?.offense.index[key] ?? null,
          row.games,
          key === "pointsPerGame" ? 1.5 : 1.25,
        ),
      ])) as AdvancedMetricValues;
      const defenseIndex = Object.fromEntries(advancedMetricKeys.map((key) => [
        key,
        blendedIndex(
          row.defense[key],
          adjusted.defense.get(team)?.[key] ?? null,
          key === "pointsPerGame" ? priorProfile?.defense.index[key] ?? 1 : priorProfile?.defense.index[key] ?? null,
          row.games,
          key === "pointsPerGame" ? 1.5 : 1.25,
        ),
      ])) as AdvancedMetricValues;
      output.push({
        season,
        week,
        team,
        gamesPlayed: row.games,
        advanced: {
          source: "cfbd-advanced",
          rushingDefinition: "line-and-open-field-proxy",
          passingDefinition: "box-score-and-cfbd-proxy",
          baseline: { ...national },
          offense: { raw: offenseRaw, index: offenseIndex },
          defense: { raw: defenseRaw, index: defenseIndex },
          coverage: { advancedGames: row.advancedGames, completionGames: row.completionGames },
        },
      });
    }
  }
  return output;
}

export function blendAdvancedProfiles(weighted: Array<{ profile: AdvancedProfile; weight: number }>): AdvancedProfile | null {
  const valid = weighted.filter((row) => row.weight > 0);
  const totalWeight = valid.reduce((sum, row) => sum + row.weight, 0);
  if (!valid.length || totalWeight <= 0) return null;
  const blendValues = (accessor: (profile: AdvancedProfile) => AdvancedMetricValues) => Object.fromEntries(advancedMetricKeys.map((key) => {
    const values = valid.map((row) => ({ value: accessor(row.profile)[key], weight: row.weight })).filter((row) => finite(row.value));
    const usedWeight = values.reduce((sum, row) => sum + row.weight, 0);
    return [key, usedWeight ? values.reduce((sum, row) => sum + Number(row.value) * row.weight, 0) / usedWeight : null];
  })) as AdvancedMetricValues;
  return {
    source: "cfbd-advanced",
    rushingDefinition: "line-and-open-field-proxy",
    passingDefinition: "box-score-and-cfbd-proxy",
    baseline: blendValues((profile) => profile.baseline),
    offense: { raw: blendValues((profile) => profile.offense.raw), index: blendValues((profile) => profile.offense.index) },
    defense: { raw: blendValues((profile) => profile.defense.raw), index: blendValues((profile) => profile.defense.index) },
    coverage: {
      advancedGames: Math.round(valid.reduce((sum, row) => sum + row.profile.coverage.advancedGames * row.weight, 0) / totalWeight),
      completionGames: Math.round(valid.reduce((sum, row) => sum + row.profile.coverage.completionGames * row.weight, 0) / totalWeight),
    },
  };
}
