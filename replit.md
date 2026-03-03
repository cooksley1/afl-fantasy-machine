# AFL Fantasy Trade Advisor

## Overview
A Fantasy AFL assistant app that helps users manage their fantasy football team, analyze player form, and get AI-powered trade recommendations and strategic intelligence to win their league.

## Tech Stack
- **Frontend**: React + TypeScript, Vite, Tailwind CSS, Shadcn UI, TanStack React Query, Wouter routing
- **Backend**: Express.js, Node.js
- **Database**: PostgreSQL with Drizzle ORM
- **AI**: OpenAI (via Replit AI Integrations) for intel generation and trade analysis
- **Styling**: Custom navy/gold AFL-themed color scheme with dark mode support

## Architecture
- `shared/schema.ts` - Drizzle schemas and TypeScript types for Players, MyTeamPlayers, TradeRecommendations, LeagueSettings, IntelReports, Conversations, Messages
- `server/db.ts` - Database connection pool
- `server/storage.ts` - DatabaseStorage class implementing IStorage interface
- `server/routes.ts` - Express API routes (all prefixed with /api)
- `server/seed.ts` - Seeds database with 43 real AFL players and a starting team
- `server/intel-engine.ts` - AI-powered intelligence engine using OpenAI for strategic analysis and trade recommendations
- `client/src/App.tsx` - Main app with sidebar navigation and routing
- `client/src/pages/` - Dashboard, MyTeam, Players, Trades, FormGuide, IntelHub, Settings pages
- `client/src/components/` - AppSidebar, ThemeToggle, ErrorState

## Features
1. **Dashboard** - Team overview with projected score, salary cap, top performers, suggested trades
2. **My Team** - View/manage roster by position (DEF/MID/RUC/FWD), set captain/VC, remove players
3. **Players** - Browse all players with search, team/position filters, sort by avg/price/form
4. **Trade Centre** - Quick algorithmic + AI-powered deep trade recommendations, execute trades
5. **Form Guide** - Hot/cold players, top scorers, rising stars with team filtering
6. **Intel Hub** - AI-powered strategic intelligence: captain picks, cash cows, injuries, bye strategy, POD players, breakout candidates, ground/conditions analysis, tactical insights
7. **Settings** - Configure team name, salary cap, current round, trades remaining

## API Endpoints
- `GET /api/players` - All players
- `GET /api/my-team` - Current team with player details
- `POST /api/my-team` - Add player to team
- `DELETE /api/my-team/:id` - Remove player
- `POST /api/my-team/:id/captain` - Set captain
- `POST /api/my-team/:id/vice-captain` - Set vice captain
- `GET /api/trade-recommendations` - List recommendations
- `POST /api/trade-recommendations/generate` - Generate quick recommendations (algorithmic)
- `POST /api/trade-recommendations/generate-ai` - Generate AI-powered deep trade analysis
- `POST /api/trade-recommendations/:id/execute` - Execute a trade
- `GET /api/settings` - Get league settings
- `PATCH /api/settings` - Update settings
- `GET /api/intel` - Get all intel reports
- `GET /api/intel/:category` - Get intel by category
- `POST /api/intel/generate` - Generate new AI intel reports

## Intel Categories
injuries, cash_cows, captain_picks, bye_strategy, pod_players, breakout, premium_trades, ground_conditions, tactical, historical

## Database
PostgreSQL with tables: players, my_team_players, trade_recommendations, league_settings, intel_reports, conversations, messages, users

## Environment
- `AI_INTEGRATIONS_OPENAI_API_KEY` - OpenAI API key (via Replit integrations)
- `AI_INTEGRATIONS_OPENAI_BASE_URL` - OpenAI base URL (via Replit integrations)
- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Session secret
