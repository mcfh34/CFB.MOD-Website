"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Copy, FileDown, MessageSquareShare, Moon, Radio, RotateCcw, Sun, Volume2, VolumeX } from "lucide-react";
import { TeamLink } from "./TeamLink";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  formatClock,
  getAvailableDefensePlays,
  getAvailableOffensePlays,
} from "@/lib/game/engine";
import {
  executionGrade,
  executionMultiplier,
  meterSettings,
  meterZoneStops,
  playUsesExecutionMeter,
  timingScoreForPosition,
} from "@/lib/game/execution";
import {
  TEAM_BY_NAME,
  TEAM_CATALOG,
  teamInputFromDefinition,
} from "@/lib/game/teams";
import { resolveTeamLogoAsset } from "@/lib/teamLogoAssets";
import type {
  GameDifficulty,
  GameState,
  GameTheme,
  GameView,
  IndividualPlayerStats,
  OpponentType,
  DefensePlayId,
  OffensePlayId,
  PlayLogEntry,
  Player,
  TeamConfig,
  TeamInput,
  TeamSide,
} from "@/lib/game/types";

const DEFAULT_HOME = teamInputFromDefinition(TEAM_BY_NAME.get("Alabama") ?? TEAM_CATALOG[0]);
const DEFAULT_AWAY = teamInputFromDefinition(TEAM_BY_NAME.get("Auburn") ?? TEAM_CATALOG[1]);
const YARD_LINES = Array.from({ length: 19 }, (_, index) => (index + 1) * 5);
const HASH_YARDS = Array.from({ length: 99 }, (_, index) => index + 1);
const HASH_ROWS = [
  { y: 0, className: "sideline-hashes top-sideline" },
  { y: 36, className: "inbound-hashes" },
  { y: 64, className: "inbound-hashes" },
  { y: 100, className: "sideline-hashes bottom-sideline" },
] as const;
const CROWD_BASELINE_VOLUME = 0.18;
const CROWD_HOME_PLAY_VOLUME = 0.3;
const CROWD_HOME_BIG_PLAY_VOLUME = 0.48;
const CROWD_AWAY_PLAY_VOLUME = 0.07;
const CROWD_AWAY_BIG_PLAY_VOLUME = 0.025;
const CROWD_REACTION_DELAY_MS = 520;
const OFFENSE_FORMATION = [
  { dx: -4, y: 50 },
  { dx: -8, y: 63 },
  { dx: -1.5, y: 7 },
  { dx: -1.5, y: 93 },
  { dx: -2, y: 80 },
  { dx: -1.5, y: 20 },
  { dx: -1.2, y: 32 },
  { dx: -1.2, y: 41 },
  { dx: -1.2, y: 50 },
  { dx: -1.2, y: 59 },
  { dx: -1.2, y: 68 },
] as const;

const DEFENSE_FORMATION = [
  { dx: 3.2, y: 29 },
  { dx: 3.2, y: 43 },
  { dx: 3.2, y: 57 },
  { dx: 3.2, y: 71 },
  { dx: 7, y: 34 },
  { dx: 7, y: 50 },
  { dx: 7, y: 66 },
  { dx: 4, y: 8 },
  { dx: 4, y: 92 },
  { dx: 13, y: 34 },
  { dx: 13, y: 66 },
] as const;

export type DownByDownSession = { code: string; seat: TeamSide; token: string };
type Session = DownByDownSession;
type Notice = { tone: "plain" | "error" | "success"; text: string } | null;
type TimingFeedback = {
  score: number;
  label: string;
  tier: string;
  multiplier: number;
};
type TimingPlayId = OffensePlayId | DefensePlayId;

function periodLabel(state: GameView["state"]) {
  return state.period <= 4 ? `Q${state.period}` : `OT${state.overtime?.round ?? 1}`;
}

function fieldPosition(state: GameView["state"]) {
  const offense = state.possession === "home" ? state.homeTeam : state.awayTeam;
  const defense = state.possession === "home" ? state.awayTeam : state.homeTeam;
  if (state.ballOn === 50) return "50";
  return state.ballOn < 50
    ? `${offense.abbreviation} ${state.ballOn}`
    : `${defense.abbreviation} ${100 - state.ballOn}`;
}

function ordinal(value: number) {
  if (value === 1) return "1ST";
  if (value === 2) return "2ND";
  if (value === 3) return "3RD";
  return "4TH";
}

function downAndDistance(state: GameView["state"]) {
  return state.ballOn >= 90 ? `${ordinal(state.down)} & GOAL` : `${ordinal(state.down)} & ${state.toGo}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function TeamLogo({
  team,
  className = "",
}: {
  team: Pick<TeamInput, "logo" | "name" | "abbreviation" | "primaryColor" | "secondaryColor">;
  className?: string;
}) {
  const logo = resolveTeamLogoAsset(team.name) ?? team.logo;
  if (logo) {
    return <TeamLink team={team.name} className={`team-logo ${className}`}><img src={logo} alt="" /></TeamLink>;
  }
  return (
    <TeamLink team={team.name}
      className={`team-logo team-logo-fallback ${className}`}
      style={{ backgroundColor: team.primaryColor, color: team.secondaryColor }}
      aria-label={`${team.name} logo`}
    >
      {team.abbreviation.slice(0, 2)}
    </TeamLink>
  );
}

function TeamPicker({
  id,
  label,
  value,
  teams,
  onChange,
}: {
  id: string;
  label: string;
  value: TeamInput;
  teams: TeamInput[];
  onChange: (next: TeamInput) => void;
}) {
  const selected = teams.find((team) => team.teamId === value.teamId) ?? teams[0] ?? value;
  const groups = [...new Set(teams.map((team) => team.conference))]
    .sort((left, right) => left.localeCompare(right))
    .map((conference) => ({ conference, teams: teams.filter((team) => team.conference === conference) }));

  function selectTeam(teamId: string) {
    const team = teams.find((candidate) => candidate.teamId === teamId);
    if (team) onChange({ ...team });
  }

  return (
    <fieldset className="team-picker">
      <legend>{label}</legend>
      <div className="team-picker-preview">
        <TeamLogo team={value} />
        <div>
          <strong>{selected.name}</strong>
          <span>{selected.mascot} · {selected.conference}</span>
          <div className="team-swatches" aria-label={`${selected.name} colors`}>
            <i style={{ background: selected.primaryColor }} />
            <i style={{ background: selected.secondaryColor }} />
          </div>
        </div>
      </div>
      <div className="team-picker-controls">
        <div className="field field-wide">
          <Label htmlFor={`${id}-team`}>College football team</Label>
          <select id={`${id}-team`} value={value.teamId} onChange={(event) => selectTeam(event.target.value)}>
            {groups.map((group) => (
              <optgroup key={group.conference} label={group.conference}>
                {group.teams.map((team) => (
                  <option key={team.teamId} value={team.teamId}>{team.name} — {team.mascot}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="field rating-field">
          <Label htmlFor={`${id}-rating`}>Simulation rating</Label>
          <Input
            id={`${id}-rating`}
            type="number"
            min={60}
            max={99}
            value={value.rating ?? selected.rating}
            onChange={(event) => onChange({ ...value, rating: Number(event.target.value) })}
          />
        </div>
      </div>
    </fieldset>
  );
}

function Lobby({
  onCreated,
  teamDirectory,
  defaultTheme,
}: {
  onCreated: (session: Session, awayToken: string, opponentType: OpponentType) => void;
  teamDirectory: TeamInput[];
  defaultTheme: GameTheme;
}) {
  const availableTeams = teamDirectory.length ? teamDirectory : [DEFAULT_HOME, DEFAULT_AWAY];
  const [homeTeam, setHomeTeam] = useState<TeamInput>(() => availableTeams.find((team) => team.name === "Alabama") ?? availableTeams[0]);
  const [awayTeam, setAwayTeam] = useState<TeamInput>(() => availableTeams.find((team) => team.name === "Auburn") ?? availableTeams[1] ?? availableTeams[0]);
  const [opponentType, setOpponentType] = useState<OpponentType>("human");
  const [theme, setTheme] = useState<GameTheme>(defaultTheme);
  const [difficulty, setDifficulty] = useState<GameDifficulty>("easy");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function createGame() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ homeTeam, awayTeam, opponentType, theme, difficulty }),
      });
      const payload = (await response.json()) as {
        error?: string;
        roomCode?: string;
        homeToken?: string;
        awayToken?: string;
      };
      if (!response.ok || !payload.roomCode || !payload.homeToken || !payload.awayToken) {
        throw new Error(payload.error ?? "The game room could not be created.");
      }
      onCreated(
        { code: payload.roomCode, seat: "home", token: payload.homeToken },
        payload.awayToken,
        opponentType,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The game room could not be created.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={`lobby-shell theme-${theme}`}>
      <section className="lobby-grid lobby-grid-simple">
        <div className="lobby-intro lobby-intro-simple">
          <p className="signal"><Radio /> LIVE CALL SHEET</p>
          <h2>Set the matchup. Call every snap.</h2>
          <p>
            Choose two teams, select the challenge, and take the field against a friend or the CPU.
          </p>
        </div>

        <div className="setup-panel">
          <div className="setup-heading">
            <span>NEW MATCHUP</span>
            <span>FBS TEAM DIRECTORY</span>
          </div>
          <div className="opponent-mode" role="radiogroup" aria-label="Opponent type">
            <button
              type="button"
              role="radio"
              aria-checked={opponentType === "human"}
              className={opponentType === "human" ? "selected" : ""}
              onClick={() => setOpponentType("human")}
            >
              <strong>PLAY A FRIEND</strong>
              <span>Share a private game link</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={opponentType === "cpu"}
              className={opponentType === "cpu" ? "selected" : ""}
              onClick={() => setOpponentType("cpu")}
            >
              <strong>PLAY CPU</strong>
              <span>Instant situation-based calls</span>
            </button>
          </div>
          <div className="theme-picker" role="radiogroup" aria-label="Game theme">
            <span>GAME THEME</span>
            <div>
              <button
                type="button"
                role="radio"
                aria-checked={theme === "dark"}
                className={theme === "dark" ? "selected" : ""}
                onClick={() => setTheme("dark")}
              >DARK</button>
              <button
                type="button"
                role="radio"
                aria-checked={theme === "light"}
                className={theme === "light" ? "selected" : ""}
                onClick={() => setTheme("light")}
              >LIGHT</button>
            </div>
          </div>
          <div className="difficulty-picker compact" role="radiogroup" aria-label="Timing difficulty">
            <span>TIMING DIFFICULTY</span>
            <div>
              {(["easy","hard","impossible"] as GameDifficulty[]).map((option)=><button key={option} type="button" role="radio" aria-checked={difficulty===option} className={difficulty===option?"selected":""} onClick={()=>setDifficulty(option)}>{option.toUpperCase()}</button>)}
            </div>
          </div>
          <TeamPicker id="home" label="Your team // Home" value={homeTeam} teams={availableTeams} onChange={setHomeTeam} />
          <TeamPicker
            id="away"
            label={opponentType === "cpu" ? "CPU team // Away" : "Opponent // Away"}
            value={awayTeam}
            teams={availableTeams}
            onChange={setAwayTeam}
          />
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <Button className="create-button" size="lg" disabled={busy} onClick={createGame}>
            {busy ? "CREATING GAME…" : opponentType === "cpu" ? "START CPU GAME" : "CREATE PRIVATE GAME"}
          </Button>
          <p className="fine-print">
            {opponentType === "cpu"
              ? "The CPU calls without seeing your choice and adjusts to down, distance, field position, score, and clock."
              : "Your friend receives a private away-team link after the game is created."}
          </p>
        </div>
      </section>
    </main>
  );
}

function TeamScore({
  team,
  score,
  possession,
  align,
}: {
  team: TeamConfig;
  score: number;
  possession: boolean;
  align: "left" | "right";
}) {
  return (
    <div className={`team-score ${align}`} style={{ "--team-primary": team.primaryColor, "--team-secondary": team.secondaryColor } as CSSProperties}>
      <TeamLogo team={team} />
      <div className="team-score-copy">
        <div className="score-name-row">
          {possession ? <span className="possession-dot" title="Possession" /> : null}
          <span className="score-school" style={{ color: team.primaryColor }}>{team.ranking ? `#${team.ranking} ` : ""}{team.name}</span>
        </div>
        <span className="score-team-name">{team.record ?? "0-0"}{team.conference ? ` · ${team.conference}` : ""}</span>
      </div>
      <strong>{score}</strong>
    </div>
  );
}

function formationX(ballOn: number, dx: number) {
  if (dx < 0) return clamp(ballOn + dx * Math.min(1, Math.max(0.35, (ballOn - 1) / 9)), 1, 99);
  return clamp(ballOn + dx * Math.min(1, Math.max(0.3, (99 - ballOn) / 13)), 1, 99);
}

function endZoneNameStyle(name: string) {
  const glyphScale = 1 / Math.max(name.length * 0.58, 5.5);
  return { "--end-zone-glyph-scale": glyphScale } as CSSProperties;
}

function PlayerPuck({
  player,
  team,
  unit,
  x,
  y,
  label,
  motion,
}: {
  player: Player;
  team: TeamConfig;
  unit: "offense" | "defense";
  x: number;
  y: number;
  label?: string;
  motion?: {
    toX: number;
    toY: number;
    viaX?: number;
    viaY?: number;
    delay: number;
    emphasis?: boolean;
    carryBall?: boolean;
    routeTarget?: boolean;
    passerDrop?: boolean;
    motionKind?: "route" | "handoff-qb" | "handoff-runner" | "kickoff-returner" | "punt-returner" | "kicker" | "coverage";
  };
}) {
  const replayX = motion?.toX ?? x;
  const replayY = motion?.toY ?? y;
  const replayViaX = motion?.viaX ?? x + (replayX - x) * 0.55;
  const replayViaY = motion?.viaY ?? y + (replayY - y) * 0.55;
  return (
    <span
      className={`player-puck ${unit} ${motion ? "replaying" : ""} ${motion?.emphasis ? "play-focus" : ""} ${motion?.carryBall ? "run-carrier" : ""} ${motion?.routeTarget ? "route-target" : ""} ${motion?.passerDrop ? "passer-drop" : ""} ${motion?.motionKind ? `motion-${motion.motionKind}` : ""}`}
      style={{
        left: `${x}%`,
        top: `${y}%`,
        "--puck-primary": team.primaryColor,
        "--puck-secondary": team.secondaryColor,
        "--replay-from-x": `${x}%`,
        "--replay-from-y": `${y}%`,
        "--replay-via-x": `${replayViaX}%`,
        "--replay-via-y": `${replayViaY}%`,
        "--replay-x": `${replayX}%`,
        "--replay-y": `${replayY}%`,
        "--replay-delay": `${motion?.delay ?? 0}ms`,
      } as CSSProperties}
      title={`${label ?? player.position} #${player.number} ${player.name}`}
    >
      {label ?? player.position}
    </span>
  );
}

type UnitMember = {
  player: Player;
  label: string;
  x: number;
  y: number;
};

function allTeamPlayers(team: TeamConfig) {
  return [...team.roster.offense, ...team.roster.defense, ...(team.roster.specialTeams ?? [])];
}

function teamPlayer(team: TeamConfig, playerId?: string) {
  return playerId ? allTeamPlayers(team).find((player) => player.id === playerId) : undefined;
}

function specialist(team: TeamConfig, position: "K" | "P" | "LS" | "H", fallbackIndex = 0) {
  const found = team.roster.specialTeams?.find((player) => player.position === position);
  if (found) return found;
  const fallback = team.roster.offense[fallbackIndex] ?? team.roster.offense[0];
  return { ...fallback, id: `${fallback.id}-as-${position.toLowerCase()}`, position } as Player;
}

function uniqueUnitPlayers(team: TeamConfig, preferred: Array<Player | undefined>, count: number) {
  const result: Player[] = [];
  const seen = new Set<string>();
  for (const player of [...preferred, ...allTeamPlayers(team)]) {
    if (!player || seen.has(player.id)) continue;
    seen.add(player.id);
    result.push(player);
    if (result.length === count) break;
  }
  return result;
}

function currentDrivePlays(state: GameView["state"]) {
  const latestScrimmage = [...state.playLog].reverse().find((entry) =>
    !["kickoff", "extra-point", "field-goal"].includes(entry.outcome),
  );
  const driveNumber = state.phase === "scrimmage" ? state.driveNumber : latestScrimmage?.driveNumber;
  if (!driveNumber) return [];
  return state.playLog.filter((entry) =>
    entry.driveNumber === driveNumber && !["kickoff", "extra-point"].includes(entry.outcome),
  );
}

export function DetailedField({
  state,
  replayEntry,
}: {
  state: GameView["state"];
  replayEntry?: PlayLogEntry;
}) {
  const displayPossession = replayEntry?.offense ?? state.possession;
  const offense = displayPossession === "home" ? state.homeTeam : state.awayTeam;
  const defense = displayPossession === "home" ? state.awayTeam : state.homeTeam;
  const homeMovingRight = displayPossession === "home";
  const displayBallOn = replayEntry?.ballOnBefore ?? state.ballOn;
  const ballPercent = clamp(homeMovingRight ? displayBallOn : 100 - displayBallOn, 1, 99);
  const lineToGain = clamp(
    homeMovingRight ? state.ballOn + state.toGo : 100 - state.ballOn - state.toGo,
    1,
    99,
  );
  const endZonePylons = ["top-left", "top-right", "bottom-left", "bottom-right"];
  const fieldX = (side: TeamSide, ballOn: number) => clamp(side === "home" ? ballOn : 100 - ballOn, 0, 100);
  const driveStartPercent = fieldX(state.possession, state.driveStartBallOn);
  const driveLeft = Math.min(driveStartPercent, ballPercent);
  const driveWidth = Math.abs(ballPercent - driveStartPercent);
  const drivePlays = currentDrivePlays(state);
  const isConversion = state.phase === "conversion" && !replayEntry;
  const showFormation = Boolean(replayEntry) || state.phase === "scrimmage" || isConversion;
  const direction = homeMovingRight ? 1 : -1;
  const replayEndX = replayEntry
    ? clamp(ballPercent + direction * replayEntry.yards, 0, 100)
    : ballPercent;
  const runLane = replayEntry?.offensePlayId === "outside-zone"
    ? replayEntry.number % 2 ? 20 : 80
    : replayEntry?.offensePlayId === "power"
      ? 42
      : replayEntry?.offensePlayId === "counter"
        ? 62
        : 50;
  const isPassReplay = Boolean(replayEntry && ["stick", "mesh", "four-verts", "quick-pass", "dropback", "play-action", "screen"].includes(replayEntry.offensePlayId));
  const receiverIndex = replayEntry?.participants?.receiverId
    ? offense.roster.offense.findIndex((player) => player.id === replayEntry.participants?.receiverId)
    : -1;
  const receiverPoint = receiverIndex >= 0 ? OFFENSE_FORMATION[receiverIndex] : undefined;
  const passTargetY = receiverPoint
    ? clamp(receiverPoint.y + (50 - receiverPoint.y) * 0.35, 12, 88)
    : runLane;
  const collisionY = isPassReplay ? passTargetY : runLane;
  const passDepth = replayEntry?.offensePlayId === "stick" || replayEntry?.offensePlayId === "quick-pass" ? 6
    : replayEntry?.offensePlayId === "screen" ? 4
      : replayEntry?.offensePlayId === "play-action" ? 14
        : 11;
  const passTargetX = replayEntry && isPassReplay
    ? replayEntry.outcome === "completion" || replayEntry.outcome === "touchdown"
      ? replayEndX
      : replayEntry.outcome === "interception"
        ? clamp(ballPercent + direction * replayEntry.yards, 0, 100)
        : clamp(ballPercent + direction * passDepth, 0, 100)
    : replayEndX;
  const turnoverReturnX = replayEntry && replayEntry.possessionAfter !== replayEntry.offense
    ? fieldX(replayEntry.possessionAfter, replayEntry.ballOnAfter)
    : replayEndX;
  const specialReplay = replayEntry?.specialTeamsReplay;
  const specialDirection = specialReplay?.kickingSide === "away" ? -1 : 1;
  const specialLane = replayEntry?.offensePlayId === "kick-return-left" ? 22
    : replayEntry?.offensePlayId === "kick-return-right" ? 78
      : 50;
  const isTouchbackReplay = Boolean(replayEntry && /touchback/i.test(replayEntry.summary));

  const specialUnits = specialReplay ? (() => {
    const participants = replayEntry?.participants ?? {};
    if (specialReplay.kind === "kickoff") {
      const returner = teamPlayer(offense, participants.returnerId) ?? offense.roster.offense.find((player) => player.position === "RB");
      const kicker = teamPlayer(defense, participants.kickerId) ?? specialist(defense, "K");
      const tackler = teamPlayer(defense, participants.specialTeamsTacklerId);
      const returnPlayers = uniqueUnitPlayers(offense, [returner], 11);
      const coveragePlayers = uniqueUnitPlayers(defense, [kicker, tackler], 11);
      const returnSpots = [
        { ballOn: 1, y: specialLane },
        { ballOn: 18, y: 12 }, { ballOn: 18, y: 32 }, { ballOn: 18, y: 68 }, { ballOn: 18, y: 88 },
        { ballOn: 30, y: 20 }, { ballOn: 30, y: 40 }, { ballOn: 30, y: 60 }, { ballOn: 30, y: 80 },
        { ballOn: 43, y: 35 }, { ballOn: 43, y: 65 },
      ];
      return {
        offense: returnPlayers.map((player, index) => ({
          player,
          label: player.id === returner?.id ? "KR" : player.position,
          x: specialReplay.onside
            ? clamp(specialReplay.flightX - specialDirection * (4 + (index % 3) * 2), 1, 99)
            : fieldX(offense.side, returnSpots[index]?.ballOn ?? 25),
          y: specialReplay.onside ? 12 + index * 7.6 : returnSpots[index]?.y ?? 50,
        })),
        defense: coveragePlayers.map((player, index) => ({
          player,
          label: player.id === kicker.id ? "K" : player.position,
          x: clamp(specialReplay.startX - specialDirection * (player.id === kicker.id ? 3 : index % 2), 1, 99),
          y: player.id === kicker.id ? 50 : 7 + ((index - 1 + 10) % 10) * 9.5,
        })),
      };
    }

    if (specialReplay.kind === "punt") {
      const punter = teamPlayer(offense, participants.punterId) ?? specialist(offense, "P");
      const snapper = specialist(offense, "LS", 6);
      const tackler = teamPlayer(offense, participants.specialTeamsTacklerId);
      const returner = teamPlayer(defense, participants.returnerId) ?? defense.roster.offense.find((player) => player.position === "WR");
      const puntPlayers = uniqueUnitPlayers(offense, [punter, snapper, tackler], 11);
      const returnPlayers = uniqueUnitPlayers(defense, [returner], 11);
      const lineY = [50, 18, 29, 40, 61, 72, 83, 8, 92, 34, 66];
      return {
        offense: puntPlayers.map((player, index) => ({
          player,
          label: player.id === punter.id ? "P" : player.id === snapper.id ? "LS" : player.position,
          x: player.id === punter.id
            ? clamp(specialReplay.startX - specialDirection * 13, 1, 99)
            : clamp(specialReplay.startX - specialDirection * (index > 6 ? 3 : 0.8), 1, 99),
          y: player.id === punter.id ? 50 : lineY[index] ?? 50,
        })),
        defense: returnPlayers.map((player, index) => ({
          player,
          label: player.id === returner?.id ? "PR" : player.position,
          x: player.id === returner?.id
            ? specialReplay.flightX
            : clamp(specialReplay.startX + specialDirection * (2 + (index % 3) * 4), 1, 99),
          y: player.id === returner?.id ? specialLane : lineY[index] ?? 50,
        })),
      };
    }

    const kicker = teamPlayer(offense, participants.kickerId) ?? specialist(offense, "K");
    const holder = specialist(offense, "H", 1);
    const snapper = specialist(offense, "LS", 6);
    const blocker = teamPlayer(defense, participants.specialTeamsTacklerId);
    const kickPlayers = uniqueUnitPlayers(offense, [kicker, holder, snapper], 11);
    const rushPlayers = uniqueUnitPlayers(defense, [blocker], 11);
    const kickLineY = [58, 50, 50, 16, 27, 38, 62, 73, 84, 8, 92];
    return {
      offense: kickPlayers.map((player, index) => ({
        player,
        label: player.id === kicker.id ? "K" : player.id === holder.id ? "H" : player.id === snapper.id ? "LS" : player.position,
        x: player.id === kicker.id
          ? clamp(specialReplay.startX - specialDirection * 9, 1, 99)
          : player.id === holder.id
            ? clamp(specialReplay.startX - specialDirection * 7, 1, 99)
            : clamp(specialReplay.startX - specialDirection * 0.8, 1, 99),
        y: kickLineY[index] ?? 50,
      })),
      defense: rushPlayers.map((player, index) => ({
        player,
        label: player.position,
        x: clamp(specialReplay.startX + specialDirection * (1.5 + (index % 3) * 1.5), 1, 99),
        y: 8 + index * 8.4,
      })),
    };
  })() : undefined;

  function replayStartX(unit: "offense" | "defense", index: number, dx: number) {
    if (replayEntry?.outcome !== "kickoff") return formationX(ballPercent, dx * direction);
    if (unit === "offense") {
      return fieldX(displayPossession, index < 2 ? 8 : 16 + (index % 3) * 3);
    }
    const kickingSide = displayPossession === "home" ? "away" : "home";
    return fieldX(kickingSide, 35 - (index % 3) * 2);
  }

  function specialReplayMotion(member: UnitMember, index: number, unit: "offense" | "defense") {
    if (!specialReplay || !replayEntry) return undefined;
    const participants = replayEntry.participants ?? {};
    if (specialReplay.kind === "kickoff") {
      if (specialReplay.onside) {
        return {
          toX: specialReplay.endX + (index % 2 ? -0.6 : 0.6),
          toY: 28 + (index % 7) * 7,
          delay: index * 8,
          emphasis: specialReplay.kickingTeamRecovered
            ? unit === "defense" && index === 1
            : unit === "offense" && index === 0,
          motionKind: "coverage" as const,
        };
      }
      if (unit === "offense" && member.player.id === participants.returnerId) {
        if (isTouchbackReplay) return undefined;
        return {
          toX: specialReplay.endX,
          toY: specialLane,
          delay: 0,
          emphasis: true,
          carryBall: true,
          motionKind: "kickoff-returner" as const,
        };
      }
      if (unit === "defense" && member.player.id === participants.kickerId) {
        return {
          toX: clamp(member.x + specialDirection * 5, 1, 99),
          toY: 50,
          delay: 0,
          emphasis: true,
          motionKind: "kicker" as const,
        };
      }
      if (unit === "defense" && member.player.id === participants.specialTeamsTacklerId) {
        return {
          toX: specialReplay.endX,
          toY: specialLane + 2,
          delay: 0,
          emphasis: true,
          motionKind: "coverage" as const,
        };
      }
      const targetX = isTouchbackReplay
        ? specialReplay.flightX
        : member.x + (specialReplay.endX - member.x) * (unit === "defense" ? 0.88 : 0.58);
      return {
        toX: clamp(targetX, 1, 99),
        toY: member.y + (specialLane - member.y) * 0.35,
        delay: index * 7,
        motionKind: unit === "defense" ? "coverage" as const : "route" as const,
      };
    }

    if (specialReplay.kind === "punt") {
      if (unit === "offense" && member.player.id === participants.punterId) {
        return {
          toX: clamp(member.x + specialDirection * 2.5, 1, 99),
          toY: 50,
          delay: 0,
          emphasis: true,
          motionKind: "kicker" as const,
        };
      }
      if (unit === "defense" && member.player.id === participants.returnerId) {
        if (isTouchbackReplay) return undefined;
        return {
          toX: specialReplay.endX,
          toY: specialLane,
          delay: 0,
          emphasis: true,
          carryBall: true,
          motionKind: "punt-returner" as const,
        };
      }
      if (unit === "offense" && member.player.id === participants.specialTeamsTacklerId) {
        return {
          toX: specialReplay.endX,
          toY: specialLane + 2,
          delay: 0,
          emphasis: true,
          motionKind: "coverage" as const,
        };
      }
      return {
        toX: specialReplay.blocked
          ? clamp(specialReplay.endX + (index % 2 ? -1 : 1), 1, 99)
          : member.x + (specialReplay.endX - member.x) * (unit === "offense" ? 0.8 : 0.35),
        toY: member.y + (specialLane - member.y) * 0.3,
        delay: index * 6,
        motionKind: unit === "offense" ? "coverage" as const : "route" as const,
      };
    }

    const holderX = clamp(specialReplay.startX - specialDirection * 7, 1, 99);
    if (unit === "offense" && member.player.id === participants.kickerId) {
      return {
        toX: holderX + specialDirection * 1.5,
        toY: 50,
        delay: 0,
        emphasis: true,
        motionKind: "kicker" as const,
      };
    }
    if (unit === "defense" && member.player.id === participants.specialTeamsTacklerId) {
      return {
        toX: specialReplay.endX,
        toY: 50,
        delay: 0,
        emphasis: true,
        motionKind: "coverage" as const,
      };
    }
    return {
      toX: clamp(member.x + specialDirection * (unit === "offense" ? 1.5 : -1.5), 1, 99),
      toY: member.y + (50 - member.y) * 0.15,
      delay: index * 5,
      motionKind: unit === "defense" ? "coverage" as const : "route" as const,
    };
  }

  const quarterbackIndex = offense.roster.offense.findIndex((player) => player.position === "QB");
  const runnerIndex = replayEntry?.participants?.runnerId
    ? offense.roster.offense.findIndex((player) => player.id === replayEntry.participants?.runnerId)
    : offense.roster.offense.findIndex((player) => player.position === "RB");
  const quarterbackPoint = OFFENSE_FORMATION[Math.max(0, quarterbackIndex)] ?? OFFENSE_FORMATION[0];
  const runnerPoint = OFFENSE_FORMATION[Math.max(0, runnerIndex)] ?? OFFENSE_FORMATION[1];
  const passerStartX = replayStartX("offense", Math.max(0, quarterbackIndex), quarterbackPoint.dx);
  const passReleaseX = clamp(passerStartX - direction * 3, 1, 99);
  const runnerStartX = replayStartX("offense", Math.max(0, runnerIndex), runnerPoint.dx);
  const scrimmageRun = Boolean(
    replayEntry &&
    ["run", "inside-zone", "power", "outside-zone", "counter", "rpo"].includes(replayEntry.offensePlayId),
  );
  const handoffX = clamp((passerStartX + runnerStartX) / 2 + direction * 0.3, 1, 99);
  const handoffY = 50 + (runnerPoint.y - 50) * 0.52;

  function replayMotion(player: Player, index: number, unit: "offense" | "defense") {
    if (!replayEntry) return undefined;
    const point = unit === "offense"
      ? OFFENSE_FORMATION[index] ?? OFFENSE_FORMATION[0]
      : DEFENSE_FORMATION[index] ?? DEFENSE_FORMATION[0];
    const startX = replayStartX(unit, index, point.dx);
    const participants = replayEntry.participants ?? {};
    const ballCarrierId = replayEntry.outcome === "completion"
      ? participants.receiverId
      : replayEntry.outcome === "sack" || replayEntry.outcome === "incompletion" || replayEntry.outcome === "spike"
        ? participants.passerId
        : participants.runnerId;
    const tackleIds = new Set(participants.tacklerIds ?? []);
    if (unit === "offense") {
      if (player.id === ballCarrierId) {
        if (scrimmageRun && !isPassReplay) {
          return {
            viaX: handoffX,
            viaY: handoffY,
            toX: replayEndX,
            toY: runLane,
            delay: 0,
            emphasis: true,
            carryBall: true,
            motionKind: "handoff-runner" as const,
          };
        }
        return {
          toX: replayEndX,
          toY: isPassReplay ? passTargetY : runLane,
          delay: 0,
          emphasis: true,
          carryBall: !isPassReplay,
          routeTarget: isPassReplay,
          motionKind: isPassReplay ? "route" as const : undefined,
        };
      }
      if (player.id === participants.receiverId && isPassReplay) {
        return { toX: passTargetX, toY: passTargetY, delay: 0, emphasis: true, routeTarget: true, motionKind: "route" as const };
      }
      if (player.id === participants.passerId) {
        if (scrimmageRun) {
          return {
            viaX: handoffX,
            viaY: handoffY,
            toX: clamp(handoffX - direction * 1.4, 1, 99),
            toY: clamp(handoffY + (runLane <= 50 ? 6 : -6), 8, 92),
            delay: 0,
            emphasis: true,
            motionKind: "handoff-qb" as const,
          };
        }
        return {
          toX: startX - direction * (isPassReplay ? 3 : -1),
          toY: 50,
          delay: 0,
          emphasis: true,
          passerDrop: isPassReplay,
        };
      }
      const routeDepth = isPassReplay && ["WR", "TE", "RB"].includes(player.position) ? 8 + (index % 3) * 3 : 2;
      return {
        toX: clamp(startX + direction * routeDepth, 1, 99),
        toY: isPassReplay ? clamp(point.y + (index % 2 ? -6 : 6), 7, 93) : point.y + (runLane - point.y) * 0.18,
        delay: index * 5,
        motionKind: isPassReplay && ["WR", "TE", "RB"].includes(player.position) ? "route" as const : undefined,
      };
    }
    if (player.id === participants.interceptionById) {
      return {
        viaX: passTargetX,
        viaY: passTargetY,
        toX: turnoverReturnX,
        toY: passTargetY,
        delay: 0,
        emphasis: true,
      };
    }
    if (player.id === participants.coverageDefenderId || player.id === participants.passBreakupById) {
      return {
        toX: clamp(passTargetX - direction * 0.9, 0, 100),
        toY: passTargetY,
        delay: 0,
        emphasis: true,
      };
    }
    if (tackleIds.has(player.id) || player.id === participants.forcedFumbleById) {
      return { toX: replayEndX, toY: collisionY + (index % 2 ? -2 : 2), delay: 40, emphasis: true };
    }
    return {
      toX: startX + (replayEndX - startX) * 0.42,
      toY: point.y + (collisionY - point.y) * 0.32,
      delay: 20 + index * 5,
    };
  }

  const kickThroughX = homeMovingRight ? 100 : 0;
  const ballToX = replayEntry && ["field-goal", "extra-point"].includes(replayEntry.outcome)
    ? kickThroughX
    : replayEntry?.outcome === "incompletion"
      ? passTargetX
      : replayEntry && ["interception", "fumble", "punt"].includes(replayEntry.outcome)
        ? fieldX(replayEntry.possessionAfter, replayEntry.ballOnAfter)
        : replayEndX;
  const thrownPass = Boolean(
    replayEntry &&
    isPassReplay &&
    ["completion", "touchdown", "incompletion", "interception"].includes(replayEntry.outcome),
  );
  const pathMiddleX = (passReleaseX + passTargetX) / 2;
  const specialTargetY = specialReplay?.made || specialReplay?.blocked
    ? 50
    : specialReplay?.missSide === "left" ? 34 : specialReplay?.missSide === "right" ? 66 : specialLane;
  const specialVisualEndX = specialReplay && ["field-goal", "extra-point"].includes(specialReplay.kind) && !specialReplay.blocked
    ? specialDirection > 0 ? 112 : -12
    : isTouchbackReplay && specialReplay
      ? specialReplay.flightX
      : specialReplay?.endX ?? 0;
  const specialReleaseX = specialReplay?.kind === "punt"
    ? clamp(specialReplay.startX - specialDirection * 13, 1, 99)
    : specialReplay && ["field-goal", "extra-point"].includes(specialReplay.kind)
      ? clamp(specialReplay.startX - specialDirection * 7, 1, 99)
      : specialReplay?.startX ?? 0;
  const specialPlayPath = specialReplay
    ? specialReplay.kind === "kickoff"
      ? specialReplay.onside
        ? `M ${specialReplay.startX} 50 Q ${(specialReplay.startX + specialReplay.flightX) / 2} 44 ${specialReplay.flightX} 50`
        : `M ${specialReplay.startX} 50 Q ${(specialReplay.startX + specialReplay.flightX) / 2} 18 ${specialReplay.flightX} ${specialLane} Q ${(specialReplay.flightX + specialVisualEndX) / 2} ${specialLane} ${specialVisualEndX} ${specialLane}`
      : specialReplay.kind === "punt"
        ? `M ${specialReplay.startX} 50 L ${specialReleaseX} 50 Q ${(specialReleaseX + specialReplay.flightX) / 2} 15 ${specialReplay.flightX} ${specialLane} Q ${(specialReplay.flightX + specialVisualEndX) / 2} ${specialLane} ${specialVisualEndX} ${specialLane}`
        : `M ${specialReplay.startX} 50 L ${specialReleaseX} 50 Q ${(specialReleaseX + specialVisualEndX) / 2} ${Math.min(32, specialTargetY)} ${specialVisualEndX} ${specialTargetY}`
    : "";
  const playPath = specialPlayPath || (thrownPass
    ? `M ${passReleaseX} 50 Q ${pathMiddleX} ${(50 + passTargetY) / 2 - 3} ${passTargetX} ${passTargetY}`
    : scrimmageRun
      ? `M ${passerStartX} 50 Q ${(passerStartX + handoffX) / 2} ${handoffY} ${handoffX} ${handoffY} Q ${(handoffX + replayEndX) / 2} ${runLane} ${replayEndX} ${runLane}`
      : "");
  const regularBallReplayStyle = replayEntry ? {
    "--ball-from-x": `${replayEntry.outcome === "kickoff" ? fieldX(replayEntry.offense === "home" ? "away" : "home", 35) : passerStartX}%`,
    "--ball-from-y": "50%",
    "--ball-release-x": `${passReleaseX}%`,
    "--ball-release-y": "50%",
    "--ball-mid-x": `${replayEntry.outcome === "kickoff" ? fieldX(replayEntry.offense, 0) : thrownPass ? pathMiddleX : scrimmageRun ? handoffX : runnerStartX}%`,
    "--ball-mid-y": `${thrownPass ? (50 + passTargetY) / 2 : scrimmageRun ? handoffY : runnerPoint.y}%`,
    "--ball-catch-x": `${thrownPass ? passTargetX : scrimmageRun ? handoffX : runnerStartX + (replayEndX - runnerStartX) * 0.52}%`,
    "--ball-catch-y": `${thrownPass ? passTargetY : scrimmageRun ? handoffY : runnerPoint.y + (runLane - runnerPoint.y) * 0.52}%`,
    "--ball-to-x": `${ballToX}%`,
    "--ball-to-y": `${isPassReplay ? passTargetY : runLane}%`,
  } as CSSProperties : undefined;
  const specialBallReplayStyle = specialReplay ? {
    "--ball-from-x": `${specialReplay.startX}%`,
    "--ball-from-y": "50%",
    "--ball-release-x": `${specialReleaseX}%`,
    "--ball-release-y": "50%",
    "--ball-mid-x": `${specialReplay.flightX}%`,
    "--ball-mid-y": `${specialReplay.kind === "kickoff" && !specialReplay.onside ? 18 : specialReplay.kind === "punt" ? 15 : specialTargetY}%`,
    "--ball-catch-x": `${specialReplay.flightX}%`,
    "--ball-catch-y": `${specialReplay.kind === "kickoff" || specialReplay.kind === "punt" ? specialLane : specialTargetY}%`,
    "--ball-to-x": `${specialVisualEndX}%`,
    "--ball-to-y": `${specialReplay.kind === "kickoff" || specialReplay.kind === "punt" ? specialLane : specialTargetY}%`,
  } as CSSProperties : undefined;
  const ballReplayStyle = specialBallReplayStyle ?? regularBallReplayStyle;
  const specialBallClass = specialReplay?.kind === "kickoff"
    ? specialReplay.onside ? "replay-onside-kick" : "replay-kickoff-unit"
    : specialReplay?.kind === "punt"
      ? "replay-punt-unit"
      : specialReplay
        ? "replay-place-kick"
        : "";
  const homeLogo = resolveTeamLogoAsset(state.homeTeam.name) ?? state.homeTeam.logo;

  return (
    <div className="field-scroll">
      <div className="field-shell" aria-label={`Ball at ${fieldPosition(state)}`}>
        <div
          className="end-zone home-end"
          style={{ background: state.homeTeam.primaryColor, color: state.homeTeam.secondaryColor }}
        >
          <span style={endZoneNameStyle(state.homeTeam.name)}>{state.homeTeam.name}</span>
          <b className="goal-post left" aria-hidden="true"><i /></b>
          {endZonePylons.map((corner) => (
            <i key={corner} className={`pylon ${corner}`} aria-hidden="true" />
          ))}
        </div>
        <div className="field-grid">
          {homeLogo ? (
            <TeamLink team={state.homeTeam.name} className="midfield-logo"><img src={homeLogo} alt="" /></TeamLink>
          ) : null}
          {YARD_LINES.map((yard) => (
            <div
              key={yard}
              className={`yard-line ${yard % 10 === 0 ? "major" : "minor"}`}
              style={{ left: `${yard}%` }}
            >
              {yard % 10 === 0 ? (
                <>
                  <span className={`yard-number top-number ${yard < 50 ? "toward-left" : yard > 50 ? "toward-right" : "midfield-number"}`}>
                    <b>{yard <= 50 ? yard : 100 - yard}</b>{yard !== 50 ? <i /> : null}
                  </span>
                  <span className={`yard-number bottom-number ${yard < 50 ? "toward-left" : yard > 50 ? "toward-right" : "midfield-number"}`}>
                    <b>{yard <= 50 ? yard : 100 - yard}</b>{yard !== 50 ? <i /> : null}
                  </span>
                </>
              ) : null}
            </div>
          ))}
          {HASH_ROWS.map((row) => (
            <div
              key={row.y}
              className={`hash-row ${row.className}`}
              style={{ top: `${row.y}%` }}
            >
              {HASH_YARDS.map((yard) => <i key={yard} style={{ left: `${yard}%` }} />)}
            </div>
          ))}
          <span className="xp-line left" title="College extra-point spot: 3-yard line" />
          <span className="xp-line right" title="College extra-point spot: 3-yard line" />
          {state.phase === "scrimmage" && driveWidth > 0 ? (
            <span className="drive-progress" style={{ left: `${driveLeft}%`, width: `${driveWidth}%` }}><i>DRIVE</i></span>
          ) : null}
          {drivePlays.map((play, index) => {
            const start = fieldX(play.offense, play.ballOnBefore);
            const end = fieldX(play.possessionAfter, play.ballOnAfter);
            const lane = drivePlays.length === 1 ? 50 : 35 + (index * 30) / (drivePlays.length - 1);
            return (
              <span
                key={play.number}
                className={`drive-play-trace ${play.yards > 0 ? "gain" : play.yards < 0 ? "loss" : "neutral"}`}
                style={{ left: `${Math.min(start, end)}%`, width: `${Math.max(1, Math.abs(end - start))}%`, top: `${lane}%` }}
                title={`Play ${play.number}: ${play.summary}`}
              />
            );
          })}
          {replayEntry && playPath ? (
            <svg className="play-path-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <path key={`path-${replayEntry.number}`} d={playPath} pathLength="100" />
            </svg>
          ) : null}
          {showFormation ? <span className="line-of-scrimmage" style={{ left: `${ballPercent}%` }} title="Line of scrimmage" /> : null}
          {state.phase === "scrimmage" && !replayEntry ? <span className="line-to-gain" style={{ left: `${lineToGain}%` }} title="First down line" /> : null}
          {showFormation && specialUnits ? specialUnits.offense.map((member, index) => (
            <PlayerPuck
              key={member.player.id}
              player={member.player}
              team={offense}
              unit="offense"
              x={member.x}
              y={member.y}
              label={member.label}
              motion={specialReplayMotion(member, index, "offense")}
            />
          )) : showFormation ? offense.roster.offense.slice(0, 11).map((player, index) => {
            const point = OFFENSE_FORMATION[index] ?? OFFENSE_FORMATION[0];
            return (
              <PlayerPuck
                key={player.id}
                player={player}
                team={offense}
                unit="offense"
                x={replayStartX("offense", index, point.dx)}
                y={point.y}
                motion={replayMotion(player, index, "offense")}
              />
            );
          }) : null}
          {showFormation && specialUnits ? specialUnits.defense.map((member, index) => (
            <PlayerPuck
              key={member.player.id}
              player={member.player}
              team={defense}
              unit="defense"
              x={member.x}
              y={member.y}
              label={member.label}
              motion={specialReplayMotion(member, index, "defense")}
            />
          )) : showFormation ? defense.roster.defense.slice(0, 11).map((player, index) => {
            const point = DEFENSE_FORMATION[index] ?? DEFENSE_FORMATION[0];
            return (
              <PlayerPuck
                key={player.id}
                player={player}
                team={defense}
                unit="defense"
                x={replayStartX("defense", index, point.dx)}
                y={point.y}
                motion={replayMotion(player, index, "defense")}
              />
            );
          }) : null}
          <span
            key={replayEntry ? `ball-${replayEntry.number}` : "live-ball"}
            className={`ball-marker ${replayEntry ? `replaying replay-${replayEntry.outcome} ${specialBallClass} ${replayEntry.outcome === "interception" ? "replay-pass-turnover" : thrownPass ? "replay-pass-flight" : scrimmageRun ? "replay-run-carry" : ""}` : ""}`}
            style={replayEntry ? ballReplayStyle : { left: `${ballPercent}%` }}
            title={`Football at ${fieldPosition(state)}`}
          >
            <i />
          </span>
        </div>
        <div
          className="end-zone away-end"
          style={{ background: state.awayTeam.primaryColor, color: state.awayTeam.secondaryColor }}
        >
          <span style={endZoneNameStyle(state.awayTeam.name)}>{state.awayTeam.name}</span>
          <b className="goal-post right" aria-hidden="true"><i /></b>
          {endZonePylons.map((corner) => (
            <i key={corner} className={`pylon ${corner}`} aria-hidden="true" />
          ))}
        </div>
      </div>
    </div>
  );
}

function resultMarker(entry: PlayLogEntry | undefined, state: GameView["state"]) {
  if (!entry) return null;
  const offense = entry.offense === "home" ? state.homeTeam : state.awayTeam;
  const defense = entry.offense === "home" ? state.awayTeam : state.homeTeam;
  const defensiveId = entry.participants?.interceptionById ?? entry.participants?.specialTeamsTacklerId;
  const offensiveId = entry.participants?.receiverId ?? entry.participants?.runnerId ?? entry.participants?.returnerId ??
    entry.participants?.kickerId ?? entry.participants?.punterId ?? entry.participants?.passerId;
  const player = defensiveId && ["interception", "fumble"].includes(entry.outcome)
    ? teamPlayer(defense, defensiveId)
    : teamPlayer(offense, offensiveId);
  const fallback = entry.outcome === "punt" ? "P" : entry.outcome === "kickoff" ? "KR" :
    ["field-goal", "extra-point"].includes(entry.outcome) ? "K" : ["stick", "mesh", "four-verts", "quick-pass", "dropback", "play-action", "screen"].includes(entry.offensePlayId) ? "WR" : "RB";
  return { label: player?.position ?? fallback, team: player && defensiveId === player.id ? defense : offense };
}

function CompactField({
  state,
  replayEntry,
}: {
  state: GameView["state"];
  replayEntry?: PlayLogEntry;
}) {
  const fieldX = (side: TeamSide, ballOn: number) => clamp(side === "home" ? ballOn : 100 - ballOn, 0, 100);
  const last = state.playLog.at(-1);
  const displayEntry = replayEntry ?? last;
  const startX = displayEntry ? fieldX(displayEntry.offense, displayEntry.ballOnBefore) : fieldX(state.possession, state.ballOn);
  const endX = displayEntry?.outcome === "touchdown"
    ? displayEntry.offense === "home" ? 100 : 0
    : displayEntry?.outcome === "safety"
      ? displayEntry.offense === "home" ? 0 : 100
      : displayEntry
        ? fieldX(displayEntry.possessionAfter, displayEntry.ballOnAfter)
        : startX;
  const scrimmageX = fieldX(state.possession, state.ballOn);
  const firstDownX = clamp(state.possession === "home" ? state.ballOn + state.toGo : 100 - state.ballOn - state.toGo, 0, 100);
  const drivePlays = currentDrivePlays(state);
  const marker = resultMarker(displayEntry, state);
  const endZonePylons = ["top-left", "top-right", "bottom-left", "bottom-right"];
  const homeLogo = resolveTeamLogoAsset(state.homeTeam.name) ?? state.homeTeam.logo;
  return (
    <div className="field-scroll reference-field-scroll">
      <div className="field-shell compact-reference-field" aria-label={`Ball at ${fieldPosition(state)}`}>
        <div className="end-zone home-end" style={{ background: state.homeTeam.primaryColor, color: state.homeTeam.secondaryColor }}>
          <span style={endZoneNameStyle(state.homeTeam.name)}>{state.homeTeam.name}</span>
          <b className="goal-post left" aria-hidden="true"><i /></b>
          {endZonePylons.map((corner) => <i key={corner} className={`pylon ${corner}`} aria-hidden="true" />)}
        </div>
        <div className="field-grid">
          {homeLogo ? <TeamLink team={state.homeTeam.name} className="midfield-logo"><img src={homeLogo} alt="" /></TeamLink> : null}
          {YARD_LINES.map((yard) => <div key={yard} className={`yard-line ${yard % 10 === 0 ? "major" : "minor"}`} style={{ left: `${yard}%` }}>
            {yard % 10 === 0 ? <><span className={`yard-number top-number ${yard < 50 ? "toward-left" : yard > 50 ? "toward-right" : "midfield-number"}`}><b>{yard <= 50 ? yard : 100-yard}</b>{yard!==50?<i/>:null}</span><span className={`yard-number bottom-number ${yard < 50 ? "toward-left" : yard > 50 ? "toward-right" : "midfield-number"}`}><b>{yard <= 50 ? yard : 100-yard}</b>{yard!==50?<i/>:null}</span></> : null}
          </div>)}
          {HASH_ROWS.map((row) => <div key={row.y} className={`hash-row ${row.className}`} style={{ top: `${row.y}%` }}>{HASH_YARDS.map((yard) => <i key={yard} style={{ left: `${yard}%` }} />)}</div>)}
          <span className="xp-line left"/><span className="xp-line right"/>
          {drivePlays.map((play,index) => {
            const playStart=fieldX(play.offense,play.ballOnBefore);
            const playEnd=play.outcome==="touchdown"?(play.offense==="home"?100:0):fieldX(play.possessionAfter,play.ballOnAfter);
            const lane=drivePlays.length===1?50:28+(index%6)*9;
            return <span key={play.number} className={`drive-play-trace ${play.yards>0?"gain":play.yards<0?"loss":"neutral"}`} style={{left:`${Math.min(playStart,playEnd)}%`,width:`${Math.max(1,Math.abs(playEnd-playStart))}%`,top:`${lane}%`}} title={`Play ${play.number}: ${play.summary}`}/>;
          })}
          {displayEntry ? <span className={`last-play-field-trace ${displayEntry.yards>0?"gain":displayEntry.yards<0?"loss":"neutral"}`} style={{left:`${Math.min(startX,endX)}%`,width:`${Math.max(1,Math.abs(endX-startX))}%`}}/> : null}
          {state.phase==="scrimmage" ? <><span className="line-of-scrimmage" style={{left:`${scrimmageX}%`}}/><span className="line-to-gain" style={{left:`${firstDownX}%`}}/></> : null}
          {marker ? <span key={`result-${displayEntry?.number??0}`} className={`field-result-marker ${replayEntry?"replaying":""}`} style={{left:`${endX}%`,top:"50%",background:marker.team.primaryColor,color:marker.team.secondaryColor,"--marker-from-x":`${startX}%`,"--marker-to-x":`${endX}%`} as CSSProperties} title={displayEntry?.summary}>{marker.label}</span> : null}
        </div>
        <div className="end-zone away-end" style={{ background: state.homeTeam.primaryColor, color: state.homeTeam.secondaryColor }}>
          <span style={endZoneNameStyle(state.homeTeam.name)}>{state.homeTeam.name}</span>
          <b className="goal-post right" aria-hidden="true"><i /></b>
          {endZonePylons.map((corner) => <i key={corner} className={`pylon ${corner}`} aria-hidden="true" />)}
        </div>
      </div>
    </div>
  );
}

function emptyIndividual(playerId: string): IndividualPlayerStats {
  return {
    playerId,
    passAttempts: 0,
    completions: 0,
    passYards: 0,
    passTouchdowns: 0,
    interceptionsThrown: 0,
    rushAttempts: 0,
    rushYards: 0,
    rushTouchdowns: 0,
    targets: 0,
    receptions: 0,
    receivingYards: 0,
    receivingTouchdowns: 0,
    tackles: 0,
    soloTackles: 0,
    assistedTackles: 0,
    tacklesForLoss: 0,
    sacks: 0,
    interceptions: 0,
    passBreakups: 0,
    forcedFumbles: 0,
  };
}

function statLine(state: GameView["state"], team: TeamConfig, player: Player) {
  return state.playerStats?.[team.side]?.[player.id] ?? emptyIndividual(player.id);
}

function PlayerStatSection({
  title,
  headers,
  rows,
}: {
  title: string;
  headers: string[];
  rows: Array<{ id: string; name: string; values: Array<string | number> }>;
}) {
  const dense = headers.length >= 5;
  const nameWidth = dense ? 90 : 100;
  const valueWidth = dense ? 30 : headers.length === 4 ? 35 : 42;
  const columns = `minmax(${nameWidth}px, 1fr) repeat(${headers.length}, minmax(${valueWidth}px, auto))`;
  return (
    <section className="player-stat-section">
      <h4>{title}</h4>
      <div className="player-stat-row heading" style={{ gridTemplateColumns: columns }}>
        <span>PLAYER</span>
        {headers.map((header) => <span key={header}>{header}</span>)}
      </div>
      {rows.map((row) => (
        <div className="player-stat-row" key={row.id} style={{ gridTemplateColumns: columns }}>
          <strong>{row.name}</strong>
          {row.values.map((value, index) => <span key={`${row.id}-${headers[index]}`}>{value}</span>)}
        </div>
      ))}
    </section>
  );
}

function TeamBoxHeader({ team }: { team: TeamConfig }) {
  return (
    <header className="team-box-header" style={{ color: team.primaryColor }}>
      <TeamLogo team={team} />
      <strong>{team.name}</strong>
      <span>{team.abbreviation}</span>
    </header>
  );
}

function OffenseBox({ team, state }: { team: TeamConfig; state: GameView["state"] }) {
  const quarterback = team.roster.offense.find((player) => player.position === "QB") ?? team.roster.offense[0];
  const runners = team.roster.offense.filter((player) => player.position === "RB" || player.position === "QB");
  const receivers = team.roster.offense.filter((player) => ["WR", "TE", "RB"].includes(player.position));
  const qb = statLine(state, team, quarterback);
  return (
    <article className="team-box">
      <TeamBoxHeader team={team} />
      <PlayerStatSection
        title="PASSING"
        headers={["C/A", "YDS", "TD", "INT"]}
        rows={[{
          id: quarterback.id,
          name: quarterback.name,
          values: [`${qb.completions}/${qb.passAttempts}`, qb.passYards, qb.passTouchdowns, qb.interceptionsThrown],
        }]}
      />
      <PlayerStatSection
        title="RUSHING"
        headers={["CAR", "YDS", "TD"]}
        rows={runners.map((player) => {
          const line = statLine(state, team, player);
          return { id: player.id, name: player.name, values: [line.rushAttempts, line.rushYards, line.rushTouchdowns] };
        })}
      />
      <PlayerStatSection
        title="RECEIVING"
        headers={["REC/TGT", "YDS", "TD"]}
        rows={receivers.map((player) => {
          const line = statLine(state, team, player);
          return { id: player.id, name: player.name, values: [`${line.receptions}/${line.targets}`, line.receivingYards, line.receivingTouchdowns] };
        })}
      />
    </article>
  );
}

function DefenseBox({ team, state }: { team: TeamConfig; state: GameView["state"] }) {
  return (
    <article className="team-box">
      <TeamBoxHeader team={team} />
      <PlayerStatSection
        title="DEFENSIVE PRODUCTION"
        headers={["TKL", "TFL", "SK", "INT", "FF", "PBU"]}
        rows={team.roster.defense.map((player) => {
          const line = statLine(state, team, player);
          return {
            id: player.id,
            name: `${player.position} ${player.name}`,
            values: [line.tackles, line.tacklesForLoss, line.sacks, line.interceptions, line.forcedFumbles, line.passBreakups],
          };
        })}
      />
    </article>
  );
}

function SpecialTeamsBox({ team, state }: { team: TeamConfig; state: GameView["state"] }) {
  const stats = state.stats[team.side];
  return (
    <article className="team-box special-team-box">
      <TeamBoxHeader team={team} />
      <dl>
        <div><dt>Field goals</dt><dd>{stats.fieldGoalsMade}/{stats.fieldGoalsAttempted}</dd></div>
        <div><dt>Punts</dt><dd>{stats.punts}</dd></div>
        <div><dt>Points</dt><dd>{state.score[team.side]}</dd></div>
        <div><dt>Turnovers</dt><dd>{stats.interceptionsThrown + stats.fumblesLost}</dd></div>
      </dl>
    </article>
  );
}

function logFieldPosition(state: GameView["state"], side: TeamSide, ballOn: number) {
  const offense = side === "home" ? state.homeTeam : state.awayTeam;
  const defense = side === "home" ? state.awayTeam : state.homeTeam;
  if (ballOn <= 0) return `${offense.abbreviation} GL`;
  if (ballOn === 50) return "50";
  return ballOn < 50 ? `${offense.abbreviation} ${ballOn}` : `${defense.abbreviation} ${100 - ballOn}`;
}

function driveResult(entries: PlayLogEntry[], isCurrent: boolean) {
  if (entries.some((entry) => entry.outcome === "touchdown")) return "TOUCHDOWN";
  if (entries.some((entry) => entry.outcome === "safety")) return "SAFETY";
  const fieldGoal = entries.find((entry) => entry.outcome === "field-goal");
  if (fieldGoal) return /good/i.test(fieldGoal.summary) ? "FIELD GOAL" : "MISSED FG";
  const last = entries.at(-1);
  if (!last) return "NO PLAYS";
  if (last.outcome === "punt") return "PUNT";
  if (last.outcome === "interception") return "INTERCEPTION";
  if (last.outcome === "fumble") return "FUMBLE";
  if (last.outcome === "turnover-on-downs") return "DOWNS";
  return isCurrent ? "IN PROGRESS" : "END OF PERIOD";
}

function PlayLog({ state }: { state: GameView["state"] }) {
  const grouped = new Map<number, { offense: TeamSide; entries: PlayLogEntry[] }>();
  for (const entry of state.playLog) {
    const driveNumber = entry.driveNumber ?? 1;
    const group = grouped.get(driveNumber) ?? { offense: entry.offense, entries: [] };
    group.entries.push(entry);
    grouped.set(driveNumber, group);
  }
  const drives = [...grouped.entries()].reverse();

  if (drives.length === 0) {
    return <p className="empty-state">Opening kickoff. Both coordinators are on the call sheet.</p>;
  }

  return (
    <div className="drive-log">
      {drives.map(([driveNumber, drive]) => {
        const team = drive.offense === "home" ? state.homeTeam : state.awayTeam;
        const footballPlays = drive.entries.filter((entry) => !["kickoff", "extra-point", "two-point"].includes(entry.outcome));
        const yards = footballPlays.reduce((sum, entry) => sum + entry.yards, 0);
        const possessionSeconds = footballPlays.reduce((sum, entry) => sum + (entry.elapsedSeconds ?? 0), 0);
        const isCurrent = driveNumber === state.driveNumber && state.status === "active";
        return (
          <details className="drive-dropdown" key={driveNumber}>
            <summary>
              <div className="drive-team">
                <TeamLogo team={team} />
                <span>
                  <strong>{team.abbreviation} DRIVE {driveNumber}</strong>
                  <small>{footballPlays.length} PLAYS · {yards} YARDS · {formatClock(possessionSeconds)} TOP</small>
                </span>
              </div>
              <b>{driveResult(drive.entries, isCurrent)}</b>
            </summary>
            <div className="play-log">
              {drive.entries.map((entry) => (
                <article className="log-entry" key={entry.number}>
                  <div>
                    <span>#{entry.number.toString().padStart(2, "0")}</span>
                    <span>{entry.period <= 4 ? `Q${entry.period}` : "OT"} {formatClock(entry.clockBefore)}</span>
                    <span>{entry.offensePlayName} / {entry.defensePlayName}</span>
                    {entry.offenseExecutionScore != null && entry.defenseExecutionScore != null ? (
                      <span>OFF {Math.round(entry.offenseExecutionScore)} · DEF {Math.round(entry.defenseExecutionScore)}</span>
                    ) : null}
                    <span className="log-field-position">
                      {logFieldPosition(state, entry.offense, entry.ballOnBefore)} → {logFieldPosition(state, entry.possessionAfter, entry.ballOnAfter)}
                    </span>
                  </div>
                  <p>{entry.summary}</p>
                </article>
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}

function quarterScoring(state: GameView["state"]) {
  const highestPeriod = Math.max(4, ...state.playLog.map((entry) => entry.period));
  const lines = Array.from({ length: highestPeriod }, (_, index) => ({
    label: index < 4 ? `Q${index + 1}` : `OT${index - 3}`,
    home: 0,
    away: 0,
  }));
  let previous = { home: 0, away: 0 };
  for (const entry of state.playLog) {
    const line = lines[Math.max(0, entry.period - 1)];
    line.home += Math.max(0, entry.scoreAfter.home - previous.home);
    line.away += Math.max(0, entry.scoreAfter.away - previous.away);
    previous = entry.scoreAfter;
  }
  return lines;
}

function average(yards: number, attempts: number) {
  return attempts > 0 ? (yards / attempts).toFixed(1) : "0.0";
}

function callFrequencies(entries: PlayLogEntry[], side: "offense" | "defense") {
  const counts = new Map<string, { id: string; name: string; count: number }>();
  for (const entry of entries) {
    const id = side === "offense" ? entry.offensePlayId : entry.defensePlayId;
    const name = side === "offense" ? entry.offensePlayName : entry.defensePlayName;
    const current = counts.get(id) ?? { id, name, count: 0 };
    current.count += 1;
    counts.set(id, current);
  }
  return [...counts.values()]
    .map((call) => ({ ...call, percentage: entries.length > 0 ? Math.round((call.count / entries.length) * 100) : 0 }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
}

function BoxScore({ state, seat }: { state: GameView["state"]; seat: TeamSide }) {
  const quarters = quarterScoring(state);
  const opponentOffense = state.playLog.filter((entry) => entry.offense !== seat);
  const opponentDefense = state.playLog.filter((entry) => entry.offense === seat);
  const opponentOffenseCalls = callFrequencies(opponentOffense, "offense");
  const opponentDefenseCalls = callFrequencies(opponentDefense, "defense");
  const comparisonRows = [
    ["FIRST DOWNS", state.stats.home.firstDowns, state.stats.away.firstDowns],
    ["YARDS / CARRY", average(state.stats.home.rushYards, state.stats.home.rushAttempts), average(state.stats.away.rushYards, state.stats.away.rushAttempts)],
    ["YARDS / ATTEMPT", average(state.stats.home.passYards, state.stats.home.passAttempts), average(state.stats.away.passYards, state.stats.away.passAttempts)],
    ["RUSH ATTEMPTS", state.stats.home.rushAttempts, state.stats.away.rushAttempts],
    ["PASS ATTEMPTS", state.stats.home.passAttempts, state.stats.away.passAttempts],
    ["RUSH YARDS", state.stats.home.rushYards, state.stats.away.rushYards],
    ["PASS YARDS", state.stats.home.passYards, state.stats.away.passYards],
    ["TOTAL YARDS", state.stats.home.rushYards + state.stats.home.passYards, state.stats.away.rushYards + state.stats.away.passYards],
    ["TURNOVERS", state.stats.home.interceptionsThrown + state.stats.home.fumblesLost, state.stats.away.interceptionsThrown + state.stats.away.fumblesLost],
    ["TIME OF POSSESSION", formatClock(state.stats.home.timeOfPossessionSeconds ?? 0), formatClock(state.stats.away.timeOfPossessionSeconds ?? 0)],
  ] as const;
  const scoreColumns = `minmax(76px, 1.5fr) repeat(${quarters.length}, minmax(32px, 1fr)) 42px`;

  return (
    <div className="team-summary-box">
      <section className="quarter-score" aria-label="Scoring by quarter">
        <div className="quarter-score-row heading" style={{ gridTemplateColumns: scoreColumns }}>
          <span>TEAM</span>
          {quarters.map((quarter) => <span key={quarter.label}>{quarter.label}</span>)}
          <span>T</span>
        </div>
        {(["home", "away"] as const).map((side) => {
          const team = side === "home" ? state.homeTeam : state.awayTeam;
          return (
            <div className="quarter-score-row" style={{ gridTemplateColumns: scoreColumns }} key={side}>
              <strong><TeamLogo team={team} /> {team.abbreviation}</strong>
              {quarters.map((quarter) => <span key={quarter.label}>{quarter[side]}</span>)}
              <b>{state.score[side]}</b>
            </div>
          );
        })}
      </section>
      <section className="team-stat-comparison" aria-label="Team statistics">
        <header>
          <strong>{state.homeTeam.abbreviation}</strong>
          <span>TEAM STATS</span>
          <strong>{state.awayTeam.abbreviation}</strong>
        </header>
        {comparisonRows.map(([label, home, away]) => (
          <div key={label}>
            <strong>{home}</strong>
            <span>{label}</span>
            <strong>{away}</strong>
          </div>
        ))}
      </section>
      <section className="opponent-call-frequency" aria-label="Opponent play-call frequency">
        <header>
          <span>OPPONENT CALL FREQUENCY</span>
          <small>CALLS · SHARE</small>
        </header>
        <div className="opponent-call-columns">
          {([
            ["OFFENSE", opponentOffenseCalls],
            ["DEFENSE", opponentDefenseCalls],
          ] as const).map(([label, calls]) => (
            <div className="opponent-call-group" key={label}>
              <strong>{label}</strong>
              {calls.length > 0 ? calls.map((call) => (
                <div key={call.id}>
                  <span>{call.name}</span>
                  <small>{call.count} · {call.percentage}%</small>
                </div>
              )) : <p>NO CALLS YET</p>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function GameTabs({ state, seat }: { state: GameView["state"]; seat: TeamSide }) {
  return (
    <section className="box-score-console">
      <Tabs defaultValue="box-score" className="game-tabs">
        <TabsList variant="line" className="game-tabs-list">
          <TabsTrigger value="box-score">BOX SCORE</TabsTrigger>
          <TabsTrigger value="offense">OFFENSE</TabsTrigger>
          <TabsTrigger value="defense">DEFENSE</TabsTrigger>
          <TabsTrigger value="special">SPECIAL TEAMS</TabsTrigger>
        </TabsList>
        <TabsContent value="box-score">
          <BoxScore state={state} seat={seat} />
        </TabsContent>
        <TabsContent value="offense">
          <div className="player-box-grid">
            <OffenseBox team={state.homeTeam} state={state} />
            <OffenseBox team={state.awayTeam} state={state} />
          </div>
        </TabsContent>
        <TabsContent value="defense">
          <div className="player-box-grid">
            <DefenseBox team={state.homeTeam} state={state} />
            <DefenseBox team={state.awayTeam} state={state} />
          </div>
        </TabsContent>
        <TabsContent value="special">
          <div className="player-box-grid">
            <SpecialTeamsBox team={state.homeTeam} state={state} />
            <SpecialTeamsBox team={state.awayTeam} state={state} />
          </div>
        </TabsContent>
      </Tabs>
      <details className="play-log-details">
        <summary>DRIVE LOG <span>{state.playLog.length} SNAPS</span></summary>
        <PlayLog state={state} />
      </details>
    </section>
  );
}

function SnapReveal({ state, entry }: { state: GameView["state"]; entry: PlayLogEntry }) {
  const offense = entry.offense === "home" ? state.homeTeam : state.awayTeam;
  const defense = entry.offense === "home" ? state.awayTeam : state.homeTeam;
  const offenseScore = entry.offenseExecutionScore ?? entry.executionScore;
  const defenseScore = entry.defenseExecutionScore;
  const executionLine = (score: number | undefined) => {
    if (score == null) return "SPECIAL TEAMS";
    return `${Math.round(score)} — ${executionGrade(score).label}`;
  };
  const result = entry.outcome === "touchdown" ? `${entry.yards}-YARD TOUCHDOWN`
    : entry.outcome === "incompletion" ? "INCOMPLETE"
      : entry.outcome === "interception" ? "INTERCEPTION"
        : entry.outcome === "sack" ? `SACK · LOSS OF ${Math.abs(entry.yards)}`
          : entry.outcome === "fumble" ? "FUMBLE"
            : entry.yards > 0 ? `GAIN OF ${entry.yards}`
              : entry.yards < 0 ? `LOSS OF ${Math.abs(entry.yards)}`
                : "NO GAIN";
  return (
    <section className="snap-reveal" aria-live="assertive" aria-label="Play reveal">
      <span className="snap-reveal-kicker">SNAP REVEAL</span>
      <div className="snap-reveal-matchup">
        <div>
          <TeamLogo team={offense} />
          <span>{offense.abbreviation}</span>
          <strong>{entry.offensePlayName}</strong>
          <b>{executionLine(offenseScore)}</b>
        </div>
        <em>VS</em>
        <div>
          <TeamLogo team={defense} />
          <span>{defense.abbreviation}</span>
          <strong>{entry.defensePlayName}</strong>
          <b>{executionLine(defenseScore)}</b>
        </div>
      </div>
      <p>{result}</p>
    </section>
  );
}

function GameRoom({
  session,
  initialInvite,
  onExit,
  onFinal,
}: {
  session: Session;
  initialInvite: string;
  onExit: () => void;
  onFinal?: (state: GameState) => void;
}) {
  const [view, setView] = useState<GameView | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [inviteLink, setInviteLink] = useState(initialInvite);
  const [replayNumber, setReplayNumber] = useState<number | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [gameTheme, setGameTheme] = useState<GameTheme | null>(null);
  const [timingPlayId, setTimingPlayId] = useState<TimingPlayId | null>(null);
  const [timingFeedback, setTimingFeedback] = useState<TimingFeedback | null>(null);
  const [submittedTiming, setSubmittedTiming] = useState<TimingFeedback | null>(null);
  const viewRef = useRef<GameView | null>(null);
  const timingTrackRef = useRef<HTMLButtonElement | null>(null);
  const timingMarkerRef = useRef<HTMLSpanElement | null>(null);
  const timingLockedRef = useRef(false);
  const timingPrecisionRef = useRef(1);
  const replayTimerRef = useRef<number | undefined>(undefined);
  const gameAudioRef = useRef<{
    context: AudioContext | null;
    crowdGain: GainNode | null;
    crowdSources: AudioBufferSourceNode[];
    crowdLoad: Promise<void> | null;
    roar: HTMLAudioElement;
    primed: boolean;
  } | null>(null);
  const crowdRecoveryTimerRef = useRef<number | undefined>(undefined);
  const crowdReactionTimerRef = useRef<number | undefined>(undefined);
  const soundEnabledRef = useRef(true);
  const reportedFinalRef = useRef(false);

  const ensureGameAudio = useCallback(() => {
    if (gameAudioRef.current) return gameAudioRef.current;
    const roar = new Audio("/audio/stadium-roar.mp3");
    roar.preload = "auto";
    roar.volume = 0.68;
    roar.setAttribute("playsinline", "true");
    gameAudioRef.current = {
      context: null,
      crowdGain: null,
      crowdSources: [],
      crowdLoad: null,
      roar,
      primed: false,
    };
    return gameAudioRef.current;
  }, []);

  const rampCrowdVolume = useCallback((target: number, durationMs: number) => {
    const audio = ensureGameAudio();
    if (!audio.context || !audio.crowdGain) return;
    const gain = audio.crowdGain.gain;
    const now = audio.context.currentTime;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(target, now + Math.max(0.01, durationMs / 1000));
  }, [ensureGameAudio]);

  const reactCrowd = useCallback((target: number, recoveryDelayMs: number) => {
    if (crowdRecoveryTimerRef.current !== undefined) window.clearTimeout(crowdRecoveryTimerRef.current);
    rampCrowdVolume(target, 180);
    crowdRecoveryTimerRef.current = window.setTimeout(() => {
      rampCrowdVolume(CROWD_BASELINE_VOLUME, 950);
      crowdRecoveryTimerRef.current = undefined;
    }, recoveryDelayMs);
  }, [rampCrowdVolume]);

  const activateGameAudio = useCallback(() => {
    if (!soundEnabledRef.current) return null;
    const audio = ensureGameAudio();
    const AudioContextConstructor = window.AudioContext ?? (
      window as typeof window & { webkitAudioContext?: typeof AudioContext }
    ).webkitAudioContext;
    if (!audio.context && AudioContextConstructor) {
      const context = new AudioContextConstructor();
      const crowdGain = context.createGain();
      const crowdLimiter = context.createDynamicsCompressor();
      crowdGain.gain.value = CROWD_BASELINE_VOLUME;
      crowdLimiter.threshold.value = -8;
      crowdLimiter.knee.value = 4;
      crowdLimiter.ratio.value = 8;
      crowdLimiter.attack.value = 0.004;
      crowdLimiter.release.value = 0.16;
      crowdGain.connect(crowdLimiter).connect(context.destination);
      audio.context = context;
      audio.crowdGain = crowdGain;
      audio.crowdLoad = fetch("/audio/stadium-crowd.wav")
        .then((response) => {
          if (!response.ok) throw new Error("Crowd audio unavailable");
          return response.arrayBuffer();
        })
        .then((arrayBuffer) => context.decodeAudioData(arrayBuffer))
        .then((buffer) => {
          if (context.state === "closed") return;
          const layerSettings = [
            { rate: 0.987, offset: 0, volume: 0.58 },
            { rate: 1.013, offset: buffer.duration / 2, volume: 0.5 },
          ];
          for (const layer of layerSettings) {
            const source = context.createBufferSource();
            const layerGain = context.createGain();
            source.buffer = buffer;
            source.loop = true;
            source.loopStart = 0;
            source.loopEnd = buffer.duration;
            source.playbackRate.value = layer.rate;
            layerGain.gain.value = layer.volume;
            source.connect(layerGain).connect(crowdGain);
            source.start(0, Math.min(layer.offset, source.loopEnd - 0.01));
            audio.crowdSources.push(source);
          }
        })
        .catch(() => undefined);
    }
    if (audio.context?.state === "suspended") void audio.context.resume();
    if (!audio.primed) {
      audio.primed = true;
      audio.roar.muted = true;
      void audio.roar.play().then(() => {
        audio.roar.pause();
        audio.roar.currentTime = 0;
        audio.roar.muted = false;
      }).catch(() => {
        audio.roar.muted = false;
      });
    }
    return audio;
  }, [ensureGameAudio]);

  const playResolutionFeedback = useCallback((previous: GameView, payload: GameView, entry: PlayLogEntry) => {
    const scoreChange =
      payload.state.score.home !== previous.state.score.home ||
      payload.state.score.away !== previous.state.score.away;
    const turnover = entry.possessionAfter !== entry.offense && !["punt", "kickoff", "field-goal", "extra-point"].includes(entry.outcome);
    const homeOffenseGain = entry.offense === "home" && entry.yards >= 5 && !["punt", "field-goal"].includes(entry.outcome);
    const homeDefenseWin = entry.offense === "away" && (
      entry.yards <= 0 ||
      ["sack", "incompletion", "interception", "fumble"].includes(entry.outcome) ||
      /blocked/i.test(entry.summary)
    );
    const homePositive = payload.state.score.home > previous.state.score.home || homeOffenseGain || homeDefenseWin || (
      turnover && entry.possessionAfter === "home"
    );
    const awayPositive = payload.state.score.away > previous.state.score.away || (
      !homePositive && (
        (entry.offense === "away" && entry.yards >= 5) ||
        (turnover && entry.possessionAfter === "away")
      )
    );
    const bigPlay = scoreChange || Math.abs(entry.yards) >= 15 || turnover || /touchdown|blocked|onside/i.test(entry.summary);

    const vibration = bigPlay ? [45, 28, 70] : [35];
    (navigator as Navigator & { vibrate?: (pattern: number | number[]) => boolean }).vibrate?.(vibration);
    if (!soundEnabledRef.current) return;
    const audio = activateGameAudio();
    if (!audio) return;

    const crowdLevel = homePositive
      ? bigPlay ? CROWD_HOME_BIG_PLAY_VOLUME : CROWD_HOME_PLAY_VOLUME
      : awayPositive
        ? bigPlay ? CROWD_AWAY_BIG_PLAY_VOLUME : CROWD_AWAY_PLAY_VOLUME
        : CROWD_BASELINE_VOLUME;
    if (crowdReactionTimerRef.current !== undefined) window.clearTimeout(crowdReactionTimerRef.current);
    crowdReactionTimerRef.current = window.setTimeout(() => {
      reactCrowd(crowdLevel, bigPlay ? 3600 : 1800);
      if (homePositive && bigPlay) {
        audio.roar.pause();
        audio.roar.currentTime = 0;
        void audio.roar.play().catch(() => undefined);
      }
      crowdReactionTimerRef.current = undefined;
    }, CROWD_REACTION_DELAY_MS);
  }, [activateGameAudio, reactCrowd]);

  const applyView = useCallback((payload: GameView) => {
    const previous = viewRef.current;
    if (previous && payload.state.version < previous.state.version) return false;
    const snapChanged =
      !previous ||
      previous.state.playNumber !== payload.state.playNumber ||
      previous.you.role !== payload.you.role;
    viewRef.current = payload;
    setView(payload);
    if (snapChanged) {
      timingLockedRef.current = false;
      setTimingPlayId(null);
      setTimingFeedback(null);
      setSubmittedTiming(null);
      if (previous && payload.state.playNumber > previous.state.playNumber) {
        const resolvedEntry = payload.state.playLog.find((entry) => entry.number === payload.state.playNumber) ?? payload.state.playLog.at(-1);
        if (resolvedEntry) playResolutionFeedback(previous, payload, resolvedEntry);
        setReplayNumber(payload.state.playNumber);
        if (replayTimerRef.current !== undefined) window.clearTimeout(replayTimerRef.current);
        replayTimerRef.current = window.setTimeout(() => setReplayNumber(null), 1700);
      }
    }
    return true;
  }, [playResolutionFeedback]);

  const fetchGame = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch(
        `/api/games/${encodeURIComponent(session.code)}?seat=${session.seat}&token=${encodeURIComponent(session.token)}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as GameView & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "The game could not be loaded.");
      applyView(payload);
      setNotice((previous) => (previous?.tone === "error" ? null : previous));
    } catch (caught) {
      setNotice({
        tone: "error",
        text: caught instanceof Error ? caught.message : "The game could not be loaded.",
      });
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [applyView, session]);

  useEffect(() => {
    const savedSound = window.localStorage.getItem("down-by-down-sound");
    soundEnabledRef.current = savedSound !== "off";
    const soundTimer = window.setTimeout(() => setSoundEnabled(soundEnabledRef.current), 0);
    const storedInvite = window.localStorage.getItem(`gridiron-wire-invite-${session.code}`) ?? "";
    const inviteTimer = !inviteLink && storedInvite
      ? window.setTimeout(() => setInviteLink(storedInvite), 0)
      : undefined;
    const fetchTimer = window.setTimeout(() => void fetchGame(), 0);
    const interval = window.setInterval(() => void fetchGame(true), 1200);
    return () => {
      window.clearTimeout(soundTimer);
      if (inviteTimer !== undefined) window.clearTimeout(inviteTimer);
      window.clearTimeout(fetchTimer);
      window.clearInterval(interval);
    };
  }, [fetchGame, inviteLink, session.code]);

  const roomTheme=view?.state.theme;
  useEffect(() => {
    if (!roomTheme) return;
    const storedTheme=window.localStorage.getItem(`down-by-down-theme-${session.code}-${session.seat}`);
    const nextTheme:GameTheme=storedTheme==="light"||storedTheme==="dark"?storedTheme:roomTheme;
    const themeTimer=window.setTimeout(()=>setGameTheme(nextTheme),0);
    return()=>window.clearTimeout(themeTimer);
  }, [roomTheme,session.code,session.seat]);

  useEffect(() => {
    const refreshVisibleGame = () => {
      if (document.visibilityState === "visible") void fetchGame(true);
    };
    window.addEventListener("focus", refreshVisibleGame);
    document.addEventListener("visibilitychange", refreshVisibleGame);
    return () => {
      window.removeEventListener("focus", refreshVisibleGame);
      document.removeEventListener("visibilitychange", refreshVisibleGame);
    };
  }, [fetchGame]);

  useEffect(() => () => {
    if (replayTimerRef.current !== undefined) window.clearTimeout(replayTimerRef.current);
    if (crowdRecoveryTimerRef.current !== undefined) window.clearTimeout(crowdRecoveryTimerRef.current);
    if (crowdReactionTimerRef.current !== undefined) window.clearTimeout(crowdReactionTimerRef.current);
    if (gameAudioRef.current) {
      for (const source of gameAudioRef.current.crowdSources) {
        try {
          source.stop();
        } catch {
          // The source may still be decoding when the room closes.
        }
      }
      if (gameAudioRef.current.context) void gameAudioRef.current.context.close();
      gameAudioRef.current.roar.pause();
      gameAudioRef.current.roar.removeAttribute("src");
      gameAudioRef.current.roar.load();
      gameAudioRef.current = null;
    }
  }, []);

  const plays = useMemo(() => {
    if (!view) return [];
    return view.you.role === "offense"
      ? getAvailableOffensePlays(view.state as unknown as GameState)
      : getAvailableDefensePlays(view.state as unknown as GameState);
  }, [view]);

  async function submitCall(playId: string, executionScore?: number) {
    if (!view || submitting) return false;
    activateGameAudio();
    setSubmitting(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/games/${session.code}/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seat: session.seat,
          token: session.token,
          playId,
          executionScore,
          expectedVersion: view.state.version,
          expectedPlayNumber: view.state.playNumber,
        }),
      });
      const payload = (await response.json()) as GameView & { error?: string };
      if (!response.ok) {
        if (response.status === 409) await fetchGame(true);
        throw new Error(payload.error ?? "The play could not be submitted.");
      }
      applyView(payload);
      setNotice(null);
      return true;
    } catch (caught) {
      setNotice({
        tone: "error",
        text: caught instanceof Error ? caught.message : "The play could not be submitted.",
      });
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  function selectPlay(playId: string) {
    if (!view || submitting) return;
    if (playUsesExecutionMeter(playId as TimingPlayId)) {
      activateGameAudio();
      const offense = view.state.possession === "home" ? view.state.homeTeam : view.state.awayTeam;
      const defense = view.state.possession === "home" ? view.state.awayTeam : view.state.homeTeam;
      timingPrecisionRef.current = meterSettings(
        view.state.difficulty,
        view.you.role,
        offense,
        defense,
        playId as TimingPlayId,
        playId === "field-goal" ? 117 - view.state.ballOn : playId === "extra-point" ? 20 : undefined,
      ).precision;
      timingLockedRef.current = false;
      setTimingFeedback(null);
      setSubmittedTiming(null);
      setTimingPlayId(playId as TimingPlayId);
      window.requestAnimationFrame(() => timingTrackRef.current?.focus());
      return;
    }
    setSubmittedTiming(null);
    void submitCall(playId);
  }

  async function stopTimingMeter(timedOut = false) {
    if (!view || !timingPlayId || timingLockedRef.current || submitting) return;
    const markerElement = timingMarkerRef.current;
    const animation = timedOut ? undefined : markerElement?.getAnimations()[0];
    animation?.pause();
    const track = timedOut ? null : timingTrackRef.current?.getBoundingClientRect();
    const marker = timedOut ? null : markerElement?.getBoundingClientRect();
    if (!timedOut && (!track || !marker || track.width <= 0)) return;
    timingLockedRef.current = true;
    const markerCenter = marker ? marker.left + marker.width / 2 : 0;
    const animationProgress = animation?.effect?.getComputedTiming().progress;
    const visualPosition = track && marker
      ? typeof animationProgress === "number"
        ? (marker.width / 2 + 2 + animationProgress * (track.width - marker.width - 4)) / track.width
        : (markerCenter - track.left) / track.width
      : 0;
    const score = timedOut || !track
      ? 0
      : timingScoreForPosition(
          visualPosition,
          timingPrecisionRef.current,
          view.state.difficulty,
        );
    const grade = executionGrade(score);
    const feedback: TimingFeedback = {
      score,
      label: grade.label,
      tier: grade.tier,
      multiplier: executionMultiplier(score),
    };
    setTimingFeedback(feedback);
    setSubmittedTiming(feedback);
    const accepted = await submitCall(timingPlayId, score);
    if (!accepted) {
      timingLockedRef.current = false;
      setTimingPlayId(null);
      setTimingFeedback(null);
      setSubmittedTiming(null);
    }
  }

  function toggleSound() {
    const next = !soundEnabledRef.current;
    soundEnabledRef.current = next;
    setSoundEnabled(next);
    window.localStorage.setItem("down-by-down-sound", next ? "on" : "off");
    if (next) {
      const audio = activateGameAudio();
      if (audio) rampCrowdVolume(CROWD_BASELINE_VOLUME, 400);
    } else {
      if (crowdRecoveryTimerRef.current !== undefined) window.clearTimeout(crowdRecoveryTimerRef.current);
      if (crowdReactionTimerRef.current !== undefined) window.clearTimeout(crowdReactionTimerRef.current);
      if (gameAudioRef.current) {
        if (gameAudioRef.current.context) void gameAudioRef.current.context.suspend();
        gameAudioRef.current.roar.pause();
        gameAudioRef.current.roar.currentTime = 0;
      }
    }
  }

  function toggleGameTheme() {
    if(!view)return;
    const current=gameTheme??view.state.theme;
    const next:GameTheme=current==="dark"?"light":"dark";
    setGameTheme(next);
    window.localStorage.setItem(`down-by-down-theme-${session.code}-${session.seat}`,next);
  }

  async function shareInvite() {
    if (!view || !inviteLink) return;
    const message = `Down by Down: ${view.state.homeTeam.name} vs ${view.state.awayTeam.name}. Open your private away-team seat and call every snap.`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Down by Down invite", text: message, url: inviteLink });
      } else {
        await navigator.clipboard.writeText(`${message}\n${inviteLink}`);
        setNotice({ tone: "success", text: "Opponent invite copied." });
      }
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setNotice({ tone: "error", text: "The invite could not be shared from this browser." });
    }
  }

  async function shareUpdate() {
    if (!view) return;
    const last = view.state.playLog.at(-1);
    const update = [
      `DOWN BY DOWN // ${view.state.homeTeam.abbreviation} ${view.state.score.home} — ${view.state.score.away} ${view.state.awayTeam.abbreviation}`,
      `${periodLabel(view.state)} ${formatClock(view.state.clock)} • ${view.state.phase === "kickoff" ? "KICKOFF" : view.state.phase === "conversion" ? "POINT AFTER" : downAndDistance(view.state)} • ${view.state.phase === "conversion" ? "3-YARD TRY" : fieldPosition(view.state)}`,
      last ? `Last: ${last.summary}` : "Opening kickoff.",
      `Room ${view.state.roomCode}`,
    ].join("\n");
    try {
      if (navigator.share) {
        await navigator.share({ title: "Down by Down update", text: update });
      } else {
        await navigator.clipboard.writeText(update);
        setNotice({ tone: "success", text: "Game update copied." });
      }
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setNotice({ tone: "error", text: "The update could not be shared from this browser." });
    }
  }

  async function shareFinalPdf() {
    if (!view || view.state.status !== "final") return;
    setNotice(null);
    try {
      const { buildFinalCardPdf } = await import("@/lib/game/final-card");
      const bytes = await buildFinalCardPdf(view.state as unknown as GameState);
      const safeMatchup = `${view.state.homeTeam.abbreviation}-${view.state.awayTeam.abbreviation}`.replace(/[^A-Z0-9-]/gi, "");
      const file = new File([new Uint8Array(bytes)], `down-by-down-${safeMatchup}.pdf`, { type: "application/pdf" });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({
          title: "Down by Down final",
          text: `${view.state.homeTeam.name} ${view.state.score.home}–${view.state.score.away} ${view.state.awayTeam.name}`,
          files: [file],
        });
        return;
      }
      const url = URL.createObjectURL(file);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.name;
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice({ tone: "success", text: "Final game card downloaded." });
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setNotice({ tone: "error", text: "The final game card could not be shared." });
    }
  }

  useEffect(() => {
    if (view?.state.status !== "final" || reportedFinalRef.current) return;
    reportedFinalRef.current = true;
    onFinal?.(view.state as unknown as GameState);
  }, [onFinal, view]);

  if (loading && !view) {
    return <main className="loading-screen"><span>CONNECTING TO ROOM {session.code}</span></main>;
  }

  if (!view) {
    return (
      <main className="loading-screen">
        <p>{notice?.text ?? "Game unavailable."}</p>
        <Button variant="outline" onClick={onExit}>RETURN TO SETUP</Button>
      </main>
    );
  }

  const state = view.state;
  const activeTheme=gameTheme??state.theme;
  const offenseTeam = state.possession === "home" ? state.homeTeam : state.awayTeam;
  const defenseTeam = state.possession === "home" ? state.awayTeam : state.homeTeam;
  const waitingOn = !state.pending.offenseSubmitted
    ? "OFFENSE"
    : !state.pending.defenseSubmitted
      ? "DEFENSE"
      : "RESOLUTION";
  const last = state.playLog.at(-1);
  const lastOffenseExecution = last?.offenseExecutionScore ?? last?.executionScore;
  const lastDefenseExecution = last?.defenseExecutionScore;
  const lastExecution = lastOffenseExecution == null || lastDefenseExecution == null
    ? null
    : {
        offense: executionGrade(lastOffenseExecution),
        defense: executionGrade(lastDefenseExecution),
      };
  const replayEntry = replayNumber === null
    ? undefined
    : state.playLog.find((entry) => entry.number === replayNumber);
  const isFinal = state.status === "final";
  const currentRole = view.you.role;

  const winningSide = state.score.home > state.score.away ? "home" : "away";
  const winner = winningSide === "home" ? state.homeTeam : state.awayTeam;
  const callLabel = state.phase === "kickoff"
    ? currentRole === "offense" ? "KICK RETURN" : "KICK COVERAGE"
    : state.phase === "conversion"
      ? state.twoPointAttempt
        ? currentRole === "offense" ? "TWO-POINT OFFENSE" : "TWO-POINT DEFENSE"
        : currentRole === "offense" ? "POINT-AFTER TRY" : "CONVERSION DEFENSE"
    : currentRole === "offense" ? "OFFENSIVE CALL" : "DEFENSIVE CALL";
  const selectedTimingPlay = timingPlayId
    ? plays.find((play) => play.id === timingPlayId)
    : undefined;
  const selectedMeterSettings = selectedTimingPlay
    ? meterSettings(
        state.difficulty,
        currentRole,
        offenseTeam,
        defenseTeam,
        selectedTimingPlay.id,
        selectedTimingPlay.id === "field-goal" ? 117 - state.ballOn : selectedTimingPlay.id === "extra-point" ? 20 : undefined,
      )
    : null;
  const selectedMeterStops = selectedMeterSettings
    ? meterZoneStops(selectedMeterSettings.precision, state.difficulty)
    : null;
  const meterStyle = selectedMeterSettings && selectedMeterStops ? {
    "--timing-sweep-duration": `${selectedMeterSettings.durationSeconds.toFixed(3)}s`,
    "--meter-poor": `${selectedMeterStops.poor.toFixed(2)}%`,
    "--meter-fair": `${selectedMeterStops.fair.toFixed(2)}%`,
    "--meter-good": `${selectedMeterStops.good.toFixed(2)}%`,
    "--meter-perfect": `${selectedMeterStops.perfect.toFixed(2)}%`,
    "--meter-perfect-end": `${(100 - selectedMeterStops.perfect).toFixed(2)}%`,
    "--meter-good-end": `${(100 - selectedMeterStops.good).toFixed(2)}%`,
    "--meter-fair-end": `${(100 - selectedMeterStops.fair).toFixed(2)}%`,
    "--meter-poor-end": `${(100 - selectedMeterStops.poor).toFixed(2)}%`,
  } as CSSProperties : undefined;
  const yourRoleEntries = state.playLog.filter((entry) => (
    currentRole === "offense" ? entry.offense === session.seat : entry.offense !== session.seat
  ));

  function playCallMetrics(playId: string) {
    const calls = yourRoleEntries.filter((entry) => (
      currentRole === "offense" ? entry.offensePlayId === playId : entry.defensePlayId === playId
    ));
    const averageYards = calls.length > 0
      ? calls.reduce((sum, entry) => sum + entry.yards, 0) / calls.length
      : 0;
    return {
      averageYards,
      count: calls.length,
      percentage: yourRoleEntries.length > 0 ? Math.round((calls.length / yourRoleEntries.length) * 100) : 0,
    };
  }

  return (
    <main
      className={`game-shell theme-${activeTheme} difficulty-${state.difficulty}`}
      onPointerDownCapture={(event) => {
        if (!selectedTimingPlay || timingFeedback) return;
        event.preventDefault();
        event.stopPropagation();
        void stopTimingMeter();
      }}
    >
      <header className="game-topbar">
        <button className="wordmark" type="button" onClick={onExit}>
          <span className="brand-icon" aria-hidden="true" />
          <span>DOWN BY DOWN</span>
        </button>
        <span className="game-key">GAME KEY {state.roomCode}</span>
        <div className="topbar-actions">
          <button
            type="button"
            className="sound-button"
            onClick={toggleSound}
            aria-label={soundEnabled ? "Mute game sounds" : "Enable game sounds"}
            title={soundEnabled ? "Mute game sounds" : "Enable game sounds"}
          >
            {soundEnabled ? <Volume2 /> : <VolumeX />}
          </button>
          <button
            type="button"
            className="sound-button theme-toggle-button"
            onClick={toggleGameTheme}
            aria-label={activeTheme==="dark"?"Use light theme":"Use dark theme"}
            title={activeTheme==="dark"?"Use light theme":"Use dark theme"}
          >
            {activeTheme==="dark"?<Sun />:<Moon />}
          </button>
          <button type="button" className="text-button" onClick={() => void shareUpdate()}>
            <MessageSquareShare /> UPDATE
          </button>
        </div>
      </header>

      <section className="scoreboard">
        <TeamScore team={state.homeTeam} score={state.score.home} possession={state.possession === "home"} align="left" />
        <div className="game-clock">
          <span>{isFinal ? "FINAL" : periodLabel(state)}</span>
          <strong>{isFinal ? "0:00" : formatClock(state.clock)}</strong>
          <b>{isFinal ? "GAME OVER" : state.phase === "kickoff" ? "KICKOFF" : state.phase === "conversion" ? state.twoPointAttempt ? "TWO-POINT TRY" : "POINT AFTER" : `${downAndDistance(state)} · ${fieldPosition(state)}`}</b>
          {!isFinal ? <small>{state.phase === "conversion" ? "3-YARD TRY" : fieldPosition(state)}</small> : null}
        </div>
        <TeamScore team={state.awayTeam} score={state.score.away} possession={state.possession === "away"} align="right" />
      </section>

      {replayEntry?.offenseExecutionScore != null && replayEntry.defenseExecutionScore != null ? (
        <SnapReveal state={state} entry={replayEntry} />
      ) : isFinal ? (
        <section className="final-panel">
          <span>GAME COMPLETE</span>
          <h2>{winner.name} wins {state.score[winningSide]}–{state.score[winningSide === "home" ? "away" : "home"]}</h2>
          <Button onClick={() => void shareFinalPdf()}><FileDown /> SHARE FINAL PDF</Button>
          <Button variant="outline" onClick={onExit}><RotateCcw /> NEW GAME</Button>
        </section>
      ) : view.you.submitted || (
        currentRole === "defense" && state.opponentType === "human" && !state.pending.offenseSubmitted
      ) ? (
        <section className="waiting-panel">
          <Radio />
          <div>
            <span>{view.you.submitted ? "INPUT LOCKED" : "OFFENSE HAS THE FLOOR"}</span>
            <h2>WAITING ON {waitingOn}</h2>
            <p>{submittedTiming
              ? `${Math.round(submittedTiming.score)} — ${submittedTiming.label}. Your concept and execution stay hidden.`
              : "The offensive concept and execution remain hidden until defense finishes its meter."}</p>
          </div>
        </section>
      ) : (
        <section className="call-console">
          <div className="call-console-label">
            <div>
              <span>{callLabel}</span>
              <strong>{view.you.role === "offense" ? offenseTeam.abbreviation : defenseTeam.abbreviation}</strong>
            </div>
            <div className={`role-badge ${view.you.role}`}>YOU: {view.you.role.toUpperCase()}</div>
          </div>
          {selectedTimingPlay ? (
            <div
              className={`timing-challenge ${timingFeedback ? `is-stopped ${timingFeedback.tier}` : ""}`}
              style={meterStyle}
            >
              <div className="timing-challenge-heading">
                <div>
                  <span>{selectedTimingPlay.name}</span>
                  <strong>{currentRole === "defense"
                    ? "DEFENSIVE EXECUTION"
                    : selectedTimingPlay.id === "field-goal" || selectedTimingPlay.id === "extra-point"
                    ? "KICK ACCURACY"
                    : selectedTimingPlay.family === "pass"
                    ? "PASS ACCURACY"
                    : selectedTimingPlay.family === "option"
                      ? "RPO EXECUTION"
                      : "YARDS AFTER CONTACT"}</strong>
                </div>
                <small>{state.difficulty.toUpperCase()} SPEED</small>
              </div>
              <button
                ref={timingTrackRef}
                type="button"
                className="timing-meter-button"
                disabled={submitting}
                aria-label="Stop the moving marker in the green center zone"
                onPointerDown={(event) => {
                  event.preventDefault();
                  void stopTimingMeter();
                }}
                onKeyDown={(event) => {
                  if ((event.key === "Enter" || event.key === " ") && !event.repeat) {
                    event.preventDefault();
                    void stopTimingMeter();
                  }
                }}
              >
                <span className="timing-meter-center" aria-hidden="true" />
                <span
                  ref={timingMarkerRef}
                  className="timing-meter-marker"
                  aria-hidden="true"
                  onAnimationEnd={() => void stopTimingMeter(true)}
                />
              </button>
              <div className="timing-challenge-footer" aria-live="polite">
                <strong>{timingFeedback
                  ? `${Math.round(timingFeedback.score)} — ${timingFeedback.label}`
                  : "TAP THE METER IN GREEN"}</strong>
              </div>
            </div>
          ) : (
            <div className="play-call-grid" aria-label={`${callLabel} options`}>
              {plays.map((play) => {
                const metrics = playCallMetrics(play.id);
                const averageLabel = view.you.role === "offense" ? "average yards gained" : "average yards allowed";
                return (
                  <button
                    key={play.id}
                    type="button"
                    className="play-call-button"
                    disabled={submitting}
                    onClick={() => selectPlay(play.id)}
                    title={`${metrics.count} calls, ${metrics.percentage}% of your ${view.you.role} calls, ${metrics.averageYards.toFixed(1)} ${averageLabel}`}
                  >
                    <strong>{play.name}</strong>
                    <small className="play-call-metrics">
                      {metrics.count}× · {metrics.percentage}% · {metrics.averageYards.toFixed(1)} {view.you.role === "offense" ? "GAIN" : "ALLOW"}
                    </small>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      <section className="stadium-frame">
        <CompactField state={state} replayEntry={replayEntry} />
      </section>

      {last ? (
        <section className="last-play">
          <span>LAST PLAY</span>
          <p>{last.summary}</p>
          <small>{last.offensePlayName} vs {last.defensePlayName}</small>
        </section>
      ) : null}

      {last ? (
        <section className={`last-call-matchup ${lastExecution ? "with-execution" : ""}`} aria-label="Last play calls">
          <div>
            <span>{last.offense === "home" ? state.homeTeam.abbreviation : state.awayTeam.abbreviation}</span>
            <strong>{last.offensePlayName}</strong>
          </div>
          <b>VS</b>
          <div>
            <span>{last.offense === "home" ? state.awayTeam.abbreviation : state.homeTeam.abbreviation}</span>
            <strong>{last.defensePlayName}</strong>
          </div>
          {lastExecution && lastOffenseExecution != null && lastDefenseExecution != null ? (
            <span className="last-execution-grade">
              OFF {Math.round(lastOffenseExecution)} {lastExecution.offense.label} · DEF {Math.round(lastDefenseExecution)} {lastExecution.defense.label}
            </span>
          ) : null}
        </section>
      ) : null}

      {notice ? <div className={`notice ${notice.tone}`} role="status">{notice.text}</div> : null}

      <GameTabs state={state} seat={session.seat} />

      <div className="room-actions">
        {inviteLink ? (
          <Button variant="outline" onClick={() => void shareInvite()}>
            <MessageSquareShare /> SHARE OPPONENT INVITE
          </Button>
        ) : null}
        <Button variant="ghost" onClick={() => void shareUpdate()}>
          <Copy /> COPY GAME UPDATE
        </Button>
      </div>
    </main>
  );
}

export function GridironWire({
  initialSession = null,
  initialInvite = "",
  onFinal,
  onExit,
  teamDirectory = [],
  defaultTheme = "dark",
}: {
  initialSession?: Session | null;
  initialInvite?: string;
  onFinal?: (state: GameState) => void;
  onExit?: () => void;
  teamDirectory?: TeamInput[];
  defaultTheme?: GameTheme;
} = {}) {
  const [session, setSession] = useState<Session | null>(initialSession);
  const [invite, setInvite] = useState(initialInvite);
  const [ready, setReady] = useState(Boolean(initialSession));

  useEffect(() => {
    const url = new URL(window.location.href);
    if (initialSession) return;
    const code = url.searchParams.get("game")?.toUpperCase() ?? "";
    const seat = url.searchParams.get("seat");
    const token = url.searchParams.get("token") ?? "";
    const loadTimer = window.setTimeout(() => {
      if (code && (seat === "home" || seat === "away") && token) {
        setSession({ code, seat, token });
      }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(loadTimer);
  }, [initialSession]);

  function onCreated(nextSession: Session, awayToken: string, opponentType: OpponentType) {
    const ownUrl = new URL(window.location.origin);
    ownUrl.searchParams.set("game", nextSession.code);
    ownUrl.searchParams.set("seat", nextSession.seat);
    ownUrl.searchParams.set("token", nextSession.token);
    window.history.replaceState({}, "", ownUrl.toString());
    if (opponentType === "human") {
      const awayUrl = new URL(window.location.origin);
      awayUrl.searchParams.set("game", nextSession.code);
      awayUrl.searchParams.set("seat", "away");
      awayUrl.searchParams.set("token", awayToken);
      window.localStorage.setItem(`gridiron-wire-invite-${nextSession.code}`, awayUrl.toString());
      setInvite(awayUrl.toString());
    } else {
      window.localStorage.removeItem(`gridiron-wire-invite-${nextSession.code}`);
      setInvite("");
    }
    setSession(nextSession);
  }

  function exitGame() {
    if (onExit) {
      onExit();
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("game");
    url.searchParams.delete("seat");
    url.searchParams.delete("token");
    window.history.replaceState({}, "", url.toString());
    setSession(null);
    setInvite("");
  }

  if (!ready) return <main className="loading-screen"><span>DOWN BY DOWN</span></main>;
  return session ? (
    <GameRoom session={session} initialInvite={invite} onExit={exitGame} onFinal={onFinal} />
  ) : (
    <Lobby onCreated={onCreated} teamDirectory={teamDirectory} defaultTheme={defaultTheme} />
  );
}
