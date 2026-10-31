import test from "node:test";
import assert from "node:assert/strict";
import {weekLabel} from "../lib/weekLabels";

test("special week labels change presentation without changing numeric IDs",()=>{
  assert.equal(weekLabel(14),"Rivalry Week");
  assert.equal(weekLabel(15),"CC");
  assert.equal(weekLabel(14,"upper"),"RIVALRY WEEK");
  assert.equal(weekLabel(15,"compact"),"CC");
  assert.equal(weekLabel(13,"compact"),"W13");
  assert.equal(weekLabel(16),"Week 16");
});
