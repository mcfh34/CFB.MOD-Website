import type { ScoreReconciliation } from "../../lib/scoringModel";
import type { RosterProjection } from "../../lib/rosterModel";
export type ScoreExplanationData={
  reconciliation?:ScoreReconciliation;
  roster?:{home:RosterProjection|null;away:RosterProjection|null};
  quarterbackScenarios?:{homeQuarterback:string|null;awayQuarterback:string|null;probability:number;homeScore:number;awayScore:number}[];
};
export function ScoreExplanation({data,home,away}:{data:ScoreExplanationData|undefined;home:string;away:string}) {
  if(!data?.reconciliation)return null;
  const r=data.reconciliation;
  return <details className="score-explanation"><summary>Score calculation and roster evidence</summary>
    <p>RAW: {home} {r.rawHome.toFixed(1)} · {away} {r.rawAway.toFixed(1)} · ADJUSTED TOTAL {r.finalTotal.toFixed(1)}</p>
    <div className="score-explanation-scroll"><table><caption>Contributions to {home}’s winning margin; negative values favor {away}</caption><thead><tr><th>Component</th><th>Points</th></tr></thead><tbody>{r.components.map(c=><tr key={c.id}><td>{c.label}</td><td>{c.points>=0?"+":""}{c.points.toFixed(2)}</td></tr>)}<tr><th>Final margin</th><th>{r.margin.toFixed(2)}</th></tr></tbody></table></div>
    {(["home","away"] as const).map(side=>{
      const roster=data.roster?.[side];const name=side==="home"?home:away;
      return roster?<section key={side}><h3>{name} roster</h3>
        <p><a href={roster.sourceUrl} target="_blank" rel="noreferrer">{roster.sourceKind==="model_projection"?"Projected lineup — not official":"Lineup source"}</a> · {roster.publishedAt} · {Math.round(roster.coverage*100)}% matched prior-player evidence</p>
        <div className="score-explanation-scroll"><table><thead><tr><th>Unit</th><th>Continuity</th><th>Incoming share</th><th>Uncertainty</th><th>Evidence</th></tr></thead><tbody>{Object.values(roster.units).map(u=><tr key={u.unit}><th>{u.unit}</th><td>{u.continuity===null?"Unknown":`${Math.round(u.continuity*100)}%`}</td><td>{Math.round(u.incomingShare*100)}%</td><td>{u.uncertainty>.65?"High":u.uncertainty>.35?"Moderate":"Low"}</td><td>{u.evidence.replaceAll("-"," ")}</td></tr>)}</tbody></table></div>
        <p>Shares describe projected roles, not measured snaps. Coaching: {roster.coaching}. Missing evidence does not establish an injury or a roster downgrade.</p>
      </section>:null;
    })}
    {(data.quarterbackScenarios?.length??0)>1?<div className="score-explanation-scroll"><table><caption>Quarterback scenarios</caption><thead><tr><th>{home}</th><th>{away}</th><th>Weight</th><th>Score</th></tr></thead><tbody>{data.quarterbackScenarios!.map((q,i)=><tr key={i}><td>{q.homeQuarterback??"Baseline"}</td><td>{q.awayQuarterback??"Baseline"}</td><td>{Math.round(q.probability*100)}%</td><td>{q.homeScore.toFixed(1)}–{q.awayScore.toFixed(1)}</td></tr>)}</tbody></table></div>:null}
  </details>;
}
