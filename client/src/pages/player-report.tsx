import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Minus,
  Shield,
  Crown,
  Target,
  AlertTriangle,
  DollarSign,
  BarChart3,
  Users,
  Calendar,
  MapPin,
  Zap,
  ArrowRightLeft,
  Star,
  Brain,
  Activity,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
  ComposedChart,
} from "recharts";
import type { Player } from "@shared/schema";

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

function VerdictBadge({ verdict }: { verdict: string }) {
  const config: Record<string, { label: string; className: string }> = {
    must_have: { label: "Must Have", className: "bg-green-600 text-white" },
    keep: { label: "Keep", className: "bg-blue-600 text-white" },
    monitor: { label: "Monitor", className: "bg-yellow-600 text-white" },
    trade: { label: "Trade", className: "bg-orange-600 text-white" },
    sell: { label: "Sell", className: "bg-red-600 text-white" },
    buy: { label: "Buy", className: "bg-emerald-600 text-white" },
  };
  const c = config[verdict] || config.monitor;
  return <Badge className={`${c.className} text-sm px-3 py-1`}>{c.label}</Badge>;
}

function TrendIcon({ trend }: { trend: string }) {
  if (trend === "up") return <TrendingUp className="w-4 h-4 text-green-500" />;
  if (trend === "down") return <TrendingDown className="w-4 h-4 text-red-500" />;
  return <Minus className="w-4 h-4 text-muted-foreground" />;
}

function parseRecentScores(recentScores: string | null): number[] {
  if (!recentScores) return [];
  return recentScores
    .split(",")
    .map((s) => parseFloat(s.trim()))
    .filter((n) => !isNaN(n));
}

function computeRollingAvg(scores: number[], window: number): (number | null)[] {
  return scores.map((_, i) => {
    if (i < window - 1) return null;
    const slice = scores.slice(i - window + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

function PerformanceCharts({ player }: { player: Player }) {
  const scores = useMemo(() => parseRecentScores(player.recentScores), [player.recentScores]);

  const scoreHistoryData = useMemo(() => {
    return scores.map((score, i) => ({
      round: `R${i + 1}`,
      score,
    }));
  }, [scores]);

  const rollingAvgData = useMemo(() => {
    const l3 = computeRollingAvg(scores, 3);
    const l5 = computeRollingAvg(scores, 5);
    return scores.map((_, i) => ({
      round: `R${i + 1}`,
      l3Avg: l3[i] !== null ? Math.round(l3[i]! * 10) / 10 : undefined,
      l5Avg: l5[i] !== null ? Math.round(l5[i]! * 10) / 10 : undefined,
    }));
  }, [scores]);

  const priceData = useMemo(() => {
    const l3 = computeRollingAvg(scores, 3);
    const startPrice = player.startingPrice || player.price;
    return scores.map((_, i) => {
      const estimatedPrice = l3[i] !== null ? Math.round(l3[i]! * 5500) : null;
      return {
        round: `R${i + 1}`,
        price: estimatedPrice !== null ? estimatedPrice : i === 0 ? startPrice : undefined,
      };
    });
  }, [scores, player.startingPrice, player.price]);

  if (scores.length < 2) return null;

  const avgScore = player.avgScore || 0;

  return (
    <div className="space-y-4" data-testid="section-performance-charts">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Activity className="w-5 h-5 text-primary" />
        Performance Charts
      </h2>

      <div className="grid grid-cols-1 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              Score History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={scoreHistoryData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="round" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  labelStyle={{ fontWeight: 600 }}
                />
                <ReferenceLine
                  y={avgScore}
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="4 4"
                  label={{ value: `Avg ${avgScore.toFixed(0)}`, position: "right", fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                />
                <Bar dataKey="score" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} opacity={0.8} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-500" />
              Rolling Averages
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={rollingAvgData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="round" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  labelStyle={{ fontWeight: 600 }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine
                  y={avgScore}
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="4 4"
                  label={{ value: `Season Avg`, position: "right", fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                />
                <Line
                  type="monotone"
                  dataKey="l3Avg"
                  name="L3 Avg"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls={false}
                />
                <Line
                  type="monotone"
                  dataKey="l5Avg"
                  name="L5 Avg"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-yellow-500" />
              Estimated Price Movement
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={priceData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="round" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}K`}
                  domain={["auto", "auto"]}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  labelStyle={{ fontWeight: 600 }}
                  formatter={(value: number) => [`$${(value / 1000).toFixed(1)}K`, "Est. Price"]}
                />
                {player.startingPrice && (
                  <ReferenceLine
                    y={player.startingPrice}
                    stroke="hsl(var(--muted-foreground))"
                    strokeDasharray="4 4"
                    label={{ value: "Start", position: "right", fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="price"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ label, value, subtext }: { label: string; value: string; subtext?: string }) {
  return (
    <div className="text-center p-3 rounded-lg bg-muted/50">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-bold font-mono">{value}</p>
      {subtext && <p className="text-[10px] text-muted-foreground">{subtext}</p>}
    </div>
  );
}

export default function PlayerReport() {
  const [, params] = useRoute("/player/:id");
  const playerId = params?.id;

  const { data, isLoading, error } = useQuery<{ player: Player; report: PlayerReportData }>({
    queryKey: [`/api/players/${playerId}/report`],
    enabled: !!playerId,
  });

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-4 max-w-4xl mx-auto" data-testid="page-player-report">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Skeleton className="h-32 w-full" />
        <div className="grid grid-cols-2 gap-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
        <div className="flex items-center gap-2 mt-2">
          <Brain className="w-5 h-5 text-primary animate-pulse" />
          <span className="text-sm text-muted-foreground">AI is generating a comprehensive player report. This may take 10-15 seconds...</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 sm:p-6 max-w-4xl mx-auto" data-testid="page-player-report">
        <Link href="/team">
          <Button variant="ghost" size="sm" data-testid="button-back">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Team
          </Button>
        </Link>
        <Card className="mt-4">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="w-12 h-12 mx-auto text-destructive mb-3" />
            <p className="font-semibold">Failed to generate report</p>
            <p className="text-sm text-muted-foreground mt-1">{(error as Error)?.message || "Try again later"}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { player, report } = data;

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-4xl mx-auto" data-testid="page-player-report">
      <Link href="/team">
        <Button variant="ghost" size="sm" data-testid="button-back">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Team
        </Button>
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-player-name">{player.name}</h1>
            <VerdictBadge verdict={report.verdict} />
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge variant="outline">{player.team}</Badge>
            <Badge variant="secondary">{player.position}{player.dualPosition ? `/${player.dualPosition}` : ''}</Badge>
            <Badge variant="outline">${(player.price / 1000).toFixed(0)}K</Badge>
            {player.injuryStatus && (
              <Badge variant="destructive">
                <AlertTriangle className="w-3 h-3 mr-1" /> {player.injuryStatus}
              </Badge>
            )}
            {!player.isNamedTeam && (
              <Badge variant="destructive" data-testid="badge-not-named">Not Named</Badge>
            )}
            {player.lateChange && (
              <Badge variant="destructive" data-testid="badge-late-change">Late Change</Badge>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        <StatCard label="Avg" value={player.avgScore?.toFixed(1) || "0"} />
        <StatCard label="L3 Avg" value={player.last3Avg?.toFixed(1) || "0"} />
        <StatCard label="Projected" value={player.projectedScore?.toFixed(0) || "N/A"} />
        <StatCard label="Break Even" value={player.breakEven?.toString() || "N/A"} />
        <StatCard label="Floor" value={player.projectedFloor?.toFixed(0) || "N/A"} />
        <StatCard label="Ceiling" value={player.ceilingScore?.toString() || "N/A"} />
        <StatCard label="P(120+)" value={player.captainProbability ? `${(player.captainProbability * 100).toFixed(0)}%` : "N/A"} subtext="Captain prob" />
        <StatCard label="Volatility" value={player.volatilityScore?.toFixed(1) || "N/A"} subtext={player.volatilityScore !== null ? (player.volatilityScore < 3 ? "Low" : player.volatilityScore < 6 ? "Medium" : "High") : undefined} />
        <StatCard label="Owned" value={`${player.ownedByPercent?.toFixed(0) || 0}%`} />
        <StatCard label="Age" value={player.age?.toString() || "N/A"} subtext={player.yearsExperience ? `${player.yearsExperience}yr exp` : undefined} />
        <StatCard label="Durability" value={player.durabilityScore ? `${(player.durabilityScore * 100).toFixed(0)}%` : "N/A"} />
        <StatCard label="Injury Risk" value={player.injuryRiskScore ? `${(player.injuryRiskScore * 100).toFixed(0)}%` : "N/A"} subtext={player.injuryRiskScore !== null ? (player.injuryRiskScore < 0.2 ? "Low" : player.injuryRiskScore < 0.4 ? "Medium" : "High") : undefined} />
      </div>

      <PerformanceCharts player={player} />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Star className="w-4 h-4 text-primary" />
            AI Verdict
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm" data-testid="text-overview">{report.overview}</p>
          <Separator />
          <p className="text-sm" data-testid="text-verdict-reasoning">{report.verdictReasoning}</p>
        </CardContent>
      </Card>

      {report.keyStats.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              Key Stats
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {report.keyStats.map((stat, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b last:border-0" data-testid={`stat-row-${i}`}>
                  <span className="text-sm text-muted-foreground">{stat.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono font-medium">{stat.value}</span>
                    <TrendIcon trend={stat.trend} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-500" />
              Form Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm" data-testid="text-form">{report.formBreakdown}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-yellow-500" />
              Price Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm" data-testid="text-price">{report.priceAnalysis}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-500" />
              Fixture Outlook
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm" data-testid="text-fixture">{report.fixtureOutlook}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Crown className="w-4 h-4 text-yellow-500" />
              Captaincy Case
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm" data-testid="text-captaincy">{report.captaincyCase}</p>
          </CardContent>
        </Card>
      </div>

      {player.dualPosition && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              DPP Value ({player.position}/{player.dualPosition})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm" data-testid="text-dpp">{report.dppValue}</p>
          </CardContent>
        </Card>
      )}

      {report.comparisonPlayers.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              Player Comparisons
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {report.comparisonPlayers.map((comp, i) => (
              <div key={i} className="flex gap-3 items-start" data-testid={`comparison-${i}`}>
                <Badge variant="outline" className="shrink-0 mt-0.5">{comp.name}</Badge>
                <p className="text-sm text-muted-foreground">{comp.reason}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {report.tradeTargets.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-primary" />
              Trade Targets
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {report.tradeTargets.map((target, i) => (
              <div key={i} className="flex gap-3 items-start" data-testid={`trade-target-${i}`}>
                <Badge variant={target.direction === "in" ? "default" : "destructive"} className="shrink-0 mt-0.5">
                  {target.direction === "in" ? "Trade In" : "Trade Out"} {target.name}
                </Badge>
                <p className="text-sm text-muted-foreground">{target.reason}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {report.riskFactors.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              Risk Factors
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {report.riskFactors.map((risk, i) => (
                <li key={i} className="flex items-start gap-2 text-sm" data-testid={`risk-${i}`}>
                  <span className="text-destructive mt-0.5">•</span>
                  <span>{risk}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
