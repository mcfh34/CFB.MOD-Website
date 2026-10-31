import test from 'node:test';
import assert from 'node:assert/strict';
import {projectedFinalRankingScore} from '../lib/simulation';
import type {BcsRankingRow} from '../lib/rankings';
const row=(patch:Partial<BcsRankingRow>={})=>({wins:11,losses:1,ties:0,resultsScore:.95,computerScore:.95,scheduleScore:.94,scheduleStrength:.81,bestOpponentStrength:.88,qualityWinStrength:.88,...patch}) as BcsRankingRow;
const games=(wins:number,losses:number)=>Array.from({length:wins+losses},(_,i)=>({opponent:`Opponent ${i}`,won:i<wins,seasonType:'regular'}));

test('12–1 champion with the stronger résumé and an avenged loss clears an 11–1 nonchampion',()=>{
 const championGames=games(11,1);
 championGames.push({opponent:'Opponent 11',won:true,seasonType:'conference-championship'});
 const champion=projectedFinalRankingScore(row({wins:12,resultsScore:.9778832117,computerScore:.9824817518,scheduleScore:.9890510949,scheduleStrength:.8647809484,bestOpponentStrength:.907915886,qualityWinStrength:.9065158687}),{expectedWins:10.4449178136,wins:12,losses:1,games:championGames});
 const independent=projectedFinalRankingScore(row({resultsScore:.9515328467,computerScore:.952026479,scheduleScore:.9459854015,scheduleStrength:.8161828314,bestOpponentStrength:.8876549273,qualityWinStrength:.8890025152}),{expectedWins:10.3576803626,wins:11,losses:1,games:games(11,1)});
 assert.ok(champion>independent);
});

test('a championship win receives credit; merely participating does not',()=>{
 const record={expectedWins:10,wins:11,losses:2,games:games(11,2)};
 const base=projectedFinalRankingScore(row(),record);
 const titleWin={...record,games:record.games.map((g,i)=>i===0?{...g,seasonType:'conference-championship'}:g)};
 const titleLoss={...record,games:record.games.map((g,i)=>i===12?{...g,seasonType:'conference-championship'}:g)};
 assert.ok(projectedFinalRankingScore(row(),titleWin)>base);
 assert.equal(projectedFinalRankingScore(row(),titleLoss),base);
});

test('only a later championship win earns avenged-loss credit and the loss stays in the record',()=>{
 const r={expectedWins:10,wins:12,losses:1,games:[{opponent:'Rival',won:false,seasonType:'regular'},...games(11,0),{opponent:'Rival',won:true,seasonType:'conference-championship'}]};
 const ordinaryTitle={...r,games:r.games.map((g,i)=>i===12?{...g,opponent:'Other'}:g)};
 assert.ok(projectedFinalRankingScore(row(),r)>projectedFinalRankingScore(row(),ordinaryTitle));
 const regularRematch={...r,games:r.games.map((g,i)=>i===12?{...g,seasonType:'regular'}:g)};
 const noRegularRematch={...regularRematch,games:regularRematch.games.map((g,i)=>i===12?{...g,opponent:'Other'}:g)};
 assert.equal(projectedFinalRankingScore(row(),regularRematch),projectedFinalRankingScore(row(),noRegularRematch));
 assert.equal(r.losses,1);
});

test('a weak-schedule champion does not automatically clear a strong one-loss nonchampion',()=>{
 const weak=projectedFinalRankingScore(row({resultsScore:.7,computerScore:.6,scheduleScore:.25,scheduleStrength:.3,bestOpponentStrength:.4,qualityWinStrength:.3}),{expectedWins:10,wins:12,losses:1,games:[...games(11,1),{opponent:'Other',won:true,seasonType:'conference-championship'}]});
 const strong=projectedFinalRankingScore(row(),{expectedWins:10.5,wins:11,losses:1,games:games(11,1)});
 assert.ok(strong>weak);
});

test('an unbeaten champion with the 70th schedule trails a proven one-loss team with the 19th schedule',()=>{
 const undefeated=projectedFinalRankingScore(row({wins:13,losses:0,resultsScore:.9927737226,computerScore:.9635036496,scheduleScore:.751459854,scheduleStrength:.6943269111,bestOpponentStrength:.7511960874,qualityWinStrength:.7511960874,sosRank:70}),{expectedWins:10.2878159476,wins:13,losses:0,games:[...games(12,0),{opponent:'Title opponent',won:true,seasonType:'conference-championship'}]},138);
 const oneLoss=projectedFinalRankingScore(row({sosRank:19,resultsScore:.9515328467,computerScore:.952026479,scheduleScore:.9459854015,scheduleStrength:.8161828314,bestOpponentStrength:.8876549273,qualityWinStrength:.8890025152}),{expectedWins:10.3576803626,wins:11,losses:1,games:games(11,1)},138);
 assert.ok(oneLoss>undefeated);
});

test('pure SOS distinguishes otherwise identical résumés and scales to each season field',()=>{
 const record={expectedWins:10,wins:11,losses:1,games:games(11,1)};
 const strongest=projectedFinalRankingScore(row({sosRank:1}),record,100);
 const weakest=projectedFinalRankingScore(row({sosRank:100}),record,100);
 assert.ok(Math.abs(strongest-weakest-.16)<1e-12);
 assert.equal(strongest,projectedFinalRankingScore(row({sosRank:1}),record,138));
 assert.equal(weakest,projectedFinalRankingScore(row({sosRank:138}),record,138));
});
