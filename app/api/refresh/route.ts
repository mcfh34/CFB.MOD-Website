import { CollegeFootballDataError, currentCollegeFootballSeason, syncSeason, type PipelineEnv } from "../../../lib/dataPipeline";

type RefreshPayload = { season?: number };

async function runtimeEnv() {
  const { env } = await import("cloudflare:workers");
  return env as unknown as PipelineEnv;
}

export async function GET() {
  const env = await runtimeEnv();
  const run = await env.DB.prepare("SELECT season,week,source,status,game_count AS gameCount,detail,created_at AS createdAt FROM refresh_runs ORDER BY id DESC LIMIT 1").first().catch(() => null);
  return Response.json({ run, configured: Boolean(env.CFBD_API_KEY) });
}

export async function POST(request: Request) {
  const env = await runtimeEnv();
  const suppliedToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!env.SYNC_TOKEN || suppliedToken !== env.SYNC_TOKEN) return Response.json({ status: "unauthorized", message: "Administrative refresh requires the private site sync token." }, { status: 401 });
  const payload = (await request.json().catch(() => ({}))) as RefreshPayload;
  const season = Number(payload.season) || currentCollegeFootballSeason();
  if (!env.CFBD_API_KEY) {
    return Response.json({ status: "configuration-required", message: "Dynamic engine is ready. Configure the private CollegeFootballData API key once to activate automatic ingestion." }, { status: 428 });
  }
  try {
    const recent = await env.DB.prepare("SELECT season,week,created_at AS createdAt FROM refresh_runs WHERE status='complete' AND season=? AND datetime(created_at)>=datetime('now','-6 hours') ORDER BY id DESC LIMIT 1").bind(season).first<{ season: number; week: number; createdAt: string }>();
    if (recent) return Response.json({ status: "current", message: `Data is already current through ${recent.season} week ${recent.week}. The next automatic check runs Monday morning.`, recent });
    const result = await syncSeason(env, season, "manual");
    const complete = result.stage === "complete";
    const remainingWeeks = "remainingWeeks" in result ? result.remainingWeeks : [];
    const runningMessage = result.stage === "passing"
        ? `${season} completion detail is being hydrated; ${(result.remainingWeeks ?? []).length} weekly slices remain.`
        : `${season} schedule refreshed; the archive is continuing through ${remainingWeeks.length} missing weekly stat slices.`;
    return Response.json({ status: complete ? "complete" : "running", message: complete ? `${season} refreshed: ${result.games} API games and ${result.profiles} weekly team profiles.` : runningMessage, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Refresh failed";
    const rateLimited = error instanceof CollegeFootballDataError && error.status === 429;
    const retryAfterSeconds = rateLimited ? error.retryAfterSeconds || 12 : undefined;
    const response = Response.json({ status: rateLimited ? "waiting" : "error", message, retryAfterSeconds }, { status: rateLimited ? 429 : 502 });
    if (retryAfterSeconds) response.headers.set("retry-after", String(retryAfterSeconds));
    return response;
  }
}
