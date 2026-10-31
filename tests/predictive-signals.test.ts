import test from "node:test";
import assert from "node:assert/strict";
import { buildTurnoverSignals, matchupTurnovers, parsePlayerRushes, rushingPersonnel, sustainableRunMultiplier, turnoverProfile, type GameSignalRow } from "../lib/predictiveSignals";

const game=(gameId:string,week:number,team:string,opponent:string,points:number,turnovers:number):GameSignalRow=>({gameId,week,team,opponent,points,turnovers,rushYards:150,rushAttempts:30,sacksAllowed:3,sackYardsLost:21});

test("surprise turnovers adjust learned points without erasing turnover propensity",()=>{
  const rows=[game("one",1,"A","B",31,1),game("one",1,"B","A",24,1),game("two",2,"A","B",21,4),game("two",2,"B","A",34,0)];
  const signals=buildTurnoverSignals(rows,new Set(["one","two"]));
  assert.ok(Math.abs(signals.get("one\u0000A")!.predictivePoints-31)<1);
  assert.ok(signals.get("two\u0000A")!.predictivePoints>21);
  assert.ok(signals.get("two\u0000B")!.predictivePoints<34);
  const prior=turnoverProfile(rows,"A",1)!;
  const later=turnoverProfile(rows,"A",2)!;
  assert.equal(prior.lostPerGame,1);
  assert.equal(later.lostPerGame,2.5);
  assert.ok(matchupTurnovers(later,turnoverProfile(rows,"B",2))!>matchupTurnovers(prior,turnoverProfile(rows,"B",1))!);
});

test("player rush split removes QB sack yards and tempers RB deficient rushing",()=>{
  const rows=[game("one",1,"A","B",24,1)];
  const players=parsePlayerRushes([
    {gameId:"one",week:1,team:"A",playerId:10,attempts:12,totalRushingYards:15,sacks:3},
    {gameId:"one",week:1,team:"A",playerId:11,attempts:20,totalRushingYards:55},
  ],new Map([["10","QB"],["11","RB"]]),rows);
  assert.deepEqual(players.map(player=>[player.carries,player.yards]),[[9,36],[20,55]]);
  const split=rushingPersonnel(rows,players,"A",1)!;
  assert.equal(split.rbYpc,2.75);
  assert.equal(split.qbYpc,4);
  assert.equal(split.teamYpc,5);
  assert.ok(sustainableRunMultiplier(split)<1);
  assert.equal(rushingPersonnel(rows,players,"A",0),null);
});

test("QB rushing stays in team production while the RB correction touches only RB carries",()=>{
  const rows=[{...game("qb-run",1,"A","B",31,0),rushYards:160,rushAttempts:32,sacksAllowed:2,sackYardsLost:12}];
  const players=parsePlayerRushes([
    {gameId:"qb-run",week:1,team:"A",playerId:10,attempts:12,totalRushingYards:58,sacks:2},
    {gameId:"qb-run",week:1,team:"A",playerId:11,attempts:20,totalRushingYards:90},
  ],new Map([["10","QB"],["11","RB"]]),rows);
  assert.deepEqual(players.map(({carries,yards})=>[carries,yards]),[[10,70],[20,90]]);
  const split=rushingPersonnel(rows,players,"A",1)!;
  assert.equal(split.qbYpc,7);
  assert.equal(split.rbYpc,4.5);
  assert.equal(split.teamYpc,5);
  const factor=sustainableRunMultiplier(split);
  assert.ok(factor<1);
  assert.ok(factor>sustainableRunMultiplier({...split,rbShare:1}));
  assert.ok(5*factor>4.5);
});
