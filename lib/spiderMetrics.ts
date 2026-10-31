export const SPIDER_METRICS = [
  {key:"successRate",label:"Success Rate",detail:"Successful pass and rush plays / eligible plays"},
  {key:"turnoverEpa",label:"EPA Lost Turnovers",detail:"Interception PPA lost per dropback; higher means less lost"},
  {key:"sackRate",label:"Sack Rate",detail:"Sacks / dropbacks; lower is better"},
  {key:"rushEpa",label:"Rush EPA",detail:"Average rushing PPA, excluding sacks and kneels"},
  {key:"passEpa",label:"Pass EPA",detail:"Average passing PPA"},
  {key:"lateDownEpa",label:"Late Down EPA/Play",detail:"Average PPA on third and fourth downs"},
  {key:"earlyDownEpa",label:"Early Down EPA/Play",detail:"Average PPA on first and second downs"},
  {key:"explosiveRate",label:"Explosive Rate",detail:"Passes gaining 20+ or rushes gaining 10+ yards / plays"},
  {key:"epaPlay",label:"EPA/Play",detail:"Average PPA on passes and rushes"},
  {key:"passSuccess",label:"Pass Success Rate",detail:"Successful passes / eligible passes"},
  {key:"rushSuccess",label:"Rush Success Rate",detail:"Successful rushes / eligible rushes"},
  {key:"ypa",label:"Yards/Attempt",detail:"Passing yards / attempts"},
  {key:"ypc",label:"Yards/Carry",detail:"Rushing yards / rushes excluding sacks and kneels"},
  {key:"completionRate",label:"Completion Rate",detail:"Completions / pass attempts"},
  {key:"interceptionRate",label:"Interception Rate",detail:"Interceptions / pass attempts; lower is better"},
  {key:"passingYards",label:"Passing Yards",detail:"Total pass yards"},
  {key:"rushingYards",label:"Rushing Yards",detail:"Total rush yards"},
] as const;
export type SpiderMetricKey = typeof SPIDER_METRICS[number]["key"];
export const DEFAULT_SPIDER_METRICS:SpiderMetricKey[] = SPIDER_METRICS.slice(0,9).map(metric=>metric.key);
export const LOWER_IS_BETTER = new Set<SpiderMetricKey>(["sackRate","interceptionRate"]);
export const ZERO_IS_BEST = new Set<SpiderMetricKey>(["turnoverEpa","sackRate","interceptionRate"]);

type Play = {passerId?:string|null;rusherId?:string|null;passer?:string|null;rusher?:string|null;offense?:string;down?:number;ppa?:number|null;success?:boolean|null;totalYards?:number|null;rusherYards?:number|null;isSack?:boolean;isKneel?:boolean;isTeamRush?:boolean;outcome?:string};
type Total = {id:string;name:string;team:string;attempts:number;completions:number;interceptions:number;passYards:number;rushYards:number;passPpa:number;passPpaN:number;rushPpa:number;rushPpaN:number;allPpa:number;allPpaN:number;earlyPpa:number;earlyN:number;latePpa:number;lateN:number;successful:number;successN:number;passSuccess:number;passSuccessN:number;rushSuccess:number;rushSuccessN:number;explosive:number;explosiveN:number;rushN:number;sacks:number;turnoverLoss:number};
const numeric=(value:unknown):number|null=>typeof value==="number"&&Number.isFinite(value)?value:null;
const ratio=(a:number,b:number)=>b?a/b:null;
export function createSpiderAggregator(){
  const totals=new Map<string,Total>();
  function get(id:string,name:string,team:string){
    const key=`${team}:${id}`;
    let total=totals.get(key);
    if(!total){total={id,name,team,attempts:0,completions:0,interceptions:0,passYards:0,rushYards:0,passPpa:0,passPpaN:0,rushPpa:0,rushPpaN:0,allPpa:0,allPpaN:0,earlyPpa:0,earlyN:0,latePpa:0,lateN:0,successful:0,successN:0,passSuccess:0,passSuccessN:0,rushSuccess:0,rushSuccessN:0,explosive:0,explosiveN:0,rushN:0,sacks:0,turnoverLoss:0};totals.set(key,total);}
    return total;
  }
  function addCommon(total:Total,play:Play,kind:"pass"|"rush"){
    const ppa=numeric(play.ppa);
    if(ppa!==null){total.allPpa+=ppa;total.allPpaN++;if(play.down===1||play.down===2){total.earlyPpa+=ppa;total.earlyN++;}else if(play.down===3||play.down===4){total.latePpa+=ppa;total.lateN++;}if(kind==="pass"){total.passPpa+=ppa;total.passPpaN++;}else{total.rushPpa+=ppa;total.rushPpaN++;}}
    if(typeof play.success==="boolean"){total.successN++;total.successful+=Number(play.success);if(kind==="pass"){total.passSuccessN++;total.passSuccess+=Number(play.success);}else{total.rushSuccessN++;total.rushSuccess+=Number(play.success);}}
    const yards=numeric(kind==="pass"?play.totalYards:play.rusherYards);
    if(yards!==null){total.explosiveN++;total.explosive+=Number(yards>=(kind==="pass"?20:10));}
  }
  return {add(passes:Play[],rushes:Play[]){
    for(const play of passes){if(!play.passerId||!play.offense)continue;const total=get(String(play.passerId),play.passer||String(play.passerId),play.offense);total.attempts++;total.completions+=Number(play.outcome==="completion");total.interceptions+=Number(play.outcome==="interception");total.passYards+=numeric(play.totalYards)??0;if(play.outcome==="interception")total.turnoverLoss+=Math.min(0,numeric(play.ppa)??0);addCommon(total,play,"pass");}
    for(const play of rushes){if(!play.rusherId||!play.offense||play.isTeamRush||play.isKneel)continue;const total=get(String(play.rusherId),play.rusher||String(play.rusherId),play.offense);if(play.isSack){total.sacks++;const ppa=numeric(play.ppa);if(ppa!==null){total.allPpa+=ppa;total.allPpaN++;if(play.down===1||play.down===2){total.earlyPpa+=ppa;total.earlyN++;}else if(play.down===3||play.down===4){total.latePpa+=ppa;total.lateN++;}}continue;}total.rushN++;total.rushYards+=numeric(play.rusherYards)??0;addCommon(total,play,"rush");}
  },finish(){return [...totals.values()].filter(total=>total.attempts>=100).map(total=>({id:total.id,name:total.name,team:total.team,attempts:total.attempts,metrics:{
    successRate:ratio(total.successful,total.successN),turnoverEpa:ratio(total.turnoverLoss,total.attempts+total.sacks),sackRate:ratio(total.sacks,total.attempts+total.sacks),rushEpa:ratio(total.rushPpa,total.rushPpaN),passEpa:ratio(total.passPpa,total.passPpaN),lateDownEpa:ratio(total.latePpa,total.lateN),earlyDownEpa:ratio(total.earlyPpa,total.earlyN),explosiveRate:ratio(total.explosive,total.explosiveN),epaPlay:ratio(total.allPpa,total.allPpaN),passSuccess:ratio(total.passSuccess,total.passSuccessN),rushSuccess:ratio(total.rushSuccess,total.rushSuccessN),ypa:ratio(total.passYards,total.attempts),ypc:ratio(total.rushYards,total.rushN),completionRate:ratio(total.completions,total.attempts),interceptionRate:ratio(total.interceptions,total.attempts),passingYards:total.passYards,rushingYards:total.rushYards,
  }}));}};
}
export function aggregateSpiderPlays(passes:Play[],rushes:Play[]){const aggregator=createSpiderAggregator();aggregator.add(passes,rushes);return aggregator.finish();}
export function spiderPercentile(value:number,cohort:number[],lowerIsBetter=false){
  if(!cohort.length)return null;
  if(lowerIsBetter&&value===0)return 100;
  const below=cohort.filter(candidate=>candidate<value).length;
  const tied=cohort.filter(candidate=>candidate===value).length;
  const percentile=100*(below+tied/2)/cohort.length;
  return Math.round(lowerIsBetter?100-percentile:percentile);
}
