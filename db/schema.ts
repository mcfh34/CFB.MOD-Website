import { sql } from "drizzle-orm";
import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const refreshRuns = sqliteTable("refresh_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  season: integer("season").notNull(),
  week: integer("week").notNull(),
  source: text("source").notNull(),
  status: text("status").notNull(),
  gameCount: integer("game_count").notNull().default(0),
  detail: text("detail").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const cfbTeams = sqliteTable("cfb_teams", {
  season: integer("season").notNull(),
  team: text("team").notNull(),
  teamId: text("team_id"),
  abbreviation: text("abbreviation"),
  mascot: text("mascot"),
  conference: text("conference"),
  color: text("color"),
  altColor: text("alt_color"),
  logo: text("logo"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [primaryKey({ columns: [table.season, table.team] }), index("cfb_teams_season_idx").on(table.season)]);

export const cfbGames = sqliteTable("cfb_games", {
  gameId: text("game_id").primaryKey(),
  season: integer("season").notNull(),
  week: integer("week").notNull(),
  seasonType: text("season_type").notNull().default("regular"),
  startDate: text("start_date"),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  neutralSite: integer("neutral_site", { mode: "boolean" }).notNull().default(false),
  conferenceGame: integer("conference_game", { mode: "boolean" }).notNull().default(false),
  venue: text("venue"),
  homeTeam: text("home_team").notNull(),
  homeConference: text("home_conference"),
  homePoints: integer("home_points"),
  awayTeam: text("away_team").notNull(),
  awayConference: text("away_conference"),
  awayPoints: integer("away_points"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("cfb_games_season_week_idx").on(table.season, table.week), index("cfb_games_home_idx").on(table.homeTeam), index("cfb_games_away_idx").on(table.awayTeam)]);

export const teamGameStats = sqliteTable("team_game_stats", {
  gameId: text("game_id").notNull(),
  season: integer("season").notNull(),
  week: integer("week").notNull(),
  team: text("team").notNull(),
  opponent: text("opponent").notNull(),
  homeAway: text("home_away").notNull(),
  points: integer("points"),
  totalYards: real("total_yards").notNull().default(0),
  yardsPerPlay: real("yards_per_play").notNull().default(0),
  passYards: real("pass_yards").notNull().default(0),
  passAttempts: real("pass_attempts").notNull().default(0),
  yardsPerPass: real("yards_per_pass").notNull().default(0),
  rushYards: real("rush_yards").notNull().default(0),
  rushAttempts: real("rush_attempts").notNull().default(0),
  yardsPerRush: real("yards_per_rush").notNull().default(0),
  turnovers: real("turnovers").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [primaryKey({ columns: [table.gameId, table.team] }), index("team_game_stats_season_week_idx").on(table.season, table.week), index("team_game_stats_team_idx").on(table.team)]);

export const bettingLines = sqliteTable("betting_lines", {
  gameId: text("game_id").primaryKey(),
  season: integer("season").notNull(),
  week: integer("week").notNull(),
  provider: text("provider"),
  spread: real("spread"),
  spreadOpen: real("spread_open"),
  formattedSpread: text("formatted_spread"),
  overUnder: real("over_under"),
  overUnderOpen: real("over_under_open"),
  homeMoneyline: real("home_moneyline"),
  awayMoneyline: real("away_moneyline"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("betting_lines_season_week_idx").on(table.season, table.week)]);

export const weeklyProfiles = sqliteTable("weekly_profiles", {
  season: integer("season").notNull(),
  week: integer("week").notNull(),
  team: text("team").notNull(),
  gamesPlayed: integer("games_played").notNull().default(0),
  offYpp: real("off_ypp").notNull(), offYpa: real("off_ypa").notNull(), offYpc: real("off_ypc").notNull(), offPatt: real("off_patt").notNull(), offRatt: real("off_ratt").notNull(),
  defYpp: real("def_ypp").notNull(), defYpa: real("def_ypa").notNull(), defYpc: real("def_ypc").notNull(), defPatt: real("def_patt").notNull(), defRatt: real("def_ratt").notNull(),
  offYppIndex: real("off_ypp_index").notNull(), offYpaIndex: real("off_ypa_index").notNull(), offYpcIndex: real("off_ypc_index").notNull(), offPattIndex: real("off_patt_index").notNull(), offRattIndex: real("off_ratt_index").notNull(),
  defYppIndex: real("def_ypp_index").notNull(), defYpaIndex: real("def_ypa_index").notNull(), defYpcIndex: real("def_ypc_index").notNull(), defPattIndex: real("def_patt_index").notNull(), defRattIndex: real("def_ratt_index").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [primaryKey({ columns: [table.season, table.week, table.team] }), index("weekly_profiles_team_idx").on(table.team, table.season, table.week)]);

export const modelPredictions = sqliteTable("model_predictions", {
  gameId: text("game_id").primaryKey(),
  season: integer("season").notNull(),
  week: integer("week").notNull(),
  generatedFromWeek: integer("generated_from_week").notNull(),
  homeTeam: text("home_team").notNull(),
  awayTeam: text("away_team").notNull(),
  homeScore: real("home_score").notNull(),
  awayScore: real("away_score").notNull(),
  homeWinProbability: real("home_win_probability").notNull(),
  modelHomeSpread: real("model_home_spread").notNull(),
  modelTotal: real("model_total").notNull(),
  vegasSpread: real("vegas_spread"),
  vegasTotal: real("vegas_total"),
  spreadEdge: real("spread_edge"),
  totalEdge: real("total_edge"),
  spreadError: real("spread_error"),
  totalError: real("total_error"),
  spreadResult: text("spread_result"),
  totalResult: text("total_result"),
  modelVersion: text("model_version").notNull().default("harper-plus-v1"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("model_predictions_season_week_idx").on(table.season, table.week)]);

export const modelSnapshots = sqliteTable("model_snapshots", {
  season: integer("season").notNull(),
  week: integer("week").notNull(),
  teamCount: integer("team_count").notNull(),
  gameCount: integer("game_count").notNull(),
  completedGameCount: integer("completed_game_count").notNull(),
  source: text("source").notNull().default("CollegeFootballData"),
  modelVersion: text("model_version").notNull().default("harper-plus-v1"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [primaryKey({ columns: [table.season, table.week] })]);
