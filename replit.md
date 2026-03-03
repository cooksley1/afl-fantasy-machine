# AFL Fantasy Trade Advisor

## Overview
A Fantasy AFL assistant app that helps users manage their fantasy football team, analyze player form, and get AI-powered trade recommendations and strategic intelligence to win their league. Incorporates advanced AFL Fantasy concepts: captain loophole strategy, DPP exploitation, break-even price analysis, late change monitoring, and rolling lockout decision trees.

## Tech Stack
- **Frontend**: React + TypeScript, Vite, Tailwind CSS, Shadcn UI, TanStack React Query, Wouter routing
- **Backend**: Express.js, Node.js
- **Database**: PostgreSQL with Drizzle ORM
- **AI**: OpenAI (via Replit AI Integrations) for intel generation and trade analysis
- **Styling**: Custom navy/gold AFL-themed color scheme with dark mode support

## Architecture
- `shared/schema.ts` - Drizzle schemas and TypeScript types for Players (with DPP, BE, venue, gameTime, projectedScore, ceilingScore, priceChange, lateChange, isNamedTeam), MyTeamPlayers, TradeRecommendations, LeagueSettings, IntelReports, LateChanges, Conversations, Messages
- `server/db.ts` - Database connection pool
- `server/storage.ts` - DatabaseStorage class implementing IStorage interface
- `server/routes.ts` - Express API routes (all prefixed with /api)
- `server/seed.ts` - Seeds database with 43 real AFL players (with DPP, venues, game times, BEs, ceilings) and a starting team
- `server/intel-engine.ts` - AI-powered intelligence engine using OpenAI for strategic analysis including captain loophole decision trees, DPP exploitation, break-even arbitrage, and trade recommendations
- `client/src/App.tsx` - Main app with sidebar navigation and routing
- `client/src/pages/` - Dashboard, MyTeam, Players, Trades, FormGuide, IntelHub, Settings pages
- `client/src/components/` - AppSidebar, ThemeToggle, ErrorState

## Key Strategic Features
1. **Captain Loophole Strategy** - Dashboard shows VC/C picks across game time slots with decision tree logic (rolling lockout exploitation)
2. **DPP (Dual Position Player) Tracking** - Players with dual position eligibility shown with badges, exploited in trade analysis
3. **Break-Even Analysis** - BE column in player list (green = scoring above BE / rising, red = below / falling)
4. **Late Change Alerts** - Dashboard alerts for injured, late change, or unnamed players
5. **Price Movement Tracking** - Price change indicators (+/-) shown on player cards
6. **Projected Scores & Ceiling Scores** - Used by AI for optimized captain/trade decisions
7. **Venue & Game Time Data** - Ground-specific analysis and rolling lockout slot awareness

## Pages
1. **Dashboard** - Team overview, projected score, captain loophole strategy (VC/C), late change alerts, top performers, suggested trades
2. **My Team** - View/manage roster by position (DEF/MID/RUC/FWD), set captain/VC, remove players
3. **Players** - Browse all players with DPP badges, break-even, price changes, venue info, search/filter/sort
4. **Trade Centre** - Quick algorithmic + AI-powered deep trade recommendations (with BE arbitrage, DPP value, bye coverage), execute trades
5. **Form Guide** - Hot/cold players, top scorers, rising stars with team filtering
6. **Intel Hub** - AI-powered strategic intelligence: captain loophole analysis, cash cows, DPP exploitation, break-even arbitrage, bye strategy, POD players, breakout candidates, ground/conditions analysis, tactical insights, late change risk
7. **Settings** - Configure team name, salary cap, current round, trades remaining

## API Endpoints
- `GET /api/players` - All players (includes DPP, BE, venue, gameTime, projectedScore, ceilingScore, priceChange)
- `GET /api/my-team` - Current team with player details
- `POST /api/my-team` - Add player to team
- `DELETE /api/my-team/:id` - Remove player
- `POST /api/my-team/:id/captain` - Set captain
- `POST /api/my-team/:id/vice-captain` - Set vice captain
- `GET /api/trade-recommendations` - List recommendations
- `POST /api/trade-recommendations/generate` - Generate quick recommendations (algorithmic)
- `POST /api/trade-recommendations/generate-ai` - Generate AI-powered deep trade analysis (with BE, DPP, loophole factors)
- `POST /api/trade-recommendations/:id/execute` - Execute a trade
- `GET /api/settings` - Get league settings
- `PATCH /api/settings` - Update settings
- `GET /api/intel` - Get all intel reports
- `GET /api/intel/:category` - Get intel by category (validated)
- `POST /api/intel/generate` - Generate new AI intel reports (10-14 reports with loophole/DPP/BE analysis)
- `GET /api/captain-advice` - AI-powered captain loophole analysis with decision tree
- `POST /api/players/refresh-data` - Refresh player data with DPP, venues, game times, BEs, ceilings

## Intel Categories
injuries, cash_cows, captain_picks, bye_strategy, pod_players, breakout, premium_trades, ground_conditions, tactical, historical

## Database
PostgreSQL with tables: players, my_team_players, trade_recommendations, league_settings, intel_reports, late_changes, conversations, messages, users

## Environment
- `AI_INTEGRATIONS_OPENAI_API_KEY` - OpenAI API key (via Replit integrations)
- `AI_INTEGRATIONS_OPENAI_BASE_URL` - OpenAI base URL (via Replit integrations)
- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Session secret
