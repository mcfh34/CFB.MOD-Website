import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { scoreCoefficients } from "../app/modelData";
import { parseAdvancedProfile, type AdvancedSideProjection } from "../lib/advancedMetrics";
import {
  buildPregameElo,
  buildPregameMatchupEvidence,
  latestProfile,
  project,
  type NormalizedGame,
  type Profile,
} from "../lib/dataPipeline";

type ApiScheduleRow = {
  gameId: string;
  season: number;
  week: number;
  seasonType: string;
  startDate: string | null;
  completed: boolean | number;
  neutralSite: boolean | number;
  homeTeam: string;
  homeConference: string | null;
  homePoints: number | null;
  awayTeam: string;
  awayConference: string | null;
  awayPoints: number | null;
};

type ApiProfileRow = {
  season: number;
  week: number;
  team: string;
  gamesPlayed: number;
  offYpp: number;
  offYpa: number;
  offYpc: number;
  offPatt: number;
  offRatt: number;
  defYpp: number;
  defYpa: number;
  defYpc: number;
  defPatt: number;
  defRatt: number;
  offYppIndex: number;
  offYpaIndex: number;
  offYpcIndex: number;
  offPattIndex: number;
  offRattIndex: number;
  defYppIndex: number;
  defYpaIndex: number;
  defYpcIndex: number;
  defPattIndex: number;
  defRattIndex: number;
  advancedProfile?: unknown;
};

type Side = "home" | "away";

type Sample = {
  season: number;
  gameId: string;
  week: number;
  seasonType: string;
  side: Side;
  team: string;
  points: number;
  site: number;
  ypp: number;
  ypa: number;
  ypc: number;
  patt: number;
  ratt: number;
  expectedYards: number;
  expectedYardsSquared: number;
  passShare: number;
  completionRate: number;
  yardsPerCompletion: number;
  passingSuccessRate: number;
  passingExplosiveness: number;
  lineYards: number;
  yardsBeyondLine: number;
  advancedAvailable: number;
  scoringProjection: number;
  proofGap: number;
  outcomeMargin: number;
  outcomeBlend: number;
};

type FeatureKey = keyof Pick<Sample,
  "site" | "ypp" | "ypa" | "ypc" | "patt" | "ratt" | "expectedYards" | "expectedYardsSquared" |
  "passShare" | "completionRate" | "yardsPerCompletion" | "passingSuccessRate" | "passingExplosiveness" |
  "lineYards" | "yardsBeyondLine" | "advancedAvailable" | "scoringProjection"
>;

type Candidate = { name: string; features: FeatureKey[]; fixedSite?: number };
type Regression = { intercept: number; coefficients: Record<string, number>; lambda: number; fixedSite: number };

const baseUrl = process.env.HARPER_DATA_URL ?? "https://harpercfbmodel.com/api/data";
const cacheDirectory = process.env.HARPER_ANALYSIS_CACHE ?? "/tmp/harper-scoring-analysis-v1";
const seasons = [2021, 2022, 2023, 2024, 2025] as const;
const trainingSeasons = new Set([2021, 2022, 2023, 2024]);
const holdoutSeason = 2025;
const lambdas = [0, 0.03, 0.1, 0.3, 1, 3, 10, 30, 100];

const candidates: Candidate[] = [
  { name: "refit-workbook-inputs", features: ["ypc", "ypp", "ypa", "ratt", "patt", "site"] },
  { name: "productive-yards", features: ["expectedYards", "ypp", "passShare", "site"] },
  { name: "productive-yards-curve", features: ["expectedYards", "expectedYardsSquared", "ypp", "passShare", "site"] },
  { name: "scoring-efficiency", features: ["scoringProjection", "ypp", "passShare", "site"] },
  { name: "scoring-efficiency-split", features: ["scoringProjection", "ypp", "ypa", "ypc", "passShare", "site"] },
  { name: "scoring-anchor", features: ["scoringProjection", "expectedYards", "ypp", "passShare", "site"] },
  { name: "scoring-anchor-curve", features: ["scoringProjection", "expectedYards", "expectedYardsSquared", "ypp", "passShare", "site"] },
  { name: "scoring-anchor-curve-fixed-hfa", features: ["scoringProjection", "expectedYards", "expectedYardsSquared", "ypp", "passShare"], fixedSite: 0.75 },
  {
    name: "scoring-anchor-components",
    features: [
      "scoringProjection", "expectedYards", "expectedYardsSquared", "ypp", "passShare", "completionRate", "yardsPerCompletion",
      "passingSuccessRate", "passingExplosiveness", "lineYards", "yardsBeyondLine", "advancedAvailable", "site",
    ],
  },
];

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

async function fetchJson<T>(url: string): Promise<T> {
  await mkdir(cacheDirectory, { recursive: true });
  const key = Buffer.from(url).toString("base64url");
  const path = join(cacheDirectory, `${key}.json`);
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    // Cache misses are expected on the first run.
  }
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { accept: "application/json" } });
      const body = await response.text();
      if (!response.ok) throw new Error(`${response.status} ${body.slice(0, 180)}`);
      const parsed = JSON.parse(body) as T;
      await writeFile(path, JSON.stringify(parsed));
      return parsed;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 750 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function concurrentMap<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>) {
  const output = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await mapper(items[index]);
    }
  });
  await Promise.all(workers);
  return output;
}

function normalizedGame(row: ApiScheduleRow): NormalizedGame {
  return {
    id: String(row.gameId),
    season: Number(row.season),
    week: Number(row.week),
    seasonType: String(row.seasonType ?? "regular"),
    startDate: row.startDate ?? null,
    completed: Boolean(row.completed),
    neutralSite: Boolean(row.neutralSite),
    conferenceGame: false,
    venue: null,
    homeTeam: row.homeTeam,
    homeConference: row.homeConference ?? null,
    homePoints: row.homePoints === null ? null : Number(row.homePoints),
    awayTeam: row.awayTeam,
    awayConference: row.awayConference ?? null,
    awayPoints: row.awayPoints === null ? null : Number(row.awayPoints),
  };
}

function profile(row: ApiProfileRow): Profile {
  return {
    season: Number(row.season),
    week: Number(row.week),
    team: row.team,
    gamesPlayed: Number(row.gamesPlayed),
    off: [row.offYpp, row.offYpa, row.offYpc, row.offPatt, row.offRatt].map(Number) as Profile["off"],
    def: [row.defYpp, row.defYpa, row.defYpc, row.defPatt, row.defRatt].map(Number) as Profile["def"],
    oi: [row.offYppIndex, row.offYpaIndex, row.offYpcIndex, row.offPattIndex, row.offRattIndex].map(Number) as Profile["oi"],
    di: [row.defYppIndex, row.defYpaIndex, row.defYpcIndex, row.defPattIndex, row.defRattIndex].map(Number) as Profile["di"],
    advanced: parseAdvancedProfile(row.advancedProfile),
  };
}

function sideSample(
  row: ApiScheduleRow,
  side: Side,
  stats: { ypp: number; ypa: number; ypc: number; patt: number; ratt: number; advanced: AdvancedSideProjection | null },
  outcomeMargin: number,
  outcomeBlend: number,
  scoringProjection: number,
  proofGap: number,
): Sample {
  const plays = stats.patt + stats.ratt;
  const advanced = stats.advanced;
  const completionRate = advanced?.pass.completionRate ?? clamp(stats.ypa / 11.8, 0.4, 0.8);
  const yardsPerCompletion = advanced?.pass.yardsPerCompletion ?? stats.ypa / Math.max(0.35, completionRate);
  const passingSuccessRate = advanced?.pass.passingSuccessRate ?? clamp(0.42 * (stats.ypa / 7.3) ** 0.45, 0.25, 0.62);
  const passingExplosiveness = advanced?.pass.passingExplosiveness ?? clamp(1.25 * (yardsPerCompletion / 11.8) ** 0.5, 0.65, 2.2);
  const lineYards = advanced?.run.lineYards ?? clamp(2.8 * (stats.ypc / 4.4) ** 0.6, 1.4, 4.5);
  const yardsBeyondLine = advanced?.run.yardsBeyondLine ?? Math.max(0.3, stats.ypc - lineYards);
  return {
    season: row.season,
    gameId: row.gameId,
    week: row.week,
    seasonType: row.seasonType,
    side,
    team: side === "home" ? row.homeTeam : row.awayTeam,
    points: Number(side === "home" ? row.homePoints : row.awayPoints),
    site: row.neutralSite ? 0 : side === "home" ? 1 : -1,
    ypp: stats.ypp,
    ypa: stats.ypa,
    ypc: stats.ypc,
    patt: stats.patt,
    ratt: stats.ratt,
    expectedYards: stats.ypp * plays,
    expectedYardsSquared: (stats.ypp * plays) ** 2 / 1000,
    passShare: stats.patt / Math.max(1, plays),
    completionRate,
    yardsPerCompletion,
    passingSuccessRate,
    passingExplosiveness,
    lineYards,
    yardsBeyondLine,
    advancedAvailable: advanced ? 1 : 0,
    scoringProjection,
    proofGap,
    outcomeMargin,
    outcomeBlend,
  };
}

type ScoringProfile = { baseline: number; offenseIndex: number; defenseIndex: number };

function geometricMean(values: number[]) {
  return values.length ? Math.exp(values.reduce((sum, value) => sum + Math.log(Math.max(0.05, value)), 0) / values.length) : 1;
}

/**
 * Builds a points-produced/points-allowed profile at the same weekly cutoff as
 * the matchup inputs. This captures scoring-opportunity conversion without
 * ever reading the points from the game being predicted.
 */
function buildPregameScoringProfiles(games: NormalizedGame[], eligibleTeams: Set<string>) {
  const snapshots = new Map<string, Map<string, ScoringProfile>>();
  const history: NormalizedGame[] = [];
  const phase = (game: NormalizedGame) => game.seasonType === "postseason" ? 1 : 0;
  const ordered = [...games].sort((a, b) => phase(a) - phase(b) || a.week - b.week || String(a.startDate).localeCompare(String(b.startDate)) || a.id.localeCompare(b.id));
  const groups = [...new Set(ordered.map((game) => `${phase(game)}:${game.week}`))];

  for (const group of groups) {
    const groupedGames = ordered.filter((game) => `${phase(game)}:${game.week}` === group);
    const completed = history.filter((game) => game.completed && game.homePoints !== null && game.awayPoints !== null);
    const teamSides = completed.flatMap((game) => [
      { team: game.homeTeam, opponent: game.awayTeam, points: Number(game.homePoints), allowed: Number(game.awayPoints) },
      { team: game.awayTeam, opponent: game.homeTeam, points: Number(game.awayPoints), allowed: Number(game.homePoints) },
    ]).filter((row) => eligibleTeams.has(row.team));
    const baseline = teamSides.length ? teamSides.reduce((sum, row) => sum + row.points, 0) / teamSides.length : 27;
    const raw = new Map<string, { offense: number; defense: number; games: number; opponents: string[] }>();
    for (const team of eligibleTeams) {
      const rows = teamSides.filter((row) => row.team === team);
      const gamesPlayed = rows.length;
      const offense = gamesPlayed ? rows.reduce((sum, row) => sum + row.points, 0) / gamesPlayed / Math.max(1, baseline) : 1;
      const defense = gamesPlayed ? rows.reduce((sum, row) => sum + row.allowed, 0) / gamesPlayed / Math.max(1, baseline) : 1;
      raw.set(team, { offense, defense, games: gamesPlayed, opponents: rows.map((row) => row.opponent) });
    }
    let adjustedOffense = new Map([...raw].map(([team, row]) => [team, row.offense]));
    let adjustedDefense = new Map([...raw].map(([team, row]) => [team, row.defense]));
    for (let iteration = 0; iteration < 5; iteration += 1) {
      const nextOffense = new Map<string, number>();
      const nextDefense = new Map<string, number>();
      for (const [team, row] of raw) {
        const opponentAverage = (source: Map<string, number>, fallback: number) => row.opponents.length
          ? row.opponents.reduce((sum, opponent) => sum + (source.get(opponent) ?? (eligibleTeams.has(opponent) ? 1 : fallback)), 0) / row.opponents.length
          : 1;
        nextOffense.set(team, row.offense / Math.max(0.6, opponentAverage(adjustedDefense, 1.22)));
        nextDefense.set(team, row.defense / Math.max(0.6, opponentAverage(adjustedOffense, 0.78)));
      }
      const offenseMean = geometricMean([...nextOffense.values()]);
      const defenseMean = geometricMean([...nextDefense.values()]);
      for (const [team, value] of nextOffense) nextOffense.set(team, value / offenseMean);
      for (const [team, value] of nextDefense) nextDefense.set(team, value / defenseMean);
      adjustedOffense = nextOffense;
      adjustedDefense = nextDefense;
    }
    const profiles = new Map<string, ScoringProfile>();
    for (const [team, row] of raw) {
      const blend = (observed: number, adjusted: number) => Math.exp(0.55 * Math.log(Math.max(0.05, observed)) + 0.45 * Math.log(Math.max(0.05, adjusted)));
      const priorGames = 1.5;
      const shrink = (value: number) => Math.exp(row.games * Math.log(Math.max(0.05, value)) / Math.max(1, row.games + priorGames));
      profiles.set(team, {
        baseline,
        offenseIndex: clamp(shrink(blend(row.offense, adjustedOffense.get(team) ?? row.offense)), 0.55, 1.65),
        defenseIndex: clamp(shrink(blend(row.defense, adjustedDefense.get(team) ?? row.defense)), 0.55, 1.65),
      });
    }
    for (const game of groupedGames) snapshots.set(game.id, profiles);
    // Weekly statistical profiles freeze at the end of the regular-season
    // archive, so every postseason round uses that same pre-bowl scoring form.
    history.push(...groupedGames.filter((game) => game.seasonType !== "postseason" && game.completed && game.homePoints !== null && game.awayPoints !== null));
  }
  return snapshots;
}

async function seasonSamples(season: number) {
  const schedulePromise = fetchJson<{ rows: ApiScheduleRow[] }>(`${baseUrl}?view=schedule&season=${season}&week=0`);
  const profilePayloadsPromise = concurrentMap(Array.from({ length: 17 }, (_, week) => week), 4, (week) =>
    fetchJson<{ rows: ApiProfileRow[] }>(`${baseUrl}?view=profiles&season=${season}&week=${week}`),
  );
  const [schedulePayload, profilePayloads] = await Promise.all([schedulePromise, profilePayloadsPromise]);
  const deduped = new Map<string, Profile>();
  for (const payload of profilePayloads) {
    for (const row of payload.rows ?? []) deduped.set(`${row.week}|${row.team}`, profile(row));
  }
  const profiles = [...deduped.values()];
  const maxProfileWeek = Math.max(0, ...profiles.map((row) => row.week));
  const eligibleTeams = new Set(profiles.map((row) => row.team));
  const schedule = schedulePayload.rows ?? [];
  const games = schedule.map(normalizedGame);
  const pregameElo = buildPregameElo(games, profiles.filter((row) => row.week === 0), eligibleTeams);
  const pregameEvidence = buildPregameMatchupEvidence(games, pregameElo, eligibleTeams);
  const pregameScoring = buildPregameScoringProfiles(games, eligibleTeams);
  const output: Sample[] = [];

  for (const row of schedule) {
    if (row.homePoints === null || row.awayPoints === null || !Boolean(row.completed)) continue;
    const marketWindow = row.week >= 5 || row.seasonType === "postseason";
    if (!marketWindow || !eligibleTeams.has(row.homeTeam) || !eligibleTeams.has(row.awayTeam)) continue;
    const generatedFromWeek = row.seasonType === "postseason" ? maxProfileWeek : Math.max(0, row.week - 1);
    const homeProfile = latestProfile(profiles, row.homeTeam, generatedFromWeek);
    const awayProfile = latestProfile(profiles, row.awayTeam, generatedFromWeek);
    if (!homeProfile || !awayProfile) continue;
    const ratings = pregameElo.get(String(row.gameId));
    const evidence = pregameEvidence.get(String(row.gameId));
    const prediction = project(
      homeProfile,
      awayProfile,
      Boolean(row.neutralSite),
      ratings?.get(row.homeTeam),
      ratings?.get(row.awayTeam),
      evidence?.get(row.homeTeam),
      evidence?.get(row.awayTeam),
    );
    const scoring = pregameScoring.get(String(row.gameId));
    const homeScoring = scoring?.get(row.homeTeam);
    const awayScoring = scoring?.get(row.awayTeam);
    const baseline = (homeScoring?.baseline ?? awayScoring?.baseline ?? 27);
    const homeScoringProjection = baseline * (homeScoring?.offenseIndex ?? 1) * (awayScoring?.defenseIndex ?? 1);
    const awayScoringProjection = baseline * (awayScoring?.offenseIndex ?? 1) * (homeScoring?.defenseIndex ?? 1);
    const proofScore = (value: typeof prediction.calibratedHome.evidence) =>
      0.4 * value.scheduleStrength + 0.2 * value.bestOpponentStrength + 0.25 * value.qualityWinStrength + 0.15 * value.reliability;
    const proofGap = proofScore(prediction.calibratedHome.evidence) - proofScore(prediction.calibratedAway.evidence);
    output.push(
      sideSample(row, "home", prediction.homeStats, prediction.outcomeMargin, prediction.outcomeBlend, homeScoringProjection, proofGap),
      sideSample(row, "away", prediction.awayStats, prediction.outcomeMargin, prediction.outcomeBlend, awayScoringProjection, proofGap),
    );
  }
  return output;
}

function solve(system: number[][], values: number[]) {
  const matrix = system.map((row, index) => [...row, values[index]]);
  for (let column = 0; column < matrix.length; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < matrix.length; row += 1) {
      if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) pivot = row;
    }
    [matrix[column], matrix[pivot]] = [matrix[pivot], matrix[column]];
    const divisor = matrix[column][column];
    if (Math.abs(divisor) < 1e-10) throw new Error("Singular regression matrix");
    for (let item = column; item <= matrix.length; item += 1) matrix[column][item] /= divisor;
    for (let row = 0; row < matrix.length; row += 1) {
      if (row === column) continue;
      const factor = matrix[row][column];
      for (let item = column; item <= matrix.length; item += 1) matrix[row][item] -= factor * matrix[column][item];
    }
  }
  return matrix.map((row) => row.at(-1) ?? 0);
}

function fit(samples: Sample[], candidate: Candidate, lambda: number): Regression {
  const means = candidate.features.map((feature) => samples.reduce((sum, sample) => sum + Number(sample[feature]), 0) / samples.length);
  const deviations = candidate.features.map((feature, index) => Math.sqrt(samples.reduce((sum, sample) => sum + (Number(sample[feature]) - means[index]) ** 2, 0) / Math.max(1, samples.length - 1)) || 1);
  const columns = candidate.features.length + 1;
  const xtx = Array.from({ length: columns }, () => Array(columns).fill(0) as number[]);
  const xty = Array(columns).fill(0) as number[];
  for (const sample of samples) {
    const row = [1, ...candidate.features.map((feature, index) => (Number(sample[feature]) - means[index]) / deviations[index])];
    const target = sample.points - (candidate.fixedSite ?? 0) * sample.site;
    for (let first = 0; first < columns; first += 1) {
      xty[first] += row[first] * target;
      for (let second = 0; second < columns; second += 1) xtx[first][second] += row[first] * row[second];
    }
  }
  // A microscopic floor keeps the normal equations invertible when a feature
  // set contains an exact arithmetic relationship (for example YPP being
  // reconstructed from YPA, YPC, and play mix). It is materially equivalent
  // to OLS at lambda=0, but avoids a singular floating-point solve.
  for (let index = 1; index < columns; index += 1) xtx[index][index] += Math.max(lambda, 1e-8);
  const standardized = solve(xtx, xty);
  const coefficients = Object.fromEntries(candidate.features.map((feature, index) => [feature, standardized[index + 1] / deviations[index]]));
  const intercept = standardized[0] - candidate.features.reduce((sum, feature, index) => sum + coefficients[feature] * means[index], 0);
  return { intercept, coefficients, lambda, fixedSite: candidate.fixedSite ?? 0 };
}

function predict(sample: Sample, model: Regression) {
  return Math.max(0, model.intercept + model.fixedSite * sample.site + Object.entries(model.coefficients).reduce((sum, [feature, coefficient]) => sum + coefficient * Number(sample[feature as FeatureKey]), 0));
}

function legacyPrediction(sample: Sample) {
  const base = scoreCoefficients.intercept
    + scoreCoefficients.ypc * sample.ypc
    + scoreCoefficients.ypp * sample.ypp
    + scoreCoefficients.ypa * sample.ypa
    + scoreCoefficients.ratt * sample.ratt
    + scoreCoefficients.patt * sample.patt;
  return Math.max(0, base + 0.75 * sample.site);
}

function evaluate(samples: Sample[], predictor: (sample: Sample) => number, proofWeight = 0) {
  const predictions = new Map(samples.map((sample) => [`${sample.gameId}|${sample.side}`, predictor(sample)]));
  const games = new Map<string, Sample[]>();
  for (const sample of samples) games.set(sample.gameId, [...(games.get(sample.gameId) ?? []), sample]);
  let squared = 0;
  let absolute = 0;
  let bias = 0;
  let totalError = 0;
  let marginError = 0;
  let straightUpWins = 0;
  let straightUpGraded = 0;
  let gameCount = 0;
  for (const sample of samples) {
    const error = (predictions.get(`${sample.gameId}|${sample.side}`) ?? 0) - sample.points;
    squared += error ** 2;
    absolute += Math.abs(error);
    bias += error;
  }
  for (const [gameId, sides] of games) {
    const home = sides.find((sample) => sample.side === "home");
    const away = sides.find((sample) => sample.side === "away");
    if (!home || !away) continue;
    const statisticalHome = predictions.get(`${gameId}|home`) ?? 0;
    const statisticalAway = predictions.get(`${gameId}|away`) ?? 0;
    const statisticalTotal = statisticalHome + statisticalAway;
    const statisticalMargin = statisticalHome - statisticalAway;
    const margin = (1 - home.outcomeBlend) * statisticalMargin + home.outcomeBlend * home.outcomeMargin + proofWeight * home.proofGap;
    const predictedHome = Math.max(0, statisticalTotal / 2 + margin / 2);
    const predictedAway = Math.max(0, statisticalTotal / 2 - margin / 2);
    const actualMargin = home.points - away.points;
    totalError += Math.abs(predictedHome + predictedAway - home.points - away.points);
    marginError += Math.abs(predictedHome - predictedAway - actualMargin);
    if (actualMargin !== 0) {
      straightUpGraded += 1;
      if (Math.sign(predictedHome - predictedAway) === Math.sign(actualMargin)) straightUpWins += 1;
    }
    gameCount += 1;
  }
  return {
    games: gameCount,
    sides: samples.length,
    scoreMae: absolute / Math.max(1, samples.length),
    scoreRmse: Math.sqrt(squared / Math.max(1, samples.length)),
    bias: bias / Math.max(1, samples.length),
    totalMae: totalError / Math.max(1, gameCount),
    marginMae: marginError / Math.max(1, gameCount),
    straightUp: straightUpWins / Math.max(1, straightUpGraded),
  };
}

function averageMetrics(values: ReturnType<typeof evaluate>[]) {
  const keys = ["scoreMae", "scoreRmse", "bias", "totalMae", "marginMae", "straightUp"] as const;
  return Object.fromEntries(keys.map((key) => [key, values.reduce((sum, value) => sum + value[key], 0) / values.length]));
}

function roundRecord<T extends Record<string, unknown>>(record: T) {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, typeof value === "number" ? Number(value.toFixed(5)) : value]));
}

const samples = (await concurrentMap([...seasons], 2, seasonSamples)).flat();
const training = samples.filter((sample) => trainingSeasons.has(sample.season));
const holdout = samples.filter((sample) => sample.season === holdoutSeason);
const reports: Array<Record<string, unknown>> = [];

for (const candidate of candidates) {
  let best: { lambda: number; score: number; metrics: ReturnType<typeof averageMetrics> } | null = null;
  for (const lambda of lambdas) {
    const foldMetrics = [...trainingSeasons].map((season) => {
      const model = fit(training.filter((sample) => sample.season !== season), candidate, lambda);
      return evaluate(training.filter((sample) => sample.season === season), (sample) => predict(sample, model));
    });
    const metrics = averageMetrics(foldMetrics);
    const score = metrics.scoreRmse + 0.15 * metrics.totalMae + 0.15 * metrics.marginMae;
    if (!best || score < best.score) best = { lambda, score, metrics };
  }
  const model = fit(training, candidate, best!.lambda);
  reports.push({
    candidate: candidate.name,
    features: candidate.features,
    selectedLambda: best!.lambda,
    crossValidation: roundRecord(best!.metrics),
    coefficients: roundRecord({ intercept: model.intercept, ...model.coefficients, fixedSite: model.fixedSite }),
    holdout2025: roundRecord(evaluate(holdout, (sample) => predict(sample, model))),
  });
}

const legacy = {
  candidate: "current-workbook-formula",
  coefficients: { ...scoreCoefficients, site: 0.75 },
  training2021to2024: roundRecord(evaluate(training, legacyPrediction)),
  holdout2025: roundRecord(evaluate(holdout, legacyPrediction)),
};

const selectedCandidate = candidates.find((candidate) => candidate.name === "scoring-anchor-curve-fixed-hfa")!;
const selectedLambda = Number(reports.find((report) => report.candidate === selectedCandidate.name)?.selectedLambda ?? 3);
const proofWeights = [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20];
const selectedProof = proofWeights.map((weight) => {
  const folds = [...trainingSeasons].map((season) => {
    const model = fit(training.filter((sample) => sample.season !== season), selectedCandidate, selectedLambda);
    return evaluate(training.filter((sample) => sample.season === season), (sample) => predict(sample, model), weight);
  });
  const metrics = averageMetrics(folds);
  return { weight, metrics, score: metrics.marginMae };
}).sort((a, b) => a.score - b.score)[0];
const selectedSeasonValidation = Object.fromEntries(seasons.map((season) => {
  const seasonRows = samples.filter((sample) => sample.season === season);
  const fitRows = season === holdoutSeason
    ? training
    : training.filter((sample) => sample.season !== season);
  const model = fit(fitRows, selectedCandidate, selectedLambda);
  return [season, {
    evaluation: season === holdoutSeason ? "untouched holdout" : "leave-one-season-out",
    legacy: roundRecord(evaluate(seasonRows, legacyPrediction)),
    selected: roundRecord(evaluate(seasonRows, (sample) => predict(sample, model), selectedProof.weight)),
  }];
}));

const bySeason = Object.fromEntries(seasons.map((season) => [season, {
  games: samples.filter((sample) => sample.season === season).length / 2,
  sidesWithAdvanced: samples.filter((sample) => sample.season === season && sample.advancedAvailable).length,
  legacy: roundRecord(evaluate(samples.filter((sample) => sample.season === season), legacyPrediction)),
}]));

console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  validation: "FBS-vs-FBS games; week 5 onward plus postseason; prior-week profiles only; 2025 untouched holdout",
  sampleCount: samples.length,
  gameCount: samples.length / 2,
  bySeason,
  legacy,
  selectedModel: {
    candidate: selectedCandidate.name,
    lambda: selectedLambda,
    proofWeight: selectedProof.weight,
    proofCrossValidation: roundRecord(selectedProof.metrics),
    seasonValidation: selectedSeasonValidation,
  },
  candidates: reports,
}, null, 2));
