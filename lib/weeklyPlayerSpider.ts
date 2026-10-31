import type {PlayerWeeklyMetricMap} from "./playerWeekly";
import {spiderPercentile} from "./spiderMetrics";

export type WeeklyPlayerRole="QB"|"Receiver"|"Rusher"|"Defender";
export type WeeklySpiderAxis={label:string;name:string;value:number;percentile:number};
export type WeeklySpiderCandidate={metrics:PlayerWeeklyMetricMap;role:WeeklyPlayerRole};

const stat=(metrics:PlayerWeeklyMetricMap,key:keyof PlayerWeeklyMetricMap)=>{
  const value=metrics[key];return typeof value==="number"&&Number.isFinite(value)?value:null;
};
const divide=(numerator:number|null,denominator:number|null)=>numerator!==null&&denominator!==null&&denominator>0?numerator/denominator:null;
const axes:Record<WeeklyPlayerRole,{label:string;name:string;value:(metrics:PlayerWeeklyMetricMap)=>number|null;lower?:boolean}[]>={
  QB:[
    {label:"YDS",name:"Pass yards",value:m=>stat(m,"passYards")},
    {label:"TD",name:"Pass TD",value:m=>stat(m,"passTd")},
    {label:"CMP",name:"Completion rate",value:m=>stat(m,"completionRate")??divide(stat(m,"passCompletions"),stat(m,"passAttempts"))},
    {label:"Y/A",name:"Yards per attempt",value:m=>stat(m,"yardsPerAttempt")??divide(stat(m,"passYards"),stat(m,"passAttempts"))},
    {label:"INT",name:"Interception rate",value:m=>divide(stat(m,"passInterceptions")??0,stat(m,"passAttempts")),lower:true},
  ],
  Receiver:[
    {label:"REC",name:"Receptions",value:m=>stat(m,"receptions")},
    {label:"YDS",name:"Receiving yards",value:m=>stat(m,"receivingYards")},
    {label:"Y/R",name:"Yards per reception",value:m=>stat(m,"yardsPerReception")??divide(stat(m,"receivingYards"),stat(m,"receptions"))},
    {label:"TD",name:"Receiving TD",value:m=>stat(m,"receivingTd")},
    {label:"AP",name:"All-purpose yards",value:m=>stat(m,"allPurposeYards")},
  ],
  Rusher:[
    {label:"CAR",name:"Carries",value:m=>stat(m,"rushAttempts")},
    {label:"YDS",name:"Rush yards",value:m=>stat(m,"rushYards")},
    {label:"Y/C",name:"Yards per carry",value:m=>stat(m,"yardsPerCarry")??divide(stat(m,"rushYards"),stat(m,"rushAttempts"))},
    {label:"TD",name:"Rush TD",value:m=>stat(m,"rushTd")},
    {label:"AP",name:"All-purpose yards",value:m=>stat(m,"allPurposeYards")},
  ],
  Defender:[
    {label:"TCK",name:"Tackles",value:m=>stat(m,"tackles")},
    {label:"TFL",name:"Tackles for loss",value:m=>stat(m,"tfl")},
    {label:"SCK",name:"Sacks",value:m=>stat(m,"sacks")},
    {label:"PD",name:"Passes defended",value:m=>stat(m,"passesDefended")},
    {label:"INT",name:"Interceptions",value:m=>stat(m,"defensiveInterceptions")},
  ],
};

export function weeklyPlayerRole(metrics:PlayerWeeklyMetricMap):WeeklyPlayerRole{
  if((stat(metrics,"passAttempts")??0)>0)return "QB";
  if((stat(metrics,"receptions")??0)>0)return "Receiver";
  if((stat(metrics,"rushAttempts")??0)>0)return "Rusher";
  return "Defender";
}

export function weeklySpiderAxes(player:WeeklySpiderCandidate,players:readonly WeeklySpiderCandidate[]):WeeklySpiderAxis[]{
  const qualifies=(candidate:WeeklySpiderCandidate)=>candidate.role==="QB"?(stat(candidate.metrics,"passAttempts")??0)>=10
    :candidate.role==="Receiver"?(stat(candidate.metrics,"receptions")??0)>=2
    :candidate.role==="Rusher"?(stat(candidate.metrics,"rushAttempts")??0)>=5
    :(stat(candidate.metrics,"tackles")??0)>=2||(stat(candidate.metrics,"sacks")??0)>0||(stat(candidate.metrics,"defensiveInterceptions")??0)>0;
  const peers=players.filter(candidate=>candidate.role===player.role&&qualifies(candidate));
  return axes[player.role].map(axis=>{
    const value=axis.value(player.metrics);
    const cohort=peers.map(candidate=>axis.value(candidate.metrics)).filter((number):number is number=>number!==null&&Number.isFinite(number));
    return value===null||!cohort.length?null:{label:axis.label,name:axis.name,value,percentile:spiderPercentile(value,cohort,axis.lower)??50};
  }).filter((axis):axis is WeeklySpiderAxis=>axis!==null);
}
