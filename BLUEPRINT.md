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
| Dark Mode | Class-based toggle with localStorage sync |

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
│   │   │   ├── app-sidebar.tsx        # Navigation sidebar
│   │   │   ├── theme-toggle.tsx       # Dark/light mode toggle
│   │   │   ├── error-state.tsx        # Reusable error display
│   │   │   └── ui/                    # shadcn components (button, card, badge, etc.)
│   │   └── pages/
│   │       ├── dashboard.tsx          # Main dashboard with stats, captain, alerts
│   │       ├── my-team.tsx            # Team management by position
│   │       ├── players.tsx            # Player database browser
│   │       ├── trades.tsx             # Trade recommendation engine
│   │       ├── form-guide.tsx         # Player form analysis
│   │       ├── intel-hub.tsx          # AI intelligence reports
│   │       ├── team-analyzer.tsx      # Screenshot upload + AI analysis
│   │       ├── settings-page.tsx      # League settings
│   │       └── not-found.tsx          # 404 page
├── server/
│   ├── index.ts                       # Server entry point
│   ├── routes.ts                      # All API route definitions
│   ├── storage.ts                     # IStorage interface + DatabaseStorage
│   ├── db.ts                          # Drizzle database connection
│   ├── vite.ts                        # Vite dev server middleware
│   ├── intel-engine.ts                # OpenAI integration (intel, trades, captain, vision)
│   └── seed.ts                        # Database seeding with 43 AFL players
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
| price | integer | Current price in dollars |
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
| source | text? | e.g., "ai_analysis" |
| actionable | boolean | Whether contains actionable advice |
| created_at | timestamp | |

**Intel categories:** injuries, cash_cows, captain_picks, bye_strategy, pod_players, breakout, premium_trades, ground_conditions, tactical, historical

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
| GET | /api/players | List all 43 players |
| GET | /api/players/:id | Get single player |
| PATCH | /api/players/:id | Update player fields |
| POST | /api/players/refresh-data | Refresh DPP/venue/BE data from hardcoded maps |

### My Team
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/my-team | Get team with player data joined |
| POST | /api/my-team | Add player (body: {playerId, fieldPosition}) |
| DELETE | /api/my-team/:id | Remove player |
| POST | /api/my-team/:id/captain | Set captain (clears previous) |
| POST | /api/my-team/:id/vice-captain | Set vice-captain (clears previous) |

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

### Settings
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/settings | Get league settings |
| PATCH | /api/settings | Update settings |

### AI Features
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/captain-advice | AI captain loophole advice |
| POST | /api/analyze-screenshot | Upload screenshot for AI vision analysis |

### Late Changes
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/late-changes | Get late changes for current round |
| POST | /api/late-changes | Create late change alert |

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

### Data Helpers
- `buildPlayerSummary(players)` — Formats all player stats into text block
- `buildTeamSummary(team)` — Formats team with captain/bench markers
- `getGameSlots(team)` — Groups players by game time for loophole analysis
- `getByeRoundBreakdown(team)` — Groups players by bye round
- `getDPPPlayers(players)` — Lists DPP-eligible players

---

## 6. Storage Interface

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

## 7. Frontend Architecture

### Routing (wouter)
| Path | Page | Description |
|------|------|-------------|
| / | Dashboard | Stats, captain loophole, late alerts, top performers |
| /team | My Team | Manage squad by position tabs |
| /players | Players | Browse/search all players with stats |
| /trades | Trades | Trade recommendations with execute |
| /form | Form Guide | Player form analysis with charts |
| /intel | Intel Hub | AI-generated strategic reports |
| /analyze | Team Analyzer | Screenshot upload + AI analysis |
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

### Mobile-First Design
- Sidebar collapses to sheet overlay on mobile (< 768px)
- `useIsMobile()` hook for conditional rendering
- All grids use responsive breakpoints: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`
- Player lists switch from table rows (desktop) to cards (mobile)
- Touch targets minimum 44px
- Text scales: `text-xs sm:text-sm` pattern throughout
- Tabs horizontally scrollable on mobile

### Theme System
CSS variables in `index.css` with `:root` (light) and `.dark` class:
- `--background`, `--foreground`, `--primary`, `--accent`, etc.
- HSL format without `hsl()` wrapper: `23 10% 23%`
- `darkMode: ["class"]` in tailwind.config.ts
- ThemeToggle component toggles `.dark` class on `document.documentElement`

---

## 8. Seed Data

43 AFL players seeded in `server/seed.ts` across all positions:
- 6 DEF: Daicos, Dawson, Docherty, Sicily, Laird, Zorko
- 14 MID: Neale, Bontempelli, Oliver, Petracca, Green, Brayshaw, Butters, Gulden, Heeney, Cripps, Dunkley, Serong, Walsh, plus others
- 4 RUC: English, Gawn, Grundy, Darcy
- 8 FWD: Cameron, Curnow, Lynch, McKay, Naughton, Hogan, plus others
- Additional utility/DPP players

Each player has: price ($300K-$620K), avg score, last 3/5 averages, season total, games played, ownership %, form trend, bye round, next opponent, venue, game time, projected score, break-even, ceiling score, price change.

13 players have DPP status with secondary positions.

---

## 9. Key Features

### Captain Loophole Strategy
- Dashboard card shows VC (early game) and C (late game) picks
- Displays doubled projected scores for each
- Decision tree tip: "If VC scores 110+, keep; otherwise switch to C"
- `/api/captain-advice` endpoint generates AI-powered picks

### Break-Even Analysis
- Players page shows BE column with color coding:
  - Green: avg score well above BE (making money)
  - Red: avg score below BE (losing value)
- Price change indicators (+/-) on each player

### DPP Badges
- Visual badges on players with dual position eligibility
- Intel reports analyze DPP exploitation opportunities

### Late Change Alerts
- Dashboard panel highlights at-risk players
- Players with injury status, late change flag, or not named in team
- Red-bordered card with monitor badges

### Screenshot AI Analysis
- Upload team screenshot (PNG/JPG, max 10MB)
- GPT-4o vision identifies players and positions
- Returns: players found, team analysis, recommendations, captain tip, trade suggestions
- Drag-and-drop / tap-to-upload UI

### Intel Hub
- 10 categories of AI-generated reports
- Each report: title, content, priority badge, actionable flag
- Category filtering with scrollable button bar
- Stats: total reports, high priority count, actionable count

---

## 10. Deployment

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

### Database Setup
Schema is managed by Drizzle ORM. Run `npm run db:push` to create/sync all tables. Seed data is applied automatically on first server start if the players table is empty.

### Key Config Files
- `drizzle.config.ts` — Database connection config
- `vite.config.ts` — Frontend build config with aliases (@/, @shared/, @assets/)
- `tailwind.config.ts` — Theme configuration
- `tsconfig.json` — TypeScript paths and compilation settings

---

## 11. Data Flow Diagrams

### Trade Generation Flow
```
User clicks "Generate" → POST /api/trade-recommendations/generate-ai
  → intel-engine.ts: buildTeamSummary() + buildPlayerSummary()
  → OpenAI GPT-4o-mini (JSON mode)
  → Parse response, match player names to IDs
  → Store in trade_recommendations table
  → Return enriched recommendations with joined player data
```

### Intel Report Flow
```
User clicks "Generate Intel" → POST /api/intel/generate
  → intel-engine.ts: gather all player data, team data, game slots, byes, DPP
  → Build comprehensive system prompt (AFL Fantasy expert persona)
  → Build user prompt with all data + required report categories
  → OpenAI GPT-4o-mini (JSON mode, 6000 max tokens)
  → Parse 10-14 reports
  → Clear old reports, store new ones
  → Return all reports
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
