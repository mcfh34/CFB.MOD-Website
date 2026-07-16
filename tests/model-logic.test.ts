import test from "node:test";
import assert from "node:assert/strict";

import { buildBcsRankings, type RankingProfile } from "../lib/rankings";
import { buildPregameElo, scheduleCalibrationWeights, type NormalizedGame } from "../lib/dataPipeline";
import { buildSeasonSimulation, type SimulationScheduleGame } from "../lib/simulation";

function profile(team: string, conference: string, power = 1): RankingProfile {
  return {
    team,
    conference,
    offYppIndex: power,
    offYpaIndex: power,
    offYpcIndex: power,
    defYppIndex: 2 - power,
    defYpaIndex: 2 - power,
    defYpcIndex: 2 - power,
  };
}

test("Harper BCS rewards a direct head-to-head winner", () => {
  const profiles = [profile("Alpha", "Test", 1), profile("Beta", "Test", 1)];
  const rankings = buildBcsRankings([
    {
      gameId: "h2h",
      week: 5,
      startDate: "2026-10-01T00:00:00Z",
      neutralSite: true,
      homeTeam: "Alpha",
      homePoints: 24,
      awayTeam: "Beta",
      awayPoints: 21,
    },
  ], profiles);

  const alpha = rankings.find((row) => row.team === "Alpha");
  const beta = rankings.find((row) => row.team === "Beta");
  assert.ok(alpha && beta);
  assert.ok(alpha.rank < beta.rank);
  assert.ok(alpha.headToHeadRank < beta.headToHeadRank);
});

test("schedule calibration penalizes an FCS-heavy sample more aggressively", () => {
  const allFbs = scheduleCalibrationWeights(6, 6);
  const fcsHeavy = scheduleCalibrationWeights(6, 2);

  assert.equal(allFbs.opponentAdjustment, 0.25);
  assert.ok(fcsHeavy.opponentAdjustment > allFbs.opponentAdjustment);
  assert.ok(fcsHeavy.priorGames > allFbs.priorGames);
});

test("schedule calibration shrinks a tiny sample more than a mature one", () => {
  const early = scheduleCalibrationWeights(1, 1);
  const mature = scheduleCalibrationWeights(8, 8);

  assert.ok(early.opponentAdjustment > mature.opponentAdjustment);
  assert.ok(early.priorGames > mature.priorGames);
});

test("postseason Elo starts after the regular season even when week numbers reset", () => {
  const games: NormalizedGame[] = [
    {
      id: "regular-1", season: 2025, week: 1, seasonType: "regular", startDate: "2025-08-30T16:00:00Z",
      completed: true, neutralSite: true, conferenceGame: false, venue: null,
      homeTeam: "Alpha", homeConference: "Test", homePoints: 35,
      awayTeam: "Beta", awayConference: "Test", awayPoints: 7,
    },
    {
      id: "postseason-1", season: 2025, week: 1, seasonType: "postseason", startDate: "2025-12-20T16:00:00Z",
      completed: false, neutralSite: true, conferenceGame: false, venue: null,
      homeTeam: "Alpha", homeConference: "Test", homePoints: null,
      awayTeam: "Beta", awayConference: "Test", awayPoints: null,
    },
  ];

  const snapshots = buildPregameElo(games, [], new Set(["Alpha", "Beta"]));
  const regular = snapshots.get("regular-1");
  const postseason = snapshots.get("postseason-1");
  assert.ok(regular && postseason);
  assert.equal(regular.get("Alpha"), regular.get("Beta"));
  assert.ok((postseason.get("Alpha") ?? 0) > (postseason.get("Beta") ?? 0));
});

test("2026 projection builds a five-champion, seven-at-large 12-team bracket", () => {
  const profiles = Array.from({ length: 12 }, (_, index) => profile(`Team ${index + 1}`, `Conference ${Math.floor(index / 2) + 1}`, 1.18 - index * 0.025));
  const schedule: SimulationScheduleGame[] = Array.from({ length: 6 }, (_, index) => ({
    gameId: `game-${index + 1}`,
    week: 1,
    startDate: "2026-09-01T00:00:00Z",
    seasonType: "regular",
    completed: false,
    neutralSite: false,
    conferenceGame: true,
    homeTeam: `Team ${index * 2 + 1}`,
    homeConference: `Conference ${index + 1}`,
    homePoints: null,
    awayTeam: `Team ${index * 2 + 2}`,
    awayConference: `Conference ${index + 1}`,
    awayPoints: null,
  }));

  const simulation = buildSeasonSimulation(2026, 0, 0, schedule, profiles);
  assert.equal(simulation.fieldMode, "projected-field");
  assert.equal(simulation.format, 12);
  assert.equal(simulation.rankings.filter((row) => row.playoffSeed !== null).length, 12);
  assert.equal(simulation.bracket.length, 11);
  assert.ok(simulation.champion);
});

test("historical seasons preserve the actual field while re-simulating results", () => {
  const teams = ["Oregon", "Georgia", "Boise State", "Arizona State", "Texas", "Penn State", "Notre Dame", "Ohio State", "Tennessee", "Indiana", "SMU", "Clemson"];
  const profiles = teams.map((team, index) => profile(team, `Conference ${Math.floor(index / 2) + 1}`, 1.2 - index * 0.025));
  const simulation = buildSeasonSimulation(2024, 8, 8, [], profiles);

  assert.equal(simulation.fieldMode, "actual-field");
  assert.equal(simulation.rankings.find((row) => row.team === "Oregon")?.playoffSeed, 1);
  assert.equal(simulation.rankings.find((row) => row.team === "Clemson")?.playoffSeed, 12);
  assert.equal(simulation.bracket.length, 11);
  assert.match(simulation.methodology, /re-simulated/);
});
