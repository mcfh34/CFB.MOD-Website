import assert from "node:assert/strict";
import test from "node:test";
import { calibratedHomeWinProbability } from "../lib/winProbability";

test("probabilities remain symmetric when the teams swap sides", () => {
  assert.equal(calibratedHomeWinProbability(0), .5);
  assert.ok(Math.abs(calibratedHomeWinProbability(7)+calibratedHomeWinProbability(-7)-1)<1e-12);
});

test("greater roster uncertainty moves a favorite toward a coin flip", () => {
  assert.ok(calibratedHomeWinProbability(7,1)<calibratedHomeWinProbability(7));
  assert.ok(calibratedHomeWinProbability(7)>calibratedHomeWinProbability(0));
});
