import type {ImperialGame} from "./imperialism";
export type MapControlStint={team:string;startDate:string;endDate:string|null;peakShare:number;fullControlDate:string|null};
/** Track the largest county holder after every result, retaining the incumbent
 * on a tie. Transfers use original county weights; no season can add land. */
export function imperialismControlHistory(seedTeams:readonly string[],eligibleTeams:readonly string[],games:readonly ImperialGame[],asOf?:string){
 const ordered=[...games].sort((a,b)=>(a.startDate??"").localeCompare(b.startDate??"")||a.id.localeCompare(b.id));
 const weights=new Map<string,number>();for(const team of seedTeams)weights.set(team,(weights.get(team)??0)+1);
 const owners=new Map([...weights.keys()].map(team=>[team,team])),eligible=new Set(eligibleTeams),stints:MapControlStint[]=[];
 const firstDate=ordered.find(game=>game.startDate)?.startDate??"2014-08-01T00:00:00Z";
 const finish=asOf??ordered.at(-1)?.startDate??firstDate;
 const update=(date:string)=>{
  const totals=new Map<string,number>();for(const [seed,owner] of owners)totals.set(owner,(totals.get(owner)??0)+weights.get(seed)!);
  const ranked=[...totals].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));if(!ranked.length)return;
  const current=stints.at(-1),max=ranked[0][1];
  const team=current&&totals.get(current.team)===max?current.team:ranked[0][0],share=max/seedTeams.length*100;
  if(current?.team===team){current.peakShare=Math.max(current.peakShare,share);if(max===seedTeams.length&&!current.fullControlDate)current.fullControlDate=date;}
  else{if(current)current.endDate=date;stints.push({team,startDate:date,endDate:null,peakShare:share,fullControlDate:max===seedTeams.length?date:null});}
 };
 update(firstDate);
 for(const game of ordered){
  if(game.homePoints===game.awayPoints||!eligible.has(game.homeTeam)||!eligible.has(game.awayTeam))continue;
  const winner=game.homePoints>game.awayPoints?game.homeTeam:game.awayTeam,loser=winner===game.homeTeam?game.awayTeam:game.homeTeam;
  let changed=false;for(const [seed,owner] of owners)if(owner===loser){owners.set(seed,winner);changed=true;}
  if(changed)update(game.startDate??firstDate);
 }
 return {stints,asOf:finish};
}
