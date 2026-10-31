import {passLocations} from './passing';
import {parsePassingDirectionalGames,MIN_PASS_ZONE_ATTEMPTS} from './passingMatchup';
import {parseDirectionalGames,runLanes} from './rushingMatchup';
export type GameDirectionZone={label:string;attempts:number;completions:number|null;yardsPerAttempt:number|null;relativePercent:number|null;baseline:number|null;unit:'YPA'|'YPC'};
export type GameDirectionSide={team:string;passing:GameDirectionZone[];rushing:GameDirectionZone[];available:boolean;passAvailable:boolean;rushAvailable:boolean};
const percent=(actual:number|null,baseline:number|null)=>actual!==null&&baseline!==null&&baseline>0?100*(actual/baseline-1):null;
const finite=(n:unknown):number|null=>typeof n==='number'&&Number.isFinite(n)?n:null;
/** Completed-game production versus the opponent's other charted games through this week. */
export function actualGameDirection({gameId,week,team,opponent,passing,opponentPassing,rushing,opponentRushing}:{gameId:string;week:number;team:string;opponent:string;passing:unknown;opponentPassing:unknown;rushing:unknown;opponentRushing:unknown}):GameDirectionSide{
 const pass=parsePassingDirectionalGames(passing).find(g=>g.gameId===gameId&&g.team===team&&g.opponent===opponent);
 const passOther=parsePassingDirectionalGames(opponentPassing).filter(g=>g.team===opponent&&g.gameId!==gameId&&g.week<=week);
 const rush=parseDirectionalGames(rushing).find(g=>g.gameId===gameId&&g.team===team&&g.opponent===opponent);
 const rushOther=parseDirectionalGames(opponentRushing).filter(g=>g.team===opponent&&g.gameId!==gameId&&g.week<=week);
 const rawPass=Array.isArray(passing)?passing.find(r=>r&&typeof r==='object'&&String(r.gameId)===gameId&&r.team===team):null;
 const passingZones:GameDirectionZone[]=passLocations.map(label=>{
  const own=pass?.offense[label],other=passOther.map(g=>g.defense[label]);
  const n=other.reduce((sum,r)=>sum+r.available,0),yards=other.reduce((sum,r)=>sum+r.yards,0);
  const baseline=n>=MIN_PASS_ZONE_ATTEMPTS&&yards>0?yards/n:null;
  const ypa=own&&own.available>0?own.yards/own.available:null;
  const rawLocation=rawPass&&typeof rawPass==='object'?(rawPass as {offense?:{locations?:Record<string,{completions?:unknown}>}}).offense?.locations?.[label]:null;
  const completions=finite(rawLocation?.completions);
  return {label,attempts:own?.attempts??0,completions,yardsPerAttempt:ypa,baseline,relativePercent:(own?.available??0)>=MIN_PASS_ZONE_ATTEMPTS?percent(ypa,baseline):null,unit:'YPA'};
 });
 const rushingZones:GameDirectionZone[]=runLanes.map(label=>{
  const own=rush?.offense[label],other=rushOther.map(g=>g.defense[label]);
  const n=other.reduce((sum,r)=>sum+r.carries,0),yards=other.reduce((sum,r)=>sum+r.yards,0);
  const baseline=n>=3&&yards>0?yards/n:null;
  const ypc=own&&own.carries>0?own.yards/own.carries:null;
  return {label,attempts:own?.carries??0,completions:null,yardsPerAttempt:ypc,baseline,relativePercent:(own?.carries??0)>=3?percent(ypc,baseline):null,unit:'YPC'};
 });
 const passAvailable=passingZones.some(z=>z.attempts>0),rushAvailable=rushingZones.some(z=>z.attempts>0);
 return {team,passing:passingZones,rushing:rushingZones,available:passAvailable||rushAvailable,passAvailable,rushAvailable};
}
