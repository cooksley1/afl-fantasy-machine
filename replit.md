# AFL Fantasy Machine

## Overview
A mobile-first Fantasy AFL advisor app that helps users manage their fantasy football team, analyze player form, and get AI-powered trade recommendations and strategic intelligence. Features include: captain loophole strategy, DPP exploitation, break-even price analysis, late change monitoring, screenshot-based team analysis via GPT-4o vision, per-player AI scouting reports, automated live data gathering from Squiggle API and AFL.com.au RSS, and rolling lockout decision trees.

## Tech Stack
- **Frontend**: React + TypeScript, Vite, Tailwind CSS, Shadcn UI, TanStack React Query, Wouter routing
- **Backend**: Express.js, Node.js, multer (file uploads)
- **Database**: PostgreSQL with Drizzle ORM
- **AI**: OpenAI GPT-4o-mini (text analysis), GPT-4o (vision/screenshot analysis) via Replit AI Integrations
- **Data Sources**: Squiggle API (fixtures, tips, ladder), AFL.com.au RSS, all 18 AFL club feeds via Google News RSS, Melbourne FC official RSS, Fantasy-specific news feeds
- **Styling**: Custom navy/gold AFL-themed color scheme with dark mode support, mobile-first responsive design

## Architecture
- `shared/schema.ts` - Drizzle schemas and TypeScript types for Players (with DPP, BE, venue, gameTime, projectedScore, ceilingScore, priceChange, lateChange, isNamedTeam), MyTeamPlayers, TradeRecommendations, LeagueSettings, IntelReports, IntelSources, LateChanges, Conversations, Messages, Users
- `server/db.ts` - Database connection pool
- `server/storage.ts` - DatabaseStorage class implementing IStorage interface
- `server/routes.ts` - Express API routes (all prefixed with /api)
- `server/seed.ts` - Seeds database with initial AFL players and a starting team
- `server/expand-players.ts` - Expands database to 780 real 2026 AFL players across all 18 teams with prices, DPP, bye rounds, venues, and game times
- `server/real-players-2026.json` - 780 parsed players from official DFS Australia Excel file
- `server/intel-engine.ts` - AI-powered intelligence engine using OpenAI for strategic analysis including captain loophole decision trees, DPP exploitation, break-even arbitrage, trade recommendations, screenshot team analysis, full team analysis with per-player verdicts, and individual player scouting reports
- `server/data-gatherer.ts` - Live data fetching from Squiggle API, AFL.com.au RSS, all 18 AFL club Google News feeds (Adelaide, Brisbane, Carlton, Collingwood, Essendon, Fremantle, Geelong, Gold Coast, GWS, Hawthorn, Melbourne, North Melbourne, Port Adelaide, Richmond, St Kilda, Sydney, West Coast, Western Bulldogs), Melbourne FC official RSS, fantasy-specific news searches; AI processing of raw sources into actionable fantasy insights; pre-game advice generation
- `server/scheduler.ts` - Automated 4-hour intelligence gathering cycle, starts 30s after boot
- `client/src/App.tsx` - Main app with sidebar navigation, mobile header branding, and routing
- `client/src/pages/` - Dashboard, MyTeam, Players, Trades, FormGuide, IntelHub, TeamAnalyzer, PlayerReport, Settings pages
- `client/src/components/` - AppSidebar, ThemeToggle, ErrorState

## Key Strategic Features
1. **Captain Loophole Strategy** - Dashboard shows VC/C picks across game time slots with decision tree logic (rolling lockout exploitation)
2. **DPP (Dual Position Player) Tracking** - 95 players with dual position eligibility shown with badges, exploited in trade analysis
3. **Break-Even Analysis** - BE column in player list (green = scoring above BE / rising, red = below / falling)
4. **Late Change Alerts** - Dashboard alerts for injured, late change, or unnamed players
5. **Price Movement Tracking** - Price change indicators (+/-) shown on player cards
6. **Projected Scores & Ceiling Scores** - Used by AI for optimized captain/trade decisions
7. **Venue & Game Time Data** - Ground-specific analysis and rolling lockout slot awareness
8. **Screenshot Team Analysis** - Upload team screenshot for GPT-4o vision analysis with player identification and strategy recommendations
9. **Live Data Gathering** - Automated Squiggle API + AFL RSS fetching every 4 hours with AI processing
10. **Pre-Game Advice** - Final trade/captain advice before lockout with player alerts

## Pages
1. **Dashboard** - Team overview, projected score, captain loophole strategy (VC/C), late change alerts, top performers, suggested trades
2. **My Team** - View/manage roster by position (DEF/MID/RUC/FWD), set captain/VC, remove players, AI "Analyse Team" button with per-player verdicts (keep/trade/sell/must_have/monitor), click any player for full AI scouting report
3. **Players** - Browse all 780 players with DPP badges, break-even, price changes, venue info, search/filter/sort (card layout on mobile)
4. **Trade Centre** - Quick algorithmic + AI-powered deep trade recommendations (with BE arbitrage, DPP value, bye coverage), execute trades
5. **Form Guide** - Hot/cold players, top scorers, rising stars with team filtering
6. **Intel Hub** - AI-powered strategic intelligence + live data gathering from all 18 AFL clubs, Squiggle, AFL.com.au, fantasy news + pre-game lockout advice, source stats dashboard, 12 category filters
7. **Team Analyzer** - Upload team screenshot for AI-powered analysis using GPT-4o vision (player identification, strategy recommendations, trade suggestions)
8. **Player Report** - Per-player AI scouting report with form, price, fixtures, captaincy, DPP, comparisons, risks
9. **Settings** - Configure team name, salary cap, current round, trades remaining

## API Endpoints
- `GET /api/players` - All 780 players (includes DPP, BE, venue, gameTime, projectedScore, ceilingScore, priceChange)
- `GET /api/players/:id` - Single player
- `GET /api/players/:id/report` - AI scouting report for a player
- `GET /api/my-team` - Current team with player details
- `POST /api/my-team` - Add player to team
- `DELETE /api/my-team/:id` - Remove player
- `POST /api/my-team/:id/captain` - Set captain
- `POST /api/my-team/:id/vice-captain` - Set vice captain
- `POST /api/my-team/analyze` - AI full team analysis with per-player verdicts
- `GET /api/trade-recommendations` - List recommendations
- `POST /api/trade-recommendations/generate` - Generate quick recommendations (algorithmic)
- `POST /api/trade-recommendations/generate-ai` - Generate AI-powered deep trade analysis
- `POST /api/trade-recommendations/:id/execute` - Execute a trade
- `GET /api/settings` - Get league settings
- `PATCH /api/settings` - Update settings
- `GET /api/intel` - Get all intel reports
- `GET /api/intel/:category` - Get intel by category
- `POST /api/intel/generate` - Generate new AI intel reports (10-14 reports)
- `POST /api/intel/gather` - Trigger live data gathering from external sources
- `GET /api/intel/sources` - Recent gathered source data
- `GET /api/intel/sources/stats` - Source statistics
- `POST /api/intel/pre-game` - Generate pre-game lockout advice
- `GET /api/captain-advice` - AI-powered captain loophole analysis with decision tree
- `POST /api/analyze-screenshot` - Upload team screenshot for GPT-4o vision analysis
- `POST /api/players/refresh-data` - Refresh player data
- `GET /api/late-changes` - Get late changes for current round
- `POST /api/late-changes` - Create late change alert
- `GET /api/scheduler/status` - Scheduler running status

## Intel Categories
injuries, cash_cows, captain_picks, bye_strategy, pod_players, breakout, premium_trades, ground_conditions, tactical, historical, team_selection, fixtures

## Database
PostgreSQL with tables: players, my_team_players, trade_recommendations, league_settings, intel_reports, intel_sources, late_changes, conversations, messages, users

## Environment
- `AI_INTEGRATIONS_OPENAI_API_KEY` - OpenAI API key (via Replit integrations)
- `AI_INTEGRATIONS_OPENAI_BASE_URL` - OpenAI base URL (via Replit integrations)
- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Session secret

## Startup Sequence
1. Express server starts
2. `seedDatabase()` - Creates initial data if DB is empty
3. `expandPlayerDatabase()` - Loads 780 real players from JSON
4. `registerRoutes()` - Sets up all API endpoints
5. `startScheduler()` - Begins automated 4-hour data gathering cycle
