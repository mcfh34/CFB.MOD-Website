import { claimArchiveRepair, CollegeFootballDataError, currentCollegeFootballSeason, FIRST_HISTORICAL_SEASON, getBackfillStatus, syncArchiveBatch, syncSeason, type PipelineEnv } from "../../../lib/dataPipeline";
import { claimPlayerSync, getPlayerArchiveStatus, queueActivePlayerSeasonRefresh, syncPlayerSeasonBatch } from "../../../lib/playerPipeline";

// A short-lived maintenance credential enables an explicitly requested refresh
// without rotating the site's existing sync credential or exposing the CFBD key.
export async function POST(request: Request) {
  const { env: runtime } = await import("cloudflare:workers");
  const env = runtime as unknown as PipelineEnv & { MAINTENANCE_TOKEN?: string };
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const expiresAt = Number(env.MAINTENANCE_TOKEN?.split(".")[0]);
  if (!token || token !== env.MAINTENANCE_TOKEN || !Number.isFinite(expiresAt) || Date.now() >= expiresAt) {
    return Response.json({ status: "unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({})) as { phase?: string; season?: number };
  const season = currentCollegeFootballSeason();
  try {
    if (body.phase === "status") {
      const [teams, players] = await Promise.all([getBackfillStatus(env), getPlayerArchiveStatus(env)]);
      return Response.json({ season, teams: teams.seasons.find((row) => row.season === season), players: players.seasons.find((row) => row.season === season) });
    }
    if (body.phase === "queue-players") {
      return Response.json({ queued: await queueActivePlayerSeasonRefresh(env, season), season });
    }
    if (body.phase === "players") {
      if (!await claimPlayerSync(env)) return Response.json({ status: "busy" }, { status: 409 });
      return Response.json(await syncPlayerSeasonBatch(env, season));
    }
    if (body.phase === "archive") {
      const requestedSeason = Number(body.season);
      if (!Number.isInteger(requestedSeason) || requestedSeason < FIRST_HISTORICAL_SEASON || requestedSeason > season) {
        return Response.json({ status:"invalid-season", firstSeason:FIRST_HISTORICAL_SEASON, currentSeason:season }, { status:400 });
      }
      if (!await claimArchiveRepair(env, 1)) return Response.json({ status:"busy" }, { status:409 });
      return Response.json(await syncArchiveBatch(env, requestedSeason, "manual"));
    }
    if (body.phase !== "teams") return Response.json({ message: "Unknown refresh phase" }, { status: 400 });
    if (!await claimArchiveRepair(env, 90)) return Response.json({ status: "busy" }, { status: 409 });
    return Response.json(await syncSeason(env, season, "manual"));
  } catch (error) {
    const rateLimited = error instanceof CollegeFootballDataError && error.status === 429;
    return Response.json({ status: rateLimited ? "waiting" : "error", message: error instanceof Error ? error.message : "Refresh failed" }, { status: rateLimited ? 429 : 502 });
  }
}
