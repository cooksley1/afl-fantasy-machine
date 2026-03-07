import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { PlayerAvatar } from "@/components/player-avatar";
import {
  ArrowLeftRight,
  Zap,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  RefreshCw,
  AlertTriangle,
  Brain,
  DollarSign,
  Shield,
  Flame,
  ArrowUpCircle,
  Settings2,
  Users,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getTeamColors, getTeamAbbr } from "@/lib/afl-teams";
import type { TradeRecommendationWithPlayers, LeagueSettings } from "@shared/schema";

const CATEGORY_CONFIG: Record<string, { label: string; icon: typeof Flame; color: string; bgColor: string; description: string }> = {
  urgent: { label: "Must Trade", icon: Flame, color: "text-red-600 dark:text-red-400", bgColor: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800", description: "Injured, dropped, or late change — act now" },
  upgrade: { label: "Score Upgrade", icon: ArrowUpCircle, color: "text-green-600 dark:text-green-400", bgColor: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800", description: "Higher ceiling, better form — win this week" },
  cash_gen: { label: "Cash Generation", icon: DollarSign, color: "text-amber-600 dark:text-amber-400", bgColor: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800", description: "Build bank for premium upgrades later" },
  structure: { label: "Structure Fix", icon: Settings2, color: "text-blue-600 dark:text-blue-400", bgColor: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800", description: "DPP, bye coverage, or positional balance" },
};

const URGENCY_BADGE: Record<string, { label: string; variant: "destructive" | "default" | "secondary" | "outline" }> = {
  critical: { label: "CRITICAL", variant: "destructive" },
  high: { label: "HIGH", variant: "default" },
  medium: { label: "MEDIUM", variant: "secondary" },
  low: { label: "LOW", variant: "outline" },
};

function ConfidenceBar({ confidence }: { confidence: number }) {
  const pct = Math.round((confidence || 0) * 100);
  const color = pct >= 70 ? "bg-green-500" : pct >= 45 ? "bg-amber-500" : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono font-medium w-8 text-right">{pct}%</span>
    </div>
  );
}

function PlayerPill({ player, direction }: { player: any; direction: "out" | "in" }) {
  const teamColors = getTeamColors(player.team);
  const abbr = getTeamAbbr(player.team);
  const isOut = direction === "out";

  return (
    <div className="flex items-center gap-2.5 min-w-0 flex-1">
      <PlayerAvatar
        aflFantasyId={player.aflFantasyId}
        playerName={player.name}
        team={player.team}
        size="sm"
      />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <Badge
            variant={isOut ? "destructive" : "default"}
            className={`text-[9px] px-1.5 py-0 ${!isOut ? "bg-green-600 dark:bg-green-700 text-white" : ""}`}
          >
            {isOut ? "OUT" : "IN"}
          </Badge>
          <p className="text-sm font-semibold" data-testid={`text-trade-player-${direction}-${player.id}`}>{player.name}</p>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>{player.position}</span>
          <span className="opacity-40">•</span>
          <span>Avg {player.avgScore?.toFixed(1) || "—"}</span>
          <span className="opacity-40">•</span>
          <span className="font-mono">${(player.price / 1000).toFixed(0)}K</span>
          {player.last3Avg && (
            <>
              <span className="opacity-40">•</span>
              <span className={player.formTrend === "up" ? "text-green-500" : player.formTrend === "down" ? "text-red-400" : ""}>
                L3: {player.last3Avg.toFixed(1)}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Trades() {
  const { toast } = useToast();

  const { data: trades, isLoading } = useQuery<TradeRecommendationWithPlayers[]>({
    queryKey: ["/api/trade-recommendations"],
  });

  const { data: settings } = useQuery<LeagueSettings>({
    queryKey: ["/api/settings"],
  });

  const { data: teamPlayers } = useQuery<any[]>({
    queryKey: ["/api/my-team"],
  });

  const generateMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/trade-recommendations/generate"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trade-recommendations"] });
      toast({ title: "Trade recommendations generated", description: "Filtered to only worthwhile trades" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const aiGenerateMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/trade-recommendations/generate-ai"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trade-recommendations"] });
      toast({ title: "AI trade analysis complete", description: "Deep analysis with form, matchups, bye strategy" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const executeTradeMutation = useMutation({
    mutationFn: (tradeId: number) =>
      apiRequest("POST", `/api/trade-recommendations/${tradeId}/execute`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trade-recommendations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-team"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Trade executed successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 rounded-md" />
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  const allTrades = trades || [];
  const grouped: Record<string, TradeRecommendationWithPlayers[]> = {};
  for (const t of allTrades) {
    const cat = t.category || "upgrade";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(t);
  }

  const categoryOrder = ["urgent", "upgrade", "cash_gen", "structure"];

  const currentRound = settings?.currentRound ?? 1;

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-5xl mx-auto" data-testid="page-trades">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Trade Centre</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Only worthwhile trades — filtered by form, value, and win impact
          </p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button
            variant="secondary"
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            className="flex-1 sm:flex-initial"
            data-testid="button-generate-trades"
          >
            {generateMutation.isPending ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Zap className="w-4 h-4 mr-2" />
            )}
            Quick
          </Button>
          <Button
            onClick={() => aiGenerateMutation.mutate()}
            disabled={aiGenerateMutation.isPending}
            className="flex-1 sm:flex-initial"
            data-testid="button-generate-ai-trades"
          >
            {aiGenerateMutation.isPending ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Brain className="w-4 h-4 mr-2" />
            )}
            {aiGenerateMutation.isPending ? "Analyzing..." : "AI Analysis"}
          </Button>
        </div>
      </div>

      {currentRound <= 1 && (
        <Card className="border-amber-500/30 bg-amber-500/5" data-testid="card-preseason-trades">
          <CardContent className="p-3 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              <strong className="text-amber-700 dark:text-amber-400">Preseason</strong> — Trades open from Round 2. Recommendations below are based on 2025 averages and squad structure assessment only.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-accent/15 flex items-center justify-center">
                <ArrowLeftRight className="w-5 h-5 text-accent" />
              </div>
              <div>
                <p className="text-sm font-semibold">Trades This Round</p>
                <p className="text-xs text-muted-foreground">
                  Round {settings?.currentRound || 1} — {settings?.totalTradesUsed || 0} used this season
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-accent" data-testid="text-trades-remaining">
                {settings?.tradesRemaining || 0}
              </p>
              <p className="text-[10px] text-muted-foreground">remaining</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {allTrades.length === 0 && !teamPlayers?.length && (
        <Card>
          <CardContent className="py-16 text-center">
            <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-semibold text-lg mb-1" data-testid="text-empty-no-team">Add Players to Your Team First</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
              You need a team before we can suggest trades. Head to My Team to import your AFL Fantasy squad.
            </p>
            <Button
              variant="default"
              onClick={() => { window.location.href = "/my-team"; }}
              data-testid="button-go-to-my-team"
            >
              <Users className="w-4 h-4 mr-2" />
              Go to My Team
            </Button>
          </CardContent>
        </Card>
      )}

      {allTrades.length === 0 && (teamPlayers?.length ?? 0) > 0 && (
        <Card>
          <CardContent className="py-16 text-center">
            <ArrowLeftRight className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-semibold text-lg mb-1" data-testid="text-empty-no-trades">No Trade Recommendations</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
              Generate trade suggestions based on form differentials, breakevens, cash generation, and win probability.
            </p>
            <Button
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
              data-testid="button-generate-trades-empty"
            >
              <Zap className="w-4 h-4 mr-2" />
              Generate Now
            </Button>
          </CardContent>
        </Card>
      )}

      {categoryOrder.map((cat) => {
        const catTrades = grouped[cat];
        if (!catTrades || catTrades.length === 0) return null;
        const config = CATEGORY_CONFIG[cat] || CATEGORY_CONFIG.upgrade;
        const Icon = config.icon;

        return (
          <div key={cat} className="space-y-3" data-testid={`section-category-${cat}`}>
            <div className={`rounded-lg border p-3 ${config.bgColor}`}>
              <div className="flex items-center gap-2">
                <Icon className={`w-4 h-4 ${config.color}`} />
                <h2 className={`text-sm font-bold uppercase tracking-wide ${config.color}`}>
                  {config.label}
                </h2>
                <Badge variant="outline" className="text-[10px] ml-auto">{catTrades.length}</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{config.description}</p>
            </div>
            {catTrades.map((trade) => (
              <TradeCard
                key={trade.id}
                trade={trade}
                onExecute={() => executeTradeMutation.mutate(trade.id)}
                isPending={executeTradeMutation.isPending}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function TradeCard({
  trade,
  onExecute,
  isPending,
}: {
  trade: TradeRecommendationWithPlayers;
  onExecute: () => void;
  isPending: boolean;
}) {
  const urgencyConfig = URGENCY_BADGE[trade.urgency || "medium"] || URGENCY_BADGE.medium;

  return (
    <Card className="hover-elevate" data-testid={`card-trade-${trade.id}`}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <Badge variant={urgencyConfig.variant} className="text-[10px]" data-testid={`badge-urgency-${trade.id}`}>
              {urgencyConfig.label}
            </Badge>
            {trade.tradeEv !== null && trade.tradeEv !== undefined && (
              <span
                className={`text-xs font-mono font-bold ${trade.tradeEv > 30 ? "text-green-500" : trade.tradeEv > 10 ? "text-amber-500" : "text-muted-foreground"}`}
                data-testid={`text-trade-ev-${trade.id}`}
              >
                EV: {trade.tradeEv.toFixed(0)}
              </span>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <PlayerPill player={trade.playerOut} direction="out" />
            <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0 hidden sm:block" />
            <PlayerPill player={trade.playerIn} direction="in" />
          </div>

          <div className="flex items-center justify-between gap-3 border-t pt-3">
            <div className="flex-1">
              <ConfidenceBar confidence={trade.confidence} />
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1.5 flex-wrap">
                <span className={trade.scoreDifference > 0 ? "text-green-500 font-medium" : trade.scoreDifference < 0 ? "text-red-400" : ""}>
                  {trade.scoreDifference > 0 ? "+" : ""}
                  {trade.scoreDifference?.toFixed(1)} pts/gm
                </span>
                <span className="opacity-40">•</span>
                <span className={(trade.priceChange || 0) < 0 ? "text-green-500" : (trade.priceChange || 0) > 0 ? "text-red-400" : ""}>
                  {(trade.priceChange || 0) < 0 ? "saves " : "+"}${Math.abs((trade.priceChange || 0) / 1000).toFixed(0)}K
                </span>
                {(trade as any).seasonTradeGain != null && (trade as any).seasonTradeGain !== 0 && (
                  <>
                    <span className="opacity-40">•</span>
                    <span className={(trade as any).seasonTradeGain > 0 ? "text-green-500 font-medium" : "text-red-400"} data-testid={`text-season-gain-${trade.id}`}>
                      {(trade as any).seasonTradeGain > 0 ? "+" : ""}{(trade as any).seasonTradeGain.toFixed(0)} szn pts
                    </span>
                  </>
                )}
              </div>
            </div>

            <Button
              size="sm"
              onClick={onExecute}
              disabled={isPending}
              data-testid={`button-execute-trade-${trade.id}`}
            >
              Execute
            </Button>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t space-y-1" data-testid={`text-trade-reason-${trade.id}`}>
          {trade.reason?.split(/(?<=\.) (?=[A-Z])/).filter(Boolean).map((line, i) => {
            const trimmed = line.trim();
            const isHeader = trimmed.startsWith("OUT:") || trimmed.startsWith("IN:");
            const isPlan = trimmed.startsWith("PRICE PLAN:") || trimmed.startsWith("LONG-TERM:") || trimmed.startsWith("SEASON PLAN:") || trimmed.startsWith("SELL URGENCY:");
            const isHold = trimmed.startsWith("HOLD:") || trimmed.startsWith("CAUTION:");
            return (
              <p
                key={i}
                className={`text-xs leading-relaxed ${
                  isHeader ? "font-semibold text-foreground" :
                  isPlan ? "font-medium text-blue-600 dark:text-blue-400" :
                  isHold ? "font-medium text-amber-600 dark:text-amber-400" :
                  "text-muted-foreground"
                }`}
                data-testid={`text-reason-line-${trade.id}-${i}`}
              >
                {trimmed}
              </p>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
