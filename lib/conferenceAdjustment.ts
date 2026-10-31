import { buildConferenceComparison, type ConferenceGame, type ConferenceTeam } from "./conferenceComparison";

export type TeamConferenceAdjustment={points:number;games:number;week:number};

/** A residual correction, in score-margin points, beyond the existing team model. */
export function buildConferenceAdjustments(teams:readonly ConferenceTeam[],games:readonly ConferenceGame[],week:number):Map<string,TeamConferenceAdjustment>{
  // Independents do not share a schedule silo; estimate them individually.
  const field=teams.map(t=>({...t,conference:/independent/i.test(t.conference??"")?`Unaffiliated: ${t.team}`:t.conference}));
  const report=buildConferenceComparison(field,games,week);
  const names=report.rows.map(r=>r.conference),index=new Map(names.map((name,i)=>[name,i]));
  const ridge=8,residualCap=21,maxAdjustment=6;
  const matrix=names.map((_,i)=>names.map((_,j)=>i===j?ridge:0)),rhs=names.map(()=>0),samples=names.map(()=>0);
  const neighbors=names.map(()=>new Set<number>());
  for(const game of report.games){
    if(game.homeMarginDelta===null)continue;
    const h=index.get(game.homeConference)!,a=index.get(game.awayConference)!;
    // Remove any previously applied conference correction from the forecast
    // baseline so repeated refreshes estimate a level, rather than a remainder.
    const previous=Number.isFinite(game.predictionConferenceMargin)?Number(game.predictionConferenceMargin):0;
    const residual=Math.max(-residualCap,Math.min(residualCap,game.homeMarginDelta+previous));
    matrix[h][h]++;matrix[a][a]++;matrix[h][a]--;matrix[a][h]--;
    rhs[h]+=residual;rhs[a]-=residual;samples[h]++;samples[a]++;
    neighbors[h].add(a);neighbors[a].add(h);
  }
  for(let k=0;k<names.length;k++){
    const divisor=matrix[k][k];for(let j=k;j<names.length;j++)matrix[k][j]/=divisor;rhs[k]/=divisor;
    for(let i=0;i<names.length;i++){if(i===k)continue;const scale=matrix[i][k];for(let j=k;j<names.length;j++)matrix[i][j]-=scale*matrix[k][j];rhs[i]-=scale*rhs[k];}
  }
  // A common scale preserves the network's zero center and disconnected groups.
  const scales=names.map(()=>1),visited=new Set<number>();
  for(let i=0;i<names.length;i++){
    if(visited.has(i))continue;
    const component:number[]=[],stack=[i];visited.add(i);
    while(stack.length){const k=stack.pop()!;component.push(k);for(const n of neighbors[k])if(!visited.has(n)){visited.add(n);stack.push(n);}}
    const scale=Math.min(1,maxAdjustment/Math.max(maxAdjustment,...component.map(k=>Math.abs(rhs[k]))));
    for(const k of component)scales[k]=scale;
  }
  return new Map(field.map(t=>{const name=t.conference?.trim()||"Unassigned",i=index.get(name)!;
    return[t.team,{points:(rhs[i]??0)*(scales[i]??1),games:samples[i]??0,week}];}));
}
