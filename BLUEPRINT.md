# AFL Fantasy Machine — Complete Blueprint

## Overview

AFL Fantasy Machine is a mobile-first Fantasy AFL advisor app built for the **AFL Fantasy Classic 2026** competition. It manages a real 30-player team ("The Lizards Gulch"), provides AI-powered analysis, trade recommendations, captain loophole strategy, live intel from all 18 AFL clubs, and comprehensive player analytics for 780+ AFL players.

The goal: **WIN each week and the overall competition.**

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript, Vite, Tailwind CSS, Shadcn UI |
| State | TanStack React Query v5 |
| Routing | Wouter |
| Backend | Express.js (Node.js) |
| Database | PostgreSQL + Drizzle ORM |
| AI | OpenAI GPT-4o (vision), GPT-4o-mini (text) via Replit AI Integrations |
| File Uploads | Multer |
| Data Sources | Squiggle API, AFL.com.au RSS, 18 AFL club Google News RSS feeds |
| Testing | Vitest (85 unit tests) |
| Styling | Navy/gold AFL theme, dark mode, mobile-first responsive |

---

## Architecture

```
├── client/                    # Frontend (React + Vite)
│   ├── index.html             # Entry HTML with SEO meta tags
│   └── src/
│       ├── App.tsx            # Root: sidebar layout, routing, mobile header
│       ├── main.tsx           # React entry point
│       ├── index.css          # Tailwind + custom CSS variables (navy/gold theme)
│       ├── components/
│       │   ├── app-sidebar.tsx    # Navigation sidebar with 8 items
│       │   ├── theme-toggle.tsx   # Dark/light mode toggle
│       │   ├── error-state.tsx    # Reusable error display
│       │   └── ui/                # Shadcn UI components
│       ├── hooks/
│       │   ├── use-toast.ts
│       │   └── use-mobile.tsx
│       ├── lib/
│       │   ├── queryClient.ts     # TanStack Query + apiRequest helper
│       │   └── utils.ts
│       └── pages/
│           ├── dashboard.tsx      # Action-oriented round overview
│           ├── my-team.tsx        # Dual view (Field/List) team management
│           ├── players.tsx        # 780+ player database with filters
│           ├── trades.tsx         # Trade centre with AI recommendations
│           ├── form-guide.tsx     # Hot/Cold/Rising/Consistent/Debutants tabs
│           ├── intel-hub.tsx      # Live intel from 18 clubs + AI analysis
│           ├── team-analyzer.tsx  # Screenshot upload + GPT-4o vision analysis
│           ├── player-report.tsx  # Per-player AI scouting report
│           ├── settings-page.tsx  # League settings configuration
│           └── not-found.tsx
├── server/
│   ├── index.ts               # Server entry: startup sequence
│   ├── routes.ts              # All API routes (/api/*)
│   ├── storage.ts             # DatabaseStorage class (IStorage interface)
│   ├── db.ts                  # PostgreSQL connection pool
│   ├── seed.ts                # Initial 51 player seeds
│   ├── expand-players.ts      # Load 780 real 2026 players from JSON
│   ├── real-players-2026.json # Player data from DFS Australia Excel
│   ├── intel-engine.ts        # AI intel generation (GPT-4o-mini)
│   ├── data-gatherer.ts       # Live RSS/API data fetching
│   ├── scheduler.ts           # 4-hour automated data gathering cycle
│   ├── vite.ts                # Vite dev server integration
│   └── services/
│       ├── projection-engine.ts   # All calculation/projection functions
│       └── __tests__/
│           └── projection-engine.test.ts  # 85 unit tests
├── shared/
│   ├── schema.ts              # Drizzle schemas + Zod insert schemas + types
│   └── game-rules.ts          # AFL Fantasy Classic 2026 rules (non-negotiable)
├── drizzle.config.ts
├── vite.config.ts
├── vitest.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## AFL Fantasy Classic 2026 Rules

Defined in `shared/game-rules.ts`. These are **non-negotiable** and govern all app logic.

| Rule | Value |
|------|-------|
| Squad Size | 30 players (22 on-field, 8 bench, 4 emergencies) |
| Positions | 8 DEF (6+2), 10 MID (8+2), 3 RUC (2+1), 8 FWD (6+2), 1 UTIL |
| Salary Cap | $18,300,000 |
| Magic Number | 10,490 (price = 2025 avg × 10,490) |
| Trades per Round | 2 standard, 3 during bye rounds (12, 13, 14) |
| Trades Start | Round 2 |
| Bye Rounds | 12, 13, 14 |
| Captain | Score doubled; 50% TOG rule applies |
| Scoring | Kick=3, HB=2, Mark=3, Tackle=4, Hitout=1, Goal=6, Behind=1, FK±3 |
| Rounds | 24 total |

---

## Database Schema

All tables defined in `shared/schema.ts` using Drizzle ORM.

### Core Tables

**players** (795 rows from 18 AFL teams)
- Identity: `id`, `name`, `team`, `position`, `dualPosition`
- Pricing: `price`, `startingPrice`, `priceChange`, `breakEven`
- Scoring: `avgScore`, `last3Avg`, `last5Avg`, `seasonTotal`, `gamesPlayed`
- Form: `formTrend` (up/down/stable), `recentScores` (CSV), `consistencyRating`, `scoreStdDev`, `volatilityScore`
- Projections: `projectedScore`, `projectedFloor`, `ceilingScore`, `captainProbability`
- Status: `injuryStatus`, `isNamedTeam`, `lateChange`, `nextOpponent`, `byeRound`, `venue`, `gameTime`
- Demographics: `age`, `yearsExperience`, `durabilityScore`, `injuryRiskScore`
- Cash Cows: `isDebutant`, `debutRound`, `cashGenPotential` (elite/high/medium/low)
- Meta: `ownedByPercent`

**my_team_players** (30 rows — Glen's team)
- `id`, `playerId`, `fieldPosition` (DEF/MID/RUC/FWD/UTIL)
- `isOnField`, `isCaptain`, `isViceCaptain`

**league_settings** (1 row)
- `id`, `teamName`, `salaryCap`, `currentRound`, `tradesRemaining`, `totalTradesUsed`

**trade_recommendations**
- `id`, `playerOutId`, `playerInId`, `reason`, `confidence` (0-1)
- `scoreDifference`, `priceChange`, `tradeEv`, `status` (pending/executed/dismissed)
- `category`, `source`

### Analysis Tables

**weekly_stats** — Per-round performance (playerId, round, score, kicks, handballs, etc.)

**team_context** — Team-level data per round (team, round, rating, injuries, etc.)

**position_concessions** — Matchup model (team, position, avgPointsConceded, stdDevConceded)

**projections** — Formal projection output (playerId, round, projectedScore, confidence)

**model_weights** (40 rows) — Configurable weights for all projection formulas
- `key` (unique), `value` (real), `description`, `category` (projection/captain/consistency/trade/debutant)

### Intel Tables

**intel_reports** — AI-generated intelligence (title, content, category, priority, actionable, playerNames, source)

**intel_sources** — Raw data from RSS/API gathering (url, title, content, sourceType, processed)

**late_changes** — Late team changes (playerName, team, changeType, round, source)

### System Tables

**conversations**, **messages**, **users** — Chat/auth infrastructure

---

## API Endpoints

All prefixed with `/api/`.

### Players
| Method | Path | Description |
|--------|------|-------------|
| GET | `/players` | All players with advanced metrics |
| GET | `/players/:id` | Single player |
| GET | `/players/:id/report` | AI scouting report (GPT-4o-mini) |
| POST | `/players/refresh-data` | Refresh player data |

### My Team
| Method | Path | Description |
|--------|------|-------------|
| GET | `/my-team` | 30 players with full stats |
| POST | `/my-team` | Add player (body: {playerId, fieldPosition}) |
| DELETE | `/my-team/:id` | Remove player |
| POST | `/my-team/:id/captain` | Set captain |
| POST | `/my-team/:id/vice-captain` | Set vice captain |
| POST | `/my-team/analyze` | Full AI team analysis |
| POST | `/my-team/setup-glens-team` | Reset to Glen's 2026 starting squad |

### Trades
| Method | Path | Description |
|--------|------|-------------|
| GET | `/trade-recommendations` | List with playerOut/playerIn joined |
| POST | `/trade-recommendations/generate` | Quick Trade EV generation |
| POST | `/trade-recommendations/generate-ai` | Deep AI trade analysis |
| POST | `/trade-recommendations/:id/execute` | Execute trade (swaps players, decrements trades) |

### Settings
| Method | Path | Description |
|--------|------|-------------|
| GET | `/settings` | Current settings |
| PATCH | `/settings` | Update (auto-resets trades when round changes) |
| GET | `/game-rules` | AFL Fantasy Classic 2026 rules |

### Intel
| Method | Path | Description |
|--------|------|-------------|
| GET | `/intel` | All intel reports |
| GET | `/intel/:category` | Filter by category |
| POST | `/intel/generate` | AI analysis generation |
| POST | `/intel/gather` | Trigger live data gathering |
| GET | `/intel/sources` | Recent gathered sources |
| GET | `/intel/sources/stats` | Source statistics |
| POST | `/intel/pre-game` | Pre-game lockout advice |

### Captain & Analysis
| Method | Path | Description |
|--------|------|-------------|
| GET | `/captain-advice` | Captain loophole analysis with P(120+) |
| POST | `/analyze-screenshot` | Screenshot vision analysis (GPT-4o, multipart) |

### Advanced Data
| Method | Path | Description |
|--------|------|-------------|
| GET | `/weekly-stats/:playerId` | Player weekly stats |
| GET | `/team-context` | All team contexts |
| GET | `/position-concessions` | All position concessions |
| GET | `/position-concessions/:team` | By team |
| GET | `/projections/:playerId` | Player projections |
| GET | `/model-weights` | All 40 configurable weights |
| GET | `/model-weights/:key` | Single weight |
| PUT | `/model-weights/:key` | Update weight (rebuilds cache) |
| PUT | `/model-weights` | Batch update weights |
| GET | `/late-changes` | Late changes for current round |
| POST | `/late-changes` | Create late change |
| GET | `/scheduler/status` | Scheduler status |

---

## Projection Model

All calculations in `server/services/projection-engine.ts`. All weights are configurable via the `model_weights` table and cached in memory.

### 1. Bayesian-Adjusted Average
```
proj = last2Est × bayesian_last2_weight + prev3Est × bayesian_prev3_weight
```
Default weights: 0.6 / 0.4

### 2. Volatility-Based Range
```
Floor = Proj - (floor_sigma_multiplier × StdDev)
Ceiling = Proj + (ceiling_sigma_multiplier × StdDev)
```

### 3. Captain Probability
```
P(score >= captain_threshold) using normal CDF
```
Default threshold: 120

### 4. Trade EV Formula
```
EV = (ProjDiff × trade_ev_proj_multiplier)
   - (VolPenalty × trade_ev_vol_penalty)
   + (CashGen × trade_ev_cashgen_multiplier)
```

### 5. Consistency Rating
```
CV-inverse (consistency_cv_weight) + avg factor (consistency_avg_weight) → 1-10 scale
```

### 6. Trade Confidence
```
Base + EV bonus + form bonus + trend bonuses + injury/DPP bonuses
Capped at confidence_max
```

### Key Functions
- `normalCDF`, `bayesianAdjustedAvg`
- `calcProjectedFloor`, `calcProjectedCeiling`
- `calcVolatilityScore`, `calcCaptainProbability`
- `calcConsistencyRating`, `calcTradeEV`
- `calcTradeRankingScore`, `calcTradeConfidence`
- `calcBlendedProjection`
- `classifyCashGeneration`, `isDebutantCandidate`
- `generateRecentScores`, `generateAge`, `generateYearsExperience`
- `generateDurabilityScore`, `generateInjuryRiskScore`
- `getCachedWeights`, `buildWeightConfig`

---

## AI Integration

Uses OpenAI via Replit AI Integrations (environment variables: `AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`).

### Models Used
- **GPT-4o**: Screenshot vision analysis (`/api/analyze-screenshot`)
- **GPT-4o-mini**: All text analysis (team analysis, trade recommendations, intel generation, player reports, captain advice, pre-game lockout advice)

### AI Features
1. **Team Analysis** — Full squad evaluation with rating, strengths, weaknesses, urgent actions, captain strategy, bye risk
2. **AI Trade Recommendations** — Deep trade analysis considering form, matchups, bye rounds, DPP value
3. **Screenshot Analysis** — Upload team screenshot, GPT-4o identifies players and provides strategic advice
4. **Player Scouting Reports** — Per-player AI analysis with form, price outlook, risk assessment
5. **Intel Generation** — AI analysis across 13 categories (captains, cash cows, injuries, fixtures, etc.)
6. **Pre-Game Advice** — Trade deadline decisions, captain loophole strategy, last-minute changes
7. **Captain Advice** — Loophole strategy with P(120+) probability calculations

---

## Frontend Pages

### Dashboard (`/`)
Action-oriented round overview showing:
- Projected score, team value, trades this round, season trades used
- Action Required section (late changes, bye-affected players, underperformers)
- Captain Loophole Strategy (VC/C with P(120+), game times, loophole explanation)
- Recommended trades and top performers
- Bench Watch for hot bench players

### My Team (`/team`)
Dual-view team management:
- **Field View**: Grid layout matching AFL Fantasy Classic (position groups with on-field/bench split)
- **List View**: Scrollable list with C/VC badges, position badges, price, LRD/AVG stats, action buttons
- Sky-blue position headers, captain/VC assignment, AI team analysis button
- Team value and remaining salary display

### Players (`/players`)
Full 780+ player database:
- Search, team filter, position filter, sort controls
- Mobile: Card-based layout with 6 stat columns (Avg, Price, Range, BE, Consistency, P120)
- Desktop: Table layout with sortable columns
- DPP badges, debutant indicators, cash gen potential, injury status
- Add-to-team button

### Trade Centre (`/trades`)
- Trades this round counter (2 per round, 3 bye rounds)
- Quick generate (Trade EV algorithm) and AI Analysis buttons
- Trade cards grouped by confidence (Strong/Worth Considering/Speculative)
- Each card shows: OUT/IN players, stats, confidence bar, EV score, execute button
- Trade execution updates team roster and decrements round trades

### Form Guide (`/form`)
Six tabs:
- **Hot**: Players trending up, sorted by L3 average
- **Cold**: Players trending down
- **Top**: Highest season averages
- **Rising**: L3 > Avg × 1.1, biggest improvers
- **Consistent**: Consistency rating + sparkline chart, players with avg ≥ 70
- **Debutants**: Cash cow tracker with debut round, BE, cash generation potential

### Intel Hub (`/intel`)
Live intelligence system:
- Gather Data (RSS/API fetch from 18 clubs + AFL + Squiggle + fantasy feeds)
- Pre-Game Advice (trade deadline, captain strategy, late changes)
- AI Analysis generation
- 13 category filters with count badges
- Source statistics and last-gathered timestamp
- Intel cards with priority, actionable badges, player tags

### Team Analyzer (`/analyze`)
Screenshot-based AI analysis:
- Drag-and-drop or tap-to-upload (PNG/JPG, max 10MB)
- Image preview with clear button
- GPT-4o vision analysis returns: identified players, analysis, recommendations, captain tip, trade suggestions

### Player Report (`/player/:id`)
AI scouting report for individual players (accessed from team/player list clicks).

### Settings (`/settings`)
- Team name, salary cap, current round, trades this round
- When round changes, trades auto-reset to per-round allocation

---

## Styling & Theming

- **Color Scheme**: Navy/gold AFL theme defined in `client/src/index.css`
- **Dark Mode**: Class-based toggle with `ThemeToggle` component, localStorage persistence
- **Responsive**: Mobile-first design, all pages use `p-4 sm:p-6` padding pattern
- **Sidebar**: 15rem width, collapsible, mobile sheet overlay with hamburger trigger
- **Touch Targets**: Min 44px for all interactive elements
- **Typography**: System font stack via Tailwind defaults
- **Icons**: Lucide React for all UI icons

---

## Data Flow

### Startup Sequence
1. Express server starts
2. `seedModelWeights()` — Seeds/loads 40 configurable weights
3. `seedDatabase()` — Creates initial data if DB empty
4. `expandPlayerDatabase()` — Loads 780 real players from `real-players-2026.json`
5. `populateConsistencyData()` — Generates consistency ratings, debutant flags, advanced metrics
6. `populateBaselineData()` — Seeds position concessions and team context
7. `registerRoutes()` — All API endpoints
8. `startScheduler()` — 4-hour automated data gathering cycle

### Data Gathering Cycle (every 4 hours)
1. Fetch Squiggle API (fixtures, tips, ladder)
2. Fetch AFL.com.au RSS feed
3. Fetch all 18 AFL club Google News RSS feeds
4. Fetch fantasy-specific news feeds
5. Process and store as intel sources
6. Generate AI analysis from gathered data

### Trade Execution Flow
1. User clicks "Execute Trade" on a recommendation
2. Server validates: trade exists, trades remaining > 0, playerOut is on team
3. Swap players: remove playerOut from my_team_players, add playerIn
4. Decrement `tradesRemaining`, increment `totalTradesUsed`
5. Mark trade as executed
6. Client invalidates team, trades, and settings caches

---

## State Management

- **Server State**: TanStack React Query v5 with query key invalidation
- **Default Fetcher**: Configured in `queryClient.ts` to work with `/api/*` endpoints
- **Mutations**: Use `apiRequest()` helper for POST/PATCH/DELETE
- **Cache Invalidation**: Always invalidate related queries after mutations
- **Local State**: React `useState` for UI state (view mode, filters, sort, analysis results)

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | OpenAI API key (Replit integration) |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | OpenAI base URL (Replit integration) |
| `SESSION_SECRET` | Express session secret |

---

## Testing

Run with: `npx vitest run --config vitest.config.ts`

85 tests covering all projection-engine functions:
- `normalCDF`, `bayesianAdjustedAvg`
- `calcProjectedFloor`, `calcProjectedCeiling`
- `calcVolatilityScore`, `calcCaptainProbability`
- `calcConsistencyRating`, `calcTradeEV`
- `calcTradeRankingScore`, `calcTradeConfidence`
- `calcBlendedProjection`
- `classifyCashGeneration`, `isDebutantCandidate`
- `generateRecentScores`, `generateAge`, `generateYearsExperience`
- `generateDurabilityScore`, `generateInjuryRiskScore`
- `buildWeightConfig`

---

## Glen's 2026 Starting Team

"The Lizards Gulch" — seeded via `POST /api/my-team/setup-glens-team`

**DEF (8)**: Jordan Dawson (C), Harry Sheezel, Sam De Koning, Nick Daicos (DPP), Jake Lloyd, Isaac Cumming, Jack Payne, Nathan O'Driscoll

**MID (10)**: Zak Butters, Tom Green, Marcus Bontempelli, Caleb Serong, Matt Rowell, Adam Treloar, Josh Daicos, Finn Maginness, Harvey Gallagher, Nick Daicos (DPP)

**RUC (3)**: Max Gawn (VC), Tristan Xerri, Tom De Koning

**FWD (8)**: Errol Gulden, Charlie Curnow, Jesse Hogan, Sam Flanders, Bailey Smith (DPP), Tom Barrass, Liam Henry, Harley Reid

**UTIL (1)**: Assigned from squad

Captain: Jordan Dawson | Vice Captain: Harry Sheezel
Salary Cap: $18,300,000

---

## Key Design Decisions

1. **Per-round trades**: Trades reset each round (2 standard, 3 bye rounds) — matches AFL Fantasy Classic rules exactly
2. **Trade EV formula**: Quantitative scoring ensures recommendations are data-driven, not just vibes
3. **Captain loophole**: VC plays early → if 110+, keep doubled score; otherwise switch to C. 50% TOG rule enforced.
4. **Configurable weights**: All 40 model weights stored in DB and cached in memory — tune the engine without code changes
5. **Mobile-first**: All layouts designed for 375px width first, enhanced for desktop
6. **Live data**: RSS/API feeds from real AFL sources processed every 4 hours automatically
7. **Player-out validation**: Trade recommendations only suggest players OUT that are actually on Glen's team
