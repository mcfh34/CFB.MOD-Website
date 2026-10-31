import type {MatchupEvidence} from './matchupModel';
const keys=['fbsScoringMargin','fcsResultAdjustment','fcsGamesPlayed','fbsGamesPlayed','fbsPlays','scheduleConnectivity'] as const;
/** Preserve absent evidence as absent; zero FBS games must remain an explicit zero. */
export function scoringEvidenceFields(source:object|null|undefined):Partial<Pick<MatchupEvidence,typeof keys[number]>>{
 const row=(source??{}) as Record<string,unknown>;
 return Object.fromEntries(keys.filter(key=>typeof row[key]==='number'&&Number.isFinite(row[key])).map(key=>[key,row[key]]));
}
