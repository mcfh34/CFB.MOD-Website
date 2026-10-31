import type { UnitRanks } from './unitRankings';
export type CapsuleProfile={season:number;week:number;team:string;gamesPlayed:number;offYpp:number;offYpa:number;offYpc:number;offPatt:number;offRatt:number;defYpp:number;defYpa:number;defYpc:number;offYppIndex:number;offYpaIndex:number;offYpcIndex:number;defYppIndex:number;defYpaIndex:number;defYpcIndex:number};
export type CapsuleGame={gameId:string;week:number;seasonType:string;startDate?:string;completed:boolean|number;neutralSite:boolean|number;homeTeam:string;awayTeam:string;homePoints:number|null;awayPoints:number|null;pregameHomeScore?:number|null;pregameAwayScore?:number|null;opponentUnitRanks?:UnitRanks|null;homeActualStats?:{yardsPerPlay:number|null}|null;awayActualStats?:{yardsPerPlay:number|null}|null};
export const mean=(values:number[])=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
export function capsuleResults(team:string,week:number,games:readonly CapsuleGame[],fbs:ReadonlySet<string>){
 return games.filter(g=>g.week<=week&&Boolean(g.completed)&&g.homePoints!==null&&g.awayPoints!==null&&(g.homeTeam===team||g.awayTeam===team)).sort((a,b)=>a.week-b.week||String(a.startDate??'').localeCompare(String(b.startDate??''))).map(g=>{
  const home=g.homeTeam===team,direction=home?1:-1,opponent=home?g.awayTeam:g.homeTeam;
  const margin=direction*(g.homePoints!-g.awayPoints!);
  const expected=typeof g.pregameHomeScore==='number'&&Number.isFinite(g.pregameHomeScore)&&typeof g.pregameAwayScore==='number'&&Number.isFinite(g.pregameAwayScore)?direction*(g.pregameHomeScore-g.pregameAwayScore):null;
  const eligible=fbs.has(g.homeTeam)&&fbs.has(g.awayTeam);
  return {...g,opponent,site:g.neutralSite?'Neutral':home?'Home':'Away',margin,expected,delta:eligible&&expected!==null?margin-expected:null,eligible,offYpp:(home?g.homeActualStats:g.awayActualStats)?.yardsPerPlay??null,defYpp:(home?g.awayActualStats:g.homeActualStats)?.yardsPerPlay??null};
 });
}
export type CapsuleResult=ReturnType<typeof capsuleResults>[number];
export function capsuleForm(results:CapsuleResult[]){
 const graded=results.filter(r=>r.delta!==null),values=graded.map(r=>r.delta!);
 const avg=mean(values),recent=mean(values.slice(-3)),prior=mean(values.slice(0,-3));
 return {graded:graded.length,average:avg,recent,change:recent!==null&&prior!==null?recent-prior:null,spread:avg!==null?Math.sqrt(values.reduce((s,v)=>s+(v-avg)**2,0)/values.length):null,home:mean(graded.filter(r=>r.site==='Home').map(r=>r.delta!)),away:mean(graded.filter(r=>r.site==='Away').map(r=>r.delta!))};
}
export function capsuleOpponentSplits(results:CapsuleResult[],fieldSize:number){
 const cutoff=Math.ceil(fieldSize/3);
 return ([['passDefenseRank','Pass defense'],['rushDefenseRank','Rush defense'],['offenseRank','Overall offense']] as const).flatMap(([key,label])=>{
  const available=results.filter(r=>r.delta!==null&&typeof r.opponentUnitRanks?.[key]==='number');
  const strong=available.filter(r=>r.opponentUnitRanks![key]!<=cutoff),other=available.filter(r=>r.opponentUnitRanks![key]!>cutoff);
  return strong.length>=3&&other.length>=3?[{label,strong:mean(strong.map(r=>r.delta!))!,other:mean(other.map(r=>r.delta!))!,strongGames:strong.length,otherGames:other.length}]:[];
 });
}
