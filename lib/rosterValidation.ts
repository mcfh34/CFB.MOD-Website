export type RosterValidationRow={
  gameId:string;season:number;week:number;variant:string;home:number;away:number;probability:number;
  actualHome:number;actualAway:number;coverage:number;turnover:number|null;
};
export function summarizeRosterValidation(rows:RosterValidationRow[]) {
  const summarize=(sample:RosterValidationRow[])=>{
    const n=sample.length;const mean=(f:(r:RosterValidationRow)=>number)=>n?sample.reduce((a,r)=>a+f(r),0)/n:null;
    return {games:n,marginMae:mean(r=>Math.abs((r.home-r.away)-(r.actualHome-r.actualAway))),scoreMae:mean(r=>(Math.abs(r.home-r.actualHome)+Math.abs(r.away-r.actualAway))/2),brier:mean(r=>(r.probability-(r.actualHome>r.actualAway?1:0))**2),
      calibration:[0,.2,.4,.6,.8].map(lower=>{const bin=sample.filter(r=>r.probability>=lower&&(r.probability<lower+.2||lower===.8));return {lower,upper:lower+.2,games:bin.length,predicted:bin.length?bin.reduce((a,r)=>a+r.probability,0)/bin.length:null,actual:bin.length?bin.filter(r=>r.actualHome>r.actualAway).length/bin.length:null};})};
  };
  const coveredIds=new Set(rows.filter(r=>r.variant==="roster"&&r.coverage>=.6&&r.turnover!==null).map(r=>r.gameId));
  const variants=[...new Set(rows.map(r=>r.variant))].map(variant=>{
    const sample=rows.filter(r=>r.variant===variant);
    const matched=sample.filter(r=>coveredIds.has(r.gameId));
    return {variant,all:summarize(sample),covered:summarize(matched),stable:summarize(matched.filter(r=>r.turnover!==null&&r.turnover<.35)),rebuilt:summarize(matched.filter(r=>r.turnover!==null&&r.turnover>=.35))};
  });
  const base=variants.find(v=>v.variant==="baseline")?.covered;
  const candidate=variants.find(v=>v.variant==="roster")?.covered;
  const enough=!!base&&!!candidate&&candidate.games>=100;
  const improvement=enough&&candidate!.marginMae!<base!.marginMae!&&candidate!.scoreMae!<base!.scoreMae!&&candidate!.brier!<=base!.brier!;
  return {variants,coveredGames:coveredIds.size,eligibleForPromotion:improvement,status:!enough?"insufficient-dated-roster-coverage":improvement?"improved-on-this-holdout":"no-confirmed-improvement",minimumCoveredGames:100,
    methodology:"Same completed Week 1–5 FBS games across variants; prior-week statistics only; dated depth sources must precede the week's first kickoff. Stable/rebuilt splits use projected-role continuity, not measured snaps. Uncovered games cannot establish the benefit of roster changes.",
    limitation:"Retrospective reconstruction is not an immutable pregame forecast archive. Historical coaching, availability, roster membership and opponent-adjusted individual snap data are incomplete; no accuracy gain is certified from missing data."};
}
