import { ARCHIVE_REPAIR_COOLDOWN_SECONDS, claimArchiveRepair, CollegeFootballDataError, getBackfillStatus, syncArchiveBatch, type PipelineEnv } from "../../../lib/dataPipeline";
import {
  claimPlayerSync,
  getPlayerArchiveStatus,
  refreshPlayerProductionBaselineIfNeeded,
  syncPlayerSeasonBatch,
} from "../../../lib/playerPipeline";
import {
  getDepthChartArchiveSummary,
  maintainDepthChartArchive,
} from "../../../lib/depthChartArchive";

async function runtimeEnv() {
  const { env } = await import("cloudflare:workers");
  return env as unknown as PipelineEnv;
}

function json(body: unknown, init?: ResponseInit) {
  const response = Response.json(body, init);
  response.headers.set("cache-control", "no-store");
  return response;
}

export async function GET() {
  const env = await runtimeEnv();
  if (!env.DB) return json({ configured: false, missing: [], seasons: [] }, { status: 503 });
  try {
    const status = await getBackfillStatus(env);
    const season = status.missing[0];
    const stage = status.seasons.find((row) => row.season === season)?.stage;
    const cooldownSeconds = stage === "formulas" ? 60 : stage === "advanced" ? 90 : ARCHIVE_REPAIR_COOLDOWN_SECONDS;
    let result = null;
    let results: Awaited<ReturnType<typeof syncArchiveBatch>>["results"] = [];
    let rateLimited = false;
    let retryAfterSeconds = 0;
    let playerArchive = await getPlayerArchiveStatus(env);
    let playerSync = playerArchive.seasons.find((row) => row.season === playerArchive.missing[0]) ?? null;
    let playerSyncError: string | null = null;
    let depthChartMaintenance: Awaited<ReturnType<typeof maintainDepthChartArchive>> | null = null;
    try {
      depthChartMaintenance = await maintainDepthChartArchive(env.DB);
    } catch {
      // Depth-chart maintenance is isolated from the statistics archive. A
      // source import failure must never prevent score/history refreshes.
    }
    // Sites cron delivery is not guaranteed on every hosting tier. A status
    // request may therefore advance the server-owned queue, but only after an
    // atomic 75-second lease. A claimed job processes a paced, server-bounded
    // batch; the caller cannot choose a season, endpoint, or request count and
    // never receives the private API credential.
    if (!depthChartMaintenance?.ran && env.CFBD_API_KEY && season && await claimArchiveRepair(env, cooldownSeconds)) {
      const batch = await syncArchiveBatch(env, season, "bootstrap");
      results = batch.results;
      result = results.at(-1) ?? null;
      rateLimited = batch.rateLimited;
      retryAfterSeconds = batch.retryAfterSeconds;
    } else if (!depthChartMaintenance?.ran && env.CFBD_API_KEY && !season && playerSync && await claimPlayerSync(env)) {
      try {
        playerSync = (await syncPlayerSeasonBatch(env, playerSync.season)).status;
        playerArchive = await getPlayerArchiveStatus(env);
      } catch (error) {
        // An upcoming-season roster may legitimately be unavailable before
        // schools publish it. Keep every completed historical player season
        // usable instead of allowing that expected gap to fail bootstrap.
        playerSyncError = error instanceof Error ? error.message : "The active-season player roster is not available yet";
      }
    }
    let playerProductionBaseline: { status:"ready" | "building" | "waiting"; detail:string; nextSeason?:number; dirty?:boolean } | null = null;
    if (!status.missing.length) {
      try {
        const baseline = await refreshPlayerProductionBaselineIfNeeded(env.DB);
        playerProductionBaseline = {
          status:baseline.status,
          detail:baseline.detail,
          nextSeason:baseline.nextSeason,
          dirty:baseline.dirty,
        };
      } catch (error) {
        playerProductionBaseline = {
          status:"waiting",
          detail:error instanceof Error ? error.message : "Historical player production scale is queued",
        };
      }
    }
    const depthChartArchive = await getDepthChartArchiveSummary(env.DB).catch(() => null);
    const response = json({
      configured: Boolean(env.CFBD_API_KEY),
      importedSeason: results[0]?.season,
      result,
      results,
      playerSync,
      playerSyncError,
      playerArchive,
      playerProductionBaseline,
      depthChartArchive,
      depthChartMaintenance,
      status: rateLimited ? "waiting" : status.missing.length || playerArchive.missing.length ? "running" : "complete",
      retryAfterSeconds: retryAfterSeconds || undefined,
      ...status,
    });
    response.headers.set("cache-control", "public, max-age=20, stale-while-revalidate=90");
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Backfill status failed";
    const rateLimited = error instanceof CollegeFootballDataError && error.status === 429;
    const overloaded = /D1 DB is overloaded|requests queued for too long/i.test(message);
    const retryAfterSeconds = rateLimited ? error.retryAfterSeconds || 12 : overloaded ? 30 : undefined;
    const response = json({
      configured:Boolean(env.CFBD_API_KEY),
      missing:[],
      seasons:[],
      status:rateLimited || overloaded ? "waiting" : "error",
      message:overloaded ? "The archive database is briefly queued. Retrying automatically." : message,
      retryAfterSeconds,
    }, { status:rateLimited ? 429 : overloaded ? 503 : 500 });
    if (retryAfterSeconds) response.headers.set("retry-after", String(retryAfterSeconds));
    return response;
  }
}

export async function POST(request: Request) {
  const env = await runtimeEnv();
  const suppliedToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!env.SYNC_TOKEN || suppliedToken !== env.SYNC_TOKEN) return json({ configured: Boolean(env.CFBD_API_KEY), status: "unauthorized", message: "Archive writes require the private site sync token." }, { status: 401 });
  if (!env.CFBD_API_KEY) return json({ configured: false, message: "The private CollegeFootballData connection is not configured." }, { status: 428 });
  try {
    const before = await getBackfillStatus(env);
    const season = before.missing[0];
    if (!season) return json({ configured: true, status: "complete", ...before });
    const batch = await syncArchiveBatch(env, season, "bootstrap");
    const result = batch.results.at(-1) ?? null;
    const after = await getBackfillStatus(env);
    return json({ configured: true, status: batch.rateLimited ? "waiting" : after.missing.length ? "running" : "complete", importedSeason: batch.results[0]?.season, result, results: batch.results, retryAfterSeconds: batch.retryAfterSeconds || undefined, ...after });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Historical backfill failed";
    const rateLimited = error instanceof CollegeFootballDataError && error.status === 429;
    const retryAfterSeconds = rateLimited ? error.retryAfterSeconds || 12 : undefined;
    const response = json({ configured: true, status: rateLimited ? "waiting" : "error", message, retryAfterSeconds }, { status: rateLimited ? 429 : 502 });
    if (retryAfterSeconds) response.headers.set("retry-after", String(retryAfterSeconds));
    return response;
  }
}
