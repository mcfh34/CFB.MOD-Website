import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true },
});

after(async () => {
  await vite.close();
});

test("ships every Harper CFB team identity with a local logo", async () => {
  const { TEAM_CATALOG } = await vite.ssrLoadModule("/lib/game/teams.ts");
  assert.equal(TEAM_CATALOG.length, 136);
  for (const team of TEAM_CATALOG) {
    assert.match(team.primaryColor, /^#[0-9A-F]{6}$/);
    assert.match(team.secondaryColor, /^#[0-9A-F]{6}$/);
    assert.ok(team.logo.startsWith("/team-logos/"), `${team.name} is missing a local logo`);
    await access(path.join(root, "public", team.logo));
  }
});

test("creates full formations and credits the defender who makes the tackle", async () => {
  const { createInitialGameState, otherSide, resolveSnap } = await vite.ssrLoadModule("/lib/game/engine.ts");
  const { TEAM_BY_NAME, teamInputFromDefinition } = await vite.ssrLoadModule("/lib/game/teams.ts");
  const home = teamInputFromDefinition(TEAM_BY_NAME.get("Alabama"));
  const away = teamInputFromDefinition(TEAM_BY_NAME.get("Auburn"));
  const initial = createInitialGameState("ENGINE", home, away, "tackle-credit-test");

  assert.equal(initial.homeTeam.roster.offense.length, 11);
  assert.equal(initial.homeTeam.roster.defense.length, 11);
  assert.equal(initial.awayTeam.roster.offense.length, 11);
  assert.equal(initial.awayTeam.roster.defense.length, 11);
  assert.equal(initial.homeTeam.roster.specialTeams.length, 4);
  assert.deepEqual(
    initial.homeTeam.roster.specialTeams.map((player) => player.position),
    ["K", "P", "LS", "H"],
  );

  const kicked = resolveSnap(initial, "kick-return-middle", "kick-deep-left").state;
  const defense = otherSide(kicked.possession);
  const { state, entry } = resolveSnap(kicked, "inside-zone", "cover-3");
  const tackles = Object.values(state.playerStats[defense]).reduce((sum, line) => sum + line.tackles, 0);

  assert.ok(tackles >= 1);
  assert.ok(entry.participants?.tacklerIds?.length);
  assert.match(entry.summary, /Tackle by/);
});

test("records drive ownership, accelerated possession time, and a coverage defender", async () => {
  const { createInitialGameState, resolveSnap } = await vite.ssrLoadModule("/lib/game/engine.ts");
  const { TEAM_BY_NAME, teamInputFromDefinition } = await vite.ssrLoadModule("/lib/game/teams.ts");
  const home = teamInputFromDefinition(TEAM_BY_NAME.get("Alabama"));
  const away = teamInputFromDefinition(TEAM_BY_NAME.get("Auburn"));
  let state = createInitialGameState("DRIVES", home, away, "drive-log-test");
  state = resolveSnap(state, "kick-return-middle", "kick-deep-middle").state;
  assert.equal(state.playLog[0].driveNumber, 1);

  const firstOffense = state.possession;
  const firstTop = state.stats[firstOffense].timeOfPossessionSeconds;
  state = resolveSnap(state, "inside-zone", "cover-2").state;
  const run = state.playLog.at(-1);
  assert.equal(run.driveNumber, 1);
  assert.ok(run.elapsedSeconds > 0);
  assert.equal(state.stats[firstOffense].timeOfPossessionSeconds, firstTop + run.elapsedSeconds);

  let defendedPass;
  for (let attempt = 0; attempt < 250 && !defendedPass; attempt += 1) {
    const candidate = createInitialGameState(`PASS${attempt}`, home, away, `coverage-movement-${attempt}`);
    candidate.phase = "scrimmage";
    candidate.driveNumber = 1;
    const resolved = resolveSnap(candidate, "dropback", "quarters");
    if (["incompletion", "interception"].includes(resolved.entry.outcome)) defendedPass = resolved.entry;
  }
  assert.ok(defendedPass, "expected an incompletion or interception");
  assert.ok(defendedPass.participants?.receiverId);
  assert.ok(defendedPass.participants?.coverageDefenderId);
});

test("shows 15-minute quarters with a playable two-minute drill", async () => {
  const {
    CLOCK_ACCELERATION,
    REGULATION_SECONDS,
    TWO_MINUTE_CLOCK_ACCELERATION,
    clockAccelerationFor,
    createInitialGameState,
    resolveSnap,
  } = await vite.ssrLoadModule("/lib/game/engine.ts");
  const { TEAM_BY_NAME, teamInputFromDefinition } = await vite.ssrLoadModule("/lib/game/teams.ts");
  const initial = createInitialGameState(
    "CLOCK15",
    teamInputFromDefinition(TEAM_BY_NAME.get("Alabama")),
    teamInputFromDefinition(TEAM_BY_NAME.get("Auburn")),
    "accelerated-clock-test",
  );
  assert.equal(REGULATION_SECONDS, 15 * 60);
  assert.ok(CLOCK_ACCELERATION < 15 / 8);
  assert.ok(TWO_MINUTE_CLOCK_ACCELERATION < CLOCK_ACCELERATION);
  assert.equal(clockAccelerationFor(4, 120), TWO_MINUTE_CLOCK_ACCELERATION);
  assert.equal(clockAccelerationFor(1, 120), CLOCK_ACCELERATION);
  assert.equal(initial.clock, 15 * 60);
  const kicked = resolveSnap(initial, "kick-return-middle", "kick-deep-middle").state;
  assert.ok(initial.clock - kicked.clock >= 10, "kickoff should consume accelerated game time");
});

test("supports one- through fifteen-minute quarters and overtime-only games", async () => {
  const { createInitialGameState } = await vite.ssrLoadModule("/lib/game/engine.ts");
  const { TEAM_BY_NAME, teamInputFromDefinition } = await vite.ssrLoadModule("/lib/game/teams.ts");
  const home = teamInputFromDefinition(TEAM_BY_NAME.get("Alabama"));
  const away = teamInputFromDefinition(TEAM_BY_NAME.get("Auburn"));
  const short = createInitialGameState("SHORT", home, away, "three-minute", "cpu", "dark", "away", "easy", 3);
  const overtime = createInitialGameState("OTONLY", home, away, "overtime-only", "cpu", "dark", "away", "hard", 0);
  assert.equal(short.quarterLengthMinutes, 3);
  assert.equal(short.clock, 180);
  assert.equal(overtime.quarterLengthMinutes, 0);
  assert.equal(overtime.period, 5);
  assert.equal(overtime.clock, 0);
  assert.equal(overtime.phase, "scrimmage");
  assert.equal(overtime.ballOn, 75);
  assert.ok(overtime.overtime);
});

test("caps touchdown yardage at the goal line and permits rare breakaway scores", async () => {
  const { createInitialGameState, resolveSnap } = await vite.ssrLoadModule("/lib/game/engine.ts");
  const { TEAM_BY_NAME, teamInputFromDefinition } = await vite.ssrLoadModule("/lib/game/teams.ts");
  const home = teamInputFromDefinition(TEAM_BY_NAME.get("Alabama"));
  const away = teamInputFromDefinition(TEAM_BY_NAME.get("Auburn"));
  let goalLineTouchdown;
  for (let attempt = 0; attempt < 200 && !goalLineTouchdown; attempt += 1) {
    const state = createInitialGameState("GOALCAP", home, away, `goal-cap-${attempt}`);
    state.phase = "scrimmage";
    state.driveNumber = 1;
    state.possession = "home";
    state.ballOn = 93;
    state.down = 1;
    state.toGo = 7;
    const resolved = resolveSnap(state, "inside-zone", "drop-8");
    if (resolved.entry.outcome === "touchdown") goalLineTouchdown = resolved;
  }
  assert.ok(goalLineTouchdown, "expected a goal-line touchdown");
  assert.equal(goalLineTouchdown.entry.yards, 7);
  assert.match(goalLineTouchdown.entry.summary, /7 yards.*Touchdown/i);
  assert.equal(goalLineTouchdown.state.stats.home.rushYards, 7);

  let breakaway;
  for (let attempt = 0; attempt < 800 && !breakaway; attempt += 1) {
    const state = createInitialGameState("BREAK", home, away, `breakaway-${attempt}`);
    state.phase = "scrimmage";
    state.driveNumber = 1;
    state.possession = "home";
    state.ballOn = 25;
    state.down = 1;
    state.toGo = 10;
    const resolved = resolveSnap(state, "inside-zone", "drop-8");
    if (resolved.entry.outcome === "touchdown") breakaway = resolved;
  }
  assert.ok(breakaway, "expected the positive-play breakaway chance to produce a touchdown");
  assert.equal(breakaway.entry.yards, 75);
});

test("preserves authoritative website identity and ranking in a game room", async () => {
  const { validateTeamInput } = await vite.ssrLoadModule("/lib/game/server.ts");
  const { TEAM_BY_NAME, teamInputFromDefinition } = await vite.ssrLoadModule("/lib/game/teams.ts");
  const fallback = teamInputFromDefinition(TEAM_BY_NAME.get("Alabama"));
  const supplied = validateTeamInput({ ...fallback, name:"Website Team Name",mascot:"Website Mascot",logo:"https://example.com/site-logo.png",ranking:7,record:"8-1" }, fallback);
  assert.equal(supplied.name, "Website Team Name");
  assert.equal(supplied.mascot, "Website Mascot");
  assert.equal(supplied.logo, "https://example.com/site-logo.png");
  assert.equal(supplied.ranking, 7);
  assert.equal(supplied.record, "8-1");

  const scoresLogo = validateTeamInput({ ...fallback, logo:"https://example.com/not-the-scores-logo.png" }, fallback);
  assert.equal(scoresLogo.logo, "/team-logos/alabama.webp");
});

test("stores the selected theme and upgrades existing rooms to dark", async () => {
  const { createInitialGameState, upgradeGameState } = await vite.ssrLoadModule("/lib/game/engine.ts");
  const { TEAM_BY_NAME, teamInputFromDefinition } = await vite.ssrLoadModule("/lib/game/teams.ts");
  const home = teamInputFromDefinition(TEAM_BY_NAME.get("Alabama"));
  const away = teamInputFromDefinition(TEAM_BY_NAME.get("Auburn"));
  const light = createInitialGameState("LIGHT", home, away, "light-theme-test", "human", "light");
  assert.equal(light.theme, "light");
  const legacy = structuredClone(light);
  delete legacy.theme;
  upgradeGameState(legacy);
  assert.equal(legacy.theme, "dark");
});

test("accepts the other coordinator's version update only for the same snap", async () => {
  const { createInitialGameState } = await vite.ssrLoadModule("/lib/game/engine.ts");
  const { snapshotTargetsCurrentSnap } = await vite.ssrLoadModule("/lib/game/server.ts");
  const { TEAM_BY_NAME, teamInputFromDefinition } = await vite.ssrLoadModule("/lib/game/teams.ts");
  const state = createInitialGameState(
    "SYNC",
    teamInputFromDefinition(TEAM_BY_NAME.get("Alabama")),
    teamInputFromDefinition(TEAM_BY_NAME.get("Auburn")),
    "same-snap-race-test",
  );

  assert.equal(snapshotTargetsCurrentSnap(state, state.playNumber, state.version, state.version + 1), true);
  assert.equal(snapshotTargetsCurrentSnap(state, state.playNumber + 1, state.version, state.version + 1), false);
  assert.equal(snapshotTargetsCurrentSnap(state, undefined, state.version, state.version + 1), false);
});

test("enforces offense-meter first and reveals nothing before the defense answers", async () => {
  const { createInitialGameState, otherSide } = await vite.ssrLoadModule("/lib/game/engine.ts");
  const { applyPlayCall, buildGameView } = await vite.ssrLoadModule("/lib/game/server.ts");
  const { TEAM_BY_NAME, teamInputFromDefinition } = await vite.ssrLoadModule("/lib/game/teams.ts");
  let state = createInitialGameState(
    "TURNS",
    teamInputFromDefinition(TEAM_BY_NAME.get("Alabama")),
    teamInputFromDefinition(TEAM_BY_NAME.get("Auburn")),
    "two-snap-seat-lock-test",
  );
  const firstSeat = state.possession;
  const opponentSeat = otherSide(firstSeat);

  state = applyPlayCall(state, firstSeat, "kick-return-middle", "2026-01-01T00:00:00Z").state;
  state = applyPlayCall(state, opponentSeat, "kick-deep-left", "2026-01-01T00:00:01Z").state;
  assert.equal(state.playNumber, 1);
  assert.deepEqual(state.pending, {});

  const offenseSeat = state.possession;
  const defenseSeat = otherSide(offenseSeat);
  assert.throws(
    () => applyPlayCall(state, defenseSeat, "cover-2", "2026-01-01T00:00:02Z", 80),
    /waiting for the offense/i,
  );
  state = applyPlayCall(state, offenseSeat, "mesh", "2026-01-01T00:00:03Z", 82).state;
  const defenseView = buildGameView(state, defenseSeat);
  assert.equal(defenseView.state.pending.offenseSubmitted, true);
  assert.equal(defenseView.state.pending.yourPlayId, undefined);
  assert.equal(buildGameView(state, offenseSeat).you.submitted, true);
  state = applyPlayCall(state, defenseSeat, "cover-2", "2026-01-01T00:00:04Z", 76).state;
  assert.equal(state.playNumber, 2);
  assert.deepEqual(state.pending, {});
});

test("lets a home player face a CPU that submits a hidden legal call immediately", async () => {
  const { createInitialGameState, getAvailableDefensePlayIds, getAvailableOffensePlayIds } = await vite.ssrLoadModule("/lib/game/engine.ts");
  const { applyPlayCall, roleForSeat } = await vite.ssrLoadModule("/lib/game/server.ts");
  const { TEAM_BY_NAME, teamInputFromDefinition } = await vite.ssrLoadModule("/lib/game/teams.ts");
  const state = createInitialGameState(
    "CPUONE",
    teamInputFromDefinition(TEAM_BY_NAME.get("Alabama")),
    teamInputFromDefinition(TEAM_BY_NAME.get("Auburn")),
    "cpu-auto-call-test",
    "cpu",
  );
  const humanRole = roleForSeat(state, "home");
  const humanPlay = humanRole === "offense"
    ? getAvailableOffensePlayIds(state)[0]
    : getAvailableDefensePlayIds(state)[0];
  const applied = applyPlayCall(state, "home", humanPlay, "2026-01-01T00:00:00Z");
  assert.equal(applied.resolved, true);
  assert.equal(applied.state.playNumber, 1);
  assert.deepEqual(applied.state.pending, {});
  assert.throws(
    () => applyPlayCall(state, "away", humanPlay, "2026-01-01T00:00:01Z"),
    /computer controls/i,
  );
});

test("weights CPU calls by down and distance without reading the opponent's call", async () => {
  const { createInitialGameState } = await vite.ssrLoadModule("/lib/game/engine.ts");
  const { getCpuPlayWeights, selectCpuPlay } = await vite.ssrLoadModule("/lib/game/server.ts");
  const { TEAM_BY_NAME, teamInputFromDefinition } = await vite.ssrLoadModule("/lib/game/teams.ts");
  const home = teamInputFromDefinition(TEAM_BY_NAME.get("Alabama"));
  const away = teamInputFromDefinition(TEAM_BY_NAME.get("Auburn"));
  const short = createInitialGameState("CPUSHORT", home, away, "cpu-short", "cpu");
  short.phase = "scrimmage";
  short.possession = "away";
  short.down = 2;
  short.toGo = 2;
  const long = structuredClone(short);
  long.seed = "cpu-long";
  long.down = 3;
  long.toGo = 12;
  const shortOffense = getCpuPlayWeights(short, "offense");
  const longOffense = getCpuPlayWeights(long, "offense");
  const shortDefense = getCpuPlayWeights(short, "defense");
  const longDefense = getCpuPlayWeights(long, "defense");
  assert.ok(shortOffense.run > longOffense.run);
  assert.ok(longOffense.mesh > shortOffense.mesh);
  assert.ok(shortDefense["bear-front"] > longDefense["bear-front"]);
  assert.ok(longDefense["cover-4"] > shortDefense["cover-4"]);
  assert.ok(selectCpuPlay(short, "offense"));
  assert.ok(selectCpuPlay(long, "defense"));
  short.pending.home = {
    seat: "home",
    role: "defense",
    playId: "bear-front",
    playNumber: short.playNumber,
    submittedAt: "2026-01-01T00:00:00Z",
  };
  assert.equal(selectCpuPlay(short, "offense"), selectCpuPlay({ ...short, pending: {} }, "offense"));
});

test("forces the CPU to punt on fourth-and-long in its own territory", async () => {
  const { createInitialGameState } = await vite.ssrLoadModule("/lib/game/engine.ts");
  const { getCpuFourthDownDecision, selectCpuPlay } = await vite.ssrLoadModule("/lib/game/server.ts");
  const { TEAM_BY_NAME, teamInputFromDefinition } = await vite.ssrLoadModule("/lib/game/teams.ts");
  const state = createInitialGameState(
    "PUNTCPU",
    teamInputFromDefinition(TEAM_BY_NAME.get("Alabama")),
    teamInputFromDefinition(TEAM_BY_NAME.get("Auburn")),
    "cpu-punt-logic-test",
    "cpu",
  );
  state.phase = "scrimmage";
  state.possession = "away";
  state.down = 4;
  state.toGo = 12;
  state.ballOn = 24;
  state.period = 2;
  state.clock = 600;
  assert.equal(getCpuFourthDownDecision(state), "punt");
  assert.equal(selectCpuPlay(state, "offense"), "punt");
});

test("offers a real point-after choice and resolves one or two points", async () => {
  const { createInitialGameState, getAvailableDefensePlayIds, getAvailableOffensePlayIds, resolveSnap } = await vite.ssrLoadModule("/lib/game/engine.ts");
  const { cpuShouldGoForTwo, getCpuPlayWeights } = await vite.ssrLoadModule("/lib/game/server.ts");
  const { TEAM_BY_NAME, teamInputFromDefinition } = await vite.ssrLoadModule("/lib/game/teams.ts");
  const base = createInitialGameState(
    "CONVERT",
    teamInputFromDefinition(TEAM_BY_NAME.get("Alabama")),
    teamInputFromDefinition(TEAM_BY_NAME.get("Auburn")),
    "conversion-choice-test",
    "cpu",
  );
  base.phase = "conversion";
  base.possession = "away";
  base.ballOn = 97;
  base.period = 4;
  base.clock = 100;
  base.score.away = 20;
  base.score.home = 22;
  assert.deepEqual(getAvailableOffensePlayIds(base), ["extra-point", "two-point"]);
  assert.deepEqual(getAvailableDefensePlayIds(base), ["kick-block", "goal-line-defense"]);
  assert.equal(cpuShouldGoForTwo(base), true);
  assert.ok(getCpuPlayWeights(base, "offense")["two-point"] > getCpuPlayWeights(base, "offense")["extra-point"]);

  const extra = resolveSnap(structuredClone(base), "extra-point", "goal-line-defense").state;
  assert.equal(extra.phase, "kickoff");
  assert.ok(extra.score.away === 20 || extra.score.away === 21);
  const two = resolveSnap(structuredClone(base), "two-point", "kick-block").state;
  assert.equal(two.phase, "kickoff");
  assert.ok(two.score.away === 20 || two.score.away === 22);
});

test("go for two opens the normal concept and dual-meter snap", async () => {
  const { createInitialGameState, getAvailableDefensePlayIds, getAvailableOffensePlayIds } = await vite.ssrLoadModule("/lib/game/engine.ts");
  const { applyPlayCall } = await vite.ssrLoadModule("/lib/game/server.ts");
  const { TEAM_BY_NAME, teamInputFromDefinition } = await vite.ssrLoadModule("/lib/game/teams.ts");
  const state = createInitialGameState(
    "TWOMETER",
    teamInputFromDefinition(TEAM_BY_NAME.get("Alabama")),
    teamInputFromDefinition(TEAM_BY_NAME.get("Auburn")),
    "two-point-meter",
    "human",
  );
  state.phase = "conversion";
  state.possession = "home";
  state.ballOn = 97;
  const choice = applyPlayCall(state, "home", "two-point", "2026-09-05T00:00:00Z");
  assert.equal(choice.state.twoPointAttempt, true);
  assert.deepEqual(getAvailableOffensePlayIds(choice.state), ["run", "stick", "mesh", "four-verts"]);
  assert.deepEqual(getAvailableDefensePlayIds(choice.state), ["bear-front", "cover-2", "cover-4", "cover-0"]);
  const offense = applyPlayCall(choice.state, "home", "mesh", "2026-09-05T00:00:01Z", 92);
  assert.equal(offense.resolved, false);
  const defense = applyPlayCall(offense.state, "away", "cover-2", "2026-09-05T00:00:02Z", 73);
  assert.equal(defense.resolved, true);
  assert.equal(defense.state.playLog.at(-1).outcome, "two-point");
  assert.equal(defense.state.playLog.at(-1).offensePlayId, "mesh");
  assert.equal(defense.state.playLog.at(-1).offenseExecutionScore, 92);
  assert.equal(defense.state.playLog.at(-1).defenseExecutionScore, 73);
});

test("preserves an untimed conversion after a touchdown at 0:00", async () => {
  const { createInitialGameState, resolveSnap } = await vite.ssrLoadModule("/lib/game/engine.ts");
  const { TEAM_BY_NAME, teamInputFromDefinition } = await vite.ssrLoadModule("/lib/game/teams.ts");
  const home = teamInputFromDefinition(TEAM_BY_NAME.get("Alabama"));
  const away = teamInputFromDefinition(TEAM_BY_NAME.get("Auburn"));
  let touchdown;
  for (let attempt = 0; attempt < 200 && !touchdown; attempt += 1) {
    const state = createInitialGameState("UNTIMED", home, away, `untimed-${attempt}`);
    state.phase = "scrimmage";
    state.possession = "home";
    state.period = 4;
    state.clock = 0;
    state.ballOn = 99;
    state.down = 1;
    state.toGo = 1;
    const resolved = resolveSnap(state, "run", "cover-4", 100, 0).state;
    if (resolved.phase === "conversion") touchdown = resolved;
  }
  assert.ok(touchdown, "expected a touchdown at the expired clock");
  assert.equal(touchdown.status, "active");
  assert.equal(touchdown.clock, 0);
  const afterTry = resolveSnap(touchdown, "extra-point", "kick-block", 100).state;
  assert.equal(afterTry.status, "final");
  assert.equal(afterTry.playLog.at(-1).outcome, "extra-point");

  let halftimeTouchdown;
  for (let attempt = 0; attempt < 200 && !halftimeTouchdown; attempt += 1) {
    const state = createInitialGameState("HALFTRY", home, away, `halftime-try-${attempt}`);
    state.phase = "scrimmage";
    state.possession = "home";
    state.period = 2;
    state.clock = 0;
    state.ballOn = 99;
    state.down = 1;
    state.toGo = 1;
    const resolved = resolveSnap(state, "run", "cover-4", 100, 0).state;
    if (resolved.phase === "conversion") halftimeTouchdown = resolved;
  }
  assert.ok(halftimeTouchdown, "expected an untimed try before halftime");
  const secondHalf = resolveSnap(halftimeTouchdown, "extra-point", "kick-block", 100).state;
  assert.equal(secondHalf.status, "active");
  assert.equal(secondHalf.period, 3);
  assert.equal(secondHalf.phase, "kickoff");
});

test("a touchdown awards six and opens the conversion phase", async () => {
  const { createInitialGameState, resolveSnap } = await vite.ssrLoadModule("/lib/game/engine.ts");
  const { TEAM_BY_NAME, teamInputFromDefinition } = await vite.ssrLoadModule("/lib/game/teams.ts");
  const home = teamInputFromDefinition(TEAM_BY_NAME.get("Alabama"));
  const away = teamInputFromDefinition(TEAM_BY_NAME.get("Auburn"));
  let touchdown;
  for (let attempt = 0; attempt < 100 && !touchdown; attempt += 1) {
    const state = createInitialGameState("SIXPTS", home, away, `touchdown-conversion-${attempt}`);
    state.phase = "scrimmage";
    state.possession = "home";
    state.ballOn = 99;
    state.down = 1;
    state.toGo = 1;
    const resolved = resolveSnap(state, "power", "cover-2").state;
    if (resolved.phase === "conversion") touchdown = resolved;
  }
  assert.ok(touchdown, "expected at least one touchdown result");
  assert.equal(touchdown.score.home, 6);
  assert.equal(touchdown.ballOn, 97);
});

test("plays a complete CPU game without waiting for a second user", async () => {
  const { createInitialGameState, getAvailableDefensePlayIds, getAvailableOffensePlayIds } = await vite.ssrLoadModule("/lib/game/engine.ts");
  const { applyPlayCall, roleForSeat } = await vite.ssrLoadModule("/lib/game/server.ts");
  const { TEAM_BY_NAME, teamInputFromDefinition } = await vite.ssrLoadModule("/lib/game/teams.ts");
  let state = createInitialGameState(
    "CPUFULL",
    teamInputFromDefinition(TEAM_BY_NAME.get("Alabama")),
    teamInputFromDefinition(TEAM_BY_NAME.get("Auburn")),
    "complete-cpu-game-test",
    "cpu",
  );
  while (state.status === "active" && state.playNumber < 220) {
    const role = roleForSeat(state, "home");
    const available = role === "offense"
      ? getAvailableOffensePlayIds(state)
      : getAvailableDefensePlayIds(state);
    let call = available[state.playNumber % available.length];
    if (role === "offense" && state.phase === "scrimmage" && state.down === 4 && available.includes("punt")) {
      call = state.ballOn >= 62 && available.includes("field-goal") ? "field-goal" : "punt";
    }
    const applied = applyPlayCall(state, "home", call, "2026-01-01T00:00:00Z");
    assert.equal(applied.resolved, true);
    state = applied.state;
  }
  assert.equal(state.status, "final");
  assert.ok(state.playNumber < 220);
});

test("gives every scrimmage call a strong counter and a strong favorable matchup", async () => {
  const { PLAY_MATCHUP } = await vite.ssrLoadModule("/lib/game/engine.ts");
  for (const [play, matchups] of Object.entries(PLAY_MATCHUP)) {
    const values = Object.values(matchups);
    assert.ok(Math.min(...values) <= -2.5, `${play} needs a defensive counter`);
    assert.ok(Math.max(...values) >= 2.5, `${play} needs an exploitable defensive look`);
  }
});

test("offers four arcade defenses and situation-specific kick defenses", async () => {
  const { createInitialGameState, getAvailableDefensePlayIds } = await vite.ssrLoadModule("/lib/game/engine.ts");
  const { TEAM_BY_NAME, teamInputFromDefinition } = await vite.ssrLoadModule("/lib/game/teams.ts");
  const state = createInitialGameState(
    "DEFCALLS",
    teamInputFromDefinition(TEAM_BY_NAME.get("Alabama")),
    teamInputFromDefinition(TEAM_BY_NAME.get("Auburn")),
    "four-defense-calls-test",
  );
  state.phase = "scrimmage";
  state.down = 2;
  state.ballOn = 30;
  const base = getAvailableDefensePlayIds(state);
  assert.deepEqual(base, ["bear-front", "cover-2", "cover-4", "cover-0"]);

  state.down = 4;
  const puntDefense = getAvailableDefensePlayIds(state);
  assert.deepEqual(puntDefense.slice(-2), ["punt-return-middle", "punt-block"]);
  assert.ok(!puntDefense.includes("punt-return-left"));
  assert.ok(!puntDefense.includes("punt-safe"));

  state.ballOn = 55;
  const fieldGoalDefense = getAvailableDefensePlayIds(state);
  assert.deepEqual(fieldGoalDefense.slice(-2), ["field-goal-safe", "field-goal-block"]);
  assert.ok(!fieldGoalDefense.includes("punt-return-middle"));
  assert.ok(!fieldGoalDefense.includes("punt-block"));
});

test("starts with a meaningful kick-return matchup and then opens a drive", async () => {
  const { createInitialGameState, resolveSnap } = await vite.ssrLoadModule("/lib/game/engine.ts");
  const { TEAM_BY_NAME, teamInputFromDefinition } = await vite.ssrLoadModule("/lib/game/teams.ts");
  const initial = createInitialGameState(
    "KICKS",
    teamInputFromDefinition(TEAM_BY_NAME.get("Alabama")),
    teamInputFromDefinition(TEAM_BY_NAME.get("Auburn")),
    "kick-return-test",
  );
  assert.equal(initial.phase, "kickoff");
  const { state, entry } = resolveSnap(initial, "kick-return-right", "kick-deep-left");
  assert.equal(state.phase, "scrimmage");
  assert.equal(state.down, 1);
  assert.ok(state.ballOn >= 20);
  assert.equal(entry.outcome, "kickoff");
  assert.equal(state.stats[initial.possession].kickReturns, 1);
  assert.ok(entry.participants?.kickerId);
  assert.ok(entry.participants?.returnerId);
  assert.equal(entry.specialTeamsReplay?.kind, "kickoff");
});

test("makes punt-return setup valuable while punt block creates block pressure", async () => {
  const { matchupAdvantage, puntReturnSetupBonus } = await vite.ssrLoadModule("/lib/game/engine.ts");
  assert.ok(puntReturnSetupBonus("punt-return-middle", "left") > puntReturnSetupBonus("punt-block", "left"));
  assert.ok(puntReturnSetupBonus("punt-return-middle", "right") > puntReturnSetupBonus("cover-3", "right"));
  assert.ok(matchupAdvantage("power", "punt-block") > matchupAdvantage("power", "punt-return-middle"));
});

test("keeps punt and field-goal blocks rare while rewarding the block call", async () => {
  const { fieldGoalBlockChance, puntBlockChance } = await vite.ssrLoadModule("/lib/game/engine.ts");
  assert.equal(puntBlockChance("punt-block"), 0.03);
  assert.equal(puntBlockChance("punt-return-middle"), 0.0015);
  assert.ok(puntBlockChance("punt-block") < 0.05);
  assert.ok(puntBlockChance("punt-block") >= puntBlockChance("punt-return-middle") * 10);

  assert.equal(fieldGoalBlockChance("field-goal-block"), 0.025);
  assert.equal(fieldGoalBlockChance("field-goal-safe"), 0.001);
  assert.ok(fieldGoalBlockChance("field-goal-block") < 0.04);
  assert.ok(fieldGoalBlockChance("field-goal-block") >= fieldGoalBlockChance("field-goal-safe") * 10);
});

test("offers a difficult onside kick with a meaningful hands-team counter", async () => {
  const {
    createInitialGameState,
    getAvailableDefensePlayIds,
    getAvailableOffensePlayIds,
    onsideRecoveryChance,
    resolveSnap,
  } = await vite.ssrLoadModule("/lib/game/engine.ts");
  const { getCpuPlayWeights } = await vite.ssrLoadModule("/lib/game/server.ts");
  const { TEAM_BY_NAME, teamInputFromDefinition } = await vite.ssrLoadModule("/lib/game/teams.ts");
  const state = createInitialGameState(
    "ONSIDE",
    teamInputFromDefinition(TEAM_BY_NAME.get("Alabama")),
    teamInputFromDefinition(TEAM_BY_NAME.get("Auburn")),
    "onside-kick-test",
    "cpu",
  );
  assert.ok(getAvailableOffensePlayIds(state).includes("hands-team"));
  assert.ok(getAvailableDefensePlayIds(state).includes("onside-kick"));
  assert.ok(onsideRecoveryChance("hands-team") < onsideRecoveryChance("kick-return-middle"));
  assert.ok(onsideRecoveryChance("kick-return-middle") <= 0.12);

  state.possession = "home";
  state.period = 4;
  state.clock = 90;
  state.score.home = 24;
  state.score.away = 17;
  const kickingWeights = getCpuPlayWeights(structuredClone(state), "defense");
  assert.ok(kickingWeights["onside-kick"] > kickingWeights["kick-deep-middle"]);

  const resolved = resolveSnap(state, "hands-team", "onside-kick");
  assert.equal(resolved.entry.specialTeamsReplay?.onside, true);
  assert.equal(resolved.state.phase, "scrimmage");
});

test("only offers kneels and spikes when clock and score make them useful", async () => {
  const { createInitialGameState, getAvailableOffensePlayIds } = await vite.ssrLoadModule("/lib/game/engine.ts");
  const { TEAM_BY_NAME, teamInputFromDefinition } = await vite.ssrLoadModule("/lib/game/teams.ts");
  const state = createInitialGameState(
    "CLOCK",
    teamInputFromDefinition(TEAM_BY_NAME.get("Alabama")),
    teamInputFromDefinition(TEAM_BY_NAME.get("Auburn")),
    "clock-call-test",
  );
  state.phase = "scrimmage";
  state.period = 4;
  state.clock = 45;
  state.score[state.possession] = 24;
  state.score[state.possession === "home" ? "away" : "home"] = 17;
  assert.ok(getAvailableOffensePlayIds(state).includes("kneel"));
  assert.ok(!getAvailableOffensePlayIds(state).includes("spike"));
  state.score[state.possession] = 17;
  state.score[state.possession === "home" ? "away" : "home"] = 24;
  assert.ok(!getAvailableOffensePlayIds(state).includes("kneel"));
  assert.ok(getAvailableOffensePlayIds(state).includes("spike"));
  state.clock = 180;
  assert.ok(!getAvailableOffensePlayIds(state).includes("kneel"));
  assert.ok(!getAvailableOffensePlayIds(state).includes("spike"));
});

test("finishes shorter games without stalling and still produces scoring and stops", async () => {
  const {
    createInitialGameState,
    getAvailableDefensePlayIds,
    getAvailableOffensePlayIds,
    resolveSnap,
  } = await vite.ssrLoadModule("/lib/game/engine.ts");
  const { TEAM_BY_NAME, teamInputFromDefinition } = await vite.ssrLoadModule("/lib/game/teams.ts");
  const home = teamInputFromDefinition(TEAM_BY_NAME.get("Alabama"));
  const away = teamInputFromDefinition(TEAM_BY_NAME.get("Auburn"));
  const playCounts = [];
  const totals = [];
  for (let game = 0; game < 20; game += 1) {
    let state = createInitialGameState(`SIM${game}`, home, away, `short-game-${game}`);
    while (state.status === "active" && state.playNumber < 220) {
      const offense = getAvailableOffensePlayIds(state);
      const defense = getAvailableDefensePlayIds(state);
      let offenseCall = offense[(state.playNumber + game) % offense.length];
      if (state.phase === "kickoff") offenseCall = ["kick-return-left", "kick-return-middle", "kick-return-right"][game % 3];
      if (state.phase === "scrimmage" && state.down === 4 && offense.includes("punt")) {
        offenseCall = state.ballOn >= 62 && offense.includes("field-goal") ? "field-goal" : "punt";
      }
      const defenseCall = state.phase === "kickoff"
        ? ["kick-deep-left", "kick-deep-middle", "kick-deep-right"][state.playNumber % 3]
        : state.down === 4 && defense.includes("punt-return-middle")
          ? "punt-return-middle"
          : defense[(state.playNumber * 3 + game) % Math.min(8, defense.length)];
      state = resolveSnap(state, offenseCall, defenseCall).state;
    }
    assert.equal(state.status, "final", `simulation ${game} stalled`);
    playCounts.push(state.playNumber);
    totals.push(state.score.home + state.score.away);
  }
  const averagePlays = playCounts.reduce((sum, value) => sum + value, 0) / playCounts.length;
  const averagePoints = totals.reduce((sum, value) => sum + value, 0) / totals.length;
  assert.ok(averagePlays >= 75 && averagePlays <= 140, `unexpected average play count ${averagePlays}`);
  assert.ok(averagePoints >= 20, `unexpectedly low scoring ${averagePoints}`);
  assert.ok(totals.some((points) => points < 55), "defenses never produced a lower-scoring game");
});

test("maps the moving meter to a bounded execution multiplier", async () => {
  const {
    DEFAULT_EXECUTION_SCORE,
    executionGrade,
    executionMultiplier,
    playUsesExecutionMeter,
    timingScoreForPosition,
  } = await vite.ssrLoadModule("/lib/game/execution.ts");

  assert.equal(timingScoreForPosition(0.5), 100);
  assert.equal(timingScoreForPosition(0), 0);
  assert.equal(timingScoreForPosition(1), 0);
  assert.equal(executionMultiplier(DEFAULT_EXECUTION_SCORE), 1);
  assert.equal(executionGrade(100).label, "PERFECT");
  assert.equal(executionGrade(85).label, "GREAT");
  assert.equal(executionGrade(65).label, "GOOD");
  assert.equal(executionGrade(40).label, "FAIR");
  assert.equal(executionGrade(20).label, "POOR");
  assert.ok(executionMultiplier(100) <= 1.24);
  assert.ok(executionMultiplier(0) >= 0.76);
  assert.equal(playUsesExecutionMeter("run"), true);
  assert.equal(playUsesExecutionMeter("cover-0"), true);
  assert.equal(playUsesExecutionMeter("field-goal"), true);
  assert.equal(playUsesExecutionMeter("extra-point"), true);
});

test("execution differential leads the result while concept matchups still matter", async () => {
  const { createInitialGameState, resolveSnap } = await vite.ssrLoadModule("/lib/game/engine.ts");
  const { TEAM_BY_NAME, teamInputFromDefinition } = await vite.ssrLoadModule("/lib/game/teams.ts");
  const home = teamInputFromDefinition(TEAM_BY_NAME.get("Alabama"));
  const away = teamInputFromDefinition(TEAM_BY_NAME.get("Auburn"));
  let perfectRunYards = 0;
  let mistimedRunYards = 0;
  let favorableEvenYards = 0;
  let counteredEvenYards = 0;
  let perfectCompletions = 0;
  let mistimedCompletions = 0;
  const samples = 360;

  for (let attempt = 0; attempt < samples; attempt += 1) {
    const state = createInitialGameState("TIMING", home, away, `execution-${attempt}`);
    state.phase = "scrimmage";
    state.driveNumber = 1;
    state.possession = "home";
    state.ballOn = 25;
    state.down = 1;
    state.toGo = 10;

    perfectRunYards += resolveSnap(structuredClone(state), "run", "cover-2", 95, 20).entry.yards;
    mistimedRunYards += resolveSnap(structuredClone(state), "run", "cover-2", 20, 95).entry.yards;
    favorableEvenYards += resolveSnap(structuredClone(state), "run", "cover-4", 60, 60).entry.yards;
    counteredEvenYards += resolveSnap(structuredClone(state), "run", "bear-front", 60, 60).entry.yards;
    if (resolveSnap(structuredClone(state), "mesh", "cover-2", 95, 20).entry.outcome === "completion") perfectCompletions += 1;
    if (resolveSnap(structuredClone(state), "mesh", "cover-2", 20, 95).entry.outcome === "completion") mistimedCompletions += 1;
  }

  assert.ok(perfectRunYards > mistimedRunYards, "perfect run timing should improve average yardage");
  assert.ok(perfectCompletions > mistimedCompletions, "perfect pass timing should improve accuracy");
  assert.ok(
    favorableEvenYards > counteredEvenYards + samples * 5,
    "the same execution should expose the concept matchup",
  );
});

test("Cover 0 makes Mesh and Four Verts volatile instead of deterministic", async () => {
  const { createInitialGameState, resolveSnap } = await vite.ssrLoadModule("/lib/game/engine.ts");
  const { TEAM_BY_NAME, teamInputFromDefinition } = await vite.ssrLoadModule("/lib/game/teams.ts");
  const home = teamInputFromDefinition(TEAM_BY_NAME.get("Alabama"));
  const away = teamInputFromDefinition(TEAM_BY_NAME.get("Auburn"));
  let offensiveWins = 0;
  let defensiveWins = 0;

  for (let attempt = 0; attempt < 220; attempt += 1) {
    const state = createInitialGameState("RPOREAD", home, away, `rpo-read-${attempt}`);
    state.phase = "scrimmage";
    state.driveNumber = 1;
    state.possession = "home";
    state.ballOn = 30;
    const offenseWin = resolveSnap(structuredClone(state), "four-verts", "cover-0", 96, 18).entry;
    const defenseWin = resolveSnap(structuredClone(state), "four-verts", "cover-0", 18, 96).entry;
    if (offenseWin.outcome === "touchdown" || offenseWin.yards >= 30) offensiveWins += 1;
    if (["sack", "interception"].includes(defenseWin.outcome)) defensiveWins += 1;
  }

  assert.ok(offensiveWins > 80, "winning the Cover 0 race should create chunk plays");
  assert.ok(defensiveWins > 60, "losing the Cover 0 race should create pressure and turnovers");
});

test("keeps a human timing result hidden until resolution and gives the CPU a legal grade", async () => {
  const { createInitialGameState } = await vite.ssrLoadModule("/lib/game/engine.ts");
  const { applyPlayCall, buildGameView, selectCpuExecutionScore } = await vite.ssrLoadModule("/lib/game/server.ts");
  const { TEAM_BY_NAME, teamInputFromDefinition } = await vite.ssrLoadModule("/lib/game/teams.ts");
  const home = teamInputFromDefinition(TEAM_BY_NAME.get("Alabama"));
  const away = teamInputFromDefinition(TEAM_BY_NAME.get("Auburn"));
  const state = createInitialGameState("HIDDEN", home, away, "hidden-execution");
  state.phase = "scrimmage";
  state.driveNumber = 1;
  state.possession = "home";

  const pending = applyPlayCall(state, "home", "stick", "2026-09-04T00:00:00Z", 93).state;
  const awayView = buildGameView(pending, "away");
  assert.equal(awayView.state.pending.offenseSubmitted, true);
  assert.equal("executionScore" in awayView.state.pending, false);
  const resolved = applyPlayCall(pending, "away", "cover-2", "2026-09-04T00:00:01Z", 88).state;
  assert.equal(resolved.playLog.at(-1).offenseExecutionScore, 93);
  assert.equal(resolved.playLog.at(-1).defenseExecutionScore, 88);

  const cpuState = createInitialGameState("CPUTIME", home, away, "cpu-execution", "cpu");
  cpuState.phase = "scrimmage";
  cpuState.driveNumber = 1;
  cpuState.possession = "away";
  const cpuScore = selectCpuExecutionScore(cpuState);
  assert.ok(cpuScore >= 0 && cpuScore <= 100);
  const cpuResolved = applyPlayCall(cpuState, "home", "cover-2", "2026-09-04T00:00:02Z", 77).state;
  assert.ok(cpuResolved.playLog.at(-1).offenseExecutionScore >= 0);
  assert.ok(cpuResolved.playLog.at(-1).offenseExecutionScore <= 100);
  assert.equal(cpuResolved.playLog.at(-1).defenseExecutionScore, 77);
});

test("renders one-way offense and defense meters, a fast reveal, and no lock-play step", async () => {
  const component = await readFile(path.join(root, "app/components/DownByDownGame.tsx"), "utf8");
  const css = await readFile(path.join(root, "app/down-by-down.css"), "utf8");
  assert.match(component, /className="timing-meter-button"/);
  assert.match(component, /difficulty-\$\{state\.difficulty\}/);
  assert.match(component, /state\.difficulty\.toUpperCase\(\)/);
  assert.match(component, /onClick=\{\(\) => selectPlay\(play\.id\)\}/);
  assert.match(component, /onPointerDownCapture=\{\(event\) => \{/);
  assert.match(component, /if \(!selectedTimingPlay \|\| timingFeedback\) return/);
  assert.match(component, /getAnimations\(\)\[0\]/);
  assert.match(component, /getComputedTiming\(\)\.progress/);
  assert.match(component, /animation\?\.pause\(\)/);
  assert.match(component, /onAnimationEnd=\{\(\) => void stopTimingMeter\(true\)\}/);
  assert.match(component, /<SnapReveal state=\{state\} entry=\{replayEntry\}/);
  assert.match(component, /currentRole === "defense"/);
  assert.match(css, /#24943d var\(--meter-perfect/);
  assert.match(css, /--timing-sweep-duration:1\.4s/);
  assert.match(css, /difficulty-hard\{--timing-sweep-duration:\.84s\}/);
  assert.match(css, /difficulty-impossible\{--timing-sweep-duration:\.46s\}/);
  assert.match(css, /down-by-down-timing-sweep var\(--timing-sweep-duration\) linear 1 forwards/);
  assert.doesNotMatch(css, /linear infinite alternate/);
  assert.doesNotMatch(component, /<em>\{play\.description\}<\/em>/);
  assert.doesNotMatch(component, />LOCK PLAY</);
  assert.doesNotMatch(component, /CHANGE PLAY/);
  assert.doesNotMatch(component, /<header className="brand-lockup">/);
  assert.match(component, /GAME KEY \{state\.roomCode\}/);
});

test("team and position matchups alter meter speed and precision within each difficulty", async () => {
  const { meterSettings, meterZoneStops } = await vite.ssrLoadModule("/lib/game/execution.ts");
  const { TEAM_BY_NAME, teamInputFromDefinition } = await vite.ssrLoadModule("/lib/game/teams.ts");
  const { createInitialGameState } = await vite.ssrLoadModule("/lib/game/engine.ts");
  const base = createInitialGameState(
    "METERTEAM",
    teamInputFromDefinition(TEAM_BY_NAME.get("Alabama")),
    teamInputFromDefinition(TEAM_BY_NAME.get("Auburn")),
    "meter-rating-test",
  );
  const weakOffense = structuredClone(base.homeTeam);
  const eliteDefense = structuredClone(base.awayTeam);
  weakOffense.roster.offense.forEach((player) => { player.rating = 70; });
  eliteDefense.roster.defense.forEach((player) => { player.rating = 96; });
  const difficult = meterSettings("easy", "offense", weakOffense, eliteDefense, "run");
  const favorable = meterSettings("easy", "offense", eliteDefense, weakOffense, "run");
  assert.ok(difficult.durationSeconds < favorable.durationSeconds);
  assert.ok(difficult.precision > favorable.precision);
  assert.ok(meterSettings("hard", "offense", weakOffense, eliteDefense, "run").durationSeconds < difficult.durationSeconds);
  assert.ok(meterSettings("impossible", "offense", weakOffense, eliteDefense, "run").durationSeconds < meterSettings("hard", "offense", weakOffense, eliteDefense, "run").durationSeconds);

  const perfectWindowMs = (difficulty) => {
    const settings = meterSettings(difficulty, "offense", base.homeTeam, base.homeTeam, "run");
    const stops = meterZoneStops(settings.precision, difficulty);
    return settings.durationSeconds * (1 - (stops.perfect * 2) / 100) * 1000;
  };
  const easyWindow = perfectWindowMs("easy");
  const hardWindow = perfectWindowMs("hard");
  const impossibleWindow = perfectWindowMs("impossible");
  assert.ok(easyWindow >= 39 && easyWindow <= 41, `easy Perfect window was ${easyWindow.toFixed(2)} ms`);
  assert.ok(hardWindow < 16 && hardWindow > 14, `hard Perfect window was ${hardWindow.toFixed(2)} ms`);
  assert.ok(impossibleWindow < 6 && impossibleWindow > 4, `impossible Perfect window was ${impossibleWindow.toFixed(2)} ms`);
  assert.ok(easyWindow > hardWindow && hardWindow > impossibleWindow);
});

test("kicking meters use kicker rating, distance, and the selected difficulty", async () => {
  const { meterSettings } = await vite.ssrLoadModule("/lib/game/execution.ts");
  const { createInitialGameState, resolveSnap } = await vite.ssrLoadModule("/lib/game/engine.ts");
  const { TEAM_BY_NAME, teamInputFromDefinition } = await vite.ssrLoadModule("/lib/game/teams.ts");
  const home = teamInputFromDefinition(TEAM_BY_NAME.get("Alabama"));
  const away = teamInputFromDefinition(TEAM_BY_NAME.get("Auburn"));
  const base = createInitialGameState("KICKMETER", home, away, "kick-meter");
  const elite = structuredClone(base.homeTeam);
  const weak = structuredClone(base.homeTeam);
  elite.roster.specialTeams.find((player) => player.position === "K").rating = 97;
  weak.roster.specialTeams.find((player) => player.position === "K").rating = 68;
  const eliteClose = meterSettings("easy", "offense", elite, base.awayTeam, "field-goal", 30);
  const weakLong = meterSettings("easy", "offense", weak, base.awayTeam, "field-goal", 58);
  assert.ok(eliteClose.durationSeconds > weakLong.durationSeconds);
  assert.ok(eliteClose.precision < weakLong.precision);
  assert.ok(meterSettings("impossible", "offense", elite, base.awayTeam, "field-goal", 30).durationSeconds < eliteClose.durationSeconds);

  let perfectMakes = 0;
  let poorMakes = 0;
  for (let attempt = 0; attempt < 220; attempt += 1) {
    const perfect = createInitialGameState("KICKGOOD", home, away, `kick-good-${attempt}`);
    perfect.phase = "scrimmage";
    perfect.possession = "home";
    perfect.ballOn = 67;
    const poor = structuredClone(perfect);
    poor.seed = `kick-poor-${attempt}`;
    if (resolveSnap(perfect, "field-goal", "field-goal-safe", 100).state.score.home === 3) perfectMakes += 1;
    if (resolveSnap(poor, "field-goal", "field-goal-safe", 0).state.score.home === 3) poorMakes += 1;
  }
  assert.ok(perfectMakes > poorMakes + 35, `${perfectMakes} perfect makes versus ${poorMakes} poor makes`);
});

test("stores timing difficulty on new games and upgrades old rooms to easy", async () => {
  const { createInitialGameState, upgradeGameState } = await vite.ssrLoadModule("/lib/game/engine.ts");
  const { TEAM_BY_NAME, teamInputFromDefinition } = await vite.ssrLoadModule("/lib/game/teams.ts");
  const home = teamInputFromDefinition(TEAM_BY_NAME.get("Alabama"));
  const away = teamInputFromDefinition(TEAM_BY_NAME.get("Auburn"));
  const hard = createInitialGameState("HARD", home, away, "hard-meter", "cpu", "dark", "away", "hard");
  assert.equal(hard.difficulty, "hard");
  hard.schemaVersion = 7;
  hard.phase = "scrimmage";
  hard.pending.home = {
    seat: "home",
    role: "offense",
    playId: "inside-zone",
    playNumber: hard.playNumber,
    submittedAt: "2026-09-04T00:00:00Z",
    executionScore: 0.91,
  };
  delete hard.difficulty;
  upgradeGameState(hard);
  assert.equal(hard.difficulty, "easy");
  assert.equal(hard.schemaVersion, 9);
  assert.equal(hard.quarterLengthMinutes, 15);
  assert.equal(hard.pending.home.playId, "run");
  assert.equal(hard.pending.home.executionScore, 91);
});

test("uses the requested four-by-four concept playbook and preserves special teams", async () => {
  const { OFFENSE_PLAYS, DEFENSE_PLAYS } = await vite.ssrLoadModule("/lib/game/playbook.ts");
  const { PLAY_MATCHUP } = await vite.ssrLoadModule("/lib/game/engine.ts");
  assert.deepEqual(OFFENSE_PLAYS.map((play) => play.name), ["RUN", "STICK", "MESH", "FOUR VERTS"]);
  assert.deepEqual(DEFENSE_PLAYS.map((play) => play.name), ["BEAR FRONT", "COVER 2", "COVER 4", "COVER 0"]);
  assert.deepEqual(Object.keys(PLAY_MATCHUP), ["run", "stick", "mesh", "four-verts"]);
  assert.deepEqual(Object.keys(PLAY_MATCHUP.run), ["bear-front", "cover-2", "cover-4", "cover-0"]);
  assert.ok(PLAY_MATCHUP.run["bear-front"] < PLAY_MATCHUP.run["cover-4"]);
  assert.ok(PLAY_MATCHUP["four-verts"]["cover-4"] < PLAY_MATCHUP["four-verts"]["bear-front"]);
});

test("keeps the field rim, end-line posts, two-digit numbers, and compact drive rows", async () => {
  const css = await readFile(path.join(root, "app/down-by-down.css"), "utf8");
  assert.match(css, /compact-reference-field\{[\s\S]*border:2px solid #fff/);
  assert.match(css, /goal-post\.left\{left:-2px!important;right:auto!important\}/);
  assert.match(css, /yard-number b\{display:inline-block;min-width:2ch;white-space:nowrap/);
  assert.match(css, /drive-dropdown \.log-entry\{padding:6px 7px/);
  assert.match(css, /drive-dropdown \.log-entry p\{margin-top:4px;font-size:\.65rem/);
});
