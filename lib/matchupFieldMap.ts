import type { AdvancedSideProjection } from "./advancedMetrics";
import { pffCellNumber, resolvePffTeam, type PffCell, type PffTablePayload, type PffTeamDirectoryRow } from "./pffVisualizer";

export type MatchupFieldDepth = "deep" | "middle" | "short";
export type MatchupFieldSide = "left" | "center" | "right";
export type MatchupFieldTone = "strong" | "mixed" | "weak";

export type MatchupFieldZone = {
  id:`${MatchupFieldDepth}-${MatchupFieldSide}`;
  depth:MatchupFieldDepth;
  side:MatchupFieldSide;
  score:number;
  tone:MatchupFieldTone;
  label:string;
  detail:string;
  pffSample:number|null;
};

export type MatchupRunGap = {
  id:"left-c"|"left-b"|"left-a"|"right-a"|"right-b"|"right-c";
  label:"C"|"B"|"A";
  side:"LEFT"|"RIGHT";
  score:number;
  tone:MatchupFieldTone;
  detail:string;
};

export type PffFieldTendency = {
  pass:Record<`${MatchupFieldDepth}-${MatchupFieldSide}`,number|null>;
  passSamples:Record<`${MatchupFieldDepth}-${MatchupFieldSide}`,number|null>;
  run:{center:number|null;guard:number|null;tackle:number|null};
  quarterback:string|null;
};

export type MatchupFieldMap = {
  zones:MatchupFieldZone[];
  gaps:MatchupRunGap[];
  source:"PFF 2025 + CFBD"|"CFBD PSEUDO-MAP";
  note:string;
};

const depths:MatchupFieldDepth[]=["deep","middle","short"];
const sides:MatchupFieldSide[]=["left","center","right"];
const clamp=(value:number,minimum:number,maximum:number)=>Math.max(minimum,Math.min(maximum,value));
const finite=(value:number|null|undefined):value is number=>value!==null&&value!==undefined&&Number.isFinite(value);
const zoneKey=(depth:MatchupFieldDepth,side:MatchupFieldSide)=>`${depth}-${side}` as const;

function headerIndex(headers:PffCell[]){return new Map(headers.map((value,index)=>[String(value),index]));}
function cell(row:PffCell[],indices:Map<string,number>,key:string){const index=indices.get(key);return index===undefined?null:pffCellNumber(row,index);}
function weighted(values:Array<{value:number|null;weight:number}>){
  const available=values.filter((row):row is {value:number;weight:number}=>finite(row.value)&&row.weight>0);
  const total=available.reduce((sum,row)=>sum+row.weight,0);
  return total?available.reduce((sum,row)=>sum+row.value*row.weight,0)/total:null;
}
function geometric(values:Array<{value:number|null;weight:number}>){
  const available=values.filter((row):row is {value:number;weight:number}=>finite(row.value)&&row.value>0&&row.weight>0);
  const total=available.reduce((sum,row)=>sum+row.weight,0);
  return total?Math.exp(available.reduce((sum,row)=>sum+Math.log(row.value)*row.weight,0)/total):null;
}
function scoreTone(score:number):MatchupFieldTone{return score>=58?"strong":score<44?"weak":"mixed";}
function indexScore(index:number|null){return clamp(Math.round(50+48*Math.log(index??1)),18,84);}

function teamRows(payload:PffTablePayload|null,team:string,directory:readonly PffTeamDirectoryRow[]){
  const headers=payload?.values[0]??[];
  const indices=headerIndex(headers);
  const teamIndex=indices.get("team_name");
  if(teamIndex===undefined)return {headers,indices,rows:[] as PffCell[][]};
  const rows=(payload?.values.slice(1)??[]).filter((row)=>resolvePffTeam(String(row[teamIndex]??""),directory)?.team===team);
  return {headers,indices,rows};
}

function pffZoneScore(row:PffCell[],indices:Map<string,number>,depth:MatchupFieldDepth,side:MatchupFieldSide){
  const pffDepth=depth==="middle"?"medium":depth;
  const prefix=`${side}_${pffDepth}`;
  const attempts=cell(row,indices,`${prefix}_attempts`);
  if(!finite(attempts)||attempts<5)return {score:null,sample:attempts??null};
  const grade=cell(row,indices,`${prefix}_grades_pass`);
  const positiveEpa=cell(row,indices,`${prefix}_positive_epa_percent`);
  const ypa=cell(row,indices,`${prefix}_ypa`);
  const expectedYpa=depth==="deep"?12:depth==="middle"?8:5.8;
  const score=weighted([
    {value:finite(grade)?50+(grade-60)*1.15:null,weight:.46},
    {value:finite(positiveEpa)?50+(positiveEpa-45)*.78:null,weight:.34},
    {value:finite(ypa)?50+(ypa-expectedYpa)*3.2:null,weight:.20},
  ]);
  return {score:score===null?null:clamp(score,18,88),sample:attempts};
}

/**
 * Builds the offensive location tendency only from the user-supplied PFF 2025
 * export. The matchup layer later supplies the opposing-defense adjustment.
 */
export function buildPffFieldTendency(
  team:string,
  directory:readonly PffTeamDirectoryRow[],
  passingDepth:PffTablePayload|null,
  runBlocking:PffTablePayload|null,
):PffFieldTendency|null{
  const passing=teamRows(passingDepth,team,directory);
  const qualifiedQbs=passing.rows.filter((row)=>String(row[passing.indices.get("position")??-1]??"").toUpperCase()==="QB"
    &&(cell(row,passing.indices,"player_game_count")??0)>=4
    &&(cell(row,passing.indices,"base_dropbacks")??cell(row,passing.indices,"base_attempts")??0)>=75)
    .sort((left,right)=>(cell(right,passing.indices,"base_dropbacks")??0)-(cell(left,passing.indices,"base_dropbacks")??0));
  const quarterback=qualifiedQbs[0]??null;
  const pass=Object.fromEntries(depths.flatMap((depth)=>sides.map((side)=>{
    const result=quarterback?pffZoneScore(quarterback,passing.indices,depth,side):{score:null,sample:null};
    return [zoneKey(depth,side),result.score];
  }))) as PffFieldTendency["pass"];
  const passSamples=Object.fromEntries(depths.flatMap((depth)=>sides.map((side)=>{
    const result=quarterback?pffZoneScore(quarterback,passing.indices,depth,side):{score:null,sample:null};
    return [zoneKey(depth,side),result.sample];
  }))) as PffFieldTendency["passSamples"];

  const blocking=teamRows(runBlocking,team,directory);
  const positionIndex=blocking.indices.get("position")??-1;
  const qualifiedLinemen=blocking.rows.filter((row)=>["C","G","T"].includes(String(row[positionIndex]??"").toUpperCase())
    &&(cell(row,blocking.indices,"player_game_count")??0)>=4
    &&(cell(row,blocking.indices,"snap_counts_run_block")??0)>=75);
  const runGrade=(position:"C"|"G"|"T")=>weighted(qualifiedLinemen.filter((row)=>String(row[positionIndex]??"").toUpperCase()===position).map((row)=>({
    value:cell(row,blocking.indices,"grades_run_block"),weight:cell(row,blocking.indices,"snap_counts_run_block")??0,
  })));
  const run={center:runGrade("C"),guard:runGrade("G"),tackle:runGrade("T")};
  const available=Object.values(pass).some(finite)||Object.values(run).some(finite);
  return available?{pass,passSamples,run,quarterback:quarterback?String(quarterback[passing.indices.get("player")??-1]??"")||null:null}:null;
}

function cfbdPassIndex(projection:AdvancedSideProjection,depth:MatchupFieldDepth,side:MatchupFieldSide){
  const pass=projection.pass;
  const direct=pass.directYpa>0?pass.adjustedYpa/pass.directYpa:null;
  const base=depth==="short"
    ?geometric([{value:pass.qbEfficiencyIndex,weight:.52},{value:pass.downLeverageIndex,weight:.30},{value:pass.componentIndex??direct,weight:.18}])
    :depth==="middle"
      ?geometric([{value:pass.qbEfficiencyIndex,weight:.36},{value:pass.receiverSpaceIndex,weight:.34},{value:pass.componentIndex??direct,weight:.30}])
      :geometric([{value:pass.receiverSpaceIndex,weight:.58},{value:pass.componentIndex??direct,weight:.27},{value:pass.downLeverageIndex,weight:.15}]);
  if(!finite(base))return 1;
  // CFBD does not provide left/right tracking. The small center/outside split
  // represents route-family fit and is explicitly labeled as a pseudo-map.
  const concept=depth==="short"?(side==="center"?1.018:.991):depth==="middle"?(side==="center"?1.01:.995):(side==="center"?.982:1.009);
  return base*concept;
}

export function buildMatchupFieldMap(projection:AdvancedSideProjection,pff:PffFieldTendency|null):MatchupFieldMap{
  const zones=depths.flatMap((depth)=>sides.map((side)=>{
    const id=zoneKey(depth,side);
    const cfbd=indexScore(cfbdPassIndex(projection,depth,side));
    const pffValue=pff?.pass[id]??null;
    const score=Math.round(finite(pffValue)?(.66*pffValue+.34*cfbd):cfbd);
    const pffSample=pff?.passSamples[id]??null;
    return {
      id,depth,side,score,tone:scoreTone(score),
      label:`${side.toUpperCase()} ${depth.toUpperCase()}`,
      detail:finite(pffValue)
        ?`PFF location tendency${pffSample?` over ${Math.round(pffSample)} attempts`:""}, adjusted by the CFBD defensive matchup.`
        :"CFBD efficiency, explosiveness, leverage and coverage proxy.",
      pffSample,
    } satisfies MatchupFieldZone;
  }));

  const trench=projection.run.trenchIndex??projection.run.componentIndex??1;
  const second=projection.run.secondLevelIndex??projection.run.componentIndex??1;
  const cfbdGap={
    A:indexScore(geometric([{value:trench,weight:.78},{value:second,weight:.22}])),
    B:indexScore(geometric([{value:trench,weight:.50},{value:second,weight:.50}])),
    C:indexScore(geometric([{value:trench,weight:.30},{value:second,weight:.70}])),
  };
  const pffGap={
    A:weighted([{value:pff?.run.center??null,weight:.42},{value:pff?.run.guard??null,weight:.58}]),
    B:weighted([{value:pff?.run.guard??null,weight:.58},{value:pff?.run.tackle??null,weight:.42}]),
    C:pff?.run.tackle??null,
  };
  const gaps=(
    [["left-c","C","LEFT"],["left-b","B","LEFT"],["left-a","A","LEFT"],["right-a","A","RIGHT"],["right-b","B","RIGHT"],["right-c","C","RIGHT"]] as const
  ).map(([id,label,side])=>{
    const pffValue=pffGap[label];
    const pffScore=finite(pffValue)?clamp(50+(pffValue-60)*1.15,18,88):null;
    const score=Math.round(finite(pffScore)?(.64*pffScore+.36*cfbdGap[label]):cfbdGap[label]);
    return {id,label,side,score,tone:scoreTone(score),detail:finite(pffValue)?"PFF OL run-block grade blended with the CFBD front matchup.":"CFBD line-yards, stuff-rate and second-level proxy."} satisfies MatchupRunGap;
  });
  const usesPff=zones.some((zone)=>zone.pffSample!==null)||Object.values(pff?.run??{}).some(finite);
  return {
    zones,gaps,source:usesPff?"PFF 2025 + CFBD":"CFBD PSEUDO-MAP",
    note:usesPff
      ?"PFF offensive depth/location and OL blocking evidence is blended with CFBD opponent-adjusted defensive metrics. PFF is used only for the final 2025 snapshot to prevent future-game leakage."
      :"CFBD does not publish directional tracking. Horizontal placement is a concept-family estimate; depth and run-lane strength come from matchup efficiency, explosiveness, leverage, line yards and defensive disruption.",
  };
}
