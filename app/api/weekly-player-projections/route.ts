import { currentCollegeFootballSeason, type PipelineEnv } from "../../../lib/dataPipeline";
import { playerBasicMetric, type PlayerProfile } from "../../../lib/playerModel";

export async function GET(request:Request){
  const params=new URL(request.url).searchParams;
  const season=Number(params.get("season")),week=Number(params.get("week"));
  if(!Number.isInteger(season)||season<2014||season>currentCollegeFootballSeason()||!Number.isInteger(week)||week<0||week>16)return Response.json({message:"Invalid edition."},{status:400});
  try{
    const {env}=await import("cloudflare:workers");
    const db=(env as unknown as PipelineEnv).DB;
    if(!db)return Response.json({message:"Player projections unavailable."},{status:503});
    const scheduled=await db.prepare("SELECT home_team AS homeTeam,away_team AS awayTeam FROM cfb_games WHERE season=? AND week=? AND COALESCE(season_type,'regular')='regular' AND completed=0")
      .bind(season,week).all<{homeTeam:string;awayTeam:string}>();
    const latest=await db.prepare("SELECT MAX(week) AS lastCompletedWeek FROM cfb_games WHERE season=? AND completed=1 AND COALESCE(season_type,'regular')='regular'")
      .bind(season).first<{lastCompletedWeek:number|null}>();
    // Season profiles are cumulative. Never use them to backfill an earlier week.
    if(latest?.lastCompletedWeek!==null&&latest?.lastCompletedWeek!==undefined&&week<=latest.lastCompletedWeek)return Response.json({teams:[]});
    const teams=[...new Set((scheduled.results as {homeTeam:string;awayTeam:string}[]).flatMap(game=>[game.homeTeam,game.awayTeam]))];
    if(!teams.length)return Response.json({teams:[]});
    const [profiles,completed]=await Promise.all([
      db.prepare(`SELECT profile.team,profile.profile_json AS profileJson,team.color FROM player_team_profiles profile LEFT JOIN cfb_teams team ON team.season=profile.season AND team.team=profile.team WHERE profile.season=? AND profile.team IN (${teams.map(()=>"?").join(",")})`)
        .bind(season,...teams).all<{team:string;profileJson:string;color:string|null}>(),
      db.prepare("SELECT home_team AS homeTeam,away_team AS awayTeam FROM cfb_games WHERE season=? AND week<? AND completed=1 AND COALESCE(season_type,'regular')='regular'")
        .bind(season,week).all<{homeTeam:string;awayTeam:string}>(),
    ]);
    const games=new Map<string,number>();
    for(const game of completed.results)for(const team of [game.homeTeam,game.awayTeam])games.set(team,(games.get(team)??0)+1);
    const rows=(profiles.results as {team:string;profileJson:string;color:string|null}[]).map(row=>{
      let players:PlayerProfile[]=[];
      try{players=(JSON.parse(row.profileJson)?.players??[]) as PlayerProfile[];}catch{/* No profile. */}
      return {team:row.team,color:row.color,games:games.get(row.team)??0,players:players.filter(player=>["QB","RB","WR","TE"].includes(player.position)&&player.displayName).map(player=>({
        id:player.id,name:player.displayName,position:player.position,
        metrics:{passAttempts:playerBasicMetric(player,"passAttempts"),passCompletions:playerBasicMetric(player,"passCompletions"),passYards:playerBasicMetric(player,"passYards"),passTd:playerBasicMetric(player,"passTd"),passInterceptions:playerBasicMetric(player,"interceptions"),rushAttempts:playerBasicMetric(player,"rushAttempts"),rushYards:playerBasicMetric(player,"rushYards"),rushTd:playerBasicMetric(player,"rushTd"),receptions:playerBasicMetric(player,"receptions"),receivingYards:playerBasicMetric(player,"receivingYards"),receivingTd:playerBasicMetric(player,"receivingTd")},
      }))};
    });
    return Response.json({teams:rows},{headers:{"cache-control":"public, max-age=900"}});
  }catch{return Response.json({message:"Player projections unavailable."},{status:503});}
}
