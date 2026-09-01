import type { AdvancedMetricKey, AdvancedProfile } from "./advancedMetrics";

export type MatchupContextLaneId = "rushOffense" | "passOffense" | "rushDefense" | "passDefense";

export type MatchupContextProfile = {
  team:string;
  offYpaIndex:number;
  offYpcIndex:number;
  defYpaIndex:number;
  defYpcIndex:number;
  advancedProfile?:AdvancedProfile|null;
};

export type MatchupContextGameRow = {
  gameId:string;week:number;seasonType?:string|null;startDate?:string|null;neutralSite?:boolean;homeTeam:string;awayTeam:string;
  team:string;opponent:string;points:number|null;yardsPerPlay:number|null;yardsPerPass:number|null;yardsPerRush:number|null;
  passAttempts:number|null;rushAttempts:number|null;
  rushingSuccessRate?:number|null;rushingPpa?:number|null;passingSuccessRate?:number|null;passingPpa?:number|null;
  predictedHomeScore?:number|null;predictedAwayScore?:number|null;
};

export type MatchupImpactSignal = {
  label:"SUCCESS RATE"|"PPA";actual:number|null;expected:number|null;delta:number|null;unit:"POINTS"|"PPA";
};

export type MatchupImpact = {
  id:MatchupContextLaneId;label:string;value:number|null;actual:number|null;expected:number|null;sample:number;
  unit:"YPC"|"YPA";detail:string;signals:MatchupImpactSignal[];
};

export type MatchupAnalog = {
  opponent:string;logo?:string;week:number;startDate?:string|null;similarity:number;actual:number|null;expected:number|null;delta:number|null;
  unit:"YPC"|"YPA";result:string;score:string;performance:string;
};

export type MatchupAnalogLane = {
  id:MatchupContextLaneId;label:string;targetTeam:string;candidates:MatchupAnalog[];
};

export type MatchupExpectationGame = {
  gameId:string;week:number;startDate?:string|null;opponent:string;logo?:string;actual:string;expected:string;result:string;
  marginDelta:number;offenseDelta:number;defenseDelta:number;
};

export type MatchupExpectation = {
  sample:number;averageMarginDelta:number|null;averageOffenseDelta:number|null;averageDefenseDelta:number|null;
  aboveExpected:number;games:MatchupExpectationGame[];
};

export type MatchupTeamContext = {
  team:string;opponent:string;record:string;impacts:Record<MatchupContextLaneId,MatchupImpact>;
  analogs:MatchupAnalogLane[];expectation:MatchupExpectation;
};

export type MatchupContextPayload = {
  season:number;requestedWeek:number;effectiveWeek:number;homeTeam:string;awayTeam:string;
  home:MatchupTeamContext;away:MatchupTeamContext;
};

const laneMeta:Record<MatchupContextLaneId,{label:string;unit:"YPC"|"YPA";offense:boolean}>={
  rushOffense:{label:"RUSH OFFENSE",unit:"YPC",offense:true},
  passOffense:{label:"PASS OFFENSE",unit:"YPA",offense:true},
  rushDefense:{label:"RUSH DEFENSE",unit:"YPC",offense:false},
  passDefense:{label:"PASS DEFENSE",unit:"YPA",offense:false},
};

const finite=(value:unknown):value is number=>value!==null&&value!==undefined&&Number.isFinite(Number(value));
const clamp=(value:number,minimum:number,maximum:number)=>Math.max(minimum,Math.min(maximum,value));
const timestamp=(value:string|null|undefined)=>{
  const parsed=value?Date.parse(value):Number.NaN;
  return Number.isFinite(parsed)?parsed:0;
};
const rounded=(value:number,digits=1)=>{
  const factor=10**digits;
  return Math.round(value*factor)/factor;
};

function weightedAverage(rows:MatchupContextGameRow[],value:(row:MatchupContextGameRow)=>number|null|undefined,weight:(row:MatchupContextGameRow)=>number|null|undefined){
  const valid=rows.flatMap((row)=>{
    const metric=value(row),sample=weight(row);
    return finite(metric)&&finite(sample)&&sample>0?[{metric:Number(metric),sample:Number(sample)}]:[];
  });
  const total=valid.reduce((sum,row)=>sum+row.sample,0);
  return total>0?valid.reduce((sum,row)=>sum+row.metric*row.sample,0)/total:null;
}

function gameRowsWithout(rows:MatchupContextGameRow[],gameId:string){
  return rows.filter((row)=>row.gameId!==gameId);
}

function norm(
  rowsByTeam:Map<string,MatchupContextGameRow[]>,
  rowsAgainstTeam:Map<string,MatchupContextGameRow[]>,
  team:string,
  gameId:string,
  lane:MatchupContextLaneId,
){
  const offense=lane==="rushDefense"||lane==="passDefense";
  const source=gameRowsWithout((offense?rowsByTeam:rowsAgainstTeam).get(team)??[],gameId);
  const rushing=lane==="rushOffense"||lane==="rushDefense";
  return weightedAverage(
    source,
    (row)=>rushing?row.yardsPerRush:row.yardsPerPass,
    (row)=>rushing?row.rushAttempts:row.passAttempts,
  );
}

function laneObservation(
  lane:MatchupContextLaneId,
  selected:MatchupContextGameRow,
  opponent:MatchupContextGameRow,
  rowsByTeam:Map<string,MatchupContextGameRow[]>,
  rowsAgainstTeam:Map<string,MatchupContextGameRow[]>,
){
  const rushing=lane==="rushOffense"||lane==="rushDefense";
  const offense=lane==="rushOffense"||lane==="passOffense";
  const observed=offense?selected:opponent;
  const actual=rushing?observed.yardsPerRush:observed.yardsPerPass;
  const expected=norm(rowsByTeam,rowsAgainstTeam,selected.opponent,selected.gameId,lane);
  const weight=rushing?observed.rushAttempts:observed.passAttempts;
  if(!finite(actual)||!finite(expected)||Number(expected)<=0||!finite(weight)||Number(weight)<=0)return null;
  const ratio=Number(actual)/Number(expected);
  return {actual:Number(actual),expected:Number(expected),weight:Number(weight),delta:offense?ratio-1:1-ratio};
}

function impactDetail(id:MatchupContextLaneId,value:number|null){
  if(value===null)return"Not enough opponent history to establish a stable comparison.";
  const amount=Math.abs(value*100).toFixed(1);
  if(id==="rushOffense")return value>=0?`Gains ${amount}% more per carry than opponents normally allow.`:`Gains ${amount}% less per carry than opponents normally allow.`;
  if(id==="passOffense")return value>=0?`Gains ${amount}% more per pass than opponents normally allow.`:`Gains ${amount}% less per pass than opponents normally allow.`;
  if(id==="rushDefense")return value>=0?`Holds opponents ${amount}% below their normal rushing efficiency.`:`Allows opponents ${amount}% above their normal rushing efficiency.`;
  return value>=0?`Holds opponents ${amount}% below their normal passing efficiency.`:`Allows opponents ${amount}% above their normal passing efficiency.`;
}

type AdvancedImpactMetric="successRate"|"ppa";

function advancedValue(row:MatchupContextGameRow,lane:MatchupContextLaneId,metric:AdvancedImpactMetric){
  const rushing=lane==="rushOffense"||lane==="rushDefense";
  if(rushing)return metric==="successRate"?row.rushingSuccessRate:row.rushingPpa;
  return metric==="successRate"?row.passingSuccessRate:row.passingPpa;
}

function advancedNorm(
  rowsByTeam:Map<string,MatchupContextGameRow[]>,
  rowsAgainstTeam:Map<string,MatchupContextGameRow[]>,
  team:string,
  gameId:string,
  lane:MatchupContextLaneId,
  metric:AdvancedImpactMetric,
){
  const selectedDefense=lane==="rushDefense"||lane==="passDefense";
  const source=gameRowsWithout((selectedDefense?rowsByTeam:rowsAgainstTeam).get(team)??[],gameId);
  const rushing=lane==="rushOffense"||lane==="rushDefense";
  return weightedAverage(source,(row)=>advancedValue(row,lane,metric),(row)=>rushing?row.rushAttempts:row.passAttempts);
}

function advancedObservation(
  lane:MatchupContextLaneId,
  metric:AdvancedImpactMetric,
  selected:MatchupContextGameRow,
  opponent:MatchupContextGameRow,
  rowsByTeam:Map<string,MatchupContextGameRow[]>,
  rowsAgainstTeam:Map<string,MatchupContextGameRow[]>,
){
  const rushing=lane==="rushOffense"||lane==="rushDefense";
  const selectedOffense=lane==="rushOffense"||lane==="passOffense";
  const observed=selectedOffense?selected:opponent;
  const actual=advancedValue(observed,lane,metric);
  const expected=advancedNorm(rowsByTeam,rowsAgainstTeam,selected.opponent,selected.gameId,lane,metric);
  const weight=rushing?observed.rushAttempts:observed.passAttempts;
  if(!finite(actual)||!finite(expected)||!finite(weight)||Number(weight)<=0)return null;
  return {
    actual:Number(actual),expected:Number(expected),weight:Number(weight),
    delta:selectedOffense?Number(actual)-Number(expected):Number(expected)-Number(actual),
  };
}

function buildImpact(
  id:MatchupContextLaneId,
  teamGames:MatchupContextGameRow[],
  counterpartByGameTeam:Map<string,MatchupContextGameRow>,
  rowsByTeam:Map<string,MatchupContextGameRow[]>,
  rowsAgainstTeam:Map<string,MatchupContextGameRow[]>,
):MatchupImpact{
  const observations=teamGames.flatMap((game)=>{
    const opponent=counterpartByGameTeam.get(`${game.gameId}\u0000${game.opponent}`);
    const row=opponent?laneObservation(id,game,opponent,rowsByTeam,rowsAgainstTeam):null;
    return row?[row]:[];
  });
  const sampleWeight=observations.reduce((sum,row)=>sum+row.weight,0);
  const value=sampleWeight?observations.reduce((sum,row)=>sum+row.delta*row.weight,0)/sampleWeight:null;
  const actual=sampleWeight?observations.reduce((sum,row)=>sum+row.actual*row.weight,0)/sampleWeight:null;
  const expected=sampleWeight?observations.reduce((sum,row)=>sum+row.expected*row.weight,0)/sampleWeight:null;
  const signals=(["successRate","ppa"] as AdvancedImpactMetric[]).map((metric)=>{
    const signalRows=teamGames.flatMap((game)=>{
      const opponent=counterpartByGameTeam.get(`${game.gameId}\u0000${game.opponent}`);
      const row=opponent?advancedObservation(id,metric,game,opponent,rowsByTeam,rowsAgainstTeam):null;
      return row?[row]:[];
    });
    const weight=signalRows.reduce((sum,row)=>sum+row.weight,0);
    const signalActual=weight?signalRows.reduce((sum,row)=>sum+row.actual*row.weight,0)/weight:null;
    const signalExpected=weight?signalRows.reduce((sum,row)=>sum+row.expected*row.weight,0)/weight:null;
    const delta=weight?signalRows.reduce((sum,row)=>sum+row.delta*row.weight,0)/weight:null;
    return {
      label:metric==="successRate"?"SUCCESS RATE":"PPA",
      actual:signalActual===null?null:rounded(signalActual,3),
      expected:signalExpected===null?null:rounded(signalExpected,3),
      delta:delta===null?null:rounded(delta,3),
      unit:metric==="successRate"?"POINTS":"PPA",
    } satisfies MatchupImpactSignal;
  });
  return {
    id,label:laneMeta[id].label,value:value===null?null:rounded(value,3),actual:actual===null?null:rounded(actual,2),expected:expected===null?null:rounded(expected,2),
    sample:observations.length,unit:laneMeta[id].unit,detail:impactDetail(id,value),signals,
  };
}

function advanced(profile:MatchupContextProfile|undefined,side:"offense"|"defense",key:AdvancedMetricKey){
  const value=profile?.advancedProfile?.[side].index[key];
  return finite(value)&&Number(value)>0?Number(value):null;
}

function features(profile:MatchupContextProfile|undefined,lane:MatchupContextLaneId){
  if(!profile)return[];
  const side=laneMeta[lane].offense?"offense":"defense";
  const core=lane==="rushOffense"?profile.offYpcIndex:lane==="passOffense"?profile.offYpaIndex:lane==="rushDefense"?profile.defYpcIndex:profile.defYpaIndex;
  const keys:AdvancedMetricKey[]=lane==="rushOffense"||lane==="rushDefense"
    ?["rushingSuccessRate","rushingPpa","lineYards","secondLevelYards","openFieldYards","stuffRate"]
    :["passingSuccessRate","passingPpa","passingExplosiveness","completionRate","passingDownSuccessRate","yardsPerCompletion"];
  return [finite(core)&&core>0?core:null,...keys.map((key)=>advanced(profile,side,key))];
}

export function matchupProfileSimilarity(target:MatchupContextProfile|undefined,candidate:MatchupContextProfile|undefined,lane:MatchupContextLaneId){
  const targetFeatures=features(target,lane),candidateFeatures=features(candidate,lane);
  const pairs=targetFeatures.flatMap((value,index)=>finite(value)&&Number(value)>0&&finite(candidateFeatures[index])&&Number(candidateFeatures[index])>0
    ?[[Number(value),Number(candidateFeatures[index])] as const]:[]);
  if(!pairs.length)return 0;
  const distance=Math.sqrt(pairs.reduce((sum,[targetValue,candidateValue])=>sum+Math.log(clamp(candidateValue/targetValue,.35,2.85))**2,0)/pairs.length);
  return Math.round(clamp(100*Math.exp(-2.8*distance),0,100));
}

function resultFor(selected:MatchupContextGameRow,opponent:MatchupContextGameRow){
  if(!finite(selected.points)||!finite(opponent.points))return"—";
  return Number(selected.points)>Number(opponent.points)?"W":Number(selected.points)<Number(opponent.points)?"L":"T";
}

function recordFor(teamGames:MatchupContextGameRow[],counterpartByGameTeam:Map<string,MatchupContextGameRow>){
  let wins=0,losses=0,ties=0;
  for(const game of teamGames){
    const opponent=counterpartByGameTeam.get(`${game.gameId}\u0000${game.opponent}`);
    if(!opponent)continue;
    const result=resultFor(game,opponent);
    if(result==="W")wins+=1;
    else if(result==="L")losses+=1;
    else if(result==="T")ties+=1;
  }
  return `${wins}–${losses}${ties?`–${ties}`:""}`;
}

function analogPerformance(lane:MatchupContextLaneId,delta:number|null){
  if(delta===null)return"No stable opponent baseline";
  const amount=Math.abs(delta*100).toFixed(1);
  if(lane==="rushOffense"||lane==="passOffense")return delta>=0?`${amount}% above expected`:`${amount}% below expected`;
  return delta>=0?`Held ${amount}% below norm`:`Allowed ${amount}% above norm`;
}

function buildAnalogLanes(
  selectedTeam:string,
  targetTeam:string,
  teamGames:MatchupContextGameRow[],
  profiles:Map<string,MatchupContextProfile>,
  logos:Map<string,string>,
  counterpartByGameTeam:Map<string,MatchupContextGameRow>,
  rowsByTeam:Map<string,MatchupContextGameRow[]>,
  rowsAgainstTeam:Map<string,MatchupContextGameRow[]>,
):MatchupAnalogLane[]{
  const target=profiles.get(targetTeam);
  return (Object.keys(laneMeta) as MatchupContextLaneId[]).map((lane)=>{
    const performanceLane:MatchupContextLaneId=lane==="rushOffense"?"rushDefense":lane==="passOffense"?"passDefense":lane==="rushDefense"?"rushOffense":"passOffense";
    const candidates=teamGames.flatMap((game)=>{
      const opponentRow=counterpartByGameTeam.get(`${game.gameId}\u0000${game.opponent}`);
      const candidate=profiles.get(game.opponent);
      if(!opponentRow||!candidate)return[];
      const observation=laneObservation(performanceLane,game,opponentRow,rowsByTeam,rowsAgainstTeam);
      const similarity=matchupProfileSimilarity(target,candidate,lane);
      if(!similarity)return[];
      return [{
        opponent:game.opponent,logo:logos.get(game.opponent),week:game.week,startDate:game.startDate,similarity,
        actual:observation?rounded(observation.actual,2):null,expected:observation?rounded(observation.expected,2):null,
        delta:observation?rounded(observation.delta,3):null,unit:laneMeta[lane].unit,
        result:resultFor(game,opponentRow),score:finite(game.points)&&finite(opponentRow.points)?`${Math.round(Number(game.points))}–${Math.round(Number(opponentRow.points))}`:"—",
        performance:analogPerformance(performanceLane,observation?.delta??null),
      } satisfies MatchupAnalog];
    }).sort((left,right)=>right.similarity-left.similarity||timestamp(right.startDate)-timestamp(left.startDate)||right.week-left.week).slice(0,2);
    return {id:lane,label:`${laneMeta[lane].label} LOOKALIKE`,targetTeam,candidates};
  });
}

function buildExpectation(team:string,teamGames:MatchupContextGameRow[],logos:Map<string,string>,counterpartByGameTeam:Map<string,MatchupContextGameRow>):MatchupExpectation{
  const games=teamGames.flatMap((game)=>{
    const opponent=counterpartByGameTeam.get(`${game.gameId}\u0000${game.opponent}`);
    if(!opponent||!finite(game.points)||!finite(opponent.points)||!finite(game.predictedHomeScore)||!finite(game.predictedAwayScore))return[];
    const home=game.homeTeam===team;
    const expectedTeam=home?Number(game.predictedHomeScore):Number(game.predictedAwayScore);
    const expectedOpponent=home?Number(game.predictedAwayScore):Number(game.predictedHomeScore);
    const offenseDelta=Number(game.points)-expectedTeam;
    const defenseDelta=expectedOpponent-Number(opponent.points);
    return [{
      gameId:game.gameId,week:game.week,startDate:game.startDate,opponent:game.opponent,logo:logos.get(game.opponent),
      actual:`${Math.round(Number(game.points))}–${Math.round(Number(opponent.points))}`,
      expected:`${Math.round(expectedTeam)}–${Math.round(expectedOpponent)}`,
      result:resultFor(game,opponent),marginDelta:rounded(offenseDelta+defenseDelta),offenseDelta:rounded(offenseDelta),defenseDelta:rounded(defenseDelta),
    } satisfies MatchupExpectationGame];
  }).sort((left,right)=>timestamp(right.startDate)-timestamp(left.startDate)||right.week-left.week);
  return {
    sample:games.length,
    averageMarginDelta:games.length?rounded(games.reduce((sum,row)=>sum+row.marginDelta,0)/games.length):null,
    averageOffenseDelta:games.length?rounded(games.reduce((sum,row)=>sum+row.offenseDelta,0)/games.length):null,
    averageDefenseDelta:games.length?rounded(games.reduce((sum,row)=>sum+row.defenseDelta,0)/games.length):null,
    aboveExpected:games.filter((row)=>row.marginDelta>0).length,
    games:games.slice(0,5),
  };
}

export function buildMatchupContext(input:{
  season:number;requestedWeek:number;effectiveWeek:number;homeTeam:string;awayTeam:string;
  profiles:MatchupContextProfile[];games:MatchupContextGameRow[];logos?:Record<string,string>;
}):MatchupContextPayload{
  const profiles=new Map(input.profiles.map((row)=>[row.team,row]));
  const logos=new Map(Object.entries(input.logos??{}));
  const eligibleGames=input.games.filter((row)=>input.requestedWeek>=16
    ||((row.seasonType??"regular").toLowerCase()==="regular"&&row.week<=input.requestedWeek));
  const rowsByTeam=new Map<string,MatchupContextGameRow[]>(),rowsAgainstTeam=new Map<string,MatchupContextGameRow[]>();
  const counterpartByGameTeam=new Map(eligibleGames.map((row)=>[`${row.gameId}\u0000${row.team}`,row]));
  for(const row of eligibleGames){
    rowsByTeam.set(row.team,[...(rowsByTeam.get(row.team)??[]),row]);
    rowsAgainstTeam.set(row.opponent,[...(rowsAgainstTeam.get(row.opponent)??[]),row]);
  }
  const build=(team:string,opponent:string):MatchupTeamContext=>{
    const teamGames=(rowsByTeam.get(team)??[]).sort((left,right)=>timestamp(left.startDate)-timestamp(right.startDate)||left.week-right.week);
    const impacts=Object.fromEntries((Object.keys(laneMeta) as MatchupContextLaneId[]).map((lane)=>[
      lane,buildImpact(lane,teamGames,counterpartByGameTeam,rowsByTeam,rowsAgainstTeam),
    ])) as Record<MatchupContextLaneId,MatchupImpact>;
    return {
      team,opponent,record:recordFor(teamGames,counterpartByGameTeam),impacts,
      analogs:buildAnalogLanes(team,opponent,teamGames,profiles,logos,counterpartByGameTeam,rowsByTeam,rowsAgainstTeam),
      expectation:buildExpectation(team,teamGames,logos,counterpartByGameTeam),
    };
  };
  return {
    season:input.season,requestedWeek:input.requestedWeek,effectiveWeek:input.effectiveWeek,homeTeam:input.homeTeam,awayTeam:input.awayTeam,
    home:build(input.homeTeam,input.awayTeam),away:build(input.awayTeam,input.homeTeam),
  };
}
