import { cfbd, currentCollegeFootballSeason, type PipelineEnv } from "../../../lib/dataPipeline";
import { playerGameBoxLines } from "../../../lib/playerWeekly";

export async function GET(request:Request){
  const {env}=await import("cloudflare:workers");
  const runtime=env as unknown as PipelineEnv&{DB?:D1Database};
  const params=new URL(request.url).searchParams;
  const season=Number(params.get("season")),week=Number(params.get("week"));
  if(!Number.isInteger(season)||season<2014||season>currentCollegeFootballSeason()||!Number.isInteger(week)||week<0||week>16)return Response.json({message:"Invalid edition."},{status:400});
  if(!runtime.DB||!runtime.CFBD_API_KEY)return Response.json({message:"Player data unavailable."},{status:503});
  try{
    const directory=await runtime.DB.prepare("SELECT game_id AS gameId,home_team AS homeTeam,away_team AS awayTeam FROM cfb_games WHERE season=? AND week=? AND season_type<>'postseason' AND completed=1").bind(season,week).all<{gameId:string;homeTeam:string;awayTeam:string}>();
    const games=directory.results as Array<{gameId:string;homeTeam:string;awayTeam:string}>;
    const ids=new Set(games.map(row=>String(row.gameId)));
    const names=new Set<string>(games.flatMap(row=>[row.homeTeam,row.awayTeam]));
    const [payload,colors,roster]=await Promise.all([
      cfbd("/games/players",runtime.CFBD_API_KEY,{year:season,week,seasonType:"regular"}),
      runtime.DB.prepare("SELECT team,color,alt_color AS altColor FROM cfb_teams WHERE season=?").bind(season).all<{team:string;color:string|null;altColor:string|null}>(),
      names.size?runtime.DB.prepare(`SELECT profile.team,CAST(json_extract(player.value,'$.id') AS TEXT) AS playerId,
        COALESCE(NULLIF(json_extract(player.value,'$.displayName'),''),NULLIF(json_extract(player.value,'$.name'),''),TRIM(COALESCE(json_extract(player.value,'$.firstName'),'')||' '||COALESCE(json_extract(player.value,'$.lastName'),''))) AS playerName,
        json_extract(player.value,'$.position') AS position
        FROM player_team_profiles profile JOIN json_each(profile.roster_json) player
        WHERE profile.season=? AND profile.team IN (${[...names].map(()=>"?").join(",")})`).bind(season,...names).all<{team:string;playerId:string|null;playerName:string|null;position:string|null}>():Promise.resolve({results:[] as {team:string;playerId:string|null;playerName:string|null;position:string|null}[]}),
    ]);
    const normalized=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]/g,"");
    const positions=new Map<string,string>();
    for(const row of roster.results as Array<{team:string;playerId:string|null;playerName:string|null;position:string|null}>){const position=String(row.position??"").trim().toUpperCase();if(!position)continue;if(row.playerId)positions.set(`${row.team}:${row.playerId}`,position);if(row.playerName)positions.set(`${row.team}:name:${normalized(row.playerName)}`,position);}
    const teamColors=new Map<string,{color:string|null;altColor:string|null}>((colors.results as Array<{team:string;color:string|null;altColor:string|null}>).map(row=>[row.team,row]));
    const teams=[...names].map(team=>({team,color:teamColors.get(team)?.color??null,altColor:teamColors.get(team)?.altColor??null,game:playerGameBoxLines(payload,team).filter(line=>ids.has(line.gameId)).map(line=>({...line,position:positions.get(`${team}:${line.playerId}`)??positions.get(`${team}:name:${normalized(line.playerName)}`)??null}))}));
    return Response.json({status:"ready",teams},{headers:{"cache-control":"public, max-age=900, stale-while-revalidate=3600"}});
  }catch{
    return Response.json({message:"Weekly player performances are temporarily unavailable."},{status:502});
  }
}
