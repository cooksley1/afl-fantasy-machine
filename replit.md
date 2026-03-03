# AFL Fantasy Machine

## Overview
A mobile-first Fantasy AFL advisor app that helps users manage their fantasy football team, analyze player form, and get AI-powered trade recommendations and strategic intelligence. Features include: captain loophole strategy with P(120+) probability model, DPP exploitation, break-even price analysis, volatility-based projections, Trade EV formula, late change monitoring, screenshot-based team analysis via GPT-4o vision, per-player AI scouting reports, automated live data gathering from Squiggle API and AFL.com.au RSS, and rolling lockout decision trees.

## Tech Stack
- **Frontend**: React + TypeScript, Vite, Tailwind CSS, Shadcn UI, TanStack React Query, Wouter routing
- **Backend**: Express.js, Node.js, multer (file uploads)
- **Database**: PostgreSQL with Drizzle ORM
- **AI**: OpenAI GPT-4o-mini (text analysis), GPT-4o (vision/screenshot analysis) via Replit AI Integrations
- **Data Sources**: Squiggle API (fixtures, tips, ladder), AFL.com.au RSS, all 18 AFL club feeds via Google News RSS, Melbourne FC official RSS, Fantasy-specific news feeds
- **Styling**: Custom navy/gold AFL-themed color scheme with dark mode support, mobile-first responsive design
- **Testing**: Vitest for unit tests (server/services/__tests__/)

## Architecture
- `shared/schema.ts` - Drizzle schemas for Players, WeeklyStats, TeamContext, PositionConcessions, Projections, ModelWeights, MyTeamPlayers, TradeRecommendations, LeagueSettings, IntelReports, IntelSources, LateChanges, Conversations, Messages, Users
- `server/services/projection-engine.ts` - All projection/scoring calculation functions with configurable weights: normalCDF, bayesianAdjustedAvg, calcProjectedFloor, calcProjectedCeiling, calcVolatilityScore, calcCaptainProbability, calcConsistencyRating, calcTradeEV, calcTradeRankingScore, calcTradeConfidence, calcBlendedProjection, classifyCashGeneration, isDebutantCandidate, generateRecentScores, generateAge, generateYearsExperience, generateDurabilityScore, generateInjuryRiskScore
- `server/services/__tests__/projection-engine.test.ts` - 85 unit tests covering all calculation functions
- `vitest.config.ts` - Vitest config for server-side unit tests
- `server/db.ts` - Database connection pool
- `server/storage.ts` - DatabaseStorage class implementing IStorage interface with full CRUD for all tables
- `server/routes.ts` - Express API routes (all prefixed with /api), uses projection-engine service functions
- `server/seed.ts` - Seeds database with initial 51 AFL players and a starting team
- `server/expand-players.ts` - Loads 780 real 2026 AFL players from JSON, seeds model weights, calculates advanced metrics using projection-engine service
- `server/real-players-2026.json` - 780 parsed players from official DFS Australia Excel file
- `server/intel-engine.ts` - AI-powered intelligence engine with enriched data
- `server/data-gatherer.ts` - Live data fetching from Squiggle API, AFL.com.au RSS, all 18 AFL club Google News feeds
- `server/scheduler.ts` - Automated 4-hour intelligence gathering cycle
- `client/src/App.tsx` - Main app with sidebar navigation, mobile header branding, and routing
- `client/src/pages/` - Dashboard, MyTeam, Players, Trades, FormGuide, IntelHub, TeamAnalyzer, PlayerReport, Settings pages
- `client/src/components/` - AppSidebar, ThemeToggle, ErrorState

## Data Model
### Players Table (795 players from 18 AFL teams)
Core fields: name, team, position, dualPosition, price, startingPrice, avgScore, last3Avg, last5Avg, seasonTotal, gamesPlayed, ownedByPercent, formTrend, injuryStatus, nextOpponent, byeRound, venue, gameTime, priceChange, breakEven, isNamedTeam, lateChange, isDebutant, debutRound, cashGenPotential, recentScores
Advanced metrics: projectedScore (Bayesian-adjusted), projectedFloor, ceilingScore (volatility-derived), consistencyRating, scoreStdDev, volatilityScore, captainProbability (P(score>=120) via normal CDF), age, yearsExperience, durabilityScore, injuryRiskScore

### ModelWeights Table (40 configurable weights)
- key (unique text), value (real), description, category (projection/captain/consistency/trade/debutant)
- All projection and scoring formulas read weights from this table via getCachedWeights()
- Weights cached in memory, rebuilt on startup and on any PUT update

### Supporting Tables
- **weeklyStats** - Per-round performance metrics
- **teamContext** - Team-level context data per round
- **positionConcessions** - Matchup model: avgPointsConceded, stdDevConceded per team/position
- **projections** - Formal projection engine output per player/round

## Projection Model (All Weights Configurable via model_weights table)
1. **Bayesian-Adjusted Average**: last2Est × bayesian_last2_weight + prev3Est × bayesian_prev3_weight (default 0.6/0.4)
2. **Volatility-Based Range**: Floor = Proj - (floor_sigma_multiplier × StdDev), Ceiling = Proj + (ceiling_sigma_multiplier × StdDev)
3. **Captain Probability**: P(score >= captain_threshold) using normal CDF (default threshold=120)
4. **Trade EV Formula**: (ProjDiff × trade_ev_proj_multiplier) - (VolPenalty × trade_ev_vol_penalty) + (CashGen × trade_ev_cashgen_multiplier)
5. **Consistency Rating**: CV-inverse (consistency_cv_weight) + avg factor (consistency_avg_weight) → 1-10 scale
6. **Trade Confidence**: Base + EV bonus + form bonus + trend bonuses + injury/DPP bonuses, capped at confidence_max

## API Endpoints
- `GET /api/players` - All players with advanced metrics
- `GET /api/players/:id` - Single player
- `GET /api/players/:id/report` - AI scouting report
- `GET /api/my-team` - Current team with player details
- `POST /api/my-team` - Add player to team
- `DELETE /api/my-team/:id` - Remove player
- `POST /api/my-team/:id/captain` - Set captain
- `POST /api/my-team/:id/vice-captain` - Set vice captain
- `POST /api/my-team/analyze` - AI full team analysis
- `GET /api/trade-recommendations` - List recommendations (with Trade EV)
- `POST /api/trade-recommendations/generate` - Generate Trade EV-powered recommendations
- `POST /api/trade-recommendations/generate-ai` - AI-powered deep trade analysis
- `POST /api/trade-recommendations/:id/execute` - Execute a trade
- `GET /api/settings` - Get league settings
- `PATCH /api/settings` - Update settings
- `GET /api/intel` - All intel reports
- `GET /api/intel/:category` - Intel by category
- `POST /api/intel/generate` - Generate AI intel
- `POST /api/intel/gather` - Trigger live data gathering
- `GET /api/intel/sources` - Recent gathered sources
- `GET /api/intel/sources/stats` - Source statistics
- `POST /api/intel/pre-game` - Pre-game lockout advice
- `GET /api/captain-advice` - Captain loophole analysis with P(120+)
- `POST /api/analyze-screenshot` - Screenshot vision analysis
- `POST /api/players/refresh-data` - Refresh player data
- `GET /api/late-changes` - Late changes for current round
- `POST /api/late-changes` - Create late change
- `GET /api/scheduler/status` - Scheduler status
- `GET /api/weekly-stats/:playerId` - Player weekly stats
- `GET /api/team-context` - All team contexts
- `GET /api/position-concessions` - All position concessions
- `GET /api/position-concessions/:team` - Position concessions by team
- `GET /api/projections/:playerId` - Player projections
- `GET /api/model-weights` - All configurable model weights
- `GET /api/model-weights/:key` - Single weight by key
- `PUT /api/model-weights/:key` - Update a single weight (rebuilds cache)
- `PUT /api/model-weights` - Batch update weights (array of {key, value})

## Database
PostgreSQL with tables: players, weekly_stats, team_context, position_concessions, projections, model_weights, my_team_players, trade_recommendations, league_settings, intel_reports, intel_sources, late_changes, conversations, messages, users

## Environment
- `AI_INTEGRATIONS_OPENAI_API_KEY` - OpenAI API key (via Replit integrations)
- `AI_INTEGRATIONS_OPENAI_BASE_URL` - OpenAI base URL (via Replit integrations)
- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Session secret

## Startup Sequence
1. Express server starts
2. `seedModelWeights()` - Seeds/loads 40 configurable weights from model_weights table
3. `seedDatabase()` - Creates initial data if DB is empty
4. `expandPlayerDatabase()` - Loads 780 real players from real-players-2026.json
5. `populateConsistencyData()` - Generates consistency ratings, debutant flags, advanced metrics (all using configurable weights)
6. `populateBaselineData()` - Seeds position concessions and team context baselines
7. `registerRoutes()` - Sets up all API endpoints
8. `startScheduler()` - Begins automated 4-hour data gathering cycle

## Unit Tests (85 tests via Vitest)
Run with: `npx vitest run --config vitest.config.ts`
Covers: normalCDF, bayesianAdjustedAvg, calcProjectedFloor, calcProjectedCeiling, calcVolatilityScore, calcCaptainProbability, calcConsistencyRating, calcTradeEV, calcTradeRankingScore, calcTradeConfidence, calcBlendedProjection, classifyCashGeneration, isDebutantCandidate, generateRecentScores, generateAge, generateYearsExperience, generateDurabilityScore, generateInjuryRiskScore, buildWeightConfig
