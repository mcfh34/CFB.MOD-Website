import test from "node:test";
import assert from "node:assert/strict";
import { archiveRushingRows } from "../lib/rushingArchive";
import { activePlayersNeedRefresh } from "../lib/playerFreshness";
test("rushing fallback joins opponents by game and computes weighted season average",()=>{
  const rows=[{gameId:"1",week:1,team:"A",opponent:"B",attempts:20,yards:100},
    {gameId:"1",week:1,team:"B",opponent:"A",attempts:30,yards:90},
    {gameId:"2",week:2,team:"A",opponent:"C",attempts:10,yards:100}];
  const season=archiveRushingRows(rows,"A",false)[0];
  assert.equal(season.offense.yardsPerCarry,200/30);
  assert.equal(season.defense.totalRushingYards,90);
  assert.deepEqual(archiveRushingRows(rows,"A",true)[1].defense,{});
  assert.deepEqual(archiveRushingRows(rows,"D",false),[]);
});
test("current player refresh resumes partial work and detects new box scores",()=>{
  const now=Date.parse("2026-09-10T12:00:00Z");
  assert.equal(activePlayersNeedRefresh({ready:false,updatedAt:null},null,now),false);
  assert.equal(activePlayersNeedRefresh({ready:true,updatedAt:"2026-09-10 11:00:00"},null,now),false);
  assert.equal(activePlayersNeedRefresh({ready:true,updatedAt:"2026-09-10 11:00:00"},"2026-09-10 11:30:00",now),true);
  assert.equal(activePlayersNeedRefresh({ready:true,updatedAt:"2026-09-08 11:00:00"},null,now),true);
});
