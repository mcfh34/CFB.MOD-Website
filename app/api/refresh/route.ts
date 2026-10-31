import {sourceIssue} from "../../../lib/sourceStatus";
import { CollegeFootballDataError, currentCollegeFootballSeason, importReviewedWeekResults, refreshSeasonMarketLines, syncSeason, type PipelineEnv } from "../../../lib/dataPipeline";
import { queueActivePlayerSeasonRefresh } from "../../../lib/playerPipeline";

type RefreshPayload = { season?: number; action?: "current-stats"|"market-lines" };
const PUBLIC_REFRESH_COOLDOWN_SECONDS = 180;

async function runtimeEnv() {
  const { env } = await import("cloudflare:workers");
  return env as unknown as PipelineEnv;
}

export async function GET() {
  const env = await runtimeEnv();
  const run = await env.DB.prepare("SELECT season,week,source,status,game_count AS gameCount,detail,created_at AS createdAt FROM refresh_runs ORDER BY id DESC LIMIT 1").first().catch(() => null);
  const {detail,...safeRun}=(run??{}) as Record<string,unknown>;
  return Response.json({ run:run?safeRun:null, sourceIssue:run&&safeRun.status==="error"?sourceIssue(String(detail??"")):null, configured: Boolean(env.CFBD_API_KEY) },{headers:{"cache-control":"no-store"}});
}

function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  return origin === new URL(request.url).origin && (!fetchSite || fetchSite === "same-origin");
}

async function claimPublicRefresh(env: PipelineEnv) {
  const lease = await env.DB.prepare(`INSERT INTO sync_leases (scope,next_allowed_at,updated_at)
      VALUES ('public-current-stats-refresh',unixepoch()+?,CURRENT_TIMESTAMP)
      ON CONFLICT(scope) DO UPDATE SET next_allowed_at=excluded.next_allowed_at,updated_at=CURRENT_TIMESTAMP
      WHERE sync_leases.next_allowed_at<=unixepoch()`)
    .bind(PUBLIC_REFRESH_COOLDOWN_SECONDS)
    .run();
  return Number(lease.meta.changes ?? 0) > 0;
}

export async function POST(request: Request) {
  const env = await runtimeEnv();
  const suppliedToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const payload = (await request.json().catch(() => ({}))) as RefreshPayload;
  const isAdministrator = Boolean(env.SYNC_TOKEN && suppliedToken === env.SYNC_TOKEN);
  const isPublicCurrentRefresh = (payload.action === "current-stats"||payload.action === "market-lines") && isSameOriginRequest(request);
  if (!isAdministrator && !isPublicCurrentRefresh) return Response.json({ status: "unauthorized", message: "Use the on-site Refresh Stats control." }, { status: 401 });
  const season = isAdministrator ? Number(payload.season) || currentCollegeFootballSeason() : currentCollegeFootballSeason();
  if (!env.CFBD_API_KEY) {
    return Response.json({ status: "configuration-required", message: "Dynamic engine is ready. Configure the private CollegeFootballData API key once to activate automatic ingestion." }, { status: 428 });
  }
  try {
    if (!isAdministrator && !(await claimPublicRefresh(env))) {
      return Response.json({ status: "busy", message: "A stats refresh just ran or is already running. The data will appear automatically when it finishes." }, { status: 409 });
    }
    if(payload.action==="market-lines")return Response.json({status:"complete",result:await refreshSeasonMarketLines(env,season),message:"Sportsbook lines refreshed from CFBD."},{headers:{"cache-control":"no-store"}});
    const result = await syncSeason(env, season, "manual");
    await queueActivePlayerSeasonRefresh(env, season).catch(() => false);
    const complete = result.stage === "complete";
    const remainingWeeks = "remainingWeeks" in result && Array.isArray(result.remainingWeeks) ? result.remainingWeeks : [];
    const remainingSackWeeks = "remainingSackWeeks" in result && Array.isArray(result.remainingSackWeeks) ? result.remainingSackWeeks : [];
    const runningMessage = result.stage === "passing"
        ? `${season} completion detail is being hydrated; ${(result.remainingWeeks ?? []).length} weekly slices remain.`
        : remainingSackWeeks.length
          ? `${season} scores are current; ${remainingSackWeeks.length} sack-yard verification slices remain before projections are rebuilt.`
          : `${season} schedule refreshed; the archive is continuing through ${remainingWeeks.length} missing weekly stat slices.`;
    return Response.json({ status: complete ? "complete" : "running", message: complete ? `${season} scores, team stats, and projections are current; player detail is queued.` : runningMessage, result });
  } catch (error) {
    const rateLimited = error instanceof CollegeFootballDataError && error.status === 429;
    const retryAfterSeconds = rateLimited ? error.retryAfterSeconds || 12 : undefined;
    const issue=sourceIssue(error instanceof Error?error.message:"");
    const recovery=rateLimited&&payload.action!=="market-lines"?await importReviewedWeekResults(env,season).catch(()=>null):null;
    if(recovery)return Response.json({status:"partial",recovery,sourceIssue:issue,message:`Week ${recovery.week}: ${recovery.gameCount} final scores and team box scores are available. Records, result-based maps, and basic opponent-adjusted percentages through Week ${recovery.basicThroughWeek} are updated. Advanced stats, player stats, and full projection enrichment are still pending because CollegeFootballData is rate limited.`},{headers:{"cache-control":"no-store"}});
    const response = Response.json({ status: issue?.code==="source-quota"?"blocked":rateLimited ? "waiting" : "error", sourceIssue:issue, message:issue?.message??"The stats refresh could not finish. Existing published data was preserved.", retryAfterSeconds }, { status: rateLimited ? 429 : 502 });
    if (retryAfterSeconds) response.headers.set("retry-after", String(retryAfterSeconds));
    return response;
  }
}
