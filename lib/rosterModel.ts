import type { PlayerProfile, TeamPlayerModel } from "./playerModel";
import type { PublishedDepthChart } from "./publishedDepthCharts";

export const ROSTER_MODEL_VERSION = "roster-v1";
export const ROSTER_UNITS = ["QB", "REC", "RB", "OL", "DL", "LB", "DB"] as const;
export type RosterUnit = typeof ROSTER_UNITS[number];
export type RosterUnitProjection = {
  unit: RosterUnit; continuity: number | null; qualityChange: number; uncertainty: number;
  coverage: number; incomingShare: number; adjustment: number; players: number;
  evidence: "prior-season-production" | "lineup-continuity-only" | "unavailable";
};
export type QuarterbackScenario = { player: string; probability: number; quality: number; reliability: number; passingLogDelta: number };
export type RosterProjection = {
  version: string; team: string; season: number; publishedAt: string; availableFromWeek: number;
  sourceUrl: string; units: Record<RosterUnit, RosterUnitProjection>;
  sourceKind?: string;
  offense: { overall: number; passing: number; rushing: number; uncertainty: number };
  defense: { overall: number; passing: number; rushing: number; uncertainty: number };
  quarterbacks: QuarterbackScenario[]; coverage: number;
  coaching: "unknown" | "stable" | "changed";
  limitations: string[];
};
const clamp = (n: number, a=0, b=1) => Math.max(a, Math.min(b, n));
const average = (x: number[]) => x.reduce((a,b)=>a+b,0)/Math.max(1,x.length);
const nameKey = (name: string) => String(name??"").toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b/g, "").replace(/[^a-z]/g, "");
export function rosterUnit(position: string): RosterUnit | null {
  const p=String(position??"").toUpperCase();
  if(p==="QB") return "QB";
  if(["WR","TE","REC"].includes(p)) return "REC";
  if(["RB","FB","HB"].includes(p)) return "RB";
  if(["OL","OT","OG","C","LT","LG","RG","RT","G","T"].includes(p)) return "OL";
  if(["DL","DE","DT","NT","EDGE"].includes(p)) return "DL";
  if(["LB","ILB","OLB","MLB"].includes(p)) return "LB";
  if(["DB","CB","S","SS","FS","NB","SAF"].includes(p)) return "DB";
  return null;
}
function stat(p: PlayerProfile, category: string, names: string[]) {
  return p.stats?.filter(s=>s.category.toLowerCase()===category && names.includes(s.label.toUpperCase())).reduce((a,s)=>Math.max(a,Number(s.numericValue)||0),0)??0;
}
export function playerWorkload(p: PlayerProfile, unit: RosterUnit) {
  if(unit==="QB") return stat(p,"passing",["ATT"]);
  if(unit==="REC") return stat(p,"receiving",["REC","TARGETS"]);
  if(unit==="RB") return stat(p,"rushing",["CAR","ATT"]);
  if(unit==="OL") return 0; // Never fabricate snaps from roster presence.
  return stat(p,"defensive",["TOT","SOLO","TACKLES"]);
}
export type PriorPlayerEvidence = { player: PlayerProfile; season: number; quality: number; reliability: number };
/** Normalize within position; ratings only use seasons preceding the target season. */
export function priorPlayerEvidence(models: TeamPlayerModel[], season: number): PriorPlayerEvidence[] {
  const rows=models.filter(m=>m.season<season && m.season>=season-3).flatMap(m=>m.players.map(player=>({player,season:m.season})));
  const pools=new Map<string,number[]>();
  for(const r of rows) {
    const unit=rosterUnit(r.player.position); const score=r.player.productionScore;
    if(!unit || !Number.isFinite(score) || playerWorkload(r.player,unit)<=0) continue;
    const key=`${r.season}:${unit}`; const pool=pools.get(key)??[]; pool.push(Number(score));pools.set(key,pool);
  }
  return rows.map(r=>{
    const unit=rosterUnit(r.player.position); const sample=unit?playerWorkload(r.player,unit):0;
    const reliability=sample/(sample+(unit==="QB"?150:unit==="REC"?35:unit==="RB"?80:40))*Math.pow(0.8,season-1-r.season);
    const pool=unit?pools.get(`${r.season}:${unit}`)??[]:[];
    const score=r.player.productionScore;
    const observed=Number.isFinite(score)&&pool.length>=10&&sample>0;
    const production=observed?2*(pool.filter(n=>n<Number(score)).length+0.5*pool.filter(n=>n===Number(score)).length)/pool.length-1:0;
    // Recruiting is weak fallback evidence, not an extra transfer/class bonus.
    const talent=r.player.highSchoolRating;
    const fallback=Number.isFinite(talent)?clamp((Number(talent)-0.85)/0.15,-1,1)*0.2:0;
    return {...r,quality:reliability*production+(1-reliability)*fallback,reliability:observed?reliability:0};
  });
}
export function projectRoster(chart: PublishedDepthChart, evidence: PriorPlayerEvidence[], previous: TeamPlayerModel | null, availableFromWeek: number): RosterProjection {
  const eligible=evidence.filter(r=>r.season<chart.season).sort((a,b)=>b.season-a.season);
  const byName=new Map<string,PriorPlayerEvidence[]>();
  for(const r of eligible) {const key=nameKey(r.player.displayName);const list=byName.get(key)??[];list.push(r);byName.set(key,list);}
  const match=(name:string,unit:RosterUnit)=>{
    const candidates=(byName.get(nameKey(name))??[]).filter(r=>rosterUnit(r.player.position)===unit);
    const ids=new Set(candidates.map(r=>r.player.id));
    return ids.size===1?candidates[0]:undefined; // Ambiguous names remain unknown.
  };
  const byId=new Map(eligible.map(r=>[`${r.season}:${r.player.team}:${r.player.id}`,r]));
  const units={} as Record<RosterUnit,RosterUnitProjection>;
  let quarterbacks:QuarterbackScenario[]=[];
  for(const unit of ROSTER_UNITS) {
    const entries=chart.entries.filter(e=>rosterUnit(e.position)===unit && e.depth<=2);
    const unique=[...new Map(entries.map(e=>[nameKey(e.player),e])).values()];
    const firstAvailable=Math.min(...unique.filter(e=>(e.availabilityProbability??1)>0).map(e=>e.depth));
    const weights:number[]=unique.map(e=>(unit==="QB" ? e.starterProbability??(e.depth===firstAvailable?1:0) : e.expectedSnapShare??(e.depth===firstAvailable?1:0.2))*(e.availabilityProbability??1));
    const denominator=weights.reduce((a,b)=>a+b,0);
    const priorPlayers=previous?.players.filter(p=>rosterUnit(p.position)===unit)??[];
    const baselineRows=priorPlayers.map(p=>({p,e:byId.get(`${chart.season-1}:${chart.team}:${p.id}`),weight:playerWorkload(p,unit)}));
    const workload=baselineRows.reduce((a,r)=>a+r.weight,0);
    const baseline=workload?baselineRows.reduce((a,r)=>a+r.weight*(r.e?.quality??0),0)/workload:0;
    const matched=unique.map(e=>match(e.player,unit));
    const weighted=(fn:(i:number)=>number)=>denominator?weights.reduce((a,w,i)=>a+w*fn(i),0)/denominator:0;
    const quality=weighted(i=>matched[i]?.quality??0);
    const coverage=weighted(i=>matched[i]?1:0);
    const reliability=weighted(i=>matched[i]?.reliability??0);
    const priorIds=new Set(priorPlayers.map(p=>p.id));
    const continuity=previous&&denominator?weighted(i=>matched[i]&&priorIds.has(matched[i]!.player.id)?1:0):null;
    const incomingShare=weighted(i=>matched[i]&&matched[i]!.player.team!==chart.team?1:0);
    const coachingChanged=chart.coachingContinuity?.[["QB","REC","RB","OL"].includes(unit)?"offense":"defense"]===false;
    const uncertainty=denominator?clamp(0.5*(1-reliability)+0.3*(1-(continuity??0.5))+0.2*(1-coverage)+(coachingChanged?0.15:0)):1;
    // No measured baseline means no estimated gain/loss, especially for OL.
    const qualityChange=workload>0&&coverage>0?quality-baseline:0;
    const adjustment=clamp(qualityChange*(unit==="QB"?0.16:0.10)*coverage,-0.16,0.16);
    units[unit]={unit,continuity,qualityChange,uncertainty,coverage,incomingShare,adjustment,players:unique.length,evidence:reliability>0?"prior-season-production":continuity!==null?"lineup-continuity-only":"unavailable"};
    if(unit==="QB"&&denominator) quarterbacks=unique.flatMap((e,i)=>weights[i]? [{player:e.player,probability:weights[i]/denominator,quality:matched[i]?.quality??0,reliability:matched[i]?.reliability??0,passingLogDelta:0.16*((matched[i]?.quality??0)-quality)*coverage}]:[]);
  }
  const a=(u:RosterUnit)=>units[u].adjustment;
  const passing=0.65*a("QB")+0.25*a("REC")+0.10*a("OL");
  const rushing=0.4*a("RB")+0.45*a("OL")+0.15*a("QB");
  const passDefense=0.65*a("DB")+0.25*a("DL")+0.10*a("LB");
  const rushDefense=0.6*a("DL")+0.3*a("LB")+0.10*a("DB");
  return {version:ROSTER_MODEL_VERSION,team:chart.team,season:chart.season,publishedAt:chart.publishedAt,availableFromWeek,sourceUrl:chart.sourceUrl,sourceKind:chart.sourceKind,units,quarterbacks,
    offense:{overall:0.6*passing+0.4*rushing,passing,rushing,uncertainty:average([units.QB.uncertainty,units.REC.uncertainty,units.RB.uncertainty,units.OL.uncertainty])},
    defense:{overall:0.6*passDefense+0.4*rushDefense,passing:passDefense,rushing:rushDefense,uncertainty:average([units.DL.uncertainty,units.LB.uncertainty,units.DB.uncertainty])},
    coverage:average(ROSTER_UNITS.map(u=>units[u].coverage)),coaching:chart.coachingContinuity?(chart.coachingContinuity.offense&&chart.coachingContinuity.defense?"stable":"changed"):"unknown",
    limitations:["Depth weights are projected roles, not measured snap shares.","OL contribution is unadjusted without individual participation/quality evidence.","Coaching and availability changes require dated source evidence.","Roster coefficients are provisional pending sufficient chronological holdout coverage."]};
}
export function rosterAtWeek(timeline: RosterProjection[]|undefined, week: number) {
  return timeline?.filter(r=>r.availableFromWeek<=week+1).sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt))[0];
}
export function rosterPriorWeight(base: number, uncertainty: number|undefined) {
  return uncertainty===undefined?base:base*(1.35-0.85*clamp(uncertainty));
}

/** Unit changes enter efficiency once; the score margin receives no separate portal bonus. */
export function rosterMetricDelta(roster:RosterProjection|undefined, prior:RosterProjection|undefined, side:"offense"|"defense", metric:string) {
  const key=/pass|completion|havoc|thirdDown/i.test(metric)?"passing":/rush|lineYards|LevelYards|FieldYards|stuff|powerSuccess/i.test(metric)?"rushing":"overall";
  const difference=(roster?.[side][key]??0)-(prior?.[side][key]??0);
  return side==="defense"?-difference:difference;
}
