import {visualizationCacheControl} from "../../../lib/visualizationFreshness";
import {visualizationStatus} from "../../../lib/visualizationStatus";
import { aggregateEpaSuccessRates } from "../../../lib/epaSuccessRate";
import { cfbd, currentCollegeFootballSeason, type PipelineEnv } from "../../../lib/dataPipeline";
import { NET_GAME_METRICS, buildNetSuccessReport, buildSeasonNetReport, type NetGameMetric, type NetSuccessGame } from "../../../lib/netSuccessRate";
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const season = Number(query.get("season")), seasonAverage=query.get("week")==="all", week = seasonAverage?-1:Number(query.get("week"));
  const seasonType = query.get("seasonType") ?? "regular";
  const metric=query.get("metric")??"successRate";
  if (!query.has("season") || !query.has("week") || !Number.isInteger(season) || season < 2014 || season > currentCollegeFootballSeason()
    || !NET_GAME_METRICS.some(item=>item.key===metric) || (!seasonAverage && (!Number.isInteger(week) || week < 0 || week > 20)) || !["regular", "postseason"].includes(seasonType)) {
    return Response.json({ message: "Choose a year from 2014 onward and a valid week." }, { status: 400 });
  }
  try {
    const { env: runtime } = await import("cloudflare:workers");
    const env = runtime as unknown as PipelineEnv;
    if (!env.DB) return Response.json({ message: "Success-rate data is unavailable." }, { status: 503 });
    const cache=(globalThis.caches as unknown as {default?:Cache}|undefined)?.default;
    const stamp=metric==="epaSuccessRate"?await env.DB.prepare("SELECT COUNT(*) AS n,MAX(updated_at) AS changed FROM cfb_games WHERE season=? AND completed=1").bind(season).first<{n:number;changed:string}>():null;
    const cacheKey=new Request(`https://harpercfbmodel.com/api/net-success-rate?season=${season}&week=${seasonAverage?"all":week}&seasonType=${seasonType}&metric=epaSuccessRate&schema=3&results=${stamp?.n??0}&updated=${encodeURIComponent(stamp?.changed??"")}`);
    if(metric==="epaSuccessRate"){const cached=await cache?.match(cacheKey).catch(()=>undefined);if(cached){const response=new Response(cached.body,cached);response.headers.set("cache-control",visualizationCacheControl(season===currentCollegeFootballSeason()));return response;}}
    const [teams, games, weeks] = await Promise.all([
      env.DB.prepare("SELECT team FROM cfb_teams WHERE season=?").bind(season).all<{ team: string }>(),
      env.DB.prepare(`SELECT g.game_id AS gameId,g.season,g.week,COALESCE(g.season_type,'regular') AS seasonType,g.completed,
        g.home_team AS homeTeam,g.away_team AS awayTeam,g.home_points AS homePoints,g.away_points AS awayPoints,
        CAST(json_extract(ha.component_json,'$.offSuccessRate') AS REAL) AS homeSuccessRate,
        CAST(json_extract(aa.component_json,'$.offSuccessRate') AS REAL) AS awaySuccessRate,
        json_object('points',g.home_points,'totalYards',hs.total_yards,'ypp',hs.yards_per_play,'passYards',hs.pass_yards,'rushYards',hs.rush_yards,'passAttempts',hs.pass_attempts,'rushAttempts',hs.rush_attempts,'passCompletions',hs.pass_completions,'completionRate',CASE WHEN hs.pass_attempts>0 THEN hs.pass_completions*1.0/hs.pass_attempts END,'ypa',CASE WHEN hs.pass_attempts>0 THEN hs.yards_per_pass END,'ypc',CASE WHEN hs.rush_attempts>0 THEN hs.yards_per_rush END,'turnovers',hs.turnovers,'sacksAllowed',hs.sacks_allowed,'sackYardsLost',hs.sack_yards_lost) AS homeBasicJson,json_object('points',g.away_points,'totalYards',ast.total_yards,'ypp',ast.yards_per_play,'passYards',ast.pass_yards,'rushYards',ast.rush_yards,'passAttempts',ast.pass_attempts,'rushAttempts',ast.rush_attempts,'passCompletions',ast.pass_completions,'completionRate',CASE WHEN ast.pass_attempts>0 THEN ast.pass_completions*1.0/ast.pass_attempts END,'ypa',CASE WHEN ast.pass_attempts>0 THEN ast.yards_per_pass END,'ypc',CASE WHEN ast.rush_attempts>0 THEN ast.yards_per_rush END,'turnovers',ast.turnovers,'sacksAllowed',ast.sacks_allowed,'sackYardsLost',ast.sack_yards_lost) AS awayBasicJson,ha.component_json AS homeAdvancedJson,aa.component_json AS awayAdvancedJson,
        ht.logo AS homeLogo,at.logo AS awayLogo,ht.color AS homeColor,at.color AS awayColor,ht.conference AS homeConference,at.conference AS awayConference
        FROM cfb_games g
        LEFT JOIN team_game_stats hs ON hs.game_id=g.game_id AND hs.team=g.home_team AND hs.season=g.season
        LEFT JOIN team_game_stats ast ON ast.game_id=g.game_id AND ast.team=g.away_team AND ast.season=g.season
        JOIN cfb_teams ht ON ht.season=g.season AND ht.team=g.home_team
        JOIN cfb_teams at ON at.season=g.season AND at.team=g.away_team
        LEFT JOIN team_game_advanced_stats ha ON ha.game_id=g.game_id AND ha.team=g.home_team AND ha.season=g.season
        LEFT JOIN team_game_advanced_stats aa ON aa.game_id=g.game_id AND aa.team=g.away_team AND aa.season=g.season
        WHERE g.season=? AND (?=1 OR g.week=?) AND COALESCE(g.season_type,'regular')=? AND g.completed=1`)
        .bind(season,seasonAverage?1:0,week,seasonType).all<NetSuccessGame & {homeBasicJson:string;awayBasicJson:string;homeAdvancedJson:string|null;awayAdvancedJson:string|null}>(),
      env.DB.prepare("SELECT DISTINCT week FROM cfb_games WHERE season=? AND COALESCE(season_type,'regular')=? ORDER BY week")
        .bind(season,seasonType).all<{ week: number }>(),
    ]);
    const parse=(json:string|null)=>{try{return JSON.parse(json??"{}");}catch{return {};}};
    const values=(basicJson:string,advancedJson:string|null)=>{
      const basic=parse(basicJson),advanced=parse(advancedJson);
      return Object.fromEntries(NET_GAME_METRICS.map(item=>{const value=(item.source==="basic"?basic:advanced)[item.field];return [item.key,typeof value==="number"&&Number.isFinite(value)?value:null];}));
    };
    let epa=new Map<string,number>();
    if(metric==="epaSuccessRate"){
      if(!env.CFBD_API_KEY)return Response.json({message:"EPA play data is unavailable."},{status:503});
      if(seasonAverage){
        const completedWeeks=[...new Set(games.results.map(game=>game.week))];
        let cursor=0;
        async function loadWeek(){while(cursor<completedWeeks.length){const currentWeek=completedWeeks[cursor++];const plays=await cfbd("/plays",env.CFBD_API_KEY!,{year:season,week:currentWeek,seasonType,classification:"fbs"});for(const [key,value] of aggregateEpaSuccessRates(plays))epa.set(key,value);}}
        await Promise.all(Array.from({length:Math.min(3,completedWeeks.length)},()=>loadWeek()));
      }else{
        const plays=await cfbd("/plays",env.CFBD_API_KEY,{year:season,week,seasonType,classification:"fbs"});
        epa=aggregateEpaSuccessRates(plays);
      }
    }
    const gameValues=(gameId:string,team:string,basic:string,advanced:string|null)=>({...values(basic,advanced),epaSuccessRate:epa.get(`${gameId}\u0000${team}`)??null});
    const prepared=games.results.map((game: NetSuccessGame & {homeBasicJson:string;awayBasicJson:string;homeAdvancedJson:string|null;awayAdvancedJson:string|null}) => ({ ...game, completed: Boolean(game.completed),homeValues:gameValues(game.gameId,game.homeTeam,game.homeBasicJson,game.homeAdvancedJson),awayValues:gameValues(game.gameId,game.awayTeam,game.awayBasicJson,game.awayAdvancedJson) }));
    const fbsTeams=new Set(teams.results.map((team:{team:string}) => team.team));
    const report=seasonAverage?buildSeasonNetReport(prepared,fbsTeams,season,seasonType,metric as NetGameMetric):buildNetSuccessReport(prepared,fbsTeams,season,week,seasonType,metric as NetGameMetric);
    const response=Response.json({ ...report, metric, weeks: weeks.results.map((row:{week:number}) => row.week), freshness:await visualizationStatus(env.DB,season), source: metric==="epaSuccessRate"?"CFBD per-play PPA > 0":"CFBD advanced game stats" }, { headers: { "cache-control": visualizationCacheControl(season===currentCollegeFootballSeason()) } });
    if(metric==="epaSuccessRate"&&report.rows.length){response.headers.set("cache-control","public, max-age=21600");await cache?.put(cacheKey,response.clone()).catch(()=>undefined);response.headers.set("cache-control",visualizationCacheControl(season===currentCollegeFootballSeason()));}
    return response;
  } catch {
    return Response.json({ message: "Success-rate data could not be loaded. Try again shortly." }, { status: 503 });
  }
}
