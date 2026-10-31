import test from "node:test";
import assert from "node:assert/strict";
import { priorPlayerEvidence, projectRoster, rosterAtWeek, rosterPriorWeight, type PriorPlayerEvidence } from "../lib/rosterModel";
import { loadRosterTimelines } from "../lib/rosterPipeline";
import { projectCalibratedMatchup } from "../lib/matchupModel";
import { buildPreseasonStateTransition } from "../lib/preseasonTransition";
import { summarizeRosterValidation } from "../lib/rosterValidation";
import type { TeamPlayerModel, PlayerProfile } from "../lib/playerModel";
import type { PublishedDepthChart } from "../lib/publishedDepthCharts";
const player=(id:string,team:string,quality:number):PriorPlayerEvidence=>({season:2025,quality,reliability:.8,player:{id,team,displayName:id,position:"QB",highSchoolRating:null,productionScore:quality,stats:[{category:"passing",label:"ATT",numericValue:300,value:"300"}]} as PlayerProfile});
const chart=(names:string[]):PublishedDepthChart=>({team:"Test U",season:2026,publishedAt:"2026-08-20",sourceUrl:"https://example.edu/notes",label:"Test",sourceKind:"official_game_notes",entries:names.map(player=>({player,side:"offense",role:"QB",position:"QB",depth:1,jersey:null}))});
const previous={team:"Test U",season:2025,players:[player("Old","Test U",.3).player]} as TeamPlayerModel;

test("equal-quality incoming QB replaces departed contribution without a portal-count bonus",()=>{
 const r=projectRoster(chart(["New"]),[player("Old","Test U",.3),player("New","Other",.3)],previous,1);
 assert.equal(r.units.QB.adjustment,0);assert.equal(r.units.QB.incomingShare,1);assert.equal(r.units.QB.continuity,0);
});
test("QB upgrade changes offense independently of unknown defensive personnel",()=>{
 const r=projectRoster(chart(["New"]),[player("Old","Test U",.1),player("New","Other",.8)],previous,1);
 assert.ok(r.offense.passing>0);assert.equal(r.defense.overall,0);assert.equal(r.units.OL.evidence,"unavailable");
});
test("co-starters yield a probability mixture and exact score reconciliation",()=>{
 const r=projectRoster(chart(["One","Two"]),[player("Old","Test U",.3),player("One","Other",.8),player("Two","Elsewhere",-.5)],previous,1);
 const team={offense:[1,1,1,1,1],defense:[1,1,1,1,1]};
 const result=projectCalibratedMatchup({...team,roster:r},team,false,1500,1500);
 assert.equal(result.quarterbackScenarios.length,2);
 assert.equal(result.quarterbackScenarios.reduce((n,s)=>n+s.probability,0),1);
 assert.ok(Math.abs(result.homeScore-result.quarterbackScenarios.reduce((n,s)=>n+s.homeScore*s.probability,0))<1e-9);
 assert.ok(Math.abs(result.margin-result.reconciliation.components.reduce((n,c)=>n+c.points,0))<1e-9);
 assert.equal(result.homeStats.scoreReceipt.finalExpectedPoints,result.homeScore);
 assert.equal(result.modelTotal,result.homeScore+result.awayScore);
});
test("documented QB absence promotes the available backup without guessing injuries",()=>{
 const c=chart(["One","Two"]);c.entries[0].availabilityProbability=0;c.entries[1].depth=2;
 const r=projectRoster(c,[player("One","Other",.8),player("Two","Elsewhere",-.5)],previous,1);
 assert.equal(r.quarterbacks.length,1);assert.equal(r.quarterbacks[0].player,"Two");assert.equal(r.quarterbacks[0].probability,1);
});
test("future-season player production and ambiguous identities cannot become prior evidence",()=>{
 const evidence=priorPlayerEvidence([{...previous,season:2026}],2026);assert.deepEqual(evidence,[]);
 const same1=player("a","Other",1),same2=player("b","Elsewhere",-1);same1.player.displayName=same2.player.displayName="Same Name";
 const r=projectRoster(chart(["Same Name"]),[same1,same2],previous,1);assert.equal(r.units.QB.coverage,0);
});
test("a future depth chart cannot revise an earlier week",()=>{
 const first=projectRoster(chart(["Old"]),[player("Old","Test U",.3)],previous,1);
 const second={...first,publishedAt:"2026-09-15",availableFromWeek:3};
 assert.equal(rosterAtWeek([first,second],1)?.publishedAt,first.publishedAt);
 assert.equal(rosterAtWeek([first,second],2)?.publishedAt,second.publishedAt);
});
test("rebuilt units update faster; missing uncertainty preserves existing weighting",()=>{
 assert.ok(rosterPriorWeight(2,.9)<rosterPriorWeight(2,.1));assert.equal(rosterPriorWeight(2,undefined),2);
});
test("offensive returning production cannot move defensive preseason efficiency",()=>{
 const p={season:2025,week:12,team:"Test U",gamesPlayed:12,off:[5,7,4,30,35],def:[5,7,4,30,35],oi:[1.1,1.1,1.1,1,1],di:[.9,.9,.9,1,1]} as any;
 const args={season:2026,teams:["Test U","Other"],historyByTeam:new Map([["Test U",[{season:2025,profile:p}]]]),baselines:[5,7,4,30,35] as any};
 const input=(value:number)=>({season:2026,team:"Test U",returningPpa:value,returningUsage:value,recruitingRank:10,recruitingPoints:200} as any);
 const other={...input(.5),team:"Other"};
 const a=buildPreseasonStateTransition({...args,inputs:[input(.1),other]})[0];
 const b=buildPreseasonStateTransition({...args,inputs:[input(.9),other]})[0];
 assert.deepEqual(a.di,b.di);assert.notDeepEqual(a.oi,b.oi);
});
test("validation cannot claim improvement from missing dated lineup coverage",()=>{
 const report=summarizeRosterValidation(["baseline","roster"].map(variant=>({gameId:"1",season:2025,week:2,variant,home:30,away:20,probability:.7,actualHome:30,actualAway:20,coverage:0,turnover:null})));
 assert.equal(report.eligibleForPromotion,false);assert.equal(report.status,"insufficient-dated-roster-coverage");
});
test("date-only source published on game day is conservatively deferred to the next week",async()=>{
 const c={...chart(["Old"]),season:2025,team:"Test Date U",publishedAt:"2025-09-06"};
 const db={prepare:(sql:string)=>({bind:()=>({all:async()=>({results:sql.includes("depth_chart_snapshots")?[{chartJson:JSON.stringify(c)}]:sql.includes("MIN(start_date)")?[{week:1,starts:"2025-09-06T20:00:00Z"},{week:2,starts:"2025-09-13T20:00:00Z"}]:[]})})})} as any;
 const rows=await loadRosterTimelines(db,2025);assert.equal(rows.get("Test Date U")?.[0].availableFromWeek,2);
});
