# AFL Fantasy Machine - Clone Blueprint

Complete technical blueprint to rebuild this application from scratch.

---

## 1. Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20+ |
| Language | TypeScript (strict) |
| Frontend | React 18 + Vite |
| Routing (client) | wouter |
| State/Data | TanStack React Query v5 |
| UI Components | shadcn/ui (Radix primitives) |
| Styling | Tailwind CSS v3 |
| Icons | lucide-react, react-icons/si |
| Forms | react-hook-form + @hookform/resolvers/zod |
| Backend | Express.js |
| ORM | Drizzle ORM |
| Database | PostgreSQL |
| Schema Validation | Zod + drizzle-zod |
| AI | OpenAI API (GPT-4o-mini for text, GPT-4o for vision) |
| File Upload | multer (memory storage) |
| Data Parsing | xlsx (Excel file parsing) |
| Dark Mode | Class-based toggle with localStorage sync |
| Live Data | Squiggle API, AFL.com.au RSS |

---

## 2. Project Structure

```
├── client/
│   ├── index.html
│   ├── src/
│   │   ├── App.tsx                    # Root layout with sidebar + routing
│   │   ├── main.tsx                   # React entry point
│   │   ├── index.css                  # Tailwind + CSS variables + theme
│   │   ├── lib/
│   │   │   └── queryClient.ts         # TanStack Query client + apiRequest helper
│   │   ├── hooks/
│   │   │   ├── use-toast.ts           # Toast notification hook
│   │   │   └── use-mobile.tsx         # Mobile breakpoint detection hook
│   │   ├── components/
│   │   │   ├── app-sidebar.tsx        # Navigation sidebar with 8 nav items
│   │   │   ├── theme-toggle.tsx       # Dark/light mode toggle
│   │   │   ├── error-state.tsx        # Reusable error display
│   │   │   └── ui/                    # shadcn components (button, card, badge, etc.)
│   │   └── pages/
│   │       ├── dashboard.tsx          # Main dashboard with stats, captain, alerts
│   │       ├── my-team.tsx            # Team management by position + AI analysis
│   │       ├── players.tsx            # Player database browser (780 players)
│   │       ├── trades.tsx             # Trade recommendation engine
│   │       ├── form-guide.tsx         # Player form analysis
│   │       ├── intel-hub.tsx          # AI intel + live data gathering + pre-game advice
│   │       ├── team-analyzer.tsx      # Screenshot upload + GPT-4o vision analysis
│   │       ├── player-report.tsx      # Per-player AI scouting reports
│   │       ├── settings-page.tsx      # League configuration
│   │       └── not-found.tsx          # 404 page
├── server/
│   ├── index.ts                       # Server entry point + startup sequence
│   ├── routes.ts                      # All API route definitions (~550 lines)
│   ├── storage.ts                     # IStorage interface + DatabaseStorage
│   ├── db.ts                          # Drizzle database connection
│   ├── vite.ts                        # Vite dev server middleware
│   ├── intel-engine.ts                # OpenAI integration (intel, trades, captain, vision, reports)
│   ├── data-gatherer.ts               # Live data fetching (Squiggle API, AFL RSS) + AI processing
│   ├── scheduler.ts                   # Automated 4-hour intelligence gathering cycle
│   ├── seed.ts                        # Database seeding with initial AFL players
│   ├── expand-players.ts              # Loads 780 real 2026 AFL players from JSON
│   └── real-players-2026.json         # 780 parsed AFL Fantasy players (from official Excel)
├── shared/
│   └── schema.ts                      # Drizzle schema + Zod validators + types
├── drizzle.config.ts
├── tailwind.config.ts
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## 3. Database Schema

### `players`
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | Auto-increment |
| name | text | Player full name |
| team | text | AFL club name |
| position | text | Primary: DEF, MID, RUC, FWD |
| dual_position | text? | DPP eligibility (e.g., "FWD") |
| price | integer | Current price in dollars ($230K-$1.22M) |
| avg_score | real | Season average score |
| last3_avg | real | Last 3 games average |
| last5_avg | real | Last 5 games average |
| season_total | integer | Total season points |
| games_played | integer | Games played this season |
| owned_by_percent | real | Ownership percentage |
| form_trend | text | "up", "down", "stable" |
| injury_status | text? | Injury description or null |
| next_opponent | text? | Next round opponent |
| bye_round | integer? | Bye round number |
| venue | text? | Next game venue |
| game_time | text? | Game time slot (e.g., "Saturday 1:45pm") |
| projected_score | real? | AI/stat projected score |
| price_change | integer | Expected price change ($) |
| break_even | integer? | Score needed to maintain price |
| ceiling_score | integer? | Maximum scoring potential |
| is_named_team | boolean | Whether selected in team |
| late_change | boolean | Late withdrawal flag |
| consistency_rating | real? | 1-10 consistency rating (CV-inverse + avg factor) |
| score_std_dev | real? | Standard deviation of recent scores |
| recent_scores | text? | Comma-separated last 6-10 scores |
| is_debutant | boolean | First-year player flag |
| debut_round | integer? | Round of AFL debut (1-10) |
| cash_gen_potential | text? | "elite", "high", "medium", "low" |

### `my_team_players`
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| player_id | integer | FK to players.id |
| is_on_field | boolean | On-field vs bench |
| is_captain | boolean | Captain flag |
| is_vice_captain | boolean | Vice-captain flag |
| field_position | text | Position slot (DEF/MID/RUC/FWD) |

### `trade_recommendations`
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| player_out_id | integer | FK to players.id |
| player_in_id | integer | FK to players.id |
| reason | text | AI-generated reasoning |
| confidence | real | 0.0 to 1.0 confidence score |
| price_change | integer | Net price difference |
| score_difference | real | Net score difference |
| created_at | timestamp | Auto-generated |

### `league_settings`
| Column | Type | Default |
|--------|------|---------|
| id | serial PK | |
| team_name | text | "My Team" |
| salary_cap | integer | 10000000 |
| current_round | integer | 1 |
| trades_remaining | integer | 30 |
| total_trades_used | integer | 0 |

### `intel_reports`
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| category | text | See categories below |
| title | text | Report headline |
| content | text | Full analysis text |
| priority | text | "high", "medium", "low" |
| player_names | text? | Comma-separated names |
| source | text? | "ai_analysis", "squiggle_fixtures", "afl_news", etc. |
| actionable | boolean | Whether contains actionable advice |
| created_at | timestamp | |

### `intel_sources`
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| source_type | text | squiggle_fixtures, squiggle_tips, squiggle_ladder, afl_news, club_news, club_official, fantasy_news |
| source_url | text? | Source URL |
| title | text | Source headline |
| raw_content | text | Raw fetched content |
| processed_insights | text? | AI-processed summary |
| relevant_player_names | text? | Comma-separated affected players |
| round | integer? | AFL round number |
| is_processed | boolean | Whether AI has processed this |
| is_actionable | boolean | Whether it requires user action |
| fetched_at | timestamp | When data was fetched |
| processed_at | timestamp? | When AI processed it |

**Intel categories:** injuries, cash_cows, captain_picks, bye_strategy, pod_players, breakout, premium_trades, ground_conditions, tactical, historical, team_selection, fixtures

### `late_changes`
| Column | Type |
|--------|------|
| id | serial PK |
| player_id | integer |
| change_type | text |
| details | text |
| round | integer |
| created_at | timestamp |

### `users`
| Column | Type |
|--------|------|
| id | varchar PK (UUID) |
| username | text (unique) |
| password | text |

### `conversations` / `messages`
Chat history tables (id, title/content, timestamps, role, conversationId).

---

## 4. API Endpoints

### Players
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/players | List all 780 players |
| GET | /api/players/:id | Get single player |
| GET | /api/players/:id/report | AI scouting report (form, price, fixtures, comparisons) |
| PATCH | /api/players/:id | Update player fields |
| POST | /api/players/refresh-data | Refresh DPP/venue/BE data |

### My Team
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/my-team | Get team with player data joined |
| POST | /api/my-team | Add player (body: {playerId, fieldPosition}) |
| DELETE | /api/my-team/:id | Remove player |
| POST | /api/my-team/:id/captain | Set captain (clears previous) |
| POST | /api/my-team/:id/vice-captain | Set vice-captain (clears previous) |
| POST | /api/my-team/analyze | AI full team analysis with per-player verdicts |

### Trades
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/trade-recommendations | List all recommendations |
| POST | /api/trade-recommendations/generate | Generate algorithmic trades |
| POST | /api/trade-recommendations/generate-ai | Generate AI-powered trades |
| POST | /api/trade-recommendations/:id/execute | Execute trade (swap players, decrement trades) |

### Intel Hub
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/intel | All intel reports |
| GET | /api/intel/:category | Reports by category |
| POST | /api/intel/generate | Generate AI intel reports (10-14 reports) |
| POST | /api/intel/gather | Trigger live data gathering from external sources |
| GET | /api/intel/sources | Recent gathered source data (last 30) |
| GET | /api/intel/sources/stats | Source statistics and breakdown |
| POST | /api/intel/pre-game | Generate pre-game lockout advice |

### Settings
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/settings | Get league settings |
| PATCH | /api/settings | Update settings |

### AI Features
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/captain-advice | AI captain loophole advice with decision tree |
| POST | /api/analyze-screenshot | Upload screenshot for GPT-4o vision analysis |

### Late Changes
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/late-changes | Get late changes for current round |
| POST | /api/late-changes | Create late change alert |

### Scheduler
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/scheduler/status | Get scheduler running status |

---

## 5. AI Integration Architecture

### Environment Variables
```
AI_INTEGRATIONS_OPENAI_API_KEY=<key>
AI_INTEGRATIONS_OPENAI_BASE_URL=<url>
DATABASE_URL=<postgres connection string>
SESSION_SECRET=<session secret>
```

### OpenAI Client Setup
```typescript
import OpenAI from "openai";
const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});
```

### AI Functions (server/intel-engine.ts)

**1. generateIntelReports()** — Model: `gpt-4o-mini`
- Builds comprehensive player/team data summaries
- System prompt defines AFL Fantasy expert persona with knowledge of captain loophole, DPP, break-even, late changes
- User prompt includes: current round, team composition, game time slots, bye breakdown, DPP players, all available players
- Requests 10-14 categorized reports in JSON format
- Stores results in `intel_reports` table

**2. generateAITradeRecommendations()** — Model: `gpt-4o-mini`
- Sends team data + available players + optimization factors
- AI returns 5-8 ranked trades with confidence scores
- Matches player names to IDs and stores in `trade_recommendations`

**3. generateCaptainAdvice()** — Model: `gpt-4o-mini`
- Analyzes on-field players by game time slot
- Returns VC pick (early game), Captain pick (late game), threshold score, decision tree

**4. analyzeTeamScreenshot()** — Model: `gpt-4o` (vision)
- Accepts base64 image via multer upload
- GPT-4o vision identifies players, positions, scores from screenshot
- Returns structured analysis: players found, team assessment, recommendations, captain tip, trade suggestions

**5. analyzeFullTeam()** — Model: `gpt-4o-mini`
- Per-player verdicts: must_have, keep, monitor, trade, sell
- Captain and VC recommendations with loophole strategy
- Bye round risk assessment
- Team strengths and weaknesses
- Urgent action items

**6. generatePlayerReport()** — Model: `gpt-4o-mini`
- Comprehensive scouting report for individual players
- Form breakdown, price analysis, fixture outlook
- Captaincy case, DPP value assessment
- Player comparisons, trade targets, risk factors

### Data Helpers
- `buildPlayerSummary(players)` — Formats all player stats into text block
- `buildTeamSummary(team)` — Formats team with captain/bench markers
- `getGameSlots(team)` — Groups players by game time for loophole analysis
- `getByeRoundBreakdown(team)` — Groups players by bye round
- `getDPPPlayers(players)` — Lists DPP-eligible players

---

## 6. Live Data Gathering System

### Data Sources (135+ per cycle)

**Squiggle API** (`api.squiggle.com.au`)
- Requires `User-Agent: AFL-Fantasy-Machine/1.0` header
- Fixtures: `?q=games;year=YYYY;round=N` — Match details, scores, venues
- Tips/Predictions: `?q=tips;year=YYYY;round=N` — Model predictions with confidence
- Ladder: `?q=standings;year=YYYY` — Current standings

**Google News RSS (18 AFL clubs)** — ~89 items per cycle
- URL pattern: `https://news.google.com/rss/search?q={TEAM}+AFL&hl=en-AU&gl=AU&ceid=AU:en`
- All 18 teams: Adelaide Crows, Brisbane Lions, Carlton Blues, Collingwood Magpies, Essendon Bombers, Fremantle Dockers, Geelong Cats, Gold Coast Suns, GWS Giants, Hawthorn Hawks, Melbourne Demons, North Melbourne Kangaroos, Port Adelaide Power, Richmond Tigers, St Kilda Saints, Sydney Swans, West Coast Eagles, Western Bulldogs
- Batched in groups of 4 with 1.5s delays to avoid rate limiting

**Melbourne FC Official RSS** (`melbournefc.com.au/rss`) — ~8 items
- Direct official club RSS feed

**Fantasy-Specific News** — ~19 items
- Google News RSS queries for: "AFL Fantasy 2026", "SuperCoach AFL", "AFL injury list", "AFL team selection", "AFL Fantasy cash cow", "AFL Fantasy captain", "AFL Fantasy breakeven", "AFL Fantasy rookie"

**AFL.com.au News** — ~16 items
- Google News RSS filtered for fantasy-relevant keywords: injury, selection, trade, debut, captain, form, vest, etc.
- Article content extracted from linked pages when relevant

### Processing Pipeline (server/data-gatherer.ts)
```
1. Fetch data from all sources in parallel
2. Deduplicate against existing intel_sources (by title)
3. For AFL news items, fetch full article content
4. Store raw data in intel_sources table
5. Batch unprocessed items (up to 10)
6. Send to GPT-4o-mini for fantasy impact analysis
7. AI returns: summary, affected players, fantasy impact, urgency, category
8. Update intel_sources with processed insights
9. Create actionable intel_reports for high-impact items
```

### Scheduler (server/scheduler.ts)
- Starts 30 seconds after server boot
- Runs every 4 hours automatically
- Guards against concurrent runs
- Tracks gather count and last gather time
- Status available via `GET /api/scheduler/status`

### Pre-Game Advice (POST /api/intel/pre-game)
- Designed for use within 3 hours of first game lockout
- Analyzes: my team, latest intel, top available players
- Returns: trade deadline advice, captain recommendation, last-minute changes, player alerts

---

## 7. Storage Interface

`IStorage` in `server/storage.ts` defines all CRUD operations:

```typescript
interface IStorage {
  // Players
  getAllPlayers(): Promise<Player[]>
  getPlayer(id: number): Promise<Player | undefined>
  updatePlayer(id: number, data: Partial<Player>): Promise<Player>

  // My Team (returns PlayerWithTeamInfo - player + team metadata joined)
  getMyTeam(): Promise<PlayerWithTeamInfo[]>
  addToMyTeam(data: InsertMyTeamPlayer): Promise<MyTeamPlayer>
  removeFromMyTeam(id: number): Promise<void>
  setCaptain(playerId: number): Promise<void>
  setViceCaptain(playerId: number): Promise<void>

  // Trade Recommendations (returns with joined player data)
  getTradeRecommendations(): Promise<TradeRecommendationWithPlayers[]>
  getTradeRecommendation(id: number): Promise<TradeRecommendation | undefined>
  createTradeRecommendation(data: InsertTradeRec): Promise<TradeRecommendation>
  deleteTradeRecommendation(id: number): Promise<void>
  clearTradeRecommendations(): Promise<void>

  // Settings (auto-creates row 1 if missing)
  getSettings(): Promise<LeagueSettings>
  updateSettings(data: Partial<LeagueSettings>): Promise<LeagueSettings>

  // Intel Reports
  getIntelReports(): Promise<IntelReport[]>
  getIntelReportsByCategory(category: string): Promise<IntelReport[]>
  createIntelReport(data: InsertIntelReport): Promise<IntelReport>
  clearIntelReports(): Promise<void>

  // Late Changes
  getLateChanges(round: number): Promise<LateChange[]>
  createLateChange(data: InsertLateChange): Promise<LateChange>
}
```

---

## 8. Frontend Architecture

### Routing (wouter)
| Path | Page | Description |
|------|------|-------------|
| / | Dashboard | Stats, captain loophole, late alerts, top performers |
| /team | My Team | Manage squad by position tabs + AI analysis |
| /players | Players | Browse/search 780 players with card/table layout |
| /trades | Trades | Quick + AI trade recommendations with execute |
| /form | Form Guide | Hot/cold, top scorers, rising stars |
| /intel | Intel Hub | AI intel + live data gathering + pre-game advice |
| /analyze | Team Analyzer | Screenshot upload + GPT-4o vision analysis |
| /player/:id | Player Report | Per-player AI scouting report |
| /settings | Settings | League configuration |

### Data Fetching Pattern
All queries use TanStack Query v5 with default `queryFn` that fetches from `queryKey` URL:
```typescript
const { data, isLoading } = useQuery<Type[]>({ queryKey: ["/api/endpoint"] });
```

Mutations use `apiRequest` helper:
```typescript
const mutation = useMutation({
  mutationFn: () => apiRequest("POST", "/api/endpoint", body),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/endpoint"] }),
});
```

For per-item queries, use array keys for proper cache invalidation:
```typescript
queryKey: ['/api/players', id]  // NOT `/api/players/${id}`
```

### Mobile-First Design
- Sidebar collapses to sheet overlay on mobile (< 768px)
- Mobile header shows "AFL Fantasy Machine" branding with Zap icon
- `useIsMobile()` hook for conditional rendering
- All grids use responsive breakpoints: `grid-cols-2 sm:grid-cols-2 lg:grid-cols-4`
- Player lists switch from table rows (desktop) to cards (mobile)
- Touch targets minimum 44px (`min-h-[44px]` on sidebar items)
- Text scales: `text-xs sm:text-sm` pattern throughout
- Tabs horizontally scrollable on mobile with overflow wrapper
- Stat cards 2-column grid on mobile, 4-column on desktop
- Filter controls go full-width on mobile

### Theme System
CSS variables in `index.css` with `:root` (light) and `.dark` class:
- `--background`, `--foreground`, `--primary`, `--accent`, etc.
- HSL format without `hsl()` wrapper: `23 10% 23%`
- `darkMode: ["class"]` in tailwind.config.ts
- ThemeToggle component toggles `.dark` class on `document.documentElement`
- Navy/gold AFL-themed color scheme

---

## 9. Player Data

### Source
780 real 2026 AFL Fantasy players parsed from official DFS Australia Excel file using the `xlsx` npm package. Stored in `server/real-players-2026.json`.

### Distribution
| Position | Count |
|----------|-------|
| DEF | 258 |
| MID | 231 |
| RUC | 59 |
| FWD | 232 |
| DPP (dual position) | 95 |

### Price Range
$230,000 to $1,220,000

### Loading Process
1. `seed.ts` — Creates initial players if DB is empty
2. `expand-players.ts` — On each startup, loads from `real-players-2026.json`, matches existing players by name, inserts new ones with generated stats (avg score, form trend, break-even, ownership %, etc.)

---

## 10. Key Features

### Captain Loophole Strategy
- Dashboard card shows VC (early game) and C (late game) picks
- Displays doubled projected scores for each
- Decision tree tip: "If VC scores 110+, keep; otherwise switch to C"
- `/api/captain-advice` endpoint generates AI-powered picks with game time slot analysis

### Break-Even Analysis
- Players page shows BE column with color coding:
  - Green: avg score well above BE (making money)
  - Red: avg score below BE (losing value)
- Price change indicators (+/-) on each player

### DPP Badges
- Visual badges on players with dual position eligibility (95 DPP players)
- Intel reports analyze DPP exploitation opportunities

### Late Change Alerts
- Dashboard panel highlights at-risk players
- Players with injury status, late change flag, or not named in team
- Red-bordered card with monitor badges

### Screenshot AI Analysis
- Upload team screenshot (PNG/JPG, max 10MB)
- GPT-4o vision identifies players and positions
- Returns: players found, team analysis, recommendations, captain tip, trade suggestions

### Consistency Rating System
- Each player gets a 1-10 consistency rating based on CV-inverse (0.6 weight) + avg factor (0.4 weight)
- Elite: avg >= 80 AND rating >= 7.5 (green badge)
- Good: avg >= 70 AND rating >= 6.5 (blue badge)
- Average: rating >= 5.5 (yellow badge)
- Volatile: rating < 5.5 (red badge)
- Score sparkline SVG visualizes recent scores vs average
- `populateConsistencyData()` generates realistic scores on startup

### Debutant / Cash Cow Tracking
- Base price players (<= $150K): 70% flagged as debutant
- Rookie price (<= $250K): 40% flagged
- Cash generation rated: elite (20+ above BE), high (10-20), medium (slight), low
- Form Guide "Debutants" tab ranks by cash generation with scoring above BE
- Purple badges indicate debut round

### Intel Hub with Live Data
- AI-generated strategic reports across 12 categories
- Live data gathering from all 18 AFL clubs via Google News RSS, Squiggle API, AFL.com.au, fantasy-specific news
- 135+ sources per gathering cycle
- Automated 4-hour gathering cycle
- Pre-game lockout advice with trade/captain recommendations
- Stats dashboard: total sources, processed count, actionable count, source breakdown
- Category filtering with scrollable button bar

### Per-Player Scouting Reports
- Clickable player rows navigate to `/player/:id`
- AI generates comprehensive reports covering:
  - Form breakdown, price analysis, fixture outlook
  - Captaincy case, DPP value, player comparisons
  - Trade targets, risk factors

### Full Team Analysis
- AI evaluates every player with action verdicts
- Identifies team strengths and weaknesses
- Captain strategy recommendations
- Bye round risk assessment
- Urgent action items

---

## 11. Data Flow Diagrams

### Trade Generation Flow
```
User clicks "AI Analysis" → POST /api/trade-recommendations/generate-ai
  → intel-engine.ts: buildTeamSummary() + buildPlayerSummary()
  → OpenAI GPT-4o-mini (JSON mode)
  → Parse response, match player names to IDs
  → Store in trade_recommendations table
  → Return enriched recommendations with joined player data
```

### Intel Report Flow
```
User clicks "AI Analysis" → POST /api/intel/generate
  → intel-engine.ts: gather all player data, team data, game slots, byes, DPP
  → Build comprehensive system prompt (AFL Fantasy expert persona)
  → Build user prompt with all data + required report categories
  → OpenAI GPT-4o-mini (JSON mode, 6000 max tokens)
  → Parse 10-14 reports
  → Clear old reports, store new ones
  → Return all reports
```

### Live Data Gathering Flow
```
User clicks "Gather Data" → POST /api/intel/gather
  (OR scheduler triggers automatically every 4 hours)
  → data-gatherer.ts: fetchSquiggleGames + fetchSquiggleTips + fetchSquiggleLadder + fetchAFLRSS (parallel)
  → Deduplicate against existing intel_sources by title
  → For AFL news: fetch full article content if available
  → Store raw data in intel_sources table
  → Process unprocessed items with GPT-4o-mini
  → AI extracts: fantasy impact, affected players, urgency, category
  → Create actionable intel_reports for high-impact items
  → Return {fetched, processed} counts
```

### Screenshot Analysis Flow
```
User uploads image → POST /api/analyze-screenshot (multipart/form-data)
  → multer parses file to memory buffer
  → Convert to base64
  → intel-engine.ts: analyzeTeamScreenshot()
  → OpenAI GPT-4o vision with image_url content
  → Parse JSON response
  → Return: players, analysis, recommendations, captainTip, tradeSuggestions
```

### Pre-Game Advice Flow
```
User clicks "Pre-Game" → POST /api/intel/pre-game
  → data-gatherer.ts: generatePreGameAdvice()
  → Load: my team, latest processed intel, top available players
  → OpenAI GPT-4o-mini with comprehensive context
  → Return: tradeDeadlineAdvice, captainRecommendation, lastMinuteChanges, playerAlerts
```

---

## 12. Deployment

### Environment Requirements
- Node.js 20+
- PostgreSQL database
- OpenAI API key with GPT-4o and GPT-4o-mini access

### Build & Run
```bash
npm install
npm run db:push          # Sync schema to database
npm run dev              # Development (Express + Vite HMR)
npm run build            # Production build
npm start                # Production server
```

### Startup Sequence
1. Express server initializes
2. `seedDatabase()` — Creates initial data if DB is empty
3. `expandPlayerDatabase()` — Loads 780 real players from JSON
4. `populateConsistencyData()` — Generates consistency ratings, debutant flags, cash gen potential
5. `registerRoutes()` — Sets up all API endpoints
6. `startScheduler()` — Begins automated 4-hour data gathering cycle (30s delay)
7. Vite dev server serves frontend (dev) or static build (prod)

### Database Setup
Schema is managed by Drizzle ORM. Run `npm run db:push` to create/sync all tables. Seed data is applied automatically on first server start if the players table is empty.

### Key Config Files
- `drizzle.config.ts` — Database connection config
- `vite.config.ts` — Frontend build config with aliases (@/, @shared/, @assets/)
- `tailwind.config.ts` — Theme configuration
- `tsconfig.json` — TypeScript paths and compilation settings
