import {cfbd,CollegeFootballDataError,currentCollegeFootballSeason,type PipelineEnv} from "../../../lib/dataPipeline";
import {aggregateSpiderPlays,createSpiderAggregator} from "../../../lib/spiderMetrics";
import {playerBasicMetric,type PlayerProfile} from "../../../lib/playerModel";

type Runtime=PipelineEnv&{DB?:D1Database};
type SpiderPlay=Parameters<typeof aggregateSpiderPlays>[0][number];
const asArray=(value:unknown):SpiderPlay[]=>Array.isArray(value)?value as SpiderPlay[]:[];
type SeasonRow={playerId?:string;id?:string;player?:string;name?:string;team?:string;attempts?:number;successRate?:number;ppa?:number;totalYards?:number;totalRushingYards?:number;completions?:number;interceptions?:number;sacks?:number;kneels?:number;totalPpa?:number;averagePPA?:{rush?:number;pass?:number;all?:number;firstDown?:number;secondDown?:number;thirdDown?:number}};
const number=(value:unknown)=>typeof value==="number"&&Number.isFinite(value)?value:null;
async function aggregateArchive(season:number,key:string,db:D1Database){
  const [passRaw,rushRaw,ppaRaw]=await Promise.all([
    cfbd("/passing/players/season",key,{year:season,classification:"fbs"}),
    cfbd("/rushing/players/season",key,{year:season,classification:"fbs"}),
    cfbd("/ppa/players/season",key,{year:season,position:"QB",threshold:0}),
  ]);
  const rows=(value:unknown):SeasonRow[]=>Array.isArray(value)?value as SeasonRow[]:[];
  const rushing=new Map(rows(rushRaw).map(row=>[`${row.team}:${row.playerId}`,row]));
  const ppa=new Map(rows(ppaRaw).map(row=>[`${row.team}:${row.id}`,row]));
  if(!rows(passRaw).length){
    const profiles=await db.prepare("SELECT team,profile_json AS profileJson FROM player_team_profiles WHERE season=? AND profile_json<>'{}'").bind(season).all<{team:string;profileJson:string}>();
    return profiles.results.flatMap(profile=>{
      let parsed:{players?:PlayerProfile[]};try{parsed=JSON.parse(profile.profileJson);}catch{return [];}
      return (parsed.players??[]).flatMap(player=>{
        if(player.position!=="QB")return[];
        const attempts=playerBasicMetric(player,"passAttempts")??0;
        if(attempts<100)return[];
        const passYards=playerBasicMetric(player,"passYards"),rushYards=playerBasicMetric(player,"rushYards");
        const completions=playerBasicMetric(player,"passCompletions"),interceptions=playerBasicMetric(player,"interceptions");
        const rushAttempts=playerBasicMetric(player,"rushAttempts")??0;
        const value=ppa.get(`${profile.team}:${player.id}`)?.averagePPA;
        const passSuccess=number(player.advanced?.passingSuccessRate),rushSuccess=number(player.advanced?.rushingSuccessRate);
        const successRate=passSuccess===null?null:(passSuccess*attempts+(rushSuccess??0)*rushAttempts)/(attempts+(rushSuccess===null?0:rushAttempts));
        return[{id:player.id,name:player.displayName,team:profile.team,season,attempts,metrics:{successRate,turnoverEpa:null,sackRate:null,
          rushEpa:number(player.advanced?.rushPpa),passEpa:number(player.advanced?.passPpa),lateDownEpa:number(value?.thirdDown),earlyDownEpa:null,explosiveRate:null,
          epaPlay:number(value?.all)??number(player.advanced?.averagePpa),passSuccess,rushSuccess,
          ypa:passYards===null?null:passYards/attempts,ypc:rushYards===null||!rushAttempts?null:rushYards/rushAttempts,
          completionRate:completions===null?null:completions/attempts,interceptionRate:interceptions===null?null:interceptions/attempts,
          passingYards:passYards,rushingYards:rushYards}}];
      });
    });
  }
  return rows(passRaw).filter(row=>(row.attempts??0)>=100&&row.playerId&&row.team).map(pass=>{
    const id=String(pass.playerId),team=String(pass.team),rush=rushing.get(`${team}:${id}`),value=ppa.get(`${team}:${id}`)?.averagePPA;
    const attempts=pass.attempts??0,rushAttempts=Math.max(0,(rush?.attempts??0)-(rush?.sacks??0)-(rush?.kneels??0));
    const passSuccess=number(pass.successRate),rushSuccess=number(rush?.successRate);
    const successRate=passSuccess===null?null:(passSuccess*attempts+(rushSuccess??0)*rushAttempts)/(attempts+(rushSuccess===null?0:rushAttempts));
    const passEpa=number(pass.ppa),rushEpa=number(rush?.ppa);
    return{id,name:pass.player??id,team,season,attempts,metrics:{
      successRate,turnoverEpa:null,sackRate:(rush?.sacks??0)/(attempts+(rush?.sacks??0)),rushEpa,passEpa,
      lateDownEpa:number(value?.thirdDown),earlyDownEpa:null,explosiveRate:null,epaPlay:number(value?.all),
      passSuccess,rushSuccess,ypa:number(pass.totalYards)===null?null:(pass.totalYards??0)/attempts,
      ypc:rushAttempts&&number(rush?.totalRushingYards)!==null?(rush!.totalRushingYards??0)/rushAttempts:null,
      completionRate:(pass.completions??0)/attempts,interceptionRate:(pass.interceptions??0)/attempts,
      passingYards:number(pass.totalYards),rushingYards:number(rush?.totalRushingYards),
    }};
  });
}
export async function GET(request:Request){
  const {env}=await import("cloudflare:workers");
  const runtime=env as unknown as Runtime;
  const season=Number(new URL(request.url).searchParams.get("season"));
  if(!Number.isInteger(season)||season<2014||season>currentCollegeFootballSeason())return Response.json({status:"invalid",message:"Select a season from 2014 onward."},{status:400});
  if(!runtime.DB||!runtime.CFBD_API_KEY)return Response.json({status:"unavailable",message:"Player play data is unavailable."},{status:503});
  const cacheKey=new Request(`https://harpercfbmodel.com/api/player-spider?season=${season}&schema=3`);
  const cache=typeof caches!=="undefined"?(caches as unknown as {default?:Cache}).default:null;
  const cached=await cache?.match(cacheKey).catch(()=>undefined);
  if(cached)return cached;
  try{
    const [weekRow,teamRows]=await Promise.all([
      runtime.DB.prepare("SELECT MAX(week) AS week FROM cfb_games WHERE season=? AND completed=1").bind(season).first<{week:number|null}>(),
      runtime.DB.prepare("SELECT team,color,alt_color AS altColor,logo FROM cfb_teams WHERE season=?").bind(season).all<{team:string;color:string;altColor:string;logo:string}>(),
    ]);
    const maxWeek=Math.min(19,Math.max(0,Number(weekRow?.week??0)));
    if(!maxWeek)return Response.json({status:"building",message:`${season} games are not available yet.`,players:[]},{status:202});
    {
      const teamMap=new Map((teamRows.results as {team:string;color:string;altColor:string;logo:string}[]).map(team=>[team.team,team]));
      const players=(await aggregateArchive(season,runtime.CFBD_API_KEY,runtime.DB)).filter(player=>teamMap.has(player.team)).map(player=>({...player,...teamMap.get(player.team)}));
      const response=Response.json({status:"ready",season,cohortSize:players.length,coverage:"season-aggregate",players},{headers:{"cache-control":players.length?"public, max-age=86400, s-maxage=604800":"no-store"}});
      if(players.length)await cache?.put(cacheKey,response.clone()).catch(()=>undefined);
      return response;
    }
  }catch(error){
    const limited=error instanceof CollegeFootballDataError&&error.status===429;
    const response=Response.json({status:"error",message:limited?"CFBD rate limit reached. Try again shortly.":"QB play data could not be loaded. Try again."},{status:limited?429:502});
    if(limited&&error instanceof CollegeFootballDataError&&error.retryAfterSeconds)response.headers.set("retry-after",String(error.retryAfterSeconds));
    return response;
  }
}
