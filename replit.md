# AFL Fantasy Machine

## Overview
A mobile-first Fantasy AFL advisor app providing AI-powered insights, trade recommendations, and strategic intelligence for managing fantasy football teams. Its core purpose is to enhance user decision-making through features like captain loophole strategies, DPP exploitation, break-even analysis, volatility-based projections, Trade EV calculations, late change monitoring, and AI-driven team analysis and scouting reports. The project aims to automate live data gathering and support rolling lockout decision trees, offering a significant market advantage by providing comprehensive, AI-powered fantasy football management tools.

## User Preferences
- I prefer clear and concise explanations.
- I like to be informed before major architectural changes or significant code refactors.
- I prefer an iterative development approach with regular updates on progress.
- Ensure the application is always mobile-first and responsive.
- I prefer a dark mode for the application interface.
- Do not make changes to files in the `server/services/__tests__/` directory.
- Do not make changes to the `vitest.config.ts` file.

## Versioning Rule (MANDATORY)
**Bump the version number with EVERY update.** The version is displayed in `client/src/components/app-sidebar.tsx` (look for `data-testid="text-app-version"`). Use semantic versioning:
- **Patch** (e.g. 2.6.0 → 2.6.1): Bug fixes, data fixes, minor tweaks, matching improvements.
- **Minor** (e.g. 2.6.1 → 2.7.0): New features, new UI components, new data sources, new pages.
- **Major** (e.g. 2.7.0 → 3.0.0): Breaking changes, major redesigns, architecture overhauls.
Current version: **v2.10.5**. Always update this line in replit.md when bumping.

## AFL Fantasy Classic 2026 Rules (from fantasy.afl.com.au)
- **Squad**: 30 players. 22 on-field (6 DEF, 8 MID, 2 RUC, 6 FWD). 8 bench (2 DEF, 2 MID, 1 RUC, 2 FWD, 1 UTIL). Up to 4 emergencies.
- **Utility**: UTIL is a BENCH-ONLY position. Can hold any position (DEF/MID/RUC/FWD). Never on-field. `isOnField` always false for UTIL.
- **Scoring**: Kick 3, Handball 2, Mark 3, Tackle 4, Hitout 1, Goal 6, Behind 1, Free For 1, Free Against -3.
- **Trades**: Standard rounds 2, Early Bye rounds (R2-R4) 2, Regular Bye rounds (R12-R14) 3. Starts Round 2.
- **Bye Rounds**: Early Byes R2-R4, Regular Byes R12-R14. Both use Best-18 scoring (top 18 on-field scores count).
- **TOG Threshold**: 50% — below may be replaced by higher-scoring emergency. Captain below 50%: doubled score = higher of Captain/VC. Emergencies never doubled.
- **Positions**: SPP (single), DPP (dual, permanent), TPP (triple, new 2026, permanent).
- **Rolling Lockout**: Players lock at real match start. Unlocked players remain tradeable.
- **Opening Round (R0)**: Not a Fantasy round. No lockouts, no scores count. Contributes to first price change.
- **Price Changes**: After Round 1. Recent performance weighted more. Opening Round contributes.
- **Leagues H2H**: Win 4pts, Tie 2pts, Loss 0pts.
- **Advanced Trade-Editing**: Revise/reverse saved trades. Rollback available pre-lockout. No player traded out and back in same round.
- **Salary Cap**: $18.3M.

## System Architecture
The application features a mobile-first, responsive design with a custom navy/gold AFL-themed color scheme and dark mode support.

### Authentication & User Isolation
Replit Auth (OpenID Connect) manages authentication. All API routes, except authentication endpoints, are protected. User sessions are stored in a PostgreSQL `sessions` table. User data isolation is enforced through `userId` columns in all user-scoped tables and by passing `userId` from the session to storage methods and route handlers. Admin users can impersonate other users, with the system indicating active impersonation in the frontend.

### Frontend
Built with React, TypeScript, Vite, Tailwind CSS, Shadcn UI, TanStack React Query, and Wouter for routing. Shared utilities in `client/src/lib/player-utils.ts` (formatPrice, formatPriceChange, getTeamColour). Key pages include Dashboard, MyTeam, Players, Trades, FormGuide, IntelHub, TeamAnalyzer, PlayerReport, LiveScores, Settings, Admin, Landing, and DreamTeam. The **Player Report** offers a tabbed view with Overview, Match Stats, Fixture Stats, Opposition, Venue, and AI Report (GPT-generated analysis loaded on demand). Player avatars utilize AFL Fantasy API headshots or team-colored placeholders. A 3-step onboarding wizard guides new users. The application incorporates detailed player availability and selection status logic.

### My Team Player Management
Players on the My Team page are interactive, allowing actions like viewing reports, swapping with teammates (validating position eligibility), replacing with database players (filtered by position and budget), setting captaincy, or removing players.

### Backend
An Express.js and Node.js server manages API requests, file uploads, and service integrations.

### Database
PostgreSQL with Drizzle ORM stores all application data, including player statistics, projections, user teams, and intelligence reports. Multi-step mutations (team replacement, captain/vice-captain setting, saved team activation) use database transactions via `db.transaction()`. Batch queries use `inArray` for efficient loading. `replaceMyTeam` provides atomic clear+rebuild. `upsertModelWeight` uses `onConflictDoUpdate`.

### AI Integration
Utilizes OpenAI GPT-4o-mini for text analysis and GPT-4o for vision and screenshot analysis via Replit AI Integrations. AI prompts use smart player selection and compact summaries to manage token context windows.

### Core Features
- **Projection Engine**: Calculates player projections, volatility, and Trade EV.
- **Simulation Engine**: Provides Monte Carlo simulations for round scores.
- **Trade Engine** (`TradeEngine` class in `server/services/trade-engine.ts`): Consolidated trade logic with `generateRecommendations()` (filters rule-checker violations), `evaluateCandidate()` (Points/Price/Strategic EV), `validateRecommendation()` (no trade-out-and-back-in same round), `markAsExecuted()` (trade history tracking), `getCaptainLoopholeAdvice()` (pre-round VC/C recommendations with injury/TOG warnings), and `getLiveLoopholeDecision()` (real-time keep/swap Captain advice). Includes Best-18 bye coverage analysis, TOG 50% captain risk warnings, TPP/DPP flexibility scoring, early vs regular bye trade allocation, and emergency setup recommendations.
- **News Sanity Check** (`server/services/news-sanity-check.ts`): Cross-references every trade recommendation and captain/VC pick against recent intelligence reports and news sources (last 7 days). Uses word-boundary player name matching with local-window keyword extraction to avoid false positives from unrelated mentions in the same article. Returns structured `NewsWarning` objects with severity (high/medium/low), headline, source URL, and category. Integrated into standard trade generation, AI trade generation, and captain advice endpoints. Frontend renders warnings as colored alert cards (red/amber/blue) with clickable "View source" links, separate from the main reason text.
- **Tag Intelligence System**: Provides evidence-based tag warnings.
- **Fixture Sync**: Fetches and syncs real fixtures and player data from Squiggle API.
- **Player Alerts**: Generates typed alerts (injury, late_change, selection, role_change, news) when intel reports mention players on a user's team, displayed via a notification system.
- **Live Scores**: Tracks live match statuses and fantasy scores using a four-source pipeline (DFS Australia Live → AFL Fantasy API → Footywire → Squiggle/DTLive) with smart live polling. DFS Australia Live (`dfsaustralia-apps.com/shiny/afl-live-scoring/liveScoring{year}.json`) is the primary real-time source, providing per-quarter fantasy scores, detailed stats, TOG%, and fixture status during live games. AFL Fantasy API is secondary with stale-data filtering. Footywire provides post-game detailed stats. Includes a Head-to-Head Matchup View against league opponents.
- **Season Schedule**: Displays the full AFL season fixture, with clickable completed/live matches providing AI-generated fantasy synopses.
- **Player Data Management**: Loads and reconciles player data, recalculating averages and breakevens. The AFL Fantasy API sync (`syncAflFantasyPrices`) dynamically adds new players not yet in the database on each startup, ensuring debutants and newly listed players are available for matching.
- **Data Sync Scheduler** (`server/scheduler.ts`): Runs a full sync cycle every 4 hours covering all 11 data sources: AFL Fantasy Prices, DFS Australia, DTLive, Footywire, Live Scores, Wheelo Ratings, Fixtures, AFL Tables, AFL Injury List, AFL Team Lineups, and Intel Reports. Live scores poll every 2 minutes during active games. Per-source sync timestamps are tracked. Manual refresh available via POST `/api/data/refresh`. Sync status exposed via GET `/api/data/status` (public, no auth required). Frontend `DataStatusBar` component (`client/src/components/data-status-bar.tsx`) shows last refresh time, expandable source details, schedule info (in user's timezone), and "Update All Data" button. Displayed on the Players page.
- **Team Upload & Analyser**: Two input modes: (1) Screenshot upload uses GPT-4o vision for OCR, (2) Paste List lets users copy-paste the AFL Fantasy list view for instant, AI-free parsing. Both feed into the same fuzzy-matching save flow. Text parser handles section headers, DPP position codes, prices, and on-field/bench detection. Team-based disambiguation resolves ambiguous surnames before falling back to user selection.
- **Trade Optimizer**: Evaluates trades based on Points EV, Price EV, and Strategic EV.
- **Season Planner**: Algorithmically builds optimal 30-man squads and generates 24-round strategy documents.
- **Dream Team Reverse Engineer**: Builds optimal 30-player squads ignoring salary cap, then reverse-engineers a budget-compliant starting team with round-by-round trade paths.
- **Team Lab (Sandbox)**: Allows users to save, create, compare, and swap between multiple team configurations.
- **Game Day Guide**: Provides a step-by-step transfer checklist with TOG 50% captain fallback tips, emergency setup reminders, Best-18 bye awareness, rolling lockout warnings, captain loophole strategy, and Advanced Trade-Editing reminders.
- **League Spy**: Enables tracking opponents across multiple fantasy leagues, including AI-powered analysis of opponent team screenshots and matchup breakdowns.
- **PWA Support**: Installable as a mobile app with offline caching of static assets.

## External Dependencies
- **OpenAI API**: For GPT-4o-mini and GPT-4o.
- **Squiggle API**: Provides AFL fixtures, tips, and ladder data.
- **AFL.com.au RSS**: Source for official AFL news.
- **Google News RSS**: Gathers news from AFL club feeds.
- **Aussie Rules Training RSS** (`aussierulestraining.com/feed/`): AFL training/coaching analysis and injury discussion.
- **BigFooty RSS** (`bigfooty.com/feed`): Community-driven AFL news, rumours, and analysis.
- **AFL Team Lineups** (`server/services/afl-lineup-scraper.ts`): Checks AFL API (`aflapi.afl.com.au`) for round match data (bye teams, playing teams) and scrapes `afl.com.au/matches/team-lineups` for team sheet announcement status. Falls back to DB player `selectionStatus` analysis when scrape unavailable. Powers the dashboard Team Sheet Status card via `GET /api/team-sheet-status`.
- **AFL Fantasy API**: Syncs team, position, dual position, and prices on every startup. Also inserts new players (debutants).
- **DFS Australia** (`dfsaustralia.com`): Downloads the AFL Fantasy 2026 XLSX spreadsheet on startup. Provides Champion Data IDs (= AFL Fantasy IDs), positions (including DPP), ownership %, PPM, and historical stats for ~780 players. Primary source for linking players to AFL Fantasy IDs. Runs after AFL Fantasy API sync. 890/895 players now linked.
- **Wheelo Ratings** (`wheeloratings.com`): JSON API at `/src/match_stats/table_data/{roundId}.json`. Provides detailed per-round player match stats: AFL Fantasy scores (DreamTeamPoints), disposal efficiency, metres gained, clearances, CBA%, pressure acts, contested marks, intercept marks, ground ball gets, score involvements, rating points. Also provides team-level stats for team_context. Syncs all completed rounds on startup. Player matching by name+team. ~963 player rows across 3 rounds, 42 team context rows. No Supercoach data stored — AFL Fantasy only.
- **DTLive (dtlive.com.au)**: Scraped for player prices, ownership %, and scores.
- **Footywire (footywire.com)**: Scraped for comprehensive AFL Fantasy prices.
- **AflTables (afltables.com)**: Scraped for historical player stats.
- **AFL Injury List** (`afl.com.au/matches/injury-list`): Scraped every 4 hours for official club injury updates. Parses 18 team injury tables (player name, injury type, estimated return) and "In the mix" editorial content about players pushing for selection. Injury data updates player `injuryStatus` with specific details (e.g. "Hamstring (2-3 weeks)"). "In the mix" content stored as intel reports with category "in-the-mix". ~131/136 players matched per sync.
- **PostgreSQL**: The primary database.