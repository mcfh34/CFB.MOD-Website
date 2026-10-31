import { currentScheduledWeek, currentSeason, type ScheduledWeek } from "../../../lib/currentWeek";

export async function GET(){
  const { env }=await import("cloudflare:workers");
  const db=env.DB as D1Database|undefined;
  if(!db)return Response.json({season:null,week:null},{status:503});
  const now=new Date();
  const season=currentSeason(now);
  try{
    const result=await db.prepare(`SELECT week,MIN(start_date) AS firstStart FROM cfb_games
      WHERE season=? AND start_date IS NOT NULL AND season_type IN ('regular','conference-championship')
      GROUP BY week ORDER BY week`).bind(season).all<ScheduledWeek>();
    const response=Response.json({season,week:currentScheduledWeek(result.results,now)});
    response.headers.set("cache-control","public, max-age=300, stale-while-revalidate=600");
    return response;
  }catch{
    return Response.json({season,week:null},{status:503});
  }
}
