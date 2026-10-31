import type {ConferenceRatingSeries} from './conferenceRatingChart';
export const conferenceStrengthLogo=(conference:string)=>{
 const names:Record<string,string>={'Independent':'fbs-independents','FBS Independents':'fbs-independents','SEC':'sec','Big Ten':'big-ten','Big 12':'big-12','ACC':'acc','Pac-12':'pac-12','American Athletic':'american-athletic','Mountain West':'mountain-west','Sun Belt':'sun-belt','Conference USA':'conference-usa','MidAmerican':'mid-american','Mid-American':'mid-american'};
 return names[conference]?`/conference-logos/${names[conference]}.png`:null;
};
export function conferenceStrengthLayout(series:readonly ConferenceRatingSeries[]){
 const sorted=series.filter(s=>s.teams.length).map(s=>({...s,average:s.teams.reduce((sum,t)=>sum+t.rating,0)/s.teams.length})).sort((a,b)=>b.average-a.average||a.conference.localeCompare(b.conference));
 const total=sorted.reduce((sum,s)=>sum+Math.max(96,s.teams.length*13),0),width=Math.max(1000,total+140),height=650,left=82,right=width-30,top=155,bottom=500;
 const values=sorted.flatMap(s=>s.teams.map(t=>t.rating)),low=Math.floor((Math.min(0,...values)-2)/5)*5,high=Math.ceil((Math.max(0,...values)+2)/5)*5;
 const y=(rating:number)=>bottom-(rating-low)/(high-low)*(bottom-top);let cursor=left;
 const bands=sorted.map(s=>{const start=cursor,span=Math.max(96,s.teams.length*13)/Math.max(1,total)*(right-left);cursor+=span;return {...s,start,end:cursor,center:start+span/2,meanY:y(s.average),points:[...s.teams].sort((a,b)=>b.rating-a.rating||a.team.localeCompare(b.team)).map((team,i)=>({...team,color:team.color&&/^#[a-f\d]{6}$/i.test(team.color)?team.color:"#555555",abbreviation:team.abbreviation||team.team.split(/\s+/).map(word=>word[0]).join("").toUpperCase().slice(0,6),x:start+(i+.5)/s.teams.length*span,y:y(team.rating)}))};});
 return {width,height,left,right,top,bottom,low,high,y,bands};
}
