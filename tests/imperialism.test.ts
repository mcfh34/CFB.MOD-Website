import assert from "node:assert/strict";
import test from "node:test";
import { connectedTerritories, imperialismStages, largestInteriorSquares, territoryOwners } from "../lib/imperialism";

test("all-years timeline preserves empires across seasons and separates the same week in different years",()=>{
 const games=[
  {id:"1",season:2014,week:1,seasonType:"regular",startDate:"2014-09-01",homeTeam:"A",awayTeam:"B",homePoints:28,awayPoints:7},
  {id:"2",season:2015,week:1,seasonType:"regular",startDate:"2015-09-01",homeTeam:"C",awayTeam:"A",homePoints:21,awayPoints:10},
 ];
 const timeline=imperialismStages(games,true);
 assert.deepEqual(timeline.map(stage=>stage.label),["2014 · Opening map","2014 · Week 1","2015 · Week 1"]);
 assert.deepEqual([...territoryOwners(["A","B","C"],games,timeline[1].count).values()],["A","A","C"]);
 assert.deepEqual([...territoryOwners(["A","B","C"],games,timeline[2].count).values()],["C","C","C"]);
});

test("a winner takes the loser's accumulated empire, even after the winner lost its original land", () => {
  const games = [
    { id:"1",week:1,seasonType:"regular",startDate:"2026-09-01",homeTeam:"A",awayTeam:"B",homePoints:28,awayPoints:7 },
    { id:"2",week:2,seasonType:"regular",startDate:"2026-09-08",homeTeam:"C",awayTeam:"A",homePoints:21,awayPoints:10 },
    { id:"3",week:3,seasonType:"regular",startDate:"2026-09-15",homeTeam:"B",awayTeam:"C",homePoints:17,awayPoints:14 },
  ];
  assert.deepEqual([...territoryOwners(["A","B","C"],games,0).values()], ["A","B","C"]);
  assert.deepEqual([...territoryOwners(["A","B","C"],games,2).values()], ["C","C","C"]);
  assert.deepEqual([...territoryOwners(["A","B","C"],games,3).values()], ["B","B","B"]);
});

test("a tie does not transfer land", () => {
  const owners=territoryOwners(["A","B"],[
    { id:"1",week:1,seasonType:"regular",startDate:"2026-09-01",homeTeam:"A",awayTeam:"B",homePoints:20,awayPoints:20 },
  ],1);
  assert.equal(owners.get("A"),"A");
  assert.equal(owners.get("B"),"B");
});

test("FCS games cannot transfer land to or from FCS teams", () => {
  const games=[
    { id:"1",week:1,seasonType:"regular",startDate:"2026-09-01",homeTeam:"FBS",awayTeam:"FCS",homePoints:10,awayPoints:17 },
    { id:"2",week:2,seasonType:"regular",startDate:"2026-09-08",homeTeam:"FCS",awayTeam:"Other",homePoints:7,awayPoints:28 },
  ];
  assert.equal(territoryOwners(["FBS","Other"],games,1).get("FBS"),"FBS");
  assert.equal(territoryOwners(["FBS","Other"],games,2).get("FBS"),"FBS");
});

test("separate holdings get separate marks until land connects them", () => {
  const neighbors=[[1],[0,2],[1,3],[2]];
  assert.deepEqual(connectedTerritories(["A","A","B","A"],neighbors),[
    {owner:"A",counties:[0,1]},{owner:"B",counties:[2]},{owner:"A",counties:[3]},
  ]);
  assert.deepEqual(connectedTerritories(["A","A","A","A"],neighbors),[
    {owner:"A",counties:[0,1,2,3]},
  ]);
});

test("logos fit in a contiguous interior square rather than a shape's outside centroid", () => {
  // Region 1 is a C shape around region 2; its bounding-box center is occupied by 2.
  const rows=["1111111","1222221","1222221","1222221","1111111"];
  const labels=Uint16Array.from(rows.join(""),Number);
  const squares=largestInteriorSquares(labels,7,5);
  assert.equal(squares.get(1)?.side,1);
  assert.equal(squares.get(2)?.side,3);
  const center=squares.get(2)!;
  assert.equal(labels[Math.round(center.y)*7+Math.round(center.x)],2);
});
