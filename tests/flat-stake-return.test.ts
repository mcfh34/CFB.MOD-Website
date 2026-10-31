import assert from "node:assert/strict";
import test from "node:test";
import {flatStakeReturn} from "../lib/flatStakeReturn";

test("flat $100 risk at -110 accounts for wins, losses, and returned pushes",()=>{
  const result=flatStakeReturn({wins:11,losses:9,pushes:2});
  assert.equal(result.bets,22);
  assert.ok(Math.abs(result.net-100)<.001);
  assert.equal(result.tone,"profitable");
});

test("a majority can still lose money at -110",()=>{
  const result=flatStakeReturn({wins:51,losses:49,pushes:0});
  assert.ok(result.net<0);
  assert.equal(result.tone,"near");
  assert.equal(flatStakeReturn({wins:49,losses:51,pushes:0}).tone,"poor");
});
