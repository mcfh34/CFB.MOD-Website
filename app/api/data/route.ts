import {
  buildPregameElo,
  calculateCachedPerformance,
  currentCollegeFootballSeason,
  latestProfile,
  MODEL_VERSION,
  project,
  type NormalizedGame,
  type Profile,
} from "../../../lib/dataPipeline";
import { modelCalibration } from "../../modelData";
import { buildBcsRankings, type RankingGame, type RankingProfile } from "../../../lib/rankings";
import { buildSeasonSimulation, type SimulationScheduleGame } from "../../../lib/simulation";
import { analyzeMatchupEdges } from "../../../lib/matchupAnalysis";

type CloudflareEnv = { DB?: D1Database; CFBD_API_KEY?: string };

const titleConferences = ["ACC", "American Athletic", "Big 12", "Big Ten", "Conference USA", "Mid-American", "Mountain West", "SEC", "Sun Belt"];
const known2025Champions = [
  { conference: "ACC", team: "Duke", status: "actual" },
  { conference: "American Athletic", team: "Tulane", status: "actual" },
  { conference: "Big 12", team: "Texas Tech", status: "actual" },
  { conference: "Big Ten", team: "Indiana", status: "actual" },
  { conference: "Conference USA", team: "Kennesaw State", status: "actual" },
  { conference: "Mid-American", team: "Western Michigan", status: "actual" },
  { conference: "Mountain West", team: "Boise State", status: "actual" },
  { conference: "SEC", team: "Georgia", status: "actual" },
  { conference: "Sun Belt", team: "James Madison", status: "actual" },
] as const;

function numberParam(url: URL, name: string, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(url.searchParams.get(name));
  const value = Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
  return Math.max(minimum, Math.min(maximum, value));
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function tuple(row: Record<string, unknown>, prefix: "off" | "def", suffix = "") {
  return ["Ypp", "Ypa", "Ypc", "Patt", "Ratt"].map((metric) => nullableNumber(row[`${prefix}${metric}${suffix}`]) ?? (suffix ? 1 : 0)) as Profile["off"];
}

export async function GET(request: Request) {
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as CloudflareEnv;
  if (!runtime.DB) return Response.json({ source: "embedded", configured: false, rows: [] });

  const url = new URL(request.url);
  const view = url.searchParams.get("view") ?? "profiles";
  const currentSeason = currentCollegeFootballSeason();
  const season = numberParam(url, "season", currentSeason, 2021, currentSeason);
  const requestedWeek = numberParam(url, "week", 16, 0, 16);
  const team = (url.searchParams.get("team")?.trim() ?? "").slice(0, 100);
  const db = runtime.DB;

  try {
    if (view === "status") {
      const snapshots = await db.prepare("SELECT season,week,team_count AS teamCount,game_count AS gameCount,completed_game_count AS completedGameCount,source,model_version AS modelVersion,created_at AS createdAt FROM model_snapshots ORDER BY season DESC,week DESC").all();
      const latestRun = await db.prepare("SELECT season,week,source,status,game_count AS gameCount,detail,created_at AS createdAt FROM refresh_runs ORDER BY id DESC LIMIT 1").first();
      return Response.json({ source: "database", configured: Boolean(runtime.CFBD_API_KEY), snapshots: snapshots.results, latestRun });
    }

    if (view === "rankings") {
      const effective = await db.prepare("SELECT MAX(week) AS week FROM weekly_profiles WHERE season=? AND week<=?").bind(season, requestedWeek).first<{ week: number | null }>();
      const effectiveWeek = effective?.week ?? requestedWeek;
      const [profileResult, gameResult] = await Promise.all([
        db.prepare(`SELECT wp.team,t.team_id AS teamId,t.abbreviation,t.mascot,t.conference,t.color,t.alt_color AS altColor,t.logo,
          wp.off_ypp_index AS offYppIndex,wp.off_ypa_index AS offYpaIndex,wp.off_ypc_index AS offYpcIndex,
          wp.def_ypp_index AS defYppIndex,wp.def_ypa_index AS defYpaIndex,wp.def_ypc_index AS defYpcIndex
          FROM weekly_profiles wp LEFT JOIN cfb_teams t ON t.season=wp.season AND t.team=wp.team
          WHERE wp.season=? AND wp.week=? ORDER BY wp.team`).bind(season, effectiveWeek).all<RankingProfile>(),
        db.prepare(`SELECT game_id AS gameId,week,start_date AS startDate,neutral_site AS neutralSite,
          home_team AS homeTeam,home_points AS homePoints,away_team AS awayTeam,away_points AS awayPoints
          FROM cfb_games WHERE season=? AND completed=1 AND season_type<>'postseason' AND week<=?
          AND home_points IS NOT NULL AND away_points IS NOT NULL ORDER BY week,start_date,game_id`).bind(season, requestedWeek).all<RankingGame>(),
      ]);
      const rows = buildBcsRankings(gameResult.results as RankingGame[], profileResult.results as RankingProfile[]);
      return Response.json({ source: "database", configured: Boolean(runtime.CFBD_API_KEY), season, requestedWeek, effectiveWeek, methodology: "Harper BCS v3 · résumé protected · direct head-to-head", rows });
    }

    if (view === "simulation") {
      const effective = await db.prepare("SELECT MAX(week) AS week FROM weekly_profiles WHERE season=? AND week<=?").bind(season, requestedWeek).first<{ week: number | null }>();
      const effectiveWeek = effective?.week ?? requestedWeek;
      const [profileResult, scheduleResult] = await Promise.all([
        db.prepare(`SELECT wp.team,t.team_id AS teamId,t.abbreviation,t.mascot,t.conference,t.color,t.alt_color AS altColor,t.logo,
          wp.off_ypp_index AS offYppIndex,wp.off_ypa_index AS offYpaIndex,wp.off_ypc_index AS offYpcIndex,
          wp.def_ypp_index AS defYppIndex,wp.def_ypa_index AS defYpaIndex,wp.def_ypc_index AS defYpcIndex
          FROM weekly_profiles wp LEFT JOIN cfb_teams t ON t.season=wp.season AND t.team=wp.team
          WHERE wp.season=? AND wp.week=? ORDER BY wp.team`).bind(season, effectiveWeek).all<RankingProfile>(),
        db.prepare(`SELECT game_id AS gameId,week,start_date AS startDate,season_type AS seasonType,completed,neutral_site AS neutralSite,
          conference_game AS conferenceGame,home_team AS homeTeam,home_conference AS homeConference,home_points AS homePoints,
          away_team AS awayTeam,away_conference AS awayConference,away_points AS awayPoints
          FROM cfb_games WHERE season=? ORDER BY week,start_date,game_id`).bind(season).all<SimulationScheduleGame>(),
      ]);
      const simulation = buildSeasonSimulation(season, requestedWeek, effectiveWeek, scheduleResult.results as SimulationScheduleGame[], profileResult.results as RankingProfile[]);
      const response = Response.json({ source: "database", configured: Boolean(runtime.CFBD_API_KEY), ...simulation });
      response.headers.set("cache-control", "public, max-age=300, stale-while-revalidate=900");
      return response;
    }

    if (view === "champions") {
      if (season === 2025 && requestedWeek >= 15) return Response.json({ source: "verified-results", configured: Boolean(runtime.CFBD_API_KEY), season, rows: known2025Champions });

      const titleGames = await db.prepare(`SELECT g.game_id AS gameId,g.week,g.start_date AS startDate,g.completed,g.home_team AS homeTeam,g.home_conference AS conference,g.home_points AS homePoints,g.away_team AS awayTeam,g.away_points AS awayPoints,
        p.home_win_probability AS homeWinProbability
        FROM cfb_games g LEFT JOIN model_predictions p ON p.game_id=g.game_id
        WHERE g.season=? AND g.week>=15 AND g.week<=? AND g.conference_game=1 AND g.home_conference=g.away_conference
        ORDER BY g.week DESC,g.start_date DESC`).bind(season, requestedWeek).all<{
          gameId:string;week:number;startDate:string|null;completed:number;homeTeam:string;conference:string;homePoints:number|null;awayTeam:string;awayPoints:number|null;homeWinProbability:number|null;
        }>();
      const rows = new Map<string, { conference: string; team: string; status: "actual" | "predicted"; gameId?: string }>();
      for (const game of titleGames.results) {
        if (!titleConferences.includes(game.conference) || rows.has(game.conference)) continue;
        const final = Boolean(game.completed) && game.homePoints !== null && game.awayPoints !== null;
        const team = final
          ? (Number(game.homePoints) > Number(game.awayPoints) ? game.homeTeam : game.awayTeam)
          : (Number(game.homeWinProbability ?? 0.5) >= 0.5 ? game.homeTeam : game.awayTeam);
        rows.set(game.conference, { conference: game.conference, team, status: final ? "actual" : "predicted", gameId: game.gameId });
      }

      const effective = await db.prepare("SELECT MAX(week) AS week FROM weekly_profiles WHERE season=? AND week<=?").bind(season, requestedWeek).first<{ week: number | null }>();
      if (effective?.week) {
        const contenders = await db.prepare(`SELECT wp.team,t.conference,
          ((wp.off_ypp_index+wp.off_ypa_index+wp.off_ypc_index)/3.0)-((wp.def_ypp_index+wp.def_ypa_index+wp.def_ypc_index)/3.0) AS strength
          FROM weekly_profiles wp JOIN cfb_teams t ON t.season=wp.season AND t.team=wp.team
          WHERE wp.season=? AND wp.week=? ORDER BY strength DESC`).bind(season, effective.week).all<{ team:string;conference:string;strength:number }>();
        for (const contender of contenders.results) {
          if (titleConferences.includes(contender.conference) && !rows.has(contender.conference)) rows.set(contender.conference, { conference: contender.conference, team: contender.team, status: "predicted" });
        }
      }
      return Response.json({ source: "database", configured: Boolean(runtime.CFBD_API_KEY), season, rows: [...rows.values()] });
    }

    if (view === "performance") {
      const readMetrics = (version: string) => db.prepare(`SELECT
          COUNT(*) AS gameCount,
          SUM(CASE WHEN g.home_points IS NOT NULL AND g.away_points IS NOT NULL AND g.home_points<>g.away_points THEN 1 ELSE 0 END) AS straightUpGraded,
          SUM(CASE WHEN g.home_points IS NOT NULL AND g.away_points IS NOT NULL AND g.home_points<>g.away_points AND ((p.home_win_probability>=0.5 AND g.home_points>g.away_points) OR (p.home_win_probability<0.5 AND g.home_points<g.away_points)) THEN 1 ELSE 0 END) AS straightUpWins,
          SUM(CASE WHEN (p.week>=5 OR g.season_type='postseason') AND p.spread_result='W' THEN 1 ELSE 0 END) AS spreadWins,
          SUM(CASE WHEN (p.week>=5 OR g.season_type='postseason') AND p.spread_result='L' THEN 1 ELSE 0 END) AS spreadLosses,
          SUM(CASE WHEN (p.week>=5 OR g.season_type='postseason') AND p.spread_result='PUSH' THEN 1 ELSE 0 END) AS spreadPushes,
          AVG(CASE WHEN (p.week>=5 OR g.season_type='postseason') AND p.spread_result IN ('W','L','PUSH') THEN p.spread_error END) AS spreadMae,
          SUM(CASE WHEN (p.week>=5 OR g.season_type='postseason') AND p.total_result='W' THEN 1 ELSE 0 END) AS totalWins,
          SUM(CASE WHEN (p.week>=5 OR g.season_type='postseason') AND p.total_result='L' THEN 1 ELSE 0 END) AS totalLosses,
          SUM(CASE WHEN (p.week>=5 OR g.season_type='postseason') AND p.total_result='PUSH' THEN 1 ELSE 0 END) AS totalPushes,
          AVG(CASE WHEN (p.week>=5 OR g.season_type='postseason') AND p.total_result IN ('W','L','PUSH') THEN p.total_error END) AS totalMae
          FROM model_predictions p JOIN cfb_games g ON g.game_id=p.game_id
          WHERE p.season=? AND p.model_version=?`).bind(season, version).first<Record<string, number | null>>();
      const [seasonGames, profileCount] = await Promise.all([
        db.prepare("SELECT COUNT(*) AS count FROM cfb_games WHERE season=?").bind(season).first<{ count:number }>(),
        db.prepare("SELECT COUNT(*) AS count FROM weekly_profiles WHERE season=?").bind(season).first<{ count:number }>(),
      ]);
      let activeVersion = MODEL_VERSION;
      let metrics = await readMetrics(activeVersion);
      if (Number(metrics?.gameCount ?? 0) < Number(seasonGames?.count ?? 0)) {
        const live = await calculateCachedPerformance(db, season).catch(() => null);
        if (live && (live.spread.graded > 0 || live.total.graded > 0 || Number(seasonGames?.count ?? 0) === 0)) {
          return Response.json({ source: "cached-recalculation", configured: Boolean(runtime.CFBD_API_KEY), calibrationState: "live-cached", ...live });
        }
      }
      if (Number(metrics?.gameCount ?? 0) === 0) {
        const fallback = await db.prepare(`SELECT model_version AS modelVersion,COUNT(*) AS count
          FROM model_predictions WHERE season=? GROUP BY model_version ORDER BY count DESC LIMIT 1`)
          .bind(season).first<{ modelVersion:string;count:number }>();
        if (fallback?.modelVersion) {
          activeVersion = fallback.modelVersion;
          metrics = await readMetrics(activeVersion);
        }
      }
      const count = (key: string) => Number(metrics?.[key] ?? 0);
      const result = (prefix: "spread" | "total") => {
        const wins = count(`${prefix}Wins`);
        const losses = count(`${prefix}Losses`);
        const pushes = count(`${prefix}Pushes`);
        const graded = wins + losses;
        const maeValue = metrics?.[`${prefix}Mae`];
        return { wins, losses, pushes, graded, accuracy: graded ? wins / graded : null, meanAbsoluteError: maeValue === null || maeValue === undefined ? null : Number(maeValue) };
      };
      const straightUpGraded = count("straightUpGraded");
      const straightUpWins = count("straightUpWins");
      return Response.json({
        source: "database",
        configured: Boolean(runtime.CFBD_API_KEY),
        season,
        modelVersion: activeVersion,
        calibrationState: activeVersion === MODEL_VERSION ? "current" : "cached-previous",
        minMarketWeek: 5,
        gameCount: count("gameCount"),
        profileCount: Number(profileCount?.count ?? 0),
        straightUp: { wins: straightUpWins, graded: straightUpGraded, accuracy: straightUpGraded ? straightUpWins / straightUpGraded : null },
        spread: result("spread"),
        total: result("total"),
      });
    }

    if (view === "calibration") {
      const result = await db.prepare(`SELECT p.season,
        SUM(CASE WHEN (p.week>=5 OR g.season_type='postseason') AND p.spread_result='W' THEN 1 ELSE 0 END) AS spreadWins,
        SUM(CASE WHEN (p.week>=5 OR g.season_type='postseason') AND p.spread_result='L' THEN 1 ELSE 0 END) AS spreadLosses,
        SUM(CASE WHEN (p.week>=5 OR g.season_type='postseason') AND p.spread_result='PUSH' THEN 1 ELSE 0 END) AS spreadPushes,
        AVG(CASE WHEN (p.week>=5 OR g.season_type='postseason') AND p.spread_result IN ('W','L','PUSH') THEN p.spread_error END) AS spreadMae,
        SUM(CASE WHEN (p.week>=5 OR g.season_type='postseason') AND p.total_result='W' THEN 1 ELSE 0 END) AS totalWins,
        SUM(CASE WHEN (p.week>=5 OR g.season_type='postseason') AND p.total_result='L' THEN 1 ELSE 0 END) AS totalLosses,
        SUM(CASE WHEN (p.week>=5 OR g.season_type='postseason') AND p.total_result='PUSH' THEN 1 ELSE 0 END) AS totalPushes,
        AVG(CASE WHEN (p.week>=5 OR g.season_type='postseason') AND p.total_result IN ('W','L','PUSH') THEN p.total_error END) AS totalMae
        FROM model_predictions p JOIN cfb_games g ON g.game_id=p.game_id
        WHERE p.model_version=? GROUP BY p.season ORDER BY p.season DESC`).bind(MODEL_VERSION).all<Record<string, number | null>>();
      const rows = result.results.map((row) => {
        const metric = (prefix: "spread" | "total") => {
          const wins = Number(row[`${prefix}Wins`] ?? 0);
          const losses = Number(row[`${prefix}Losses`] ?? 0);
          const pushes = Number(row[`${prefix}Pushes`] ?? 0);
          const graded = wins + losses;
          return { wins, losses, pushes, graded, accuracy: graded ? wins / graded : null, meanAbsoluteError: nullableNumber(row[`${prefix}Mae`]) };
        };
        return { season: Number(row.season), spread: metric("spread"), total: metric("total") };
      });
      return Response.json({ source: "database", configured: Boolean(runtime.CFBD_API_KEY), modelVersion: MODEL_VERSION, minMarketWeek: 5, validation: "prior-week-only", rows });
    }

    if (view === "schedule") {
      const conditions = ["g.season = ?"];
      const binds: Array<string | number> = [season];
      if (requestedWeek > 0) { conditions.push("g.week = ?"); binds.push(requestedWeek); }
      if (team) { conditions.push("(g.home_team = ? OR g.away_team = ?)"); binds.push(team, team); }
      const query = `SELECT g.game_id AS gameId,g.season,g.week,g.season_type AS seasonType,g.start_date AS startDate,g.completed,g.neutral_site AS neutralSite,g.venue,
        g.home_team AS homeTeam,g.home_conference AS homeConference,g.home_points AS homePoints,g.away_team AS awayTeam,g.away_conference AS awayConference,g.away_points AS awayPoints,
        ht.logo AS homeLogo,at.logo AS awayLogo,
        p.generated_from_week AS generatedFromWeek,p.home_score AS predictedHomeScore,p.away_score AS predictedAwayScore,p.home_win_probability AS homeWinProbability,p.model_home_spread AS modelHomeSpread,p.model_total AS modelTotal,p.model_version AS storedModelVersion,
        COALESCE(p.vegas_spread,l.spread) AS vegasSpread,COALESCE(p.vegas_total,l.over_under) AS vegasTotal,p.spread_edge AS spreadEdge,p.total_edge AS totalEdge,p.spread_error AS spreadError,p.total_error AS totalError,p.spread_result AS spreadResult,p.total_result AS totalResult,
        l.provider,l.formatted_spread AS formattedSpread,l.spread_open AS spreadOpen,l.over_under_open AS overUnderOpen
        FROM cfb_games g LEFT JOIN model_predictions p ON p.game_id=g.game_id LEFT JOIN betting_lines l ON l.game_id=g.game_id
        LEFT JOIN cfb_teams ht ON ht.season=g.season AND ht.team=g.home_team LEFT JOIN cfb_teams at ON at.season=g.season AND at.team=g.away_team
        WHERE ${conditions.join(" AND ")} ORDER BY CASE WHEN g.start_date IS NULL THEN 1 ELSE 0 END,g.start_date,g.season_type,g.week,g.home_team`;
      const rows = await db.prepare(query).bind(...binds).all<Record<string, unknown>>();
      const needsLiveProjection = rows.results.some((row) => nullableNumber(row.predictedHomeScore) === null || row.storedModelVersion !== MODEL_VERSION);

      const [profileResult, gameResult, teamResult] = await Promise.all([
        db.prepare(`SELECT season,week,team,games_played AS gamesPlayed,
          off_ypp AS offYpp,off_ypa AS offYpa,off_ypc AS offYpc,off_patt AS offPatt,off_ratt AS offRatt,
          def_ypp AS defYpp,def_ypa AS defYpa,def_ypc AS defYpc,def_patt AS defPatt,def_ratt AS defRatt,
          off_ypp_index AS offYppIndex,off_ypa_index AS offYpaIndex,off_ypc_index AS offYpcIndex,off_patt_index AS offPattIndex,off_ratt_index AS offRattIndex,
          def_ypp_index AS defYppIndex,def_ypa_index AS defYpaIndex,def_ypc_index AS defYpcIndex,def_patt_index AS defPattIndex,def_ratt_index AS defRattIndex
          FROM weekly_profiles WHERE season=? ORDER BY week,team`).bind(season).all<Record<string, unknown>>(),
        db.prepare(`SELECT game_id AS gameId,season,week,season_type AS seasonType,start_date AS startDate,completed,neutral_site AS neutralSite,conference_game AS conferenceGame,venue,
          home_team AS homeTeam,home_conference AS homeConference,home_points AS homePoints,away_team AS awayTeam,away_conference AS awayConference,away_points AS awayPoints
          FROM cfb_games WHERE season=? ORDER BY CASE WHEN start_date IS NULL THEN 1 ELSE 0 END,start_date,season_type,week,game_id`).bind(season).all<Record<string, unknown>>(),
        db.prepare("SELECT team FROM cfb_teams WHERE season=?").bind(season).all<{ team: string }>(),
      ]);
      const profiles = profileResult.results.map((row): Profile => ({
        season: Number(row.season), week: Number(row.week), team: String(row.team), gamesPlayed: Number(row.gamesPlayed ?? 0),
        off: tuple(row, "off"), def: tuple(row, "def"), oi: tuple(row, "off", "Index"), di: tuple(row, "def", "Index"),
      }));
      if (!profiles.length) {
        return Response.json({ source: "database", configured: Boolean(runtime.CFBD_API_KEY), season, week: requestedWeek, team: team || null, modelVersion: MODEL_VERSION, rows: rows.results.map((row) => ({ ...row, predictionSource: "pending" })) });
      }
      const games = gameResult.results.map((row): NormalizedGame => ({
        id: String(row.gameId), season: Number(row.season), week: Number(row.week), seasonType: String(row.seasonType ?? "regular"), startDate: row.startDate ? String(row.startDate) : null,
        completed: Boolean(row.completed), neutralSite: Boolean(row.neutralSite), conferenceGame: Boolean(row.conferenceGame), venue: row.venue ? String(row.venue) : null,
        homeTeam: String(row.homeTeam), homeConference: row.homeConference ? String(row.homeConference) : null, homePoints: nullableNumber(row.homePoints),
        awayTeam: String(row.awayTeam), awayConference: row.awayConference ? String(row.awayConference) : null, awayPoints: nullableNumber(row.awayPoints),
      }));
      const eligibleTeams = new Set(teamResult.results.map((row) => row.team));
      const preseasonProfiles = profiles.filter((profile) => profile.week === 0);
      const pregameElo = buildPregameElo(games, preseasonProfiles, eligibleTeams);
      const maxProfileWeek = Math.max(0, ...profiles.map((profile) => profile.week));
      const byGame = new Map(games.map((game) => [game.id, game]));
      const neutralIndex: Profile["oi"] = [1, 1, 1, 1, 1];
      const enriched = rows.results.map((row) => {
        const game = byGame.get(String(row.gameId));
        if (!game) return { ...row, predictionSource: "pending" };
        const generatedFromWeek = nullableNumber(row.generatedFromWeek) ?? (game.seasonType === "postseason" ? maxProfileWeek : Math.max(0, game.week - 1));
        const homeProfile = latestProfile(profiles, game.homeTeam, generatedFromWeek);
        const awayProfile = latestProfile(profiles, game.awayTeam, generatedFromWeek);
        if (!needsLiveProjection && nullableNumber(row.modelHomeSpread) !== null) {
          const edgeAnalysis = analyzeMatchupEdges(
            game.homeTeam, game.awayTeam, homeProfile?.oi ?? neutralIndex, homeProfile?.di ?? neutralIndex,
            awayProfile?.oi ?? neutralIndex, awayProfile?.di ?? neutralIndex, game.neutralSite, -Number(row.modelHomeSpread),
          );
          return { ...row, generatedFromWeek, edgeAnalysis, predictionSource: "materialized" };
        }
        if (nullableNumber(row.predictedHomeScore) !== null && row.storedModelVersion === MODEL_VERSION) {
          const edgeAnalysis = analyzeMatchupEdges(
            game.homeTeam, game.awayTeam, homeProfile?.oi ?? neutralIndex, homeProfile?.di ?? neutralIndex,
            awayProfile?.oi ?? neutralIndex, awayProfile?.di ?? neutralIndex, game.neutralSite, -Number(row.modelHomeSpread ?? 0),
          );
          return { ...row, generatedFromWeek, edgeAnalysis, predictionSource: "materialized" };
        }
        const ratings = pregameElo.get(game.id);
        const prediction = project(
          homeProfile,
          awayProfile,
          game.neutralSite,
          ratings?.get(game.homeTeam) ?? (eligibleTeams.has(game.homeTeam) ? 1500 : modelCalibration.fcsElo),
          ratings?.get(game.awayTeam) ?? (eligibleTeams.has(game.awayTeam) ? 1500 : modelCalibration.fcsElo),
        );
        const vegasSpread = nullableNumber(row.vegasSpread);
        const vegasTotal = nullableNumber(row.vegasTotal);
        const spreadEdge = vegasSpread === null ? null : vegasSpread - prediction.modelHomeSpread;
        const totalEdge = vegasTotal === null ? null : prediction.modelTotal - vegasTotal;
        const actualMargin = game.homePoints === null || game.awayPoints === null ? null : game.homePoints - game.awayPoints;
        const actualTotal = game.homePoints === null || game.awayPoints === null ? null : game.homePoints + game.awayPoints;
        const atsActual = actualMargin === null || vegasSpread === null ? null : actualMargin + vegasSpread;
        const spreadResult = spreadEdge === null || atsActual === null ? null : atsActual === 0 || spreadEdge === 0 ? "PUSH" : Math.sign(spreadEdge) === Math.sign(atsActual) ? "W" : "L";
        const totalResult = totalEdge === null || actualTotal === null || vegasTotal === null ? null : actualTotal === vegasTotal || totalEdge === 0 ? "PUSH" : Math.sign(totalEdge) === Math.sign(actualTotal - vegasTotal) ? "W" : "L";
        const edgeAnalysis = analyzeMatchupEdges(
          game.homeTeam, game.awayTeam, homeProfile?.oi ?? neutralIndex, homeProfile?.di ?? neutralIndex,
          awayProfile?.oi ?? neutralIndex, awayProfile?.di ?? neutralIndex, game.neutralSite, prediction.margin,
        );
        return {
          ...row,
          generatedFromWeek,
          predictedHomeScore: prediction.homeScore,
          predictedAwayScore: prediction.awayScore,
          homeWinProbability: prediction.homeWinProbability,
          modelHomeSpread: prediction.modelHomeSpread,
          modelTotal: prediction.modelTotal,
          spreadEdge,
          totalEdge,
          spreadError: actualMargin === null ? null : Math.abs(prediction.margin - actualMargin),
          totalError: actualTotal === null ? null : Math.abs(prediction.modelTotal - actualTotal),
          spreadResult,
          totalResult,
          edgeAnalysis,
          storedModelVersion: MODEL_VERSION,
          predictionSource: "live-profile",
        };
      });
      return Response.json({ source: "database", configured: Boolean(runtime.CFBD_API_KEY), season, week: requestedWeek, team: team || null, modelVersion: MODEL_VERSION, rows: enriched });
    }

    const effective = await db.prepare("SELECT MAX(week) AS week FROM weekly_profiles WHERE season=? AND week<=?").bind(season, requestedWeek).first<{ week: number | null }>();
    const effectiveWeek = effective?.week ?? requestedWeek;
    const rows = await db.prepare(`SELECT wp.season,wp.week,wp.team,wp.games_played AS gamesPlayed,
      wp.off_ypp AS offYpp,wp.off_ypa AS offYpa,wp.off_ypc AS offYpc,wp.off_patt AS offPatt,wp.off_ratt AS offRatt,
      wp.def_ypp AS defYpp,wp.def_ypa AS defYpa,wp.def_ypc AS defYpc,wp.def_patt AS defPatt,wp.def_ratt AS defRatt,
      wp.off_ypp_index AS offYppIndex,wp.off_ypa_index AS offYpaIndex,wp.off_ypc_index AS offYpcIndex,wp.off_patt_index AS offPattIndex,wp.off_ratt_index AS offRattIndex,
      wp.def_ypp_index AS defYppIndex,wp.def_ypa_index AS defYpaIndex,wp.def_ypc_index AS defYpcIndex,wp.def_patt_index AS defPattIndex,wp.def_ratt_index AS defRattIndex,
      t.team_id AS teamId,t.abbreviation,t.mascot,t.conference,t.color,t.alt_color AS altColor,t.logo
      FROM weekly_profiles wp LEFT JOIN cfb_teams t ON t.season=wp.season AND t.team=wp.team
      WHERE wp.season=? AND wp.week=? ORDER BY wp.team`).bind(season, effectiveWeek).all();
    return Response.json({ source: "database", configured: Boolean(runtime.CFBD_API_KEY), season, requestedWeek, effectiveWeek, rows: rows.results });
  } catch (error) {
    return Response.json({ source: "embedded", configured: Boolean(runtime.CFBD_API_KEY), rows: [], message: error instanceof Error ? error.message : "Data query failed" });
  }
}
