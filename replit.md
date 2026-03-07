# AFL Fantasy Machine

## Overview
A mobile-first Fantasy AFL advisor app providing AI-powered insights, trade recommendations, and strategic intelligence for managing fantasy football teams. It features captain loophole strategies, DPP exploitation, break-even analysis, volatility-based projections, Trade EV calculations, late change monitoring, and AI-driven team analysis and scouting reports. The app automates live data gathering and supports rolling lockout decision trees to enhance user decision-making.

## User Preferences
- I prefer clear and concise explanations.
- I like to be informed before major architectural changes or significant code refactors.
- I prefer an iterative development approach with regular updates on progress.
- Ensure the application is always mobile-first and responsive.
- I prefer a dark mode for the application interface.
- Do not make changes to files in the `server/services/__tests__/` directory.
- Do not make changes to the `vitest.config.ts` file.

## System Architecture
The application follows a mobile-first, responsive design with a custom navy/gold AFL-themed color scheme, supporting dark mode.

### Authentication
Uses Replit Auth (OpenID Connect) supporting Google, Apple, GitHub, X, and email/password login. Auth files in `server/replit_integrations/auth/`. User model in `shared/models/auth.ts` with `isAdmin` and `isBlocked` fields. All `/api/*` routes (except auth endpoints) are protected with `isAuthenticated` middleware. Blocked users receive 403. Admin middleware checks `isAdmin` flag. Session stored in PostgreSQL `sessions` table. Impersonation supported for admin users.

### Feedback System
Users can send feedback via dialog in sidebar. Feedback stored in `feedback` table. Admins can view, respond, archive, and delete feedback from the Admin panel.

### Frontend
Developed with React, TypeScript, Vite, Tailwind CSS, Shadcn UI for components, TanStack React Query for data fetching, and Wouter for routing. Key pages include Dashboard, MyTeam, Players, Trades, FormGuide, IntelHub, TeamAnalyzer, PlayerReport, LiveScores, Settings, Admin, and Landing. Player avatars are displayed with headshot photos from the AFL Fantasy API, falling back to team-colored placeholders. Landing page shown to logged-out users. Admin page accessible only to admin users via sidebar link.

### Backend
An Express.js and Node.js server handles API requests, file uploads via Multer, and integrates with various services.

### Database
PostgreSQL with Drizzle ORM manages all application data, including players, weekly statistics, team context, projections, model weights, user teams, trade recommendations, league settings, intelligence reports, and user conversations.

### AI Integration
Utilizes OpenAI GPT-4o-mini for text analysis and GPT-4o for vision and screenshot analysis, integrated via Replit AI Integrations.

### Core Features and Implementations
- **Projection Engine**: `server/services/projection-engine.ts` calculates player projections, floors, ceilings, volatility, captain probabilities, consistency ratings, and Trade EV using configurable weights stored in the `ModelWeights` table. It includes advanced metrics like age, durability, injury risk, and a breakout score.
- **Simulation Engine**: `server/services/simulation-engine.ts` provides Monte Carlo simulations (10,000 iterations) for round scores, offering expected, median, floor, ceiling, and standard deviation analyses.
- **Trade Engine**: `server/services/trade-engine.ts` offers comprehensive trade recommendations based on over 20 factors, categorizing trades as urgent, upgrade, cash generation, or structural. It supports phase-specific trade strategies for different parts of the season.
- **Tag Intelligence System**: `server/services/tag-intelligence.ts` provides evidence-based tag warnings by analyzing `teamTagProfiles` and `tagMatchupHistory` tables, cross-referencing with live RSS feeds for keyword detection. Historical tag records are filtered by current team (`sameTeamHistory`) so players who changed clubs don't get spurious warnings from old-team data. Includes prediction outcome tracking via `tagPredictionOutcomes` table — admin can save pre-round predictions, evaluate post-round accuracy, and view overall accuracy stats via `/api/admin/tag-predictions/*` routes.
- **FAQ Page**: `client/src/pages/faq.tsx` provides a comprehensive FAQ with 20 questions covering scoring rules, projections, tag intelligence, trade engine, breakeven, live scores, bye rounds, captain strategy, loophole, price changes, positions, team analyzer, consistency ratings, simulation engine, data sources, and Intel Hub. Uses accordion UI grouped by category.
- **Data Gathering**: `server/data-gatherer.ts` fetches live data from Squiggle API, AFL.com.au RSS, and 18 AFL club Google News feeds. This process is automated via `server/scheduler.ts` on a 4-hour cycle.
- **Live Scores**: `server/services/live-scores.ts` tracks live match statuses and fantasy scores, with round navigation (prev/next), manual bulk entry, per-player quick edit, and auto-fetch from Footywire (same source as fitzRoy R / pyAFL Python packages). `weekly_stats` table includes `goals_kicked`, `behinds_kicked`, `frees_against` columns. Match expansion shows ALL players from both teams (not just user's team), with user's players highlighted. `POST /api/live-scores/fetch-scores` scrapes Footywire for individual player match stats (K, HB, M, T, G, B, HO, FA, AF Fantasy score, SC score). Auto-adds missing players to the `players` table when encountered on Footywire, with position inferred from stats (hitouts→RUC, goals→FWD, rebound50s→DEF, else MID). Opening Round context message when round=0. `currentRound` defaults to 0 for Opening Round.
- **Season Schedule**: `server/services/fixture-service.ts` fetches full 2026 AFL season fixture data from Squiggle API on startup. Stores in `fixtures` table (207 games). `client/src/pages/schedule.tsx` shows the full schedule with round navigation, team badges, scores, and bye team display. Round 0 = "Opening Round" (not practice matches).
- **Player Data Management**: `server/expand-players.ts` loads and reconciles 780 real 2026 AFL players with seed data. Includes `repairPlayerData()` that runs on startup to fix missing byeRound, venue, startingPrice, breakEven, and clears fake recentScores only for rookies (gamesPlayed=0). `recalculatePlayerAverages()` runs on startup and after Footywire score imports — recalculates avgScore, last3Avg, last5Avg, gamesPlayed, seasonTotal, breakEven, and formTrend from actual `weekly_stats` data for all players with at least one game score. Breakeven formula: `BE = round(initialBE + ((24 - gamesPlayed) / 14) × (initialBE - avgScore))` where `initialBE = startingPrice / 10490`. Pre-season (0 games): `BE = round(startingPrice / 10490)`.
- **FantasySports.win Scraper**: `server/services/fantasysports-scraper.ts` scrapes breakeven data from fantasysports.win as a secondary BE source. Admin route `POST /api/admin/sync-fantasysports`.
- **Team Colors**: `client/src/lib/afl-teams.ts` defines all 18 AFL team colors with `primary` (card body), `secondary` (name bar background), `text` (text on primary), and `secondaryText` (text on secondary/name bar) to ensure readable contrast on all card elements.
- **Team Analyzer Save**: Users can upload a team screenshot to `/analyze`, get AI analysis, then click "Save as My Team" to save identified players to their account. Backend at `POST /api/my-team/save-from-analyzer` matches player names to DB and replaces the current team.

## External Dependencies
- **OpenAI API**: For GPT-4o-mini (text analysis) and GPT-4o (vision/screenshot analysis).
- **Squiggle API**: Provides AFL fixtures, tips, and ladder data.
- **AFL.com.au RSS**: Source for official AFL news.
- **Google News RSS**: Gathers news from all 18 AFL club feeds.
- **AFL Fantasy API**: Used for player headshot photos.
- **DTLive (dtlive.com.au)**: Scraped for real player prices, ownership %, price changes, and per-round scores. `server/services/dtlive-scraper.ts` fetches data on startup and every 4 hours via the scheduler. Admin can manually trigger via `POST /api/admin/sync-dtlive`.
- **PostgreSQL**: The primary database for all application data.