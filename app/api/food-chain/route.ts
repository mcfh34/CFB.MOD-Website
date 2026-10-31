import {visualizationCacheControl} from "../../../lib/visualizationFreshness";
import {currentCollegeFootballSeason,type PipelineEnv} from '../../../lib/dataPipeline';
import type {FoodGame,FoodTeam} from '../../../lib/foodChain';
export async function GET(request:Request){
  const season=Number(new URL(request.url).searchParams.get('season'));
  if(!Number.isInteger(season)||season<2014||season>currentCollegeFootballSeason())return Response.json({message:'Choose a season from 2014 onward.'},{status:400});
  try{
    const {env:runtime}=await import('cloudflare:workers');const env=runtime as unknown as PipelineEnv;
    if(!env.DB)return Response.json({message:'Game results are unavailable.'},{status:503});
    const [teams,games]=await Promise.all([
      env.DB.prepare('SELECT team,conference,logo,color,abbreviation FROM cfb_teams WHERE season=? ORDER BY team').bind(season).all<FoodTeam>(),
      env.DB.prepare(`SELECT game_id AS gameId,week,COALESCE(season_type,'regular') AS seasonType,home_team AS homeTeam,away_team AS awayTeam,home_points AS homePoints,away_points AS awayPoints,completed FROM cfb_games WHERE season=? AND completed=1 ORDER BY week,game_id`).bind(season).all<FoodGame>(),
    ]);
    return Response.json({teams:teams.results,games:games.results},{headers:{'cache-control':visualizationCacheControl(season===currentCollegeFootballSeason())}});
  }catch{return Response.json({message:'Game results could not be loaded. Try again shortly.'},{status:503});}
}
