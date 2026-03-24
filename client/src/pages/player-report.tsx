import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Brain,
  Loader2,
} from "lucide-react";
import { PlayerAvatar, getPlayerPhotoUrl } from "@/components/player-avatar";
import { getTeamColors, getTeamAbbr } from "@/lib/afl-teams";
import type { Player } from "@shared/schema";

interface MatchHistoryEntry {
  round: number;
  opponent: string | null;
  venue: string | null;
  score: number;
  avg: number;
  avgSince: number;
  total: number;
  tog: number | null;
  kicks: number | null;
  handballs: number | null;
  marks: number | null;
  tackles: number | null;
  hitouts: number | null;
  goals: number | null;
  behinds: number | null;
  freesAgainst: number | null;
  inside50s: number | null;
  rebound50s: number | null;
  contestedPoss: number | null;
  uncontestedPoss: number | null;
  cba: number | null;
}

interface AggBreakdown {
  name: string;
  games: number;
  avgScore: number;
  kicks: number;
  handballs: number;
  marks: number;
  tackles: number;
  hitouts: number;
  goals: number;
  behinds: number;
  freesAgainst: number;
}

interface UpcomingFixture {
  round: number;
  opponent: string;
  venue: string;
  date: string;
  localTime: string;
  isHome: boolean;
}

interface DetailedStatsData {
  player: Player;
  matchHistory: MatchHistoryEntry[];
  upcomingFixtures: UpcomingFixture[];
  opponentBreakdown: AggBreakdown[];
  venueBreakdown: AggBreakdown[];
  overview: {
    highestScore: number | null;
    lowestScore: number | null;
    totalPoints: number;
    pricePerPoint: number | null;
    roundPriceChange: number;
    seasonPriceChange: number;
  };
}

interface PlayerReportData {
  overview: string;
  verdict: string;
  verdictReasoning: string;
  formBreakdown: string;
  priceAnalysis: string;
  fixtureOutlook: string;
  captaincyCase: string;
  dppValue: string;
  comparisonPlayers: { name: string; reason: string }[];
  tradeTargets: { name: string; reason: string; direction: string }[];
  riskFactors: string[];
  keyStats: { label: string; value: string; trend: string }[];
}

type TabId = "overview" | "matchStats" | "fixtureStats" | "opposition" | "venue" | "aiReport";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "matchStats", label: "Match Stats" },
  { id: "fixtureStats", label: "Fixture Stats" },
  { id: "opposition", label: "Opposition" },
  { id: "venue", label: "Venue" },
  { id: "aiReport", label: "AI Report" },
];

function formatPrice(price: number): string {
  if (price >= 1000000) return `$${(price / 1000000).toFixed(3)}M`;
  return `$${(price / 1000).toFixed(0)}k`;
}

function formatPriceChange(change: number): string {
  const prefix = change >= 0 ? "+" : "";
  if (Math.abs(change) >= 1000) return `${prefix}$${(change / 1000).toFixed(0)}k`;
  return `${prefix}$${change}`;
}

function QuickStatBox({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`text-center px-2 py-1.5 ${highlight ? "bg-primary/10" : ""}`} data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="text-[9px] font-bold text-muted-foreground tracking-wide uppercase">{label}</div>
      <div className={`text-sm font-bold font-mono ${highlight ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}

function OverviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-2.5 border-b border-border/50 last:border-0" data-testid={`overview-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium font-mono">{value}</span>
    </div>
  );
}

function OverviewTab({ player, overview }: { player: Player; overview: DetailedStatsData["overview"] }) {
  return (
    <div className="space-y-1 px-3 py-2" data-testid="content-overview">
      <OverviewRow label="Round Price Change" value={formatPriceChange(overview.roundPriceChange)} />
      <OverviewRow label="Season Price Change" value={formatPriceChange(overview.seasonPriceChange)} />
      <OverviewRow label="Last 3 Avg" value={player.last3Avg?.toFixed(1) || "—"} />
      <OverviewRow label="Last 5 Avg" value={player.last5Avg?.toFixed(1) || "—"} />
      <OverviewRow label="Highest Score" value={overview.highestScore?.toString() || "—"} />
      <OverviewRow label="Lowest Score" value={overview.lowestScore?.toString() || "—"} />
      <OverviewRow label="Price Per Point" value={overview.pricePerPoint ? formatPrice(overview.pricePerPoint) : "—"} />
      <OverviewRow label="Total Points" value={overview.totalPoints.toString()} />
      <OverviewRow label="Ownership" value={`${player.ownedByPercent?.toFixed(1) || 0}%`} />
      <OverviewRow label="Byes" value={player.byeRound?.toString() || "—"} />
      <OverviewRow label="Projected Avg" value={player.projectedScore?.toFixed(1) || "—"} />
      <OverviewRow label="Consistency Rating" value={player.consistencyRating?.toFixed(1) || "—"} />
      <OverviewRow label="Break Even" value={player.breakEven?.toString() || "—"} />
      <OverviewRow label="Form Trend" value={player.formTrend || "—"} />
    </div>
  );
}

function MatchStatsTab({ matchHistory }: { matchHistory: MatchHistoryEntry[] }) {
  const [expandedRound, setExpandedRound] = useState<number | null>(null);

  if (matchHistory.length === 0) {
    return (
      <div className="p-6 text-center text-muted-foreground text-sm" data-testid="tab-match-stats">
        No match stats recorded yet.
      </div>
    );
  }

  return (
    <div className="divide-y divide-border" data-testid="tab-match-stats">
      {[...matchHistory].reverse().map((m) => {
        const isExpanded = expandedRound === m.round;
        const oppColors = m.opponent ? getTeamColors(m.opponent) : null;
        const oppAbbr = m.opponent ? getTeamAbbr(m.opponent) : "?";
        return (
          <div key={m.round} data-testid={`match-round-${m.round}`}>
            <button
              className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-muted/30 transition-colors"
              onClick={() => setExpandedRound(isExpanded ? null : m.round)}
              data-testid={`button-expand-round-${m.round}`}
            >
              <div className="text-[11px] font-bold text-muted-foreground w-8">R{m.round}</div>
              {oppColors && (
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-bold shrink-0"
                  style={{ backgroundColor: oppColors.primary, color: oppColors.text }}>
                  {oppAbbr}
                </div>
              )}
              <div className="flex-1 text-left">
                <span className="text-xs text-muted-foreground">vs {m.opponent || "?"}</span>
              </div>
              <div className="text-right mr-2">
                <span className="text-sm font-bold font-mono">{m.score} Pts</span>
              </div>
              {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>

            {isExpanded && (
              <div className="bg-muted/20 px-3 pb-3 space-y-0">
                <div className="text-[10px] text-muted-foreground mb-1 px-1">
                  {m.venue}{m.tog != null ? ` · TOG: ${m.tog.toFixed(0)}%` : ""}
                </div>
                <div className="rounded-lg border border-border overflow-hidden">
                  {[
                    ["Kicks", m.kicks],
                    ["Handballs", m.handballs],
                    ["Marks", m.marks],
                    ["Tackles", m.tackles],
                    ["Hitouts", m.hitouts],
                    ["Goals", m.goals],
                    ["Behinds", m.behinds],
                    ["Frees Against", m.freesAgainst],
                    ["Inside 50s", m.inside50s],
                    ["Rebound 50s", m.rebound50s],
                    ["Contested Poss", m.contestedPoss],
                    ["Uncontested Poss", m.uncontestedPoss],
                    ["CBA %", m.cba != null ? `${m.cba.toFixed(0)}%` : null],
                  ]
                    .filter(([, v]) => v != null)
                    .map(([label, val], i) => (
                      <div key={i} className="flex justify-between items-center px-3 py-2 border-b border-border/50 last:border-0">
                        <span className="text-xs text-muted-foreground">{label as string}</span>
                        <span className="text-xs font-medium font-mono">{val as string | number}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FixtureStatsTab({ matchHistory, upcomingFixtures }: { matchHistory: MatchHistoryEntry[]; upcomingFixtures: UpcomingFixture[] }) {
  const [showUpcoming, setShowUpcoming] = useState(false);

  return (
    <div data-testid="tab-fixture-stats">
      <div className="flex border-b border-border">
        <button
          className={`flex-1 py-2.5 text-xs font-bold text-center transition-colors ${!showUpcoming ? "bg-primary/10 text-primary border-b-2 border-primary" : "text-muted-foreground"}`}
          onClick={() => setShowUpcoming(false)}
          data-testid="button-season-so-far"
        >
          Season So Far
        </button>
        <button
          className={`flex-1 py-2.5 text-xs font-bold text-center transition-colors ${showUpcoming ? "bg-primary/10 text-primary border-b-2 border-primary" : "text-muted-foreground"}`}
          onClick={() => setShowUpcoming(true)}
          data-testid="button-upcoming-fixtures"
        >
          Upcoming Fixtures
        </button>
      </div>

      {!showUpcoming ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-2 py-2 font-bold text-muted-foreground">Rd / Vs</th>
                <th className="text-left px-2 py-2 font-bold text-muted-foreground">Venue</th>
                <th className="text-right px-2 py-2 font-bold text-muted-foreground">Score</th>
                <th className="text-right px-2 py-2 font-bold text-muted-foreground">Avg</th>
                <th className="text-right px-2 py-2 font-bold text-muted-foreground">Total</th>
              </tr>
            </thead>
            <tbody>
              {matchHistory.map((m) => {
                const oppColors = m.opponent ? getTeamColors(m.opponent) : null;
                const oppAbbr = m.opponent ? getTeamAbbr(m.opponent) : "?";
                return (
                  <tr key={m.round} className="border-b border-border/30" data-testid={`fixture-row-${m.round}`}>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold">{m.round}</span>
                        {oppColors && (
                          <div className="w-4 h-4 rounded-full flex items-center justify-center text-[6px] font-bold"
                            style={{ backgroundColor: oppColors.primary, color: oppColors.text }}>
                            {oppAbbr}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-muted-foreground truncate max-w-[80px]">{m.venue || "—"}</td>
                    <td className="px-2 py-2 text-right font-bold font-mono">{m.score}</td>
                    <td className="px-2 py-2 text-right font-mono">{m.avg}</td>
                    <td className="px-2 py-2 text-right font-mono">{m.total}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {matchHistory.length === 0 && (
            <div className="p-4 text-center text-muted-foreground text-sm">No matches played yet.</div>
          )}
        </div>
      ) : (
        <div className="divide-y divide-border/30">
          {upcomingFixtures.map((f) => {
            const oppColors = getTeamColors(f.opponent);
            const oppAbbr = getTeamAbbr(f.opponent);
            return (
              <div key={f.round} className="flex items-center gap-2 px-3 py-2.5" data-testid={`upcoming-round-${f.round}`}>
                <span className="text-xs font-bold text-muted-foreground w-8">R{f.round}</span>
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-bold shrink-0"
                  style={{ backgroundColor: oppColors.primary, color: oppColors.text }}>
                  {oppAbbr}
                </div>
                <div className="flex-1">
                  <div className="text-xs font-medium">{f.isHome ? "vs" : "@"} {f.opponent}</div>
                  <div className="text-[10px] text-muted-foreground">{f.venue}</div>
                </div>
              </div>
            );
          })}
          {upcomingFixtures.length === 0 && (
            <div className="p-4 text-center text-muted-foreground text-sm">No upcoming fixtures.</div>
          )}
        </div>
      )}
    </div>
  );
}

function BreakdownTab({ data, type }: { data: AggBreakdown[]; type: "opposition" | "venue" }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (data.length === 0) {
    return (
      <div className="p-6 text-center text-muted-foreground text-sm" data-testid={`tab-${type}`}>
        No {type} data available yet.
      </div>
    );
  }

  return (
    <div className="divide-y divide-border" data-testid={`tab-${type}`}>
      {data.map((d) => {
        const isExpanded = expanded === d.name;
        const oppColors = type === "opposition" ? getTeamColors(d.name) : null;
        const oppAbbr = type === "opposition" ? getTeamAbbr(d.name) : null;
        return (
          <div key={d.name} data-testid={`breakdown-${d.name.replace(/\s+/g, "-").toLowerCase()}`}>
            <button
              className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-muted/30 transition-colors"
              onClick={() => setExpanded(isExpanded ? null : d.name)}
              data-testid={`button-expand-${d.name.replace(/\s+/g, "-").toLowerCase()}`}
            >
              {oppColors && oppAbbr ? (
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0"
                  style={{ backgroundColor: oppColors.primary, color: oppColors.text }}>
                  {oppAbbr}
                </div>
              ) : (
                <div className="w-6 h-6 rounded bg-muted flex items-center justify-center text-[8px] font-bold shrink-0">
                  {d.name.substring(0, 3).toUpperCase()}
                </div>
              )}
              <div className="flex-1 text-left text-sm font-medium truncate">{d.name}</div>
              <div className="text-right mr-2">
                <span className="text-sm font-bold font-mono">{d.avgScore} Pts</span>
              </div>
              {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>

            {isExpanded && (
              <div className="bg-muted/20 px-3 pb-3">
                <div className="rounded-lg border border-border overflow-hidden">
                  {[
                    ["Kicks (Average)", d.kicks],
                    ["Handballs (Average)", d.handballs],
                    ["Marks (Average)", d.marks],
                    ["Tackles (Average)", d.tackles],
                    ["Hitouts (Average)", d.hitouts],
                    ["Goals (Average)", d.goals],
                    ["Behinds (Average)", d.behinds],
                    ["Frees Against (Average)", d.freesAgainst],
                    ["Fantasy Points (Average)", d.avgScore],
                  ].map(([label, val], i) => (
                    <div key={i} className="flex justify-between items-center px-3 py-2 border-b border-border/50 last:border-0">
                      <span className="text-xs text-muted-foreground">{label as string}</span>
                      <span className="text-xs font-medium font-mono">{val as number}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AIReportTab({ playerId }: { playerId: string }) {
  const { data, isLoading, error } = useQuery<{ player: Player; report: PlayerReportData }>({
    queryKey: ["/api/players", playerId, "report"],
    queryFn: async () => {
      const res = await fetch(`/api/players/${playerId}/report`);
      if (!res.ok) throw new Error("Failed to generate report");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="p-6 text-center space-y-3" data-testid="tab-ai-report-loading">
        <Brain className="w-8 h-8 text-primary animate-pulse mx-auto" />
        <p className="text-sm text-muted-foreground">Generating AI report... This may take 10-15 seconds.</p>
        <Loader2 className="w-5 h-5 animate-spin mx-auto text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 text-center" data-testid="tab-ai-report-error">
        <AlertTriangle className="w-8 h-8 text-destructive mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Failed to generate AI report.</p>
      </div>
    );
  }

  const { report } = data;

  return (
    <div className="px-3 py-3 space-y-4" data-testid="tab-ai-report">
      <div>
        <Badge className={`text-xs px-2 py-0.5 mb-2 ${
          report.verdict === "must_have" ? "bg-green-600 text-white" :
          report.verdict === "keep" ? "bg-blue-600 text-white" :
          report.verdict === "buy" ? "bg-emerald-600 text-white" :
          report.verdict === "sell" ? "bg-red-600 text-white" :
          report.verdict === "trade" ? "bg-orange-600 text-white" :
          "bg-yellow-600 text-white"
        }`} data-testid="badge-ai-verdict">
          {report.verdict.replace(/_/g, " ").toUpperCase()}
        </Badge>
        <p className="text-sm mt-2" data-testid="text-overview">{report.overview}</p>
        <p className="text-xs text-muted-foreground mt-2" data-testid="text-reasoning">{report.verdictReasoning}</p>
      </div>

      {report.keyStats.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Key Stats</h3>
          <div className="rounded-lg border border-border overflow-hidden">
            {report.keyStats.map((stat, i) => (
              <div key={i} className="flex justify-between items-center px-3 py-2 border-b border-border/50 last:border-0">
                <span className="text-xs text-muted-foreground">{stat.label}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-mono font-medium">{stat.value}</span>
                  {stat.trend === "up" ? <TrendingUp className="w-3 h-3 text-green-500" /> :
                   stat.trend === "down" ? <TrendingDown className="w-3 h-3 text-red-500" /> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {[
        { title: "Form Breakdown", text: report.formBreakdown },
        { title: "Price Analysis", text: report.priceAnalysis },
        { title: "Fixture Outlook", text: report.fixtureOutlook },
        { title: "Captaincy Case", text: report.captaincyCase },
        ...(report.dppValue ? [{ title: "DPP Value", text: report.dppValue }] : []),
      ].filter(s => s.text).map((section, i) => (
        <div key={i}>
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">{section.title}</h3>
          <p className="text-xs leading-relaxed">{section.text}</p>
        </div>
      ))}

      {report.riskFactors.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Risk Factors</h3>
          <ul className="space-y-1">
            {report.riskFactors.map((risk, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs">
                <span className="text-destructive mt-0.5">•</span>
                <span>{risk}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function PlayerReport() {
  const [, params] = useRoute("/player/:id");
  const [, navigate] = useLocation();
  const playerId = params?.id;
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const { data, isLoading, error } = useQuery<DetailedStatsData>({
    queryKey: ["/api/players", playerId, "detailed-stats"],
    queryFn: async () => {
      const res = await fetch(`/api/players/${playerId}/detailed-stats`);
      if (!res.ok) throw new Error("Failed to fetch player data");
      return res.json();
    },
    enabled: !!playerId,
  });

  if (isLoading) {
    return (
      <div className="p-4 space-y-3 max-w-md mx-auto" data-testid="page-player-report">
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-12 w-full" />
        <div className="flex gap-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 flex-1" />)}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 max-w-md mx-auto" data-testid="page-player-report">
        <Button variant="ghost" size="sm" onClick={() => navigate("/team")} data-testid="button-back">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
        <Card className="mt-4">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="w-12 h-12 mx-auto text-destructive mb-3" />
            <p className="font-semibold">Failed to load player data</p>
            <p className="text-sm text-muted-foreground mt-1">{(error as Error)?.message || "Try again later"}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { player, matchHistory, upcomingFixtures, opponentBreakdown, venueBreakdown, overview } = data;
  const teamColors = getTeamColors(player.team);
  const photoUrl = getPlayerPhotoUrl(player.aflFantasyId);
  const lastScore = matchHistory.length > 0 ? matchHistory[matchHistory.length - 1].score : null;
  const posLabel = player.dualPosition ? `${player.position}/${player.dualPosition}` : player.position;

  return (
    <div className="max-w-md mx-auto" data-testid="page-player-report">
      <div
        className="relative px-4 pt-3 pb-4"
        style={{
          background: `linear-gradient(135deg, ${teamColors.primary}40 0%, ${teamColors.primary}15 50%, transparent 100%)`,
        }}
      >
        <button
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/40 flex items-center justify-center z-10"
          onClick={() => navigate("/team")}
          data-testid="button-close"
        >
          <span className="text-white text-lg font-light">×</span>
        </button>

        <div className="flex items-end gap-3">
          <div className="flex-1 min-w-0 pb-1">
            {player.injuryStatus && (
              <Badge variant="destructive" className="text-[9px] px-1.5 py-0 mb-1" data-testid="badge-injury">
                {player.injuryStatus}
              </Badge>
            )}
            <Badge className="text-[9px] px-1.5 py-0 mb-1.5 ml-1" style={{ backgroundColor: teamColors.primary, color: teamColors.text }} data-testid="badge-position">
              {posLabel}
            </Badge>
            <h1 className="text-xl font-bold leading-tight" data-testid="text-player-name">{player.name}</h1>
            <div className="text-xs text-muted-foreground mt-0.5" data-testid="text-player-meta">
              Age {player.age || "—"} · {formatPrice(player.price)}
            </div>
            <div className="text-xs text-muted-foreground" data-testid="text-next-opponent">
              Next Opponent: {player.nextOpponent ? `Vs ${getTeamAbbr(player.nextOpponent)}` : "TBC"}
            </div>
          </div>

          {photoUrl && (
            <div className="w-24 h-28 rounded-lg overflow-hidden border-2 shrink-0" style={{ borderColor: teamColors.primary }}>
              <img src={photoUrl} alt={player.name} className="w-full h-full object-cover object-top" data-testid="img-player-photo" />
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-6 border-y border-border bg-card" data-testid="section-quick-stats">
        <QuickStatBox label="GP" value={(player.gamesPlayed || 0).toString()} />
        <QuickStatBox label="LAST" value={lastScore?.toString() || "—"} />
        <QuickStatBox label="Average" value={player.avgScore?.toFixed(1) || "0"} />
        <QuickStatBox label="BE" value={player.breakEven?.toString() || "—"} />
        <QuickStatBox label="Proj." value={player.projectedScore?.toFixed(0) || "—"} highlight />
        <QuickStatBox label="P$ Chg" value={overview.roundPriceChange ? formatPriceChange(overview.roundPriceChange) : "—"} />
      </div>

      <div className="flex overflow-x-auto border-b border-border bg-card scrollbar-hide" data-testid="section-tabs">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`whitespace-nowrap px-3 py-2.5 text-xs font-medium transition-colors shrink-0 ${
              activeTab === tab.id
                ? "text-primary border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab(tab.id)}
            data-testid={`tab-${tab.id}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-card min-h-[300px]">
        {activeTab === "overview" && <OverviewTab player={player} overview={overview} />}
        {activeTab === "matchStats" && <MatchStatsTab matchHistory={matchHistory} />}
        {activeTab === "fixtureStats" && <FixtureStatsTab matchHistory={matchHistory} upcomingFixtures={upcomingFixtures} />}
        {activeTab === "opposition" && <BreakdownTab data={opponentBreakdown} type="opposition" />}
        {activeTab === "venue" && <BreakdownTab data={venueBreakdown} type="venue" />}
        {activeTab === "aiReport" && playerId && <AIReportTab playerId={playerId} />}
      </div>
    </div>
  );
}
