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

## Architecture
- `shared/schema.ts` - Drizzle schemas for Players (with advanced metrics: volatilityScore, captainProbability, projectedFloor, age, yearsExperience, durabilityScore, injuryRiskScore, startingPrice), WeeklyStats, TeamContext, PositionConcessions, Projections, MyTeamPlayers, TradeRecommendations (with tradeEv), LeagueSettings, IntelReports, IntelSources, LateChanges, Conversations, Messages, Users
- `server/db.ts` - Database connection pool
- `server/storage.ts` - DatabaseStorage class implementing IStorage interface
- `server/routes.ts` - Express API routes (all prefixed with /api)
- `server/seed.ts` - Seeds database with initial AFL players and a starting team
- `server/expand-players.ts` - Expands database with real 2026 AFL players, calculates advanced metrics (volatility, captain probability via normal CDF, Bayesian-adjusted projections, Trade EV, floor/ceiling from std dev, age/experience/durability generation)
- `server/real-players-2026.json` - 780 parsed players from official DFS Australia Excel file
- `server/intel-engine.ts` - AI-powered intelligence engine with enriched data (includes volatility, P(120+), floor/ceiling, durability in player summaries for AI context)
- `server/data-gatherer.ts` - Live data fetching from Squiggle API, AFL.com.au RSS, all 18 AFL club Google News feeds, fantasy-specific news
- `server/scheduler.ts` - Automated 4-hour intelligence gathering cycle, starts 30s after boot
- `client/src/App.tsx` - Main app with sidebar navigation, mobile header branding, and routing
- `client/src/pages/` - Dashboard, MyTeam, Players, Trades, FormGuide, IntelHub, TeamAnalyzer, PlayerReport, Settings pages
- `client/src/components/` - AppSidebar, ThemeToggle, ErrorState

## Data Model (Optimised for Overall Rank)
### Players Table
Core fields: name, team, position, dualPosition, price, startingPrice, avgScore, last3Avg, last5Avg, seasonTotal, gamesPlayed, ownedByPercent, formTrend, injuryStatus, nextOpponent, byeRound, venue, gameTime, priceChange, breakEven, isNamedTeam, lateChange, isDebutant, debutRound, cashGenPotential, recentScores
Advanced metrics: projectedScore (Bayesian-adjusted), projectedFloor, ceilingScore (volatility-derived), consistencyRating, scoreStdDev, volatilityScore, captainProbability (P(score>=120) via normal CDF), age, yearsExperience, durabilityScore, injuryRiskScore

### Supporting Tables
- **weeklyStats** - Per-round performance: fantasyScore, timeOnGroundPercent, centreBounceAttendancePercent, kickCount, handballCount, markCount, tackleCount, hitouts, inside50s, rebound50s, contestedPossessions, uncontestedPossessions, subFlag
- **teamContext** - Team-level: disposalCount, clearanceCount, contestedPossessionRate, paceFactor, fantasyPointsScored, fantasyPointsConceded
- **positionConcessions** - Matchup model: avgPointsConceded, stdDevConceded per team/position
- **projections** - Formal projection engine output: projectedScore, projectedFloor, projectedCeiling, volatilityScore, confidenceScore

## Projection Model
1. **Bayesian-Adjusted Average**: last2Est × 0.6 + prev3Est × 0.4 (catches breakout role shifts faster)
2. **Volatility-Based Range**: Floor = Proj - (1.0 × StdDev), Ceiling = Proj + (1.3 × StdDev)
3. **Captain Probability**: P(score >= 120) using normal CDF - ranks by probability, not average
4. **Trade EV Formula**: (ProjDiff × 3) - (VolatilityPenalty × 0.5) + (CashGenValue × 0.2). EV > 30 = strong, 15-30 = marginal, < 15 = luxury
5. **Consistency Rating**: CV-inverse (0.6 weight) + avg factor (0.4 weight) → 1-10 scale
6. **Durability Score**: Based on age, injury history (3yr games / possible games proxy)

## Key Strategic Features
1. **Captain Probability Model** - P(120+) calculated via normal distribution, shown on dashboard and player cards
2. **Captain Loophole Strategy** - Dashboard shows VC/C picks across game time slots with decision tree logic
3. **Trade EV Formula** - Algorithmic trade scoring: EV > 30 (strong), 15-30 (marginal)
4. **DPP (Dual Position Player) Tracking** - 95 players with dual position eligibility
5. **Break-Even Analysis** - BE column (green = rising, red = falling)
6. **Volatility-Based Projections** - Floor/ceiling derived from std dev, not static values
7. **Late Change Alerts** - Dashboard alerts for injured, late change, or unnamed players
8. **Screenshot Team Analysis** - Upload team screenshot for GPT-4o vision analysis
9. **Live Data Gathering** - Automated Squiggle API + AFL RSS fetching every 4 hours
10. **Player Demographics** - Age, years experience, durability, injury risk scores

## Pages
1. **Dashboard** - Team overview, projected score, captain loophole with P(120+), late change alerts
2. **My Team** - Roster management, AI analysis with per-player verdicts
3. **Players** - Browse all players with advanced stats (range floor-ceiling, P120, consistency), search/filter/sort
4. **Trade Centre** - Trade EV-powered recommendations, AI-powered deep analysis
5. **Form Guide** - Hot/cold, top, rising, consistent, debutants tabs
6. **Intel Hub** - AI intelligence + live data from 135+ sources
7. **Team Analyzer** - Screenshot upload for GPT-4o vision analysis
8. **Player Report** - Full scouting report with 12 stat cards (avg, proj, floor, ceiling, P120, volatility, age, durability, injury risk, owned, BE)
9. **Settings** - Configure team name, salary cap, round, trades

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
- `POST /api/intel/generate` - Generate AI intel (10-14 reports)
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

## Database
PostgreSQL with tables: players, weekly_stats, team_context, position_concessions, projections, my_team_players, trade_recommendations, league_settings, intel_reports, intel_sources, late_changes, conversations, messages, users

## Environment
- `AI_INTEGRATIONS_OPENAI_API_KEY` - OpenAI API key (via Replit integrations)
- `AI_INTEGRATIONS_OPENAI_BASE_URL` - OpenAI base URL (via Replit integrations)
- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Session secret

## Startup Sequence
1. Express server starts
2. `seedDatabase()` - Creates initial data if DB is empty
3. `expandPlayerDatabase()` - Loads real players from real-players-2026.json
4. `populateConsistencyData()` - Generates consistency ratings, debutant flags, AND advanced metrics (volatility, captain probability, Bayesian projections, floor/ceiling, age, durability, injury risk)
5. `populateBaselineData()` - Seeds position concessions (18 teams × 4 positions) and team context baseline data
6. `registerRoutes()` - Sets up all API endpoints
7. `startScheduler()` - Begins automated 4-hour data gathering cycle

## Advanced Analytics System
- **Captain Probability**: P(score >= 120) via normal CDF with player's projected score and std dev
- **Bayesian Adjustment**: Last 2 rounds weighted 0.6, previous 3 weighted 0.4 (catches role shifts early)
- **Volatility Score**: 0-10 scale from coefficient of variation (stdDev / avg × 40)
- **Projected Floor**: projectedScore - (1.0 × stdDev)
- **Projected Ceiling**: projectedScore + (1.3 × stdDev)
- **Trade EV**: (ProjDiff × 3) - (VolPenalty × 0.5) + (CashGen × 0.2)
- **Consistency Rating**: 1-10 using CV-inverse (0.6) + avg factor capped at 110 (0.4)
- **Debutant Detection**: Base price (<=$150K) 70% chance, rookie (<=$250K) 40% chance
- **Cash Generation**: elite/high/medium/low based on scoring above break-even
- **Durability Score**: 0-1 based on age and injury history
- **Injury Risk**: 0-1 inverse of durability with age/injury adjustments
