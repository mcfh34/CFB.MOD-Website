import test from "node:test";
import assert from "node:assert/strict";
import {weeklyPlayerRole,weeklySpiderAxes} from "../lib/weeklyPlayerSpider";
import {spiderPercentile} from "../lib/spiderMetrics";

test("weekly player radar uses game box stats and comparable role peers",()=>{
  const players=[
    {role:"QB" as const,metrics:{passAttempts:30,passCompletions:24,passYards:300,passTd:4,passInterceptions:0}},
    {role:"QB" as const,metrics:{passAttempts:25,passCompletions:13,passYards:170,passTd:1,passInterceptions:2}},
    {role:"QB" as const,metrics:{passAttempts:1,passCompletions:1,passYards:90,passTd:0,passInterceptions:0}},
    {role:"Receiver" as const,metrics:{receptions:12,receivingYards:217,receivingTd:4,allPurposeYards:217}},
  ];
  const axes=weeklySpiderAxes(players[0],players);
  assert.equal(weeklyPlayerRole(players[3].metrics),"Receiver");
  assert.equal(axes.length,5);
  assert.equal(axes.find(axis=>axis.name==="Pass yards")?.percentile,75);
  assert.equal(axes.find(axis=>axis.name==="Interception rate")?.percentile,100);
  assert.equal(axes.find(axis=>axis.name==="Completion rate")?.value,.8);
});

test("zero on a lower-is-better axis reaches the outer ring even with tied zeroes",()=>{
  assert.equal(spiderPercentile(0,[0,0,0,.02],true),100);
  assert.ok((spiderPercentile(.02,[0,0,0,.02],true)??100)<100);
});
