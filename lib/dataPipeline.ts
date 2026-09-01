import { baselines, modelCalibration } from "../app/modelData";
import { buildWeeklyAdvancedProfiles, type AdvancedGameComponentRow, type WeeklyAdvancedProfile } from "./advancedProfileBuilder";
import { parseAdvancedProfile, type AdvancedProfile } from "./advancedMetrics";
import { buildMatchupEvidence, projectCalibratedMatchup, type MatchupEvidence } from "./matchupModel";
import { evaluateMarketProjection } from "./marketModel";
import { isStoredMarketLineQuarantined, selectMarketLineCandidate, wilsonConfidenceInterval, type MarketLineCandidate } from "./marketLineQuality";
import { refreshViabilityCalibrationFromDatabase } from "./offensiveViability";
import {
  buildPreseasonStateTransition,
  calculateFinalEloRatings,
  PRESEASON_TRANSITION_V2,
  type PreseasonHistoryRow,
  type PreseasonTransitionDiagnostic,
  type PreseasonTransitionInput,
  type PreseasonTransitionProfile,
} from "./preseasonTransition";

export type PipelineEnv = { DB: D1Database; CFBD_API_KEY?: string; SYNC_TOKEN?: string };
export type SyncTrigger = "manual" | "scheduled" | "bootstrap";

type JsonRecord = Record<string, unknown>;
export type NormalizedGame = {
  id: string; season: number; week: number; seasonType: string; startDate: string | null;
  completed: boolean; neutralSite: boolean; conferenceGame: boolean; venue: string | null;
  homeTeam: string; homeConference: string | null; homePoints: number | null;
  awayTeam: string; awayConference: string | null; awayPoints: number | null;
};
export type NormalizedStat = {
  gameId: string; season: number; week: number; team: string; opponent: string; homeAway: string;
  points: number | null; totalYards: number; yardsPerPlay: number; passYards: number; passAttempts: number; passCompletions: number | null;
  yardsPerPass: number; rushYards: number; rushAttempts: number; yardsPerRush: number; turnovers: number;
};
export type NormalizedAdvancedStat = AdvancedGameComponentRow;
export type Profile = {
  season: number; week: number; team: string; gamesPlayed: number;
  off: [number, number, number, number, number]; def: [number, number, number, number, number];
  oi: [number, number, number, number, number]; di: [number, number, number, number, number];
  advanced?: AdvancedProfile | null;
  preseasonElo?: number;
  transitionDiagnostic?: PreseasonTransitionDiagnostic;
};
type Line = {
  gameId: string; season: number; week: number; provider: string | null; spread: number | null;
  spreadOpen: number | null; formattedSpread: string | null; overUnder: number | null;
  overUnderOpen: number | null; homeMoneyline: number | null; awayMoneyline: number | null;
};

export type PreseasonInput = {
  season: number; team: string; conference: string | null;
  returningPpa: number | null; returningPassingPpa: number | null; returningReceivingPpa: number | null; returningRushingPpa: number | null;
  returningUsage: number | null; returningPassingUsage: number | null; returningReceivingUsage: number | null; returningRushingUsage: number | null;
  recruitingRank: number | null; recruitingPoints: number | null;
};

export const MODEL_VERSION = "harper-plus-v16-preseason-state-transition";
export const ADVANCED_COMPONENT_VERSION = 3;
const BASE_URL = "https://api.collegefootballdata.com";
export const FIRST_HISTORICAL_SEASON = 2014;
// Historical repair is intentionally single-flight. A 75-second D1 lease keeps
// cron and several open browsers from starting overlapping jobs. Once a job
// owns that lease it may process a small, paced batch so archive throughput no
// longer depends on the hosting tier delivering every scheduled invocation.
export const ARCHIVE_REPAIR_COOLDOWN_SECONDS = 75;
export const ARCHIVE_BATCH_MAX_SLICES = 8;
export const ARCHIVE_BATCH_PAUSE_MS = 2000;
const average = (values: readonly number[]) => values.reduce((sum, value) => sum + Number(value), 0) / Math.max(1, values.length);

export function scheduleCalibrationWeights(gamesPlayed: number, fbsOpponents: number, credibleOpponentEvidence = 1) {
  const games = Math.max(0, gamesPlayed);
  const fbsShare = games ? Math.max(0, Math.min(1, fbsOpponents / games)) : 0;
  const weakScheduleShare = 1 - fbsShare;
  const earlySeasonShare = Math.max(0, Math.min(1, (4 - games) / 4));
  const untestedScheduleShare = 1 - Math.max(0, Math.min(1, credibleOpponentEvidence));
  return {
    fbsShare,
    opponentAdjustment: Math.min(
      modelCalibration.maxOpponentAdjustment,
      modelCalibration.opponentAdjustment + weakScheduleShare * 0.22 + earlySeasonShare * 0.05 + untestedScheduleShare * modelCalibration.untestedOpponentAdjustment,
    ),
    priorGames:
      modelCalibration.preseasonEquivalentGames +
      weakScheduleShare * modelCalibration.weakSchedulePriorGames +
      earlySeasonShare * modelCalibration.earlySeasonPriorGames +
      untestedScheduleShare * modelCalibration.untestedSchedulePriorGames,
  };
}

function value(record: JsonRecord, ...keys: string[]) {
  for (const key of keys) if (record[key] !== undefined && record[key] !== null) return record[key];
  return undefined;
}

function textValue(record: JsonRecord, ...keys: string[]) {
  const result = value(record, ...keys);
  return result === undefined ? null : String(result);
}

function numberValue(record: JsonRecord, ...keys: string[]) {
  const result = value(record, ...keys);
  if (result === undefined || result === "") return null;
  const numeric = typeof result === "number" ? result : Number(String(result).replace(/,/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function boolValue(record: JsonRecord, ...keys: string[]) {
  const result = value(record, ...keys);
  return result === true || result === 1 || result === "true";
}

function asRecords(input: unknown): JsonRecord[] {
  return Array.isArray(input) ? input.filter((item): item is JsonRecord => Boolean(item && typeof item === "object")) : [];
}

function normalizeCategory(category: string) {
  return category.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseCompletionAttempts(input: unknown) {
  if (typeof input === "number") return { completions: null, attempts: input };
  const stringValue = String(input ?? "");
  const separator = stringValue.includes("-") ? "-" : stringValue.includes("/") ? "/" : null;
  if (separator) {
    const values = stringValue.split(separator).map((part) => Number(part.trim()));
    const completions = Number.isFinite(values[0]) ? values[0] : null;
    const attempts = Number.isFinite(values.at(-1)) ? Number(values.at(-1)) : 0;
    return { completions, attempts };
  }
  return { completions: null, attempts: Number(stringValue) || 0 };
}

function pause(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export class CollegeFootballDataError extends Error {
  status: number;
  retryAfterSeconds: number;

  constructor(path: string, status: number, detail = "", retryAfterSeconds = 0) {
    super(`CollegeFootballData ${path} returned ${status}${detail ? `: ${detail}` : ""}`);
    this.name = "CollegeFootballDataError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function retryDelaySeconds(response: Response) {
  const header = response.headers.get("retry-after")?.trim();
  if (!header) return 12;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds);
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(1, Math.ceil((date - Date.now()) / 1000)) : 12;
}

export async function cfbd(path: string, key: string, params: Record<string, string | number | undefined>) {
  const url = new URL(path, BASE_URL);
  for (const [name, parameter] of Object.entries(params)) if (parameter !== undefined) url.searchParams.set(name, String(parameter));
  const response = await fetch(url, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } });
  const body = await response.text().catch(() => "");
  const detail = body.replace(/\s+/g, " ").trim().slice(0, 240);
  if (!response.ok) {
    throw new CollegeFootballDataError(path, response.status, detail, response.status === 429 ? retryDelaySeconds(response) : 0);
  }
  try {
    return body ? JSON.parse(body) as unknown : [];
  } catch {
    throw new CollegeFootballDataError(path, 502, `expected JSON but received ${detail || "an empty response"}`);
  }
}

async function cfbdOptional(path: string, key: string, params: Record<string, string | number | undefined>) {
  try {
    return await cfbd(path, key, params);
  } catch (error) {
    if (error instanceof CollegeFootballDataError && error.status === 429) throw error;
    // Market data should enrich a model run, never prevent the core schedule,
    // box scores, weekly profiles, and team identities from being stored.
    return [];
  }
}

function normalizeGames(payload: unknown, season: number): NormalizedGame[] {
  return asRecords(payload).map((game) => ({
    id: String(value(game, "id", "gameId", "game_id") ?? ""),
    season: numberValue(game, "season") ?? season,
    week: numberValue(game, "week") ?? 0,
    seasonType: textValue(game, "seasonType", "season_type") ?? "regular",
    startDate: textValue(game, "startDate", "start_date"),
    completed: boolValue(game, "completed") || numberValue(game, "homePoints", "home_points") !== null,
    neutralSite: boolValue(game, "neutralSite", "neutral_site"),
    conferenceGame: boolValue(game, "conferenceGame", "conference_game"),
    venue: textValue(game, "venue"),
    homeTeam: textValue(game, "homeTeam", "home_team") ?? "",
    homeConference: textValue(game, "homeConference", "home_conference"),
    homePoints: numberValue(game, "homePoints", "home_points"),
    awayTeam: textValue(game, "awayTeam", "away_team") ?? "",
    awayConference: textValue(game, "awayConference", "away_conference"),
    awayPoints: numberValue(game, "awayPoints", "away_points"),
  })).filter((game) => game.id && game.homeTeam && game.awayTeam);
}

function statMap(stats: unknown) {
  const map = new Map<string, unknown>();
  for (const item of asRecords(stats)) {
    const category = textValue(item, "category", "name", "statType") ?? "";
    map.set(normalizeCategory(category), value(item, "stat", "value", "amount"));
  }
  return map;
}

function pickStat(map: Map<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const raw = map.get(normalizeCategory(key));
    if (raw !== undefined) return Number(String(raw).replace(/,/g, "")) || 0;
  }
  return 0;
}

export function normalizeStats(payload: unknown, games: NormalizedGame[], season: number): NormalizedStat[] {
  const gamesById = new Map(games.map((game) => [game.id, game]));
  const output: NormalizedStat[] = [];
  for (const gameStat of asRecords(payload)) {
    const gameId = String(value(gameStat, "id", "gameId", "game_id") ?? "");
    const game = gamesById.get(gameId);
    const teamRows = asRecords(value(gameStat, "teams", "teamStats"));
    for (const teamRow of teamRows) {
      const team = textValue(teamRow, "school", "team") ?? "";
      if (!team) continue;
      const homeAway = textValue(teamRow, "homeAway", "home_away") ?? (game?.homeTeam === team ? "home" : "away");
      const opponent = game ? (game.homeTeam === team ? game.awayTeam : game.homeTeam) : (teamRows.find((candidate) => textValue(candidate, "school", "team") !== team) ? textValue(teamRows.find((candidate) => textValue(candidate, "school", "team") !== team)!, "school", "team") ?? "" : "");
      const categories = statMap(value(teamRow, "stats", "statistics"));
      const completionAttempts = parseCompletionAttempts(categories.get("completionattempts") ?? categories.get("passingcompletionsattempts") ?? categories.get("passattempts"));
      const passAttempts = completionAttempts.attempts;
      const rushAttempts = pickStat(categories, "rushingAttempts", "rushAttempts");
      const passYards = pickStat(categories, "netPassingYards", "passingYards", "passYards");
      const rushYards = pickStat(categories, "rushingYards", "rushYards");
      const totalYards = pickStat(categories, "totalYards") || passYards + rushYards;
      const plays = passAttempts + rushAttempts;
      output.push({
        gameId, season: game?.season ?? season, week: game?.week ?? numberValue(gameStat, "week") ?? 0,
        team, opponent, homeAway, points: numberValue(teamRow, "points"), totalYards,
        yardsPerPlay: plays ? totalYards / plays : 0, passYards, passAttempts, passCompletions: completionAttempts.completions,
        yardsPerPass: passAttempts ? passYards / passAttempts : 0, rushYards, rushAttempts,
        yardsPerRush: rushAttempts ? rushYards / rushAttempts : 0,
        turnovers: pickStat(categories, "turnovers", "turnoversLost"),
      });
    }
  }
  return output.filter((row) => row.gameId && row.week > 0);
}

function nestedRecord(record: JsonRecord, ...keys: string[]) {
  const nested = value(record, ...keys);
  return nested && typeof nested === "object" ? nested as JsonRecord : {};
}

function nullableMetric(record: JsonRecord, ...keys: string[]) {
  return numberValue(record, ...keys);
}

export function normalizeAdvancedStats(payload: unknown, games: NormalizedGame[], season: number): NormalizedAdvancedStat[] {
  const gamesById = new Map(games.map((game) => [game.id, game]));
  return asRecords(payload).flatMap((row) => {
    const gameId = String(value(row, "gameId", "game_id", "id") ?? "");
    const game = gamesById.get(gameId);
    const team = textValue(row, "team") ?? "";
    const opponent = textValue(row, "opponent") ?? (game ? (game.homeTeam === team ? game.awayTeam : game.homeTeam) : "");
    if (!gameId || !team || !opponent || !game) return [];
    const offense = nestedRecord(row, "offense");
    const defense = nestedRecord(row, "defense");
    const offensePassing = nestedRecord(offense, "passingPlays", "passing_plays");
    const defensePassing = nestedRecord(defense, "passingPlays", "passing_plays");
    const offenseRushing = nestedRecord(offense, "rushingPlays", "rushing_plays");
    const defenseRushing = nestedRecord(defense, "rushingPlays", "rushing_plays");
    const offenseStandard = nestedRecord(offense, "standardDowns", "standard_downs");
    const defenseStandard = nestedRecord(defense, "standardDowns", "standard_downs");
    const offensePassingDowns = nestedRecord(offense, "passingDowns", "passing_downs");
    const defensePassingDowns = nestedRecord(defense, "passingDowns", "passing_downs");
    return [{
      gameId,
      season: numberValue(row, "season") ?? season,
      week: numberValue(row, "week") ?? game.week,
      team,
      opponent,
      offSuccessRate: nullableMetric(offense, "successRate", "success_rate"),
      offExplosiveness: nullableMetric(offense, "explosiveness"),
      offPpa: nullableMetric(offense, "ppa"),
      offDrives: nullableMetric(offense, "drives"),
      offPlays: nullableMetric(offense, "plays"),
      offLineYards: nullableMetric(offense, "lineYards", "line_yards"),
      offSecondLevelYards: nullableMetric(offense, "secondLevelYards", "second_level_yards"),
      offOpenFieldYards: nullableMetric(offense, "openFieldYards", "open_field_yards"),
      offStuffRate: nullableMetric(offense, "stuffRate", "stuff_rate"),
      offPowerSuccess: nullableMetric(offense, "powerSuccess", "power_success"),
      offRushingSuccessRate: nullableMetric(offenseRushing, "successRate", "success_rate"),
      offRushingExplosiveness: nullableMetric(offenseRushing, "explosiveness"),
      offRushingPpa: nullableMetric(offenseRushing, "ppa"),
      offPassingSuccessRate: nullableMetric(offensePassing, "successRate", "success_rate"),
      offPassingExplosiveness: nullableMetric(offensePassing, "explosiveness"),
      offPassingPpa: nullableMetric(offensePassing, "ppa"),
      offStandardDownSuccessRate: nullableMetric(offenseStandard, "successRate", "success_rate"),
      offStandardDownExplosiveness: nullableMetric(offenseStandard, "explosiveness"),
      offStandardDownPpa: nullableMetric(offenseStandard, "ppa"),
      offPassingDownSuccessRate: nullableMetric(offensePassingDowns, "successRate", "success_rate"),
      offPassingDownExplosiveness: nullableMetric(offensePassingDowns, "explosiveness"),
      offPassingDownPpa: nullableMetric(offensePassingDowns, "ppa"),
      defLineYards: nullableMetric(defense, "lineYards", "line_yards"),
      defSecondLevelYards: nullableMetric(defense, "secondLevelYards", "second_level_yards"),
      defOpenFieldYards: nullableMetric(defense, "openFieldYards", "open_field_yards"),
      defStuffRate: nullableMetric(defense, "stuffRate", "stuff_rate"),
      defPowerSuccess: nullableMetric(defense, "powerSuccess", "power_success"),
      defRushingSuccessRate: nullableMetric(defenseRushing, "successRate", "success_rate"),
      defRushingExplosiveness: nullableMetric(defenseRushing, "explosiveness"),
      defRushingPpa: nullableMetric(defenseRushing, "ppa"),
      defPassingSuccessRate: nullableMetric(defensePassing, "successRate", "success_rate"),
      defPassingExplosiveness: nullableMetric(defensePassing, "explosiveness"),
      defPassingPpa: nullableMetric(defensePassing, "ppa"),
      defStandardDownSuccessRate: nullableMetric(defenseStandard, "successRate", "success_rate"),
      defStandardDownExplosiveness: nullableMetric(defenseStandard, "explosiveness"),
      defStandardDownPpa: nullableMetric(defenseStandard, "ppa"),
      defPassingDownSuccessRate: nullableMetric(defensePassingDowns, "successRate", "success_rate"),
      defPassingDownExplosiveness: nullableMetric(defensePassingDowns, "explosiveness"),
      defPassingDownPpa: nullableMetric(defensePassingDowns, "ppa"),
      defSuccessRate: nullableMetric(defense, "successRate", "success_rate"),
      defExplosiveness: nullableMetric(defense, "explosiveness"),
      defPpa: nullableMetric(defense, "ppa"),
      defDrives: nullableMetric(defense, "drives"),
      defPlays: nullableMetric(defense, "plays"),
    }];
  }).filter((row) => row.week > 0);
}

export function mergeHavocStats(rows: NormalizedAdvancedStat[], payload: unknown) {
  const havoc = new Map<string, { offense: JsonRecord; defense: JsonRecord }>();
  for (const row of asRecords(payload)) {
    const gameId = String(value(row, "gameId", "game_id", "id") ?? "");
    const team = textValue(row, "team") ?? "";
    if (!gameId || !team) continue;
    havoc.set(`${gameId}|${team}`, {
      offense: nestedRecord(row, "offense"),
      defense: nestedRecord(row, "defense"),
    });
  }
  const rate = (side: JsonRecord, ...keys: string[]) => nullableMetric(side, ...keys);
  return rows.map((row) => {
    const value = havoc.get(`${row.gameId}|${row.team}`);
    if (!value) return row;
    return {
      ...row,
      offHavocRate: rate(value.offense, "havocRate", "havoc_rate", "totalHavocRate", "total_havoc_rate"),
      offFrontSevenHavoc: rate(value.offense, "frontSevenHavocRate", "front_seven_havoc_rate"),
      offDbHavoc: rate(value.offense, "dbHavocRate", "db_havoc_rate"),
      defHavocRate: rate(value.defense, "havocRate", "havoc_rate", "totalHavocRate", "total_havoc_rate"),
      defFrontSevenHavoc: rate(value.defense, "frontSevenHavocRate", "front_seven_havoc_rate"),
      defDbHavoc: rate(value.defense, "dbHavocRate", "db_havoc_rate"),
    };
  });
}

export function mergeSeasonAdvancedContext(rows: NormalizedAdvancedStat[], payload: unknown) {
  const byTeam=new Map(asRecords(payload).map((row)=>[textValue(row,"team")??"",row]));
  const latestWeek=new Map<string,number>();
  for(const row of rows) latestWeek.set(row.team,Math.max(latestWeek.get(row.team)??0,row.week));
  return rows.map((row)=>{
    const seasonRow=byTeam.get(row.team);
    if(!seasonRow||row.week!==(latestWeek.get(row.team)??0)) return row;
    const offense=nestedRecord(seasonRow,"offense");
    const defense=nestedRecord(seasonRow,"defense");
    const offenseField=nestedRecord(offense,"fieldPosition","field_position");
    const defenseField=nestedRecord(defense,"fieldPosition","field_position");
    const offenseHavoc=nestedRecord(offense,"havoc");
    const defenseHavoc=nestedRecord(defense,"havoc");
    return {
      ...row,
      offFieldPosition:nullableMetric(offenseField,"averageStart","average_start"),
      defFieldPosition:nullableMetric(defenseField,"averageStart","average_start"),
      offHavocRate:row.offHavocRate??nullableMetric(offenseHavoc,"total","havocRate","havoc_rate"),
      offFrontSevenHavoc:row.offFrontSevenHavoc??nullableMetric(offenseHavoc,"frontSeven","front_seven"),
      offDbHavoc:row.offDbHavoc??nullableMetric(offenseHavoc,"db","defensiveBack","defensive_back"),
      defHavocRate:row.defHavocRate??nullableMetric(defenseHavoc,"total","havocRate","havoc_rate"),
      defFrontSevenHavoc:row.defFrontSevenHavoc??nullableMetric(defenseHavoc,"frontSeven","front_seven"),
      defDbHavoc:row.defDbHavoc??nullableMetric(defenseHavoc,"db","defensiveBack","defensive_back"),
    };
  });
}

function normalizeLines(payload: unknown, season: number): Line[] {
  return asRecords(payload).map((game) => {
    const options = asRecords(value(game, "lines"));
    const candidates = options.map((option): MarketLineCandidate => ({
      provider: textValue(option, "provider"),
      spread: numberValue(option, "spread"),
      spreadOpen: numberValue(option, "spreadOpen", "spread_open"),
      formattedSpread: textValue(option, "formattedSpread", "formatted_spread"),
      overUnder: numberValue(option, "overUnder", "over_under"),
      overUnderOpen: numberValue(option, "overUnderOpen", "over_under_open"),
      homeMoneyline: numberValue(option, "homeMoneyline", "home_moneyline"),
      awayMoneyline: numberValue(option, "awayMoneyline", "away_moneyline"),
    }));
    const selected = selectMarketLineCandidate(numberValue(game, "season") ?? season, candidates);
    return {
      gameId: String(value(game, "id", "gameId", "game_id") ?? ""), season: numberValue(game, "season") ?? season,
      week: numberValue(game, "week") ?? 0, provider: selected?.provider ?? null,
      spread: selected?.spread ?? null, spreadOpen: selected?.spreadOpen ?? null,
      formattedSpread: selected?.formattedSpread ?? null,
      overUnder: selected?.overUnder ?? null, overUnderOpen: selected?.overUnderOpen ?? null,
      homeMoneyline: selected?.homeMoneyline ?? null, awayMoneyline: selected?.awayMoneyline ?? null,
    };
  }).filter((line) => line.gameId);
}

function normalizeTeams(payload: unknown, season: number) {
  return asRecords(payload).filter((team) => Boolean(textValue(team, "school"))).map((team) => {
    const location = (value(team, "location") ?? {}) as JsonRecord;
    const logos = value(team, "logos");
    const teamId = String(value(team, "id") ?? "");
    const suppliedLogo = Array.isArray(logos) ? String(logos[0] ?? "") : textValue(location, "logo");
    const logo = suppliedLogo || (teamId ? `https://a.espncdn.com/i/teamlogos/ncaa/500/${teamId}.png` : null);
    return {
      season,
      team: textValue(team, "school") ?? "",
      teamId,
      abbreviation: textValue(team, "abbreviation"),
      mascot: textValue(team, "mascot"),
      conference: textValue(team, "conference"),
      color: textValue(team, "color"),
      altColor: textValue(team, "altColor", "alt_color"),
      logo,
    };
  });
}

export function normalizePreseasonInputs(returningPayload: unknown, recruitingPayload: unknown, season: number, eligibleTeams: Set<string>): PreseasonInput[] {
  const returningByTeam = new Map(asRecords(returningPayload).map((row) => [textValue(row, "team") ?? "", row]));
  const recruitingByTeam = new Map(asRecords(recruitingPayload).map((row) => [textValue(row, "team") ?? "", row]));
  const metric = (row: JsonRecord | undefined, ...keys: string[]) => row ? numberValue(row, ...keys) : null;
  return [...eligibleTeams].sort().map((team) => {
    const returning = returningByTeam.get(team);
    const recruiting = recruitingByTeam.get(team);
    return {
      season,
      team,
      conference: returning ? textValue(returning, "conference") : null,
      returningPpa: metric(returning, "percentPPA", "percent_ppa", "returningPPA", "returning_ppa"),
      returningPassingPpa: metric(returning, "percentPassingPPA", "percent_passing_ppa", "returningPassingPPA"),
      returningReceivingPpa: metric(returning, "percentReceivingPPA", "percent_receiving_ppa", "returningReceivingPPA"),
      returningRushingPpa: metric(returning, "percentRushingPPA", "percent_rushing_ppa", "returningRushingPPA"),
      returningUsage: metric(returning, "usage", "returningUsage", "returning_usage"),
      returningPassingUsage: metric(returning, "passingUsage", "passing_usage", "returningPassingUsage"),
      returningReceivingUsage: metric(returning, "receivingUsage", "receiving_usage", "returningReceivingUsage"),
      returningRushingUsage: metric(returning, "rushingUsage", "rushing_usage", "returningRushingUsage"),
      recruitingRank: metric(recruiting, "rank"),
      recruitingPoints: metric(recruiting, "points", "rating"),
    };
  });
}

async function fetchPreseasonInputs(key: string, season: number, eligibleTeams: Set<string>) {
  // Returning production and recruiting are independent enrichments. CFBD can
  // legitimately leave one unavailable for a future season or API tier. A
  // missing optional feed must not pin the entire archive at the priors gate,
  // while authentication, malformed-request, server, and rate-limit failures
  // still surface for a bounded retry instead of being silently cached.
  const optionalPriorFeed = async (path: string) => {
    try {
      return await cfbd(path, key, { year: season });
    } catch (error) {
      if (error instanceof CollegeFootballDataError && (error.status === 403 || error.status === 404)) return [];
      throw error;
    }
  };
  const returningPayload = await optionalPriorFeed("/player/returning");
  await pause(1600);
  const recruitingPayload = await optionalPriorFeed("/recruiting/teams");
  return normalizePreseasonInputs(returningPayload, recruitingPayload, season, eligibleTeams);
}

function buildProfiles(games: NormalizedGame[], rows: NormalizedStat[], season: number, eligibleTeams: Set<string>, preseasonProfiles: Profile[] = []) {
  const completedIds = new Set(games.filter((game) => game.completed && game.seasonType !== "postseason").map((game) => game.id));
  const completed = rows.filter((row) => completedIds.has(row.gameId));
  const rowByGameTeam = new Map(completed.map((row) => [`${row.gameId}|${row.team}`, row]));
  const maxWeek = Math.max(0, ...completed.map((row) => row.week));
  const preseasonByTeam = new Map(preseasonProfiles.map((profile) => [profile.team, profile]));
  const profiles: Profile[] = [];
  for (let week = 1; week <= maxWeek; week += 1) {
    const throughWeek = completed.filter((row) => row.week <= week);
    const fbsThroughWeek = throughWeek.filter((row) => eligibleTeams.has(row.team));
    const national = { games: fbsThroughWeek.length, yards: 0, passYards: 0, passAttempts: 0, rushYards: 0, rushAttempts: 0 };
    for (const row of fbsThroughWeek) {
      national.yards += row.totalYards; national.passYards += row.passYards; national.passAttempts += row.passAttempts;
      national.rushYards += row.rushYards; national.rushAttempts += row.rushAttempts;
    }
    const nationalValues: [number, number, number, number, number] = [
      national.yards / Math.max(1, national.passAttempts + national.rushAttempts),
      national.passYards / Math.max(1, national.passAttempts), national.rushYards / Math.max(1, national.rushAttempts),
      national.passAttempts / Math.max(1, national.games), national.rushAttempts / Math.max(1, national.games),
    ];
    const teams = [...new Set(fbsThroughWeek.map((row) => row.team))];
    const rawProfiles = new Map<string, Profile>();
    for (const team of teams) {
      const teamRows = throughWeek.filter((row) => row.team === team);
      const opponentRows = teamRows.map((row) => rowByGameTeam.get(`${row.gameId}|${row.opponent}`)).filter((row): row is NormalizedStat => Boolean(row));
      const aggregate = (source: NormalizedStat[]): [number, number, number, number, number] => {
        const yards = source.reduce((sum, row) => sum + row.totalYards, 0);
        const py = source.reduce((sum, row) => sum + row.passYards, 0);
        const pa = source.reduce((sum, row) => sum + row.passAttempts, 0);
        const ry = source.reduce((sum, row) => sum + row.rushYards, 0);
        const ra = source.reduce((sum, row) => sum + row.rushAttempts, 0);
        return [yards / Math.max(1, pa + ra), py / Math.max(1, pa), ry / Math.max(1, ra), pa / Math.max(1, source.length), ra / Math.max(1, source.length)];
      };
      const off = aggregate(teamRows);
      const def = aggregate(opponentRows);
      const indexTuple = (raw: [number, number, number, number, number]) => raw.map((metric, index) => metric / Math.max(0.0001, nationalValues[index])) as [number, number, number, number, number];
      rawProfiles.set(team, { season, week, team, gamesPlayed: teamRows.length, off, def, oi: indexTuple(off), di: indexTuple(def) });
    }

    // A raw national-average index rewards teams that accumulated production
    // against weak opponents. Solve offense and defense together, then apply a
    // reliability-aware partial correction. FBS-connected schedules retain the
    // stable 25% base; FCS-heavy and early schedules receive more correction
    // and more prior-season shrinkage instead of being mistaken for elite form.
    let adjustedOffense = new Map([...rawProfiles].map(([team, profile]) => [team, [...profile.oi] as Profile["oi"]]));
    let adjustedDefense = new Map([...rawProfiles].map(([team, profile]) => [team, [...profile.di] as Profile["di"]]));
    for (let iteration = 0; iteration < modelCalibration.iterations; iteration += 1) {
      const nextOffense = new Map<string, Profile["oi"]>();
      const nextDefense = new Map<string, Profile["di"]>();
      for (const [team, profile] of rawProfiles) {
        const opponents = throughWeek.filter((row) => row.team === team).map((row) => row.opponent).filter(Boolean);
        const opponentAverage = (source: Map<string, Profile["oi"]>, metric: number, fcsFallback: number) => {
          if (!opponents.length) return 1;
          return opponents.reduce((sum, opponent) => sum + (source.get(opponent)?.[metric] ?? (eligibleTeams.has(opponent) ? 1 : fcsFallback)), 0) / opponents.length;
        };
        nextOffense.set(team, profile.oi.map((metric, index) => index < 3 ? metric / Math.max(0.6, opponentAverage(adjustedDefense, index, modelCalibration.fcsDefenseIndex)) : metric) as Profile["oi"]);
        nextDefense.set(team, profile.di.map((metric, index) => index < 3 ? metric / Math.max(0.6, opponentAverage(adjustedOffense, index, modelCalibration.fcsOffenseIndex)) : metric) as Profile["di"]);
      }
      for (let metric = 0; metric < 3; metric += 1) {
        const geometricMean = (source: Map<string, Profile["oi"]>) => Math.exp([...source.values()].reduce((sum, tuple) => sum + Math.log(Math.max(0.05, tuple[metric])), 0) / Math.max(1, source.size));
        const offenseMean = geometricMean(nextOffense);
        const defenseMean = geometricMean(nextDefense);
        for (const tuple of nextOffense.values()) tuple[metric] /= offenseMean;
        for (const tuple of nextDefense.values()) tuple[metric] /= defenseMean;
      }
      adjustedOffense = nextOffense;
      adjustedDefense = nextDefense;
    }

    const scheduleBlend = (raw: number, adjusted: number, weight: number) => Math.exp((1 - weight) * Math.log(Math.max(0.05, raw)) + weight * Math.log(Math.max(0.05, adjusted)));
    const clampIndex = (metric: number) => Math.max(0.6, Math.min(1.55, metric));
    const profileQuality = (offense: Profile["oi"], defense: Profile["di"]) => {
      const offenseEfficiency = (offense[0] + offense[1] + offense[2]) / 3;
      const defenseEfficiency = (defense[0] + defense[1] + defense[2]) / 3;
      return Math.max(0, Math.min(1, 0.5 + Math.log(Math.max(0.05, offenseEfficiency) / Math.max(0.05, defenseEfficiency)) / 0.9));
    };
    for (const [team, profile] of rawProfiles) {
      const prior = preseasonByTeam.get(team);
      const opponents = throughWeek.filter((row) => row.team === team).map((row) => row.opponent).filter(Boolean);
      const opponentQualities = opponents.filter((opponent) => eligibleTeams.has(opponent)).map((opponent) => {
        const observed = rawProfiles.get(opponent);
        const opponentPrior = preseasonByTeam.get(opponent);
        const observedQuality = observed
          ? profileQuality(adjustedOffense.get(opponent) ?? observed.oi, adjustedDefense.get(opponent) ?? observed.di)
          : 0.5;
        const priorQuality = opponentPrior ? profileQuality(opponentPrior.oi, opponentPrior.di) : 0.5;
        const observedReliability = Math.max(0, Math.min(1, ((observed?.gamesPlayed ?? 0) - 1) / 5));
        return priorQuality * (1 - observedReliability) + observedQuality * observedReliability;
      });
      const orderedOpponentQualities = [...opponentQualities].sort((a, b) => b - a);
      const strongestOpponents = orderedOpponentQualities.slice(0, 2);
      const scheduleQuality = opponentQualities.length
        ? 0.6 * (strongestOpponents.reduce((sum, value) => sum + value, 0) / strongestOpponents.length) + 0.4 * (opponentQualities.reduce((sum, value) => sum + value, 0) / opponentQualities.length)
        : 0.5;
      const credibleOpponentEvidence = Math.max(0, Math.min(1, (scheduleQuality - 0.25) / 0.45));
      const calibration = scheduleCalibrationWeights(profile.gamesPlayed, opponentQualities.length, credibleOpponentEvidence);
      const blendPrior = (current: number, previous: number) => (current * profile.gamesPlayed + previous * calibration.priorGames) / Math.max(1, profile.gamesPlayed + calibration.priorGames);
      const oi = profile.oi.map((metric, index) => clampIndex(blendPrior(scheduleBlend(metric, adjustedOffense.get(team)?.[index] ?? metric, calibration.opponentAdjustment), prior?.oi[index] ?? 1))) as Profile["oi"];
      const di = profile.di.map((metric, index) => clampIndex(blendPrior(scheduleBlend(metric, adjustedDefense.get(team)?.[index] ?? metric, calibration.opponentAdjustment), prior?.di[index] ?? 1))) as Profile["di"];
      profiles.push({ ...profile, oi, di });
    }
  }
  return profiles;
}

export function project(
  home: Profile | null,
  away: Profile | null,
  neutral: boolean,
  homeElo?: number,
  awayElo?: number,
  homeEvidence?: MatchupEvidence | null,
  awayEvidence?: MatchupEvidence | null,
  opponentFlags: { homeIsFcs?: boolean; awayIsFcs?: boolean } = {},
) {
  const averageFallback: Pick<Profile, "oi" | "di" | "advanced"> = { oi: [1, 1, 1, 1, 1], di: [1, 1, 1, 1, 1], advanced: null };
  const fcsFallback: Pick<Profile, "oi" | "di" | "advanced"> = {
    oi: [modelCalibration.fcsOffenseIndex, modelCalibration.fcsOffenseIndex, modelCalibration.fcsOffenseIndex, 1, 1],
    di: [modelCalibration.fcsDefenseIndex, modelCalibration.fcsDefenseIndex, modelCalibration.fcsDefenseIndex, 1, 1],
    advanced: null,
  };
  const h = home ?? (opponentFlags.homeIsFcs ? fcsFallback : averageFallback);
  const a = away ?? (opponentFlags.awayIsFcs ? fcsFallback : averageFallback);
  return projectCalibratedMatchup(
    { offense: h.oi, defense: h.di, evidence: homeEvidence, advanced: h.advanced },
    { offense: a.oi, defense: a.di, evidence: awayEvidence, advanced: a.advanced },
    neutral,
    opponentFlags.homeIsFcs ? modelCalibration.fcsProjectionElo : homeElo,
    opponentFlags.awayIsFcs ? modelCalibration.fcsProjectionElo : awayElo,
  );
}

function preseasonElo(profile: Profile | undefined) {
  if (!profile) return 1500;
  if (Number.isFinite(profile.preseasonElo)) return Number(profile.preseasonElo);
  const offense = (profile.oi[0] + profile.oi[1] + profile.oi[2]) / 3;
  const defense = (profile.di[0] + profile.di[1] + profile.di[2]) / 3;
  const power = Math.log(Math.max(0.05, offense)) - Math.log(Math.max(0.05, defense));
  return 1500 + Math.max(-240, Math.min(240, power * modelCalibration.preseasonEloScale));
}

export function buildPregameElo(games: NormalizedGame[], preseasonProfiles: Profile[], eligibleTeams: Set<string>) {
  const prior = new Map(preseasonProfiles.map((profile) => [profile.team, profile]));
  const ratings = new Map([...eligibleTeams].map((team) => [team, preseasonElo(prior.get(team))]));
  const snapshots = new Map<string, Map<string, number>>();
  const phase = (game: NormalizedGame) => game.seasonType === "postseason" ? 1 : 0;
  const ordered = [...games].sort((a, b) => phase(a) - phase(b) || a.week - b.week || String(a.startDate).localeCompare(String(b.startDate)) || a.id.localeCompare(b.id));
  const groups = new Map<string,NormalizedGame[]>();
  for (const game of ordered) {
    const key=`${phase(game)}:${game.week}`;
    const group=groups.get(key)??[]; group.push(game); groups.set(key,group);
  }
  for (const groupedGames of groups.values()) {
    const pregameRatings = new Map(ratings);
    for (const game of groupedGames) snapshots.set(game.id, pregameRatings);
    for (const game of groupedGames.filter((candidate) => candidate.completed && candidate.homePoints !== null && candidate.awayPoints !== null)) {
      const homeRating = ratings.get(game.homeTeam) ?? (eligibleTeams.has(game.homeTeam) ? 1500 : modelCalibration.fcsElo);
      const awayRating = ratings.get(game.awayTeam) ?? (eligibleTeams.has(game.awayTeam) ? 1500 : modelCalibration.fcsElo);
      const siteEdge = game.neutralSite ? 0 : 45;
      const expectedHome = 1 / (1 + 10 ** ((awayRating - homeRating - siteEdge) / 400));
      const actualHome = game.homePoints === game.awayPoints ? 0.5 : game.homePoints! > game.awayPoints! ? 1 : 0;
      const margin = Math.abs(game.homePoints! - game.awayPoints!);
      const multiplier = Math.min(2.25, Math.max(1, Math.log(margin + 1) * (2.2 / (Math.abs(homeRating - awayRating) * 0.001 + 2.2))));
      const adjustment = modelCalibration.eloK * multiplier * (actualHome - expectedHome);
      if (eligibleTeams.has(game.homeTeam)) ratings.set(game.homeTeam, homeRating + adjustment);
      if (eligibleTeams.has(game.awayTeam)) ratings.set(game.awayTeam, awayRating - adjustment);
    }
  }
  return snapshots;
}

function ratingPercentiles(ratings: Map<string, number>, eligibleTeams: Set<string>) {
  const ordered = [...eligibleTeams].map((team) => [team, ratings.get(team) ?? 1500] as const)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const denominator = Math.max(1, ordered.length - 1);
  return new Map(ordered.map(([team], index) => [team, ordered.length === 1 ? 0.5 : 1 - index / denominator]));
}

/**
 * Builds the schedule-proof state that existed immediately before every game.
 * It shares the weekly cutoff with pregame Elo, so later results cannot leak
 * backward into historical predictions.
 */
export function buildPregameMatchupEvidence(
  games: NormalizedGame[],
  pregameElo: Map<string, Map<string, number>>,
  eligibleTeams: Set<string>,
) {
  const snapshots = new Map<string, Map<string, MatchupEvidence>>();
  const historyByTeam = new Map<string,NormalizedGame[]>();
  const phase = (game: NormalizedGame) => game.seasonType === "postseason" ? 1 : 0;
  const ordered = [...games].sort((a, b) => phase(a) - phase(b) || a.week - b.week || String(a.startDate).localeCompare(String(b.startDate)) || a.id.localeCompare(b.id));
  const groups = new Map<string,NormalizedGame[]>();
  for (const game of ordered) {
    const key=`${phase(game)}:${game.week}`;
    const group=groups.get(key)??[]; group.push(game); groups.set(key,group);
  }

  for (const groupedGames of groups.values()) {
    const ratings = pregameElo.get(groupedGames[0]?.id ?? "") ?? new Map([...eligibleTeams].map((team) => [team, 1500]));
    const strengths = ratingPercentiles(ratings, eligibleTeams);
    const evidence = new Map<string, MatchupEvidence>();
    for (const team of eligibleTeams) {
      const details = historyByTeam.get(team)??[];
      const opponentStrengths: number[] = [];
      const winStrengths: number[] = [];
      for (const detail of details) {
        const home = detail.homeTeam === team;
        const opponent = home ? detail.awayTeam : detail.homeTeam;
        const strength = eligibleTeams.has(opponent) ? strengths.get(opponent) ?? 0.5 : 0.05;
        opponentStrengths.push(strength);
        const points = home ? detail.homePoints : detail.awayPoints;
        const opponentPoints = home ? detail.awayPoints : detail.homePoints;
        if (points !== null && opponentPoints !== null && points > opponentPoints) winStrengths.push(strength);
      }
      evidence.set(team, buildMatchupEvidence(opponentStrengths, winStrengths, details.length));
    }
    for (const game of groupedGames) snapshots.set(game.id, evidence);
    for (const game of groupedGames) if(game.completed&&game.homePoints!==null&&game.awayPoints!==null) {
      const homeHistory=historyByTeam.get(game.homeTeam)??[]; homeHistory.push(game); historyByTeam.set(game.homeTeam,homeHistory);
      const awayHistory=historyByTeam.get(game.awayTeam)??[]; awayHistory.push(game); historyByTeam.set(game.awayTeam,awayHistory);
    }
  }
  return snapshots;
}

const profileIndexCache=new WeakMap<Profile[],Map<string,Profile[]>>();

export function latestProfile(profiles: Profile[], team: string, week: number) {
  let index=profileIndexCache.get(profiles);
  if(!index) {
    index=new Map<string,Profile[]>();
    for(const profile of profiles) {
      const rows=index.get(profile.team)??[]; rows.push(profile); index.set(profile.team,rows);
    }
    for(const rows of index.values()) rows.sort((left,right)=>right.week-left.week);
    profileIndexCache.set(profiles,index);
  }
  return index.get(team)?.find((profile)=>profile.week<=week)??null;
}

function buildSeasonArtifacts(
  games: NormalizedGame[],
  stats: NormalizedStat[],
  advancedStats: NormalizedAdvancedStat[],
  lines: Line[],
  season: number,
  eligibleTeams: Set<string>,
  preseasonProfiles: Profile[] = [],
) {
  const baseProfiles = [...preseasonProfiles, ...buildProfiles(games, stats, season, eligibleTeams, preseasonProfiles)];
  const completedRegularGameIds = new Set(games.filter((game) => game.completed && game.seasonType !== "postseason").map((game) => game.id));
  const preseasonAdvanced = preseasonProfiles.filter((profile) => profile.advanced).map((profile): WeeklyAdvancedProfile => ({
    season: profile.season,
    week: profile.week,
    team: profile.team,
    gamesPlayed: profile.gamesPlayed,
    advanced: profile.advanced!,
  }));
  const weeklyAdvanced = buildWeeklyAdvancedProfiles(season, completedRegularGameIds, stats, advancedStats, eligibleTeams, preseasonAdvanced, modelCalibration.iterations);
  const advancedByProfile = new Map([...preseasonAdvanced, ...weeklyAdvanced].map((profile) => [`${profile.week}|${profile.team}`, profile.advanced]));
  const profiles = baseProfiles.map((profile) => ({ ...profile, advanced: advancedByProfile.get(`${profile.week}|${profile.team}`) ?? profile.advanced ?? null }));
  const linesByGame = new Map(lines.map((line) => [line.gameId, line]));
  const maxProfileWeek = Math.max(0, ...profiles.map((profile) => profile.week));
  const pregameElo = buildPregameElo(games, preseasonProfiles, eligibleTeams);
  const pregameEvidence = buildPregameMatchupEvidence(games, pregameElo, eligibleTeams);
  const predictions = games.map((game) => {
    const generatedFromWeek = game.seasonType === "postseason" ? maxProfileWeek : Math.max(0, game.week - 1);
    const ratings = pregameElo.get(game.id);
    const evidence = pregameEvidence.get(game.id);
    const prediction = project(
      latestProfile(profiles, game.homeTeam, generatedFromWeek),
      latestProfile(profiles, game.awayTeam, generatedFromWeek),
      game.neutralSite,
      ratings?.get(game.homeTeam) ?? (eligibleTeams.has(game.homeTeam) ? 1500 : modelCalibration.fcsElo),
      ratings?.get(game.awayTeam) ?? (eligibleTeams.has(game.awayTeam) ? 1500 : modelCalibration.fcsElo),
      evidence?.get(game.homeTeam),
      evidence?.get(game.awayTeam),
      { homeIsFcs: !eligibleTeams.has(game.homeTeam), awayIsFcs: !eligibleTeams.has(game.awayTeam) },
    );
    const line = linesByGame.get(game.id);
    const completed = game.homePoints !== null && game.awayPoints !== null;
    const actualMargin = completed ? game.homePoints! - game.awayPoints! : null;
    const actualTotal = completed ? game.homePoints! + game.awayPoints! : null;
    const market = evaluateMarketProjection({
      week: game.week, postseason: game.seasonType === "postseason", homeTeam: game.homeTeam, awayTeam: game.awayTeam,
      modelHomeSpread: prediction.modelHomeSpread, modelTotal: prediction.modelTotal,
      homeYpa: prediction.homeStats.ypa, awayYpa: prediction.awayStats.ypa,
      homeYpc: prediction.homeStats.ypc, awayYpc: prediction.awayStats.ypc,
      homeDefenseIndex: average(prediction.calibratedHome.defense.slice(0, 3)),
      awayDefenseIndex: average(prediction.calibratedAway.defense.slice(0, 3)),
      vegasSpread: line?.spread ?? null, vegasTotal: line?.overUnder ?? null, actualMargin, actualTotal,
    });
    return {
      gameId: game.id,
      season,
      week: game.week,
      generatedFromWeek,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      homeScore: prediction.homeScore,
      awayScore: prediction.awayScore,
      homeWinProbability: prediction.homeWinProbability,
      modelHomeSpread: prediction.modelHomeSpread,
      modelTotal: prediction.modelTotal,
      vegasSpread: line?.spread ?? null,
      vegasTotal: line?.overUnder ?? null,
      spreadEdge: market.spreadEdge,
      totalEdge: market.totalEdge,
      spreadError: actualMargin === null ? null : Math.abs(prediction.margin - actualMargin),
      totalError: actualTotal === null ? null : Math.abs(prediction.modelTotal - actualTotal),
      spreadResult: market.spreadResult,
      totalResult: market.totalResult,
      totalDiagnosticQualified: market.totalDiagnosticQualified,
      totalDiagnosticResult: market.totalDiagnosticResult,
      modelVersion: MODEL_VERSION,
    };
  });
  const maxWeek = maxProfileWeek;
  const snapshots = Array.from({ length: maxWeek + 1 }, (_, index) => index).map((week) => ({
    season,
    week,
    teamCount: new Set(profiles.filter((profile) => profile.week === week).map((profile) => profile.team)).size,
    gameCount: games.filter((game) => game.week <= week).length,
    completedGameCount: games.filter((game) => game.week <= week && game.completed).length,
    source: "CollegeFootballData",
    modelVersion: MODEL_VERSION,
  }));
  return { profiles, advancedProfiles: [...preseasonAdvanced, ...weeklyAdvanced], predictions, snapshots, maxWeek };
}

// D1 caps a single SQLite string/BLOB at 2 MB. Row-count-only batches can cross
// that boundary as a payload evolves (advanced profiles are substantially wider
// than schedules or scores), so every JSON binding is also bounded by encoded
// bytes. Keep enough headroom for SQLite JSON1 processing and split again if a
// hosting/runtime limit is ever lower than the documented ceiling.
export const D1_JSON_BATCH_TARGET_BYTES = 1_250_000;

export function jsonRowBatches<T>(rows: T[], maxRows = 600, maxBytes = D1_JSON_BATCH_TARGET_BYTES) {
  const encoder = new TextEncoder();
  const batches: T[][] = [];
  let batch: T[] = [];
  let encodedBytes = 2; // Opening and closing array brackets.

  for (const row of rows) {
    const serialized = JSON.stringify(row);
    if (serialized === undefined) throw new TypeError("Archive rows must be JSON serializable");
    const rowBytes = encoder.encode(serialized).byteLength;
    const separatorBytes = batch.length ? 1 : 0;
    if (batch.length && (batch.length >= maxRows || encodedBytes + separatorBytes + rowBytes > maxBytes)) {
      batches.push(batch);
      batch = [];
      encodedBytes = 2;
    }
    encodedBytes += (batch.length ? 1 : 0) + rowBytes;
    batch.push(row);
  }
  if (batch.length) batches.push(batch);
  return batches;
}

function sqliteValueTooBig(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /SQLITE_TOOBIG|string or blob too big/i.test(message);
}

export async function upsertJsonRows<T>(db: D1Database, sql: string, rows: T[], size = 600) {
  const writeBatch = async (batch: T[]): Promise<void> => {
    try {
      await db.prepare(sql).bind(JSON.stringify(batch)).run();
    } catch (error) {
      if (!sqliteValueTooBig(error)) throw error;
      if (batch.length <= 1) {
        throw new Error("A single archive row exceeded the D1 value limit after safe batching");
      }
      const midpoint = Math.ceil(batch.length / 2);
      await writeBatch(batch.slice(0, midpoint));
      await writeBatch(batch.slice(midpoint));
    }
  };

  for (const batch of jsonRowBatches(rows, size)) await writeBatch(batch);
}

type PersistSeasonPayload = {
  teams: unknown[]; preseasonInputs: PreseasonInput[]; games: NormalizedGame[]; stats: NormalizedStat[]; lines: Line[]; profiles: Profile[];
  advancedStats: NormalizedAdvancedStat[]; advancedProfiles: WeeklyAdvancedProfile[];
  advancedSyncStates: Array<{ season: number; completedGameCount: number; rowCount: number; componentVersion: number }>;
  predictions: unknown[]; snapshots: unknown[];
};

async function persistSeason(db: D1Database, rows: PersistSeasonPayload) {
  await upsertJsonRows(db, `INSERT INTO cfb_teams (season,team,team_id,abbreviation,mascot,conference,color,alt_color,logo,updated_at)
    SELECT json_extract(value,'$.season'),json_extract(value,'$.team'),json_extract(value,'$.teamId'),json_extract(value,'$.abbreviation'),json_extract(value,'$.mascot'),json_extract(value,'$.conference'),json_extract(value,'$.color'),json_extract(value,'$.altColor'),json_extract(value,'$.logo'),CURRENT_TIMESTAMP FROM json_each(?) WHERE 1
    ON CONFLICT(season,team) DO UPDATE SET team_id=excluded.team_id,abbreviation=excluded.abbreviation,mascot=excluded.mascot,conference=excluded.conference,color=excluded.color,alt_color=excluded.alt_color,logo=excluded.logo,updated_at=CURRENT_TIMESTAMP`, rows.teams);

  await upsertJsonRows(db, `INSERT INTO preseason_inputs (season,team,conference,returning_ppa,returning_passing_ppa,returning_receiving_ppa,returning_rushing_ppa,returning_usage,returning_passing_usage,returning_receiving_usage,returning_rushing_usage,recruiting_rank,recruiting_points,updated_at)
    SELECT json_extract(value,'$.season'),json_extract(value,'$.team'),json_extract(value,'$.conference'),json_extract(value,'$.returningPpa'),json_extract(value,'$.returningPassingPpa'),json_extract(value,'$.returningReceivingPpa'),json_extract(value,'$.returningRushingPpa'),json_extract(value,'$.returningUsage'),json_extract(value,'$.returningPassingUsage'),json_extract(value,'$.returningReceivingUsage'),json_extract(value,'$.returningRushingUsage'),json_extract(value,'$.recruitingRank'),json_extract(value,'$.recruitingPoints'),CURRENT_TIMESTAMP FROM json_each(?) WHERE 1
    ON CONFLICT(season,team) DO UPDATE SET conference=excluded.conference,returning_ppa=excluded.returning_ppa,returning_passing_ppa=excluded.returning_passing_ppa,returning_receiving_ppa=excluded.returning_receiving_ppa,returning_rushing_ppa=excluded.returning_rushing_ppa,returning_usage=excluded.returning_usage,returning_passing_usage=excluded.returning_passing_usage,returning_receiving_usage=excluded.returning_receiving_usage,returning_rushing_usage=excluded.returning_rushing_usage,recruiting_rank=excluded.recruiting_rank,recruiting_points=excluded.recruiting_points,updated_at=CURRENT_TIMESTAMP`, rows.preseasonInputs);

  await upsertJsonRows(db, `INSERT INTO cfb_games (game_id,season,week,season_type,start_date,completed,neutral_site,conference_game,venue,home_team,home_conference,home_points,away_team,away_conference,away_points,updated_at)
    SELECT json_extract(value,'$.id'),json_extract(value,'$.season'),json_extract(value,'$.week'),json_extract(value,'$.seasonType'),json_extract(value,'$.startDate'),json_extract(value,'$.completed'),json_extract(value,'$.neutralSite'),json_extract(value,'$.conferenceGame'),json_extract(value,'$.venue'),json_extract(value,'$.homeTeam'),json_extract(value,'$.homeConference'),json_extract(value,'$.homePoints'),json_extract(value,'$.awayTeam'),json_extract(value,'$.awayConference'),json_extract(value,'$.awayPoints'),CURRENT_TIMESTAMP FROM json_each(?) WHERE 1
    ON CONFLICT(game_id) DO UPDATE SET season=excluded.season,week=excluded.week,season_type=excluded.season_type,start_date=excluded.start_date,completed=excluded.completed,neutral_site=excluded.neutral_site,conference_game=excluded.conference_game,venue=excluded.venue,home_team=excluded.home_team,home_conference=excluded.home_conference,home_points=excluded.home_points,away_team=excluded.away_team,away_conference=excluded.away_conference,away_points=excluded.away_points,updated_at=CURRENT_TIMESTAMP`, rows.games);

  await upsertJsonRows(db, `INSERT INTO team_game_stats (game_id,season,week,team,opponent,home_away,points,total_yards,yards_per_play,pass_yards,pass_attempts,pass_completions,yards_per_pass,rush_yards,rush_attempts,yards_per_rush,turnovers,updated_at)
    SELECT json_extract(value,'$.gameId'),json_extract(value,'$.season'),json_extract(value,'$.week'),json_extract(value,'$.team'),json_extract(value,'$.opponent'),json_extract(value,'$.homeAway'),json_extract(value,'$.points'),json_extract(value,'$.totalYards'),json_extract(value,'$.yardsPerPlay'),json_extract(value,'$.passYards'),json_extract(value,'$.passAttempts'),json_extract(value,'$.passCompletions'),json_extract(value,'$.yardsPerPass'),json_extract(value,'$.rushYards'),json_extract(value,'$.rushAttempts'),json_extract(value,'$.yardsPerRush'),json_extract(value,'$.turnovers'),CURRENT_TIMESTAMP FROM json_each(?) WHERE 1
    ON CONFLICT(game_id,team) DO UPDATE SET season=excluded.season,week=excluded.week,opponent=excluded.opponent,home_away=excluded.home_away,points=excluded.points,total_yards=excluded.total_yards,yards_per_play=excluded.yards_per_play,pass_yards=excluded.pass_yards,pass_attempts=excluded.pass_attempts,pass_completions=COALESCE(excluded.pass_completions,team_game_stats.pass_completions),yards_per_pass=excluded.yards_per_pass,rush_yards=excluded.rush_yards,rush_attempts=excluded.rush_attempts,yards_per_rush=excluded.yards_per_rush,turnovers=excluded.turnovers,updated_at=CURRENT_TIMESTAMP`, rows.stats);

  await upsertJsonRows(db, `INSERT INTO team_game_advanced_stats (game_id,season,week,team,opponent,off_line_yards,off_second_level_yards,off_open_field_yards,off_passing_success_rate,off_passing_explosiveness,def_line_yards,def_second_level_yards,def_open_field_yards,def_passing_success_rate,def_passing_explosiveness,component_json,updated_at)
    SELECT json_extract(value,'$.gameId'),json_extract(value,'$.season'),json_extract(value,'$.week'),json_extract(value,'$.team'),json_extract(value,'$.opponent'),json_extract(value,'$.offLineYards'),json_extract(value,'$.offSecondLevelYards'),json_extract(value,'$.offOpenFieldYards'),json_extract(value,'$.offPassingSuccessRate'),json_extract(value,'$.offPassingExplosiveness'),json_extract(value,'$.defLineYards'),json_extract(value,'$.defSecondLevelYards'),json_extract(value,'$.defOpenFieldYards'),json_extract(value,'$.defPassingSuccessRate'),json_extract(value,'$.defPassingExplosiveness'),value,CURRENT_TIMESTAMP FROM json_each(?) WHERE 1
    ON CONFLICT(game_id,team) DO UPDATE SET season=excluded.season,week=excluded.week,opponent=excluded.opponent,off_line_yards=excluded.off_line_yards,off_second_level_yards=excluded.off_second_level_yards,off_open_field_yards=excluded.off_open_field_yards,off_passing_success_rate=excluded.off_passing_success_rate,off_passing_explosiveness=excluded.off_passing_explosiveness,def_line_yards=excluded.def_line_yards,def_second_level_yards=excluded.def_second_level_yards,def_open_field_yards=excluded.def_open_field_yards,def_passing_success_rate=excluded.def_passing_success_rate,def_passing_explosiveness=excluded.def_passing_explosiveness,component_json=excluded.component_json,updated_at=CURRENT_TIMESTAMP`, rows.advancedStats);

  await upsertJsonRows(db, `INSERT INTO betting_lines (game_id,season,week,provider,spread,spread_open,formatted_spread,over_under,over_under_open,home_moneyline,away_moneyline,updated_at)
    SELECT json_extract(value,'$.gameId'),json_extract(value,'$.season'),json_extract(value,'$.week'),json_extract(value,'$.provider'),json_extract(value,'$.spread'),json_extract(value,'$.spreadOpen'),json_extract(value,'$.formattedSpread'),json_extract(value,'$.overUnder'),json_extract(value,'$.overUnderOpen'),json_extract(value,'$.homeMoneyline'),json_extract(value,'$.awayMoneyline'),CURRENT_TIMESTAMP FROM json_each(?) WHERE 1
    ON CONFLICT(game_id) DO UPDATE SET season=excluded.season,week=excluded.week,provider=excluded.provider,spread=excluded.spread,spread_open=excluded.spread_open,formatted_spread=excluded.formatted_spread,over_under=excluded.over_under,over_under_open=excluded.over_under_open,home_moneyline=excluded.home_moneyline,away_moneyline=excluded.away_moneyline,updated_at=CURRENT_TIMESTAMP`, rows.lines);

  await upsertJsonRows(db, `INSERT INTO weekly_profiles (season,week,team,games_played,off_ypp,off_ypa,off_ypc,off_patt,off_ratt,def_ypp,def_ypa,def_ypc,def_patt,def_ratt,off_ypp_index,off_ypa_index,off_ypc_index,off_patt_index,off_ratt_index,def_ypp_index,def_ypa_index,def_ypc_index,def_patt_index,def_ratt_index,created_at)
    SELECT json_extract(value,'$.season'),json_extract(value,'$.week'),json_extract(value,'$.team'),json_extract(value,'$.gamesPlayed'),json_extract(value,'$.off[0]'),json_extract(value,'$.off[1]'),json_extract(value,'$.off[2]'),json_extract(value,'$.off[3]'),json_extract(value,'$.off[4]'),json_extract(value,'$.def[0]'),json_extract(value,'$.def[1]'),json_extract(value,'$.def[2]'),json_extract(value,'$.def[3]'),json_extract(value,'$.def[4]'),json_extract(value,'$.oi[0]'),json_extract(value,'$.oi[1]'),json_extract(value,'$.oi[2]'),json_extract(value,'$.oi[3]'),json_extract(value,'$.oi[4]'),json_extract(value,'$.di[0]'),json_extract(value,'$.di[1]'),json_extract(value,'$.di[2]'),json_extract(value,'$.di[3]'),json_extract(value,'$.di[4]'),CURRENT_TIMESTAMP FROM json_each(?) WHERE 1
    ON CONFLICT(season,week,team) DO UPDATE SET games_played=excluded.games_played,off_ypp=excluded.off_ypp,off_ypa=excluded.off_ypa,off_ypc=excluded.off_ypc,off_patt=excluded.off_patt,off_ratt=excluded.off_ratt,def_ypp=excluded.def_ypp,def_ypa=excluded.def_ypa,def_ypc=excluded.def_ypc,def_patt=excluded.def_patt,def_ratt=excluded.def_ratt,off_ypp_index=excluded.off_ypp_index,off_ypa_index=excluded.off_ypa_index,off_ypc_index=excluded.off_ypc_index,off_patt_index=excluded.off_patt_index,off_ratt_index=excluded.off_ratt_index,def_ypp_index=excluded.def_ypp_index,def_ypa_index=excluded.def_ypa_index,def_ypc_index=excluded.def_ypc_index,def_patt_index=excluded.def_patt_index,def_ratt_index=excluded.def_ratt_index,created_at=CURRENT_TIMESTAMP`, rows.profiles);

  await upsertJsonRows(db, `INSERT INTO weekly_advanced_profiles (season,week,team,games_played,profile_json,created_at)
    SELECT json_extract(value,'$.season'),json_extract(value,'$.week'),json_extract(value,'$.team'),json_extract(value,'$.gamesPlayed'),json_extract(value,'$.advanced'),CURRENT_TIMESTAMP FROM json_each(?) WHERE 1
    ON CONFLICT(season,week,team) DO UPDATE SET games_played=excluded.games_played,profile_json=excluded.profile_json,created_at=CURRENT_TIMESTAMP`, rows.advancedProfiles);

  await upsertJsonRows(db, `INSERT INTO advanced_sync_state (season,completed_game_count,row_count,component_version,updated_at)
    SELECT json_extract(value,'$.season'),json_extract(value,'$.completedGameCount'),json_extract(value,'$.rowCount'),json_extract(value,'$.componentVersion'),CURRENT_TIMESTAMP FROM json_each(?) WHERE 1
    ON CONFLICT(season) DO UPDATE SET completed_game_count=excluded.completed_game_count,row_count=excluded.row_count,component_version=excluded.component_version,updated_at=CURRENT_TIMESTAMP`, rows.advancedSyncStates);

  await upsertJsonRows(db, `INSERT INTO model_predictions (game_id,season,week,generated_from_week,home_team,away_team,home_score,away_score,home_win_probability,model_home_spread,model_total,vegas_spread,vegas_total,spread_edge,total_edge,spread_error,total_error,spread_result,total_result,model_version,created_at)
    SELECT json_extract(value,'$.gameId'),json_extract(value,'$.season'),json_extract(value,'$.week'),json_extract(value,'$.generatedFromWeek'),json_extract(value,'$.homeTeam'),json_extract(value,'$.awayTeam'),json_extract(value,'$.homeScore'),json_extract(value,'$.awayScore'),json_extract(value,'$.homeWinProbability'),json_extract(value,'$.modelHomeSpread'),json_extract(value,'$.modelTotal'),json_extract(value,'$.vegasSpread'),json_extract(value,'$.vegasTotal'),json_extract(value,'$.spreadEdge'),json_extract(value,'$.totalEdge'),json_extract(value,'$.spreadError'),json_extract(value,'$.totalError'),json_extract(value,'$.spreadResult'),json_extract(value,'$.totalResult'),json_extract(value,'$.modelVersion'),CURRENT_TIMESTAMP FROM json_each(?) WHERE 1
    ON CONFLICT(game_id) DO UPDATE SET season=excluded.season,week=excluded.week,generated_from_week=excluded.generated_from_week,home_team=excluded.home_team,away_team=excluded.away_team,home_score=excluded.home_score,away_score=excluded.away_score,home_win_probability=excluded.home_win_probability,model_home_spread=excluded.model_home_spread,model_total=excluded.model_total,vegas_spread=excluded.vegas_spread,vegas_total=excluded.vegas_total,spread_edge=excluded.spread_edge,total_edge=excluded.total_edge,spread_error=excluded.spread_error,total_error=excluded.total_error,spread_result=excluded.spread_result,total_result=excluded.total_result,model_version=excluded.model_version,created_at=CURRENT_TIMESTAMP`, rows.predictions);

  await upsertJsonRows(db, `INSERT INTO model_snapshots (season,week,team_count,game_count,completed_game_count,source,model_version,created_at)
    SELECT json_extract(value,'$.season'),json_extract(value,'$.week'),json_extract(value,'$.teamCount'),json_extract(value,'$.gameCount'),json_extract(value,'$.completedGameCount'),json_extract(value,'$.source'),json_extract(value,'$.modelVersion'),CURRENT_TIMESTAMP FROM json_each(?) WHERE 1
    ON CONFLICT(season,week) DO UPDATE SET team_count=excluded.team_count,game_count=excluded.game_count,completed_game_count=excluded.completed_game_count,source=excluded.source,model_version=excluded.model_version,created_at=CURRENT_TIMESTAMP`, rows.snapshots);
}

const emptyPersistRows = (): PersistSeasonPayload => ({
  teams: [], preseasonInputs: [], games: [], stats: [], advancedStats: [], lines: [], profiles: [], advancedProfiles: [], advancedSyncStates: [], predictions: [], snapshots: [],
});

async function loadSeasonGames(db: D1Database, season: number): Promise<NormalizedGame[]> {
  const result = await db.prepare(`SELECT game_id,season,week,season_type,start_date,completed,neutral_site,conference_game,venue,home_team,home_conference,home_points,away_team,away_conference,away_points
    FROM cfb_games WHERE season=? ORDER BY week,start_date,game_id`).bind(season).all<JsonRecord>();
  return normalizeGames(result.results as JsonRecord[], season);
}

async function loadSeasonStats(db: D1Database, season: number): Promise<NormalizedStat[]> {
  const result = await db.prepare(`SELECT game_id,season,week,team,opponent,home_away,points,total_yards,yards_per_play,pass_yards,pass_attempts,pass_completions,yards_per_pass,rush_yards,rush_attempts,yards_per_rush,turnovers
    FROM team_game_stats WHERE season=? ORDER BY week,game_id,team`).bind(season).all<JsonRecord>();
  return (result.results as JsonRecord[]).map((row: JsonRecord) => ({
    gameId: textValue(row, "game_id") ?? "",
    season: numberValue(row, "season") ?? season,
    week: numberValue(row, "week") ?? 0,
    team: textValue(row, "team") ?? "",
    opponent: textValue(row, "opponent") ?? "",
    homeAway: textValue(row, "home_away") ?? "",
    points: numberValue(row, "points"),
    totalYards: numberValue(row, "total_yards") ?? 0,
    yardsPerPlay: numberValue(row, "yards_per_play") ?? 0,
    passYards: numberValue(row, "pass_yards") ?? 0,
    passAttempts: numberValue(row, "pass_attempts") ?? 0,
    passCompletions: numberValue(row, "pass_completions"),
    yardsPerPass: numberValue(row, "yards_per_pass") ?? 0,
    rushYards: numberValue(row, "rush_yards") ?? 0,
    rushAttempts: numberValue(row, "rush_attempts") ?? 0,
    yardsPerRush: numberValue(row, "yards_per_rush") ?? 0,
    turnovers: numberValue(row, "turnovers") ?? 0,
  })).filter((row: NormalizedStat) => row.gameId && row.team && row.week > 0);
}

async function loadSeasonAdvancedStats(db: D1Database, season: number): Promise<NormalizedAdvancedStat[]> {
  const result = await db.prepare(`SELECT game_id,season,week,team,opponent,
      off_line_yards,off_second_level_yards,off_open_field_yards,off_passing_success_rate,off_passing_explosiveness,
      def_line_yards,def_second_level_yards,def_open_field_yards,def_passing_success_rate,def_passing_explosiveness,component_json
    FROM team_game_advanced_stats WHERE season=? ORDER BY week,game_id,team`).bind(season).all<JsonRecord>();
  return (result.results as JsonRecord[]).map((row): NormalizedAdvancedStat => {
    const legacy: NormalizedAdvancedStat = {
      gameId: textValue(row, "game_id") ?? "", season: numberValue(row, "season") ?? season,
      week: numberValue(row, "week") ?? 0, team: textValue(row, "team") ?? "", opponent: textValue(row, "opponent") ?? "",
      offLineYards: numberValue(row, "off_line_yards"), offSecondLevelYards: numberValue(row, "off_second_level_yards"),
      offOpenFieldYards: numberValue(row, "off_open_field_yards"), offPassingSuccessRate: numberValue(row, "off_passing_success_rate"),
      offPassingExplosiveness: numberValue(row, "off_passing_explosiveness"), defLineYards: numberValue(row, "def_line_yards"),
      defSecondLevelYards: numberValue(row, "def_second_level_yards"), defOpenFieldYards: numberValue(row, "def_open_field_yards"),
      defPassingSuccessRate: numberValue(row, "def_passing_success_rate"), defPassingExplosiveness: numberValue(row, "def_passing_explosiveness"),
    };
    try {
      const component = textValue(row, "component_json");
      const parsed = component ? JSON.parse(component) as Partial<NormalizedAdvancedStat> : null;
      return parsed ? { ...legacy, ...parsed, gameId: legacy.gameId, season: legacy.season, week: legacy.week, team: legacy.team, opponent: legacy.opponent } : legacy;
    } catch {
      return legacy;
    }
  }).filter((row) => row.gameId && row.team && row.week > 0);
}

async function loadSeasonLines(db: D1Database, season: number): Promise<Line[]> {
  const result = await db.prepare(`SELECT game_id,season,week,provider,spread,spread_open,formatted_spread,over_under,over_under_open,home_moneyline,away_moneyline
    FROM betting_lines WHERE season=? ORDER BY week,game_id`).bind(season).all<JsonRecord>();
  return (result.results as JsonRecord[]).map((row: JsonRecord) => ({
    gameId: textValue(row, "game_id") ?? "",
    season: numberValue(row, "season") ?? season,
    week: numberValue(row, "week") ?? 0,
    provider: textValue(row, "provider"),
    spread: numberValue(row, "spread"),
    spreadOpen: numberValue(row, "spread_open"),
    formattedSpread: textValue(row, "formatted_spread"),
    overUnder: numberValue(row, "over_under"),
    overUnderOpen: numberValue(row, "over_under_open"),
    homeMoneyline: numberValue(row, "home_moneyline"),
    awayMoneyline: numberValue(row, "away_moneyline"),
  })).filter((row: Line) => row.gameId);
}

function centeredPercentile(inputs: PreseasonInput[], accessor: (input: PreseasonInput) => number | null) {
  const values = inputs.map((input) => ({ team: input.team, value: accessor(input) })).filter((row): row is { team: string; value: number } => row.value !== null && Number.isFinite(row.value));
  const ordered = [...values].sort((a, b) => b.value - a.value || a.team.localeCompare(b.team));
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

function finiteAverage(values: Array<number | null>) {
  const valid = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

export function applyPreseasonRosterAdjustments(profiles: Profile[], inputs: PreseasonInput[]) {
  const overallContinuity = centeredPercentile(inputs, (input) => input.returningPpa ?? input.returningUsage);
  const passingContinuity = centeredPercentile(inputs, (input) => finiteAverage([
    input.returningPassingPpa, input.returningReceivingPpa, input.returningPassingUsage, input.returningReceivingUsage,
  ]) ?? input.returningPpa ?? input.returningUsage);
  const rushingContinuity = centeredPercentile(inputs, (input) => finiteAverage([
    input.returningRushingPpa, input.returningRushingUsage,
  ]) ?? input.returningPpa ?? input.returningUsage);
  const recruiting = centeredPercentile(inputs, (input) => input.recruitingPoints ?? (input.recruitingRank === null ? null : -input.recruitingRank));
  const clampIndex = (value: number) => Math.max(0.72, Math.min(1.38, value));
  const regressIndex = (value: number, confidence: number) => Math.exp(Math.log(Math.max(0.55, value)) * confidence);
  const regressRaw = (value: number, baseline: number, confidence: number) => baseline * regressIndex(value / baseline, confidence);

  return profiles.map((profile) => {
    const overall = overallContinuity.get(profile.team) ?? 0;
    const passing = passingContinuity.get(profile.team) ?? overall;
    const rushing = rushingContinuity.get(profile.team) ?? overall;
    const recruit = recruiting.get(profile.team) ?? 0;
    const normalized = (value: number) => (value + 1) / 2;
    const overallProof = 0.86 + 0.09 * normalized(overall) + 0.05 * normalized(recruit);
    const passingProof = 0.84 + 0.11 * normalized(passing) + 0.05 * normalized(recruit);
    const rushingProof = 0.84 + 0.11 * normalized(rushing) + 0.05 * normalized(recruit);
    const defenseProof = 0.88 + 0.04 * normalized(overall) + 0.08 * normalized(recruit);
    const offenseProof = [overallProof, passingProof, rushingProof, 1, 1];
    const defenseProofs = [defenseProof, defenseProof, defenseProof, 1, 1];
    // Returning production controls how much of the multi-year edge survives
    // into a new roster. Recruiting supplies only a small stability term, so a
    // brand label cannot manufacture strength while a low-continuity option
    // team cannot carry every prior efficiency extreme forward unchanged.
    const offenseMultipliers = [
      Math.exp(0.035 * overall + 0.012 * recruit),
      Math.exp(0.055 * passing + 0.012 * recruit),
      Math.exp(0.055 * rushing + 0.012 * recruit),
      1,
      1,
    ];
    const defenseMultipliers = [Math.exp(-0.015 * recruit), Math.exp(-0.015 * recruit), Math.exp(-0.015 * recruit), 1, 1];
    const adjustedAdvanced = profile.advanced ? {
      ...profile.advanced,
      offense: {
        ...profile.advanced.offense,
        index: {
          ...profile.advanced.offense.index,
          lineYards: profile.advanced.offense.index.lineYards === null ? null : clampIndex(regressIndex(profile.advanced.offense.index.lineYards, rushingProof) * offenseMultipliers[2]),
          secondLevelYards: profile.advanced.offense.index.secondLevelYards === null ? null : clampIndex(regressIndex(profile.advanced.offense.index.secondLevelYards, rushingProof) * offenseMultipliers[2]),
          openFieldYards: profile.advanced.offense.index.openFieldYards === null ? null : clampIndex(regressIndex(profile.advanced.offense.index.openFieldYards, rushingProof) * offenseMultipliers[2]),
          completionRate: profile.advanced.offense.index.completionRate === null ? null : clampIndex(regressIndex(profile.advanced.offense.index.completionRate, passingProof) * offenseMultipliers[1]),
          yardsPerCompletion: profile.advanced.offense.index.yardsPerCompletion === null ? null : clampIndex(regressIndex(profile.advanced.offense.index.yardsPerCompletion, passingProof) * offenseMultipliers[1]),
          passingSuccessRate: profile.advanced.offense.index.passingSuccessRate === null ? null : clampIndex(regressIndex(profile.advanced.offense.index.passingSuccessRate, passingProof) * offenseMultipliers[1]),
          passingExplosiveness: profile.advanced.offense.index.passingExplosiveness === null ? null : clampIndex(regressIndex(profile.advanced.offense.index.passingExplosiveness, passingProof) * offenseMultipliers[1]),
        },
      },
      defense: {
        ...profile.advanced.defense,
        index: Object.fromEntries(Object.entries(profile.advanced.defense.index).map(([key, metric]) => [
          key,
          metric === null ? null : clampIndex(regressIndex(metric, defenseProof) * defenseMultipliers[0]),
        ])) as AdvancedProfile["defense"]["index"],
      },
    } satisfies AdvancedProfile : null;
    return {
      ...profile,
      off: profile.off.map((value, index) => regressRaw(value, [baselines.ypp, baselines.ypa, baselines.ypc, baselines.patt, baselines.ratt][index], offenseProof[index]) * offenseMultipliers[index]) as Profile["off"],
      def: profile.def.map((value, index) => regressRaw(value, [baselines.ypp, baselines.ypa, baselines.ypc, baselines.patt, baselines.ratt][index], defenseProofs[index]) * defenseMultipliers[index]) as Profile["def"],
      oi: profile.oi.map((value, index) => clampIndex(regressIndex(value, offenseProof[index]) * offenseMultipliers[index])) as Profile["oi"],
      di: profile.di.map((value, index) => clampIndex(regressIndex(value, defenseProofs[index]) * defenseMultipliers[index])) as Profile["di"],
      advanced: adjustedAdvanced,
    };
  });
}

export async function loadPreseasonProfiles(db: D1Database, season: number, eligibleTeams: Set<string>): Promise<Profile[]> {
  const firstPriorSeason = Math.max(FIRST_HISTORICAL_SEASON, season - 4);
  const [result, inputResult, advancedResult, gameResult] = await Promise.all([
    db.prepare(`SELECT
        wp.season,wp.week,wp.team,wp.games_played AS gamesPlayed,
        wp.off_ypp AS offYpp,wp.off_ypa AS offYpa,wp.off_ypc AS offYpc,wp.off_patt AS offPatt,wp.off_ratt AS offRatt,
        wp.def_ypp AS defYpp,wp.def_ypa AS defYpa,wp.def_ypc AS defYpc,wp.def_patt AS defPatt,wp.def_ratt AS defRatt,
        wp.off_ypp_index AS offYppIndex,wp.off_ypa_index AS offYpaIndex,wp.off_ypc_index AS offYpcIndex,wp.off_patt_index AS offPattIndex,wp.off_ratt_index AS offRattIndex,
        wp.def_ypp_index AS defYppIndex,wp.def_ypa_index AS defYpaIndex,wp.def_ypc_index AS defYpcIndex,wp.def_patt_index AS defPattIndex,wp.def_ratt_index AS defRattIndex
      FROM weekly_profiles wp
      JOIN (
        SELECT season,team,MAX(week) AS week FROM weekly_profiles
        WHERE season>=? AND season<? AND week>0 GROUP BY season,team
      ) latest ON latest.season=wp.season AND latest.team=wp.team AND latest.week=wp.week
      WHERE wp.season>=? AND wp.season<?`)
      .bind(firstPriorSeason, season, firstPriorSeason, season).all<JsonRecord>(),
    db.prepare(`SELECT season,team,conference,returning_ppa AS returningPpa,returning_passing_ppa AS returningPassingPpa,
        returning_receiving_ppa AS returningReceivingPpa,returning_rushing_ppa AS returningRushingPpa,returning_usage AS returningUsage,
        returning_passing_usage AS returningPassingUsage,returning_receiving_usage AS returningReceivingUsage,returning_rushing_usage AS returningRushingUsage,
        recruiting_rank AS recruitingRank,recruiting_points AS recruitingPoints
      FROM preseason_inputs WHERE season=?`).bind(season).all<JsonRecord>(),
    db.prepare(`SELECT wap.season,wap.team,wap.profile_json AS profileJson
      FROM weekly_advanced_profiles wap
      JOIN (
        SELECT season,team,MAX(week) AS week FROM weekly_advanced_profiles
        WHERE season>=? AND season<? AND week>0 GROUP BY season,team
      ) latest ON latest.season=wap.season AND latest.team=wap.team AND latest.week=wap.week
      WHERE wap.season>=? AND wap.season<?`)
      .bind(firstPriorSeason, season, firstPriorSeason, season).all<JsonRecord>(),
    db.prepare(`SELECT game_id AS gameId,season,week,season_type AS seasonType,start_date AS startDate,neutral_site AS neutralSite,
        home_team AS homeTeam,home_points AS homePoints,away_team AS awayTeam,away_points AS awayPoints
      FROM cfb_games WHERE season>=? AND season<? AND completed=1 AND home_points IS NOT NULL AND away_points IS NOT NULL
      ORDER BY season,CASE WHEN season_type='postseason' THEN 1 ELSE 0 END,week,start_date,game_id`)
      .bind(firstPriorSeason, season).all<JsonRecord>(),
  ]);

  const advancedBySeasonTeam = new Map<string, AdvancedProfile>();
  for (const row of advancedResult.results as JsonRecord[]) {
    const team = textValue(row, "team");
    const profile = parseAdvancedProfile(value(row, "profileJson", "profile_json"));
    if (!team || !eligibleTeams.has(team) || !profile) continue;
    advancedBySeasonTeam.set(`${numberValue(row, "season") ?? 0}\u0000${team}`, profile);
  }

  const rawBaseline: [number, number, number, number, number] = [baselines.ypp, baselines.ypa, baselines.ypc, baselines.patt, baselines.ratt];
  const tuple = (row: JsonRecord, prefix: "off" | "def", suffix = ""): [number, number, number, number, number] => [
    numberValue(row, `${prefix}Ypp${suffix}`) ?? 0,
    numberValue(row, `${prefix}Ypa${suffix}`) ?? 0,
    numberValue(row, `${prefix}Ypc${suffix}`) ?? 0,
    numberValue(row, `${prefix}Patt${suffix}`) ?? 0,
    numberValue(row, `${prefix}Ratt${suffix}`) ?? 0,
  ];
  const finalProfilesBySeason = new Map<number, Map<string, PreseasonTransitionProfile>>();
  for (const row of result.results as JsonRecord[]) {
    const profileSeason = numberValue(row, "season") ?? 0;
    const team = textValue(row, "team");
    if (!profileSeason || !team || !eligibleTeams.has(team)) continue;
    const profile: PreseasonTransitionProfile = {
      season: profileSeason,
      week: numberValue(row, "week") ?? 0,
      team,
      gamesPlayed: numberValue(row, "gamesPlayed") ?? 0,
      off: tuple(row, "off"),
      def: tuple(row, "def"),
      oi: tuple(row, "off", "Index"),
      di: tuple(row, "def", "Index"),
      advanced: advancedBySeasonTeam.get(`${profileSeason}\u0000${team}`) ?? null,
    };
    const profiles = finalProfilesBySeason.get(profileSeason) ?? new Map<string, PreseasonTransitionProfile>();
    profiles.set(team, profile);
    finalProfilesBySeason.set(profileSeason, profiles);
  }
  const gamesBySeason = new Map<number, Array<Parameters<typeof calculateFinalEloRatings>[0][number]>>();
  for (const row of gameResult.results as JsonRecord[]) {
    const gameSeason = numberValue(row, "season") ?? 0;
    if (!gameSeason) continue;
    const games = gamesBySeason.get(gameSeason) ?? [];
    games.push({
      gameId: textValue(row, "gameId") ?? "",
      week: numberValue(row, "week") ?? 0,
      startDate: textValue(row, "startDate"),
      seasonType: textValue(row, "seasonType") ?? "regular",
      neutralSite: boolValue(row, "neutralSite"),
      homeTeam: textValue(row, "homeTeam") ?? "",
      homePoints: numberValue(row, "homePoints") ?? 0,
      awayTeam: textValue(row, "awayTeam") ?? "",
      awayPoints: numberValue(row, "awayPoints") ?? 0,
    });
    gamesBySeason.set(gameSeason, games);
  }
  const finalEloBySeason = new Map<number, Map<string, number>>();
  for (let priorSeason = firstPriorSeason; priorSeason < season; priorSeason += 1) {
    finalEloBySeason.set(priorSeason, calculateFinalEloRatings(
      gamesBySeason.get(priorSeason) ?? [],
      finalProfilesBySeason.get(priorSeason)?.keys() ?? [],
      modelCalibration.eloK,
    ));
  }
  const historyByTeam = new Map<string, PreseasonHistoryRow[]>();
  for (const team of eligibleTeams) {
    const history: PreseasonHistoryRow[] = [];
    for (let priorSeason = season - 1; priorSeason >= firstPriorSeason; priorSeason -= 1) {
      const profile = finalProfilesBySeason.get(priorSeason)?.get(team);
      if (profile) history.push({ season: priorSeason, profile, finalElo: finalEloBySeason.get(priorSeason)?.get(team) ?? null });
    }
    historyByTeam.set(team, history);
  }
  const inputs = (inputResult.results as JsonRecord[]).map((row): PreseasonTransitionInput => ({
    season: numberValue(row, "season") ?? season,
    team: textValue(row, "team") ?? "",
    conference: textValue(row, "conference"),
    returningPpa: numberValue(row, "returningPpa"),
    returningPassingPpa: numberValue(row, "returningPassingPpa"),
    returningReceivingPpa: numberValue(row, "returningReceivingPpa"),
    returningRushingPpa: numberValue(row, "returningRushingPpa"),
    returningUsage: numberValue(row, "returningUsage"),
    returningPassingUsage: numberValue(row, "returningPassingUsage"),
    returningReceivingUsage: numberValue(row, "returningReceivingUsage"),
    returningRushingUsage: numberValue(row, "returningRushingUsage"),
    recruitingRank: numberValue(row, "recruitingRank"),
    recruitingPoints: numberValue(row, "recruitingPoints"),
  })).filter((row) => row.team && eligibleTeams.has(row.team));
  return buildPreseasonStateTransition({
    season,
    teams: eligibleTeams,
    historyByTeam,
    inputs,
    baselines: rawBaseline,
    coefficients: PRESEASON_TRANSITION_V2,
  });
}

export async function calculateCachedPerformance(db: D1Database, season: number) {
  const [games, stats, advancedStats, teamResult, lines] = await Promise.all([
    loadSeasonGames(db, season),
    loadSeasonStats(db, season),
    loadSeasonAdvancedStats(db, season),
    db.prepare("SELECT team FROM cfb_teams WHERE season=?").bind(season).all<{ team: string }>(),
    loadSeasonLines(db, season),
  ]);
  const eligibleTeams = new Set(teamResult.results.map((row) => row.team));
  if (!games.length || eligibleTeams.size < 100) return null;
  const preseasonProfiles = await loadPreseasonProfiles(db, season, eligibleTeams);
  const { profiles, predictions } = buildSeasonArtifacts(games, stats, advancedStats, lines, season, eligibleTeams, preseasonProfiles);
  if (predictions.length !== games.length) return null;
  const gamesById = new Map(games.map((game) => [game.id, game]));
  const linesById = new Map(lines.map((line) => [line.gameId, line]));
  const marketEligible = (prediction: (typeof predictions)[number]) => prediction.week >= 5 || gamesById.get(prediction.gameId)?.seasonType === "postseason";
  const marketTrusted = (prediction: (typeof predictions)[number]) => {
    const line = linesById.get(prediction.gameId);
    return !isStoredMarketLineQuarantined(season, line?.provider);
  };
  const metric = (side: "spread" | "total") => {
    const errorKey = side === "spread" ? "spreadError" : "totalError";
    const resultFor = (prediction: (typeof predictions)[number]) => side === "spread" ? prediction.spreadResult : prediction.totalDiagnosticResult;
    const marketRows = predictions.filter((prediction) => marketEligible(prediction) && marketTrusted(prediction) && resultFor(prediction) !== null);
    const rows = marketRows.filter((prediction) => ["W", "L", "PUSH"].includes(String(resultFor(prediction) ?? "")));
    const wins = rows.filter((prediction) => resultFor(prediction) === "W").length;
    const losses = rows.filter((prediction) => resultFor(prediction) === "L").length;
    const pushes = rows.filter((prediction) => resultFor(prediction) === "PUSH").length;
    const passed = marketRows.filter((prediction) => resultFor(prediction) === "PASS").length;
    const errors = predictions.filter((prediction) => marketEligible(prediction) && marketTrusted(prediction)).map((prediction) => prediction[errorKey]).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const quarantined = predictions.filter((prediction) => marketEligible(prediction) && !marketTrusted(prediction) && resultFor(prediction) !== null).length;
    const graded = wins + losses;
    const confidence = wilsonConfidenceInterval(wins, losses);
    return { wins, losses, pushes, passed, quarantined, eligible: marketRows.length, graded, sampleSize: graded, confidenceLow: confidence.low, confidenceHigh: confidence.high, confidenceLevel: confidence.level, accuracy: graded ? wins / graded : null, meanAbsoluteError: errors.length ? errors.reduce((sum, value) => sum + value, 0) / errors.length : null };
  };
  const straightUpRows = predictions.flatMap((prediction) => {
    const game = gamesById.get(prediction.gameId);
    if (!game || game.homePoints === null || game.awayPoints === null || game.homePoints === game.awayPoints) return [];
    const correct = (prediction.homeWinProbability >= 0.5 && game.homePoints > game.awayPoints) || (prediction.homeWinProbability < 0.5 && game.homePoints < game.awayPoints);
    return [correct];
  });
  const straightUpWins = straightUpRows.filter(Boolean).length;
  return {
    season,
    modelVersion: MODEL_VERSION,
    minMarketWeek: 5,
    gameCount: predictions.length,
    profileCount: profiles.length,
    straightUp: { wins: straightUpWins, graded: straightUpRows.length, accuracy: straightUpRows.length ? straightUpWins / straightUpRows.length : null },
    spread: metric("spread"),
    total: metric("total"),
  };
}

type WeekCoverage = { week: number; gameCount: number; statGameCount: number; completionGameCount: number; sourceGapGameCount: number };

// Historical source feeds occasionally publish a completed schedule result but
// omit the corresponding team box score. One explicit source gap must not pin
// an entire season forever; larger gaps still fail so transient/incomplete API
// responses are retried instead of being mistaken for a complete week.
export function weeklySourceCoverageComplete(gameCount: number, coveredGameCount: number, sourceGapGameCount = 0) {
  if (gameCount <= 0) return false;
  return coveredGameCount >= gameCount
    || (gameCount >= 10 && sourceGapGameCount === 1 && coveredGameCount + sourceGapGameCount >= gameCount);
}

type SeasonCoverage = {
  season: number;
  teamCount: number;
  logoCount: number;
  preseasonInputCount: number;
  gameCount: number;
  postseasonGameCount: number;
  profileTeamCount: number;
  predictionCount: number;
  lineCount: number;
  completedRegularGameCount: number;
  completedPostseasonGameCount: number;
  advancedCompletedGameCount: number;
  advancedComponentVersion: number;
  formulaSnapshotCount: number;
  advancedRowCount: number;
  completedWeeks: WeekCoverage[];
  completedPostseasonWeeks: WeekCoverage[];
};

async function getSeasonCoverage(db: D1Database, season: number): Promise<SeasonCoverage> {
  const [counts, weeks, postseasonWeeks] = await Promise.all([
    db.prepare(`SELECT
      (SELECT COUNT(*) FROM cfb_teams WHERE season=?) AS teamCount,
      (SELECT COUNT(*) FROM cfb_teams WHERE season=? AND logo IS NOT NULL AND logo<>'') AS logoCount,
      (SELECT COUNT(*) FROM preseason_inputs WHERE season=?) AS preseasonInputCount,
      (SELECT COUNT(*) FROM cfb_games WHERE season=?) AS gameCount,
      (SELECT COUNT(*) FROM cfb_games WHERE season=? AND season_type='postseason') AS postseasonGameCount,
      (SELECT COUNT(DISTINCT team) FROM weekly_profiles WHERE season=?) AS profileTeamCount,
      (SELECT COUNT(*) FROM model_predictions WHERE season=? AND model_version=?) AS predictionCount,
      (SELECT COUNT(*) FROM betting_lines WHERE season=?) AS lineCount,
      (SELECT COUNT(*) FROM cfb_games WHERE season=? AND season_type='regular' AND completed=1 AND week BETWEEN 1 AND 15) AS completedRegularGameCount,
      (SELECT COUNT(*) FROM cfb_games WHERE season=? AND season_type='postseason' AND completed=1) AS completedPostseasonGameCount,
      COALESCE((SELECT completed_game_count FROM advanced_sync_state WHERE season=?),0) AS advancedCompletedGameCount,
      COALESCE((SELECT row_count FROM advanced_sync_state WHERE season=?),0) AS advancedRowCount,
      COALESCE((SELECT component_version FROM advanced_sync_state WHERE season=?),0) AS advancedComponentVersion,
      (SELECT COUNT(*) FROM model_snapshots WHERE season=? AND model_version=?) AS formulaSnapshotCount`).bind(season, season, season, season, season, season, season, MODEL_VERSION, season, season, season, season, season, season, season, MODEL_VERSION).first<{ teamCount: number; logoCount: number; preseasonInputCount: number; gameCount: number; postseasonGameCount: number; profileTeamCount: number; predictionCount: number; lineCount: number; completedRegularGameCount: number; completedPostseasonGameCount: number; advancedCompletedGameCount: number; advancedRowCount: number; advancedComponentVersion: number; formulaSnapshotCount: number }>(),
    db.prepare(`SELECT g.week AS week,COUNT(DISTINCT g.game_id) AS gameCount,COUNT(DISTINCT s.game_id) AS statGameCount,
        COUNT(DISTINCT CASE WHEN sc.row_count>=2 AND sc.missing_completions=0 THEN g.game_id END) AS completionGameCount,
        COALESCE(gap.source_gap_count,0) AS sourceGapGameCount
      FROM cfb_games g
      LEFT JOIN team_game_stats s ON s.game_id=g.game_id
      LEFT JOIN (
        SELECT game_id,COUNT(*) AS row_count,SUM(CASE WHEN pass_attempts>0 AND pass_completions IS NULL THEN 1 ELSE 0 END) AS missing_completions
        FROM team_game_stats GROUP BY game_id
      ) sc ON sc.game_id=g.game_id
      LEFT JOIN (
        SELECT season,week,MAX(game_count) AS source_gap_count FROM refresh_runs WHERE status='source-gap' GROUP BY season,week
      ) gap ON gap.season=g.season AND gap.week=g.week
      WHERE g.season=? AND g.season_type='regular' AND g.completed=1 AND g.week BETWEEN 1 AND 15
      GROUP BY g.week,gap.source_gap_count ORDER BY g.week`).bind(season).all<WeekCoverage>(),
    db.prepare(`SELECT g.week AS week,COUNT(DISTINCT g.game_id) AS gameCount,COUNT(DISTINCT s.game_id) AS statGameCount,
        COUNT(DISTINCT CASE WHEN sc.row_count>=2 AND sc.missing_completions=0 THEN g.game_id END) AS completionGameCount,
        0 AS sourceGapGameCount
      FROM cfb_games g
      LEFT JOIN team_game_stats s ON s.game_id=g.game_id
      LEFT JOIN (
        SELECT game_id,COUNT(*) AS row_count,SUM(CASE WHEN pass_attempts>0 AND pass_completions IS NULL THEN 1 ELSE 0 END) AS missing_completions
        FROM team_game_stats GROUP BY game_id
      ) sc ON sc.game_id=g.game_id
      WHERE g.season=? AND g.season_type='postseason' AND g.completed=1
      GROUP BY g.week ORDER BY g.week`).bind(season).all<WeekCoverage>(),
  ]);
  const normalizedWeeks = (rows: WeekCoverage[]) => rows.map((row) => ({
    week: Number(row.week),
    gameCount: Number(row.gameCount),
    statGameCount: Number(row.statGameCount),
    completionGameCount: Number(row.completionGameCount),
    sourceGapGameCount: Number(row.sourceGapGameCount ?? 0),
  }));
  return {
    season,
    teamCount: Number(counts?.teamCount ?? 0),
    logoCount: Number(counts?.logoCount ?? 0),
    preseasonInputCount: Number(counts?.preseasonInputCount ?? 0),
    gameCount: Number(counts?.gameCount ?? 0),
    postseasonGameCount: Number(counts?.postseasonGameCount ?? 0),
    profileTeamCount: Number(counts?.profileTeamCount ?? 0),
    predictionCount: Number(counts?.predictionCount ?? 0),
    lineCount: Number(counts?.lineCount ?? 0),
    completedRegularGameCount: Number(counts?.completedRegularGameCount ?? 0),
    completedPostseasonGameCount: Number(counts?.completedPostseasonGameCount ?? 0),
    advancedCompletedGameCount: Number(counts?.advancedCompletedGameCount ?? 0),
    advancedComponentVersion: Number(counts?.advancedComponentVersion ?? 0),
    advancedRowCount: Number(counts?.advancedRowCount ?? 0),
    formulaSnapshotCount: Number(counts?.formulaSnapshotCount ?? 0),
    completedWeeks: normalizedWeeks(weeks.results as WeekCoverage[]),
    completedPostseasonWeeks: normalizedWeeks(postseasonWeeks.results as WeekCoverage[]),
  };
}

export function currentCollegeFootballSeason(date = new Date()) {
  return date.getUTCMonth() >= 6 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
}

export type BackfillSeasonStatus = {
  season: number;
  teamCount: number;
  logoCount: number;
  preseasonInputCount: number;
  gameCount: number;
  postseasonGameCount: number;
  statRowCount: number;
  advancedRowCount: number;
  advancedProfileCount: number;
  advancedCompletedGameCount: number;
  advancedComponentVersion: number;
  formulaSnapshotCount: number;
  profileTeamCount: number;
  profileCount: number;
  predictionCount: number;
  lineCount: number;
  completedWeekCount: number;
  statWeekCount: number;
  completionWeekCount: number;
  postseasonCompletedWeekCount: number;
  postseasonStatWeekCount: number;
  postseasonCompletionWeekCount: number;
  stage: "teams" | "priors" | "schedule" | "stats" | "advanced" | "passing" | "formulas" | "ready";
  progressPercent: number;
  ready: boolean;
};

/**
 * Atomically grants one server-selected archive repair slice. This is shared
 * by cron and the read-only status surface so a busy public page can never
 * multiply CollegeFootballData traffic. The lease is stored in D1 and applies
 * across every Worker instance.
 */
export async function claimArchiveRepair(env: PipelineEnv, cooldownSeconds = ARCHIVE_REPAIR_COOLDOWN_SECONDS) {
  const lease = await env.DB.prepare(`INSERT INTO sync_leases (scope,next_allowed_at,updated_at)
      VALUES ('archive-v2',unixepoch()+?,CURRENT_TIMESTAMP)
      ON CONFLICT(scope) DO UPDATE SET next_allowed_at=excluded.next_allowed_at,updated_at=CURRENT_TIMESTAMP
      WHERE sync_leases.next_allowed_at<=unixepoch()
      `)
    .bind(Math.max(60, Math.trunc(cooldownSeconds)))
    .run();
  // D1 does not consistently surface rows from INSERT ... RETURNING through
  // first(), even though the write succeeds. Its affected-row count is the
  // authoritative acquisition signal: 1 for a claimed/reclaimed lease, 0 when
  // another Worker still owns the cooldown window.
  return Number(lease.meta.changes ?? 0) > 0;
}

export async function getBackfillStatus(env: PipelineEnv) {
  const currentSeason = currentCollegeFootballSeason();
  const seasons = Array.from({ length: currentSeason - FIRST_HISTORICAL_SEASON + 1 }, (_, index) => FIRST_HISTORICAL_SEASON + index);
  const [teamResult, logoResult, preseasonInputResult, gameResult, postseasonResult, statResult, advancedStatResult, advancedProfileResult, advancedStateResult, profileResult, profileRowResult, predictionResult, snapshotResult, lineResult, weekResult, postseasonWeekResult] = await Promise.all([
    env.DB.prepare("SELECT season,COUNT(*) AS count FROM cfb_teams WHERE season>=? GROUP BY season").bind(FIRST_HISTORICAL_SEASON).all<{ season: number; count: number }>(),
    env.DB.prepare("SELECT season,COUNT(*) AS count FROM cfb_teams WHERE season>=? AND logo IS NOT NULL AND logo<>'' GROUP BY season").bind(FIRST_HISTORICAL_SEASON).all<{ season: number; count: number }>(),
    // Count source-attempt rows rather than only non-null metrics. The importer
    // writes one row for every eligible team and preserves nulls honestly when
    // a feed has not published a value. Requiring 100 non-null metrics caused a
    // valid, completed import to repeat forever at 16%.
    env.DB.prepare("SELECT season,COUNT(*) AS count FROM preseason_inputs WHERE season>=? GROUP BY season").bind(FIRST_HISTORICAL_SEASON).all<{ season: number; count: number }>(),
    env.DB.prepare("SELECT season,COUNT(*) AS count FROM cfb_games WHERE season>=? GROUP BY season").bind(FIRST_HISTORICAL_SEASON).all<{ season: number; count: number }>(),
    env.DB.prepare("SELECT season,COUNT(*) AS count FROM cfb_games WHERE season>=? AND season_type='postseason' GROUP BY season").bind(FIRST_HISTORICAL_SEASON).all<{ season: number; count: number }>(),
    env.DB.prepare("SELECT season,COUNT(*) AS count FROM team_game_stats WHERE season>=? GROUP BY season").bind(FIRST_HISTORICAL_SEASON).all<{ season: number; count: number }>(),
    env.DB.prepare("SELECT season,COUNT(*) AS count FROM team_game_advanced_stats WHERE season>=? GROUP BY season").bind(FIRST_HISTORICAL_SEASON).all<{ season: number; count: number }>(),
    env.DB.prepare("SELECT season,COUNT(*) AS count FROM weekly_advanced_profiles WHERE season>=? GROUP BY season").bind(FIRST_HISTORICAL_SEASON).all<{ season: number; count: number }>(),
    env.DB.prepare("SELECT season,completed_game_count AS count,component_version AS componentVersion FROM advanced_sync_state WHERE season>=?").bind(FIRST_HISTORICAL_SEASON).all<{ season: number; count: number; componentVersion: number }>(),
    env.DB.prepare("SELECT season,COUNT(DISTINCT team) AS count FROM weekly_profiles WHERE season>=? GROUP BY season").bind(FIRST_HISTORICAL_SEASON).all<{ season: number; count: number }>(),
    env.DB.prepare("SELECT season,COUNT(*) AS count FROM weekly_profiles WHERE season>=? GROUP BY season").bind(FIRST_HISTORICAL_SEASON).all<{ season: number; count: number }>(),
    env.DB.prepare("SELECT season,COUNT(*) AS count FROM model_predictions WHERE season>=? AND model_version=? GROUP BY season").bind(FIRST_HISTORICAL_SEASON, MODEL_VERSION).all<{ season: number; count: number }>(),
    env.DB.prepare("SELECT season,COUNT(*) AS count FROM model_snapshots WHERE season>=? AND model_version=? GROUP BY season").bind(FIRST_HISTORICAL_SEASON, MODEL_VERSION).all<{ season: number; count: number }>(),
    env.DB.prepare("SELECT season,COUNT(*) AS count FROM betting_lines WHERE season>=? GROUP BY season").bind(FIRST_HISTORICAL_SEASON).all<{ season: number; count: number }>(),
    env.DB.prepare(`SELECT g.season,g.week,COUNT(DISTINCT g.game_id) AS gameCount,COUNT(DISTINCT s.game_id) AS statGameCount,
        COUNT(DISTINCT CASE WHEN sc.row_count>=2 AND sc.missing_completions=0 THEN g.game_id END) AS completionGameCount,
        COALESCE(gap.source_gap_count,0) AS sourceGapGameCount
      FROM cfb_games g
      LEFT JOIN team_game_stats s ON s.game_id=g.game_id
      LEFT JOIN (
        SELECT game_id,COUNT(*) AS row_count,SUM(CASE WHEN pass_attempts>0 AND pass_completions IS NULL THEN 1 ELSE 0 END) AS missing_completions
        FROM team_game_stats GROUP BY game_id
      ) sc ON sc.game_id=g.game_id
      LEFT JOIN (
        SELECT season,week,MAX(game_count) AS source_gap_count FROM refresh_runs WHERE status='source-gap' GROUP BY season,week
      ) gap ON gap.season=g.season AND gap.week=g.week
      WHERE g.season>=? AND g.season_type='regular' AND g.completed=1 AND g.week BETWEEN 1 AND 15
      GROUP BY g.season,g.week,gap.source_gap_count`).bind(FIRST_HISTORICAL_SEASON).all<{ season: number; week: number; gameCount: number; statGameCount: number; completionGameCount: number; sourceGapGameCount: number }>(),
    env.DB.prepare(`SELECT g.season,g.week,COUNT(DISTINCT g.game_id) AS gameCount,COUNT(DISTINCT s.game_id) AS statGameCount,
        COUNT(DISTINCT CASE WHEN sc.row_count>=2 AND sc.missing_completions=0 THEN g.game_id END) AS completionGameCount,
        0 AS sourceGapGameCount
      FROM cfb_games g
      LEFT JOIN team_game_stats s ON s.game_id=g.game_id
      LEFT JOIN (
        SELECT game_id,COUNT(*) AS row_count,SUM(CASE WHEN pass_attempts>0 AND pass_completions IS NULL THEN 1 ELSE 0 END) AS missing_completions
        FROM team_game_stats GROUP BY game_id
      ) sc ON sc.game_id=g.game_id
      WHERE g.season>=? AND g.season_type='postseason' AND g.completed=1
      GROUP BY g.season,g.week`).bind(FIRST_HISTORICAL_SEASON).all<{ season: number; week: number; gameCount: number; statGameCount: number; completionGameCount: number; sourceGapGameCount: number }>(),
  ]);
  const counts = (rows: Array<{ season: number; count: number }>) => new Map(rows.map((row) => [Number(row.season), Number(row.count)]));
  const teams = counts(teamResult.results);
  const logos = counts(logoResult.results);
  const preseasonInputs = counts(preseasonInputResult.results);
  const games = counts(gameResult.results);
  const postseasonGames = counts(postseasonResult.results);
  const statRows = counts(statResult.results);
  const advancedStatRows = counts(advancedStatResult.results);
  const advancedProfileRows = counts(advancedProfileResult.results);
  const advancedStateRows = advancedStateResult.results as Array<{ season: number; count: number; componentVersion: number }>;
  const advancedCompletedGames = counts(advancedStateRows);
  const advancedComponentVersions = new Map<number, number>(advancedStateRows.map((row) => [Number(row.season), Number(row.componentVersion ?? 0)]));
  const profiles = counts(profileResult.results);
  const profileRows = counts(profileRowResult.results);
  const predictions = counts(predictionResult.results);
  const formulaSnapshots = counts(snapshotResult.results);
  const lines = counts(lineResult.results);
  const weekCoverage = new Map<number, Array<{ gameCount: number; statGameCount: number; completionGameCount: number; sourceGapGameCount: number }>>();
  for (const row of weekResult.results) {
    const seasonRows = weekCoverage.get(Number(row.season)) ?? [];
    seasonRows.push({ gameCount: Number(row.gameCount), statGameCount: Number(row.statGameCount), completionGameCount: Number(row.completionGameCount ?? 0), sourceGapGameCount: Number(row.sourceGapGameCount ?? 0) });
    weekCoverage.set(Number(row.season), seasonRows);
  }
  const postseasonWeekCoverage = new Map<number, Array<{ gameCount: number; statGameCount: number; completionGameCount: number; sourceGapGameCount: number }>>();
  for (const row of postseasonWeekResult.results) {
    const seasonRows = postseasonWeekCoverage.get(Number(row.season)) ?? [];
    seasonRows.push({ gameCount: Number(row.gameCount), statGameCount: Number(row.statGameCount), completionGameCount: Number(row.completionGameCount ?? 0), sourceGapGameCount: 0 });
    postseasonWeekCoverage.set(Number(row.season), seasonRows);
  }
  const status: BackfillSeasonStatus[] = seasons.map((season) => {
    const teamCount = teams.get(season) ?? 0;
    const logoCount = logos.get(season) ?? 0;
    const preseasonInputCount = preseasonInputs.get(season) ?? 0;
    const gameCount = games.get(season) ?? 0;
    const postseasonGameCount = postseasonGames.get(season) ?? 0;
    const statRowCount = statRows.get(season) ?? 0;
    const advancedRowCount = advancedStatRows.get(season) ?? 0;
    const advancedProfileCount = advancedProfileRows.get(season) ?? 0;
    const advancedCompletedGameCount = advancedCompletedGames.get(season) ?? 0;
    const advancedComponentVersion = advancedComponentVersions.get(season) ?? 0;
    const profileTeamCount = profiles.get(season) ?? 0;
    const profileCount = profileRows.get(season) ?? 0;
    const predictionCount = predictions.get(season) ?? 0;
    const formulaSnapshotCount = formulaSnapshots.get(season) ?? 0;
    const lineCount = lines.get(season) ?? 0;
    const completedWeeks = weekCoverage.get(season) ?? [];
    const completedWeekCount = completedWeeks.length;
    const statWeekCount = completedWeeks.filter((row) => weeklySourceCoverageComplete(row.gameCount, row.statGameCount, row.sourceGapGameCount)).length;
    const completionWeekCount = completedWeeks.filter((row) => weeklySourceCoverageComplete(row.gameCount, row.completionGameCount, row.sourceGapGameCount)).length;
    const completedRegularGameCount = completedWeeks.reduce((sum, row) => sum + row.gameCount, 0);
    const completedPostseasonWeeks = postseasonWeekCoverage.get(season) ?? [];
    const postseasonCompletedWeekCount = completedPostseasonWeeks.length;
    const postseasonStatWeekCount = completedPostseasonWeeks.filter((row) => weeklySourceCoverageComplete(row.gameCount, row.statGameCount)).length;
    const postseasonCompletionWeekCount = completedPostseasonWeeks.filter((row) => weeklySourceCoverageComplete(row.gameCount, row.completionGameCount)).length;
    const completedPostseasonGameCount = completedPostseasonWeeks.reduce((sum, row) => sum + row.gameCount, 0);
    const completedGameCount = completedRegularGameCount + completedPostseasonGameCount;
    // A preseason current-year load legitimately has no weekly profiles yet.
    const profilesReady = completedWeekCount === 0 && season === currentSeason ? true : profileTeamCount >= 100;
    const scheduleReady = gameCount > 0 && (season === currentSeason || postseasonGameCount > 0);
    const statsReady = statWeekCount >= completedWeekCount && postseasonStatWeekCount >= postseasonCompletedWeekCount;
    const advancedReady = completedGameCount === 0 || (advancedCompletedGameCount >= completedGameCount && advancedComponentVersion >= ADVANCED_COMPONENT_VERSION);
    const passingReady = completedGameCount === 0 || (completionWeekCount >= completedWeekCount && postseasonCompletionWeekCount >= postseasonCompletedWeekCount);
    const formulasReady = formulaSnapshotCount > 0 && predictionCount >= gameCount && profilesReady;
    const ready = teamCount >= 100 && logoCount >= 100 && preseasonInputCount >= 100 && scheduleReady && statsReady && advancedReady && formulasReady && passingReady;
    const stage = ready ? "ready" : teamCount < 100 || logoCount < 100 ? "teams" : preseasonInputCount < 100 ? "priors" : !scheduleReady ? "schedule" : !statsReady ? "stats" : !advancedReady ? "advanced" : !formulasReady ? "formulas" : "passing";
    const totalCompletedWeeks = completedWeekCount + postseasonCompletedWeekCount;
    const stageProgress = totalCompletedWeeks ? (statWeekCount + postseasonStatWeekCount) / totalCompletedWeeks : 1;
    const completionProgress = totalCompletedWeeks ? (completionWeekCount + postseasonCompletionWeekCount) / totalCompletedWeeks : 1;
    const progressPercent = ready ? 100 : stage === "teams" ? Math.min(12, teamCount / 100 * 12) : stage === "priors" ? 16 : stage === "schedule" ? 20 : stage === "stats" ? 22 + stageProgress * 66 : stage === "advanced" ? 90 : stage === "formulas" ? 92 : 93 + completionProgress * 6;
    return { season, teamCount, logoCount, preseasonInputCount, gameCount, postseasonGameCount, statRowCount, advancedRowCount, advancedProfileCount, advancedCompletedGameCount, advancedComponentVersion, formulaSnapshotCount, profileTeamCount, profileCount, predictionCount, lineCount, completedWeekCount, statWeekCount, completionWeekCount, postseasonCompletedWeekCount, postseasonStatWeekCount, postseasonCompletionWeekCount, stage, progressPercent: Math.round(progressPercent), ready };
  });
  const stagePriority: Record<BackfillSeasonStatus["stage"], number> = { teams:0,priors:1,schedule:2,stats:3,advanced:4,formulas:5,passing:6,ready:7 };
  const missing = status.filter((row) => !row.ready).sort((a,b) => {
    // Finish the oldest season end-to-end before moving forward. Besides making
    // each vintage usable sooner, this guarantees later preseason priors can use
    // every earlier completed season already present in D1.
    const seasonOrder = a.season - b.season;
    if (seasonOrder) return seasonOrder;
    const priority = stagePriority[a.stage] - stagePriority[b.stage];
    if (priority) return priority;
    return 0;
  }).map((row) => row.season);
  return { currentSeason, seasons: status, missing };
}

async function recordRun(db: D1Database, season: number, week: number, status: string, gameCount: number, detail: string) {
  await db.prepare("INSERT INTO refresh_runs (season,week,source,status,game_count,detail,created_at) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)")
    .bind(season, week, "CollegeFootballData", status, gameCount, detail).run();
}

function completedRegularGames(games: NormalizedGame[]) {
  return games.filter((game) => game.completed && game.seasonType === "regular" && game.week >= 1 && game.week <= 15);
}

function completedPostseasonGames(games: NormalizedGame[]) {
  return games.filter((game) => game.completed && game.seasonType === "postseason" && game.week >= 1);
}

function completedGamesForStats(games: NormalizedGame[], seasonType: "regular" | "postseason") {
  return seasonType === "postseason" ? completedPostseasonGames(games) : completedRegularGames(games);
}

async function fetchWeekTeamStats(key: string, games: NormalizedGame[], season: number, week: number, seasonType: "regular" | "postseason" = "regular") {
  const scheduledGames = completedGamesForStats(games, seasonType).filter((game) => game.week === week);
  const scheduledIds = new Set(scheduledGames.map((game) => game.id));
  const payload = await cfbd("/games/teams", key, { year: season, week, seasonType, classification: "fbs" });
  let stats = normalizeStats(payload, games, season).filter((row) => row.week === week && scheduledIds.has(row.gameId));
  let importedIds = new Set(stats.map((row) => row.gameId));
  let missingGames = scheduledGames.filter((game) => !importedIds.has(game.id));

  // A direct game-id lookup can recover a row omitted by the week-level CFBD
  // response. Limit this repair to two games so a genuinely incomplete weekly
  // response cannot create a burst of follow-up requests.
  if (missingGames.length > 0 && missingGames.length <= 2) {
    for (const game of missingGames) {
      await pause(1600);
      const directPayload = await cfbdOptional("/games/teams", key, { id: game.id });
      stats = [...stats, ...normalizeStats(directPayload, games, season).filter((row) => row.gameId === game.id)];
    }
    const deduplicated = new Map(stats.map((row) => [`${row.gameId}\u0000${row.team}`, row]));
    stats = [...deduplicated.values()];
    importedIds = new Set(stats.map((row) => row.gameId));
    missingGames = scheduledGames.filter((game) => !importedIds.has(game.id));
  }

  return { stats, scheduledGames, missingGames };
}

export async function hydratePostseasonGameStats(env: PipelineEnv, season: number, gameId: string) {
  if (!env.CFBD_API_KEY) return { eligible: false, basicRows: 0, advancedRows: 0 };
  const stored = await env.DB.prepare(`SELECT game_id,season,week,season_type,start_date,completed,neutral_site,conference_game,venue,
      home_team,home_conference,home_points,away_team,away_conference,away_points
    FROM cfb_games WHERE season=? AND game_id=? LIMIT 1`).bind(season, gameId).first<JsonRecord>();
  const game = stored ? normalizeGames([stored], season)[0] : undefined;
  if (!game || !game.completed || game.seasonType !== "postseason") return { eligible: false, basicRows: 0, advancedRows: 0 };

  const [basicCount, advancedCount] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS count FROM team_game_stats WHERE game_id=?").bind(game.id).first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM team_game_advanced_stats WHERE game_id=?").bind(game.id).first<{ count: number }>(),
  ]);
  let basicRows = Number(basicCount?.count ?? 0);
  let advancedRows = Number(advancedCount?.count ?? 0);

  if (basicRows < 2) {
    const payload = await cfbd("/games/teams", env.CFBD_API_KEY, { id: game.id });
    const stats = normalizeStats(payload, [game], season).filter((row) => row.gameId === game.id);
    if (stats.length) {
      const rows = emptyPersistRows();
      rows.stats = stats;
      await persistSeason(env.DB, rows);
      basicRows = stats.length;
    }
  }

  if (advancedRows < 2) {
    const payload = await cfbdOptional("/stats/game/advanced", env.CFBD_API_KEY, {
      year: season,
      week: game.week,
      seasonType: "postseason",
      excludeGarbageTime: "true",
    });
    const stats = normalizeAdvancedStats(payload, [game], season).filter((row) => row.gameId === game.id);
    if (stats.length) {
      const rows = emptyPersistRows();
      rows.advancedStats = stats;
      await persistSeason(env.DB, rows);
      advancedRows = stats.length;
    }
  }

  return { eligible: true, basicRows, advancedRows };
}

async function fetchAndPersistAdvancedSeason(env: PipelineEnv, season: number, games: NormalizedGame[]) {
  if (!env.CFBD_API_KEY) throw new Error("CFBD_API_KEY is not configured");
  const completedGames = [...completedRegularGames(games), ...completedPostseasonGames(games)];
  if (!completedGames.length) return { completedGameCount: 0, rowCount: 0, coveredGameCount: 0 };
  const completedIds = new Set(completedGames.map((game) => game.id));
  const eligibleResult = await env.DB.prepare("SELECT team FROM cfb_teams WHERE season=?").bind(season).all<{ team: string }>();
  const eligibleTeams = new Set(eligibleResult.results.map((row) => row.team));
  const payloadRows: JsonRecord[] = [];
  if (completedRegularGames(games).length) {
    const regularPayload = await cfbd("/stats/game/advanced", env.CFBD_API_KEY, {
      year: season,
      seasonType: "regular",
      excludeGarbageTime: "true",
    });
    payloadRows.push(...asRecords(regularPayload));
  }
  for (const week of [...new Set(completedPostseasonGames(games).map((game) => game.week))].sort((a, b) => a - b)) {
    await pause(1600);
    const postseasonPayload = await cfbd("/stats/game/advanced", env.CFBD_API_KEY, {
      year: season,
      week,
      seasonType: "postseason",
      excludeGarbageTime: "true",
    });
    payloadRows.push(...asRecords(postseasonPayload));
  }
  await pause(1600);
  const havocPayload = await cfbdOptional("/stats/game/havoc", env.CFBD_API_KEY, { year: season });
  await pause(1600);
  const seasonAdvancedPayload=await cfbdOptional("/stats/season/advanced",env.CFBD_API_KEY,{year:season,excludeGarbageTime:"true"});
  const advancedStats = mergeSeasonAdvancedContext(mergeHavocStats(normalizeAdvancedStats(payloadRows, games, season), havocPayload),seasonAdvancedPayload)
    .filter((row) => completedIds.has(row.gameId) && eligibleTeams.has(row.team));
  const coveredGameCount = new Set(advancedStats.map((row) => row.gameId)).size;
  if (!advancedStats.length) throw new Error(`CollegeFootballData returned no advanced game stats for ${season}`);
  const rows = emptyPersistRows();
  rows.advancedStats = advancedStats;
  rows.advancedSyncStates = [{ season, completedGameCount: completedGames.length, rowCount: advancedStats.length, componentVersion: ADVANCED_COMPONENT_VERSION }];
  await persistSeason(env.DB, rows);
  // A changed completed-game count or component schema means the materialized
  // projections were built from an older component archive. Remove derived
  // model version; the immutable source games and stats remain untouched.
  await Promise.all([
    env.DB.prepare("DELETE FROM model_predictions WHERE season=? AND model_version=?").bind(season, MODEL_VERSION).run(),
    env.DB.prepare("DELETE FROM model_snapshots WHERE season=? AND model_version=?").bind(season, MODEL_VERSION).run(),
  ]);
  return { completedGameCount: completedGames.length, rowCount: advancedStats.length, coveredGameCount };
}

async function finalizeSeason(env: PipelineEnv, season: number, trigger: SyncTrigger, started = Date.now(), allowHistoricalLineFetch = false) {
  const db = env.DB;
  const [games, stats, advancedStats, teamResult, storedLines] = await Promise.all([
    loadSeasonGames(db, season),
    loadSeasonStats(db, season),
    loadSeasonAdvancedStats(db, season),
    db.prepare("SELECT team FROM cfb_teams WHERE season=?").bind(season).all<{ team: string }>(),
    loadSeasonLines(db, season),
  ]);
  let lines = storedLines;
  if (!lines.length && env.CFBD_API_KEY && allowHistoricalLineFetch) {
    const payload = await cfbdOptional("/lines", env.CFBD_API_KEY, { year: season });
    lines = normalizeLines(payload, season);
  }
  const eligibleTeams = new Set<string>((teamResult.results as Array<{ team: string }>).map((row) => row.team));
  const preseasonProfiles = await loadPreseasonProfiles(db, season, eligibleTeams);
  await refreshViabilityCalibrationFromDatabase(db);
  const { profiles, advancedProfiles, predictions, snapshots, maxWeek } = buildSeasonArtifacts(games, stats, advancedStats, lines, season, eligibleTeams, preseasonProfiles);
  const currentSeason = currentCollegeFootballSeason();
  if (games.length === 0 || eligibleTeams.size < 100) throw new Error(`CollegeFootballData returned an incomplete ${season} season (${eligibleTeams.size} teams, ${games.length} games)`);
  if (games.some((game) => game.completed) && season !== currentSeason && (stats.length < 100 || profiles.length < 100)) {
    throw new Error(`CollegeFootballData returned games for ${season}, but the stored weekly team-stat archive is incomplete (${stats.length} game rows, ${profiles.length} profiles)`);
  }
  const invalidProfile = profiles.find((profile) => [...profile.off, ...profile.def, ...profile.oi, ...profile.di].some((metric) => !Number.isFinite(metric)));
  const invalidPrediction = predictions.find((prediction) => !Number.isFinite(prediction.homeScore) || !Number.isFinite(prediction.awayScore) || !Number.isFinite(prediction.homeWinProbability));
  if (invalidProfile || invalidPrediction || predictions.length !== games.length) throw new Error(`Harper+ formula audit failed for ${season}; weekly calculations were not stored`);
  const rows = emptyPersistRows();
  rows.lines = lines;
  rows.profiles = profiles;
  rows.advancedProfiles = advancedProfiles;
  rows.predictions = predictions;
  rows.snapshots = snapshots;
  await persistSeason(db, rows);
  await recordRun(db, season, maxWeek, "complete", games.length, `${trigger} sync; ${stats.length} stored API team-game rows; ${advancedStats.length} advanced component rows; ${preseasonProfiles.length} cached preseason profiles; ${profiles.length} weekly profiles; ${predictions.length} ${MODEL_VERSION} projections; ${Date.now() - started}ms`);
  return { season, latestWeek: maxWeek, teams: eligibleTeams.size, games: games.length, stats: stats.length, advancedStats: advancedStats.length, profiles: profiles.length, lines: lines.length, predictions: predictions.length, durationMs: Date.now() - started, stage: "complete" as const };
}

export async function syncSeasonStep(env: PipelineEnv, season: number, trigger: SyncTrigger = "bootstrap") {
  const started = Date.now();
  if (!env.CFBD_API_KEY) throw new Error("CFBD_API_KEY is not configured");
  const db = env.DB;
  try {
    const coverage = await getSeasonCoverage(db, season);
    if (coverage.teamCount < 100 || coverage.logoCount < 100) {
      const payload = await cfbd("/teams/fbs", env.CFBD_API_KEY, { year: season });
      const teams = normalizeTeams(payload, season);
      if (teams.length < 100) throw new Error(`CollegeFootballData returned only ${teams.length} FBS teams for ${season}`);
      const rows = emptyPersistRows();
      rows.teams = teams;
      await persistSeason(db, rows);
      await recordRun(db, season, 0, "running", 0, `${trigger} stage teams; stored ${teams.length} API team identities and logos`);
      return { season, stage: "teams" as const, teams: teams.length, durationMs: Date.now() - started };
    }

    if (coverage.preseasonInputCount < 100) {
      const teamResult = await db.prepare("SELECT team FROM cfb_teams WHERE season=?").bind(season).all<{ team: string }>();
      const eligibleTeams = new Set(teamResult.results.map((row) => row.team));
      const preseasonInputs = await fetchPreseasonInputs(env.CFBD_API_KEY, season, eligibleTeams);
      const rows = emptyPersistRows();
      rows.preseasonInputs = preseasonInputs;
      await persistSeason(db, rows);
      const returningTeams = preseasonInputs.filter((row) => row.returningPpa !== null || row.returningUsage !== null).length;
      const recruitingTeams = preseasonInputs.filter((row) => row.recruitingPoints !== null || row.recruitingRank !== null).length;
      await recordRun(db, season, 0, "running", 0, `${trigger} stage priors; stored ${returningTeams} returning-production rows and ${recruitingTeams} recruiting rows`);
      return { season, stage: "priors" as const, teams: preseasonInputs.length, returningTeams, recruitingTeams, durationMs: Date.now() - started };
    }

    if (coverage.gameCount === 0 || (season < currentCollegeFootballSeason() && coverage.postseasonGameCount === 0)) {
      const payload = await cfbd("/games", env.CFBD_API_KEY, { year: season, seasonType: "both", classification: "fbs" });
      const games = normalizeGames(payload, season);
      if (!games.length) throw new Error(`CollegeFootballData returned no FBS schedule for ${season}`);
      const rows = emptyPersistRows();
      rows.games = games;
      await persistSeason(db, rows);
      await recordRun(db, season, 0, "running", games.length, `${trigger} stage schedule; stored ${games.length} API games and final scores`);
      return { season, stage: "schedule" as const, games: games.length, durationMs: Date.now() - started };
    }

    const missingWeek = coverage.completedWeeks.find((row) => !weeklySourceCoverageComplete(row.gameCount, row.statGameCount, row.sourceGapGameCount));
    if (missingWeek) {
      const games = await loadSeasonGames(db, season);
      const { stats, missingGames } = await fetchWeekTeamStats(env.CFBD_API_KEY, games, season, missingWeek.week);
      if (!stats.length) throw new Error(`CollegeFootballData returned no team box scores for ${season} week ${missingWeek.week}`);
      const rows = emptyPersistRows();
      rows.stats = stats;
      await persistSeason(db, rows);
      const importedGames = new Set(stats.map((row) => row.gameId)).size;
      const acceptedGapCount = missingGames.length === 1 && missingWeek.gameCount >= 10 ? 1 : 0;
      if (acceptedGapCount) await recordRun(db, season, missingWeek.week, "source-gap", acceptedGapCount, `CFBD has no team box score for ${missingGames[0].id}: ${missingGames[0].awayTeam} at ${missingGames[0].homeTeam}; excluded from statistical profiles`);
      const gapDetail = acceptedGapCount ? `; accepted source gap: ${missingGames[0].id} ${missingGames[0].awayTeam} at ${missingGames[0].homeTeam}` : "";
      await recordRun(db, season, missingWeek.week, "running", importedGames, `${trigger} stage stats; stored ${stats.length} API team rows for week ${missingWeek.week}${gapDetail}`);
      if (!weeklySourceCoverageComplete(missingWeek.gameCount, importedGames, acceptedGapCount)) throw new Error(`CollegeFootballData returned ${importedGames} of ${missingWeek.gameCount} completed box scores for ${season} week ${missingWeek.week}`);
      return { season, stage: "stats" as const, week: missingWeek.week, stats: stats.length, games: importedGames, sourceGapGames: missingGames.length, durationMs: Date.now() - started };
    }

    const missingPostseasonWeek = coverage.completedPostseasonWeeks.find((row) => !weeklySourceCoverageComplete(row.gameCount, row.statGameCount));
    if (missingPostseasonWeek) {
      const games = await loadSeasonGames(db, season);
      const { stats, missingGames } = await fetchWeekTeamStats(env.CFBD_API_KEY, games, season, missingPostseasonWeek.week, "postseason");
      if (!stats.length) throw new Error(`CollegeFootballData returned no postseason team box scores for ${season} week ${missingPostseasonWeek.week}`);
      const rows = emptyPersistRows();
      rows.stats = stats;
      await persistSeason(db, rows);
      const importedGames = new Set(stats.map((row) => row.gameId)).size;
      await recordRun(db, season, missingPostseasonWeek.week, "running", importedGames, `${trigger} stage stats; stored ${stats.length} postseason API team rows for week ${missingPostseasonWeek.week}`);
      if (!weeklySourceCoverageComplete(missingPostseasonWeek.gameCount, importedGames)) throw new Error(`CollegeFootballData returned ${importedGames} of ${missingPostseasonWeek.gameCount} completed postseason box scores for ${season} week ${missingPostseasonWeek.week}`);
      return { season, stage: "stats" as const, seasonType: "postseason" as const, week: missingPostseasonWeek.week, stats: stats.length, games: importedGames, sourceGapGames: missingGames.length, durationMs: Date.now() - started };
    }

    const completedGameCount = coverage.completedRegularGameCount + coverage.completedPostseasonGameCount;
    if (completedGameCount > 0 && (coverage.advancedCompletedGameCount < completedGameCount || coverage.advancedComponentVersion < ADVANCED_COMPONENT_VERSION)) {
      const games = await loadSeasonGames(db, season);
      const advanced = await fetchAndPersistAdvancedSeason(env, season, games);
      await recordRun(db, season, 0, "running", advanced.coveredGameCount, `${trigger} stage advanced; cached ${advanced.rowCount} regular- and postseason CFBD component rows covering ${advanced.coveredGameCount} games`);
      return { season, stage: "advanced" as const, games: advanced.coveredGameCount, advancedStats: advanced.rowCount, durationMs: Date.now() - started };
    }

    if (coverage.formulaSnapshotCount === 0 || coverage.predictionCount < coverage.gameCount) {
      return await finalizeSeason(env, season, trigger, started, coverage.predictionCount === 0);
    }

    const missingCompletionWeek = coverage.completedWeeks.find((row) => !weeklySourceCoverageComplete(row.gameCount, row.completionGameCount, row.sourceGapGameCount));
    if (missingCompletionWeek) {
      const games = await loadSeasonGames(db, season);
      const { stats, missingGames } = await fetchWeekTeamStats(env.CFBD_API_KEY, games, season, missingCompletionWeek.week);
      if (!stats.length) throw new Error(`CollegeFootballData returned no passing box scores for ${season} week ${missingCompletionWeek.week}`);
      const rows = emptyPersistRows();
      rows.stats = stats;
      await persistSeason(db, rows);
      const completionRows = stats.filter((row) => row.passAttempts === 0 || row.passCompletions !== null).length;
      const refreshedCoverage = await getSeasonCoverage(db, season);
      if (refreshedCoverage.completedWeeks.every((row) => weeklySourceCoverageComplete(row.gameCount, row.completionGameCount, row.sourceGapGameCount))) {
        await Promise.all([
          db.prepare("DELETE FROM model_predictions WHERE season=? AND model_version=?").bind(season, MODEL_VERSION).run(),
          db.prepare("DELETE FROM model_snapshots WHERE season=? AND model_version=?").bind(season, MODEL_VERSION).run(),
        ]);
      }
      const gapDetail = missingGames.length ? `; source gap remains for ${missingGames.map((game) => game.id).join(", ")}` : "";
      await recordRun(db, season, missingCompletionWeek.week, "running", new Set(stats.map((row) => row.gameId)).size, `${trigger} stage passing; hydrated ${completionRows} completion/attempt rows for week ${missingCompletionWeek.week}${gapDetail}`);
      return { season, stage: "passing" as const, week: missingCompletionWeek.week, stats: stats.length, sourceGapGames: missingGames.length, durationMs: Date.now() - started };
    }

    const missingPostseasonCompletionWeek = coverage.completedPostseasonWeeks.find((row) => !weeklySourceCoverageComplete(row.gameCount, row.completionGameCount));
    if (missingPostseasonCompletionWeek) {
      const games = await loadSeasonGames(db, season);
      const { stats, missingGames } = await fetchWeekTeamStats(env.CFBD_API_KEY, games, season, missingPostseasonCompletionWeek.week, "postseason");
      if (!stats.length) throw new Error(`CollegeFootballData returned no postseason passing box scores for ${season} week ${missingPostseasonCompletionWeek.week}`);
      const rows = emptyPersistRows();
      rows.stats = stats;
      await persistSeason(db, rows);
      await recordRun(db, season, missingPostseasonCompletionWeek.week, "running", new Set(stats.map((row) => row.gameId)).size, `${trigger} stage passing; hydrated postseason week ${missingPostseasonCompletionWeek.week}`);
      return { season, stage: "passing" as const, seasonType: "postseason" as const, week: missingPostseasonCompletionWeek.week, stats: stats.length, sourceGapGames: missingGames.length, durationMs: Date.now() - started };
    }

    return await finalizeSeason(env, season, trigger, started, coverage.predictionCount === 0);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown sync error";
    await recordRun(db, season, 0, "error", 0, `${trigger}: ${detail}`).catch(() => null);
    throw error;
  }
}

export async function syncArchiveBatch(
  env: PipelineEnv,
  initialSeason: number,
  trigger: SyncTrigger = "bootstrap",
  requestedSlices = ARCHIVE_BATCH_MAX_SLICES,
) {
  const maxSlices = Math.max(1, Math.min(ARCHIVE_BATCH_MAX_SLICES, Math.trunc(requestedSlices) || 1));
  const results: Array<Awaited<ReturnType<typeof syncSeasonStep>>> = [];
  let season = initialSeason;
  let rateLimited = false;
  let retryAfterSeconds = 0;
  let message: string | undefined;

  for (let slice = 0; slice < maxSlices; slice += 1) {
    if (slice > 0) await pause(ARCHIVE_BATCH_PAUSE_MS);
    try {
      const result = await syncSeasonStep(env, season, trigger);
      results.push(result);

      // "complete" means the current formula materialization finished. Passing
      // detail may still be due, so re-check the server-owned queue before
      // deciding whether to continue this season or move to the next one.
      if (result.stage === "complete") {
        const status = await getBackfillStatus(env);
        const nextSeason = status.missing[0];
        if (!nextSeason) break;
        season = nextSeason;
      }
    } catch (error) {
      if (!(error instanceof CollegeFootballDataError) || error.status !== 429) throw error;
      rateLimited = true;
      retryAfterSeconds = error.retryAfterSeconds || 12;
      message = error.message;
      break;
    }
  }

  return { results, rateLimited, retryAfterSeconds, message };
}

export async function syncSeason(env: PipelineEnv, season: number, trigger: SyncTrigger = "manual") {
  const started = Date.now();
  if (!env.CFBD_API_KEY) throw new Error("CFBD_API_KEY is not configured");
  const db = env.DB;
  try {
    const teamsPayload = await cfbd("/teams/fbs", env.CFBD_API_KEY, { year: season });
    const teamRows = normalizeTeams(teamsPayload, season);
    if (teamRows.length < 100) throw new Error(`CollegeFootballData returned only ${teamRows.length} FBS teams for ${season}`);
    const teamWrite = emptyPersistRows();
    teamWrite.teams = teamRows;
    await persistSeason(db, teamWrite);
    await pause(1600);

    const eligibleTeams = new Set(teamRows.map((row) => row.team));
    const preseasonInputs = await fetchPreseasonInputs(env.CFBD_API_KEY, season, eligibleTeams);
    const preseasonWrite = emptyPersistRows();
    preseasonWrite.preseasonInputs = preseasonInputs;
    await persistSeason(db, preseasonWrite);
    await pause(1600);

    const gamePayload = await cfbd("/games", env.CFBD_API_KEY, { year: season, seasonType: "both", classification: "fbs" });
    const games = normalizeGames(gamePayload, season);
    if (!games.length) throw new Error(`CollegeFootballData returned no FBS schedule for ${season}`);
    const gameWrite = emptyPersistRows();
    gameWrite.games = games;
    await persistSeason(db, gameWrite);
    await pause(1600);

    const linesPayload = await cfbdOptional("/lines", env.CFBD_API_KEY, { year: season });
    const lines = normalizeLines(linesPayload, season);
    if (lines.length) {
      const lineWrite = emptyPersistRows();
      lineWrite.lines = lines;
      await persistSeason(db, lineWrite);
    }

    let coverage = await getSeasonCoverage(db, season);
    const missingWeek = coverage.completedWeeks.find((row) => !weeklySourceCoverageComplete(row.gameCount, row.statGameCount, row.sourceGapGameCount));
    const missingPostseasonWeek = coverage.completedPostseasonWeeks.find((row) => !weeklySourceCoverageComplete(row.gameCount, row.statGameCount));
    const refreshTarget = missingWeek
      ? { row: missingWeek, seasonType: "regular" as const }
      : missingPostseasonWeek
        ? { row: missingPostseasonWeek, seasonType: "postseason" as const }
        : coverage.completedPostseasonWeeks.at(-1)
          ? { row: coverage.completedPostseasonWeeks.at(-1)!, seasonType: "postseason" as const }
          : coverage.completedWeeks.at(-1)
            ? { row: coverage.completedWeeks.at(-1)!, seasonType: "regular" as const }
            : null;
    if (refreshTarget) {
      await pause(1600);
      const { stats, missingGames } = await fetchWeekTeamStats(env.CFBD_API_KEY, games, season, refreshTarget.row.week, refreshTarget.seasonType);
      if (!stats.length) throw new Error(`CollegeFootballData returned no ${refreshTarget.seasonType} team box scores for ${season} week ${refreshTarget.row.week}`);
      const statWrite = emptyPersistRows();
      statWrite.stats = stats;
      await persistSeason(db, statWrite);
      if (refreshTarget.seasonType === "regular" && missingGames.length === 1 && refreshTarget.row.gameCount >= 10) await recordRun(db, season, refreshTarget.row.week, "source-gap", 1, `CFBD has no team box score for ${missingGames[0].id}: ${missingGames[0].awayTeam} at ${missingGames[0].homeTeam}; excluded from statistical profiles`);
      coverage = await getSeasonCoverage(db, season);
    }

    const remainingWeeks = coverage.completedWeeks.filter((row) => !weeklySourceCoverageComplete(row.gameCount, row.statGameCount, row.sourceGapGameCount));
    const remainingPostseasonWeeks = coverage.completedPostseasonWeeks.filter((row) => !weeklySourceCoverageComplete(row.gameCount, row.statGameCount));
    if (remainingWeeks.length || remainingPostseasonWeeks.length) {
      const nextWeek = remainingWeeks[0]?.week ?? remainingPostseasonWeeks[0].week;
      await recordRun(db, season, nextWeek, "running", games.length, `${trigger} refresh stored schedule and one weekly box-score slice; ${remainingWeeks.length + remainingPostseasonWeeks.length} historical weeks remain`);
      return { season, stage: "stats" as const, latestWeek: coverage.completedWeeks.at(-1)?.week ?? 0, teams: teamRows.length, games: games.length, lines: lines.length, remainingWeeks: remainingWeeks.map((row) => row.week), remainingPostseasonWeeks: remainingPostseasonWeeks.map((row) => row.week), durationMs: Date.now() - started };
    }

    const completedGameCount = coverage.completedRegularGameCount + coverage.completedPostseasonGameCount;
    if (completedGameCount > 0 && (coverage.advancedCompletedGameCount < completedGameCount || coverage.advancedComponentVersion < ADVANCED_COMPONENT_VERSION)) {
      await pause(1600);
      const advanced = await fetchAndPersistAdvancedSeason(env, season, games);
      await recordRun(db, season, 0, "running", advanced.coveredGameCount, `${trigger} stage advanced; cached ${advanced.rowCount} regular- and postseason CFBD component rows covering ${advanced.coveredGameCount} games`);
      coverage = await getSeasonCoverage(db, season);
    }

    if (coverage.formulaSnapshotCount === 0 || coverage.predictionCount < coverage.gameCount) {
      return await finalizeSeason(env, season, trigger, started);
    }

    const missingCompletionWeek = coverage.completedWeeks.find((row) => !weeklySourceCoverageComplete(row.gameCount, row.completionGameCount, row.sourceGapGameCount));
    const missingPostseasonCompletionWeek = coverage.completedPostseasonWeeks.find((row) => !weeklySourceCoverageComplete(row.gameCount, row.completionGameCount));
    const completionTarget = missingCompletionWeek
      ? { row: missingCompletionWeek, seasonType: "regular" as const }
      : missingPostseasonCompletionWeek
        ? { row: missingPostseasonCompletionWeek, seasonType: "postseason" as const }
        : null;
    if (completionTarget) {
      await pause(1600);
      const { stats, missingGames } = await fetchWeekTeamStats(env.CFBD_API_KEY, games, season, completionTarget.row.week, completionTarget.seasonType);
      if (!stats.length) throw new Error(`CollegeFootballData returned no ${completionTarget.seasonType} passing box scores for ${season} week ${completionTarget.row.week}`);
      const statWrite = emptyPersistRows();
      statWrite.stats = stats;
      await persistSeason(db, statWrite);
      if (completionTarget.seasonType === "regular" && missingGames.length === 1 && completionTarget.row.gameCount >= 10) await recordRun(db, season, completionTarget.row.week, "source-gap", 1, `CFBD has no team box score for ${missingGames[0].id}: ${missingGames[0].awayTeam} at ${missingGames[0].homeTeam}; excluded from statistical profiles`);
      coverage = await getSeasonCoverage(db, season);
      const remainingCompletionWeeks = coverage.completedWeeks.filter((row) => !weeklySourceCoverageComplete(row.gameCount, row.completionGameCount, row.sourceGapGameCount));
      const remainingPostseasonCompletionWeeks = coverage.completedPostseasonWeeks.filter((row) => !weeklySourceCoverageComplete(row.gameCount, row.completionGameCount));
      if (remainingCompletionWeeks.length || remainingPostseasonCompletionWeeks.length) {
        await recordRun(db, season, completionTarget.row.week, "running", new Set(stats.map((row) => row.gameId)).size, `${trigger} stage passing; hydrated ${completionTarget.seasonType} week ${completionTarget.row.week}; ${remainingCompletionWeeks.length + remainingPostseasonCompletionWeeks.length} completion-data weeks remain`);
        return { season, stage: "passing" as const, latestWeek: coverage.completedWeeks.at(-1)?.week ?? 0, teams: teamRows.length, games: games.length, lines: lines.length, stats: stats.length, remainingWeeks: remainingCompletionWeeks.map((row) => row.week), remainingPostseasonWeeks: remainingPostseasonCompletionWeeks.map((row) => row.week), durationMs: Date.now() - started };
      }
    }

    return await finalizeSeason(env, season, trigger, started);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown sync error";
    await recordRun(db, season, 0, "error", 0, `${trigger}: ${detail}`).catch(() => null);
    throw error;
  }
}

export async function syncHistorical(env: PipelineEnv, fromSeason = FIRST_HISTORICAL_SEASON, toSeason = currentCollegeFootballSeason()) {
  const status = await getBackfillStatus(env);
  const season = status.missing.find((candidate) => candidate >= fromSeason && candidate <= toSeason);
  // One bounded, paced batch per invocation keeps the job below the Worker/D1
  // budget while avoiding a dependency on dozens of separate cron deliveries.
  return season ? (await syncArchiveBatch(env, season, "bootstrap")).results : [];
}
