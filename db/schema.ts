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

export const preseasonInputs = sqliteTable("preseason_inputs", {
  season: integer("season").notNull(),
  team: text("team").notNull(),
  conference: text("conference"),
  returningPpa: real("returning_ppa"),
  returningPassingPpa: real("returning_passing_ppa"),
  returningReceivingPpa: real("returning_receiving_ppa"),
  returningRushingPpa: real("returning_rushing_ppa"),
  returningUsage: real("returning_usage"),
  returningPassingUsage: real("returning_passing_usage"),
  returningReceivingUsage: real("returning_receiving_usage"),
  returningRushingUsage: real("returning_rushing_usage"),
  recruitingRank: integer("recruiting_rank"),
  recruitingPoints: real("recruiting_points"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [primaryKey({ columns: [table.season, table.team] }), index("preseason_inputs_season_idx").on(table.season)]);

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
  passCompletions: real("pass_completions"),
  yardsPerPass: real("yards_per_pass").notNull().default(0),
  rushYards: real("rush_yards").notNull().default(0),
  rushAttempts: real("rush_attempts").notNull().default(0),
  yardsPerRush: real("yards_per_rush").notNull().default(0),
  turnovers: real("turnovers").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [primaryKey({ columns: [table.gameId, table.team] }), index("team_game_stats_season_week_idx").on(table.season, table.week), index("team_game_stats_team_idx").on(table.team)]);

export const teamGameAdvancedStats = sqliteTable("team_game_advanced_stats", {
  gameId: text("game_id").notNull(),
  season: integer("season").notNull(),
  week: integer("week").notNull(),
  team: text("team").notNull(),
  opponent: text("opponent").notNull(),
  offLineYards: real("off_line_yards"),
  offSecondLevelYards: real("off_second_level_yards"),
  offOpenFieldYards: real("off_open_field_yards"),
  offPassingSuccessRate: real("off_passing_success_rate"),
  offPassingExplosiveness: real("off_passing_explosiveness"),
  defLineYards: real("def_line_yards"),
  defSecondLevelYards: real("def_second_level_yards"),
  defOpenFieldYards: real("def_open_field_yards"),
  defPassingSuccessRate: real("def_passing_success_rate"),
  defPassingExplosiveness: real("def_passing_explosiveness"),
  componentJson: text("component_json"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  primaryKey({ columns: [table.gameId, table.team] }),
  index("team_game_advanced_stats_season_week_idx").on(table.season, table.week),
  index("team_game_advanced_stats_team_idx").on(table.team, table.season),
]);

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

export const weeklyAdvancedProfiles = sqliteTable("weekly_advanced_profiles", {
  season: integer("season").notNull(),
  week: integer("week").notNull(),
  team: text("team").notNull(),
  gamesPlayed: integer("games_played").notNull().default(0),
  profileJson: text("profile_json").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  primaryKey({ columns: [table.season, table.week, table.team] }),
  index("weekly_advanced_profiles_team_idx").on(table.team, table.season, table.week),
]);

export const advancedSyncState = sqliteTable("advanced_sync_state", {
  season: integer("season").primaryKey(),
  completedGameCount: integer("completed_game_count").notNull().default(0),
  rowCount: integer("row_count").notNull().default(0),
  componentVersion: integer("component_version").notNull().default(1),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const syncLeases = sqliteTable("sync_leases", {
  scope: text("scope").primaryKey(),
  nextAllowedAt: integer("next_allowed_at").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

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

/**
 * Player feeds are cached once per team-season instead of as one oversized
 * season blob. That keeps each D1 value comfortably below SQLite's value
 * ceiling while allowing the public UI to request only the selected teams.
 *
 * The source columns are deliberately retained after profile materialization:
 * completed historical data is immutable, but starter-selection and player-impact
 * formulas can be improved later without downloading the source feeds again.
 */
export const playerTeamProfiles = sqliteTable("player_team_profiles", {
  season: integer("season").notNull(),
  team: text("team").notNull(),
  rosterJson: text("roster_json").notNull().default("[]"),
  statsJson: text("stats_json").notNull().default("[]"),
  successJson: text("success_json").notNull().default("[]"),
  usageJson: text("usage_json").notNull().default("[]"),
  ppaJson: text("ppa_json").notNull().default("[]"),
  recruitingJson: text("recruiting_json").notNull().default("[]"),
  transferJson: text("transfer_json").notNull().default("[]"),
  profileJson: text("profile_json").notNull().default("{}"),
  sourceQuality: text("source_quality").notNull().default("building"),
  modelVersion: integer("model_version").notNull().default(1),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  primaryKey({ columns: [table.season, table.team] }),
  index("player_team_profiles_season_idx").on(table.season),
]);

/**
 * Published depth is versioned by dated snapshot. This is intentionally
 * separate from player_team_profiles: a late-season injury chart must never
 * overwrite the opening-week chart, and a depth update must never alter the
 * immutable production/recruiting source rows.
 */
export const depthChartSnapshots = sqliteTable("depth_chart_snapshots", {
  sourceId: text("source_id").primaryKey(),
  season: integer("season").notNull(),
  team: text("team").notNull(),
  publishedAt: text("published_at").notNull(),
  snapshotWeek: integer("snapshot_week"),
  sourceKind: text("source_kind").notNull(),
  sourceLabel: text("source_label").notNull(),
  sourceUrl: text("source_url").notNull(),
  chartJson: text("chart_json").notNull().default("{}"),
  verificationStatus: text("verification_status").notNull().default("pending"),
  matchedPlayers: integer("matched_players").notNull().default(0),
  listedPlayers: integer("listed_players").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("depth_chart_snapshots_team_season_idx").on(table.team, table.season),
  index("depth_chart_snapshots_season_date_idx").on(table.season, table.publishedAt),
]);

/**
 * Each published chart is also normalized to one row per listed player. The
 * snapshot JSON remains the fast read path for the public app; these rows are
 * the auditable archive used for roster matching, coverage reporting and
 * corrections without rewriting an entire season blob.
 */
export const depthChartEntries = sqliteTable("depth_chart_entries", {
  sourceId: text("source_id").notNull(),
  entryIndex: integer("entry_index").notNull(),
  season: integer("season").notNull(),
  team: text("team").notNull(),
  side: text("side").notNull(),
  role: text("role").notNull(),
  position: text("position").notNull(),
  depth: integer("depth").notNull(),
  playerName: text("player_name").notNull(),
  jersey: integer("jersey"),
  rosterPlayerId: text("roster_player_id"),
  matchMethod: text("match_method").notNull().default("unmatched"),
  matchConfidence: real("match_confidence").notNull().default(0),
  reviewStatus: text("review_status").notNull().default("pending"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  primaryKey({ columns: [table.sourceId, table.entryIndex] }),
  index("depth_chart_entries_team_season_idx").on(table.team, table.season),
  index("depth_chart_entries_source_idx").on(table.sourceId),
  index("depth_chart_entries_player_idx").on(table.playerName, table.season),
]);

/**
 * Every FBS team-season is represented here, including team-seasons for which
 * an official chart has not yet been recovered. This prevents missing history
 * from being mistaken for verified history and makes archive work resumable.
 */
export const depthChartCoverage = sqliteTable("depth_chart_coverage", {
  season: integer("season").notNull(),
  team: text("team").notNull(),
  status: text("status").notNull().default("queued"),
  searchQuery: text("search_query").notNull().default(""),
  sourceCount: integer("source_count").notNull().default(0),
  verifiedSnapshotCount: integer("verified_snapshot_count").notNull().default(0),
  verifiedEntryCount: integer("verified_entry_count").notNull().default(0),
  unresolvedEntryCount: integer("unresolved_entry_count").notNull().default(0),
  latestSnapshotAt: text("latest_snapshot_at"),
  bestSourceKind: text("best_source_kind"),
  nextAction: text("next_action").notNull().default("Locate official team game notes or media guide"),
  lastAttemptAt: text("last_attempt_at"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  primaryKey({ columns: [table.season, table.team] }),
  index("depth_chart_coverage_status_idx").on(table.status, table.season),
  index("depth_chart_coverage_season_idx").on(table.season, table.team),
]);

/**
 * Import runs provide a compact audit trail. Large PDF text and source files
 * remain outside D1; the database retains only the result, provenance and
 * validation outcome so it cannot repeat the SQLITE_TOOBIG failure.
 */
export const depthChartImportRuns = sqliteTable("depth_chart_import_runs", {
  id: text("id").primaryKey(),
  mode: text("mode").notNull(),
  status: text("status").notNull().default("running"),
  requestedCount: integer("requested_count").notNull().default(0),
  importedCount: integer("imported_count").notNull().default(0),
  rejectedCount: integer("rejected_count").notNull().default(0),
  detail: text("detail").notNull().default(""),
  startedAt: text("started_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  finishedAt: text("finished_at"),
});

export const playerSyncState = sqliteTable("player_sync_state", {
  season: integer("season").primaryKey(),
  stage: text("stage").notNull().default("roster"),
  rosterCount: integer("roster_count").notNull().default(0),
  statCount: integer("stat_count").notNull().default(0),
  successCount: integer("success_count").notNull().default(0),
  usageCount: integer("usage_count").notNull().default(0),
  ppaCount: integer("ppa_count").notNull().default(0),
  transferCount: integer("transfer_count").notNull().default(0),
  transferYear: integer("transfer_year").notNull().default(2021),
  recruitingCount: integer("recruiting_count").notNull().default(0),
  recruitingYear: integer("recruiting_year").notNull().default(2018),
  teamCount: integer("team_count").notNull().default(0),
  modelVersion: integer("model_version").notNull().default(1),
  detail: text("detail").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

/**
 * Historical player percentiles are expensive to derive because the source
 * profiles are stored as one JSON document per team-season. Materialize the
 * resulting scale once and keep public player requests to a single keyed read.
 */
export const playerProductionBaselines = sqliteTable("player_production_baselines", {
  id: text("id").primaryKey(),
  baselineJson: text("baseline_json").notNull().default("{}"),
  dirty: integer("dirty", { mode: "boolean" }).notNull().default(true),
  status: text("status").notNull().default("building"),
  nextSeason: integer("next_season").notNull().default(2014),
  detail: text("detail").notNull().default("Waiting to normalize historical player production"),
  modelVersion: integer("model_version").notNull().default(1),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const playerProductionScores = sqliteTable("player_production_scores", {
  season: integer("season").notNull(),
  team: text("team").notNull(),
  playerKey: text("player_key").notNull(),
  position: text("position").notNull(),
  score: real("score").notNull(),
  stars: integer("stars"),
  ratingBand: integer("rating_band"),
  opponentRelative: real("opponent_relative"),
  opponentUnitQuality: real("opponent_unit_quality"),
  supportQuality: real("support_quality"),
  usageRate: real("usage_rate"),
}, (table) => [
  primaryKey({ columns: [table.season, table.team, table.playerKey] }),
  index("player_production_scores_position_score_idx").on(table.position, table.score),
  index("player_production_scores_season_idx").on(table.season),
]);
