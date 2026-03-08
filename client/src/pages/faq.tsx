import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HelpCircle, Zap, Calculator, Brain, ArrowLeftRight, Radio, Calendar, Crown, TrendingUp, BarChart3, Database, Clock, Users, Target, Shield } from "lucide-react";

interface FAQItem {
  id: string;
  question: string;
  answer: string | JSX.Element;
  category: string;
}

const faqItems: FAQItem[] = [
  {
    id: "what-is-afm",
    category: "General",
    question: "What is AFL Fantasy Machine?",
    answer: (
      <div className="space-y-2">
        <p>AFL Fantasy Machine is an advanced decision-support tool for AFL Fantasy Classic coaches. It combines real-time data, statistical projections, tag intelligence, and trade analysis to help you make smarter decisions every round.</p>
        <p>The app provides a comprehensive dashboard with projected scores, captain advice (including the loophole strategy), trade recommendations with detailed reasoning, risk alerts for injuries and unavailable players, and a Monte Carlo simulation engine to model your team's scoring range.</p>
        <p>Whether you're a beginner or a seasoned top-1000 coach, AFL Fantasy Machine gives you the analytical edge to climb the rankings.</p>
      </div>
    ),
  },
  {
    id: "scoring-system",
    category: "Rules",
    question: "How does the scoring system work?",
    answer: (
      <div className="space-y-2">
        <p>AFL Fantasy Classic uses the following scoring system for each stat:</p>
        <ul className="list-none space-y-1 pl-2">
          <li><span className="font-mono text-sm">Kick: +3 pts</span></li>
          <li><span className="font-mono text-sm">Handball: +2 pts</span></li>
          <li><span className="font-mono text-sm">Mark: +3 pts</span></li>
          <li><span className="font-mono text-sm">Tackle: +4 pts</span></li>
          <li><span className="font-mono text-sm">Hitout: +1 pt</span></li>
          <li><span className="font-mono text-sm">Goal: +6 pts</span></li>
          <li><span className="font-mono text-sm">Behind: +1 pt</span></li>
          <li><span className="font-mono text-sm">Free Kick Against: -3 pts</span></li>
        </ul>
        <p>A player's total fantasy score for a match is the sum of all these individual stat contributions. Midfielders and ruckmen tend to score highest due to accumulating disposals (kicks + handballs), marks, and tackles throughout a game. An elite midfielder typically averages 100-115 points per game.</p>
      </div>
    ),
  },
  {
    id: "projections",
    category: "Analytics",
    question: "How are player projections calculated?",
    answer: (
      <div className="space-y-2">
        <p>Player projections use a Bayesian blending model that combines multiple data signals:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Recent form:</strong> Last 2 games are weighted at 60%, with the previous 3 games at 40%, creating a form-responsive estimate.</li>
          <li><strong>Season average:</strong> The overall season average is blended 50/50 with the Bayesian recent-form estimate.</li>
          <li><strong>Opponent adjustments:</strong> Position concessions data adjusts projections based on how many points the opposition gives up to each position.</li>
          <li><strong>Venue factors:</strong> Home/away and ground familiarity are considered.</li>
          <li><strong>Floor and ceiling:</strong> Calculated using standard deviation multipliers (1.0x for floor, 1.3x for ceiling) to give a realistic scoring range.</li>
        </ul>
        <p>The projection engine also factors in injury status, named team status, and bye rounds to provide actionable scores rather than just raw averages.</p>
      </div>
    ),
  },
  {
    id: "tag-intelligence",
    category: "Analytics",
    question: "What is the tag intelligence system?",
    answer: (
      <div className="space-y-2">
        <p>The tag intelligence system tracks which AFL teams use dedicated taggers and predicts when your premium midfielders might be targeted. It maintains profiles for all 18 teams including:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Tag frequency:</strong> How often a team deploys a tagger (e.g., Carlton at 75%, St Kilda at 70%).</li>
          <li><strong>Primary tagger:</strong> The player most commonly used in the tagging role (e.g., Ed Curnow at Carlton, Marcus Windhager at St Kilda).</li>
          <li><strong>Historical matchups:</strong> Past tag assignments and the resulting score impact on targeted players.</li>
        </ul>
        <p>When your midfielders face a team that frequently tags, the system generates a risk-level warning (high, moderate, or low) with specific advice. For captaincy decisions, tag warnings are especially important — a tagged captain can cost you 40-60 points compared to an untagged alternative.</p>
      </div>
    ),
  },
  {
    id: "trade-engine",
    category: "Strategy",
    question: "How does the trade engine work?",
    answer: (
      <div className="space-y-2">
        <p>The trade engine evaluates every possible trade for your team using a multi-factor scoring system:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Trade EV (Expected Value):</strong> Combines projected score difference, volatility penalty, and cash generation potential into a single metric.</li>
          <li><strong>Player-out scoring:</strong> Rates how urgently a player should be traded based on injury status, form decline, breakeven vs average, price trajectory, age, and role security.</li>
          <li><strong>Player-in scoring:</strong> Evaluates incoming players on scoring upside, cash generation potential, DPP flexibility, breakeven advantage, and fixture difficulty.</li>
          <li><strong>Hold analysis:</strong> Before recommending a trade-out, the engine checks if the player is a "keeper" (set-and-forget quality), "hold for value" (still generating cash), or "stepping stone" (bench filler). This prevents premature trades.</li>
          <li><strong>Season context:</strong> Recommendations adapt to the season phase — early rounds prioritise cash generation from rookies, mid-season focuses on bye management, and the run home targets premium upgrades.</li>
        </ul>
        <p>Each trade recommendation includes detailed reasoning so you understand exactly why the trade is suggested.</p>
      </div>
    ),
  },
  {
    id: "breakeven",
    category: "Rules",
    question: "What is breakeven and how does it work?",
    answer: (
      <div className="space-y-2">
        <p>Breakeven (BE) is the score a player needs to achieve in their next game to maintain their current price. It's the single most important number for understanding price movement.</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Score above BE:</strong> The player's price will increase. The further above BE they score, the bigger the price rise.</li>
          <li><strong>Score below BE:</strong> The player's price will decrease.</li>
          <li><strong>Negative BE:</strong> The player is guaranteed to rise in price regardless of their score — these are prime cash cow targets.</li>
        </ul>
        <p>Price changes are calculated using the "magic number" of 10,490. The approximate weekly price change is: (Average Score - Breakeven) x 1,800.</p>
        <p>For example, a player averaging 80 with a BE of 50 would gain approximately (80-50) x 1,800 = $54,000 per week. Cash cows with negative breakevens are critical in the early rounds to generate salary cap space for premium upgrades later.</p>
      </div>
    ),
  },
  {
    id: "live-scores",
    category: "Features",
    question: "How does the live scores feature work?",
    answer: (
      <div className="space-y-2">
        <p>The live scores page shows real-time match data and fantasy scores for your team during game day. Data is sourced from:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Squiggle API:</strong> Provides match scores, completion status, and timing for all AFL games.</li>
          <li><strong>Footywire:</strong> Provides detailed player statistics (kicks, handballs, marks, tackles, etc.) which are converted into fantasy scores using the standard AFL Fantasy Classic scoring formula.</li>
        </ul>
        <p>Your team's total score is calculated in real time, with captain scores doubled. The system also shows projected team scores based on player averages for games that haven't started yet, giving you a running total estimate throughout the round.</p>
      </div>
    ),
  },
  {
    id: "bye-rounds",
    category: "Rules",
    question: "What are bye rounds?",
    answer: (
      <div className="space-y-2">
        <p>Bye rounds occur in Rounds 12, 13, and 14 of the AFL season. During each bye round, six teams don't play, meaning their players score zero for that round.</p>
        <p>Key bye round strategies:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Extra trades:</strong> You receive 3 trades per bye round instead of the usual 2, helping you manage coverage.</li>
          <li><strong>Spread your byes:</strong> Ensure your squad has players spread across all three bye rounds so you always have enough on-field players.</li>
          <li><strong>Bench optimisation:</strong> Your bench players become critical during byes — make sure they're playing and can cover for missing starters.</li>
          <li><strong>Pre-bye planning:</strong> The best coaches start planning for byes from Round 8-9, using trades to balance their bye round coverage.</li>
        </ul>
        <p>The dashboard highlights when any of your on-field players are on a bye, and the trade engine factors bye coverage into its recommendations.</p>
      </div>
    ),
  },
  {
    id: "captain-vc",
    category: "Strategy",
    question: "How does the captain/vice-captain system work?",
    answer: (
      <div className="space-y-2">
        <p>Each round, you select a Captain (C) and Vice-Captain (VC). Your captain's score is doubled, making this the most impactful decision each week.</p>
        <p><strong>The 50% TOG Rule (2026):</strong> If your captain plays less than 50% time on ground (e.g., due to injury during the game), the vice-captain's score is doubled instead — but only if the VC's doubled score would be higher.</p>
        <p>Choosing the right captain can be worth 50-120 extra points per round. The app shows captain probability ratings and projected doubled scores to help you decide.</p>
      </div>
    ),
  },
  {
    id: "loophole",
    category: "Strategy",
    question: "What is the loophole strategy?",
    answer: (
      <div className="space-y-2">
        <p>The "loophole" is the most powerful captaincy strategy in AFL Fantasy. It exploits the VC/C timing to guarantee a high score:</p>
        <ol className="list-decimal pl-5 space-y-1">
          <li><strong>Set your VC</strong> on a player who plays in an early game (e.g., Thursday or Friday night).</li>
          <li><strong>Wait and watch:</strong> If your VC scores well (e.g., 120+ which doubles to 240+), you can lock in that score.</li>
          <li><strong>Set your C</strong> on a player you'll bench — ideally someone who won't play or will score very low. When the captain scores low (or zero), the VC's higher doubled score kicks in via the emergency/loophole rule.</li>
          <li><strong>If VC underperforms:</strong> Simply captain your best remaining player who plays later in the round.</li>
        </ol>
        <p>The dashboard's Captain Loophole Strategy section shows your VC's game time and projected doubled score to help you execute this strategy. The key is having your VC play early and your captain decision available for a later game.</p>
      </div>
    ),
  },
  {
    id: "price-changes",
    category: "Rules",
    question: "How does price change work in AFL Fantasy?",
    answer: (
      <div className="space-y-2">
        <p>Player prices change weekly based on their performance relative to their breakeven. The formula uses the "magic number" of 10,490:</p>
        <p className="font-mono text-sm bg-muted px-3 py-2 rounded-md">Starting Price = 2025 Average Score x 10,490</p>
        <p>During the season, prices adjust based on recent scoring. Players who consistently score above their breakeven rise in price; those scoring below it drop.</p>
        <p>Key pricing rules:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Rookie floor:</strong> $230,000 — no player can drop below this.</li>
          <li><strong>Rookie ceiling:</strong> $350,000 — starting price cap for rookies.</li>
          <li><strong>Missed season discount:</strong> Players who missed 2025 are discounted by 30%.</li>
        </ul>
        <p>Understanding price movement is essential for building team value. Buy underpriced players before they rise, and sell overpriced players before they fall.</p>
      </div>
    ),
  },
  {
    id: "trades-per-round",
    category: "Rules",
    question: "How many trades do I get per round?",
    answer: (
      <div className="space-y-2">
        <p>The trade allocation for AFL Fantasy Classic 2026 is:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Round 1:</strong> No trades available (you start with your drafted team).</li>
          <li><strong>Rounds 2-11, 15-24:</strong> 2 trades per round.</li>
          <li><strong>Rounds 12-14 (Bye Rounds):</strong> 3 trades per round to help manage bye coverage.</li>
        </ul>
        <p>Trades do not carry over between rounds — use them or lose them. Strategic coaches plan their trades ahead, sometimes banking on "two-week plans" where Round 1 trades set up for a bigger move the following round.</p>
        <p>The dashboard tracks your remaining trades for the current round and total trades used across the season.</p>
      </div>
    ),
  },
  {
    id: "positions",
    category: "Rules",
    question: "What positions are available?",
    answer: (
      <div className="space-y-2">
        <p>AFL Fantasy Classic uses the following squad structure (30 players total, 22 on field):</p>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <div className="bg-muted/50 p-2 rounded-md">
            <p className="font-semibold text-sm">DEF (Defenders)</p>
            <p className="text-xs text-muted-foreground">8 total: 6 on field, 2 bench</p>
          </div>
          <div className="bg-muted/50 p-2 rounded-md">
            <p className="font-semibold text-sm">MID (Midfielders)</p>
            <p className="text-xs text-muted-foreground">10 total: 8 on field, 2 bench</p>
          </div>
          <div className="bg-muted/50 p-2 rounded-md">
            <p className="font-semibold text-sm">RUC (Ruckmen)</p>
            <p className="text-xs text-muted-foreground">3 total: 2 on field, 1 bench</p>
          </div>
          <div className="bg-muted/50 p-2 rounded-md">
            <p className="font-semibold text-sm">FWD (Forwards)</p>
            <p className="text-xs text-muted-foreground">8 total: 6 on field, 2 bench</p>
          </div>
        </div>
        <p className="mt-2">There is also 1 UTIL (Utility) spot on field that can be filled by any position.</p>
        <p><strong>Dual Position Players (DPP):</strong> Some players are eligible in two positions (e.g., MID/FWD). This adds flexibility — you can play a high-scoring midfielder in your forward line. DPP eligibility can change mid-season based on where a player spends time on the field.</p>
      </div>
    ),
  },
  {
    id: "team-analyzer",
    category: "Features",
    question: "How does the Team Upload & Analyser work?",
    answer: (
      <div className="space-y-2">
        <p>The Team Upload & Analyser provides a visual snapshot of your squad structure and identifies strengths, weaknesses, and areas for improvement:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Position breakdown:</strong> Shows scoring distribution across DEF, MID, RUC, and FWD lines.</li>
          <li><strong>Bye round coverage:</strong> Maps how many players you have across each bye round to flag potential shortfalls.</li>
          <li><strong>Value analysis:</strong> Identifies underpriced and overpriced players in your squad.</li>
          <li><strong>Risk assessment:</strong> Highlights injury-prone players, late changes, and tag threats.</li>
        </ul>
        <p>Use it before making trades to understand the full impact on your team structure.</p>
      </div>
    ),
  },
  {
    id: "consistency-rating",
    category: "Analytics",
    question: "How is the consistency rating calculated?",
    answer: (
      <div className="space-y-2">
        <p>The consistency rating (0-10 scale) measures how reliable a player's scoring is week to week. It combines two factors:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Coefficient of Variation (CV) — 60% weight:</strong> The standard deviation divided by the mean score. Lower CV means more consistent scoring. A CV below 0.15 is very consistent; above 0.30 is volatile.</li>
          <li><strong>Average score contribution — 40% weight:</strong> Higher averages contribute to the rating, normalised against a baseline of 110 points.</li>
        </ul>
        <p>A player averaging 105 with low variance (e.g., scores between 95-115 most weeks) will have a much higher consistency rating than a player averaging 105 who swings between 60 and 150. Consistent players are more valuable for captaincy and set-and-forget selections.</p>
      </div>
    ),
  },
  {
    id: "simulation-engine",
    category: "Analytics",
    question: "How does the simulation engine work?",
    answer: (
      <div className="space-y-2">
        <p>The Monte Carlo simulation engine runs 10,000 iterations of your team's round to model the full range of possible outcomes:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>For each player:</strong> A random score is generated using a normal distribution centred on their projected score, with spread determined by their score standard deviation.</li>
          <li><strong>Captain doubling:</strong> The captain's score is doubled in each iteration.</li>
          <li><strong>Score floor:</strong> No individual player score goes below 0.</li>
        </ul>
        <p>The simulation produces:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Expected total:</strong> Average across all 10,000 simulations.</li>
          <li><strong>Floor (10th percentile):</strong> Your "bad week" scenario.</li>
          <li><strong>Ceiling (90th percentile):</strong> Your "great week" scenario.</li>
          <li><strong>Score distribution histogram:</strong> Visual breakdown of how likely each score range is.</li>
          <li><strong>Risk contributors:</strong> Which players add the most variance (uncertainty) to your total.</li>
        </ul>
      </div>
    ),
  },
  {
    id: "data-sources",
    category: "Data",
    question: "What data sources does the app use?",
    answer: (
      <div className="space-y-2">
        <p>AFL Fantasy Machine aggregates data from multiple sources:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Squiggle API:</strong> Match scores, fixtures, completion status, and game timing for the current AFL season.</li>
          <li><strong>Footywire:</strong> Detailed player match statistics (kicks, handballs, marks, tackles, hitouts, goals, behinds, frees against) which are used to calculate fantasy scores.</li>
          <li><strong>AFL Fantasy pricing data:</strong> Player prices, breakevens, ownership percentages, and named squads from the official competition.</li>
          <li><strong>Historical tag data:</strong> Curated database of known tagger assignments and their impact on targeted players across the 2024 and 2025 seasons.</li>
        </ul>
        <p>All data is combined with the app's projection engine and trade analysis algorithms to produce actionable insights.</p>
      </div>
    ),
  },
  {
    id: "data-updates",
    category: "Data",
    question: "How often is data updated?",
    answer: (
      <div className="space-y-2">
        <p>Data freshness varies by type:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Live scores:</strong> Fetched on-demand when you view the live scores page during match day.</li>
          <li><strong>Player stats:</strong> Updated after each round's matches are completed, sourced from Footywire match pages.</li>
          <li><strong>Projections:</strong> Recalculated whenever player data is refreshed, using the latest averages and form trends.</li>
          <li><strong>Trade recommendations:</strong> Generated fresh each time you visit the trade page, based on current team composition and market data.</li>
          <li><strong>Intel Hub reports:</strong> Generated and refreshed by the admin system, typically updated before each round with the latest news and analysis.</li>
        </ul>
      </div>
    ),
  },
  {
    id: "import-team",
    category: "Features",
    question: "How do I import my team from AFL Fantasy?",
    answer: (
      <div className="space-y-2">
        <p>The fastest way to get started is by uploading a screenshot of your AFL Fantasy team. Follow these steps:</p>
        <ol className="list-decimal pl-5 space-y-1">
          <li><strong>Open the AFL Fantasy app</strong> on your phone.</li>
          <li><strong>Go to "My Team"</strong> so your full squad is visible.</li>
          <li><strong>Tap the share icon</strong> (top-right corner of the screen).</li>
          <li><strong>Choose "Save Image"</strong> to save the team screenshot to your camera roll.</li>
          <li><strong>Upload the screenshot</strong> using the Team Upload & Analyser page or during onboarding (Step 3).</li>
        </ol>
        <p>After uploading, the AI will identify your players from the image. You'll see a list of matched players with their positions. Click the <strong>"Save as My Team"</strong> button to save them as your current squad.</p>
        <p>If any players aren't matched correctly, you can manually adjust your team from the My Team page or the Players page afterwards.</p>
      </div>
    ),
  },
  {
    id: "save-team",
    category: "Features",
    question: "How do I save my team?",
    answer: (
      <div className="space-y-2">
        <p>The quickest way to set up your team is by <strong>uploading a screenshot</strong> from the AFL Fantasy app. Use the Team Upload & Analyser page or the onboarding wizard to upload your screenshot, then click <strong>"Save as My Team"</strong> after the analysis identifies your players.</p>
        <p>You can also build and manage your team manually through the My Team page:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Add players:</strong> Search and add players from the Players page to fill your 30-player squad.</li>
          <li><strong>Set field positions:</strong> Assign players as on-field or bench in each position line.</li>
          <li><strong>Select captain/VC:</strong> Tap on a player to set them as captain or vice-captain.</li>
          <li><strong>Make trades:</strong> Use the Trade Centre to swap players in and out of your squad.</li>
        </ul>
        <p>All changes are saved automatically to your account. Your team data persists between sessions, and all projections, trade recommendations, and risk alerts are calculated based on your current squad composition.</p>
      </div>
    ),
  },
  {
    id: "intel-hub",
    category: "Features",
    question: "What is the Intel Hub?",
    answer: (
      <div className="space-y-2">
        <p>The Intel Hub is your central news and intelligence feed. It aggregates and analyses fantasy-relevant information including:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Injury updates:</strong> Breaking news about player injuries, expected return dates, and their fantasy impact.</li>
          <li><strong>Team selection changes:</strong> Late changes, inclusions, and omissions that affect your team.</li>
          <li><strong>Role changes:</strong> When a player's on-field role shifts (e.g., moved to the wing, given more centre bounces), impacting their scoring potential.</li>
          <li><strong>Tag assignments:</strong> Confirmed or predicted tagger matchups for upcoming games.</li>
          <li><strong>Breakout alerts:</strong> Players showing signs of a sustained scoring increase.</li>
        </ul>
        <p>Reports are categorised by priority (high, medium, low) and flagged as actionable when they require an immediate response from your team.</p>
      </div>
    ),
  },
];

const categoryIcons: Record<string, typeof HelpCircle> = {
  General: Zap,
  Rules: Calculator,
  Analytics: Brain,
  Strategy: Target,
  Features: BarChart3,
  Data: Database,
};

const categories = ["General", "Rules", "Strategy", "Analytics", "Features", "Data"];

export default function FAQPage() {
  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6" data-testid="page-faq">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <HelpCircle className="w-5 h-5 text-accent" />
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight" data-testid="text-faq-title">
            Frequently Asked Questions
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Everything you need to know about AFL Fantasy Machine and AFL Fantasy Classic.
        </p>
      </div>

      {categories.map((cat) => {
        const items = faqItems.filter((item) => item.category === cat);
        if (items.length === 0) return null;
        const Icon = categoryIcons[cat] || HelpCircle;
        return (
          <Card key={cat} data-testid={`card-faq-category-${cat.toLowerCase()}`}>
            <CardHeader className="pb-2 px-4 pt-4">
              <CardTitle className="text-sm sm:text-base font-semibold flex items-center gap-2">
                <Icon className="w-4 h-4 text-accent" />
                {cat}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <Accordion type="multiple" className="w-full">
                {items.map((item) => (
                  <AccordionItem key={item.id} value={item.id} data-testid={`faq-item-${item.id}`}>
                    <AccordionTrigger
                      className="text-left text-sm sm:text-base hover:no-underline"
                      data-testid={`faq-trigger-${item.id}`}
                    >
                      {item.question}
                    </AccordionTrigger>
                    <AccordionContent data-testid={`faq-content-${item.id}`}>
                      <div className="text-sm text-muted-foreground leading-relaxed pt-1">
                        {item.answer}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
