import test from "node:test";
import assert from "node:assert/strict";
import {weeklyApPoll} from "../lib/weeklyApPoll";

test("uses the most recent AP poll available by game week and maps team IDs",()=>{
  const payload=[
    {season:2026,seasonType:"regular",week:4,polls:[{poll:"AP Top 25",ranks:[{rank:2,teamId:1,school:"Old Name"}]}]},
    {season:2026,seasonType:"regular",week:5,polls:[{poll:"Coaches",ranks:[{rank:1,school:"Wrong"}]},{poll:"AP Top 25",ranks:[{rank:3,teamId:1,school:"Old Name"}]}]},
    {season:2026,seasonType:"regular",week:6,polls:[{poll:"AP Top 25",ranks:[{rank:1,teamId:1,school:"Future"}]}]},
  ];
  assert.deepEqual(weeklyApPoll(payload,2026,5,new Map([[1,"Current Name"]])),[{team:"Current Name",rank:3}]);
  assert.deepEqual(weeklyApPoll(payload,2026,4),[{team:"Old Name",rank:2}]);
  assert.deepEqual(weeklyApPoll(payload,2026,3),[]);
});
