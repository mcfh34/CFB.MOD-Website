import { cfbd, CollegeFootballDataError, currentCollegeFootballSeason, type PipelineEnv } from "../../../lib/dataPipeline";
import { rushingEndpoints, type RushingView } from "../../../lib/rushing";
import { archiveRushingRows, type RushingBox } from "../../../lib/rushingArchive";
import {buildWeeklyDirectionalProfiles,parseDirectionalGames,type DirectionalGame} from "../../../lib/rushingMatchup";

export async function GET(request: Request) {
  const { env: runtime } = await import("cloudflare:workers");
  const env = runtime as unknown as PipelineEnv;
  const query = new URL(request.url).searchParams;
  const season = Number(query.get("season"));
  const team = query.get("team")?.trim() ?? "";
  const view = query.get("view") ?? "team-season";
  if (!Number.isInteger(season) || season < 2014 || season > currentCollegeFootballSeason() || !team || team.length > 100 || (view!=="matchup"&&!Object.hasOwn(rushingEndpoints, view))) {
    return Response.json({ message: "Choose a valid season, team and rushing view." }, { status: 400 });
  }
  const knownTeam = await env.DB.prepare("SELECT team FROM cfb_teams WHERE season=? AND team=? LIMIT 1").bind(season, team).first();
  if (!knownTeam) return Response.json({ message: "No team record is available for this season." }, { status: 404 });
  if(view==="matchup"){
    const week=Number(query.get("week"));
    if(season!==2026||!Number.isInteger(week)||week<0||week>20)return Response.json({rows:[],message:"Rushing direction is available for 2026 through a valid week."},{status:400});
    if(!env.CFBD_API_KEY)return Response.json({rows:[],message:"The rushing data connection is unavailable."},{status:503});
    const cache=(globalThis.caches as unknown as {default?:Cache}|undefined)?.default;
    const key=new Request(`https://harpercfbmodel.com/api/rushing?view=matchup&season=${season}&week=${week}&schema=1`);
    try{const hit=await cache?.match(key);if(hit)return hit;}catch{/* Optional cache. */}
    try{
      const [teamRows,completed]=await Promise.all([
        env.DB.prepare("SELECT team FROM cfb_teams WHERE season=?").bind(season).all<{team:string}>(),
        env.DB.prepare("SELECT game_id AS gameId,week FROM cfb_games WHERE season=? AND week<=? AND completed=1 AND season_type!='postseason'").bind(season,week).all<{gameId:string;week:number}>(),
      ]);
      const teams=teamRows.results as {team:string}[],completedGames=completed.results as {gameId:string;week:number}[];
      const eligible=new Set(teams.map(r=>r.team)),ids=new Set(completedGames.map(r=>String(r.gameId)));
      const weeks=[...new Set(completedGames.map(r=>r.week))];
      const games:DirectionalGame[]=[];
      for(const w of weeks){const payload=await cfbd("/rushing/teams/games",env.CFBD_API_KEY,{year:season,week:w,seasonType:"regular",classification:"fbs"});games.push(...parseDirectionalGames(payload).filter(g=>ids.has(g.gameId)));}
      const profiles=buildWeeklyDirectionalProfiles(games,week,eligible);
      const response=Response.json({season,week,source:"CFBD",rows:[...profiles].map(([name,directional])=>({team:name,directional})),message:profiles.size?null:"Rushing direction is unavailable for this cutoff."},{headers:{"cache-control":"public, max-age=3600"}});
      try{await cache?.put(key,response.clone());}catch{/* Return source data. */}
      return response;
    }catch(error){const status=error instanceof CollegeFootballDataError?error.status:502;return Response.json({rows:[],message:status===429?"CFBD's request limit was reached.":"Rushing direction is temporarily unavailable."},{status:status===429?429:503});}
  }
  const archived = async () => {
    if (view !== "team-season" && view !== "team-games") return null;
    const result = await env.DB.prepare(`SELECT s.game_id AS gameId,s.week,s.team,s.opponent,
      s.rush_attempts AS attempts,s.rush_yards AS yards FROM team_game_stats s
      JOIN cfb_games g ON g.game_id=s.game_id AND g.season=s.season
      WHERE s.season=? AND (s.team=? OR s.opponent=?) AND g.completed=1 ORDER BY g.start_date,s.game_id`)
      .bind(season,team,team).all<RushingBox>();
    const rows = archiveRushingRows(result.results,team,view === "team-games");
    return rows.length ? Response.json({ rows,season,team,view,source:"CFBD box-score archive",
      message:"Completed box-score totals. Advanced rushing and direction data are unavailable for this selection." },
      { headers:{"cache-control":"public, max-age=300"} }) : null;
  };
  if (!env.CFBD_API_KEY) return await archived() ?? Response.json({ rows:[],message:"The rushing data connection is unavailable." },{status:503});
  const gameId = query.get("gameId") ?? "";
  if (view === "plays") {
    if (!/^\d+$/.test(gameId)) return Response.json({ message: "Select a completed game to view rushing plays." }, { status: 400 });
    const game = await env.DB.prepare("SELECT game_id FROM cfb_games WHERE season=? AND game_id=? AND (home_team=? OR away_team=?) AND completed=1 LIMIT 1").bind(season, gameId, team, team).first();
    if (!game) return Response.json({ message: "This completed game is unavailable for the selected team." }, { status: 404 });
  }
  const cache = (globalThis.caches as unknown as { default?: Cache } | undefined)?.default;
  const cacheUrl = new URL("https://harpercfbmodel.com/api/rushing");
  cacheUrl.search = new URLSearchParams({ season: String(season), team, view, gameId: view === "plays" ? gameId : "", schema: "2" }).toString();
  const key = new Request(cacheUrl);
  // Cache API support varies by the hosting environment; it must never block data.
  let cached: Response | undefined;
  try { cached = cache ? await cache.match(key) : undefined; } catch { /* Optional host cache. */ }
  if (cached) return cached;
  try {
    const payload = await cfbd(rushingEndpoints[view as RushingView], env.CFBD_API_KEY,
      view === "plays" ? { gameId, team } : { year: season, team, seasonType: "both" });
    if (!Array.isArray(payload)) throw new Error("Unexpected rushing response");
    if (!payload.length) { const fallback = await archived(); if (fallback) return fallback; }
    const response = Response.json({ rows: payload, season, team, view, updatedAt: new Date().toISOString(), source: "CFBD", message: payload.length ? null : "CFBD has not published rushing data for this selection." }, { headers: { "cache-control": "public, max-age=21600" } });
    try { if (cache) await cache.put(key, response.clone()); } catch { /* Return source data even if caching is unavailable. */ }
    return response;
  } catch (error) {
    const fallback = await archived();
    if (fallback) return fallback;
    const status = error instanceof CollegeFootballDataError ? error.status : 502;
    const message = status === 401 || status === 403 ? "This rushing feed is not available with the current CFBD access." : status === 429 ? "CFBD’s request limit was reached. Please try again later." : "CFBD rushing data is temporarily unavailable.";
    const response = Response.json({ message, rows: [], source: "CFBD" }, { status: status === 429 ? 429 : 503, headers: { "cache-control": "public, max-age=300" } });
    try { if (cache) await cache.put(key, response.clone()); } catch { /* Preserve the source error response. */ }
    return response;
  }
}
