import test from 'node:test';
import assert from 'node:assert/strict';
import {actualGameDirection} from '../lib/gameDirectional';
const passing=(gameId:string,week:number,team:string,opponent:string,attempts:number,yards:number,completions:number)=>({gameId,week,team,opponent,offense:{locations:{'short left':{attempts,completions,totalYardsAttemptsAvailable:attempts,totalYards:yards}},locationEligibleAttempts:attempts},defense:{locations:{'short left':{attempts,completions,totalYardsAttemptsAvailable:attempts,totalYards:yards}},locationEligibleAttempts:attempts}});
const rushing=(gameId:string,week:number,team:string,opponent:string,carries:number,yards:number)=>({gameId,week,team,opponent,offense:{directions:{left:{carries,yards}},directionEligibleAttempts:carries},defense:{directions:{left:{carries,yards}},directionEligibleAttempts:carries}});
test('completed game compares its own passing and rushing output with opponent other games through cutoff',()=>{
 const side=actualGameDirection({gameId:'g',week:2,team:'A',opponent:'B',passing:[passing('g',2,'A','B',4,40,3)],opponentPassing:[passing('g',2,'B','A',4,40,3),passing('old',1,'B','C',8,40,5),passing('later',3,'B','D',8,160,5)],rushing:[rushing('g',2,'A','B',5,40)],opponentRushing:[rushing('old',1,'B','C',10,50),rushing('later',3,'B','D',10,200)]});
 assert.equal(side.passing[0].completions,3);assert.equal(side.passing[0].attempts,4);assert.equal(side.passing[0].yardsPerAttempt,10);assert.equal(side.passing[0].relativePercent,100);
 assert.equal(side.rushing[0].yardsPerAttempt,8);assert.ok(Math.abs(side.rushing[0].relativePercent!-60)<1e-8);
});
test('actual percentage needs three game attempts and three baseline attempts',()=>{
 const side=actualGameDirection({gameId:'g',week:2,team:'A',opponent:'B',passing:[passing('g',2,'A','B',2,40,1)],opponentPassing:[passing('old',1,'B','C',2,20,1)],rushing:[rushing('g',2,'A','B',2,20)],opponentRushing:[rushing('old',1,'B','C',2,10)]});
 assert.equal(side.passing[0].relativePercent,null);assert.equal(side.rushing[0].relativePercent,null);
});
