import test from "node:test";
import assert from "node:assert/strict";
import {buildWeeklyPreviews} from "../lib/weeklyPreview";

test("similar matchups rotate wording while different scoring profiles change the analysis",()=>{
  const base={season:2026,week:3,completed:false,homeTeam:"A",awayTeam:"B",homePoints:null,awayPoints:null,homeWinProbability:.6};
  const rows=buildWeeklyPreviews(Array.from({length:4},(_,i)=>({...base,gameId:String(i),predictedHomeScore:i===0?40:21,predictedAwayScore:i===0?35:17})),[]);
  assert.equal(new Set(rows.map(row=>row.notes[0])).size,4);
  assert.match(rows[0].notes.join(" "),/75 combined points/);
  assert.match(rows[1].notes.join(" "),/38 combined points/);
  assert.deepEqual(rows,buildWeeklyPreviews(rows.map(row=>row.game),[]));
});

test("previews isolate upcoming regular games and identify competitive conference contenders",()=>{
  const game={gameId:"one",season:2026,week:3,completed:false,homeTeam:"A",awayTeam:"B",homeConference:"SEC",awayConference:"SEC",homePoints:null,awayPoints:null,predictedHomeScore:28,predictedAwayScore:25,homeWinProbability:.6};
  const rows=buildWeeklyPreviews([game,{...game,gameId:"final",completed:true},{...game,gameId:"bowl",seasonType:"postseason"}],[{team:"A",rank:4},{team:"B",rank:18}]);
  assert.equal(rows.length,1);
  assert.ok(rows[0].upset&&rows[0].conference&&rows[0].playoff);
  assert.match(rows[0].notes.join(" "),/40%/);
  assert.match(rows[0].notes.join(" "),/head-to-head/);
  assert.equal(game.homePoints,null);
});
test("missing forecasts remain unavailable and independent teams are not a conference race",()=>{
  const rows=buildWeeklyPreviews([{gameId:"x",season:2025,week:2,completed:false,homeTeam:"A",awayTeam:"B",homeConference:"FBS Independents",awayConference:"FBS Independents",homePoints:null,awayPoints:null,predictedHomeScore:null,predictedAwayScore:null,homeWinProbability:null}],[]);
  assert.equal(rows[0].conference,false);
  assert.equal(rows[0].upset,false);
  assert.match(rows[0].notes[0],/not available/);
});
test("weekly previews favor the teams ranked in that week's AP poll",()=>{
  const game=(id:string,homeTeam:string,awayTeam:string)=>({gameId:id,season:2026,week:5,completed:false,homeTeam,awayTeam,homePoints:null,awayPoints:null,predictedHomeScore:28,predictedAwayScore:21,homeWinProbability:.7});
  const rows=buildWeeklyPreviews([game("unranked","C","D"),game("ranked","A","B")],[],[{team:"A",rank:4},{team:"B",rank:9}]);
  assert.equal(rows[0].game.gameId,"ranked");
  assert.equal(rows[0].homeApRank,4);
});
