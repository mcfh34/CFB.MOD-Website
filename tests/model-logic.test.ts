import test from "node:test";
import assert from "node:assert/strict";

import { buildBcsRankings, type RankingProfile } from "../lib/rankings";
import { applyPreseasonRosterAdjustments, buildPregameElo, scheduleCalibrationWeights, type NormalizedGame, type PreseasonInput, type Profile } from "../lib/dataPipeline";
import { analyzeMatchupEdges } from "../lib/matchupAnalysis";
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

test("Harper BCS protects a mature undefeated résumé from a merely talented multi-loss team", () => {
  const profiles = [profile("Small State", "Sun Belt", 0.96), profile("Power U", "Big Ten", 1.12)];
  const games = [
    ...Array.from({ length: 8 }, (_, index) => ({
      gameId: `small-${index}`, week: index + 1, startDate: `2026-09-${String(index + 1).padStart(2, "0")}T00:00:00Z`, neutralSite: true,
      homeTeam: "Small State", homePoints: 28, awayTeam: `Small Opp ${index}`, awayPoints: 17,
    })),
    ...Array.from({ length: 8 }, (_, index) => ({
      gameId: `power-${index}`, week: index + 1, startDate: `2026-09-${String(index + 1).padStart(2, "0")}T12:00:00Z`, neutralSite: true,
      homeTeam: "Power U", homePoints: index < 6 ? 31 : 20, awayTeam: `Power Opp ${index}`, awayPoints: index < 6 ? 17 : 24,
    })),
  ];
  const rankings = buildBcsRankings(games, profiles);
  assert.ok((rankings.find((row) => row.team === "Small State")?.rank ?? 99) < (rankings.find((row) => row.team === "Power U")?.rank ?? 99));
});

test("conference labels alone never change a Harper BCS score", () => {
  const games = [{ gameId:"a",week:1,startDate:"2026-09-01T00:00:00Z",neutralSite:true,homeTeam:"Alpha",homePoints:24,awayTeam:"Opponent A",awayPoints:14 }, { gameId:"b",week:1,startDate:"2026-09-01T01:00:00Z",neutralSite:true,homeTeam:"Beta",homePoints:24,awayTeam:"Opponent B",awayPoints:14 }];
  const first = buildBcsRankings(games, [profile("Alpha", "SEC", 1), profile("Beta", "Conference USA", 1)]);
  const swapped = buildBcsRankings(games, [profile("Alpha", "Conference USA", 1), profile("Beta", "SEC", 1)]);
  assert.equal(first.find((row) => row.team === "Alpha")?.bcsScore, swapped.find((row) => row.team === "Alpha")?.bcsScore);
  assert.equal(first.find((row) => row.team === "Beta")?.bcsScore, swapped.find((row) => row.team === "Beta")?.bcsScore);
});

test("preseason roster inputs emphasize continuity and cap the recruiting nudge", () => {
  const base = (team:string): Profile => ({ season:2026,week:0,team,gamesPlayed:0,off:[5.6,7.3,4.4,30.9,35.8],def:[5.6,7.3,4.4,30.9,35.8],oi:[1,1,1,1,1],di:[1,1,1,1,1] });
  const input = (team:string, returning:number, rank:number, points:number): PreseasonInput => ({
    season:2026,team,conference:null,returningPpa:returning,returningPassingPpa:returning,returningReceivingPpa:returning,returningRushingPpa:returning,
    returningUsage:returning,returningPassingUsage:returning,returningReceivingUsage:returning,returningRushingUsage:returning,recruitingRank:rank,recruitingPoints:points,
  });
  const adjusted = applyPreseasonRosterAdjustments([base("Continuity U"),base("Rebuild U")],[input("Continuity U",0.82,1,310),input("Rebuild U",0.28,100,120)]);
  const continuity = adjusted.find((row) => row.team === "Continuity U")!;
  const rebuild = adjusted.find((row) => row.team === "Rebuild U")!;
  assert.ok(continuity.oi[1] > rebuild.oi[1]);
  assert.ok(continuity.di[0] < rebuild.di[0]);
  assert.ok(continuity.oi[1] < 1.1 && rebuild.oi[1] > 0.9);
});

test("matchup analyzer identifies separate pass, run, and defensive edges", () => {
  const analysis = analyzeMatchupEdges("Air Raid", "Ground U", [1.1,1.22,0.9,1,1], [0.86,0.82,0.94,1,1], [1.02,0.92,1.18,1,1], [1.04,1.08,1.12,1,1], true, 6.5);
  assert.equal(analysis.favorite, "Air Raid");
  assert.equal(analysis.pass.edgeTeam, "Air Raid");
  assert.equal(analysis.run.edgeTeam, "Ground U");
  assert.equal(analysis.defense.edgeTeam, "Air Raid");
  assert.match(analysis.summary, /Air Raid/);
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
