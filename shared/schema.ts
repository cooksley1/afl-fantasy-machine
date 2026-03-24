import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, boolean, timestamp, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const players = pgTable("players", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  team: text("team").notNull(),
  position: text("position").notNull(),
  dualPosition: text("dual_position").default(null),
  price: integer("price").notNull(),
  startingPrice: integer("starting_price").default(null),
  avgScore: real("avg_score").notNull().default(0),
  last3Avg: real("last3_avg").notNull().default(0),
  last5Avg: real("last5_avg").notNull().default(0),
  seasonTotal: integer("season_total").notNull().default(0),
  gamesPlayed: integer("games_played").notNull().default(0),
  ownedByPercent: real("owned_by_percent").notNull().default(0),
  formTrend: text("form_trend").notNull().default("stable"),
  injuryStatus: text("injury_status").default(null),
  nextOpponent: text("next_opponent").default(null),
  byeRound: integer("bye_round").default(null),
  venue: text("venue").default(null),
  gameTime: text("game_time").default(null),
  projectedScore: real("projected_score").default(null),
  projectedFloor: real("projected_floor").default(null),
  priceChange: integer("price_change").notNull().default(0),
  breakEven: integer("break_even").default(null),
  ceilingScore: integer("ceiling_score").default(null),
  isNamedTeam: boolean("is_named_team").notNull().default(true),
  selectionStatus: text("selection_status").notNull().default("unknown"),
  lateChange: boolean("late_change").notNull().default(false),
  consistencyRating: real("consistency_rating").default(null),
  scoreStdDev: real("score_std_dev").default(null),
  recentScores: text("recent_scores").default(null),
  isDebutant: boolean("is_debutant").notNull().default(false),
  debutRound: integer("debut_round").default(null),
  cashGenPotential: text("cash_gen_potential").default(null),
  age: integer("age").default(null),
  yearsExperience: integer("years_experience").default(null),
  durabilityScore: real("durability_score").default(null),
  injuryRiskScore: real("injury_risk_score").default(null),
  volatilityScore: real("volatility_score").default(null),
  captainProbability: real("captain_probability").default(null),
  aflFantasyId: integer("afl_fantasy_id").default(null),
  breakoutScore: real("breakout_score").default(null),
  tagRisk: real("tag_risk").default(null),
  isExpectedTagger: boolean("is_expected_tagger").notNull().default(false),
  avgTog: real("avg_tog").default(null),
  seasonCba: real("season_cba").default(null),
  ppm: real("ppm").default(null),
});

export const weeklyStats = pgTable("weekly_stats", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  round: integer("round").notNull(),
  opponent: text("opponent").default(null),
  venue: text("venue").default(null),
  fantasyScore: real("fantasy_score").notNull().default(0),
  timeOnGroundPercent: real("time_on_ground_percent").default(null),
  centreBounceAttendancePercent: real("centre_bounce_attendance_percent").default(null),
  kickCount: integer("kick_count").default(null),
  handballCount: integer("handball_count").default(null),
  markCount: integer("mark_count").default(null),
  tackleCount: integer("tackle_count").default(null),
  hitouts: integer("hitouts").default(null),
  goalsKicked: integer("goals_kicked").default(null),
  behindsKicked: integer("behinds_kicked").default(null),
  freesAgainst: integer("frees_against").default(null),
  inside50s: integer("inside_50s").default(null),
  rebound50s: integer("rebound_50s").default(null),
  contestedPossessions: integer("contested_possessions").default(null),
  uncontestedPossessions: integer("uncontested_possessions").default(null),
  subFlag: boolean("sub_flag").notNull().default(false),
  disposalEfficiency: real("disposal_efficiency").default(null),
  metresGained: integer("metres_gained").default(null),
  clearances: integer("clearances").default(null),
  scoreInvolvements: integer("score_involvements").default(null),
  pressureActs: integer("pressure_acts").default(null),
  contestedMarks: integer("contested_marks").default(null),
  interceptMarks: integer("intercept_marks").default(null),
  groundBallGets: integer("ground_ball_gets").default(null),
  supercoachScore: real("supercoach_score").default(null),
  ratingPoints: real("rating_points").default(null),
});

export const teamContext = pgTable("team_context", {
  id: serial("id").primaryKey(),
  team: text("team").notNull(),
  round: integer("round").notNull(),
  disposalCount: integer("disposal_count").default(null),
  clearanceCount: integer("clearance_count").default(null),
  contestedPossessionRate: real("contested_possession_rate").default(null),
  paceFactor: real("pace_factor").default(null),
  fantasyPointsScored: real("fantasy_points_scored").default(null),
  fantasyPointsConceded: real("fantasy_points_conceded").default(null),
  metresGained: integer("metres_gained").default(null),
  supercoachScore: real("supercoach_score").default(null),
  inside50s: integer("inside_50s").default(null),
  tackleCount: integer("tackle_count").default(null),
  hitouts: integer("hitouts").default(null),
  ratingPoints: real("rating_points").default(null),
});

export const positionConcessions = pgTable("position_concessions", {
  id: serial("id").primaryKey(),
  team: text("team").notNull(),
  position: text("position").notNull(),
  avgPointsConceded: real("avg_points_conceded").default(null),
  stdDevConceded: real("std_dev_conceded").default(null),
});

export const projections = pgTable("projections", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  round: integer("round").notNull(),
  projectedScore: real("projected_score").default(null),
  projectedFloor: real("projected_floor").default(null),
  projectedCeiling: real("projected_ceiling").default(null),
  volatilityScore: real("volatility_score").default(null),
  confidenceScore: real("confidence_score").default(null),
});

export const myTeamPlayers = pgTable("my_team_players", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id"),
  playerId: integer("player_id").notNull(),
  isOnField: boolean("is_on_field").notNull().default(true),
  isCaptain: boolean("is_captain").notNull().default(false),
  isViceCaptain: boolean("is_vice_captain").notNull().default(false),
  fieldPosition: text("field_position").notNull(),
});

export const tradeRecommendations = pgTable("trade_recommendations", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id"),
  playerOutId: integer("player_out_id").notNull(),
  playerInId: integer("player_in_id").notNull(),
  reason: text("reason").notNull(),
  confidence: real("confidence").notNull().default(0),
  priceChange: integer("price_change").notNull().default(0),
  scoreDifference: real("score_difference").notNull().default(0),
  tradeEv: real("trade_ev").default(null),
  category: text("category").notNull().default("upgrade"),
  urgency: text("urgency").notNull().default("medium"),
  projectedImpact: real("projected_impact").default(null),
  cashImpact: integer("cash_impact").default(null),
  seasonTradeGain: real("season_trade_gain").default(null),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const leagueSettings = pgTable("league_settings", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id"),
  teamName: text("team_name").notNull().default("My Team"),
  salaryCap: integer("salary_cap").notNull().default(18300000),
  currentRound: integer("current_round").notNull().default(1),
  tradesRemaining: integer("trades_remaining").notNull().default(2),
  totalTradesUsed: integer("total_trades_used").notNull().default(0),
});

export const intelReports = pgTable("intel_reports", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  priority: text("priority").notNull().default("medium"),
  playerNames: text("player_names").default(null),
  source: text("source").default(null),
  sourceUrl: text("source_url").default(null),
  actionable: boolean("actionable").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const lateChanges = pgTable("late_changes", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  changeType: text("change_type").notNull(),
  details: text("details").notNull(),
  round: integer("round").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const intelSources = pgTable("intel_sources", {
  id: serial("id").primaryKey(),
  sourceType: text("source_type").notNull(),
  sourceUrl: text("source_url").default(null),
  title: text("title").notNull(),
  rawContent: text("raw_content").notNull(),
  processedInsights: text("processed_insights").default(null),
  relevantPlayerNames: text("relevant_player_names").default(null),
  round: integer("round").default(null),
  isProcessed: boolean("is_processed").notNull().default(false),
  isActionable: boolean("is_actionable").notNull().default(false),
  fetchedAt: timestamp("fetched_at").defaultNow(),
  processedAt: timestamp("processed_at").default(null),
});

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const teamTagProfiles = pgTable("team_tag_profiles", {
  id: serial("id").primaryKey(),
  team: text("team").notNull(),
  usesTaggers: boolean("uses_taggers").notNull().default(false),
  tagFrequency: real("tag_frequency").notNull().default(0),
  primaryTagger: text("primary_tagger").default(null),
  primaryTaggerPlayerId: integer("primary_tagger_player_id").default(null),
  secondaryTagger: text("secondary_tagger").default(null),
  notes: text("notes").default(null),
  season: integer("season").notNull().default(2026),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const tagMatchupHistory = pgTable("tag_matchup_history", {
  id: serial("id").primaryKey(),
  round: integer("round").notNull(),
  season: integer("season").notNull().default(2026),
  taggerTeam: text("tagger_team").notNull(),
  taggerName: text("tagger_name").notNull(),
  targetName: text("target_name").notNull(),
  targetTeam: text("target_team").notNull(),
  targetPlayerId: integer("target_player_id").default(null),
  targetNormalAvg: real("target_normal_avg").default(null),
  targetTaggedScore: real("target_tagged_score").default(null),
  scoreImpact: real("score_impact").default(null),
  source: text("source").default(null),
  confirmed: boolean("confirmed").notNull().default(false),
});

export const tagPredictionOutcomes = pgTable("tag_prediction_outcomes", {
  id: serial("id").primaryKey(),
  round: integer("round").notNull(),
  season: integer("season").notNull().default(2026),
  playerId: integer("player_id").notNull(),
  playerName: text("player_name").notNull(),
  team: text("team").notNull(),
  opponent: text("opponent").notNull(),
  predictedRiskLevel: text("predicted_risk_level").notNull(),
  predictedTagger: text("predicted_tagger").default(null),
  wasActuallyTagged: boolean("was_actually_tagged").default(null),
  actualScore: real("actual_score").default(null),
  playerAvgAtTime: real("player_avg_at_time").default(null),
  predictedImpact: real("predicted_impact").default(null),
  actualImpact: real("actual_impact").default(null),
  outcomeAccurate: boolean("outcome_accurate").default(null),
  notes: text("notes").default(null),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  evaluatedAt: timestamp("evaluated_at").default(null),
});

export const insertTagPredictionOutcomeSchema = createInsertSchema(tagPredictionOutcomes).omit({ id: true, createdAt: true });

export const playerAlerts = pgTable("player_alerts", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  playerId: integer("player_id"),
  playerName: text("player_name").notNull(),
  alertType: text("alert_type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  priority: text("priority").notNull().default("medium"),
  isRead: boolean("is_read").notNull().default(false),
  sourceReportId: integer("source_report_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPlayerAlertSchema = createInsertSchema(playerAlerts).omit({ id: true, createdAt: true });

export const insertPlayerSchema = createInsertSchema(players).omit({ id: true });
export const insertMyTeamPlayerSchema = createInsertSchema(myTeamPlayers).omit({ id: true });
export const insertTradeRecSchema = createInsertSchema(tradeRecommendations).omit({ id: true, createdAt: true });
export const insertLeagueSettingsSchema = createInsertSchema(leagueSettings).omit({ id: true });
export const insertIntelReportSchema = createInsertSchema(intelReports).omit({ id: true, createdAt: true });
export const insertLateChangeSchema = createInsertSchema(lateChanges).omit({ id: true, createdAt: true });
export const insertIntelSourceSchema = createInsertSchema(intelSources).omit({ id: true, fetchedAt: true, processedAt: true });
export const insertWeeklyStatSchema = createInsertSchema(weeklyStats).omit({ id: true });
export const insertTeamContextSchema = createInsertSchema(teamContext).omit({ id: true });
export const insertPositionConcessionSchema = createInsertSchema(positionConcessions).omit({ id: true });
export const insertProjectionSchema = createInsertSchema(projections).omit({ id: true });

export type Player = typeof players.$inferSelect;
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type MyTeamPlayer = typeof myTeamPlayers.$inferSelect;
export type InsertMyTeamPlayer = z.infer<typeof insertMyTeamPlayerSchema>;
export type TradeRecommendation = typeof tradeRecommendations.$inferSelect;
export type InsertTradeRec = z.infer<typeof insertTradeRecSchema>;
export type LeagueSettings = typeof leagueSettings.$inferSelect;
export type InsertLeagueSettings = z.infer<typeof insertLeagueSettingsSchema>;
export type IntelReport = typeof intelReports.$inferSelect;
export type InsertIntelReport = z.infer<typeof insertIntelReportSchema>;
export type LateChange = typeof lateChanges.$inferSelect;
export type InsertLateChange = z.infer<typeof insertLateChangeSchema>;
export type IntelSource = typeof intelSources.$inferSelect;
export type InsertIntelSource = z.infer<typeof insertIntelSourceSchema>;
export type WeeklyStat = typeof weeklyStats.$inferSelect;
export type InsertWeeklyStat = z.infer<typeof insertWeeklyStatSchema>;
export type TeamContextType = typeof teamContext.$inferSelect;
export type InsertTeamContext = z.infer<typeof insertTeamContextSchema>;
export type PositionConcession = typeof positionConcessions.$inferSelect;
export type InsertPositionConcession = z.infer<typeof insertPositionConcessionSchema>;
export type Projection = typeof projections.$inferSelect;
export type InsertProjection = z.infer<typeof insertProjectionSchema>;
export type TagPredictionOutcome = typeof tagPredictionOutcomes.$inferSelect;
export type InsertTagPredictionOutcome = z.infer<typeof insertTagPredictionOutcomeSchema>;
export type PlayerAlert = typeof playerAlerts.$inferSelect;
export type InsertPlayerAlert = z.infer<typeof insertPlayerAlertSchema>;

export type PlayerWithTeamInfo = Player & {
  isOnField?: boolean;
  isCaptain?: boolean;
  isViceCaptain?: boolean;
  fieldPosition?: string;
  myTeamPlayerId?: number;
  lastRoundScore?: number | null;
  lastRoundNumber?: number | null;
};

export type TradeRecommendationWithPlayers = TradeRecommendation & {
  playerOut: Player;
  playerIn: Player;
};

export const fixtures = pgTable("fixtures", {
  id: serial("id").primaryKey(),
  round: integer("round").notNull(),
  roundName: text("round_name").notNull(),
  homeTeam: text("home_team").notNull(),
  awayTeam: text("away_team").notNull(),
  venue: text("venue").notNull(),
  date: text("date").notNull(),
  localTime: text("local_time").notNull(),
  homeScore: integer("home_score").default(null),
  awayScore: integer("away_score").default(null),
  complete: integer("complete").notNull().default(0),
  winner: text("winner").default(null),
  timeStr: text("time_str").default(null),
  year: integer("year").notNull().default(2026),
  squiggleId: integer("squiggle_id").notNull().unique(),
});

export const modelWeights = pgTable("model_weights", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: real("value").notNull(),
  description: text("description").default(null),
  category: text("category").notNull().default("general"),
});

export const seasonPlans = pgTable("season_plans", {
  id: serial("id").primaryKey(),
  generatedAt: timestamp("generated_at").defaultNow(),
  currentRound: integer("current_round").notNull().default(1),
  teamSnapshot: text("team_snapshot").notNull(),
  overallStrategy: text("overall_strategy").notNull(),
  weeklyPlans: text("weekly_plans").notNull(),
  totalProjectedScore: integer("total_projected_score").default(null),
  isActive: boolean("is_active").notNull().default(true),
});

export const insertSeasonPlanSchema = createInsertSchema(seasonPlans).omit({ id: true, generatedAt: true });
export type SeasonPlan = typeof seasonPlans.$inferSelect;
export type InsertSeasonPlan = z.infer<typeof insertSeasonPlanSchema>;

export const insertFixtureSchema = createInsertSchema(fixtures).omit({ id: true });
export type Fixture = typeof fixtures.$inferSelect;
export type InsertFixture = z.infer<typeof insertFixtureSchema>;

export const insertModelWeightSchema = createInsertSchema(modelWeights).omit({ id: true });
export const insertTeamTagProfileSchema = createInsertSchema(teamTagProfiles).omit({ id: true, updatedAt: true });
export const insertTagMatchupHistorySchema = createInsertSchema(tagMatchupHistory).omit({ id: true });
export type ModelWeight = typeof modelWeights.$inferSelect;
export type InsertModelWeight = z.infer<typeof insertModelWeightSchema>;
export type TeamTagProfile = typeof teamTagProfiles.$inferSelect;
export type InsertTeamTagProfile = z.infer<typeof insertTeamTagProfileSchema>;
export type TagMatchupHistory = typeof tagMatchupHistory.$inferSelect;
export type InsertTagMatchupHistory = z.infer<typeof insertTagMatchupHistorySchema>;

export const savedTeams = pgTable("saved_teams", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id"),
  name: text("name").notNull(),
  description: text("description").default(null),
  playerData: text("player_data").notNull(),
  teamValue: integer("team_value").notNull().default(0),
  projectedScore: integer("projected_score").default(null),
  isActive: boolean("is_active").notNull().default(false),
  source: text("source").notNull().default("manual"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const leagueOpponents = pgTable("league_opponents", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id"),
  leagueName: text("league_name").notNull(),
  opponentName: text("opponent_name").notNull(),
  playerData: text("player_data").default(null),
  totalScore: integer("total_score").default(null),
  lastRoundScore: integer("last_round_score").default(null),
  notes: text("notes").default(null),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSavedTeamSchema = createInsertSchema(savedTeams).omit({ id: true, createdAt: true });
export const insertLeagueOpponentSchema = createInsertSchema(leagueOpponents).omit({ id: true, createdAt: true });
export type SavedTeam = typeof savedTeams.$inferSelect;
export type InsertSavedTeam = z.infer<typeof insertSavedTeamSchema>;
export type LeagueOpponent = typeof leagueOpponents.$inferSelect;
export type InsertLeagueOpponent = z.infer<typeof insertLeagueOpponentSchema>;

export * from "./models/auth";
