import snapshot from './data/reviewed-week-2026-7.json';
import latestSnapshot from './data/reviewed-week-2026-8.json';
import currentSnapshot from './data/reviewed-week-2026-9.json';
import type {NormalizedGame} from './dataPipeline';

/** A fixed, reviewed recovery dataset. No request-supplied scores are accepted. */
export const reviewedResultsSnapshot=snapshot;
export type ReviewedResultsSnapshot=typeof snapshot;
export const reviewedResultsSnapshots:ReviewedResultsSnapshot[]=[snapshot,latestSnapshot,currentSnapshot];
export function selectReviewedResults(stored:NormalizedGame[],now=Date.now(),reviewed:ReviewedResultsSnapshot=snapshot){
 const snapshot=reviewed;
 const byId=new Map(stored.map(game=>[game.id,game]));
 return snapshot.games.flatMap(result=>{
  const game=byId.get(result.id);
  if(!game)return [];
  if(game.season!==snapshot.season||game.week!==snapshot.week||game.seasonType!=='regular'
    ||game.homeTeam!==result.homeTeam||game.awayTeam!==result.awayTeam
    ||!game.startDate||Math.abs(Date.parse(game.startDate)-Date.parse(result.startDate))>36*3600_000
    ||Date.parse(result.startDate)>now-8*3600_000)throw Error(`Reviewed result identity mismatch: ${result.id}`);
  if(game.completed&&(game.homePoints!==result.homePoints||game.awayPoints!==result.awayPoints))throw Error(`Stored final conflicts with reviewed result: ${result.id}`);
  return [{...game,completed:true,startDate:result.startDate,homePoints:result.homePoints,awayPoints:result.awayPoints}];
 });
}
