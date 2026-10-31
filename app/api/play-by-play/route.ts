import {
  cfbd,
  CollegeFootballDataError,
  currentCollegeFootballSeason,
  type PipelineEnv,
} from "../../../lib/dataPipeline";
import {
  buildPlayByPlayDrives,
  buildSackAccounting,
  normalizePlayByPlay,
  type TeamGameSackStat,
} from "../../../lib/playByPlay";

type RuntimeEnv = PipelineEnv & { DB?: D1Database };
type GameRow = {
  gameId: string;
  season: number;
  week: number;
  seasonType: string;
  completed: number | boolean;
  homeTeam: string;
  awayTeam: string;
};
type StatRow = {
  team: string;
  passYards: number | null;
  passAttempts: number | null;
  rushYards: number | null;
  rushAttempts: number | null;
  sacksAllowed: number | null;
  sackYardsLost: number | null;
};

function json(body: unknown, status = 200, cacheControl = "no-store") {
  const response = Response.json(body, { status });
  response.headers.set("cache-control", cacheControl);
  return response;
}

function statForTeam(rows: StatRow[], team: string): TeamGameSackStat {
  const row = rows.find((candidate) => candidate.team === team);
  return row ?? {
    team,
    passYards: null,
    passAttempts: null,
    rushYards: null,
    rushAttempts: null,
    sacksAllowed: null,
    sackYardsLost: null,
  };
}

export async function GET(request: Request) {
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as RuntimeEnv;
  if (!runtime.DB) return json({ status: "unavailable", drives: [], accounting: [], message: "Play-by-play is unavailable." }, 503);

  const query = new URL(request.url).searchParams;
  const season = Math.trunc(Number(query.get("season")));
  const gameId = query.get("gameId")?.trim() ?? "";
  if (!Number.isInteger(season) || season < 2014 || season > currentCollegeFootballSeason() || !/^\d+$/.test(gameId)) {
    return json({ status: "invalid", drives: [], accounting: [], message: "Choose a valid game and season." }, 400);
  }

  const game = await runtime.DB.prepare(`SELECT game_id AS gameId,season,week,season_type AS seasonType,completed,
      home_team AS homeTeam,away_team AS awayTeam
    FROM cfb_games WHERE season=? AND game_id=? LIMIT 1`).bind(season, gameId).first<GameRow>();
  if (!game) return json({ status: "invalid", drives: [], accounting: [], message: "This game is not in the schedule archive." }, 404);
  if (!game.completed) return json({ status: "pending", season, gameId, drives: [], accounting: [], message: "Play-by-play becomes available after the game is final." }, 409);

  const statResult = await runtime.DB.prepare(`SELECT team,pass_yards AS passYards,pass_attempts AS passAttempts,
      rush_yards AS rushYards,rush_attempts AS rushAttempts,sacks_allowed AS sacksAllowed,sack_yards_lost AS sackYardsLost
    FROM team_game_stats WHERE game_id=? AND team IN (?,?)`).bind(gameId, game.homeTeam, game.awayTeam).all<StatRow>();
  const stats = [statForTeam(statResult.results, game.awayTeam), statForTeam(statResult.results, game.homeTeam)];
  const fallbackAccounting = buildSackAccounting(stats, []);

  if (!runtime.CFBD_API_KEY) {
    return json({
      status: "partial", season, gameId, week: game.week, homeTeam: game.homeTeam, awayTeam: game.awayTeam,
      drives: [], playCount: 0, accounting: fallbackAccounting,
      message: "The itemized play feed is unavailable; sack accounting is using the archived box score.",
    }, 200, "public, max-age=300");
  }

  const cache = (globalThis.caches as unknown as { default?: Cache } | undefined)?.default;
  const cacheUrl = new URL("https://harpercfbmodel.com/api/play-by-play");
  cacheUrl.search = new URLSearchParams({ season: String(season), gameId, schema: "1" }).toString();
  const cacheKey = new Request(cacheUrl);
  let cached: Response | undefined;
  try { cached = cache ? await cache.match(cacheKey) : undefined; } catch { /* Cache support is optional. */ }
  if (cached) return cached;

  try {
    const knownTeams = await runtime.DB.prepare("SELECT team FROM cfb_teams WHERE season=? AND team IN (?,?)")
      .bind(season, game.homeTeam, game.awayTeam).all<{ team: string }>();
    const known = new Set(knownTeams.results.map((row) => row.team));
    const seedTeam = known.has(game.homeTeam) ? game.homeTeam : known.has(game.awayTeam) ? game.awayTeam : game.homeTeam;
    const payload = await cfbd("/plays", runtime.CFBD_API_KEY, {
      year: season,
      week: game.week,
      team: seedTeam,
      seasonType: game.seasonType || "regular",
    });
    const plays = normalizePlayByPlay(payload, { gameId, homeTeam: game.homeTeam, awayTeam: game.awayTeam });
    const drives = buildPlayByPlayDrives(plays);
    const accounting = buildSackAccounting(stats, plays);
    const cacheControl = season < currentCollegeFootballSeason()
      ? "public, max-age=86400, stale-while-revalidate=604800"
      : "public, max-age=21600, stale-while-revalidate=86400";
    const response = json({
      status: plays.length ? "ready" : "partial",
      season,
      gameId,
      week: game.week,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      playCount: plays.length,
      driveCount: drives.length,
      drives,
      accounting,
      updatedAt: new Date().toISOString(),
      source: "CFBD historical play-by-play",
      message: plays.length ? null : "CFBD has not published an itemized play feed for this game; the archived box score is shown.",
    }, 200, cacheControl);
    response.headers.set("x-harper-play-source", "cfbd-historical-plays");
    try { if (cache) await cache.put(cacheKey, response.clone()); } catch { /* Return live data even when cache storage fails. */ }
    return response;
  } catch (error) {
    const status = error instanceof CollegeFootballDataError ? error.status : 502;
    const message = status === 429
      ? "The play feed reached its request limit; archived sack accounting is shown for now."
      : "The itemized play feed is temporarily unavailable; archived sack accounting is shown for now.";
    const response = json({
      status: "partial", season, gameId, week: game.week, homeTeam: game.homeTeam, awayTeam: game.awayTeam,
      drives: [], playCount: 0, accounting: fallbackAccounting, message,
    }, 200, "public, max-age=300");
    if (error instanceof CollegeFootballDataError && error.retryAfterSeconds > 0) response.headers.set("retry-after", String(error.retryAfterSeconds));
    return response;
  }
}
