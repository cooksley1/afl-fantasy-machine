import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowLeftRight,
  DollarSign,
  Target,
  BarChart3,
  Crown,
  AlertTriangle,
  Clock,
  ChevronRight,
  Shield,
  Zap,
  Calendar,
  Flame,
  Loader2,
  Activity,
  UserCheck,
  Eye,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";
import { ErrorState } from "@/components/error-state";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, ReferenceLine, Tooltip } from "recharts";
import type { Player, PlayerWithTeamInfo, LeagueSettings, TradeRecommendationWithPlayers } from "@shared/schema";

interface SimulationResult {
  expectedTotal: number;
  medianTotal: number;
  floor: number;
  ceiling: number;
  stdDev: number;
  histogram: { bucket: string; count: number }[];
  playerRiskContributions: { name: string; team: string; variance: number; stdDev: number }[];
  percentiles: { p25: number; p75: number; p90: number; p95: number };
  iterations: number;
}

function FormTrendIcon({ trend }: { trend: string }) {
  if (trend === "up") return <TrendingUp className="w-3.5 h-3.5 text-green-500" />;
  if (trend === "down") return <TrendingDown className="w-3.5 h-3.5 text-red-500" />;
  return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
}

function formatPrice(price: number): string {
  if (price >= 1000000) return `$${(price / 1000000).toFixed(2)}M`;
  return `$${(price / 1000).toFixed(0)}K`;
}

export default function Dashboard() {
  const [, navigate] = useLocation();
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const { toast } = useToast();

  const simulationMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/simulate-round");
      return res.json() as Promise<SimulationResult>;
    },
    onSuccess: (data) => setSimResult(data),
    onError: (error: Error) => {
      toast({
        title: "Simulation failed",
        description: error.message || "Could not run simulation. Try again.",
        variant: "destructive",
      });
    },
  });

  const { data: teamPlayers, isLoading: loadingTeam, isError: errorTeam, refetch: refetchTeam } = useQuery<PlayerWithTeamInfo[]>({
    queryKey: ["/api/my-team"],
  });

  const { data: settings, isLoading: loadingSettings, isError: errorSettings, refetch: refetchSettings } = useQuery<LeagueSettings>({
    queryKey: ["/api/settings"],
  });

  const { data: trades, isLoading: loadingTrades, isError: errorTrades, refetch: refetchTrades } = useQuery<TradeRecommendationWithPlayers[]>({
    queryKey: ["/api/trade-recommendations"],
  });

  const { data: gameRules } = useQuery<any>({
    queryKey: ["/api/game-rules"],
  });

  const { data: breakoutCandidates } = useQuery<Player[]>({
    queryKey: ["/api/breakout-candidates"],
  });

  const { data: riskData } = useQuery<{
    alerts: { playerId: number; playerName: string; team: string; position: string; fieldPosition: string; reason: string; severity: string; avgScore: number; isCaptain: boolean; isViceCaptain: boolean }[];
    swapSuggestions: { outPlayerId: number; outPlayerName: string; outPosition: string; outAvg: number; inPlayerId: number; inPlayerName: string; inPosition: string; inAvg: number; scoreDiff: number; reason: string }[];
    tagWarnings: { playerId: number; playerName: string; team: string; position: string; tagRisk: number; avgScore: number; estimatedImpact: number; adjustedProjection: number; isCaptain: boolean; isViceCaptain: boolean; advice: string }[];
    taggerWarnings: { playerId: number; playerName: string; team: string; position: string; avgScore: number; advice: string }[];
  }>({
    queryKey: ["/api/my-team/risks"],
  });

  const isLoading = loadingTeam || loadingSettings || loadingTrades;
  const hasError = errorTeam || errorSettings || errorTrades;

  const onFieldPlayers = teamPlayers?.filter((p) => p.isOnField) || [];
  const benchPlayers = teamPlayers?.filter((p) => !p.isOnField) || [];
  const totalScore = onFieldPlayers.reduce((sum, p) => sum + (p.avgScore || 0), 0);
  const totalSalary = teamPlayers?.reduce((sum, p) => sum + p.price, 0) || 0;
  const captain = teamPlayers?.find((p) => p.isCaptain);
  const viceCaptain = teamPlayers?.find((p) => p.isViceCaptain);
  const lateChangeAlerts = (teamPlayers || []).filter(
    (p) => p.lateChange || p.injuryStatus || !p.isNamedTeam
  );

  const currentRound = settings?.currentRound || 1;
  const byeRounds = gameRules?.byeRounds || [12, 13, 14];
  const isByeRound = byeRounds.includes(currentRound);
  const tradesThisRound = settings?.tradesRemaining || 0;
  const maxTradesThisRound = currentRound < (gameRules?.trades?.startFromRound || 2) ? 0 : isByeRound ? (gameRules?.trades?.perByeRound || 3) : (gameRules?.trades?.perRound || 2);

  const coldPlayers = onFieldPlayers
    .filter((p) => p.formTrend === "down" || (p.last3Avg || 0) < (p.avgScore || 0) * 0.85)
    .sort((a, b) => ((a.last3Avg || 0) - (a.avgScore || 0)) - ((b.last3Avg || 0) - (b.avgScore || 0)));

  const hotBenchPlayers = benchPlayers
    .filter((p) => p.formTrend === "up" || (p.avgScore || 0) > 60)
    .sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0));

  const byeAffectedPlayers = onFieldPlayers.filter(
    (p) => p.byeRound === currentRound
  );

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-4">
        <Skeleton className="h-7 w-48 mb-1" />
        <Skeleton className="h-4 w-72" />
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-md" />
          ))}
        </div>
        <Skeleton className="h-60 rounded-md" />
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        <ErrorState
          message="Failed to load dashboard data. Please try again."
          onRetry={() => { refetchTeam(); refetchSettings(); refetchTrades(); }}
        />
      </div>
    );
  }

  const salaryCap = settings?.salaryCap || 18300000;
  const remaining = salaryCap - totalSalary;

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-7xl mx-auto" data-testid="page-dashboard">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight" data-testid="text-page-title">
            {settings?.teamName || "My Team"}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Round {currentRound} {isByeRound ? "(Bye Round)" : ""} — Goal: Win this week
          </p>
        </div>
        {isByeRound && (
          <Badge variant="destructive" className="text-xs">
            <Calendar className="w-3 h-3 mr-1" />
            Bye Round
          </Badge>
        )}
      </div>

      {currentRound <= 1 && (
        <Card className="border-amber-500/30 bg-amber-500/5" data-testid="card-preseason-notice">
          <CardContent className="p-3 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Preseason Data</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Round {currentRound} — Player averages, form trends, and projections are based on <strong>2025 season data</strong>, not 2026 form.
                Break-evens are initial values. Use preseason match scores as a guide only — full data builds from Round 2.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-0.5">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Projected</p>
                <p className="text-xl sm:text-2xl font-bold tracking-tight">{Math.round(totalScore)}</p>
                <p className="text-[11px] text-muted-foreground">{onFieldPlayers.length} on field</p>
              </div>
              <div className="p-2 rounded-md bg-primary/10">
                <Target className="w-4 h-4 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-0.5">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Team Value</p>
                <p className="text-xl sm:text-2xl font-bold tracking-tight text-accent">{formatPrice(totalSalary)}</p>
                <p className="text-[11px] text-muted-foreground">{formatPrice(remaining)} left</p>
              </div>
              <div className="p-2 rounded-md bg-accent/10">
                <DollarSign className="w-4 h-4 text-accent" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-0.5">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Trades This Round</p>
                <p className="text-xl sm:text-2xl font-bold tracking-tight">{tradesThisRound}</p>
                <p className="text-[11px] text-muted-foreground">
                  {maxTradesThisRound === 0 ? "No trades R1" : isByeRound ? `${maxTradesThisRound} allowed (bye)` : `${maxTradesThisRound} per round`}
                </p>
              </div>
              <div className="p-2 rounded-md bg-primary/10">
                <ArrowLeftRight className="w-4 h-4 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-0.5">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Season Trades</p>
                <p className="text-xl sm:text-2xl font-bold tracking-tight">{settings?.totalTradesUsed || 0}</p>
                <p className="text-[11px] text-muted-foreground">used so far</p>
              </div>
              <div className="p-2 rounded-md bg-muted">
                <BarChart3 className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {(lateChangeAlerts.length > 0 || coldPlayers.length > 0 || byeAffectedPlayers.length > 0 ||
        (riskData && (riskData.tagWarnings.length > 0 || riskData.taggerWarnings.length > 0))) && (
        <Card className="border-destructive/30" data-testid="card-risk-assessment">
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle className="text-sm sm:text-base font-semibold flex items-center gap-2 text-destructive">
              <ShieldAlert className="w-4 h-4" />
              Player Risks & Warnings
            </CardTitle>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Injuries, availability issues, tag threats, and bench swap advice
            </p>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            {riskData && riskData.alerts.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-destructive">Unavailable Players</span>
                </div>
                {riskData.alerts.map((alert) => (
                  <div key={alert.playerId} className="p-2.5 rounded-md bg-destructive/5 border border-destructive/10" data-testid={`alert-unavailable-${alert.playerId}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {alert.playerName}
                            {alert.isCaptain && <span className="text-[10px] ml-1 text-yellow-600 dark:text-yellow-400">(C)</span>}
                            {alert.isViceCaptain && <span className="text-[10px] ml-1 text-emerald-600 dark:text-emerald-400">(VC)</span>}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate">{alert.reason}</p>
                        </div>
                      </div>
                      <Badge variant={alert.severity === "critical" ? "destructive" : "secondary"} className="text-[9px] shrink-0">
                        {alert.severity === "critical" ? "Critical" : alert.severity === "high" ? "High" : "Warning"}
                      </Badge>
                    </div>
                    {riskData.swapSuggestions.find(s => s.outPlayerId === alert.playerId) && (() => {
                      const swap = riskData.swapSuggestions.find(s => s.outPlayerId === alert.playerId)!;
                      return (
                        <div className="mt-2 p-2 rounded bg-emerald-500/5 border border-emerald-500/15 flex items-center gap-2" data-testid={`swap-suggestion-${alert.playerId}`}>
                          <UserCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-medium">
                              Swap in: <span className="text-emerald-600 dark:text-emerald-400">{swap.inPlayerName}</span>
                              <span className="text-muted-foreground"> ({swap.inPosition})</span>
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              Avg {swap.inAvg?.toFixed(0)} pts — gains +{Math.max(0, swap.scoreDiff).toFixed(0)} pts vs benching
                            </p>
                          </div>
                          <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </div>
            )}

            {!riskData && lateChangeAlerts.length > 0 && lateChangeAlerts.map((player) => (
              <div key={player.id} className="flex items-center justify-between gap-2 p-2.5 rounded-md bg-destructive/5" data-testid={`alert-late-change-${player.id}`}>
                <div className="flex items-center gap-2 min-w-0">
                  <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{player.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {player.injuryStatus ? `Injury: ${player.injuryStatus}` : player.isOnField ? 'Late change risk — may score 0' : 'Not named in team'}
                    </p>
                  </div>
                </div>
                <Badge variant="destructive" className="text-[9px] shrink-0">Trade Out</Badge>
              </div>
            ))}

            {riskData && riskData.tagWarnings.length > 0 && (
              <div className="p-2.5 rounded-md bg-orange-500/5 border border-orange-500/20" data-testid="section-tag-warnings">
                <div className="flex items-center gap-2 mb-2">
                  <Eye className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
                  <span className="text-sm font-medium">Tag Threat Warnings</span>
                </div>
                <p className="text-[10px] text-muted-foreground mb-2">
                  These on-field players are likely tag targets — expect reduced scoring
                </p>
                {riskData.tagWarnings.map((tw) => (
                  <div key={tw.playerId} className="flex items-center justify-between py-1.5 cursor-pointer hover:bg-muted/30 rounded px-1" onClick={() => navigate(`/player/${tw.playerId}`)} data-testid={`tag-warning-${tw.playerId}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${tw.tagRisk >= 0.6 ? 'bg-red-500' : 'bg-orange-400'}`} />
                      <div className="min-w-0">
                        <p className="text-sm truncate">
                          {tw.playerName}
                          {tw.isCaptain && <span className="text-[10px] ml-1 text-yellow-600 dark:text-yellow-400">(C)</span>}
                          {tw.isViceCaptain && <span className="text-[10px] ml-1 text-emerald-600 dark:text-emerald-400">(VC)</span>}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{tw.advice}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className="text-xs font-mono">
                        <span className="text-muted-foreground">{tw.avgScore?.toFixed(0)}</span>
                        <span className="text-red-500 ml-1">-{tw.estimatedImpact.toFixed(0)}</span>
                      </p>
                      <Badge variant={tw.tagRisk >= 0.6 ? "destructive" : "outline"} className="text-[8px]">
                        {Math.round(tw.tagRisk * 100)}% risk
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {riskData && riskData.taggerWarnings.length > 0 && (
              <div className="p-2.5 rounded-md bg-purple-500/5 border border-purple-500/20" data-testid="section-tagger-warnings">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                  <span className="text-sm font-medium">Tagger Role Warning</span>
                </div>
                {riskData.taggerWarnings.map((tw) => (
                  <div key={tw.playerId} className="flex items-center justify-between py-1.5" data-testid={`tagger-warning-${tw.playerId}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm truncate">{tw.playerName}</span>
                      <Badge variant="secondary" className="text-[9px]">{tw.position}</Badge>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">Avg {tw.avgScore?.toFixed(0)}</span>
                  </div>
                ))}
                <p className="text-[10px] text-muted-foreground mt-1">
                  Expected to play a tagging role — scoring output likely reduced. Consider benching if you have better options.
                </p>
              </div>
            )}

            {byeAffectedPlayers.length > 0 && (
              <div className="p-2.5 rounded-md bg-yellow-500/5 border border-yellow-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-3.5 h-3.5 text-yellow-600 dark:text-yellow-400" />
                  <span className="text-sm font-medium">Bye Round Players ({byeAffectedPlayers.length} on field)</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {byeAffectedPlayers.map((p) => (
                    <Badge key={p.id} variant="outline" className="text-[10px]">
                      {p.name} ({p.team})
                    </Badge>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  These players won't score this round. Consider benching or trading.
                </p>
              </div>
            )}

            {coldPlayers.length > 0 && (
              <div className="p-2.5 rounded-md bg-blue-500/5 border border-blue-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingDown className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span className="text-sm font-medium">Underperformers to Watch</span>
                </div>
                {coldPlayers.slice(0, 3).map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm truncate">{p.name}</span>
                      <Badge variant="secondary" className="text-[9px]">{p.position}</Badge>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs font-mono text-red-500">
                        L3: {p.last3Avg?.toFixed(0)} <span className="text-muted-foreground">vs</span> Avg: {p.avgScore?.toFixed(0)}
                      </span>
                    </div>
                  </div>
                ))}
                <p className="text-[11px] text-muted-foreground mt-1">
                  Consider trading these players if form continues to drop.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {(captain || viceCaptain) && (
        <Card>
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle className="text-sm sm:text-base font-semibold flex items-center gap-2">
              <Crown className="w-4 h-4 text-accent" />
              Captain Loophole Strategy
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {viceCaptain && (
                <div className="flex items-center gap-3 p-3 rounded-md bg-muted/50 cursor-pointer hover-elevate" data-testid="card-vc-pick" onClick={() => navigate(`/player/${viceCaptain.id}`)}>
                  <div className="w-9 h-9 rounded-md bg-emerald-500/15 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">VC</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{viceCaptain.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {viceCaptain.team} vs {viceCaptain.nextOpponent}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Clock className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="text-[11px] text-muted-foreground">{viceCaptain.gameTime || 'TBA'}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-base sm:text-lg font-bold text-emerald-600 dark:text-emerald-400">
                      {((viceCaptain.projectedScore || viceCaptain.avgScore || 0) * 2).toFixed(0)}
                    </p>
                    <p className="text-[9px] text-muted-foreground">
                      {viceCaptain.captainProbability ? `P(120+): ${(viceCaptain.captainProbability * 100).toFixed(0)}%` : '2x score'}
                    </p>
                  </div>
                </div>
              )}
              {captain && (
                <div className="flex items-center gap-3 p-3 rounded-md bg-muted/50 cursor-pointer hover-elevate" data-testid="card-captain-pick" onClick={() => navigate(`/player/${captain.id}`)}>
                  <div className="w-9 h-9 rounded-md bg-accent/15 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-accent">C</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{captain.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {captain.team} vs {captain.nextOpponent}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Clock className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="text-[11px] text-muted-foreground">{captain.gameTime || 'TBA'}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-base sm:text-lg font-bold text-accent">
                      {((captain.projectedScore || captain.avgScore || 0) * 2).toFixed(0)}
                    </p>
                    <p className="text-[9px] text-muted-foreground">
                      {captain.captainProbability ? `P(120+): ${(captain.captainProbability * 100).toFixed(0)}%` : 'Safety net'}
                    </p>
                  </div>
                </div>
              )}
            </div>
            {viceCaptain && captain && (
              <div className="p-2.5 rounded-md bg-accent/5 border border-accent/10">
                <p className="text-[11px] sm:text-xs text-muted-foreground leading-relaxed">
                  <span className="font-semibold text-foreground">Loophole:</span> If {viceCaptain.name} (VC)
                  scores 110+ in their {viceCaptain.gameTime || 'early'} game, keep doubled score.
                  Otherwise switch to {captain.name} before their {captain.gameTime || 'later'} game.
                  {gameRules?.captainRules?.tog50Rule && (
                    <span className="block mt-1 text-yellow-600 dark:text-yellow-400">50% TOG Rule: If captain plays &lt;50% TOG, VC score doubles if higher.</span>
                  )}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle className="text-sm sm:text-base font-semibold flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4 text-accent" />
              Recommended Trades
            </CardTitle>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {tradesThisRound} of {maxTradesThisRound} trade{maxTradesThisRound !== 1 ? 's' : ''} available
            </p>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-0.5">
            {(trades || []).slice(0, 4).map((trade) => (
              <div
                key={trade.id}
                className="py-2.5 px-2 rounded-md hover-elevate cursor-pointer"
                data-testid={`card-trade-suggestion-${trade.id}`}
                onClick={() => navigate("/trades")}
              >
                <div className="flex items-center justify-between mb-1 gap-2">
                  <div className="flex items-center gap-1.5 text-sm min-w-0 flex-wrap">
                    <span className="text-destructive font-medium truncate">
                      {trade.playerOut.name}
                    </span>
                    <ArrowLeftRight className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="text-green-600 dark:text-green-400 font-medium truncate">
                      {trade.playerIn.name}
                    </span>
                  </div>
                  <Badge
                    variant={trade.confidence > 0.7 ? "default" : "secondary"}
                    className="text-[10px] shrink-0"
                  >
                    {Math.round(trade.confidence * 100)}%
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                  {trade.reason}
                </p>
              </div>
            ))}
            {(!trades || trades.length === 0) && (
              <div className="text-center py-6 text-muted-foreground text-sm">
                <p>No trade recommendations yet</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => navigate("/trades")}
                  data-testid="button-goto-trades"
                >
                  Generate Trades
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle className="text-sm sm:text-base font-semibold flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              Top Guns
            </CardTitle>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Your highest scorers on field
            </p>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-0.5">
            {onFieldPlayers
              .sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0))
              .slice(0, 5)
              .map((player, i) => (
                <div
                  key={player.id}
                  className="flex items-center justify-between py-2 px-2 rounded-md hover-elevate cursor-pointer"
                  data-testid={`card-top-performer-${player.id}`}
                  onClick={() => navigate(`/player/${player.id}`)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-bold text-muted-foreground w-4 shrink-0">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{player.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {player.team} - {player.position}
                        {player.dualPosition ? `/${player.dualPosition}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <FormTrendIcon trend={player.formTrend} />
                    <Badge variant="secondary" className="font-mono text-xs">
                      {player.avgScore?.toFixed(1)}
                    </Badge>
                  </div>
                </div>
              ))}
            {onFieldPlayers.length === 0 && (
              <div className="text-center py-6 text-muted-foreground text-sm">
                Add players to see top performers
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-simulation">
        <CardHeader className="pb-2 px-4 pt-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm sm:text-base font-semibold flex items-center gap-2">
              <Activity className="w-4 h-4 text-violet-500" />
              Round Simulation
            </CardTitle>
            <Button
              size="sm"
              variant={simResult ? "outline" : "default"}
              onClick={() => simulationMutation.mutate()}
              disabled={simulationMutation.isPending}
              data-testid="button-run-simulation"
              className="text-xs h-7"
            >
              {simulationMutation.isPending ? (
                <>
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  Simulating...
                </>
              ) : simResult ? "Re-run" : "Run Simulation"}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            10,000 iteration Monte Carlo simulation of your team's round score
          </p>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          {!simResult && !simulationMutation.isPending && (
            <div className="text-center py-8 text-muted-foreground text-sm" data-testid="text-simulation-prompt">
              Click "Run Simulation" to model your team's scoring range
            </div>
          )}
          {simulationMutation.isPending && (
            <div className="flex flex-col items-center justify-center py-8 gap-2" data-testid="simulation-loading">
              <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
              <p className="text-sm text-muted-foreground">Running 10,000 simulations...</p>
            </div>
          )}
          {simResult && !simulationMutation.isPending && (
            <div className="space-y-4" data-testid="simulation-results">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="bg-muted/30 rounded-md p-2.5 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Expected</p>
                  <p className="text-lg font-bold font-mono" data-testid="text-sim-expected">{Math.round(simResult.expectedTotal)}</p>
                </div>
                <div className="bg-muted/30 rounded-md p-2.5 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Median</p>
                  <p className="text-lg font-bold font-mono" data-testid="text-sim-median">{Math.round(simResult.medianTotal)}</p>
                </div>
                <div className="bg-muted/30 rounded-md p-2.5 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Floor (10th)</p>
                  <p className="text-lg font-bold font-mono text-red-500" data-testid="text-sim-floor">{Math.round(simResult.floor)}</p>
                </div>
                <div className="bg-muted/30 rounded-md p-2.5 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Ceiling (90th)</p>
                  <p className="text-lg font-bold font-mono text-green-500" data-testid="text-sim-ceiling">{Math.round(simResult.ceiling)}</p>
                </div>
              </div>

              <div>
                <p className="text-xs font-medium mb-1 text-muted-foreground">Score Distribution</p>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={simResult.histogram} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                    <XAxis dataKey="bucket" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                    <YAxis hide />
                    <Tooltip
                      contentStyle={{ fontSize: 11, borderRadius: 8 }}
                      formatter={(value: number) => [`${value} sims`, "Count"]}
                    />
                    <ReferenceLine
                      x={simResult.histogram.reduce((best, h) => h.count > best.count ? h : best, simResult.histogram[0])?.bucket}
                      stroke="hsl(var(--primary))"
                      strokeDasharray="3 3"
                      strokeWidth={1}
                    />
                    <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                      {simResult.histogram.map((entry, index) => {
                        const bucketVal = parseInt(entry.bucket);
                        const isFloor = bucketVal <= simResult.floor;
                        const isCeiling = bucketVal >= simResult.ceiling;
                        return (
                          <Cell
                            key={index}
                            fill={isFloor ? "hsl(0 70% 50% / 0.5)" : isCeiling ? "hsl(142 70% 45% / 0.5)" : "hsl(var(--primary) / 0.7)"}
                          />
                        );
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {simResult.playerRiskContributions.length > 0 && (
                <div>
                  <p className="text-xs font-medium mb-1.5 text-muted-foreground flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Top Variance Contributors
                  </p>
                  <div className="space-y-1">
                    {simResult.playerRiskContributions.slice(0, 3).map((p, i) => (
                      <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded-md bg-muted/20" data-testid={`card-risk-contributor-${i}`}>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{p.name}</p>
                          <p className="text-[10px] text-muted-foreground">{p.team}</p>
                        </div>
                        <Badge variant="outline" className="text-[10px] font-mono shrink-0">
                          ±{p.stdDev.toFixed(1)}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-[10px] text-muted-foreground text-center">
                Based on {simResult.iterations.toLocaleString()} iterations • P25: {Math.round(simResult.percentiles.p25)} | P75: {Math.round(simResult.percentiles.p75)} | P95: {Math.round(simResult.percentiles.p95)}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {hotBenchPlayers.length > 0 && (
        <Card>
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle className="text-sm sm:text-base font-semibold flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-500" />
              Bench Watch
            </CardTitle>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Bench players who could earn a spot on field
            </p>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {hotBenchPlayers.slice(0, 4).map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-2.5 rounded-md bg-muted/30 hover-elevate cursor-pointer"
                  onClick={() => navigate(`/player/${p.id}`)}
                  data-testid={`card-bench-watch-${p.id}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FormTrendIcon trend={p.formTrend} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{p.name}</p>
                      <p className="text-[11px] text-muted-foreground">{p.position} | {formatPrice(p.price)}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-mono shrink-0">
                    {p.avgScore?.toFixed(1)}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {breakoutCandidates && breakoutCandidates.length > 0 && (
        <Card data-testid="card-breakout-candidates">
          <CardHeader className="pb-2 px-4 pt-4">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm sm:text-base font-semibold flex items-center gap-2">
                <Flame className="w-4 h-4 text-orange-500" />
                Breakout Candidates
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => navigate("/form-guide")}
                data-testid="button-view-all-breakouts"
              >
                View All <ChevronRight className="w-3 h-3 ml-1" />
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Players showing breakout potential based on form, output, and age
            </p>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-0.5">
            {breakoutCandidates.slice(0, 8).map((player) => {
              const isHot = (player.breakoutScore ?? 0) >= 0.65;
              return (
                <div
                  key={player.id}
                  className="flex items-center justify-between py-2.5 px-2 rounded-md hover-elevate cursor-pointer"
                  data-testid={`card-breakout-${player.id}`}
                  onClick={() => navigate(`/player/${player.id}`)}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${isHot ? 'bg-red-500/10' : 'bg-amber-500/10'}`}>
                      <Flame className={`w-3.5 h-3.5 ${isHot ? 'text-red-500' : 'text-amber-500'}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{player.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {player.team} | {player.position}{player.dualPosition ? `/${player.dualPosition}` : ''} | {formatPrice(player.price)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                    <div className="text-right hidden sm:block">
                      <p className="text-xs font-mono">{player.avgScore?.toFixed(1)}</p>
                      <p className="text-[9px] text-muted-foreground">Avg</p>
                    </div>
                    <div className="w-16 sm:w-20">
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full ${isHot ? 'bg-red-500' : 'bg-amber-500'}`}
                            style={{ width: `${Math.min(100, (player.breakoutScore ?? 0) * 100)}%` }}
                          />
                        </div>
                        <span className={`text-[10px] font-mono font-bold ${isHot ? 'text-red-500' : 'text-amber-600 dark:text-amber-400'}`}
                              data-testid={`text-breakout-score-${player.id}`}>
                          {((player.breakoutScore ?? 0) * 100).toFixed(0)}
                        </span>
                      </div>
                    </div>
                    <Badge
                      variant={isHot ? "destructive" : "secondary"}
                      className="text-[9px] shrink-0"
                    >
                      {isHot ? 'Hot' : 'Warm'}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
