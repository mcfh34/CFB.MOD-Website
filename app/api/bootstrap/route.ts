import { CollegeFootballDataError, getBackfillStatus, syncSeasonStep, type PipelineEnv } from "../../../lib/dataPipeline";

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
    return json({ configured: Boolean(env.CFBD_API_KEY), ...status });
  } catch (error) {
    return json({ configured: Boolean(env.CFBD_API_KEY), missing: [], seasons: [], message: error instanceof Error ? error.message : "Backfill status failed" }, { status: 500 });
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
    const result = await syncSeasonStep(env, season, "bootstrap");
    const after = await getBackfillStatus(env);
    return json({ configured: true, status: after.missing.length ? "running" : "complete", importedSeason: season, result, ...after });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Historical backfill failed";
    const rateLimited = error instanceof CollegeFootballDataError && error.status === 429;
    const retryAfterSeconds = rateLimited ? error.retryAfterSeconds || 12 : undefined;
    const response = json({ configured: true, status: rateLimited ? "waiting" : "error", message, retryAfterSeconds }, { status: rateLimited ? 429 : 502 });
    if (retryAfterSeconds) response.headers.set("retry-after", String(retryAfterSeconds));
    return response;
  }
}
