/** Additional current-season regularization; never adds preseason team priors. */
export type MatchupPolicy={earlyFormWeight:number;extraShrinkage:number};
export const legacyMatchupPolicy:MatchupPolicy={earlyFormWeight:1,extraShrinkage:0};
// Selected on 2,773 training games (2021–24); 713 games in 2025 reserved for evaluation.
export const currentMatchupPolicy:MatchupPolicy={"earlyFormWeight":0.25,"extraShrinkage":0.35};
export function evidencePrecision(evidence:{gamesPlayed:number;fbsGamesPlayed?:number;fbsPlays?:number;scheduleConnectivity?:number}){
 const games=Math.max(0,evidence.fbsGamesPlayed??evidence.gamesPlayed);
 // Missing play counts use a clearly bounded 65-play/game estimate, not zero evidence.
 const possessions=Math.max(0,evidence.fbsPlays??games*65)/5.8;
 const volume=possessions/(possessions+60);
 const connectivity=Math.max(0,Math.min(1,evidence.scheduleConnectivity??.5));
 return volume*(.6+.4*connectivity);
}
