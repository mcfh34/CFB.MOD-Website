import { CollegeFootballDataError, currentCollegeFootballSeason, getBackfillStatus, syncHistorical, syncSeason, type PipelineEnv } from "../../../lib/dataPipeline";

type SyncPayload = { season?: number; fromSeason?: number; toSeason?: number; mode?: "season" | "historical" };

async function runtimeEnv() {
  const { env } = await import("cloudflare:workers");
  return env as unknown as PipelineEnv;
}

export async function GET() {
  const env = await runtimeEnv();
  const latestRun = await env.DB.prepare("SELECT season,week,source,status,game_count AS gameCount,detail,created_at AS createdAt FROM refresh_runs ORDER BY id DESC LIMIT 1").first().catch(() => null);
  return Response.json({ configured: Boolean(env.CFBD_API_KEY), latestRun, automaticSchedule: "Mondays at 11:00 UTC" });
}

export async function POST(request: Request) {
  const env = await runtimeEnv();
  const suppliedToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!env.SYNC_TOKEN || suppliedToken !== env.SYNC_TOKEN) return Response.json({ status: "unauthorized", message: "Administrative sync requires the private site sync token." }, { status: 401 });
  if (!env.CFBD_API_KEY) return Response.json({ status: "configuration-required", message: "A private CFBD_API_KEY must be configured once to activate historical and weekly ingestion." }, { status: 428 });
  const payload = (await request.json().catch(() => ({}))) as SyncPayload;
  try {
    if (payload.mode === "historical") {
      const fromSeason = Math.max(2021, Number(payload.fromSeason) || 2021);
      const toSeason = Math.min(currentCollegeFootballSeason(), Number(payload.toSeason) || currentCollegeFootballSeason());
      const results = await syncHistorical(env, fromSeason, toSeason);
      const backfill = await getBackfillStatus(env);
      return Response.json({ status: backfill.missing.length ? "running" : "complete", mode: "historical", fromSeason, toSeason, results, backfill });
    }
    const season = Number(payload.season) || currentCollegeFootballSeason();
    const result = await syncSeason(env, season, "manual");
    return Response.json({ status: result.stage === "complete" ? "complete" : "running", mode: "season", result });
  } catch (error) {
    const rateLimited = error instanceof CollegeFootballDataError && error.status === 429;
    const retryAfterSeconds = rateLimited ? error.retryAfterSeconds || 12 : undefined;
    const response = Response.json({ status: rateLimited ? "waiting" : "error", message: error instanceof Error ? error.message : "Sync failed", retryAfterSeconds }, { status: rateLimited ? 429 : 502 });
    if (retryAfterSeconds) response.headers.set("retry-after", String(retryAfterSeconds));
    return response;
  }
}
