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
Developed with React, TypeScript, Vite, Tailwind CSS, Shadcn UI for components, TanStack React Query for data fetching, and Wouter for routing. Key pages include Dashboard, MyTeam, Players, Trades, FormGuide, IntelHub, TeamAnalyzer, PlayerReport, LiveScores, Settings, Admin, and Landing. Player avatars are displayed with headshot photos from the AFL Fantasy API, falling back to team-colored placeholders. Landing page shown to logged-out users. Admin page accessible only to admin users via sidebar link. App logo (Fantasy AFL Machine badge) is imported from `@assets/1772915052518_1772915124902_no_bg.png` and displayed in the sidebar header, landing page navbar, mobile header, and footer.

#### Onboarding Wizard
New users see a 3-step onboarding wizard (`client/src/components/onboarding-wizard.tsx`) before the main app:
- Step 1 (Welcome): Logo, value proposition, "Let's Get Started" CTA
- Step 2 (League Settings): Inline settings form (team name, round, trades) with read-only salary cap display ($18.30M fixed). "Skip for now" and "Save & Continue"
- Step 3 (Import Your Team): Two cards — "Upload a Screenshot" (→ /analyze, with step-by-step AFL Fantasy share instructions and example image) and "Browse & Pick Players" (→ /players)
- Completion stored in `localStorage` key `afl_onboarding_complete`. Checked in `App.tsx` `AuthenticatedApp` component.

#### Player Availability & Selection Status Logic
The `players` table has a `selectionStatus` field with values: "selected" (confirmed in team), "emergency" (only plays if a teammate is withdrawn), "omitted" (not selected), "unknown" (team sheet not yet announced). The risk endpoint (`/api/my-team/risks`) and dashboard use this alongside injury classification:
- **Definitely out**: injuries matching keywords like "season", "acl", "hamstring", "suspended", "surgery" → severity "critical"
- **Monitoring only**: statuses like "test", "managed", "soreness" → severity "low" (not shown as unavailable)
- **Omitted**: selectionStatus "omitted" → severity "high"
- **Emergency**: selectionStatus "emergency" → severity "medium", message explains they only play if a selected player is withdrawn
- **Unknown**: selectionStatus "unknown" → no alert (don't flag as unavailable when team sheets haven't been released yet)
- **Not named in squad**: `isNamedTeam` false from round 2+ only when selectionStatus is not "unknown"
Dashboard shows a blue info banner when most players have "unknown" status, explaining that team sheets are released by AFL clubs in the days before games and will be updated once announced.

#### Dev Test Login
In development mode (`NODE_ENV=development`), `POST /api/auth/dev-login` creates a session for a test user (`dev-test-user` / `test@aflmachine.dev`) without OIDC. Used for e2e testing.

#### Salary Cap
Fixed at $18,300,000 per `shared/game-rules.ts`. Displayed as read-only in both settings page and onboarding — not user-editable. Settings page also shows remaining budget (cap minus team value).

#### Sidebar Navigation
Sidebar (`client/src/components/app-sidebar.tsx`) groups nav items into 4 labelled sections:
- **MY TEAM**: Dashboard, My Team, Trade Centre
- **INTELLIGENCE**: Intel Hub, Form Guide, Player Database
- **TOOLS**: Team Analyser, Live Scores, Schedule
- **ACCOUNT**: Settings, FAQ, Admin (admin-only)
Each item has a subtitle description visible on desktop only.

#### Dashboard Redesign
Dashboard (`client/src/pages/dashboard.tsx`) displays sections in this order:
1. Status Bar (compact top bar: round, team name, projected score, team value)
2. "What You Need to Do Today" (priority actions from risk/trade/captain data)
3. Captain Loophole Panel (VC/C side-by-side with P(120+) pills)
4. My Team Snapshot (top 8 players in responsive grid)
5. Intel Flash (3 most recent intel reports, horizontally scrollable)
6. Existing sections (Round Score Simulator, Recommended Trades, Top Guns, etc.)

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
- **Team Analyzer Save**: Users can upload a team screenshot to `/analyze`, get AI analysis, then click "Save as My Team" to save identified players to their account. Backend at `POST /api/my-team/save-from-analyzer` matches player names to DB and replaces the current team. The AI prompt now detects Captain ("C" badge), Vice-Captain ("V" badge), and Emergency ("EMG" badge) players from the screenshot and preserves those flags when saving.
- **Trade Optimizer**: `server/services/trade-optimizer.ts` provides strategic trade evaluation using Points EV (CBA-adjusted projections × horizon), Price EV (breakeven-based cash generation), and Strategic EV (loophole enablement, bye structure). Phase-weighted scoring shifts from price-focused early season (60%) to points-focused late season (80%). Uses `avgTog`, `seasonCba`, `ppm` fields on players table. CBA breakout detection triggers when recent CBA% exceeds season average by 15%+. API: `POST /api/trade-evaluate { candidateId }` returns `TradeEvaluation` with breakdown and flags.
- **Season Planner**: `server/services/season-planner.ts` provides two core functions: (1) `buildOptimalTeam()` algorithmically picks the best 30-man squad within salary cap, position constraints, and bye structure — premiums on-field, cash cows on bench; (2) `generateSeasonPlan()` creates a data-backed 24-round strategy naming specific players everywhere — captain/VC picks with opponent, venue, PPM, CBA% reasoning; trade recommendations with named IN/OUT players, their avg scores, prices, break-even, ownership %, and full reasoning; structure notes identifying specific cash cows by name with growth rates, peaked rookies to sell, and core premiums. Each round includes a full simulated squad roster (`SquadPlayer[]`) with player IDs, roles (Premium/Mid-Pricer/Cash Cow/Rookie), and bye coverage. Stored in `season_plans` table with `teamSnapshot` containing `startingSquad`. APIs: `POST /api/season-plan/build-team`, `POST /api/season-plan/generate`, `GET /api/season-plan`. Onboarding wizard step 2 has "Let AI Build Your Team" option. Season Roadmap page at `/roadmap` displays the full plan with expandable round cards, 1-click "Apply" buttons for captain/VC (only shown when player is on current team), and a toggleable squad roster viewer per round showing every player with position, avg, price, and role.

## External Dependencies
- **OpenAI API**: For GPT-4o-mini (text analysis) and GPT-4o (vision/screenshot analysis).
- **Squiggle API**: Provides AFL fixtures, tips, and ladder data.
- **AFL.com.au RSS**: Source for official AFL news.
- **Google News RSS**: Gathers news from all 18 AFL club feeds.
- **AFL Fantasy API**: Used for player headshot photos.
- **DTLive (dtlive.com.au)**: Scraped for real player prices, ownership %, price changes, and per-round scores. `server/services/dtlive-scraper.ts` fetches data on startup and every 4 hours via the scheduler. Admin can manually trigger via `POST /api/admin/sync-dtlive`.
- **PostgreSQL**: The primary database for all application data.