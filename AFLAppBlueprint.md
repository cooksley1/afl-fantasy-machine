# AFL Fantasy Machine — Blueprint

## 1. Overview

AFL Fantasy Machine is a mobile-first Fantasy AFL advisor web application that combines real player data with AI-powered intelligence to help users optimise their Fantasy AFL team for overall rank. It covers 780 real 2026 AFL players, automated data gathering from 135+ sources (all 18 AFL clubs, Squiggle API, AFL.com.au RSS), GPT-4o-powered screenshot analysis, per-player AI scouting reports, and a quantitative projection engine featuring captain probability, Trade EV scoring, and volatility-based floor/ceiling projections.

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite |
| UI Framework | Tailwind CSS, Shadcn/UI (Radix primitives) |
| State/Data | TanStack React Query v5 |
| Routing | Wouter |
| Backend | Express.js, Node.js |
| Database | PostgreSQL (Neon), Drizzle ORM |
| AI | OpenAI GPT-4o-mini (text), GPT-4o (vision) via Replit AI Integrations |
| File Upload | Multer |
| Hosting | Replit |

---

## 3. Project Structure

```
/
├── client/
│   ├── index.html                  # Entry HTML with meta tags, OG tags
│   └── src/
│       ├── main.tsx                # React entry point
│       ├── App.tsx                 # Root component with SidebarProvider + Router
│       ├── index.css               # Tailwind + custom CSS variables (navy/gold theme)
│       ├── components/
│       │   ├── app-sidebar.tsx     # Navigation sidebar with 8 nav items
│       │   ├── theme-toggle.tsx    # Light/dark mode toggle
│       │   ├── error-state.tsx     # Reusable error display
│       │   └── ui/                 # Shadcn components (button, card, badge, etc.)
│       ├── hooks/
│       │   ├── use-toast.ts        # Toast notifications
│       │   └── use-mobile.ts       # Mobile breakpoint detection
│       ├── lib/
│       │   ├── queryClient.ts      # TanStack Query client + apiRequest helper
│       │   └── utils.ts            # cn() utility
│       └── pages/
│           ├── dashboard.tsx       # Team overview, captain loophole, alerts
│           ├── my-team.tsx         # Roster management, AI team analysis
│           ├── players.tsx         # Player database (780 players, search/filter/sort)
│           ├── player-report.tsx   # Individual player AI scouting report
│           ├── trades.tsx          # Trade Centre with Trade EV
│           ├── form-guide.tsx      # Hot/cold/top/rising/consistent/debutants
│           ├── intel-hub.tsx       # AI intelligence + live data
│           ├── team-analyzer.tsx   # Screenshot upload + GPT-4o vision analysis
│           ├── settings-page.tsx   # League configuration
│           └── not-found.tsx       # 404 page
├── server/
│   ├── index.ts                    # Express server bootstrap, startup sequence
│   ├── db.ts                       # Neon/PostgreSQL connection pool
│   ├── storage.ts                  # IStorage interface + DatabaseStorage class
│   ├── routes.ts                   # All Express API routes
│   ├── seed.ts                     # Initial player seeding (141 core players + starter team)
│   ├── expand-players.ts           # Loads 780 real players, calculates advanced metrics
│   ├── real-players-2026.json      # 780 parsed players from official source
│   ├── intel-engine.ts             # AI-powered intelligence generation (14 categories)
│   ├── data-gatherer.ts            # Live data fetching (Squiggle, RSS, club feeds)
│   ├── scheduler.ts                # Automated 4-hour data gathering cycle
│   └── vite.ts                     # Vite dev server integration
├── shared/
│   └── schema.ts                   # Drizzle ORM schemas, types, Zod insert schemas
├── drizzle.config.ts               # Drizzle Kit configuration
├── tailwind.config.ts              # Tailwind configuration with custom theme
├── vite.config.ts                  # Vite configuration with aliases
├── tsconfig.json                   # TypeScript configuration
└── package.json                    # Dependencies and scripts
```

---

## 4. Database Schema

### 4.1 Players Table (`players`)

Core player data for all 780 AFL players.

| Column | Type | Description |
|--------|------|-------------|
| id | serial PK | Auto-increment ID |
| name | text | Player full name |
| team | text | AFL team name |
| position | text | Primary position (DEF/MID/RUC/FWD) |
| dualPosition | text? | Secondary position for DPP eligibility |
| price | integer | Current Fantasy price in dollars |
| startingPrice | integer? | Round 1 price |
| avgScore | real | Season average Fantasy score |
| last3Avg | real | Last 3 rounds average |
| last5Avg | real | Last 5 rounds average |
| seasonTotal | integer | Total season Fantasy points |
| gamesPlayed | integer | Games played this season |
| ownedByPercent | real | Ownership percentage |
| formTrend | text | "up" / "down" / "stable" |
| injuryStatus | text? | Injury description if applicable |
| nextOpponent | text? | Next round opponent |
| byeRound | integer? | Bye round number |
| venue | text? | Next match venue |
| gameTime | text? | Game time slot (e.g., "Friday Night") |
| projectedScore | real? | Bayesian-adjusted projected score |
| projectedFloor | real? | Volatility-derived floor (proj - 1.0σ) |
| priceChange | integer | Last round price change |
| breakEven | integer? | Break-even score for price maintenance |
| ceilingScore | integer? | Volatility-derived ceiling (proj + 1.3σ) |
| isNamedTeam | boolean | Whether player is in named team |
| lateChange | boolean | Late change flag |
| consistencyRating | real? | 1-10 consistency rating |
| scoreStdDev | real? | Score standard deviation |
| recentScores | text? | Comma-separated recent scores |
| isDebutant | boolean | First-year player flag |
| debutRound | integer? | Expected debut round |
| cashGenPotential | text? | "elite"/"high"/"medium"/"low" |
| age | integer? | Player age |
| yearsExperience | integer? | Years of AFL experience |
| durabilityScore | real? | 0-1 durability rating |
| injuryRiskScore | real? | 0-1 injury risk rating |
| volatilityScore | real? | 0-10 scoring volatility |
| captainProbability | real? | P(score >= 120) via normal CDF |

### 4.2 Weekly Stats (`weekly_stats`)

Per-round detailed performance data.

| Column | Type | Description |
|--------|------|-------------|
| id | serial PK | |
| playerId | integer | FK to players |
| round | integer | Round number |
| opponent | text? | Opponent team |
| venue | text? | Match venue |
| fantasyScore | real | Fantasy score for round |
| timeOnGroundPercent | real? | TOG% |
| centreBounceAttendancePercent | real? | CBA% |
| kickCount, handballCount, markCount, tackleCount | integer? | Individual stats |
| hitouts, inside50s, rebound50s | integer? | Positional stats |
| contestedPossessions, uncontestedPossessions | integer? | Possession stats |
| subFlag | boolean | Whether player was medical sub |

### 4.3 Team Context (`team_context`)

Team-level round data for matchup modelling.

| Column | Type | Description |
|--------|------|-------------|
| id | serial PK | |
| team | text | AFL team name |
| round | integer | Round number |
| disposalCount | integer? | Total team disposals |
| clearanceCount | integer? | Total clearances |
| contestedPossessionRate | real? | Contested possession rate |
| paceFactor | real? | Game pace multiplier |
| fantasyPointsScored | real? | Total Fantasy points scored |
| fantasyPointsConceded | real? | Total Fantasy points conceded |

### 4.4 Position Concessions (`position_concessions`)

Matchup model: how many Fantasy points each team concedes per position.

| Column | Type | Description |
|--------|------|-------------|
| id | serial PK | |
| team | text | AFL team name |
| position | text | DEF/MID/RUC/FWD |
| avgPointsConceded | real? | Average Fantasy points conceded to position |
| stdDevConceded | real? | Standard deviation of conceded points |

### 4.5 Projections (`projections`)

Formal projection engine output per player per round.

| Column | Type | Description |
|--------|------|-------------|
| id | serial PK | |
| playerId | integer | FK to players |
| round | integer | Round number |
| projectedScore | real? | Projected Fantasy score |
| projectedFloor | real? | Projected floor |
| projectedCeiling | real? | Projected ceiling |
| volatilityScore | real? | Volatility for the round |
| confidenceScore | real? | Projection confidence |

### 4.6 Other Tables

| Table | Purpose |
|-------|---------|
| `my_team_players` | User's selected team roster (playerId, isOnField, isCaptain, isViceCaptain, fieldPosition) |
| `trade_recommendations` | Generated trade suggestions (playerOutId, playerInId, reason, confidence, priceChange, scoreDifference, tradeEv) |
| `league_settings` | User configuration (teamName, salaryCap, currentRound, tradesRemaining, totalTradesUsed) |
| `intel_reports` | AI-generated intelligence (category, title, content, priority, playerNames, source, actionable) |
| `intel_sources` | Raw data from external feeds (sourceType, sourceUrl, title, rawContent, processedInsights, isProcessed, isActionable) |
| `late_changes` | Late team change notifications (playerId, changeType, details, round) |
| `conversations` / `messages` | Chat history storage |
| `users` | User authentication (username, password) |

---

## 5. API Endpoints

### Players
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/players` | All players with advanced metrics |
| GET | `/api/players/:id` | Single player by ID |
| GET | `/api/players/:id/report` | AI scouting report for player |
| POST | `/api/players/refresh-data` | Refresh all player data |

### My Team
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/my-team` | Current team with player details |
| POST | `/api/my-team` | Add player to team |
| DELETE | `/api/my-team/:id` | Remove player from team |
| POST | `/api/my-team/:id/captain` | Set captain |
| POST | `/api/my-team/:id/vice-captain` | Set vice captain |
| POST | `/api/my-team/analyze` | Full AI team analysis |

### Trades
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/trade-recommendations` | List trade recommendations |
| POST | `/api/trade-recommendations/generate` | Generate algorithmic Trade EV recommendations |
| POST | `/api/trade-recommendations/generate-ai` | Generate AI-powered deep trade analysis |
| POST | `/api/trade-recommendations/:id/execute` | Execute a trade |

### Intelligence
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/intel` | All intelligence reports |
| GET | `/api/intel/:category` | Reports filtered by category |
| POST | `/api/intel/generate` | Generate AI intelligence (10-14 reports) |
| POST | `/api/intel/gather` | Trigger live data gathering from 135+ sources |
| GET | `/api/intel/sources` | Recent gathered sources |
| GET | `/api/intel/sources/stats` | Source statistics breakdown |
| POST | `/api/intel/pre-game` | Pre-game lockout advice |

### Other
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/settings` | Get league settings |
| PATCH | `/api/settings` | Update league settings |
| GET | `/api/captain-advice` | Captain loophole analysis with P(120+) |
| POST | `/api/analyze-screenshot` | Screenshot upload for GPT-4o vision analysis |
| GET | `/api/late-changes` | Late changes for current round |
| POST | `/api/late-changes` | Create a late change |
| GET | `/api/scheduler/status` | Scheduler status |
| GET | `/api/weekly-stats/:playerId` | Player weekly stats |
| GET | `/api/team-context` | All team contexts |
| GET | `/api/position-concessions` | All position concessions |
| GET | `/api/position-concessions/:team` | Position concessions by team |
| GET | `/api/projections/:playerId` | Player projections |

---

## 6. Projection Model

### 6.1 Bayesian-Adjusted Average

```
last2Est = last3Avg (proxy for last 2 rounds emphasis)
prev3Est = (last5Avg × 5 - last3Avg × 3) / 2  (previous 3 before last 2)
bayesianProj = last2Est × 0.6 + prev3Est × 0.4
finalProj = (rawProj × 0.5 + bayesianProj × 0.5)
```

Rationale: Catches breakout role shifts (e.g., tagging role removed, position change) faster than season average alone by weighting recent performance 60%.

### 6.2 Volatility-Based Floor/Ceiling

```
Floor = projectedScore - (1.0 × stdDev)
Ceiling = projectedScore + (1.3 × stdDev)
```

The asymmetric multiplier (1.0 down, 1.3 up) reflects that elite Fantasy scores tend to skew positively (a 160 explosion is more common than a 30 disaster for a premium).

### 6.3 Captain Probability — P(score >= 120)

Uses the normal cumulative distribution function:

```
P(X >= 120) = 1 - Phi((120 - projectedScore) / stdDev)
```

Where Phi is the standard normal CDF. This ranks captain candidates by probability of hitting the benchmark score, not by average alone. A player averaging 105 with sigma=25 may have a higher P(120+) than a player averaging 110 with sigma=10.

### 6.4 Trade EV (Expected Value)

```
projDiff = playerIn.projectedScore - playerOut.projectedScore
volPenalty = abs(playerIn.volatilityScore - playerOut.volatilityScore)
cashGenValue = { elite: 15, high: 10, medium: 5, low: 2, none: 0 }

Trade EV = (projDiff × 3) - (volPenalty × 0.5) + (cashGenValue × 0.2)
```

| EV Range | Classification |
|----------|---------------|
| > 30 | Strong trade |
| 15-30 | Marginal trade |
| < 15 | Luxury/sideways trade |

### 6.5 Consistency Rating

```
CV = stdDev / avg  (coefficient of variation)
cvScore = max(0, 10 - (CV × 40))  // CV-inverse on 0-10 scale
avgFactor = min(avg, 110) / 110 × 10  // Avg contribution capped at 110
consistencyRating = cvScore × 0.6 + avgFactor × 0.4
```

### 6.6 Debutant Detection

Players identified as potential debutants by price thresholds:
- Price <= $150,000: 70% probability of being flagged as debutant
- Price <= $250,000: 40% probability of being flagged as debutant

### 6.7 Cash Generation Potential

Based on scoring margin above break-even:
- `elite`: scoring 30+ above BE
- `high`: scoring 20-30 above BE
- `medium`: scoring 10-20 above BE
- `low`: scoring 0-10 above BE

### 6.8 Durability and Injury Risk

- Durability Score (0-1): Based on age (optimal 23-28), penalised for injury status
- Injury Risk Score (0-1): Inverse of durability with additional age/injury adjustments

---

## 7. AI Integration

### 7.1 OpenAI Configuration

Uses Replit AI Integrations for OpenAI access:
- `AI_INTEGRATIONS_OPENAI_API_KEY` - API key
- `AI_INTEGRATIONS_OPENAI_BASE_URL` - Base URL

### 7.2 Models Used

| Model | Use Case |
|-------|----------|
| gpt-4o-mini | Text analysis: intel generation, team analysis, player reports, trade analysis, captain advice, pre-game advice |
| gpt-4o | Vision: screenshot team analysis |

### 7.3 AI Features

1. Team Analysis (`POST /api/my-team/analyze`): Evaluates entire roster, returns overallRating (1-10), per-player action recommendations (must_have/keep/monitor/trade/sell), captaincy picks, strengths/weaknesses, urgent actions, bye risk summary
2. Player Scouting Report (`GET /api/players/:id/report`): Individual deep dive with form analysis, price outlook, fixture analysis, risk assessment
3. Intel Generation (`POST /api/intel/generate`): Produces 10-14 categorised intelligence reports across 13 categories (captains, cash cows, injuries, team selection, bye strategy, POD players, breakout, premiums, fixtures, tactical, ground conditions, historical)
4. Trade Analysis (`POST /api/trade-recommendations/generate-ai`): AI-powered trade recommendations using full player data context
5. Screenshot Analysis (`POST /api/analyze-screenshot`): GPT-4o vision identifies players from team screenshot, provides trade/captain/structure recommendations
6. Captain Advice (`GET /api/captain-advice`): Captain loophole strategy with P(120+) rankings
7. Pre-Game Advice (`POST /api/intel/pre-game`): Last-minute lockout decisions, trade deadline advice, player alerts

### 7.4 Context Enrichment

All AI prompts include enriched player summaries with:
- Core stats (avg, L3, L5, price, BE)
- Advanced metrics (projected score, floor, ceiling, volatility, P(120+))
- Demographics (age, experience, durability, injury risk)
- Situational data (form trend, ownership, next opponent, venue, game time)

---

## 8. Data Gathering System

### 8.1 Sources (135+ feeds)

| Source | Type | Data |
|--------|------|------|
| Squiggle API - Fixtures | REST API | Round fixtures, venues, dates |
| Squiggle API - Tips | REST API | Expert predictions and odds |
| Squiggle API - Ladder | REST API | Team standings |
| AFL.com.au RSS | RSS Feed | League-wide news |
| 18 x AFL Club Google News | RSS (Google News) | Club-specific news for all 18 teams |
| Melbourne FC Official | RSS Feed | Official club media |
| Fantasy-specific feeds | RSS Feed | Fantasy analysis and news |

### 8.2 Processing Pipeline

1. Fetch: `data-gatherer.ts` fetches from all sources with timeout handling and User-Agent header
2. Deduplicate: Checks against existing `intel_sources` to avoid duplicate entries
3. Store: Raw content saved to `intel_sources` table
4. Process: GPT-4o-mini extracts Fantasy-relevant insights from raw content
5. Generate Reports: Processed insights feed into AI intel generation

### 8.3 Scheduler

- Runs every 4 hours automatically (`scheduler.ts`)
- Initial run 30 seconds after server boot
- Gathers data then generates AI intelligence reports

---

## 9. Frontend Architecture

### 9.1 Routing (Wouter)

| Path | Component | Description |
|------|-----------|-------------|
| `/` | Dashboard | Team overview, captain loophole, alerts |
| `/team` | MyTeam | Roster management, AI analysis |
| `/players` | Players | Player database with search/filter/sort |
| `/player/:id` | PlayerReport | Individual scouting report |
| `/trades` | Trades | Trade Centre with EV scoring |
| `/form` | FormGuide | Form tracking across 6 tabs |
| `/intel` | IntelHub | AI intelligence + live data |
| `/analyze` | TeamAnalyzer | Screenshot upload + vision analysis |
| `/settings` | SettingsPage | League configuration |

### 9.2 State Management

- Server state: TanStack React Query v5 with default fetcher configured for all GET requests
- Mutations: Use `apiRequest()` helper from `queryClient.ts` for POST/PATCH/DELETE, with automatic cache invalidation via `queryClient.invalidateQueries()`
- Local state: React `useState` for UI-only state (filters, sort, active tabs)

### 9.3 Mobile-First Design Pattern

All pages follow this pattern:
```tsx
<div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-Xnxl mx-auto">
```

Key responsive patterns:
- Grid layouts: `grid-cols-2 lg:grid-cols-4` for stat cards
- Player cards: Mobile card layout (`renderMobileCard`) vs desktop table rows (`renderDesktopRow`) using `useIsMobile()` hook
- Tabs: Horizontally scrollable on mobile via `overflow-x-auto` wrapper
- Buttons: Full-width on mobile (`flex-1 sm:flex-initial`)
- Touch targets: Minimum 44px height (`min-h-[44px]`)
- Text sizing: `text-xs sm:text-sm` for body text, `text-xl sm:text-2xl` for headings

### 9.4 Theming

- Custom navy/gold AFL colour scheme defined in CSS custom properties
- Dark mode via `.dark` class toggle on `<html>` element
- Stored in localStorage
- All colours use HSL format without wrapper: `--primary: 230 60% 25%`

---

## 10. Key Features Detail

### 10.1 Captain Loophole Strategy

Dashboard displays VC (Vice Captain) and C (Captain) picks with:
- Game time slots for loophole timing
- P(120+) probability for each
- Decision tree: If VC scores 110+ in early game, keep doubled score. Otherwise switch to C before their later game.

### 10.2 DPP (Dual Position Player) Tracking

95 players have dual position eligibility (e.g., DEF/MID). Shown as badges throughout the app for positional flexibility awareness.

### 10.3 Break-Even Analysis

Colour-coded BE display: green when BE < avg (price rising), red when BE > avg (price falling). Critical for cash generation strategy.

### 10.4 Screenshot Team Analysis

1. User uploads team screenshot (PNG/JPG, max 10MB)
2. Image sent to GPT-4o vision model via `/api/analyze-screenshot`
3. AI identifies players, positions, and scores from the image
4. Returns: identified players, team analysis, captain tip, recommendations (by priority), trade suggestions

---

## 11. Environment Variables

| Variable | Source | Purpose |
|----------|--------|---------|
| `DATABASE_URL` | Replit PostgreSQL | Database connection string |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | Replit AI Integrations | OpenAI API key |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | Replit AI Integrations | OpenAI base URL |
| `SESSION_SECRET` | Replit Secrets | Session encryption key |

---

## 12. Startup Sequence

1. Express HTTP server initialises on port 5000
2. `seedDatabase()` - Creates initial 141 core AFL players and a starter team if DB is empty
3. `expandPlayerDatabase()` - Loads remaining players from `real-players-2026.json` (780 total)
4. `populateConsistencyData()` - Calculates advanced metrics for all players: consistency rating, std dev, recent scores, debutant flags, cash gen potential, Bayesian projections, volatility, captain probability, floor/ceiling, age, experience, durability, injury risk
5. `populateBaselineData()` - Seeds position concessions (18 teams x 4 positions) and team context baseline data
6. `registerRoutes()` - Mounts all Express API routes
7. Vite dev server configured for frontend serving (development)
8. `startScheduler()` - Begins automated 4-hour data gathering + AI analysis cycle

---

## 13. Deployment

- Runs on Replit with auto-restart on file changes (development)
- Single command: `npm run dev` starts both Express backend and Vite frontend
- Production builds via Vite (`npm run build`) serve static assets from Express
- PostgreSQL database persists across deploys
- Health check: GET `/` returns the app

---

## 14. Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `dev` | `NODE_ENV=development tsx server/index.ts` | Start development server |
| `build` | `vite build` | Build frontend for production |
| `db:push` | `drizzle-kit push` | Push schema changes to database |
