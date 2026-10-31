import { modelCalibration } from "../app/modelData";
import { possessionModel } from "./scoringModel";
import { datedPregameScores } from "./teamSchedulePerformance";

export type ConferenceTeam={team:string;conference:string|null;logo?:string|null};
export type ConferenceGame={gameId:string;week:number;seasonType:string;completed:boolean|number;neutralSite:boolean|number;
  homeTeam:string;awayTeam:string;homePoints:number|null;awayPoints:number|null;startDate?:string|null;
  generatedFromWeek?:number|null;predictedHomeScore?:number|null;predictedAwayScore?:number|null;predictionConferenceMargin?:number|null};
export type ConferenceEvidenceGame=ConferenceGame&{homeConference:string;awayConference:string;neutralMargin:number;ratingMargin:number;
  expectedHomeMargin:number|null;homeMarginDelta:number|null};
export type ConferenceComparisonRow={conference:string;teams:number;participants:number;games:number;wins:number;losses:number;ties:number;winPct:number|null;
  teamAdjustment?:number|null;
  averageMargin:number|null;averageExpectedMargin:number|null;averageActualMargin:number|null;averageMarginDelta:number|null;predictionGames:number;
  opponentRating:number|null;rating:number|null;fcsWins:number;fcsLosses:number;fcsTies:number;component:number|null;opponentConferences:number};
export type ConferenceComparisonReport={rows:ConferenceComparisonRow[];games:ConferenceEvidenceGame[];components:number;excludedGames:number;venueAdjustment:number;ridge:number;marginCap:number};

// Results-only conference network. FCS games are reported separately, never
// used as links. Historical conference affiliation comes from that season.
export function buildConferenceComparison(teams:readonly ConferenceTeam[],games:readonly ConferenceGame[],week:number,includePostseason=false):ConferenceComparisonReport {
  const byTeam=new Map(teams.map(t=>[t.team,t]));
  const group=(team:ConferenceTeam)=>/independent/i.test(team.conference??"")?"FBS Independents":team.conference?.trim()||"Unassigned";
  const conferences=[...new Set(teams.map(group))].sort();
  const rows:ConferenceComparisonRow[]=conferences.map(conference=>({conference,teams:teams.filter(t=>group(t)===conference).length,participants:0,
    games:0,wins:0,losses:0,ties:0,winPct:null,averageMargin:null,averageExpectedMargin:null,averageActualMargin:null,averageMarginDelta:null,predictionGames:0,
    opponentRating:null,rating:null,fcsWins:0,fcsLosses:0,fcsTies:0,component:null,opponentConferences:0}));
  const byConference=new Map(rows.map(r=>[r.conference,r]));
  const participants=new Map(conferences.map(c=>[c,new Set<string>()]));
  const neighbors=new Map(conferences.map(c=>[c,new Set<string>()]));
  const marginTotals=new Map<string,number>();
  const evidence:ConferenceEvidenceGame[]=[];
  const ridge=4,marginCap=28;
  // Match the fitted game's effective venue contribution when outcome ratings
  // are present, including the outcome layer's configured home-field input.
  const venueAdjustment=possessionModel.margin.coefficients.homeField/possessionModel.margin.deviations.homeField
    +possessionModel.margin.coefficients.outcomeMargin/possessionModel.margin.deviations.outcomeMargin*modelCalibration.homeFieldAdvantage;
  let excludedGames=0;
  const seen=new Set<string>();
  for(const g of games){
    if(seen.has(g.gameId)||!g.completed||g.homePoints===null||g.awayPoints===null||!Number.isFinite(g.homePoints)||!Number.isFinite(g.awayPoints))continue;
    seen.add(g.gameId);
    if(g.seasonType==="postseason"?!includePostseason:g.week>week)continue;
    const ht=byTeam.get(g.homeTeam),at=byTeam.get(g.awayTeam);
    if(!ht&&!at)continue;
    if(!ht||!at){
      const t=ht??at!;const row=byConference.get(group(t))!;
      const m=ht?g.homePoints-g.awayPoints:g.awayPoints-g.homePoints;
      if(m>0)row.fcsWins++;else if(m<0)row.fcsLosses++;else row.fcsTies++;
      continue;
    }
    const h=group(ht),a=group(at);
    if(h===a)continue;
    if(h==="Unassigned"||a==="Unassigned"){excludedGames++;continue;}
    const margin=g.homePoints-g.awayPoints;
    const neutralMargin=margin-(g.neutralSite?0:venueAdjustment);
    const pregame=datedPregameScores({...g,generatedFromWeek:g.generatedFromWeek??null,predictedHomeScore:g.predictedHomeScore??null,predictedAwayScore:g.predictedAwayScore??null});
    const expectedHomeMargin=pregame?pregame.home-pregame.away:null;
    evidence.push({...g,homeConference:h,awayConference:a,neutralMargin,ratingMargin:Math.max(-marginCap,Math.min(marginCap,neutralMargin)),
      expectedHomeMargin,homeMarginDelta:expectedHomeMargin===null?null:margin-expectedHomeMargin});
    for(const [c,opponent,team,m] of [[h,a,g.homeTeam,margin],[a,h,g.awayTeam,-margin]] as const){
      const row=byConference.get(c)!;row.games++;
      if(m>0)row.wins++;else if(m<0)row.losses++;else row.ties++;
      participants.get(c)!.add(team);neighbors.get(c)!.add(opponent);
      marginTotals.set(c,(marginTotals.get(c)??0)+m);
    }
  }
  // Solve (L + ridge I) r = X' margin. Ridge contributes four zero-margin
  // games per conference, shrinking sparse records rather than calling them proof.
  const index=new Map(conferences.map((c,i)=>[c,i]));
  const matrix=conferences.map((_,i)=>conferences.map((_,j)=>i===j?ridge:0));
  const rhs=conferences.map(()=>0);
  for(const g of evidence){const h=index.get(g.homeConference)!,a=index.get(g.awayConference)!;
    matrix[h][h]++;matrix[a][a]++;matrix[h][a]--;matrix[a][h]--;rhs[h]+=g.ratingMargin;rhs[a]-=g.ratingMargin;}
  for(let k=0;k<conferences.length;k++){
    const divisor=matrix[k][k];for(let j=k;j<conferences.length;j++)matrix[k][j]/=divisor;rhs[k]/=divisor;
    for(let i=0;i<conferences.length;i++){if(i===k)continue;const scale=matrix[i][k];for(let j=k;j<conferences.length;j++)matrix[i][j]-=scale*matrix[k][j];rhs[i]-=scale*rhs[k];}
  }
  let components=0;
  for(const row of rows){
    if(!row.games||row.component!==null)continue;
    const stack=[row.conference];row.component=++components;
    while(stack.length){const c=stack.pop()!;for(const next of neighbors.get(c)!){const other=byConference.get(next)!;
      if(other.component===null){other.component=components;stack.push(next);}}}
  }
  for(const row of rows){
    row.participants=participants.get(row.conference)!.size;row.opponentConferences=neighbors.get(row.conference)!.size;
    if(!row.games)continue;
    row.winPct=(row.wins+.5*row.ties)/row.games;row.averageMargin=marginTotals.get(row.conference)!/row.games;row.rating=rhs[index.get(row.conference)!];
    const matched=evidence.filter(g=>(g.homeConference===row.conference||g.awayConference===row.conference)&&g.expectedHomeMargin!==null);
    row.predictionGames=matched.length;
    if(matched.length){
      row.averageExpectedMargin=matched.reduce((n,g)=>n+(g.homeConference===row.conference?1:-1)*g.expectedHomeMargin!,0)/matched.length;
      row.averageActualMargin=matched.reduce((n,g)=>n+(g.homeConference===row.conference?1:-1)*(Number(g.homePoints)-Number(g.awayPoints)),0)/matched.length;
      row.averageMarginDelta=row.averageActualMargin-row.averageExpectedMargin;
    }
    row.opponentRating=evidence.filter(g=>g.homeConference===row.conference||g.awayConference===row.conference)
      .reduce((n,g)=>n+rhs[index.get(g.homeConference===row.conference?g.awayConference:g.homeConference)!],0)/row.games;
  }
  return {rows:rows.sort((a,b)=>(b.rating??-Infinity)-(a.rating??-Infinity)||a.conference.localeCompare(b.conference)),
    games:evidence.sort((a,b)=>b.week-a.week||(b.startDate??"").localeCompare(a.startDate??"")),components,excludedGames,venueAdjustment,ridge,marginCap};
}
