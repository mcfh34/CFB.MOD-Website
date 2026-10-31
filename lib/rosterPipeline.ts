import type { TeamPlayerModel } from "./playerModel";
import { listPublishedDepthCharts, type PublishedDepthChart } from "./publishedDepthCharts";
import { priorPlayerEvidence, projectRoster, type RosterProjection } from "./rosterModel";

/** Read-only, dated lineup evidence. Current season totals/starter flags never enter prior ratings. */
export async function loadRosterTimelines(db:D1Database, season:number):Promise<Map<string,RosterProjection[]>> {
  const [chartsResult,playersResult,gamesResult]=await Promise.all([
    db.prepare(`SELECT chart_json AS chartJson FROM depth_chart_snapshots WHERE season=? AND verification_status IN ('verified','modeled') ORDER BY published_at`).bind(season).all<{chartJson:string}>(),
    db.prepare(`SELECT p.team,json_group_array(json_object(
      'id',json_extract(j.value,'$.id'),'displayName',json_extract(j.value,'$.displayName'),
      'team',p.team,'position',json_extract(j.value,'$.position'),
      'highSchoolRating',json_extract(j.value,'$.highSchoolRating'),
      'productionScore',COALESCE(scores.score,json_extract(j.value,'$.productionScore')),
      'stats',json_extract(j.value,'$.stats')
    )) AS playersJson FROM player_team_profiles p,json_each(p.profile_json,'$.players') j
    LEFT JOIN player_production_scores scores ON scores.season=p.season AND scores.team=p.team AND scores.player_key=CAST(json_extract(j.value,'$.id') AS TEXT)
    WHERE p.season=? GROUP BY p.team`).bind(season-1).all<{team:string;playersJson:string}>(),
    db.prepare(`SELECT week,MIN(start_date) AS starts FROM cfb_games WHERE season=? AND season_type='regular' AND start_date IS NOT NULL GROUP BY week ORDER BY week`).bind(season).all<{week:number;starts:string}>(),
  ]);
  const models=playersResult.results.map(r=>({team:r.team,season:season-1,players:JSON.parse(r.playersJson)} as TeamPlayerModel));
  const evidence=priorPlayerEvidence(models,season);
  const charts:PublishedDepthChart[]=[...listPublishedDepthCharts().filter(c=>c.season===season)];
  for(const r of chartsResult.results) {try {const c=JSON.parse(r.chartJson);if(c.season===season&&Array.isArray(c.entries)) charts.push(c);}catch{/* invalid source excluded */}}
  const result=new Map<string,RosterProjection[]>();
  for(const chart of charts) {
    // Postgame gamebooks cannot establish a pregame lineup for that same week.
    // Date-only documents become available at the END of their publication day.
    const availableAt=Date.parse(chart.publishedAt.length===10?`${chart.publishedAt}T23:59:59.999Z`:chart.publishedAt);
    if(!Number.isFinite(availableAt)||availableAt>Date.now()) continue;
    const nextWeek=gamesResult.results.find(g=>Date.parse(g.starts)>availableAt);
    if(!nextWeek) continue;
    const timeline=result.get(chart.team)??[];
    if(timeline.some(r=>r.publishedAt===chart.publishedAt&&r.sourceUrl===chart.sourceUrl))continue;
    timeline.push(projectRoster(chart,evidence,models.find(m=>m.team===chart.team)??null,Number(nextWeek.week)));
    result.set(chart.team,timeline);
  }
  return result;
}

/** Capture what the existing roster model believes NOW; never backdate it into historical games. */
export async function captureCurrentRosterSnapshots(db:D1Database,season:number) {
  const now=new Date();
  if(season!==now.getUTCFullYear())return {captured:0};
  const day=now.toISOString().slice(0,10);
  const rows=await db.prepare(`SELECT team,profile_json AS profileJson FROM player_team_profiles
    WHERE season=? AND profile_json<>'{}' AND NOT EXISTS (
      SELECT 1 FROM depth_chart_snapshots d WHERE d.season=player_team_profiles.season
      AND d.team=player_team_profiles.team AND d.source_id='roster-model:'||?||':'||player_team_profiles.team||':'||?
    ) ORDER BY team`).bind(season,season,day).all<{team:string;profileJson:string}>();
  const statements=[];
  for(const row of rows.results){
    let model:TeamPlayerModel;try{model=JSON.parse(row.profileJson);}catch{continue;}
    if(!Array.isArray(model.depthChart))continue;
    const entries:PublishedDepthChart['entries']=model.depthChart.flatMap(group=>group.players.slice(0,group.starterCount*2).map((p,index)=>({
      player:p.displayName,position:p.position,side:group.side as "offense"|"defense"|"specialists",role:group.key,
      depth:index<group.starterCount?1:2,jersey:p.jersey,
    }))).filter(e=>e.side!==("other" as string));
    if(!entries.length)continue;
    const chart:PublishedDepthChart={season,team:row.team,publishedAt:now.toISOString(),sourceKind:"model_projection",label:"Dated roster-model projection; not an official depth chart",sourceUrl:`https://harpercfbmodel.com/api/players?season=${season}&team=${encodeURIComponent(row.team)}`,entries};
    statements.push(db.prepare(`INSERT OR IGNORE INTO depth_chart_snapshots
      (source_id,season,team,published_at,source_kind,source_label,source_url,chart_json,verification_status,listed_players)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(`roster-model:${season}:${row.team}:${day}`,season,row.team,chart.publishedAt,chart.sourceKind,chart.label,chart.sourceUrl,JSON.stringify(chart),"modeled",entries.length));
  }
  for(let i=0;i<statements.length;i+=20)await db.batch(statements.slice(i,i+20));
  return {captured:statements.length};
}
