import assert from "node:assert/strict";
import test from "node:test";
import {currentScheduledWeek,currentSeason} from "../lib/currentWeek.ts";

test("uses scheduled Central-time weeks and advances on Monday",()=>{
  const rows=[
    {week:5,firstStart:"2026-09-24T23:00:00Z"},
    {week:6,firstStart:"2026-10-01T23:00:00Z"},
    {week:7,firstStart:"2026-10-08T23:00:00Z"},
  ];
  assert.equal(currentScheduledWeek(rows,new Date("2026-10-04T13:00:00Z")),6);
  assert.equal(currentScheduledWeek(rows,new Date("2026-10-05T13:00:00Z")),7);
  assert.equal(currentScheduledWeek(rows,new Date("2026-10-08T23:00:00Z")),7);
  assert.equal(currentSeason(new Date("2026-10-04T13:00:00Z")),2026);
});
