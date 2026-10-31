import test from "node:test";
import assert from "node:assert/strict";
import { buildWeeklyDirectionalProfiles, directionalRunMultiplier, directionalMatchup, rushingRelativeMatchup, parseDirectionalGames } from "../lib/rushingMatchup";
import { formulaRevision, MODEL_FORMULA_REVISION } from "../lib/dataPipeline";

test("2026 direction is point-in-time, opponent-relative and bounded", () => {
  const payload = [
    { gameId: 1, week: 1, team: "A", opponent: "B", offense: { directions: { left: { carries: 50, yards: 300 }, middle: { carries: 20, yards: 60 }, right: { carries: 20, yards: 60 } } }, defense: { directions: { left: { carries: 30, yards: 90 }, middle: { carries: 30, yards: 90 }, right: { carries: 30, yards: 90 } } } },
    { gameId: 1, week: 1, team: "B", opponent: "A", offense: { directions: { left: { carries: 30, yards: 90 }, middle: { carries: 30, yards: 90 }, right: { carries: 30, yards: 90 } } }, defense: { directions: { left: { carries: 30, yards: 180 }, middle: { carries: 30, yards: 90 }, right: { carries: 30, yards: 90 } } } },
    { gameId: 2, week: 2, team: "A", opponent: "C", offense: { directions: { left: { carries: 30, yards: 60 } } }, defense: { directions: {} } },
  ];
  for(const row of payload)for(const side of [row.offense,row.defense]){(side.directions as Record<string,unknown>).unknown={carries:0,yards:0};}
  const games=parseDirectionalGames(payload);
  const teams = new Set(["A", "B", "C"]);
  const weekOne = buildWeeklyDirectionalProfiles(games, 1, teams).get("A")!;
  const weekTwo = buildWeeklyDirectionalProfiles(games, 2, teams).get("A")!;
  assert.equal(weekOne.offense.left.carries, 50);
  assert.equal(weekTwo.offense.left.carries, 80);
  assert.equal(directionalRunMultiplier(weekOne, null), 1);
  const adjustment = directionalRunMultiplier(weekOne, buildWeeklyDirectionalProfiles(games, 1, teams).get("B"));
  assert.ok(adjustment >= Math.exp(-.08) && adjustment <= Math.exp(.08));
  assert.notEqual(adjustment, 1);
});

test("historical formula revision remains unchanged", () => {
  assert.equal(formulaRevision(2014), MODEL_FORMULA_REVISION);
  assert.equal(formulaRevision(2025), MODEL_FORMULA_REVISION);
  assert.notEqual(formulaRevision(2026), MODEL_FORMULA_REVISION);
});

const profile=(unknown:number=0)=>({schema:2 as const,coverage:120,eligible:{offense:120+unknown,defense:120+unknown},knownFraction:{offense:120/(120+unknown),defense:120/(120+unknown)},offense:{left:{index:1.2,share:.7,carries:84},middle:{index:.9,share:.2,carries:24},right:{index:.9,share:.1,carries:12}},defense:{left:{index:1.4,share:.2,carries:24},middle:{index:.8,share:.4,carries:48},right:{index:.8,share:.4,carries:48}}});
test('unknown carries dilute lane influence without moving into a known lane',()=>{
 const known=directionalMatchup(profile(),profile());const partial=directionalMatchup(profile(480),profile(480));
 assert.ok(Math.abs(partial.multiplier-1)<Math.abs(known.multiplier-1));
 assert.equal(partial.lanes[0].offCarries,84);assert.equal(partial.offCoverage,.2);
 assert.ok(known.multiplier>=.95&&known.multiplier<=1.05);
});
test('missing totals and unsupported lanes retain the aggregate rushing model',()=>{
 assert.equal(directionalRunMultiplier({...profile(),schema:undefined},profile()),1);
 const p=profile();for(const lane of Object.values(p.offense))lane.carries=1;
 assert.equal(directionalRunMultiplier(p,profile()),1);
});
test('FCS opponents and later weeks do not seed directional profiles',()=>{
 const g=parseDirectionalGames([{gameId:'1',week:1,team:'A',opponent:'FCS',offense:{directionEligibleAttempts:100,directions:{left:{carries:100,yards:1000}}}}]);
 assert.equal(buildWeeklyDirectionalProfiles(g,1,new Set(['A'])).size,0);
});

test('rushing chart adds signed offense and defense percentages while scoring remains on the established model',()=>{
 const offense=profile(),defense=profile();
 const original=directionalRunMultiplier(offense,defense);
 offense.offense.left.relativePercent=10;defense.defense.left.relativePercent=-5;
 const lane=rushingRelativeMatchup(offense,defense).lanes[0];
 assert.equal(lane.edgePercent,5);
 assert.equal(directionalRunMultiplier(offense,defense),original);
});
