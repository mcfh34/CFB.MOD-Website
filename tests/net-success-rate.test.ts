import test from "node:test";
import assert from "node:assert/strict";
import { buildNetSuccessReport, buildSeasonNetReport, selectNetSuccessRows, netSuccessConferenceGroup, NET_GAME_METRICS, type NetSuccessGame } from "../lib/netSuccessRate";
import { GET } from "../app/api/net-success-rate/route";
const fbs = new Set(["A","B","C","D"]);
const base: NetSuccessGame = { gameId:"1",season:2014,week:2,seasonType:"regular",completed:true,homeTeam:"A",awayTeam:"B",homePoints:21,awayPoints:14,homeSuccessRate:.5,awaySuccessRate:.3,homeLogo:"a.png",awayLogo:"b.png" };
test("weekly selection excludes other years, weeks, postseason and incomplete games",()=>{
  const games=[base,{...base,gameId:"2",season:2015},{...base,gameId:"3",week:1},{...base,gameId:"4",seasonType:"postseason"},{...base,gameId:"5",completed:false}];
  const report=buildNetSuccessReport(games,fbs,2014,2);
  assert.equal(report.completedGames,1);assert.equal(report.rows[0].winner,"A");assert.ok(Math.abs(report.rows[0].netSuccessRate-.2)<1e-12);
  assert.equal(buildNetSuccessReport(games,fbs,2014,2,"postseason").rows[0].gameId,"4");
});
test("FCS games are excluded using the selected season's FBS directory",()=>{
  const report=buildNetSuccessReport([base,{...base,gameId:"2",awayTeam:"FCS"}],fbs,2014,2);
  assert.equal(report.completedGames,1);assert.equal(report.missingGames,0);
  assert.equal(buildNetSuccessReport([base],new Set(["A"]),2014,2).completedGames,0);
});
test("away winners orient scores, logos and the success-rate delta correctly",()=>{
  const row=buildNetSuccessReport([{...base,awayPoints:28}],fbs,2014,2).rows[0];
  assert.equal(row.winner,"B");assert.equal(row.loser,"A");assert.equal(row.winnerLogo,"b.png");assert.equal(row.winnerPoints,28);assert.equal(row.loserPoints,21);
  assert.equal(row.winnerSuccessRate,.3);assert.ok(Math.abs(row.netSuccessRate+.2)<1e-12);
});
test("zero is a real success rate; missing and invalid rates count as missing, not zero",()=>{
  const games=[{...base,homeSuccessRate:0},{...base,gameId:"2",homeSuccessRate:null},{...base,gameId:"3",awaySuccessRate:NaN},{...base,gameId:"4",homeSuccessRate:1.2}];
  const report=buildNetSuccessReport(games,fbs,2014,2);assert.equal(report.rows.length,1);assert.equal(report.rows[0].netSuccessRate,-.3);assert.equal(report.missingGames,3);
});
test("missing final scores are excluded and duplicate games do not inflate coverage",()=>{
  const report=buildNetSuccessReport([base,base,{...base,gameId:"2",awayPoints:null}],fbs,2014,2);assert.equal(report.completedGames,1);assert.equal(report.rows.length,1);
});
test("games sort by winner net success rate, retaining wins with lower success rates",()=>{
  const report=buildNetSuccessReport([base,{...base,gameId:"2",homeTeam:"C",awayTeam:"D",homeSuccessRate:.7,awaySuccessRate:.2},{...base,gameId:"3",awayPoints:28}],fbs,2014,2);
  assert.deepEqual(report.rows.map(row=>row.gameId),["3","1","2"]);
});
test("empty and tied results remain well defined",()=>{
  assert.deepEqual(buildNetSuccessReport([],fbs,2014,2),{season:2014,week:2,seasonType:"regular",rows:[],completedGames:0,missingGames:0});
  assert.equal(buildNetSuccessReport([{...base,awayPoints:21}],fbs,2014,2).rows[0].tied,true);
});
test("API rejects invalid and absent selections before accessing data",async()=>{
  for(const params of ["","season=2013&week=1","season=2014&week=-1","season=2014&week=1.5","season=2014&week=1&seasonType=bad","season=2014"]){
    const response=await GET(new Request(`https://example.com/api/net-success-rate?${params}`));assert.equal(response.status,400);
  }
});

test("conference and group filters include either participant without losing cross-group games",()=>{
  const rows=buildNetSuccessReport([
    {...base,homeConference:"SEC",awayConference:"Sun Belt"},
    {...base,gameId:"2",homeConference:"Big Ten",awayConference:"ACC"},
    {...base,gameId:"3",homeConference:"FBS Independents",awayConference:"FBS Independents"},
  ],fbs,2014,2).rows;
  assert.equal(selectNetSuccessRows(rows,"All conferences","power4","netSuccessRate","asc").length,2);
  assert.deepEqual(selectNetSuccessRows(rows,"All conferences","group6","netSuccessRate","asc").map(row=>row.gameId),["1"]);
  assert.deepEqual(selectNetSuccessRows(rows,"Sun Belt","all","netSuccessRate","asc").map(row=>row.gameId),["1"]);
  assert.deepEqual(selectNetSuccessRows(rows,"All conferences","other","netSuccessRate","asc").map(row=>row.gameId),["3"]);
  assert.equal(selectNetSuccessRows(rows,"SEC","group6","netSuccessRate","asc").length,0);
});
test("conference aliases share the same group and conference filter",()=>{
  assert.equal(netSuccessConferenceGroup("American Athletic Conference"),"group6");assert.equal(netSuccessConferenceGroup("Pac 12"),"group6");
  const rows=buildNetSuccessReport([{...base,homeConference:"American",awayConference:"SEC"}],fbs,2014,2).rows;
  assert.equal(selectNetSuccessRows(rows,"American Athletic","group6","netSuccessRate","asc").length,1);
});
test("other statistics can reorder games in either direction while retaining actual Net SR",()=>{
  const rows=buildNetSuccessReport([base,{...base,gameId:"2",homePoints:42,awayPoints:3,homeSuccessRate:.2,awaySuccessRate:.1}],fbs,2014,2).rows;
  assert.deepEqual(selectNetSuccessRows(rows,"All conferences","all","margin","desc").map(row=>row.gameId),["2","1"]);
  assert.deepEqual(selectNetSuccessRows(rows,"All conferences","all","winnerSuccessRate","desc").map(row=>row.gameId),["1","2"]);
  assert.deepEqual(selectNetSuccessRows(rows,"All conferences","all","totalPoints","asc").map(row=>row.gameId),["1","2"]);
  assert.ok(Math.abs(selectNetSuccessRows(rows,"All conferences","all","margin","desc")[0].netSuccessRate-.1)<1e-12);
});
test("conference sorting uses the winner's season conference",()=>{
  const rows=buildNetSuccessReport([{...base,homeConference:"SEC"},{...base,gameId:"2",homeConference:"ACC"}],fbs,2014,2).rows;
  assert.deepEqual(selectNetSuccessRows(rows,"All conferences","all","conference","asc").map(row=>row.gameId),["2","1"]);
});

test("all net metrics accept their own units and do not require success-rate coverage",async()=>{
  const {NET_GAME_METRICS}=await import("../lib/netSuccessRate");
  assert.ok(NET_GAME_METRICS.some(metric=>metric.key==="ypa"));assert.ok(NET_GAME_METRICS.some(metric=>metric.key==="ypc"));
  for(const metric of NET_GAME_METRICS){const home=metric.format==="rate"?.6:7.5,away=metric.format==="rate"?.3:2.5;
    const report=buildNetSuccessReport([{...base,homeSuccessRate:null,awaySuccessRate:null,homeValues:{[metric.key]:home},awayValues:{[metric.key]:away}}],fbs,2014,2,"regular",metric.key);
    assert.equal(report.rows.length,1,metric.key);assert.ok(Math.abs(report.rows[0].netSuccessRate-(home-away))<1e-10,metric.key);
    assert.equal(buildNetSuccessReport([{...base,homeValues:{[metric.key]:null},awayValues:{[metric.key]:away},homeSuccessRate:null}],fbs,2014,2,"regular",metric.key).missingGames,1);
  }
});
test("YPA values above one and negative PPA remain valid; away winners reverse each stat",()=>{
  const report=buildNetSuccessReport([{...base,awayPoints:28,homeValues:{ypa:8.5},awayValues:{ypa:5.5}}],fbs,2014,2,"regular","ypa");assert.equal(report.rows[0].netSuccessRate,-3);
  assert.equal(buildNetSuccessReport([{...base,homeValues:{ppa:-.2},awayValues:{ppa:.1}}],fbs,2014,2,"regular","ppa").rows.length,1);
});

test("bar color follows the scoreboard winner at either signed endpoint",async()=>{
  const {netBarColor}=await import("../lib/netSuccessRate");
  assert.equal(netBarColor({winnerColor:"#9E1B32",netSuccessRate:0.2} as any),"#9E1B32");
  assert.equal(netBarColor({winnerColor:"#9E1B32",netSuccessRate:-0.2} as any),"#9E1B32");
  assert.equal(netBarColor({winnerColor:"invalid"} as any),"#475569");
});

test("season averages include each completed FBS game once per team for every net statistic",()=>{
  for(const metric of NET_GAME_METRICS){
    const rate=metric.format==="rate";
    const games:NetSuccessGame[]=[
      {...base,homeValues:{[metric.key]:rate?.6:8},awayValues:{[metric.key]:rate?.4:5}},
      {...base,gameId:"2",week:3,homeTeam:"C",awayTeam:"A",homePoints:24,awayPoints:21,homeValues:{[metric.key]:rate?.2:3},awayValues:{[metric.key]:rate?.5:7}},
      {...base,gameId:"3",week:4,awayTeam:"FCS",homeValues:{[metric.key]:rate?.9:99},awayValues:{[metric.key]:rate?.1:1}},
      {...base,gameId:"4",week:5,homeValues:{[metric.key]:null},awayValues:{[metric.key]:rate?.4:5}},
    ];
    const report=buildSeasonNetReport(games,fbs,2014,"regular",metric.key);
    const a=report.rows.find(row=>row.winner==="A")!;
    assert.equal(report.completedGames,3,metric.key);
    assert.equal(report.missingGames,1,metric.key);
    assert.equal(a.seasonGames,2,metric.key);
    assert.ok(Math.abs(a.netSuccessRate-(rate?.25:3.5))<1e-10,metric.key);
    assert.equal(report.rows.find(row=>row.winner==="B")?.seasonGames,1,metric.key);
  }
});
