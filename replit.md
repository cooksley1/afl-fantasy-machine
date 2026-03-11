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

### Authentication & User Isolation
Replit Auth (OpenID Connect) handles authentication for Google, Apple, GitHub, X, and email/password. All API routes, except authentication endpoints, are protected. User sessions are stored in a PostgreSQL `sessions` table.

**User data isolation**: All user-scoped tables (`my_team_players`, `trade_recommendations`, `league_settings`, `saved_teams`, `league_opponents`) include a `userId` column. All storage methods and route handlers pass `userId` from the session to ensure each user's data is isolated.

**Admin impersonation**: Admin users can impersonate other users via `POST /api/admin/impersonate/:id` and `POST /api/admin/stop-impersonation`. The impersonated userId is stored in `req.session.impersonateUserId`. Routes use `getEffectiveUserId(req)` which returns the impersonated user if set, otherwise the real user. An amber banner is shown in the frontend when impersonation is active.

**User details**: The `users` table captures `replitUsername`, `lastLoginAt`, `loginCount`, `lastUserAgent`, and `lastIpAddress` on login via the auth callback.

### Frontend
Built with React, TypeScript, Vite, Tailwind CSS, Shadcn UI, TanStack React Query, and Wouter for routing. Key pages include Dashboard, MyTeam, Players, Trades, FormGuide, IntelHub, TeamAnalyzer, PlayerReport, LiveScores, Settings, Admin, Landing, and DreamTeam. Player avatars utilize AFL Fantasy API headshots or team-colored placeholders. A 3-step onboarding wizard guides new users through welcome, league settings, and team import options. The application incorporates detailed player availability and selection status logic, providing alerts for injuries, omissions, and emergencies.

### My Team Player Management
Tapping any player on the My Team page opens an action dialog with:
- **View Report** — navigate to full player analysis
- **Swap with Teammate** — swap positions/field-bench status with an eligible teammate (validates position eligibility via player.position and dualPosition)
- **Replace with Database Player** — replace with any eligible player from the full database (filtered by position and salary cap budget)
- **Set Captain / Vice Captain** — assign captaincy roles
- **Remove from Team** — delete player with confirmation
API routes: `PATCH /api/my-team/:id`, `POST /api/my-team/swap`, `POST /api/my-team/:id/replace`. Storage method: `updateMyTeamPlayer(id, data)`.

### Backend
An Express.js and Node.js server manages API requests, file uploads, and service integrations.

### Database
PostgreSQL with Drizzle ORM stores all application data, including player statistics, projections, user teams, and intelligence reports.

### AI Integration
Utilizes OpenAI GPT-4o-mini for text analysis and GPT-4o for vision and screenshot analysis, leveraging Replit AI Integrations. AI prompts use smart player selection (`selectRelevantPlayers`) and compact summaries (`buildCompactPlayerSummary`) to stay within the 128K token context window — only the top ~200 most relevant players (by score, form, cash cow potential, DPP, injury status) are sent rather than all 800+.

### Core Features
- **Projection Engine**: Calculates player projections, volatility, and Trade EV using configurable weights.
- **Simulation Engine**: Provides Monte Carlo simulations for round scores.
- **Trade Engine**: Offers comprehensive trade recommendations based on various factors and phase-specific strategies.
- **Tag Intelligence System**: Provides evidence-based tag warnings by analyzing team tag profiles and historical matchup data.
- **Fixture Sync**: On startup, fetches real fixtures from Squiggle API, stores in `fixtures` table, then syncs all player records (nextOpponent, venue, gameTime) from Squiggle data. Team name mapping handles Squiggle→app differences (e.g. "Greater Western Sydney"→"GWS Giants"). Venue names normalised (e.g. "M.C.G."→"MCG", "Docklands"→"Marvel Stadium").
- **Player Alerts**: Cross-references intel reports against users' team players. When an intel report mentions a player on your team (by name matching), generates a typed alert (injury/late_change/selection/role_change/news). Alerts are generated after every intel processing cycle. Frontend shows a notification bell in the sidebar header with unread count badge; tapping opens the `/alerts` page. Alerts auto-refresh every 60 seconds. Table: `player_alerts`. Routes: `GET /api/player-alerts`, `GET /api/player-alerts/count`, `PATCH /api/player-alerts/:id/read`, `POST /api/player-alerts/read-all`, `POST /api/player-alerts/check`. Backend: `server/alert-generator.ts`.
- **Data Gathering**: Automates fetching live data from Squiggle API, AFL.com.au, and AFL club news feeds.
- **Live Scores**: Tracks live match statuses and fantasy scores. Three-source pipeline: Footywire (detailed stats), Squiggle (supplemental), then DTLive (fantasy scores only, fills gaps). Completed round detection uses league settings (currentRound) as primary + Squiggle as supplemental. Historical round data is fetched once and stored — not re-fetched on restarts.
- **Season Schedule**: Fetches and displays the full AFL season fixture. Completed/live matches are clickable — tapping opens an AI-generated fantasy synopsis dialog showing top performers, key observations (role changes, injuries, tagging, breakouts, busts), and a link to match highlights.
- **Player Data Management**: Loads and reconciles player data, recalculating averages and breakevens.
- **Team Upload & Analyser**: Allows users to upload team screenshots for AI analysis and saving identified players. OCR uses GPT-4o vision with strict prompting to avoid hallucinated players. Fuzzy matching uses Levenshtein distance with tight thresholds (max 25% of name length), with improved disambiguation for duplicate surnames (e.g. two Carrolls, two Lindsays) by matching first-name initials before falling back to full-name Levenshtein. DB prices are the source of truth — screenshot prices are not used to override DB values. A "Clear Team" button (with confirmation dialog) allows users to wipe their entire team and re-upload fresh. "Load Glen's Team" loads a preset squad ($17.611M) matching the user's current AFL Fantasy Classic team.
- **Trade Optimizer**: Evaluates trades based on Points EV, Price EV, and Strategic EV.
- **Season Planner**: Algorithmically builds optimal 30-man squads and generates comprehensive 24-round strategy documents with player narratives, trade reasoning, and winner benchmarks. `buildOptimalTeam` accepts optional `excludePlayerIds` and `variationSeed` for generating distinct team variants.
- **Dream Team Reverse Engineer**: Builds the best possible 30-player squad ignoring the salary cap, then reverse-engineers a budget-compliant starting team using stepping-stone cash cows. Generates a round-by-round trade path showing when each upgrade becomes affordable via cash generation. API: `GET /api/dream-team/reverse-engineer`, `POST /api/dream-team/activate-starting`. UI at `/dream` with three tabs: Dream Team, Starting Squad, Trade Path Timeline.
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
- `DELETE /api/my-team` — clear entire team (remove all players)
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
- **DTLive (dtlive.com.au)**: Scraped for player prices, ownership %, and scores (230 top players).
- **Footywire (footywire.com)**: Scraped for comprehensive AFL Fantasy prices (791 players). Requires browser User-Agent header. Admin route: `POST /api/players/sync-footywire`.
- **AFL Fantasy Price Sync**: `syncAflFantasyPrices()` in `expand-players.ts` syncs prices from the AFL Fantasy API. Admin route: `POST /api/players/sync-prices`.
- **AflTables (afltables.com)**: Scraped for historical player stats (2024-2025 seasons). Provides games played, time on ground, disposals, tackles, clearances, goals, marks, durability scores, and years of experience. Admin route: `POST /api/players/sync-afltables`.
- **PostgreSQL**: The primary database for all application data.