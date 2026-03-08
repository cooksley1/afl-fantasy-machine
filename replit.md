# AFL Fantasy Machine

## Overview
A mobile-first Fantasy AFL advisor app providing AI-powered insights, trade recommendations, and strategic intelligence for managing fantasy football teams. Its core purpose is to enhance user decision-making through features like captain loophole strategies, DPP exploitation, break-even analysis, volatility-based projections, Trade EV calculations, late change monitoring, and AI-driven team analysis and scouting reports, automating live data gathering and supporting rolling lockout decision trees.

## User Preferences
- I prefer clear and concise explanations.
- I like to be informed before major architectural changes or significant code refactors.
- I prefer an iterative development approach with regular updates on progress.
- Ensure the application is always mobile-first and responsive.
- I prefer a dark mode for the application interface.
- Do not make changes to files in the `server/services/__tests__/` directory.
- Do not make changes to the `vitest.config.ts` file.

## System Architecture
The application features a mobile-first, responsive design with a custom navy/gold AFL-themed color scheme and dark mode support.

### Authentication
Replit Auth (OpenID Connect) handles authentication for Google, Apple, GitHub, X, and email/password. All API routes, except authentication endpoints, are protected. User sessions are stored in a PostgreSQL `sessions` table.

### Frontend
Built with React, TypeScript, Vite, Tailwind CSS, Shadcn UI, TanStack React Query, and Wouter for routing. Key pages include Dashboard, MyTeam, Players, Trades, FormGuide, IntelHub, TeamAnalyzer, PlayerReport, LiveScores, Settings, Admin, and Landing. Player avatars utilize AFL Fantasy API headshots or team-colored placeholders. A 3-step onboarding wizard guides new users through welcome, league settings, and team import options. The application incorporates detailed player availability and selection status logic, providing alerts for injuries, omissions, and emergencies.

### Backend
An Express.js and Node.js server manages API requests, file uploads, and service integrations.

### Database
PostgreSQL with Drizzle ORM stores all application data, including player statistics, projections, user teams, and intelligence reports.

### AI Integration
Utilizes OpenAI GPT-4o-mini for text analysis and GPT-4o for vision and screenshot analysis, leveraging Replit AI Integrations.

### Core Features
- **Projection Engine**: Calculates player projections, volatility, and Trade EV using configurable weights.
- **Simulation Engine**: Provides Monte Carlo simulations for round scores.
- **Trade Engine**: Offers comprehensive trade recommendations based on various factors and phase-specific strategies.
- **Tag Intelligence System**: Provides evidence-based tag warnings by analyzing team tag profiles and historical matchup data.
- **Data Gathering**: Automates fetching live data from Squiggle API, AFL.com.au, and AFL club news feeds.
- **Live Scores**: Tracks live match statuses and fantasy scores, with automated data fetching from Footywire and Squiggle API (fallback). Scores are fetched from Footywire first; if no stats found, falls back to Squiggle player stats endpoint.
- **Season Schedule**: Fetches and displays the full AFL season fixture. Completed/live matches are clickable — tapping opens an AI-generated fantasy synopsis dialog showing top performers, key observations (role changes, injuries, tagging, breakouts, busts), and a link to match highlights.
- **Player Data Management**: Loads and reconciles player data, recalculating averages and breakevens.
- **Team Upload & Analyser**: Allows users to upload team screenshots for AI analysis and saving identified players.
- **Trade Optimizer**: Evaluates trades based on Points EV, Price EV, and Strategic EV.
- **Season Planner**: Algorithmically builds optimal 30-man squads and generates comprehensive 24-round strategy documents with player narratives, trade reasoning, and winner benchmarks. `buildOptimalTeam` accepts optional `excludePlayerIds` and `variationSeed` for generating distinct team variants.
- **Team Lab (Sandbox)**: Save, create, compare, and swap between multiple team configurations. AI-built teams exclude ~40% of current premiums and use seeded scoring variation to generate genuinely different alternatives. Compare any saved team side-by-side with the active team showing player overlaps, score diffs, and value diffs. Activate any saved team to make it the main team.
- **Game Day Guide**: Step-by-step transfer checklist for updating the official AFL Fantasy app. Lists trades (out→in), captain/VC picks, field/bench swaps needed, and numbered instructions. Copy-to-clipboard and Web Share API support. Checkable items stored in localStorage.
- **League Spy**: Track opponents across multiple fantasy leagues. Add opponents manually or bulk-import an entire league from a ladder screenshot. Upload opponent team screenshots for AI analysis, then get matchup breakdowns: projected advantage, unique picks each side, captain differential tips, and weekly win strategy advice. Includes a league ladder view with positions, total scores, last round scores, and the user's own team highlighted.
- **PWA Support**: Installable as a mobile app via manifest.json and service worker. Supports "Add to Home Screen" on iOS and Android. Static assets cached for offline use; API calls are never cached.

### New DB Tables (Team Lab / League Spy)
- `saved_teams`: id, name, description, playerData (JSON), teamValue, projectedScore, isActive, source, createdAt
- `league_opponents`: id, leagueName, opponentName, playerData (JSON), totalScore, lastRoundScore, notes, createdAt

### New API Routes
- `GET/POST /api/saved-teams` — list and create saved teams
- `POST /api/saved-teams/from-wizard` — AI-build a new team variant without changing active team
- `PUT/DELETE /api/saved-teams/:id` — update/delete saved teams
- `POST /api/saved-teams/:id/activate` — activate a saved team (loads into my_team_players)
- `GET /api/saved-teams/:id/compare` — compare saved team vs active team
- `GET/POST /api/league/opponents` — list and create league opponents
- `PUT/DELETE /api/league/opponents/:id` — update/delete opponents
- `POST /api/league/import-screenshot` — upload league ladder screenshot for AI extraction
- `POST /api/league/import-bulk` — bulk-create opponents from extracted league data
- `POST /api/league/opponents/:id/analyze-screenshot` — upload opponent team screenshot
- `GET /api/league/opponents/:id/matchup` — matchup analysis vs your team
- `GET /api/game-day-guide` — generate game day transfer checklist
- `GET /api/weekly-plan` — synthesized weekly coaching directive with prioritized steps

### New Frontend Pages
- `/sandbox` — Team Lab (saved teams management, comparison, activation)
- `/game-day` — Game Day Guide (transfer checklist with copy/share)
- `/league` — League Spy (opponent tracking, screenshot upload, matchup analysis)

## External Dependencies
- **OpenAI API**: For GPT-4o-mini (text analysis) and GPT-4o (vision/screenshot analysis).
- **Squiggle API**: Provides AFL fixtures, tips, and ladder data.
- **AFL.com.au RSS**: Source for official AFL news.
- **Google News RSS**: Gathers news from all 18 AFL club feeds.
- **AFL Fantasy API**: Used for player headshot photos.
- **DTLive (dtlive.com.au)**: Scraped for player prices, ownership %, and scores.
- **PostgreSQL**: The primary database for all application data.