import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldForecastScheduleGame} from '../lib/scheduleForecastPolicy';
import {capsuleResults} from '../lib/teamCapsule';
const final={gameId:'week-7',week:7,seasonType:'regular',completed:true,homeTeam:'Alabama',awayTeam:'Georgia',homePoints:31,awayPoints:24,neutralSite:false,pregameHomeScore:29,pregameAwayScore:28};
test('new finals survive a model profile lag and produce current MOV and expectation deltas',()=>{
 assert.equal(shouldForecastScheduleGame(final,true,6,true),false);
 const [home]=capsuleResults('Alabama',8,[final],new Set(['Alabama','Georgia']));
 const [away]=capsuleResults('Georgia',8,[final],new Set(['Alabama','Georgia']));
 assert.equal(home.margin,7);assert.equal(home.expected,1);assert.equal(home.delta,6);
 assert.equal(away.margin,-7);assert.equal(away.delta,-6);
 assert.equal(capsuleResults('Alabama',6,[final],new Set(['Alabama','Georgia'])).length,0);
});
test('upcoming games remain projected and explicit historical simulations can still forecast later games',()=>{
 assert.equal(shouldForecastScheduleGame({...final,completed:false},true,6,true),true);
 assert.equal(shouldForecastScheduleGame(final,true,6,false),true);
 assert.equal(shouldForecastScheduleGame(final,false,6,false),false);
 assert.equal(shouldForecastScheduleGame({...final,seasonType:'postseason'},true,6,false),false);
});
