import { currentCollegeFootballSeason, type PipelineEnv } from "../../../lib/dataPipeline";
import {
  getPlayerSyncStatus,
  loadOffensiveLineUnitScores,
  loadPlayerModels,
  loadPlayerProductionBaseline,
  loadPlayerProductionScores,
  loadSeasonPlayerProductionPercentiles,
} from "../../../lib/playerPipeline";
import { FIRST_PLAYER_SEASON, INITIAL_PLAYER_SEASON } from "../../../lib/playerModel";
import {
  applyPlayerProductionRatings,
  productionRatingFromScale,
} from "../../../lib/playerProductionRatings";

type RuntimeEnv = PipelineEnv & { DB?: D1Database };

function response(body: unknown, status = 200, cacheControl = "no-store") {
  const output = Response.json(body, { status });
  output.headers.set("cache-control", cacheControl);
  return output;
}

export async function GET(request: Request) {
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as RuntimeEnv;
  if (!runtime.DB) return response({ configured: false, season: INITIAL_PLAYER_SEASON, status: "unavailable", teams: [], profiles: [] }, 503);

  const url = new URL(request.url);
  const season = Number(url.searchParams.get("season")) || INITIAL_PLAYER_SEASON;
  const requestedTeams = (url.searchParams.get("teams") ?? "").split("|").map((team) => team.trim()).filter(Boolean).slice(0, 4);
  const currentSeason = currentCollegeFootballSeason();
  if (season < FIRST_PLAYER_SEASON || season > currentSeason) {
    return response({
      configured: Boolean(runtime.CFBD_API_KEY),
      season,
      supportedRange: [FIRST_PLAYER_SEASON, currentSeason],
      status: "unsupported",
      message: `Player profiles support ${FIRST_PLAYER_SEASON}–${currentSeason}.`,
      teams: [],
      profiles: [],
    });
  }

  try {
    const syncStatus = await getPlayerSyncStatus(runtime, season);

    const profilesAvailable = syncStatus.teamCount > 0;
    const [teamResult, storedProfiles, productionBaseline] = await Promise.all([
      runtime.DB.prepare(`SELECT team,team_id AS teamId,abbreviation,mascot,conference,color,alt_color AS altColor,logo
        FROM cfb_teams WHERE season=? ORDER BY team`).bind(season).all<Record<string, unknown>>(),
      profilesAvailable ? loadPlayerModels(runtime.DB, season, requestedTeams) : Promise.resolve([]),
      profilesAvailable ? loadPlayerProductionBaseline(runtime.DB) : Promise.resolve({
        firstSeason:FIRST_PLAYER_SEASON,
        lastSeason:season,
        playerSeasonCount:0,
        scale:[],
        cohorts:[],
      }),
    ]);
    const [lineScores,playerScores,provisionalPercentiles] = await Promise.all([
      profilesAvailable
        ? loadOffensiveLineUnitScores(runtime.DB, season, storedProfiles.map((row) => row.team))
        : Promise.resolve(new Map<string, number>()),
      profilesAvailable
        && productionBaseline.currentGenerationReady
        ? loadPlayerProductionScores(runtime.DB, season, storedProfiles.map((row) => row.team))
        : Promise.resolve(new Map<string, Map<string, number>>()),
      profilesAvailable
        && !productionBaseline.currentGenerationReady
        ? loadSeasonPlayerProductionPercentiles(runtime.DB,season,storedProfiles.map((row)=>row.team))
        : Promise.resolve(new Map<string,Map<string,number>>()),
    ]);
    const profiles = storedProfiles.map((row) => {
      const lineScore = Number(lineScores.get(row.team));
      const lineRating = !Number.isFinite(lineScore)
        ? null
        : productionRatingFromScale(
          "OL",
          lineScore,
          productionBaseline.scale,
        );
      return {
        ...row,
        model:applyPlayerProductionRatings(
          row.model,
          productionBaseline,
          lineRating,
          playerScores.get(row.team) ?? new Map(),
          provisionalPercentiles.get(row.team)??new Map(),
        ),
      };
    });
    const ready = syncStatus.ready && productionBaseline.scale.length > 0;
    return response({
      configured: Boolean(runtime.CFBD_API_KEY),
      season,
      status: ready ? "ready" : profiles.length ? "upgrading" : "building",
      sync: syncStatus,
      productionBaseline: {
        firstSeason:productionBaseline.firstSeason,
        lastSeason:productionBaseline.lastSeason,
        playerSeasonCount:productionBaseline.playerSeasonCount,
      },
      teams: teamResult.results,
      profiles,
    }, 200, ready ? "public, max-age=300, stale-while-revalidate=1800" : "no-store");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Player data is temporarily unavailable";
    const overloaded = /D1 DB is overloaded|requests queued for too long/i.test(message);
    const retryAfterSeconds = overloaded ? 30 : undefined;
    const sync = await getPlayerSyncStatus(runtime, season).catch(() => null);
    const result = response({
      configured: Boolean(runtime.CFBD_API_KEY),
      season,
      status: overloaded ? "waiting" : "error",
      sync,
      teams: [],
      profiles: [],
      retryAfterSeconds,
      message: overloaded ? "Player data is briefly queued. Retrying automatically." : message,
    }, overloaded ? 503 : 500);
    if (retryAfterSeconds) result.headers.set("retry-after", String(retryAfterSeconds));
    return result;
  }
}
