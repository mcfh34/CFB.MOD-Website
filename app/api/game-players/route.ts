import {
  cfbd,
  CollegeFootballDataError,
  currentCollegeFootballSeason,
  type PipelineEnv,
} from "../../../lib/dataPipeline";
import { FIRST_PLAYER_SEASON } from "../../../lib/playerModel";
import {
  aggregatePlayerGameLines,
  comparePlayerWeeklyGames,
  playerGameBoxLines,
  type PlayerGameBoxLine,
} from "../../../lib/playerWeekly";

type RuntimeEnv=PipelineEnv&{DB?:D1Database};
type DirectoryRow={
  gameId?:unknown;week?:unknown;seasonType?:unknown;startDate?:unknown;completed?:unknown;
  homeTeam?:unknown;awayTeam?:unknown;
};
type DirectoryGame={gameId:string;week:number;seasonType:string;date:string;completed:boolean;homeTeam:string;awayTeam:string};

const text=(value:unknown)=>String(value??"").trim();
const finite=(value:unknown)=>{
  const number=Number(value);
  return Number.isFinite(number)?number:0;
};

function json(body:unknown,status=200,cacheControl="no-store"){
  const response=Response.json(body,{status});
  response.headers.set("cache-control",cacheControl);
  return response;
}

function compactLines(lines:PlayerGameBoxLine[]){
  return lines.map((line)=>({
    ...line,
    metrics:Object.fromEntries(Object.entries(line.metrics).filter(([,value])=>typeof value==="number"&&Number.isFinite(value))),
  }));
}

export async function GET(request:Request){
  const {env}=await import("cloudflare:workers");
  const runtime=env as unknown as RuntimeEnv;
  if(!runtime.DB||!runtime.CFBD_API_KEY)return json({status:"unavailable",teams:[],message:"Game player statistics are unavailable."},503);

  const url=new URL(request.url);
  const season=Math.trunc(Number(url.searchParams.get("season")));
  const gameId=text(url.searchParams.get("gameId"));
  if(season<FIRST_PLAYER_SEASON||season>currentCollegeFootballSeason()||!gameId){
    return json({status:"invalid",teams:[],message:"Choose a supported game and season."},400);
  }

  const directoryResult=await runtime.DB.prepare(`SELECT game_id AS gameId,week,season_type AS seasonType,start_date AS startDate,completed,
      home_team AS homeTeam,away_team AS awayTeam
    FROM cfb_games WHERE season=?
    ORDER BY CASE WHEN start_date IS NULL THEN 1 ELSE 0 END,start_date,season_type,week,game_id`).bind(season).all<DirectoryRow>();
  const directory:DirectoryGame[]=directoryResult.results.map((row)=>({
    gameId:text(row.gameId),week:finite(row.week),seasonType:text(row.seasonType)||"regular",date:text(row.startDate),
    completed:Boolean(row.completed),homeTeam:text(row.homeTeam),awayTeam:text(row.awayTeam),
  })).sort(comparePlayerWeeklyGames);
  const targetIndex=directory.findIndex((game)=>game.gameId===gameId);
  if(targetIndex<0)return json({status:"invalid",teams:[],message:"The selected game is not in this season."},404);
  const target=directory[targetIndex];
  const includedGameIds=new Set(directory.slice(0,targetIndex+1).filter((game)=>game.completed).map((game)=>game.gameId));
  const names=[target.awayTeam,target.homeTeam];

  try{
    const eligibleResult=await runtime.DB.prepare("SELECT team FROM cfb_teams WHERE season=? AND team IN (?,?)").bind(season,...names).all<{team:string}>();
    const eligibleTeams=new Set(eligibleResult.results.map((row)=>row.team));
    const payloads=await Promise.all(names.map((team)=>cfbd("/games/players",runtime.CFBD_API_KEY!,{year:season,team,classification:eligibleTeams.has(team)?"fbs":"fcs"})));
    const teams=names.map((team,index)=>{
      const all=playerGameBoxLines(payloads[index],team);
      const game=target.completed?all.filter((line)=>line.gameId===gameId):[];
      const seasonToDate=aggregatePlayerGameLines(all.filter((line)=>includedGameIds.has(line.gameId)));
      return{team,game:compactLines(game),seasonToDate:compactLines(seasonToDate)};
    });
    const cache=season<currentCollegeFootballSeason()?"public, max-age=86400, stale-while-revalidate=604800":"public, max-age=900, stale-while-revalidate=86400";
    const response=json({status:"ready",season,gameId,completed:target.completed,throughWeek:target.week,teams},200,cache);
    response.headers.set("x-harper-game-player-source","cfbd-game-box");
    return response;
  }catch(error){
    if(error instanceof CollegeFootballDataError){
      const response=json({status:"error",season,gameId,teams:[],message:"Game player statistics are temporarily unavailable."},error.status===429?429:502);
      if(error.retryAfterSeconds>0)response.headers.set("retry-after",String(error.retryAfterSeconds));
      return response;
    }
    return json({status:"error",season,gameId,teams:[],message:error instanceof Error?error.message:"Game player statistics are temporarily unavailable."},500);
  }
}
