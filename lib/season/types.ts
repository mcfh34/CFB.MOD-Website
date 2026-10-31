import type { GameDifficulty, IndividualPlayerStats, TeamInput, TeamRoster, TeamStats } from "@/lib/game/types";

export const SEASON_SAVE_VERSION = 5 as const;

export type SeasonPhase =
  | "regular"
  | "conference"
  | "bowl"
  | "playoff-first"
  | "playoff-quarterfinal"
  | "playoff-semifinal"
  | "championship"
  | "complete";

export type SeasonTeam = TeamInput & {
  modelRating: number;
  eloRating: number;
  conference: string;
  roster: TeamRoster;
};

export type SeasonGame = {
  id: string;
  week: number;
  stage: SeasonPhase;
  label: string;
  startDate: string | null;
  venue: string | null;
  neutralSite: boolean;
  conferenceGame: boolean;
  homeTeam: string;
  homeConference?: string | null;
  homeLogo?: string | null;
  awayTeam: string;
  awayConference?: string | null;
  awayLogo?: string | null;
  predictedHomeScore: number;
  predictedAwayScore: number;
  homeWinProbability: number;
  completed: boolean;
  userPlayed: boolean;
  homeScore: number | null;
  awayScore: number | null;
  teamStats?: Record<string, TeamStats>;
  playerStats?: Record<string, Record<string, IndividualPlayerStats>>;
};

export type TeamRecord = {
  wins: number;
  losses: number;
  conferenceWins: number;
  conferenceLosses: number;
  pointsFor: number;
  pointsAgainst: number;
};

export type SeasonTeamTotals = TeamStats & {
  pointsFor: number;
  pointsAgainst: number;
};

export type SeasonAccomplishments = {
  conferenceChampion: boolean;
  bowlGame: string | null;
  bowlChampion: boolean;
  playoffQualifier: boolean;
  playoffSeed: number | null;
  playoffRoundReached: string | null;
  nationalChampion: boolean;
};

export type CompletedSeasonSummary = {
  season: number;
  team: string;
  finalRecord: TeamRecord;
  finalRanking: number | null;
  accomplishments: SeasonAccomplishments;
  schedule: SeasonGame[];
  teamStats: SeasonTeamTotals;
  playerStats: Record<string, IndividualPlayerStats>;
};

export type ActiveSeasonGame = {
  gameId: string;
  code: string;
  seat: "home" | "away";
  token: string;
};

export type SeasonSave = {
  schemaVersion: typeof SEASON_SAVE_VERSION;
  id: string;
  season: number;
  createdAt: string;
  updatedAt: string;
  dynastyStartSeason: number;
  seasonHistory: CompletedSeasonSummary[];
  selectedTeam: string;
  difficulty: GameDifficulty;
  /** 0 starts played games directly in overtime; 1–15 is minutes per quarter. */
  quarterLengthMinutes: number;
  currentWeek: number;
  phase: SeasonPhase;
  teams: Record<string, SeasonTeam>;
  games: SeasonGame[];
  records: Record<string, TeamRecord>;
  rankings: string[];
  userTeamStats: SeasonTeamTotals;
  userPlayerStats: Record<string, IndividualPlayerStats>;
  accomplishments: SeasonAccomplishments;
  playoffSeeds: string[];
  activeGame: ActiveSeasonGame | null;
};

export type ModelProfileRow = {
  team: string;
  teamId?: string | number | null;
  abbreviation?: string | null;
  mascot?: string | null;
  conference?: string | null;
  color?: string | null;
  altColor?: string | null;
  logo?: string | null;
  resultsRank?: number | null;
  record?: string | null;
  eloRating?: number | null;
  offYppIndex?: number | null;
  defYppIndex?: number | null;
};

export type ModelScheduleRow = {
  gameId: string;
  week: number;
  seasonType?: string | null;
  startDate?: string | null;
  neutralSite?: boolean;
  conferenceGame?: boolean;
  venue?: string | null;
  homeTeam: string;
  homeConference?: string | null;
  homeLogo?: string | null;
  awayTeam: string;
  awayConference?: string | null;
  awayLogo?: string | null;
  predictedHomeScore?: number | null;
  predictedAwayScore?: number | null;
  homeWinProbability?: number | null;
};

export type PlayerRatingRow = {
  id: string;
  name: string;
  jersey?: number | null;
  position: string;
  overall?: number | null;
  projectedStarter?: boolean;
};
