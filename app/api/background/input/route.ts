import {GET as getData} from "../../data/route";
import {currentCollegeFootballSeason} from "../../../../lib/dataPipeline";
import {currentMatchupFormulaRevision} from "../../../../lib/formulaRevision";
import {roundRobinProfilesFromRows} from "../../../../lib/backgroundModel";
export async function GET(request:Request){
 const {env}=await import("cloudflare:workers");const db=env.DB as D1Database;const requested=Number(new URL(request.url).searchParams.get("season"));const season=Number.isInteger(requested)&&requested>=2014&&requested<=currentCollegeFootballSeason()?requested:currentCollegeFootballSeason();
 const stamp=await db.prepare("SELECT MAX(week) AS week,MAX(created_at) AS stamp FROM weekly_profiles WHERE season=?").bind(season).first<{week:number|null;stamp:string|null}>();if(!stamp?.stamp)return Response.json({message:"Profiles not ready"},{status:202});
 const week=Number(stamp.week);const url=new URL(request.url);url.pathname="/api/data";url.search=new URLSearchParams({view:"profiles",season:String(season),week:String(week),compactProfiles:"1"}).toString();const response=await getData(new Request(url));if(!response.ok)return response;const payload=await response.json() as {rows:Record<string,unknown>[]};
 const games=await db.prepare("SELECT g.game_id AS gameId,g.home_team AS homeTeam,g.away_team AS awayTeam,g.completed,g.home_points AS homePoints,g.away_points AS awayPoints,g.season_type AS seasonType,p.home_win_probability AS homeWin FROM cfb_games g LEFT JOIN model_predictions p ON p.game_id=g.game_id AND p.season=g.season WHERE g.season=?").bind(season).all();
 return Response.json({season,week,sourceStamp:stamp.stamp,formulaRevision:currentMatchupFormulaRevision,viabilityCalibration:(payload as {viabilityCalibration?:unknown}).viabilityCalibration,profiles:roundRobinProfilesFromRows(payload.rows,season,week),games:games.results.map(g=>({...g,completed:Boolean(g.completed)}))},{headers:{"cache-control":"public, max-age=300"}});
}
