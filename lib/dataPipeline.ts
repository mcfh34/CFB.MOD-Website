import { baselines, modelCalibration, scoreCoefficients } from "../app/modelData";

export type PipelineEnv = { DB: D1Database; CFBD_API_KEY?: string; SYNC_TOKEN?: string };
export type SyncTrigger = "manual" | "scheduled" | "bootstrap";

type JsonRecord = Record<string, unknown>;
export type NormalizedGame = {
  id: string; season: number; week: number; seasonType: string; startDate: string | null;
  completed: boolean; neutralSite: boolean; conferenceGame: boolean; venue: string | null;
  homeTeam: string; homeConference: string | null; homePoints: number | null;
  awayTeam: string; awayConference: string | null; awayPoints: number | null;
};
type NormalizedStat = {
  gameId: string; season: number; week: number; team: string; opponent: string; homeAway: string;
  points: number | null; totalYards: number; yardsPerPlay: number; passYards: number; passAttempts: number;
  yardsPerPass: number; rushYards: number; rushAttempts: number; yardsPerRush: number; turnovers: number;
};
export type Profile = {
  season: number; week: number; team: string; gamesPlayed: number;
  off: [number, number, number, number, number]; def: [number, number, number, number, number];
  oi: [number, number, number, number, number]; di: [number, number, number, number, number];
};
type Line = {
  gameId: string; season: number; week: number; provider: string | null; spread: number | null;
  spreadOpen: number | null; formattedSpread: string | null; overUnder: number | null;
  overUnderOpen: number | null; homeMoneyline: number | null; awayMoneyline: number | null;
};

export const MODEL_VERSION = "harper-plus-v5";
const PRESEASON_WEIGHTS = [0.4, 0.3, 0.2, 0.1] as const;
const BASE_URL = "https://api.collegefootballdata.com";
export const FIRST_HISTORICAL_SEASON = 2021;

export function scheduleCalibrationWeights(gamesPlayed: number, fbsOpponents: number) {
  const games = Math.max(0, gamesPlayed);
  const fbsShare = games ? Math.max(0, Math.min(1, fbsOpponents / games)) : 0;
  const weakScheduleShare = 1 - fbsShare;
  const earlySeasonShare = Math.max(0, Math.min(1, (4 - games) / 4));
  return {
    fbsShare,
    opponentAdjustment: Math.min(
      modelCalibration.maxOpponentAdjustment,
      modelCalibration.opponentAdjustment + weakScheduleShare * 0.22 + earlySeasonShare * 0.05,
    ),
    priorGames:
      modelCalibration.preseasonEquivalentGames +
      weakScheduleShare * modelCalibration.weakSchedulePriorGames +
      earlySeasonShare * modelCalibration.earlySeasonPriorGames,
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

function parseAttempts(input: unknown) {
  if (typeof input === "number") return input;
  const stringValue = String(input ?? "");
  if (stringValue.includes("-")) return Number(stringValue.split("-").at(-1)) || 0;
  return Number(stringValue) || 0;
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

async function cfbd(path: string, key: string, params: Record<string, string | number | undefined>) {
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

function normalizeStats(payload: unknown, games: NormalizedGame[], season: number): NormalizedStat[] {
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
      const passAttempts = parseAttempts(categories.get("completionattempts") ?? categories.get("passingcompletionsattempts") ?? categories.get("passattempts"));
      const rushAttempts = pickStat(categories, "rushingAttempts", "rushAttempts");
      const passYards = pickStat(categories, "netPassingYards", "passingYards", "passYards");
      const rushYards = pickStat(categories, "rushingYards", "rushYards");
      const totalYards = pickStat(categories, "totalYards") || passYards + rushYards;
      const plays = passAttempts + rushAttempts;
      output.push({
        gameId, season: game?.season ?? season, week: game?.week ?? numberValue(gameStat, "week") ?? 0,
        team, opponent, homeAway, points: numberValue(teamRow, "points"), totalYards,
        yardsPerPlay: plays ? totalYards / plays : 0, passYards, passAttempts,
        yardsPerPass: passAttempts ? passYards / passAttempts : 0, rushYards, rushAttempts,
        yardsPerRush: rushAttempts ? rushYards / rushAttempts : 0,
        turnovers: pickStat(categories, "turnovers", "turnoversLost"),
      });
    }
  }
  return output.filter((row) => row.gameId && row.week > 0);
}

function normalizeLines(payload: unknown, season: number): Line[] {
  const preferred = ["consensus", "draftkings", "espn bet", "fanduel", "betmgm", "bovada"];
  return asRecords(payload).map((game) => {
    const options = asRecords(value(game, "lines"));
    const selected = [...options].sort((a, b) => {
      const ai = preferred.indexOf((textValue(a, "provider") ?? "").toLowerCase());
      const bi = preferred.indexOf((textValue(b, "provider") ?? "").toLowerCase());
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    })[0] ?? {};
    return {
      gameId: String(value(game, "id", "gameId", "game_id") ?? ""), season: numberValue(game, "season") ?? season,
      week: numberValue(game, "week") ?? 0, provider: textValue(selected, "provider"),
      spread: numberValue(selected, "spread"), spreadOpen: numberValue(selected, "spreadOpen", "spread_open"),
      formattedSpread: textValue(selected, "formattedSpread", "formatted_spread"),
      overUnder: numberValue(selected, "overUnder", "over_under"), overUnderOpen: numberValue(selected, "overUnderOpen", "over_under_open"),
      homeMoneyline: numberValue(selected, "homeMoneyline", "home_moneyline"), awayMoneyline: numberValue(selected, "awayMoneyline", "away_moneyline"),
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
    for (const [team, profile] of rawProfiles) {
      const prior = preseasonByTeam.get(team);
      const opponents = throughWeek.filter((row) => row.team === team).map((row) => row.opponent).filter(Boolean);
      const calibration = scheduleCalibrationWeights(profile.gamesPlayed, opponents.filter((opponent) => eligibleTeams.has(opponent)).length);
      const blendPrior = (current: number, previous: number) => (current * profile.gamesPlayed + previous * calibration.priorGames) / Math.max(1, profile.gamesPlayed + calibration.priorGames);
      const oi = profile.oi.map((metric, index) => clampIndex(blendPrior(scheduleBlend(metric, adjustedOffense.get(team)?.[index] ?? metric, calibration.opponentAdjustment), prior?.oi[index] ?? 1))) as Profile["oi"];
      const di = profile.di.map((metric, index) => clampIndex(blendPrior(scheduleBlend(metric, adjustedDefense.get(team)?.[index] ?? metric, calibration.opponentAdjustment), prior?.di[index] ?? 1))) as Profile["di"];
      profiles.push({ ...profile, oi, di });
    }
  }
  return profiles;
}

function score(ypc: number, ypp: number, ypa: number, ratt: number, patt: number) {
  return Math.max(0, scoreCoefficients.intercept + scoreCoefficients.ypc * ypc + scoreCoefficients.ypp * ypp + scoreCoefficients.ypa * ypa + scoreCoefficients.ratt * ratt + scoreCoefficients.patt * patt);
}

function normalCdf(value: number) {
  const sign = value < 0 ? -1 : 1; const x = Math.abs(value) / Math.sqrt(2); const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x));
  return 0.5 * (1 + sign * erf);
}

export function project(home: Profile | null, away: Profile | null, neutral: boolean, homeElo?: number, awayElo?: number) {
  const h = home ?? { oi: [1, 1, 1, 1, 1], di: [1, 1, 1, 1, 1] };
  const a = away ?? { oi: [1, 1, 1, 1, 1], di: [1, 1, 1, 1, 1] };
  const side = (offense: number[], defense: number[]) => {
    const ypa = baselines.ypa * offense[1] * defense[1]; const ypc = baselines.ypc * offense[2] * defense[2];
    const patt = baselines.patt * offense[3] * defense[3]; const ratt = baselines.ratt * offense[4] * defense[4];
    const ypp = (ypa * patt + ypc * ratt) / Math.max(1, patt + ratt);
    return score(ypc, ypp, ypa, ratt, patt);
  };
  const hfa = neutral ? 0 : modelCalibration.homeFieldAdvantage;
  const statisticalHomeScore = side(h.oi, a.di) + hfa / 2; const statisticalAwayScore = side(a.oi, h.di) - hfa / 2;
  const statisticalMargin = statisticalHomeScore - statisticalAwayScore;
  const outcomeMargin = homeElo === undefined || awayElo === undefined
    ? statisticalMargin
    : (homeElo - awayElo) / modelCalibration.eloPointsPerPoint + hfa;
  const margin = (1 - modelCalibration.outcomeBlend) * statisticalMargin + modelCalibration.outcomeBlend * outcomeMargin;
  const total = statisticalHomeScore + statisticalAwayScore;
  const homeScore = Math.max(0, total / 2 + margin / 2);
  const awayScore = Math.max(0, total / 2 - margin / 2);
  const homeWinProbability = normalCdf(margin / 13.8);
  return { homeScore, awayScore, margin, homeWinProbability, modelHomeSpread: -margin, modelTotal: homeScore + awayScore };
}

function preseasonElo(profile: Profile | undefined) {
  if (!profile) return 1500;
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
  const groups = [...new Set(ordered.map((game) => `${phase(game)}:${game.week}`))];
  for (const group of groups) {
    const groupedGames = ordered.filter((game) => `${phase(game)}:${game.week}` === group);
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

export function latestProfile(profiles: Profile[], team: string, week: number) {
  for (let candidate = week; candidate >= 0; candidate -= 1) {
    const profile = profiles.find((row) => row.team === team && row.week === candidate);
    if (profile) return profile;
  }
  return null;
}

function buildSeasonArtifacts(games: NormalizedGame[], stats: NormalizedStat[], lines: Line[], season: number, eligibleTeams: Set<string>, preseasonProfiles: Profile[] = []) {
  const profiles = [...preseasonProfiles, ...buildProfiles(games, stats, season, eligibleTeams, preseasonProfiles)];
  const linesByGame = new Map(lines.map((line) => [line.gameId, line]));
  const maxProfileWeek = Math.max(0, ...profiles.map((profile) => profile.week));
  const pregameElo = buildPregameElo(games, preseasonProfiles, eligibleTeams);
  const predictions = games.map((game) => {
    const generatedFromWeek = game.seasonType === "postseason" ? maxProfileWeek : Math.max(0, game.week - 1);
    const ratings = pregameElo.get(game.id);
    const prediction = project(
      latestProfile(profiles, game.homeTeam, generatedFromWeek),
      latestProfile(profiles, game.awayTeam, generatedFromWeek),
      game.neutralSite,
      ratings?.get(game.homeTeam) ?? (eligibleTeams.has(game.homeTeam) ? 1500 : modelCalibration.fcsElo),
      ratings?.get(game.awayTeam) ?? (eligibleTeams.has(game.awayTeam) ? 1500 : modelCalibration.fcsElo),
    );
    const line = linesByGame.get(game.id);
    const spreadEdge = line?.spread === null || line?.spread === undefined ? null : line.spread - prediction.modelHomeSpread;
    const totalEdge = line?.overUnder === null || line?.overUnder === undefined ? null : prediction.modelTotal - line.overUnder;
    const completed = game.homePoints !== null && game.awayPoints !== null;
    const actualMargin = completed ? game.homePoints! - game.awayPoints! : null;
    const actualTotal = completed ? game.homePoints! + game.awayPoints! : null;
    const atsActual = actualMargin === null || line?.spread === null || line?.spread === undefined ? null : actualMargin + line.spread;
    const spreadResult = spreadEdge === null || atsActual === null ? null : atsActual === 0 || spreadEdge === 0 ? "PUSH" : Math.sign(spreadEdge) === Math.sign(atsActual) ? "W" : "L";
    const totalResult = totalEdge === null || actualTotal === null || line?.overUnder === null || line?.overUnder === undefined ? null : actualTotal === line.overUnder || totalEdge === 0 ? "PUSH" : Math.sign(totalEdge) === Math.sign(actualTotal - line.overUnder) ? "W" : "L";
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
      spreadEdge,
      totalEdge,
      spreadError: actualMargin === null ? null : Math.abs(prediction.margin - actualMargin),
      totalError: actualTotal === null ? null : Math.abs(prediction.modelTotal - actualTotal),
      spreadResult,
      totalResult,
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
  return { profiles, predictions, snapshots, maxWeek };
}

async function upsertJsonRows<T>(db: D1Database, sql: string, rows: T[], size = 600) {
  for (let index = 0; index < rows.length; index += size) {
    await db.prepare(sql).bind(JSON.stringify(rows.slice(index, index + size))).run();
  }
}

type PersistSeasonPayload = {
  teams: unknown[]; games: NormalizedGame[]; stats: NormalizedStat[]; lines: Line[]; profiles: Profile[];
  predictions: unknown[]; snapshots: unknown[];
};

async function persistSeason(db: D1Database, rows: PersistSeasonPayload) {
  await upsertJsonRows(db, `INSERT INTO cfb_teams (season,team,team_id,abbreviation,mascot,conference,color,alt_color,logo,updated_at)
    SELECT json_extract(value,'$.season'),json_extract(value,'$.team'),json_extract(value,'$.teamId'),json_extract(value,'$.abbreviation'),json_extract(value,'$.mascot'),json_extract(value,'$.conference'),json_extract(value,'$.color'),json_extract(value,'$.altColor'),json_extract(value,'$.logo'),CURRENT_TIMESTAMP FROM json_each(?) WHERE 1
    ON CONFLICT(season,team) DO UPDATE SET team_id=excluded.team_id,abbreviation=excluded.abbreviation,mascot=excluded.mascot,conference=excluded.conference,color=excluded.color,alt_color=excluded.alt_color,logo=excluded.logo,updated_at=CURRENT_TIMESTAMP`, rows.teams);

  await upsertJsonRows(db, `INSERT INTO cfb_games (game_id,season,week,season_type,start_date,completed,neutral_site,conference_game,venue,home_team,home_conference,home_points,away_team,away_conference,away_points,updated_at)
    SELECT json_extract(value,'$.id'),json_extract(value,'$.season'),json_extract(value,'$.week'),json_extract(value,'$.seasonType'),json_extract(value,'$.startDate'),json_extract(value,'$.completed'),json_extract(value,'$.neutralSite'),json_extract(value,'$.conferenceGame'),json_extract(value,'$.venue'),json_extract(value,'$.homeTeam'),json_extract(value,'$.homeConference'),json_extract(value,'$.homePoints'),json_extract(value,'$.awayTeam'),json_extract(value,'$.awayConference'),json_extract(value,'$.awayPoints'),CURRENT_TIMESTAMP FROM json_each(?) WHERE 1
    ON CONFLICT(game_id) DO UPDATE SET season=excluded.season,week=excluded.week,season_type=excluded.season_type,start_date=excluded.start_date,completed=excluded.completed,neutral_site=excluded.neutral_site,conference_game=excluded.conference_game,venue=excluded.venue,home_team=excluded.home_team,home_conference=excluded.home_conference,home_points=excluded.home_points,away_team=excluded.away_team,away_conference=excluded.away_conference,away_points=excluded.away_points,updated_at=CURRENT_TIMESTAMP`, rows.games);

  await upsertJsonRows(db, `INSERT INTO team_game_stats (game_id,season,week,team,opponent,home_away,points,total_yards,yards_per_play,pass_yards,pass_attempts,yards_per_pass,rush_yards,rush_attempts,yards_per_rush,turnovers,updated_at)
    SELECT json_extract(value,'$.gameId'),json_extract(value,'$.season'),json_extract(value,'$.week'),json_extract(value,'$.team'),json_extract(value,'$.opponent'),json_extract(value,'$.homeAway'),json_extract(value,'$.points'),json_extract(value,'$.totalYards'),json_extract(value,'$.yardsPerPlay'),json_extract(value,'$.passYards'),json_extract(value,'$.passAttempts'),json_extract(value,'$.yardsPerPass'),json_extract(value,'$.rushYards'),json_extract(value,'$.rushAttempts'),json_extract(value,'$.yardsPerRush'),json_extract(value,'$.turnovers'),CURRENT_TIMESTAMP FROM json_each(?) WHERE 1
    ON CONFLICT(game_id,team) DO UPDATE SET season=excluded.season,week=excluded.week,opponent=excluded.opponent,home_away=excluded.home_away,points=excluded.points,total_yards=excluded.total_yards,yards_per_play=excluded.yards_per_play,pass_yards=excluded.pass_yards,pass_attempts=excluded.pass_attempts,yards_per_pass=excluded.yards_per_pass,rush_yards=excluded.rush_yards,rush_attempts=excluded.rush_attempts,yards_per_rush=excluded.yards_per_rush,turnovers=excluded.turnovers,updated_at=CURRENT_TIMESTAMP`, rows.stats);

  await upsertJsonRows(db, `INSERT INTO betting_lines (game_id,season,week,provider,spread,spread_open,formatted_spread,over_under,over_under_open,home_moneyline,away_moneyline,updated_at)
    SELECT json_extract(value,'$.gameId'),json_extract(value,'$.season'),json_extract(value,'$.week'),json_extract(value,'$.provider'),json_extract(value,'$.spread'),json_extract(value,'$.spreadOpen'),json_extract(value,'$.formattedSpread'),json_extract(value,'$.overUnder'),json_extract(value,'$.overUnderOpen'),json_extract(value,'$.homeMoneyline'),json_extract(value,'$.awayMoneyline'),CURRENT_TIMESTAMP FROM json_each(?) WHERE 1
    ON CONFLICT(game_id) DO UPDATE SET season=excluded.season,week=excluded.week,provider=excluded.provider,spread=excluded.spread,spread_open=excluded.spread_open,formatted_spread=excluded.formatted_spread,over_under=excluded.over_under,over_under_open=excluded.over_under_open,home_moneyline=excluded.home_moneyline,away_moneyline=excluded.away_moneyline,updated_at=CURRENT_TIMESTAMP`, rows.lines);

  await upsertJsonRows(db, `INSERT INTO weekly_profiles (season,week,team,games_played,off_ypp,off_ypa,off_ypc,off_patt,off_ratt,def_ypp,def_ypa,def_ypc,def_patt,def_ratt,off_ypp_index,off_ypa_index,off_ypc_index,off_patt_index,off_ratt_index,def_ypp_index,def_ypa_index,def_ypc_index,def_patt_index,def_ratt_index,created_at)
    SELECT json_extract(value,'$.season'),json_extract(value,'$.week'),json_extract(value,'$.team'),json_extract(value,'$.gamesPlayed'),json_extract(value,'$.off[0]'),json_extract(value,'$.off[1]'),json_extract(value,'$.off[2]'),json_extract(value,'$.off[3]'),json_extract(value,'$.off[4]'),json_extract(value,'$.def[0]'),json_extract(value,'$.def[1]'),json_extract(value,'$.def[2]'),json_extract(value,'$.def[3]'),json_extract(value,'$.def[4]'),json_extract(value,'$.oi[0]'),json_extract(value,'$.oi[1]'),json_extract(value,'$.oi[2]'),json_extract(value,'$.oi[3]'),json_extract(value,'$.oi[4]'),json_extract(value,'$.di[0]'),json_extract(value,'$.di[1]'),json_extract(value,'$.di[2]'),json_extract(value,'$.di[3]'),json_extract(value,'$.di[4]'),CURRENT_TIMESTAMP FROM json_each(?) WHERE 1
    ON CONFLICT(season,week,team) DO UPDATE SET games_played=excluded.games_played,off_ypp=excluded.off_ypp,off_ypa=excluded.off_ypa,off_ypc=excluded.off_ypc,off_patt=excluded.off_patt,off_ratt=excluded.off_ratt,def_ypp=excluded.def_ypp,def_ypa=excluded.def_ypa,def_ypc=excluded.def_ypc,def_patt=excluded.def_patt,def_ratt=excluded.def_ratt,off_ypp_index=excluded.off_ypp_index,off_ypa_index=excluded.off_ypa_index,off_ypc_index=excluded.off_ypc_index,off_patt_index=excluded.off_patt_index,off_ratt_index=excluded.off_ratt_index,def_ypp_index=excluded.def_ypp_index,def_ypa_index=excluded.def_ypa_index,def_ypc_index=excluded.def_ypc_index,def_patt_index=excluded.def_patt_index,def_ratt_index=excluded.def_ratt_index,created_at=CURRENT_TIMESTAMP`, rows.profiles);

  await upsertJsonRows(db, `INSERT INTO model_predictions (game_id,season,week,generated_from_week,home_team,away_team,home_score,away_score,home_win_probability,model_home_spread,model_total,vegas_spread,vegas_total,spread_edge,total_edge,spread_error,total_error,spread_result,total_result,model_version,created_at)
    SELECT json_extract(value,'$.gameId'),json_extract(value,'$.season'),json_extract(value,'$.week'),json_extract(value,'$.generatedFromWeek'),json_extract(value,'$.homeTeam'),json_extract(value,'$.awayTeam'),json_extract(value,'$.homeScore'),json_extract(value,'$.awayScore'),json_extract(value,'$.homeWinProbability'),json_extract(value,'$.modelHomeSpread'),json_extract(value,'$.modelTotal'),json_extract(value,'$.vegasSpread'),json_extract(value,'$.vegasTotal'),json_extract(value,'$.spreadEdge'),json_extract(value,'$.totalEdge'),json_extract(value,'$.spreadError'),json_extract(value,'$.totalError'),json_extract(value,'$.spreadResult'),json_extract(value,'$.totalResult'),json_extract(value,'$.modelVersion'),CURRENT_TIMESTAMP FROM json_each(?) WHERE 1
    ON CONFLICT(game_id) DO UPDATE SET season=excluded.season,week=excluded.week,generated_from_week=excluded.generated_from_week,home_team=excluded.home_team,away_team=excluded.away_team,home_score=excluded.home_score,away_score=excluded.away_score,home_win_probability=excluded.home_win_probability,model_home_spread=excluded.model_home_spread,model_total=excluded.model_total,vegas_spread=excluded.vegas_spread,vegas_total=excluded.vegas_total,spread_edge=excluded.spread_edge,total_edge=excluded.total_edge,spread_error=excluded.spread_error,total_error=excluded.total_error,spread_result=excluded.spread_result,total_result=excluded.total_result,model_version=excluded.model_version,created_at=CURRENT_TIMESTAMP`, rows.predictions);

  await upsertJsonRows(db, `INSERT INTO model_snapshots (season,week,team_count,game_count,completed_game_count,source,model_version,created_at)
    SELECT json_extract(value,'$.season'),json_extract(value,'$.week'),json_extract(value,'$.teamCount'),json_extract(value,'$.gameCount'),json_extract(value,'$.completedGameCount'),json_extract(value,'$.source'),json_extract(value,'$.modelVersion'),CURRENT_TIMESTAMP FROM json_each(?) WHERE 1
    ON CONFLICT(season,week) DO UPDATE SET team_count=excluded.team_count,game_count=excluded.game_count,completed_game_count=excluded.completed_game_count,source=excluded.source,model_version=excluded.model_version,created_at=CURRENT_TIMESTAMP`, rows.snapshots);
}

const emptyPersistRows = (): PersistSeasonPayload => ({ teams: [], games: [], stats: [], lines: [], profiles: [], predictions: [], snapshots: [] });

async function loadSeasonGames(db: D1Database, season: number): Promise<NormalizedGame[]> {
  const result = await db.prepare(`SELECT game_id,season,week,season_type,start_date,completed,neutral_site,conference_game,venue,home_team,home_conference,home_points,away_team,away_conference,away_points
    FROM cfb_games WHERE season=? ORDER BY week,start_date,game_id`).bind(season).all<JsonRecord>();
  return normalizeGames(result.results as JsonRecord[], season);
}

async function loadSeasonStats(db: D1Database, season: number): Promise<NormalizedStat[]> {
  const result = await db.prepare(`SELECT game_id,season,week,team,opponent,home_away,points,total_yards,yards_per_play,pass_yards,pass_attempts,yards_per_pass,rush_yards,rush_attempts,yards_per_rush,turnovers
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
    yardsPerPass: numberValue(row, "yards_per_pass") ?? 0,
    rushYards: numberValue(row, "rush_yards") ?? 0,
    rushAttempts: numberValue(row, "rush_attempts") ?? 0,
    yardsPerRush: numberValue(row, "yards_per_rush") ?? 0,
    turnovers: numberValue(row, "turnovers") ?? 0,
  })).filter((row: NormalizedStat) => row.gameId && row.team && row.week > 0);
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

async function loadPreseasonProfiles(db: D1Database, season: number, eligibleTeams: Set<string>): Promise<Profile[]> {
  const firstPriorSeason = Math.max(FIRST_HISTORICAL_SEASON, season - PRESEASON_WEIGHTS.length);
  const result = await db.prepare(`SELECT
      wp.season,wp.team,wp.off_ypp AS offYpp,wp.off_ypa AS offYpa,wp.off_ypc AS offYpc,wp.off_patt AS offPatt,wp.off_ratt AS offRatt,
      wp.def_ypp AS defYpp,wp.def_ypa AS defYpa,wp.def_ypc AS defYpc,wp.def_patt AS defPatt,wp.def_ratt AS defRatt,
      wp.off_ypp_index AS offYppIndex,wp.off_ypa_index AS offYpaIndex,wp.off_ypc_index AS offYpcIndex,wp.off_patt_index AS offPattIndex,wp.off_ratt_index AS offRattIndex,
      wp.def_ypp_index AS defYppIndex,wp.def_ypa_index AS defYpaIndex,wp.def_ypc_index AS defYpcIndex,wp.def_patt_index AS defPattIndex,wp.def_ratt_index AS defRattIndex
    FROM weekly_profiles wp
    JOIN (
      SELECT season,team,MAX(week) AS week FROM weekly_profiles
      WHERE season>=? AND season<? AND week>0 GROUP BY season,team
    ) latest ON latest.season=wp.season AND latest.team=wp.team AND latest.week=wp.week
    WHERE wp.season>=? AND wp.season<?`)
    .bind(firstPriorSeason, season, firstPriorSeason, season).all<JsonRecord>();

  const byTeam = new Map<string, JsonRecord[]>();
  for (const row of result.results as JsonRecord[]) {
    const team = textValue(row, "team");
    if (!team || !eligibleTeams.has(team)) continue;
    const rows = byTeam.get(team) ?? [];
    rows.push(row);
    byTeam.set(team, rows);
  }

  const rawBaseline: [number, number, number, number, number] = [baselines.ypp, baselines.ypa, baselines.ypc, baselines.patt, baselines.ratt];
  const neutralIndex: [number, number, number, number, number] = [1, 1, 1, 1, 1];
  const tuple = (row: JsonRecord, prefix: "off" | "def", suffix = ""): [number, number, number, number, number] => [
    numberValue(row, `${prefix}Ypp${suffix}`) ?? 0,
    numberValue(row, `${prefix}Ypa${suffix}`) ?? 0,
    numberValue(row, `${prefix}Ypc${suffix}`) ?? 0,
    numberValue(row, `${prefix}Patt${suffix}`) ?? 0,
    numberValue(row, `${prefix}Ratt${suffix}`) ?? 0,
  ];
  const weightedTuple = (rows: JsonRecord[], accessor: (row: JsonRecord) => [number, number, number, number, number], fallback: [number, number, number, number, number]) => {
    const weighted = rows.map((row) => ({ row, weight: PRESEASON_WEIGHTS[season - Number(row.season) - 1] ?? 0 })).filter((item) => item.weight > 0);
    const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
    if (!totalWeight) return [...fallback] as [number, number, number, number, number];
    return fallback.map((_, metric) => weighted.reduce((sum, item) => sum + accessor(item.row)[metric] * item.weight, 0) / totalWeight) as [number, number, number, number, number];
  };

  return [...eligibleTeams].map((team) => {
    const history = byTeam.get(team) ?? [];
    return {
      season,
      week: 0,
      team,
      gamesPlayed: 0,
      off: weightedTuple(history, (row) => tuple(row, "off"), rawBaseline),
      def: weightedTuple(history, (row) => tuple(row, "def"), rawBaseline),
      oi: weightedTuple(history, (row) => tuple(row, "off", "Index"), neutralIndex),
      di: weightedTuple(history, (row) => tuple(row, "def", "Index"), neutralIndex),
    };
  });
}

export async function calculateCachedPerformance(db: D1Database, season: number) {
  const [games, stats, teamResult, lines] = await Promise.all([
    loadSeasonGames(db, season),
    loadSeasonStats(db, season),
    db.prepare("SELECT team FROM cfb_teams WHERE season=?").bind(season).all<{ team: string }>(),
    loadSeasonLines(db, season),
  ]);
  const eligibleTeams = new Set(teamResult.results.map((row) => row.team));
  if (!games.length || eligibleTeams.size < 100) return null;
  const preseasonProfiles = await loadPreseasonProfiles(db, season, eligibleTeams);
  const { profiles, predictions } = buildSeasonArtifacts(games, stats, lines, season, eligibleTeams, preseasonProfiles);
  if (predictions.length !== games.length) return null;
  const gamesById = new Map(games.map((game) => [game.id, game]));
  const marketEligible = (prediction: (typeof predictions)[number]) => prediction.week >= 5 || gamesById.get(prediction.gameId)?.seasonType === "postseason";
  const metric = (side: "spread" | "total") => {
    const resultKey = side === "spread" ? "spreadResult" : "totalResult";
    const errorKey = side === "spread" ? "spreadError" : "totalError";
    const rows = predictions.filter((prediction) => marketEligible(prediction) && ["W", "L", "PUSH"].includes(String(prediction[resultKey] ?? "")));
    const wins = rows.filter((prediction) => prediction[resultKey] === "W").length;
    const losses = rows.filter((prediction) => prediction[resultKey] === "L").length;
    const pushes = rows.filter((prediction) => prediction[resultKey] === "PUSH").length;
    const errors = rows.map((prediction) => prediction[errorKey]).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const graded = wins + losses;
    return { wins, losses, pushes, graded, accuracy: graded ? wins / graded : null, meanAbsoluteError: errors.length ? errors.reduce((sum, value) => sum + value, 0) / errors.length : null };
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

type WeekCoverage = { week: number; gameCount: number; statGameCount: number };
type SeasonCoverage = {
  season: number;
  teamCount: number;
  logoCount: number;
  gameCount: number;
  postseasonGameCount: number;
  profileTeamCount: number;
  predictionCount: number;
  lineCount: number;
  completedWeeks: WeekCoverage[];
};

async function getSeasonCoverage(db: D1Database, season: number): Promise<SeasonCoverage> {
  const [counts, weeks] = await Promise.all([
    db.prepare(`SELECT
      (SELECT COUNT(*) FROM cfb_teams WHERE season=?) AS teamCount,
      (SELECT COUNT(*) FROM cfb_teams WHERE season=? AND logo IS NOT NULL AND logo<>'') AS logoCount,
      (SELECT COUNT(*) FROM cfb_games WHERE season=?) AS gameCount,
      (SELECT COUNT(*) FROM cfb_games WHERE season=? AND season_type='postseason') AS postseasonGameCount,
      (SELECT COUNT(DISTINCT team) FROM weekly_profiles WHERE season=?) AS profileTeamCount,
      (SELECT COUNT(*) FROM model_predictions WHERE season=?) AS predictionCount,
      (SELECT COUNT(*) FROM betting_lines WHERE season=?) AS lineCount`).bind(season, season, season, season, season, season, season).first<{ teamCount: number; logoCount: number; gameCount: number; postseasonGameCount: number; profileTeamCount: number; predictionCount: number; lineCount: number }>(),
    db.prepare(`SELECT g.week AS week,COUNT(DISTINCT g.game_id) AS gameCount,COUNT(DISTINCT s.game_id) AS statGameCount
      FROM cfb_games g LEFT JOIN team_game_stats s ON s.game_id=g.game_id
      WHERE g.season=? AND g.season_type='regular' AND g.completed=1 AND g.week BETWEEN 1 AND 15
      GROUP BY g.week ORDER BY g.week`).bind(season).all<WeekCoverage>(),
  ]);
  return {
    season,
    teamCount: Number(counts?.teamCount ?? 0),
    logoCount: Number(counts?.logoCount ?? 0),
    gameCount: Number(counts?.gameCount ?? 0),
    postseasonGameCount: Number(counts?.postseasonGameCount ?? 0),
    profileTeamCount: Number(counts?.profileTeamCount ?? 0),
    predictionCount: Number(counts?.predictionCount ?? 0),
    lineCount: Number(counts?.lineCount ?? 0),
    completedWeeks: (weeks.results as WeekCoverage[]).map((row: WeekCoverage) => ({ week: Number(row.week), gameCount: Number(row.gameCount), statGameCount: Number(row.statGameCount) })),
  };
}

export function currentCollegeFootballSeason(date = new Date()) {
  return date.getUTCMonth() >= 6 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
}

export type BackfillSeasonStatus = {
  season: number;
  teamCount: number;
  logoCount: number;
  gameCount: number;
  postseasonGameCount: number;
  statRowCount: number;
  profileTeamCount: number;
  profileCount: number;
  predictionCount: number;
  lineCount: number;
  completedWeekCount: number;
  statWeekCount: number;
  stage: "teams" | "schedule" | "stats" | "formulas" | "ready";
  progressPercent: number;
  ready: boolean;
};

export async function getBackfillStatus(env: PipelineEnv) {
  const currentSeason = currentCollegeFootballSeason();
  const seasons = Array.from({ length: currentSeason - FIRST_HISTORICAL_SEASON + 1 }, (_, index) => FIRST_HISTORICAL_SEASON + index);
  const [teamResult, logoResult, gameResult, postseasonResult, statResult, profileResult, profileRowResult, predictionResult, lineResult, weekResult] = await Promise.all([
    env.DB.prepare("SELECT season,COUNT(*) AS count FROM cfb_teams WHERE season>=? GROUP BY season").bind(FIRST_HISTORICAL_SEASON).all<{ season: number; count: number }>(),
    env.DB.prepare("SELECT season,COUNT(*) AS count FROM cfb_teams WHERE season>=? AND logo IS NOT NULL AND logo<>'' GROUP BY season").bind(FIRST_HISTORICAL_SEASON).all<{ season: number; count: number }>(),
    env.DB.prepare("SELECT season,COUNT(*) AS count FROM cfb_games WHERE season>=? GROUP BY season").bind(FIRST_HISTORICAL_SEASON).all<{ season: number; count: number }>(),
    env.DB.prepare("SELECT season,COUNT(*) AS count FROM cfb_games WHERE season>=? AND season_type='postseason' GROUP BY season").bind(FIRST_HISTORICAL_SEASON).all<{ season: number; count: number }>(),
    env.DB.prepare("SELECT season,COUNT(*) AS count FROM team_game_stats WHERE season>=? GROUP BY season").bind(FIRST_HISTORICAL_SEASON).all<{ season: number; count: number }>(),
    env.DB.prepare("SELECT season,COUNT(DISTINCT team) AS count FROM weekly_profiles WHERE season>=? GROUP BY season").bind(FIRST_HISTORICAL_SEASON).all<{ season: number; count: number }>(),
    env.DB.prepare("SELECT season,COUNT(*) AS count FROM weekly_profiles WHERE season>=? GROUP BY season").bind(FIRST_HISTORICAL_SEASON).all<{ season: number; count: number }>(),
    env.DB.prepare("SELECT season,COUNT(*) AS count FROM model_predictions WHERE season>=? AND model_version=? GROUP BY season").bind(FIRST_HISTORICAL_SEASON, MODEL_VERSION).all<{ season: number; count: number }>(),
    env.DB.prepare("SELECT season,COUNT(*) AS count FROM betting_lines WHERE season>=? GROUP BY season").bind(FIRST_HISTORICAL_SEASON).all<{ season: number; count: number }>(),
    env.DB.prepare(`SELECT g.season,g.week,COUNT(DISTINCT g.game_id) AS gameCount,COUNT(DISTINCT s.game_id) AS statGameCount
      FROM cfb_games g LEFT JOIN team_game_stats s ON s.game_id=g.game_id
      WHERE g.season>=? AND g.season_type='regular' AND g.completed=1 AND g.week BETWEEN 1 AND 15
      GROUP BY g.season,g.week`).bind(FIRST_HISTORICAL_SEASON).all<{ season: number; week: number; gameCount: number; statGameCount: number }>(),
  ]);
  const counts = (rows: Array<{ season: number; count: number }>) => new Map(rows.map((row) => [Number(row.season), Number(row.count)]));
  const teams = counts(teamResult.results);
  const logos = counts(logoResult.results);
  const games = counts(gameResult.results);
  const postseasonGames = counts(postseasonResult.results);
  const statRows = counts(statResult.results);
  const profiles = counts(profileResult.results);
  const profileRows = counts(profileRowResult.results);
  const predictions = counts(predictionResult.results);
  const lines = counts(lineResult.results);
  const weekCoverage = new Map<number, Array<{ gameCount: number; statGameCount: number }>>();
  for (const row of weekResult.results) {
    const seasonRows = weekCoverage.get(Number(row.season)) ?? [];
    seasonRows.push({ gameCount: Number(row.gameCount), statGameCount: Number(row.statGameCount) });
    weekCoverage.set(Number(row.season), seasonRows);
  }
  const status: BackfillSeasonStatus[] = seasons.map((season) => {
    const teamCount = teams.get(season) ?? 0;
    const logoCount = logos.get(season) ?? 0;
    const gameCount = games.get(season) ?? 0;
    const postseasonGameCount = postseasonGames.get(season) ?? 0;
    const statRowCount = statRows.get(season) ?? 0;
    const profileTeamCount = profiles.get(season) ?? 0;
    const profileCount = profileRows.get(season) ?? 0;
    const predictionCount = predictions.get(season) ?? 0;
    const lineCount = lines.get(season) ?? 0;
    const completedWeeks = weekCoverage.get(season) ?? [];
    const completedWeekCount = completedWeeks.length;
    const statWeekCount = completedWeeks.filter((row) => row.gameCount > 0 && row.statGameCount >= row.gameCount).length;
    // A preseason current-year load legitimately has no weekly profiles yet.
    const profilesReady = completedWeekCount === 0 && season === currentSeason ? true : profileTeamCount >= 100;
    const scheduleReady = gameCount > 0 && (season === currentSeason || postseasonGameCount > 0);
    const ready = teamCount >= 100 && logoCount >= 100 && scheduleReady && statWeekCount >= completedWeekCount && predictionCount >= gameCount && profilesReady;
    const stage = ready ? "ready" : teamCount < 100 || logoCount < 100 ? "teams" : !scheduleReady ? "schedule" : statWeekCount < completedWeekCount ? "stats" : "formulas";
    const stageProgress = completedWeekCount ? statWeekCount / completedWeekCount : 1;
    const progressPercent = ready ? 100 : stage === "teams" ? Math.min(14, teamCount / 100 * 14) : stage === "schedule" ? 18 : stage === "stats" ? 20 + stageProgress * 70 : 94;
    return { season, teamCount, logoCount, gameCount, postseasonGameCount, statRowCount, profileTeamCount, profileCount, predictionCount, lineCount, completedWeekCount, statWeekCount, stage, progressPercent: Math.round(progressPercent), ready };
  });
  return { currentSeason, seasons: status, missing: status.filter((row) => !row.ready).map((row) => row.season).sort((a, b) => b - a) };
}

async function recordRun(db: D1Database, season: number, week: number, status: string, gameCount: number, detail: string) {
  await db.prepare("INSERT INTO refresh_runs (season,week,source,status,game_count,detail,created_at) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)")
    .bind(season, week, "CollegeFootballData", status, gameCount, detail).run();
}

async function finalizeSeason(env: PipelineEnv, season: number, trigger: SyncTrigger, started = Date.now(), allowHistoricalLineFetch = false) {
  const db = env.DB;
  const [games, stats, teamResult, storedLines] = await Promise.all([
    loadSeasonGames(db, season),
    loadSeasonStats(db, season),
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
  const { profiles, predictions, snapshots, maxWeek } = buildSeasonArtifacts(games, stats, lines, season, eligibleTeams, preseasonProfiles);
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
  rows.predictions = predictions;
  rows.snapshots = snapshots;
  await persistSeason(db, rows);
  await recordRun(db, season, maxWeek, "complete", games.length, `${trigger} sync; ${stats.length} stored API team-game rows retained; ${preseasonProfiles.length} cached preseason profiles; ${profiles.length} weekly profiles; ${predictions.length} ${MODEL_VERSION} projections; ${Date.now() - started}ms`);
  return { season, latestWeek: maxWeek, teams: eligibleTeams.size, games: games.length, stats: stats.length, profiles: profiles.length, lines: lines.length, predictions: predictions.length, durationMs: Date.now() - started, stage: "complete" as const };
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

    const missingWeek = coverage.completedWeeks.find((row) => row.statGameCount < row.gameCount);
    if (missingWeek) {
      const games = await loadSeasonGames(db, season);
      const payload = await cfbd("/games/teams", env.CFBD_API_KEY, { year: season, week: missingWeek.week, seasonType: "regular", classification: "fbs" });
      const stats = normalizeStats(payload, games, season).filter((row) => row.week === missingWeek.week);
      if (!stats.length) throw new Error(`CollegeFootballData returned no team box scores for ${season} week ${missingWeek.week}`);
      const rows = emptyPersistRows();
      rows.stats = stats;
      await persistSeason(db, rows);
      const importedGames = new Set(stats.map((row) => row.gameId)).size;
      await recordRun(db, season, missingWeek.week, "running", importedGames, `${trigger} stage stats; stored ${stats.length} API team rows for week ${missingWeek.week}`);
      if (importedGames < missingWeek.gameCount) throw new Error(`CollegeFootballData returned ${importedGames} of ${missingWeek.gameCount} completed box scores for ${season} week ${missingWeek.week}`);
      return { season, stage: "stats" as const, week: missingWeek.week, stats: stats.length, games: importedGames, durationMs: Date.now() - started };
    }

    return await finalizeSeason(env, season, trigger, started, coverage.predictionCount === 0);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown sync error";
    await recordRun(db, season, 0, "error", 0, `${trigger}: ${detail}`).catch(() => null);
    throw error;
  }
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
    const missingWeek = coverage.completedWeeks.find((row) => row.statGameCount < row.gameCount);
    const latestCompletedWeek = coverage.completedWeeks.at(-1);
    const weekToRefresh = missingWeek ?? latestCompletedWeek;
    if (weekToRefresh) {
      await pause(1600);
      const statsPayload = await cfbd("/games/teams", env.CFBD_API_KEY, { year: season, week: weekToRefresh.week, seasonType: "regular", classification: "fbs" });
      const stats = normalizeStats(statsPayload, games, season).filter((row) => row.week === weekToRefresh.week);
      if (!stats.length) throw new Error(`CollegeFootballData returned no team box scores for ${season} week ${weekToRefresh.week}`);
      const statWrite = emptyPersistRows();
      statWrite.stats = stats;
      await persistSeason(db, statWrite);
      coverage = await getSeasonCoverage(db, season);
    }

    const remainingWeeks = coverage.completedWeeks.filter((row) => row.statGameCount < row.gameCount);
    if (remainingWeeks.length) {
      await recordRun(db, season, remainingWeeks[0].week, "running", games.length, `${trigger} refresh stored schedule and one weekly box-score slice; ${remainingWeeks.length} historical weeks remain`);
      return { season, stage: "stats" as const, latestWeek: coverage.completedWeeks.at(-1)?.week ?? 0, teams: teamRows.length, games: games.length, lines: lines.length, remainingWeeks: remainingWeeks.map((row) => row.week), durationMs: Date.now() - started };
    }

    return await finalizeSeason(env, season, trigger, started);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown sync error";
    await recordRun(db, season, 0, "error", 0, `${trigger}: ${detail}`).catch(() => null);
    throw error;
  }
}

export async function syncHistorical(env: PipelineEnv, fromSeason = 2021, toSeason = currentCollegeFootballSeason()) {
  const status = await getBackfillStatus(env);
  const season = status.missing.find((candidate) => candidate >= fromSeason && candidate <= toSeason);
  // One bounded season per invocation keeps the job below the Worker/D1 query
  // budget. The browser and scheduler resume at the next missing season.
  return season ? [await syncSeasonStep(env, season, "bootstrap")] : [];
}
