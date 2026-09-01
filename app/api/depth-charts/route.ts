import type { PipelineEnv } from "../../../lib/dataPipeline";
import {
  getDepthChartArchiveSummary,
  getDepthChartCoverage,
  getTeamDepthChartSources,
  importDepthChartBatch,
  maintainDepthChartArchive,
  validateDepthChart,
} from "../../../lib/depthChartArchive";

type RuntimeEnv = PipelineEnv & { DB?: D1Database };

function json(body: unknown, status = 200, cacheControl = "no-store") {
  const response = Response.json(body, { status });
  response.headers.set("cache-control", cacheControl);
  return response;
}

async function runtimeEnv() {
  const { env } = await import("cloudflare:workers");
  return env as unknown as RuntimeEnv;
}

export async function GET(request: Request) {
  const runtime = await runtimeEnv();
  if (!runtime.DB) return json({ configured: false, status: "unavailable" }, 503);
  const url = new URL(request.url);
  const seasonValue = Number(url.searchParams.get("season"));
  const season = Number.isInteger(seasonValue) ? seasonValue : undefined;
  const team = (url.searchParams.get("team") ?? "").trim() || undefined;
  const status = (url.searchParams.get("status") ?? "").trim() || undefined;
  const limitValue = Number(url.searchParams.get("limit"));
  const limit = Number.isInteger(limitValue) ? limitValue : undefined;
  try {
    const [summary, coverage, sources] = await Promise.all([
      getDepthChartArchiveSummary(runtime.DB),
      getDepthChartCoverage(runtime.DB, { season, team, status, limit }),
      season && team ? getTeamDepthChartSources(runtime.DB, season, team) : Promise.resolve([]),
    ]);
    return json({
      configured: true,
      status: "ready",
      summary,
      coverage,
      sources,
      sourcePolicy: {
        publishedDepthOnly: true,
        observedStartersLabeledSeparately: true,
        projectionsNeverPromotedToVerified: true,
      },
    }, 200, "public, max-age=300, stale-while-revalidate=1800");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Depth-chart archive is temporarily unavailable.";
    const overloaded = /D1 DB is overloaded|requests queued for too long/i.test(message);
    const response = json({
      configured: true,
      status: overloaded ? "waiting" : "error",
      message: overloaded ? "The archive database is briefly queued. Retrying is safe." : message,
      retryAfterSeconds: overloaded ? 30 : undefined,
    }, overloaded ? 503 : 500);
    if (overloaded) response.headers.set("retry-after", "30");
    return response;
  }
}

export async function POST(request: Request) {
  const runtime = await runtimeEnv();
  if (!runtime.DB) return json({ configured: false, status: "unavailable" }, 503);
  const suppliedToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!runtime.SYNC_TOKEN || suppliedToken !== runtime.SYNC_TOKEN) {
    return json({ configured: true, status: "unauthorized", message: "Depth-chart imports require the private site sync token." }, 401);
  }
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 1_000_000) {
    return json({ configured: true, status: "rejected", message: "Import payload exceeds the one-megabyte safety limit." }, 413);
  }
  try {
    const body = await request.json() as { action?: unknown; charts?: unknown };
    if (body.action === "maintain") {
      const maintenance = await maintainDepthChartArchive(runtime.DB);
      return json({ configured: true, status: "complete", maintenance });
    }
    const charts = Array.isArray(body.charts) ? body.charts.slice(0, 25) : [];
    if (!charts.length) {
      return json({ configured: true, status: "rejected", message: "Provide one to 25 source-backed charts." }, 400);
    }
    const validations = charts.map((chart) => validateDepthChart(chart, true));
    if (validations.some((validation) => !validation.valid)) {
      return json({
        configured: true,
        status: "rejected",
        message: "No data was imported because at least one chart failed validation.",
        validations,
      }, 422);
    }
    const result = await importDepthChartBatch(runtime.DB, charts, "authenticated_curated_import");
    return json({ configured: true, ...result }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Depth-chart import failed.";
    const overloaded = /D1 DB is overloaded|requests queued for too long/i.test(message);
    const response = json({
      configured: true,
      status: overloaded ? "waiting" : "error",
      message: overloaded ? "The archive database is briefly queued. The import can be retried safely." : message,
      retryAfterSeconds: overloaded ? 30 : undefined,
    }, overloaded ? 503 : 500);
    if (overloaded) response.headers.set("retry-after", "30");
    return response;
  }
}
