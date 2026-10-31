import type { RoundRobinStanding, RoundRobinProfile } from "./roundRobin";
import { resolveTeamLogoAsset } from "./teamLogoAssets";
export const CONFERENCE_COLORS: Record<string,string> = {SEC:"#a875e8","Big Ten":"#25aaa3","Big 12":"#b69226",ACC:"#e76880","Pac-12":"#658bdb","American Athletic":"#df8c37","Mountain West":"#9271bc","Sun Belt":"#409dd3","Conference USA":"#a48b5d",MidAmerican:"#789c42",Independent:"#808a9c"};
export type ConferenceRatingSeries = {conference:string;color:string;teams:{team:string;rating:number;rank:number;logo:string|null;color?:string|null;abbreviation?:string|null}[]};
/** Only this visualization omits the explicit weekly conference margin. */
export function conferenceRatingProfiles(profiles:readonly RoundRobinProfile[]):RoundRobinProfile[]{
 return profiles.map(profile=>({...profile,conferenceAdjustment:0}));
}
export function conferenceRatingSeries(rows:readonly RoundRobinStanding[]):ConferenceRatingSeries[]{
 const groups=new Map<string,RoundRobinStanding[]>();
 for(const row of rows){if(!Number.isFinite(row.averageMargin))continue;const conference=row.profile.conference||"Independent";groups.set(conference,[...(groups.get(conference)||[]),row]);}
 return [...groups].sort(([a],[b])=>a.localeCompare(b)).map(([conference,teams],index)=>({conference,color:CONFERENCE_COLORS[conference]||["#d8903e","#569ead","#ae7994","#6b9d69"][index%4],teams:teams.sort((a,b)=>b.averageMargin-a.averageMargin||a.profile.team.localeCompare(b.profile.team)).map((row,index)=>({team:row.profile.team,rating:row.averageMargin,rank:index+1,color:row.profile.color,abbreviation:row.profile.abbreviation,logo:resolveTeamLogoAsset(row.profile.team)??row.profile.logo??null}))}));
}
export function conferenceRatingLayout(series:readonly ConferenceRatingSeries[]){
 const width=1100,height=650,left=88,right=1055,top=130,bottom=545;
 const values=series.flatMap(s=>s.teams.map(t=>t.rating)),maxRank=Math.max(2,...series.map(s=>s.teams.length));
 const low=Math.floor((Math.min(0,...values)-2)/5)*5,high=Math.ceil((Math.max(0,...values)+2)/5)*5;
 const x=(rank:number)=>left+(rank-1)/(maxRank-1)*(right-left),y=(rating:number)=>bottom-(rating-low)/(high-low)*(bottom-top);
 const points=series.flatMap(s=>s.teams.map(team=>({...team,conference:s.conference,color:s.color,x:x(team.rank),y:y(team.rating),logoX:x(team.rank),logoY:y(team.rating)})));
 return {width,height,left,right,top,bottom,low,high,maxRank,x,y,points};
}
