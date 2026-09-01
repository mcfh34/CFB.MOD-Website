import {
  cfbd,
  CollegeFootballDataError,
  currentCollegeFootballSeason,
  type PipelineEnv,
} from "../../../lib/dataPipeline";
import { FIRST_PLAYER_SEASON } from "../../../lib/playerModel";
import {
  comparePlayerWeeklyGames,
  playerWeeklyBoxGames,
  playerWeeklyPpaGames,
  playerWeeklySuccessGames,
  type PlayerWeeklyAdvancedGame,
  type PlayerWeeklyMetricMap,
} from "../../../lib/playerWeekly";

type RuntimeEnv=PipelineEnv&{DB?:D1Database};
type GameDirectoryRow={
  gameId?:unknown;week?:unknown;seasonType?:unknown;startDate?:unknown;
  opponent?:unknown;opponentAbbreviation?:unknown;opponentLogo?:unknown;
};

const text=(value:unknown)=>String(value??"").trim();
const finite=(value:unknown)=>{
  if(value===null||value===undefined||value==="")return null;
  const number=Number(value);
  return Number.isFinite(number)?number:null;
};
const normalized=(value:unknown)=>text(value).toLowerCase().replace(/[^a-z0-9]/g,"");

function json(body:unknown,status=200,cacheControl="no-store"){
  const response=Response.json(body,{status});
  response.headers.set("cache-control",cacheControl);
  return response;
}

async function optionalCfbd(path:string,key:string,params:Record<string,string|number|undefined>){
  try{return await cfbd(path,key,params);}catch{return[];}
}

function advancedForGame(rows:PlayerWeeklyAdvancedGame[],week:number,opponent:string){
  const sameWeek=rows.filter((row)=>row.week===week);
  return sameWeek.find((row)=>normalized(row.opponent)===normalized(opponent))??(sameWeek.length===1?sameWeek[0]:null);
}

export async function GET(request:Request){
  const {env}=await import("cloudflare:workers");
  const runtime=env as unknown as RuntimeEnv;
  if(!runtime.DB||!runtime.CFBD_API_KEY)return json({status:"unavailable",games:[],message:"Weekly player data is unavailable."},503);

  const url=new URL(request.url);
  const season=Math.trunc(Number(url.searchParams.get("season")));
  const team=text(url.searchParams.get("team"));
  const playerId=text(url.searchParams.get("playerId"));
  const playerName=text(url.searchParams.get("playerName"));
  if(season<FIRST_PLAYER_SEASON||season>currentCollegeFootballSeason()||!team||(!playerId&&!playerName)){
    return json({status:"invalid",games:[],message:"Choose one season, team and player."},400);
  }

  const teamRecord=await runtime.DB.prepare("SELECT team FROM cfb_teams WHERE season=? AND team=?").bind(season,team).first();
  if(!teamRecord)return json({status:"invalid",games:[],message:"The selected team is not in this season."},400);

  try{
    const numericPlayerId=Number(playerId);
    const [directoryResult,boxPayload,ppaPayload,successPayload]=await Promise.all([
      runtime.DB.prepare(`SELECT game.game_id AS gameId,game.week,game.season_type AS seasonType,game.start_date AS startDate,
          CASE WHEN game.home_team=? THEN game.away_team ELSE game.home_team END AS opponent,
          opponent.abbreviation AS opponentAbbreviation,opponent.logo AS opponentLogo
        FROM cfb_games game
        LEFT JOIN cfb_teams opponent ON opponent.season=game.season
          AND opponent.team=CASE WHEN game.home_team=? THEN game.away_team ELSE game.home_team END
        WHERE game.season=? AND (game.home_team=? OR game.away_team=?)
        ORDER BY game.start_date,game.week,game.game_id`).bind(team,team,season,team,team).all<GameDirectoryRow>(),
      cfbd("/games/players",runtime.CFBD_API_KEY,{year:season,team,classification:"fbs"}),
      optionalCfbd("/ppa/players/games",runtime.CFBD_API_KEY,{year:season,team,playerId:playerId||undefined,threshold:0,excludeGarbageTime:"true"}),
      optionalCfbd("/stats/player/success/game",runtime.CFBD_API_KEY,{year:season,team,playerId:Number.isFinite(numericPlayerId)?numericPlayerId:undefined,threshold:0,excludeGarbageTime:"true"}),
    ]);
    const directory=new Map(directoryResult.results.map((row)=>[text(row.gameId),row]));
    const ppa=playerWeeklyPpaGames(ppaPayload,playerId,playerName);
    const success=playerWeeklySuccessGames(successPayload,playerId,playerName);
    const games=playerWeeklyBoxGames(boxPayload,team,playerId,playerName).flatMap((box)=>{
      const game=directory.get(box.gameId);
      if(!game)return[];
      const week=finite(game.week)??0;
      const opponent=text(game.opponent)||box.opponent;
      const advancedPpa=advancedForGame(ppa,week,opponent);
      const advancedSuccess=advancedForGame(success,week,opponent);
      const metrics:PlayerWeeklyMetricMap={...box.metrics,...advancedPpa?.metrics,...advancedSuccess?.metrics};
      const compactMetrics=Object.fromEntries(Object.entries(metrics).filter(([,value])=>typeof value==="number"&&Number.isFinite(value)));
      return[{
        gameId:box.gameId,week,seasonType:text(game.seasonType)||"regular",date:text(game.startDate),opponent,
        opponentAbbreviation:text(game.opponentAbbreviation)||opponent.slice(0,4).toUpperCase(),
        opponentLogo:text(game.opponentLogo),metrics:compactMetrics,
      }];
    }).sort(comparePlayerWeeklyGames);
    const response=json({status:"ready",season,team,player:{id:playerId,name:playerName},games},200,"public, max-age=3600, stale-while-revalidate=86400");
    response.headers.set("x-harper-player-weekly-source","cfbd-game-box-plus-advanced");
    return response;
  }catch(error){
    if(error instanceof CollegeFootballDataError){
      const response=json({status:"error",season,team,games:[],message:"Weekly player data is temporarily unavailable."},error.status===429?429:502);
      if(error.retryAfterSeconds>0)response.headers.set("retry-after",String(error.retryAfterSeconds));
      return response;
    }
    return json({status:"error",season,team,games:[],message:error instanceof Error?error.message:"Weekly player data is temporarily unavailable."},500);
  }
}
