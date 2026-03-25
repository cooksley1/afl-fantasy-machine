import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { formatPrice } from "@/lib/player-utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
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
  ChevronDown,
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
  CheckCircle2,
  Camera,
  Users,
  CircleDot,
  Info,
  ClipboardList,
} from "lucide-react";
import { ErrorState } from "@/components/error-state";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, ReferenceLine, Tooltip } from "recharts";
import type { Player, PlayerWithTeamInfo, LeagueSettings, TradeRecommendationWithPlayers, IntelReport } from "@shared/schema";

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


export default function Dashboard() {
  const [, navigate] = useLocation();
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [loopholeOpen, setLoopholeOpen] = useState(false);
  const { toast } = useToast();
  const isMobile = useIsMobile();

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

  const { data: intelReports } = useQuery<IntelReport[]>({
    queryKey: ["/api/intel"],
  });

  interface WeeklyPlanStep {
    priority: "critical" | "important" | "suggested";
    action: string;
    reason: string;
    link?: string;
  }
  interface WeeklyPlan {
    steps: WeeklyPlanStep[];
    round: number;
    summary: string;
    isByeRound: boolean;
    byeType: "early" | "regular" | null;
    tradesAvailable: number;
    maxTrades: number;
    best18Applies: boolean;
    seasonContext: string | null;
  }

  const { data: weeklyPlan } = useQuery<WeeklyPlan>({
    queryKey: ["/api/weekly-plan"],
    enabled: !!teamPlayers && teamPlayers.length > 0,
  });

  const { data: riskData } = useQuery<{
    alerts: { playerId: number; playerName: string; team: string; position: string; fieldPosition: string; reason: string; severity: string; avgScore: number; isCaptain: boolean; isViceCaptain: boolean }[];
    swapSuggestions: { outPlayerId: number; outPlayerName: string; outPosition: string; outAvg: number; inPlayerId: number; inPlayerName: string; inPosition: string; inAvg: number; scoreDiff: number; reason: string }[];
    tagWarnings: { playerId: number; playerName: string; team: string; position: string; avgScore: number; nextOpponent: string; opponentUsesTaggers: boolean; opponentTagFrequency: number; opponentTagger: string | null; timesTaggedHistorically: number; avgScoreWhenTagged: number | null; avgScoreImpact: number | null; isCaptain: boolean; isViceCaptain: boolean; riskLevel: "high" | "moderate" | "low"; advice: string; evidence: string[] }[];
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
  const currentRound = settings?.currentRound || 1;
  const definitelyOutKeywords = ["season", "acl", "knee", "hamstring", "shoulder", "concussion", "suspended", "dropped", "omitted", "delisted", "retired", "broken", "fracture", "surgery", "torn", "rupture"];
  const isDefinitelyOut = (status: string | null) => status ? definitelyOutKeywords.some(s => status.toLowerCase().includes(s)) : false;
  const lateChangeAlerts = (teamPlayers || []).filter(
    (p) => p.lateChange || isDefinitelyOut(p.injuryStatus) || p.selectionStatus === "omitted" || (!p.isNamedTeam && currentRound >= 2 && p.selectionStatus !== "unknown")
  );
  const emergencyPlayers = (teamPlayers || []).filter(
    (p) => p.selectionStatus === "emergency"
  );
  const unknownSelectionCount = onFieldPlayers.filter(
    (p) => p.selectionStatus === "unknown"
  ).length;
  const regularByeRounds = gameRules?.regularByeRounds || [12, 13, 14];
  const earlyByeRounds = gameRules?.earlyByeRounds || [2, 3, 4];
  const isByeRoundNow = regularByeRounds.includes(currentRound) || earlyByeRounds.includes(currentRound);
  const tradesThisRound = settings?.tradesRemaining || 0;
  const maxTradesThisRound = currentRound < (gameRules?.trades?.startFromRound || 2) ? 0 : regularByeRounds.includes(currentRound) ? (gameRules?.trades?.perRegularByeRound || 3) : earlyByeRounds.includes(currentRound) ? (gameRules?.trades?.perEarlyByeRound || 2) : (gameRules?.trades?.perRound || 2);

  const coldPlayers = onFieldPlayers
    .filter((p) => (p.gamesPlayed ?? 0) >= 3 && (p.formTrend === "down" || (p.last3Avg || 0) < (p.avgScore || 0) * 0.85))
    .sort((a, b) => ((a.last3Avg || 0) - (a.avgScore || 0)) - ((b.last3Avg || 0) - (b.avgScore || 0)));

  const hotBenchPlayers = benchPlayers
    .filter((p) => (p.gamesPlayed ?? 0) >= 2 && (p.formTrend === "up" || (p.avgScore || 0) > 60))
    .sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0));

  const byeAffectedPlayers = onFieldPlayers.filter(
    (p) => p.byeRound === currentRound
  );

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-4">
        <Skeleton className="h-14 rounded-md" />
        <Skeleton className="h-32 rounded-md" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
  const hasTeam = teamPlayers && teamPlayers.length > 0;

  const availableTradesRound = Math.min(maxTradesThisRound, tradesThisRound);

  const injuredPlayers = (teamPlayers || []).filter(p =>
    p.injuryStatus || p.selectionStatus === "injured" || p.selectionStatus === "not-playing"
  );
  const injuredOnField = injuredPlayers.filter(p => p.isOnField);
  const injuredBench = injuredPlayers.filter(p => !p.isOnField);

  interface ActionItem {
    tier: "must" | "should" | "could";
    text: string;
    detail: string;
    link: string;
    linkLabel: string;
    players?: PlayerWithTeamInfo[];
  }
  const roundActions: ActionItem[] = [];

  if (hasTeam) {
    for (const p of injuredOnField) {
      const statusText = p.injuryStatus || "not playing";
      const isCashCow = (p.avgScore || 0) < 70 && p.price < 400000;
      roundActions.push({
        tier: "must",
        text: `${p.name} — ${statusText}`,
        detail: isCashCow
          ? `Cash cow on field scoring 0. Trade out for an active player at ${p.position} or move to bench and bring on a replacement.`
          : `Premium on field scoring 0. ${p.price > 700000 ? "Consider moving to bench and keeping if the injury is short-term, or trade out if extended." : "Trade out for a playing replacement."}`,
        link: "/trades",
        linkLabel: "Trade",
        players: [p],
      });
    }

    if (!captain) {
      roundActions.push({
        tier: "must",
        text: "No captain set",
        detail: "You're leaving double points on the table. Assign a captain immediately.",
        link: "/team",
        linkLabel: "Set Captain",
      });
    }

    if (riskData && riskData.alerts.length > 0) {
      const nonInjuryAlerts = riskData.alerts.filter(a =>
        !injuredOnField.some(ip => ip.id === a.playerId) &&
        !injuredBench.some(ip => ip.id === a.playerId)
      );
      for (const alert of nonInjuryAlerts) {
        roundActions.push({
          tier: (alert.severity === "critical" || alert.severity === "high") ? "must" : "should",
          text: `${alert.playerName} — ${alert.reason}`,
          detail: `${alert.playerName} (${alert.position}, avg ${alert.avgScore?.toFixed(1)}) is flagged. Review bench options or trade.`,
          link: "/team",
          linkLabel: "Review",
        });
      }
    }

    for (const p of injuredBench) {
      const statusText = p.injuryStatus || "not playing";
      const isCashCow = (p.avgScore || 0) < 70 && p.price < 400000;
      roundActions.push({
        tier: isCashCow ? "should" : "could",
        text: `${p.name} (bench) — ${statusText}`,
        detail: isCashCow
          ? `Cash cow on bench no longer generating cash. Trade for an active cash cow while you still have value.`
          : `Bench cover unavailable. Less urgent since they're not on field, but reduces your emergency depth.`,
        link: "/trades",
        linkLabel: "Review",
        players: [p],
      });
    }

    if (byeAffectedPlayers.length > 0) {
      roundActions.push({
        tier: "must",
        text: `${byeAffectedPlayers.length} player${byeAffectedPlayers.length > 1 ? "s" : ""} on bye this round`,
        detail: `${byeAffectedPlayers.map(p => p.name).join(", ")} ${byeAffectedPlayers.length > 1 ? "are" : "is"} on bye. Move bench players on-field to cover or use a trade.`,
        link: "/team",
        linkLabel: "Fix Team",
      });
    }

    if (trades && trades.length > 0) {
      const urgentTrades = trades.filter(t => t.confidence > 0.7);
      for (const t of urgentTrades.slice(0, 2)) {
        if (!injuredPlayers.some(ip => ip.id === t.playerOutId)) {
          roundActions.push({
            tier: "should",
            text: `Trade ${t.playerOut.name} → ${t.playerIn.name}`,
            detail: t.reason || `${t.playerIn.name} (avg ${t.playerIn.avgScore?.toFixed(1)}) is a significant upgrade. Confidence: ${Math.round(t.confidence * 100)}%.`,
            link: "/trades",
            linkLabel: "View Trade",
          });
        }
      }
    }

    if (coldPlayers.length > 0 && roundActions.filter(a => a.tier === "could").length < 3) {
      const worstCold = coldPlayers[0];
      roundActions.push({
        tier: "could",
        text: `${worstCold.name} is underperforming`,
        detail: `L3 avg ${worstCold.last3Avg?.toFixed(0)} vs season avg ${worstCold.avgScore?.toFixed(0)}. Monitor another week or trade if form doesn't recover.`,
        link: `/player/${worstCold.id}`,
        linkLabel: "View",
      });
    }

    if (riskData && riskData.tagWarnings.length > 0) {
      const highTags = riskData.tagWarnings.filter(tw => tw.riskLevel === "high");
      for (const tw of highTags.slice(0, 1)) {
        roundActions.push({
          tier: "could",
          text: `${tw.playerName} — tag risk vs ${tw.nextOpponent}`,
          detail: tw.advice,
          link: `/player/${tw.playerId}`,
          linkLabel: "View",
        });
      }
    }
  }

  const mustActions = roundActions.filter(a => a.tier === "must");
  const shouldActions = roundActions.filter(a => a.tier === "should");
  const couldActions = roundActions.filter(a => a.tier === "could");

  const topPlayersForSnapshot = [...onFieldPlayers]
    .sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0))
    .slice(0, 8);

  const recentIntel = (intelReports || []).slice(0, 3);

  if (!hasTeam) {
    return (
      <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-4" data-testid="page-dashboard">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight" data-testid="text-page-title">Dashboard</h1>
        <Card data-testid="card-empty-state">
          <CardContent className="py-12 text-center space-y-4">
            <Users className="w-10 h-10 text-muted-foreground mx-auto" />
            <div>
              <p className="text-lg font-semibold" data-testid="text-empty-title">Set up your team to get started</p>
              <p className="text-sm text-muted-foreground mt-1">Import your squad or browse the player database to build your team.</p>
            </div>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <Button onClick={() => navigate("/analyze")} data-testid="button-upload-screenshot">
                <Camera className="w-4 h-4 mr-2" />
                Upload Screenshot
              </Button>
              <Button variant="outline" onClick={() => navigate("/players")} data-testid="button-browse-players">
                <Users className="w-4 h-4 mr-2" />
                Browse Players
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 max-w-7xl mx-auto" data-testid="page-dashboard">

      {/* A. Status Bar */}
      <Card data-testid="card-status-bar">
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center gap-3 sm:gap-5 flex-wrap">
            <Badge variant="outline" className="text-xs" data-testid="badge-round">
              <CircleDot className="w-3 h-3 mr-1" />
              R{currentRound}{isByeRoundNow ? (earlyByeRounds.includes(currentRound) ? " (Early Bye)" : " (Bye)") : ""}
            </Badge>
            <span className="text-sm font-semibold" data-testid="text-team-name">{settings?.teamName || "My Team"}</span>
            <div className="flex items-center gap-1.5 ml-auto flex-wrap">
              <div className="flex items-center gap-1">
                <Target className="w-3.5 h-3.5 text-primary" />
                <span className="text-sm font-mono font-bold" data-testid="text-projected-score">{Math.round(totalScore)}</span>
                <span className="text-[10px] text-muted-foreground">proj</span>
              </div>
              <span className="text-muted-foreground mx-1">|</span>
              <div className="flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-accent" />
                <span className="text-sm font-mono font-bold text-accent" data-testid="text-team-value">{formatPrice(totalSalary)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {currentRound <= 1 && (
        <Card className="border-amber-500/30 bg-amber-500/5" data-testid="card-preseason-notice">
          <CardContent className="p-3 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Early Season Data</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {currentRound === 0 ? "Opening Round" : `Round ${currentRound}`} — Player averages, form trends, and projections are based on <strong>2025 season data</strong>, not 2026 form.
                Break-evens are initial values. Full data builds as the season progresses.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {hasTeam && unknownSelectionCount > 0 && currentRound >= 1 && (
        <Card className="border-blue-500/30 bg-blue-500/5" data-testid="card-teamsheet-notice">
          <CardContent className="p-3 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-blue-700 dark:text-blue-400">Team Sheets Not Yet Announced</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {unknownSelectionCount} of your on-field players have no team sheet confirmation yet. AFL clubs and the league release team sheets in the days before each game — playing status will be updated once announced. Changes can be made up to the start of each game.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* B. Round Actions — MUST / SHOULD / COULD */}
      <Card data-testid="card-round-actions">
        <CardHeader className="pb-2 px-4 pt-4">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm sm:text-base font-semibold flex items-center gap-2">
              <Zap className="w-4 h-4 text-accent" />
              Round {currentRound} Actions
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px]" data-testid="badge-trades-round">
                {availableTradesRound}/{maxTradesThisRound} trades
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          {roundActions.length === 0 ? (
            <div className="flex items-center gap-2.5 p-3 rounded-md bg-emerald-500/5 border border-emerald-500/15" data-testid="status-all-good">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <p className="text-sm text-emerald-700 dark:text-emerald-400 font-medium">All good — no urgent actions this round</p>
            </div>
          ) : (
            <>
              {mustActions.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    <span className="text-[11px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">Must Do</span>
                    <span className="text-[10px] text-muted-foreground ml-1">— act before lockout</span>
                  </div>
                  {mustActions.map((item, i) => (
                    <div
                      key={`must-${i}`}
                      className="rounded-md border-l-4 border-l-red-500 bg-red-500/5 p-3 cursor-pointer hover:brightness-95 transition-all"
                      onClick={() => navigate(item.link)}
                      data-testid={`action-must-${i}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold">{item.text}</p>
                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{item.detail}</p>
                        </div>
                        <Button variant="outline" size="sm" className="shrink-0 text-xs h-7 border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/10" data-testid={`button-must-${i}`}>
                          {item.linkLabel}
                          <ChevronRight className="w-3 h-3 ml-1" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {shouldActions.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-amber-500" />
                    <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Should Do</span>
                    <span className="text-[10px] text-muted-foreground ml-1">— recommended this round</span>
                  </div>
                  {shouldActions.map((item, i) => (
                    <div
                      key={`should-${i}`}
                      className="rounded-md border-l-4 border-l-amber-500 bg-amber-500/5 p-3 cursor-pointer hover:brightness-95 transition-all"
                      onClick={() => navigate(item.link)}
                      data-testid={`action-should-${i}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold">{item.text}</p>
                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{item.detail}</p>
                        </div>
                        <Button variant="ghost" size="sm" className="shrink-0 text-xs h-7" data-testid={`button-should-${i}`}>
                          {item.linkLabel}
                          <ChevronRight className="w-3 h-3 ml-1" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {couldActions.length > 0 && (
                <Collapsible>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">Could Do</span>
                    <span className="text-[10px] text-muted-foreground ml-1">— worth considering</span>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="ml-auto h-5 px-1.5 text-[10px]" data-testid="button-toggle-could">
                        <ChevronDown className="w-3 h-3" />
                      </Button>
                    </CollapsibleTrigger>
                  </div>
                  <CollapsibleContent className="space-y-2 mt-2">
                    {couldActions.map((item, i) => (
                      <div
                        key={`could-${i}`}
                        className="rounded-md border-l-4 border-l-blue-500 bg-blue-500/5 p-3 cursor-pointer hover:brightness-95 transition-all"
                        onClick={() => navigate(item.link)}
                        data-testid={`action-could-${i}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold">{item.text}</p>
                            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{item.detail}</p>
                          </div>
                          <Button variant="ghost" size="sm" className="shrink-0 text-xs h-7" data-testid={`button-could-${i}`}>
                            {item.linkLabel}
                            <ChevronRight className="w-3 h-3 ml-1" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* C. Captain Loophole Panel */}
      {(captain || viceCaptain) && (
        <Card data-testid="card-captain-loophole">
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
                    <p className="text-sm font-semibold">{viceCaptain.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {viceCaptain.team} vs {viceCaptain.nextOpponent}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Clock className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="text-xs font-medium">{viceCaptain.gameTime || 'TBA'}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-base sm:text-lg font-bold text-emerald-600 dark:text-emerald-400">
                      {((viceCaptain.projectedScore || viceCaptain.avgScore || 0) * 2).toFixed(0)}
                    </p>
                    {viceCaptain.captainProbability != null && (() => {
                      const pct = viceCaptain.captainProbability * 100;
                      const pillColor = pct > 40 ? "bg-green-500/15 text-green-700 dark:text-green-400" : pct >= 25 ? "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400" : "bg-red-500/15 text-red-700 dark:text-red-400";
                      return (
                        <span className={`inline-block text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded-md mt-0.5 ${pillColor}`} data-testid="text-vc-probability">
                          P(120+): {pct.toFixed(0)}%
                        </span>
                      );
                    })()}
                    {viceCaptain.captainProbability == null && (
                      <p className="text-[9px] text-muted-foreground">2x score</p>
                    )}
                  </div>
                </div>
              )}
              {captain && (
                <div className="flex items-center gap-3 p-3 rounded-md bg-muted/50 cursor-pointer hover-elevate" data-testid="card-captain-pick" onClick={() => navigate(`/player/${captain.id}`)}>
                  <div className="w-9 h-9 rounded-md bg-accent/15 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-accent">C</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{captain.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {captain.team} vs {captain.nextOpponent}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Clock className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="text-xs font-medium">{captain.gameTime || 'TBA'}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-base sm:text-lg font-bold text-accent">
                      {((captain.projectedScore || captain.avgScore || 0) * 2).toFixed(0)}
                    </p>
                    {captain.captainProbability != null && (() => {
                      const pct = captain.captainProbability * 100;
                      const pillColor = pct > 40 ? "bg-green-500/15 text-green-700 dark:text-green-400" : pct >= 25 ? "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400" : "bg-red-500/15 text-red-700 dark:text-red-400";
                      return (
                        <span className={`inline-block text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded-md mt-0.5 ${pillColor}`} data-testid="text-c-probability">
                          P(120+): {pct.toFixed(0)}%
                        </span>
                      );
                    })()}
                    {captain.captainProbability == null && (
                      <p className="text-[9px] text-muted-foreground">Safety net</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <Collapsible open={loopholeOpen} onOpenChange={setLoopholeOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="text-xs w-full justify-start" data-testid="button-loophole-explainer">
                  <Info className="w-3 h-3 mr-1.5" />
                  How the loophole works
                  <ChevronDown className={`w-3 h-3 ml-auto transition-transform ${loopholeOpen ? "rotate-180" : ""}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="p-2.5 rounded-md bg-accent/5 border border-accent/10 mt-2">
                  <p className="text-[11px] sm:text-xs text-muted-foreground leading-relaxed">
                    <span className="font-semibold text-foreground">The Captain Loophole:</span> Set your Vice Captain (VC) to a player in an earlier game.
                    If they score 110+ (doubling to 220+), keep them. Otherwise, switch to your Captain (C) before their later game starts — their doubled score replaces the VC's.
                    {viceCaptain && captain && (
                      <span className="block mt-1.5">
                        <span className="font-medium text-foreground">This week:</span> If {viceCaptain.name} (VC) scores 110+ in their {viceCaptain.gameTime || "early"} game, keep doubled score. Otherwise switch to {captain.name} before their {captain.gameTime || "later"} game.
                      </span>
                    )}
                    {gameRules?.captainRules?.tog50Rule && (
                      <span className="block mt-1 text-yellow-600 dark:text-yellow-400">50% TOG Rule: If captain plays &lt;50% TOG, VC score doubles if higher.</span>
                    )}
                  </p>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>
      )}

      {/* D. My Team Snapshot */}
      {topPlayersForSnapshot.length > 0 && (
        <Card data-testid="card-team-snapshot">
          <CardHeader className="pb-2 px-4 pt-4">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm sm:text-base font-semibold flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                My Team Snapshot
              </CardTitle>
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => navigate("/team")} data-testid="button-full-team">
                Full Team <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <div className={`grid gap-2 ${isMobile ? "grid-cols-2" : "grid-cols-4"}`}>
              {topPlayersForSnapshot.map((player) => {
                const beColor = (player.breakEven ?? 0) < 0 ? "text-green-600 dark:text-green-400" : (player.breakEven ?? 0) > 100 ? "text-red-500" : "text-muted-foreground";
                return (
                  <div
                    key={player.id}
                    className="p-2.5 rounded-md bg-muted/30 hover-elevate cursor-pointer"
                    data-testid={`card-snapshot-player-${player.id}`}
                    onClick={() => navigate(`/player/${player.id}`)}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <p className="text-xs sm:text-sm font-medium line-clamp-2">{player.name}</p>
                      {(player.injuryStatus || player.selectionStatus === "injured" || player.selectionStatus === "not-playing") ? (
                        <Badge variant="destructive" className="text-[8px] px-1 py-0 shrink-0" data-testid={`badge-injury-${player.id}`}>INJ</Badge>
                      ) : (
                        <FormTrendIcon trend={player.formTrend} />
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="secondary" className="text-[9px]">{player.position}{player.dualPosition ? `/${player.dualPosition}` : ""}</Badge>
                      {player.injuryStatus && (
                        <span className="text-[9px] text-red-500">{player.injuryStatus}</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-1 mt-1.5">
                      <span className="text-xs font-mono">{player.avgScore?.toFixed(1)}</span>
                      <span className={`text-[10px] font-mono ${beColor}`} data-testid={`text-be-${player.id}`}>
                        BE: {player.breakEven ?? "—"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* E. Intel Flash */}
      {recentIntel.length > 0 && (
        <Card data-testid="card-intel-flash">
          <CardHeader className="pb-2 px-4 pt-4">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm sm:text-base font-semibold flex items-center gap-2">
                <Zap className="w-4 h-4 text-violet-500" />
                Intel Flash
              </CardTitle>
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => navigate("/intel")} data-testid="button-view-all-intel">
                View All Intel <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <div className="flex gap-3 overflow-x-auto pb-1">
              {recentIntel.map((report) => (
                <div
                  key={report.id}
                  className="min-w-[220px] max-w-[280px] p-3 rounded-md bg-muted/30 hover-elevate cursor-pointer shrink-0"
                  data-testid={`card-intel-${report.id}`}
                  onClick={() => navigate("/intel")}
                >
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Badge variant="secondary" className="text-[9px]">{report.category}</Badge>
                  </div>
                  <p className="text-sm font-medium line-clamp-1" data-testid={`text-intel-title-${report.id}`}>{report.title}</p>
                  <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{report.content}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* F. Existing sections below */}

      {/* Player Risks & Warnings */}
      {(lateChangeAlerts.length > 0 || coldPlayers.length > 0 || byeAffectedPlayers.length > 0 ||
        (riskData && riskData.tagWarnings.length > 0)) && (
        <Collapsible>
        <Card className="border-destructive/30" data-testid="card-risk-assessment">
          <CollapsibleTrigger asChild>
            <CardHeader className="pb-2 px-4 pt-4 cursor-pointer">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm sm:text-base font-semibold flex items-center gap-2 text-destructive">
                  <ShieldAlert className="w-4 h-4" />
                  Player Risks & Warnings
                </CardTitle>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Injuries, availability issues, tag threats, and bench swap advice
              </p>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
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
                          <p className="text-sm font-medium">
                            {alert.playerName}
                            {alert.isCaptain && <span className="text-[10px] ml-1 text-yellow-600 dark:text-yellow-400">(C)</span>}
                            {alert.isViceCaptain && <span className="text-[10px] ml-1 text-emerald-600 dark:text-emerald-400">(VC)</span>}
                          </p>
                          <p className="text-[11px] text-muted-foreground leading-snug">{alert.reason}</p>
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
                    <p className="text-sm font-medium">{player.name}</p>
                    <p className="text-[11px] text-muted-foreground leading-snug">
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
                  Based on opponent tagging history and confirmed tag matchups
                </p>
                {riskData.tagWarnings.map((tw) => (
                  <div key={tw.playerId} className="cursor-pointer hover:bg-muted/30 rounded px-1 py-2 border-b border-orange-500/10 last:border-0" onClick={() => navigate(`/player/${tw.playerId}`)} data-testid={`tag-warning-${tw.playerId}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${tw.riskLevel === 'high' ? 'bg-red-500' : tw.riskLevel === 'moderate' ? 'bg-orange-400' : 'bg-yellow-400'}`} />
                        <div className="min-w-0">
                          <p className="text-sm">
                            {tw.playerName}
                            {tw.isCaptain && <span className="text-[10px] ml-1 text-yellow-600 dark:text-yellow-400">(C)</span>}
                            {tw.isViceCaptain && <span className="text-[10px] ml-1 text-emerald-600 dark:text-emerald-400">(VC)</span>}
                            <span className="text-[10px] ml-1 text-muted-foreground">vs {tw.nextOpponent}</span>
                          </p>
                          <p className="text-[10px] text-muted-foreground leading-snug">{tw.advice}</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        {tw.avgScoreWhenTagged !== null && (
                          <p className="text-xs font-mono">
                            <span className="text-muted-foreground">{tw.avgScore?.toFixed(0)}</span>
                            <span className="text-red-500 ml-1">&rarr; {tw.avgScoreWhenTagged.toFixed(0)}</span>
                          </p>
                        )}
                        <Badge variant={tw.riskLevel === "high" ? "destructive" : "outline"} className="text-[8px]">
                          {tw.riskLevel}
                        </Badge>
                      </div>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1 ml-4">
                      {tw.opponentTagger && (
                        <span className="text-[9px] bg-orange-500/10 text-orange-700 dark:text-orange-300 px-1.5 py-0.5 rounded">
                          Tagger: {tw.opponentTagger}
                        </span>
                      )}
                      {tw.timesTaggedHistorically > 0 && (
                        <span className="text-[9px] bg-muted px-1.5 py-0.5 rounded">
                          Tagged {tw.timesTaggedHistorically}x previously
                        </span>
                      )}
                      <span className="text-[9px] bg-muted px-1.5 py-0.5 rounded">
                        {tw.nextOpponent} tag {Math.round(tw.opponentTagFrequency * 100)}% of games
                      </span>
                    </div>
                  </div>
                ))}
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
                      <span className="text-sm">{p.name}</span>
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
          </CollapsibleContent>
        </Card>
        </Collapsible>
      )}

      {/* Round Score Simulator */}
      <Card data-testid="card-simulation">
        <CardHeader className="pb-2 px-4 pt-4">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm sm:text-base font-semibold flex items-center gap-2">
              <Activity className="w-4 h-4 text-violet-500" />
              Round Score Simulator
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
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed" data-testid="text-simulation-description">
            Runs 10,000 Monte Carlo simulations using each player's scoring variance to predict your team's total AFL Classic score range this round. Helps you understand best-case, worst-case, and most likely outcomes.
          </p>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          {!simResult && !simulationMutation.isPending && (
            <div className="text-center py-8 space-y-2" data-testid="text-simulation-prompt">
              <p className="text-sm text-muted-foreground">
                Click "Run Simulation" to model your team's scoring range
              </p>
              <p className="text-[11px] text-muted-foreground max-w-md mx-auto leading-relaxed">
                The simulator accounts for each player's scoring consistency, form trends, and historical variance to give you a realistic range of possible round totals for your on-field squad.
              </p>
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
                  <p className="text-[9px] text-muted-foreground">Average outcome</p>
                </div>
                <div className="bg-muted/30 rounded-md p-2.5 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Median</p>
                  <p className="text-lg font-bold font-mono" data-testid="text-sim-median">{Math.round(simResult.medianTotal)}</p>
                  <p className="text-[9px] text-muted-foreground">50/50 midpoint</p>
                </div>
                <div className="bg-muted/30 rounded-md p-2.5 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Floor (10th)</p>
                  <p className="text-lg font-bold font-mono text-red-500" data-testid="text-sim-floor">{Math.round(simResult.floor)}</p>
                  <p className="text-[9px] text-muted-foreground">Bad week score</p>
                </div>
                <div className="bg-muted/30 rounded-md p-2.5 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Ceiling (90th)</p>
                  <p className="text-lg font-bold font-mono text-green-500" data-testid="text-sim-ceiling">{Math.round(simResult.ceiling)}</p>
                  <p className="text-[9px] text-muted-foreground">Great week score</p>
                </div>
              </div>

              <div className="p-2.5 rounded-md bg-violet-500/5 border border-violet-500/15" data-testid="section-sim-context">
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  <span className="font-semibold text-foreground">How to read this:</span>{" "}
                  Your on-field squad is projected to score between{" "}
                  <span className="font-mono font-semibold text-red-500">{Math.round(simResult.floor)}</span> (floor) and{" "}
                  <span className="font-mono font-semibold text-green-500">{Math.round(simResult.ceiling)}</span> (ceiling) in 80% of simulated rounds.
                  The <span className="font-semibold">expected score</span> of{" "}
                  <span className="font-mono font-semibold">{Math.round(simResult.expectedTotal)}</span>{" "}
                  is what you'd average over many rounds with this lineup.
                  {simResult.ceiling - simResult.floor > 400 && (
                    <span className="block mt-1 text-amber-600 dark:text-amber-400">
                      Wide range ({Math.round(simResult.ceiling - simResult.floor)} pts) suggests high-variance players in your squad. Consider trading volatile players for more consistent scorers if you want predictable weekly totals.
                    </span>
                  )}
                </p>
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
                <div className="flex items-center justify-center gap-4 mt-1">
                  <div className="flex items-center gap-1">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ background: "hsl(0 70% 50% / 0.5)" }} />
                    <span className="text-[9px] text-muted-foreground">Floor zone</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ background: "hsl(var(--primary) / 0.7)" }} />
                    <span className="text-[9px] text-muted-foreground">Expected range</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ background: "hsl(142 70% 45% / 0.5)" }} />
                    <span className="text-[9px] text-muted-foreground">Ceiling zone</span>
                  </div>
                </div>
              </div>

              {simResult.playerRiskContributions.length > 0 && (
                <div>
                  <p className="text-xs font-medium mb-1.5 text-muted-foreground flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Top Variance Contributors
                  </p>
                  <p className="text-[10px] text-muted-foreground mb-2 leading-relaxed">
                    These players have the most inconsistent scoring. High variance means bigger swings in your weekly total. Trading them for steadier scorers narrows your floor-ceiling gap.
                  </p>
                  <div className="space-y-1">
                    {simResult.playerRiskContributions.slice(0, 3).map((p, i) => (
                      <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded-md bg-muted/20" data-testid={`card-risk-contributor-${i}`}>
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{p.name}</p>
                          <p className="text-[10px] text-muted-foreground">{p.team}</p>
                        </div>
                        <Badge variant="outline" className="text-[10px] font-mono shrink-0">
                          &plusmn;{p.stdDev.toFixed(1)} pts
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(() => {
                const recommendations: { icon: typeof Target; text: string; type: "info" | "warning" | "success" }[] = [];
                const spread = simResult.ceiling - simResult.floor;
                const topVariance = simResult.playerRiskContributions[0];

                if (spread > 500) {
                  recommendations.push({
                    icon: AlertTriangle,
                    text: `Your scoring range is very wide (${Math.round(spread)} pts). Your team is boom-or-bust. Consider trading high-variance players for consistent 80+ scorers to stabilise your weekly output.`,
                    type: "warning",
                  });
                } else if (spread > 350) {
                  recommendations.push({
                    icon: Target,
                    text: `Moderate scoring variance (${Math.round(spread)} pts spread). Your team has a decent balance of consistency and upside. Focus trades on lifting your floor score.`,
                    type: "info",
                  });
                } else {
                  recommendations.push({
                    icon: Shield,
                    text: `Tight scoring range (${Math.round(spread)} pts spread). Your team is very consistent — great for head-to-head leagues. Look for ceiling upside through premium upgrades.`,
                    type: "success",
                  });
                }

                if (topVariance && topVariance.stdDev > 25) {
                  recommendations.push({
                    icon: ArrowLeftRight,
                    text: `${topVariance.name} (±${topVariance.stdDev.toFixed(1)} pts) is your biggest wildcard. Trading them for a steadier scorer at a similar average could significantly reduce your downside risk.`,
                    type: "warning",
                  });
                }

                if (simResult.expectedTotal < 1600 && onFieldPlayers.length >= 18) {
                  recommendations.push({
                    icon: TrendingUp,
                    text: `Expected score of ${Math.round(simResult.expectedTotal)} is below the typical competitive threshold (~1700+). Prioritise upgrading your lowest-averaging on-field players.`,
                    type: "warning",
                  });
                }

                if (simResult.percentiles.p25 > 1700) {
                  recommendations.push({
                    icon: Zap,
                    text: `Strong squad depth — even your 25th percentile outcome (${Math.round(simResult.percentiles.p25)}) is competitive. You're well-positioned for a top finish this round.`,
                    type: "success",
                  });
                }

                return recommendations.length > 0 ? (
                  <div className="space-y-2" data-testid="section-sim-recommendations">
                    <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <Zap className="w-3 h-3" />
                      Recommendations
                    </p>
                    {recommendations.map((rec, i) => {
                      const RecIcon = rec.icon;
                      return (
                        <div
                          key={i}
                          className={`p-2.5 rounded-md border text-[11px] leading-relaxed ${
                            rec.type === "warning"
                              ? "bg-amber-500/5 border-amber-500/15 text-amber-700 dark:text-amber-300"
                              : rec.type === "success"
                              ? "bg-emerald-500/5 border-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                              : "bg-blue-500/5 border-blue-500/15 text-blue-700 dark:text-blue-300"
                          }`}
                          data-testid={`text-sim-recommendation-${i}`}
                        >
                          <div className="flex items-start gap-2">
                            <RecIcon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <span>{rec.text}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null;
              })()}

              <p className="text-[10px] text-muted-foreground text-center">
                Based on {simResult.iterations.toLocaleString()} iterations &bull; P25: {Math.round(simResult.percentiles.p25)} | P75: {Math.round(simResult.percentiles.p75)} | P95: {Math.round(simResult.percentiles.p95)}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recommended Trades & Top Guns */}
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
                    <span className="text-destructive font-medium">
                      {trade.playerOut.name}
                    </span>
                    <ArrowLeftRight className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="text-green-600 dark:text-green-400 font-medium">
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
                      <p className="text-sm font-medium">{player.name}</p>
                      <p className="text-[11px] text-muted-foreground">
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

      {/* Bench Watch */}
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
                      <p className="text-sm font-medium">{p.name}</p>
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

      {/* Breakout Candidates */}
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
                onClick={() => navigate("/form")}
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
                      <p className="text-sm font-medium">{player.name}</p>
                      <p className="text-[11px] text-muted-foreground">
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
