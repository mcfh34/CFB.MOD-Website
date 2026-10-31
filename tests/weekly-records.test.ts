import assert from "node:assert/strict";
import test from "node:test";
import { buildWeeklyPregameRecords, type WeeklyRecordGame } from "../lib/weeklyRecords";

test("weekly preview records count only completed results before kickoff and conference games for league record",()=>{
  const games:WeeklyRecordGame[]=[
    {gameId:"week-5",week:5,startDate:"2026-10-03T19:00:00Z",completed:false,homeTeam:"Alabama",awayTeam:"Auburn",homePoints:null,awayPoints:null,conferenceGame:true},
    {gameId:"week-1",week:1,startDate:"2026-09-01T19:00:00Z",completed:true,homeTeam:"Alabama",awayTeam:"FCS",homePoints:30,awayPoints:7,conferenceGame:false},
    {gameId:"week-3",week:3,startDate:"2026-09-20T19:00:00Z",completed:true,homeTeam:"Auburn",awayTeam:"Alabama",homePoints:24,awayPoints:21,conferenceGame:true},
    {gameId:"week-4-future",week:4,startDate:"2026-09-27T19:00:00Z",completed:false,homeTeam:"Alabama",awayTeam:"Georgia",homePoints:null,awayPoints:null,conferenceGame:true},
  ];
  const record=buildWeeklyPregameRecords(games).get("week-5");
  assert.deepEqual(record,{homeRecordBefore:"1–1",awayRecordBefore:"1–0",homeConferenceRecordBefore:"0–1",awayConferenceRecordBefore:"1–0"});
});
