import { cfbd, CollegeFootballDataError, currentCollegeFootballSeason, type PipelineEnv } from "../../../lib/dataPipeline";
import { passingEndpoints, type PassingView } from "../../../lib/passing";
import { archivePassingRows, type PassingBox } from "../../../lib/passingArchive";
import {buildPassingDirectionalProfiles,parsePassingDirectionalGames,type PassingDirectionalGame} from "../../../lib/passingMatchup";

export async function GET(request: Request) {
  const { env: runtime } = await import("cloudflare:workers");
  const env = runtime as unknown as PipelineEnv;
  const query = new URL(request.url).searchParams;
  const season = Number(query.get("season"));
  const team = query.get("team")?.trim() ?? "";
  const view = query.get("view") ?? "team-season";
  if (!Number.isInteger(season) || season < 2014 || season > currentCollegeFootballSeason() || !team || team.length > 100 || (view!=="matchup"&&!Object.hasOwn(passingEndpoints, view))) {
    return Response.json({ message: "Choose a valid season, team and passing view." }, { status: 400 });
  }
  const knownTeam = await env.DB.prepare("SELECT team FROM cfb_teams WHERE season=? AND team=? LIMIT 1").bind(season, team).first();
  if (!knownTeam) return Response.json({ message: "No team record is available for this season." }, { status: 404 });
  if(view==="matchup") {
    const week=Number(query.get("week"));
    if(!Number.isInteger(week)||week<0||week>20)return Response.json({rows:[],message:"Choose a valid cutoff week."},{status:400});
    if(!env.CFBD_API_KEY)return Response.json({rows:[],message:"The passing data connection is unavailable."},{status:503});
    const cache=(globalThis.caches as unknown as {default?:Cache}|undefined)?.default;
    const cacheKey=new Request(`https://harpercfbmodel.com/api/passing?view=matchup&season=${season}&week=${week}&schema=3`);
    try {const hit=await cache?.match(cacheKey);if(hit)return hit;}catch{/* Optional cache. */}
    try {
      const [teamRows,completed]=await Promise.all([
        env.DB.prepare("SELECT team FROM cfb_teams WHERE season=?").bind(season).all<{team:string}>(),
        env.DB.prepare("SELECT game_id AS gameId,week,season_type AS seasonType FROM cfb_games WHERE season=? AND week<=? AND completed=1").bind(season,week).all<{gameId:string;week:number;seasonType:string}>(),
      ]);
      const teams=teamRows.results as {team:string}[],completedGames=completed.results as {gameId:string;week:number;seasonType:string}[];
      const eligible=new Set(teams.map(r=>r.team)),ids=new Set(completedGames.map(r=>String(r.gameId)));
      const slices=[...new Map(completedGames.map(r=>[`${r.week}:${r.seasonType}`,r] as const)).values()];
      const games:PassingDirectionalGame[]=[];
      // One national slice per week supplies each opponent's other-game baseline.
      for(const slice of slices){const payload=await cfbd("/passing/teams/games",env.CFBD_API_KEY,{year:season,week:slice.week,seasonType:slice.seasonType,classification:"fbs"});games.push(...parsePassingDirectionalGames(payload).filter(g=>ids.has(g.gameId)));}
      const profiles=buildPassingDirectionalProfiles(games,week,eligible);
      const response=Response.json({season,week,source:"CFBD",rows:[...profiles].map(([team,directional])=>({team,directional})),message:profiles.size?null:"CFBD has not published pass-location data for this cutoff."},{headers:{"cache-control":"public, max-age=3600"}});
      try {await cache?.put(cacheKey,response.clone());}catch{/* Return source data. */}
      return response;
    }catch(error){const status=error instanceof CollegeFootballDataError?error.status:502;return Response.json({rows:[],message:status===401||status===403?"This passing feed is not available with the current CFBD access.":status===429?"CFBD’s request limit was reached. Please try again later.":"Pass-location matchups are temporarily unavailable."},{status:status===429?429:503});}
  }
  const archived = async () => {
    if (view !== "team-season" && view !== "team-games") return null;
    const result = await env.DB.prepare(`SELECT s.game_id AS gameId,s.week,s.team,s.opponent,
      s.pass_attempts AS attempts,s.pass_yards AS yards,s.pass_completions AS completions FROM team_game_stats s
      JOIN cfb_games g ON g.game_id=s.game_id AND g.season=s.season
      WHERE s.season=? AND (s.team=? OR s.opponent=?) AND g.completed=1 ORDER BY g.start_date,s.game_id`)
      .bind(season,team,team).all<PassingBox>();
    const rows = archivePassingRows(result.results,team,view === "team-games");
    return rows.length ? Response.json({ rows,season,team,view,source:"CFBD box-score archive",
      message:"Completed box-score totals. Advanced passing and location data are unavailable for this selection." },
      { headers:{"cache-control":"public, max-age=300"} }) : null;
  };
  if (!env.CFBD_API_KEY) return await archived() ?? Response.json({ rows:[],message:"The passing data connection is unavailable." },{status:503});
  const gameId = query.get("gameId") ?? "";
  if (view === "plays") {
    if (!/^\d+$/.test(gameId)) return Response.json({ message: "Select a completed game to view passing plays." }, { status: 400 });
    const game = await env.DB.prepare("SELECT game_id FROM cfb_games WHERE season=? AND game_id=? AND (home_team=? OR away_team=?) AND completed=1 LIMIT 1").bind(season, gameId, team, team).first();
    if (!game) return Response.json({ message: "This completed game is unavailable for the selected team." }, { status: 404 });
  }
  const cache = (globalThis.caches as unknown as { default?: Cache } | undefined)?.default;
  const cacheUrl = new URL("https://harpercfbmodel.com/api/passing");
  cacheUrl.search = new URLSearchParams({ season: String(season), team, view, gameId: view === "plays" ? gameId : "", schema: "2" }).toString();
  const key = new Request(cacheUrl);
  // Cache API support varies by the hosting environment; it must never block data.
  let cached: Response | undefined;
  try { cached = cache ? await cache.match(key) : undefined; } catch { /* Optional host cache. */ }
  if (cached) return cached;
  try {
    const payload = await cfbd(passingEndpoints[view as PassingView], env.CFBD_API_KEY,
      view === "plays" ? { year:season, gameId, team } : { year: season, team, seasonType: "both", classification:"fbs" });
    if (!Array.isArray(payload)) throw new Error("Unexpected passing response");
    if (!payload.length) { const fallback = await archived(); if (fallback) return fallback; }
    const response = Response.json({ rows: payload, season, team, view, updatedAt: new Date().toISOString(), source: "CFBD", message: payload.length ? null : "CFBD has not published passing data for this selection." }, { headers: { "cache-control": "public, max-age=3600" } });
    try { if (cache) await cache.put(key, response.clone()); } catch { /* Return source data even if caching is unavailable. */ }
    return response;
  } catch (error) {
    const fallback = await archived();
    if (fallback) return fallback;
    const status = error instanceof CollegeFootballDataError ? error.status : 502;
    const message = status === 401 || status === 403 ? "This passing feed is not available with the current CFBD access." : status === 429 ? "CFBD’s request limit was reached. Please try again later." : "CFBD passing data is temporarily unavailable.";
    const response = Response.json({ message, rows: [], source: "CFBD" }, { status: status === 429 ? 429 : 503, headers: { "cache-control": "public, max-age=300" } });
    try { if (cache) await cache.put(key, response.clone()); } catch { /* Preserve the source error response. */ }
    return response;
  }
}
