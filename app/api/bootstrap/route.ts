import { CollegeFootballDataError, getBackfillStatus, syncArchiveBatch, type PipelineEnv } from "../../../lib/dataPipeline";
import { getPlayerArchiveStatus } from "../../../lib/playerPipeline";
import { getDepthChartArchiveSummary } from "../../../lib/depthChartArchive";

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
    const [status,playerArchive,depthChartArchive]=await Promise.all([
      getBackfillStatus(env),
      getPlayerArchiveStatus(env),
      getDepthChartArchiveSummary(env.DB).catch(()=>null),
    ]);
    const response = json({
      configured: Boolean(env.CFBD_API_KEY),
      playerArchive,
      depthChartArchive,
      status: status.missing.length || playerArchive.missing.length ? "running" : "complete",
      ...status,
    });
    response.headers.set("cache-control", "public, max-age=20, stale-while-revalidate=90");
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const rateLimited = error instanceof CollegeFootballDataError && error.status === 429;
    const overloaded = /D1 DB is overloaded|requests queued for too long/i.test(message);
    const retryAfterSeconds = rateLimited ? error.retryAfterSeconds || 12 : overloaded ? 30 : undefined;
    const response = json({
      configured:Boolean(env.CFBD_API_KEY),
      missing:[],
      seasons:[],
      status:rateLimited || overloaded ? "waiting" : "error",
      message:overloaded ? "The archive database is briefly queued. Retrying automatically." : "The archive status is temporarily unavailable.",
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
    const message = error instanceof Error ? error.message : "";
    const rateLimited = error instanceof CollegeFootballDataError && error.status === 429;
    const retryAfterSeconds = rateLimited ? error.retryAfterSeconds || 12 : undefined;
    const response = json({ configured: true, status: rateLimited ? "waiting" : "error", message: rateLimited ? "The source data service is briefly rate limited. Retrying is safe." : "Historical backfill could not finish. Existing published data was preserved.", retryAfterSeconds }, { status: rateLimited ? 429 : 502 });
    if (retryAfterSeconds) response.headers.set("retry-after", String(retryAfterSeconds));
    return response;
  }
}
