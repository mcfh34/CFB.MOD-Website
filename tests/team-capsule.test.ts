import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {capsuleResults,capsuleForm,capsuleOpponentSplits,type CapsuleGame} from '../lib/teamCapsule';
const g=(id:string,week:number,away='B'):CapsuleGame=>({gameId:id,week,seasonType:'regular',completed:true,neutralSite:false,homeTeam:'A',awayTeam:away,homePoints:30,awayPoints:20,pregameHomeScore:28,pregameAwayScore:21});
describe('team capsule evidence',()=>{
 it('respects the selected snapshot and excludes FCS from expectation trends',()=>{
 const rows=capsuleResults('A',2,[g('1',1),g('2',2,'FCS'),g('3',3)],new Set(['A','B']));
 assert.equal(rows.length,2);assert.equal(rows[0].delta,3);assert.equal(rows[1].delta,null);assert.equal(capsuleForm(rows).graded,1);
 });
 it('inverts margins and yardage correctly when the team is away',()=>{
 const rows=capsuleResults('B',1,[{...g('1',1),homeActualStats:{yardsPerPlay:6},awayActualStats:{yardsPerPlay:5}}],new Set(['A','B']));
 assert.equal(rows[0].margin,-10);assert.equal(rows[0].expected,-7);assert.equal(rows[0].delta,-3);assert.equal(rows[0].offYpp,5);assert.equal(rows[0].defYpp,6);assert.equal(rows[0].site,'Away');
 });
 it('compares opponent units only when both groups meet the evidence threshold',()=>{
 const games=Array.from({length:6},(_,i)=>({...g(String(i),i+1),opponentUnitRanks:{passDefenseRank:i<3?10:100}} as CapsuleGame));
 const rows=capsuleResults('A',6,games,new Set(['A','B']));
 const split=capsuleOpponentSplits(rows,138);assert.equal(split.length,1);assert.equal(split[0].strongGames,3);assert.equal(split[0].otherGames,3);
 });
 it('leaves missing dated forecasts ungraded and requires three games per opponent group',()=>{
 const rows=capsuleResults('A',1,[{...g('1',1),pregameHomeScore:null}],new Set(['A','B']));
 assert.equal(capsuleForm(rows).average,null);assert.deepEqual(capsuleOpponentSplits(rows,138),[]);
 });
});
