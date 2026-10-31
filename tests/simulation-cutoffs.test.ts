import test from 'node:test';
import assert from 'node:assert/strict';
import {simulationCutoffs} from '../lib/simulationCutoffs';
import {buildSeasonSimulation,type SimulationScheduleGame} from '../lib/simulation';
import type {RankingProfile} from '../lib/rankings';
const profile=(team:string):RankingProfile=>({team,conference:'Test',offYppIndex:1,offYpaIndex:1,offYpcIndex:1,defYppIndex:1,defYpaIndex:1,defYpcIndex:1});
test('week 8 finals stay final with week 6 profiles, while week 9 remains projected',()=>{
 const {resultsWeek,profileWeek}=simulationCutoffs(8,6);assert.equal(resultsWeek,8);assert.equal(profileWeek,6);
 const schedule=[7,8,9].map(week=>({gameId:String(week),week,seasonType:'regular',completed:true,neutralSite:false,conferenceGame:true,homeTeam:'A',awayTeam:'B',homeConference:'Test',awayConference:'Test',homePoints:3,awayPoints:42})) as SimulationScheduleGame[];
 const sim=buildSeasonSimulation(2026,8,resultsWeek,schedule,[profile('A'),profile('B')]);
 const a=sim.rankings.find(row=>row.team==='A')!;
 assert.equal(a.schedule.find(g=>g.gameId==='7')?.status,'final');
 assert.equal(a.schedule.find(g=>g.gameId==='8')?.status,'final');
 assert.equal(a.schedule.find(g=>g.gameId==='8')?.teamScore,3);
 assert.equal(a.schedule.find(g=>g.gameId==='8')?.opponentScore,42);
 assert.equal(a.schedule.find(g=>g.gameId==='9')?.status,'projected');
});
test('preseason and historical selections never read profiles beyond their selected week',()=>{
 assert.deepEqual(simulationCutoffs(0,8),{resultsWeek:0,profileWeek:0});
 assert.deepEqual(simulationCutoffs(4,8),{resultsWeek:4,profileWeek:4});
});
