export type TeamSide = "home" | "away";

export type GameStatus = "active" | "final";

export type GamePhase = "scrimmage" | "kickoff" | "conversion";

export type OpponentType = "human" | "cpu";

export type GameTheme = "dark" | "light";

export type GameDifficulty = "easy" | "hard" | "impossible";

export type PlayerPosition =
  | "QB"
  | "RB"
  | "WR"
  | "TE"
  | "LT"
  | "LG"
  | "C"
  | "RG"
  | "RT"
  | "DE"
  | "DT"
  | "CB"
  | "FS"
  | "SS"
  | "OL"
  | "DL"
  | "LB"
  | "DB"
  | "K"
  | "P"
  | "LS"
  | "H";

export interface Player {
  id: string;
  name: string;
  number: number;
  position: PlayerPosition;
  rating: number;
}

export interface TeamRoster {
  offense: Player[];
  defense: Player[];
  specialTeams?: Player[];
}

export interface TeamConfig {
  side: TeamSide;
  teamId: string;
  name: string;
  mascot: string;
  abbreviation: string;
  conference: string;
  primaryColor: string;
  secondaryColor: string;
  logo: string;
  rating: number;
  ranking?: number | null;
  record?: string;
  roster: TeamRoster;
}

export interface TeamInput {
  teamId: string;
  name: string;
  mascot: string;
  abbreviation: string;
  conference: string;
  primaryColor: string;
  secondaryColor: string;
  logo: string;
  rating?: number;
  ranking?: number | null;
  record?: string;
  roster?: TeamRoster;
}

export interface IndividualPlayerStats {
  playerId: string;
  passAttempts: number;
  completions: number;
  passYards: number;
  passTouchdowns: number;
  interceptionsThrown: number;
  rushAttempts: number;
  rushYards: number;
  rushTouchdowns: number;
  targets: number;
  receptions: number;
  receivingYards: number;
  receivingTouchdowns: number;
  tackles: number;
  soloTackles: number;
  assistedTackles: number;
  tacklesForLoss: number;
  sacks: number;
  interceptions: number;
  passBreakups: number;
  forcedFumbles: number;
}

export interface PlayParticipants {
  passerId?: string;
  runnerId?: string;
  receiverId?: string;
  tacklerIds?: string[];
  sackById?: string;
  interceptionById?: string;
  passBreakupById?: string;
  coverageDefenderId?: string;
  forcedFumbleById?: string;
  kickerId?: string;
  punterId?: string;
  returnerId?: string;
  specialTeamsTacklerId?: string;
}

export interface SpecialTeamsReplay {
  kind: "kickoff" | "punt" | "field-goal" | "extra-point";
  kickingSide: TeamSide;
  receivingSide: TeamSide;
  startX: number;
  flightX: number;
  endX: number;
  made?: boolean;
  blocked?: boolean;
  missSide?: "left" | "right";
  onside?: boolean;
  kickingTeamRecovered?: boolean;
}

export type OffensePlayId =
  | "run"
  | "stick"
  | "mesh"
  | "four-verts"
  | "inside-zone"
  | "power"
  | "outside-zone"
  | "counter"
  | "rpo"
  | "quick-pass"
  | "dropback"
  | "play-action"
  | "screen"
  | "punt"
  | "field-goal"
  | "kneel"
  | "spike"
  | "kick-return-left"
  | "kick-return-middle"
  | "kick-return-right"
  | "touchback"
  | "hands-team"
  | "extra-point"
  | "two-point";

export type DefensePlayId =
  | "bear-front"
  | "cover-4"
  | "cover-0"
  | "cover-1"
  | "cover-2"
  | "cover-3"
  | "quarters"
  | "man-blitz"
  | "zone-blitz"
  | "run-commit"
  | "contain"
  | "drop-8"
  | "punt-safe"
  | "punt-return-left"
  | "punt-return-middle"
  | "punt-return-right"
  | "punt-block"
  | "field-goal-safe"
  | "field-goal-block"
  | "kick-deep-left"
  | "kick-deep-middle"
  | "kick-deep-right"
  | "squib-kick"
  | "onside-kick"
  | "kick-block"
  | "goal-line-defense";

export interface PlayDefinition<T extends string> {
  id: T;
  code: string;
  name: string;
  description: string;
  family: "run" | "pass" | "option" | "special" | "coverage" | "pressure";
  risk: "low" | "medium" | "high";
}

export interface PendingCall {
  seat: TeamSide;
  role: "offense" | "defense";
  playId: OffensePlayId | DefensePlayId;
  playNumber: number;
  submittedAt: string;
  executionScore?: number;
}

export interface TeamStats {
  plays: number;
  firstDowns: number;
  rushAttempts: number;
  rushYards: number;
  rushTouchdowns: number;
  passAttempts: number;
  completions: number;
  passYards: number;
  passTouchdowns: number;
  sacksAllowed: number;
  interceptionsThrown: number;
  fumblesLost: number;
  punts: number;
  puntReturns: number;
  puntReturnYards: number;
  kickReturns: number;
  kickReturnYards: number;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  timeOfPossessionSeconds: number;
}

export type PlayOutcome =
  | "run"
  | "completion"
  | "incompletion"
  | "sack"
  | "interception"
  | "fumble"
  | "punt"
  | "kickoff"
  | "kneel"
  | "spike"
  | "field-goal"
  | "touchdown"
  | "safety"
  | "turnover-on-downs"
  | "extra-point"
  | "two-point";

export interface PlayLogEntry {
  number: number;
  driveNumber: number;
  period: number;
  clockBefore: number;
  elapsedSeconds: number;
  offense: TeamSide;
  offensePlayId: OffensePlayId;
  defensePlayId: DefensePlayId;
  offensePlayName: string;
  defensePlayName: string;
  outcome: PlayOutcome;
  yards: number;
  ballOnBefore: number;
  summary: string;
  scoreAfter: Record<TeamSide, number>;
  downAfter: number;
  toGoAfter: number;
  ballOnAfter: number;
  possessionAfter: TeamSide;
  participants?: PlayParticipants;
  specialTeamsReplay?: SpecialTeamsReplay;
  offenseExecutionScore?: number;
  defenseExecutionScore?: number;
  /** Legacy alias retained so older saved rooms and exports still open. */
  executionScore?: number;
}

export interface OvertimeState {
  round: number;
  firstPossession: TeamSide;
  possessions: TeamSide[];
  roundStartScore: Record<TeamSide, number>;
}

export interface GameState {
  schemaVersion: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  roomCode: string;
  status: GameStatus;
  version: number;
  seed: string;
  createdAt: string;
  opponentType: OpponentType;
  cpuSide?: TeamSide;
  theme: GameTheme;
  difficulty: GameDifficulty;
  /** 0 starts directly in overtime; 1–15 is the regulation quarter length. */
  quarterLengthMinutes: number;
  homeTeam: TeamConfig;
  awayTeam: TeamConfig;
  score: Record<TeamSide, number>;
  stats: Record<TeamSide, TeamStats>;
  playerStats: Record<TeamSide, Record<string, IndividualPlayerStats>>;
  period: number;
  clock: number;
  phase: GamePhase;
  possession: TeamSide;
  openingReceiver: TeamSide;
  secondHalfReceiver: TeamSide;
  ballOn: number;
  driveStartBallOn: number;
  down: number;
  toGo: number;
  driveNumber: number;
  playNumber: number;
  pending: Partial<Record<TeamSide, PendingCall>>;
  playLog: PlayLogEntry[];
  /** Conversion choice has advanced into a normal concept-versus-concept two-point snap. */
  twoPointAttempt?: boolean;
  overtime?: OvertimeState;
}

export interface GameView {
  state: Omit<GameState, "pending"> & {
    pending: {
      yourPlayId?: OffensePlayId | DefensePlayId;
      offenseSubmitted: boolean;
      defenseSubmitted: boolean;
    };
  };
  you: {
    seat: TeamSide;
    role: "offense" | "defense";
    submitted: boolean;
  };
}

export interface Resolution {
  state: GameState;
  entry: PlayLogEntry;
}
