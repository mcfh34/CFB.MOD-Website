export type PassingBox={gameId:string;week:number;team:string;opponent:string;attempts:number|null;yards:number|null;completions:number|null};
export function archivePassingRows(boxes:PassingBox[],team:string,byGame:boolean){
 const own=boxes.filter(r=>r.team===team);
 const production=(rows:PassingBox[])=>{
  const known=rows.filter(r=>r.attempts!==null&&r.yards!==null);if(!known.length)return {};
  const attempts=known.reduce((n,r)=>n+r.attempts!,0),totalYards=known.reduce((n,r)=>n+r.yards!,0);
  const complete=known.every(r=>r.completions!==null),completions=complete?known.reduce((n,r)=>n+r.completions!,0):null;
  return {attempts,totalYards,yardsPerAttempt:attempts?totalYards/attempts:null,completions,completionRate:complete&&attempts?completions!/attempts:null};
 };
 if(!own.length)return [];
 return byGame?own.map(r=>({team,gameId:r.gameId,week:r.week,opponent:r.opponent,offense:production([r]),defense:production(boxes.filter(o=>o.gameId===r.gameId&&o.team!==team))})):[{team,offense:production(own),defense:production(boxes.filter(r=>r.opponent===team))}];
}
