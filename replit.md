# AFL Fantasy Trade Advisor

## Overview
A Fantasy AFL assistant app that helps users manage their fantasy football team, analyze player form, and get AI-powered trade recommendations to win their league.

## Tech Stack
- **Frontend**: React + TypeScript, Vite, Tailwind CSS, Shadcn UI, TanStack React Query, Wouter routing
- **Backend**: Express.js, Node.js
- **Database**: PostgreSQL with Drizzle ORM
- **Styling**: Custom navy/gold AFL-themed color scheme with dark mode support

## Architecture
- `shared/schema.ts` - Drizzle schemas and TypeScript types for Players, MyTeamPlayers, TradeRecommendations, LeagueSettings
- `server/db.ts` - Database connection pool
- `server/storage.ts` - DatabaseStorage class implementing IStorage interface
- `server/routes.ts` - Express API routes (all prefixed with /api)
- `server/seed.ts` - Seeds database with 43 real AFL players and a starting team
- `client/src/App.tsx` - Main app with sidebar navigation and routing
- `client/src/pages/` - Dashboard, MyTeam, Players, Trades, FormGuide, Settings pages
- `client/src/components/` - AppSidebar, ThemeToggle

## Features
1. **Dashboard** - Team overview with projected score, salary cap, top performers, suggested trades
2. **My Team** - View/manage roster by position (DEF/MID/RUC/FWD), set captain/VC, remove players
3. **Players** - Browse all players with search, team/position filters, sort by avg/price/form
4. **Trade Centre** - Generate AI-powered trade recommendations, execute trades
5. **Form Guide** - Hot/cold players, top scorers, rising stars with team filtering
6. **Settings** - Configure team name, salary cap, current round, trades remaining

## API Endpoints
- `GET /api/players` - All players
- `GET /api/my-team` - Current team with player details
- `POST /api/my-team` - Add player to team
- `DELETE /api/my-team/:id` - Remove player
- `POST /api/my-team/:id/captain` - Set captain
- `POST /api/my-team/:id/vice-captain` - Set vice captain
- `GET /api/trade-recommendations` - List recommendations
- `POST /api/trade-recommendations/generate` - Generate new recommendations
- `POST /api/trade-recommendations/:id/execute` - Execute a trade
- `GET /api/settings` - Get league settings
- `PATCH /api/settings` - Update settings

## Database
PostgreSQL with tables: players, my_team_players, trade_recommendations, league_settings, users
