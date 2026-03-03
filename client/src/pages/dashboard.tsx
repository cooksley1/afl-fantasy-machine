import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  ArrowLeftRight,
  DollarSign,
  Target,
  BarChart3,
  Crown,
  AlertTriangle,
  Repeat2,
  Clock,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ErrorState } from "@/components/error-state";
import type { PlayerWithTeamInfo, LeagueSettings, TradeRecommendationWithPlayers } from "@shared/schema";

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  accent,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: any;
  accent?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {title}
            </p>
            <p className={`text-2xl font-bold tracking-tight ${accent ? "text-accent" : ""}`}>
              {value}
            </p>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <div className={`p-2.5 rounded-md ${accent ? "bg-accent/10" : "bg-primary/10"}`}>
            <Icon className={`w-4 h-4 ${accent ? "text-accent" : "text-primary"}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FormTrendIcon({ trend }: { trend: string }) {
  if (trend === "up") return <TrendingUp className="w-3.5 h-3.5 text-green-500" />;
  if (trend === "down") return <TrendingDown className="w-3.5 h-3.5 text-red-500" />;
  return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
}

export default function Dashboard() {
  const { data: teamPlayers, isLoading: loadingTeam, isError: errorTeam, refetch: refetchTeam } = useQuery<PlayerWithTeamInfo[]>({
    queryKey: ["/api/my-team"],
  });

  const { data: settings, isLoading: loadingSettings, isError: errorSettings, refetch: refetchSettings } = useQuery<LeagueSettings>({
    queryKey: ["/api/settings"],
  });

  const { data: trades, isLoading: loadingTrades, isError: errorTrades, refetch: refetchTrades } = useQuery<TradeRecommendationWithPlayers[]>({
    queryKey: ["/api/trade-recommendations"],
  });

  const isLoading = loadingTeam || loadingSettings || loadingTrades;
  const hasError = errorTeam || errorSettings || errorTrades;

  const onFieldPlayers = teamPlayers?.filter((p) => p.isOnField) || [];
  const totalScore = onFieldPlayers.reduce((sum, p) => sum + (p.avgScore || 0), 0);
  const totalSalary = teamPlayers?.reduce((sum, p) => sum + p.price, 0) || 0;
  const captain = teamPlayers?.find((p) => p.isCaptain);
  const viceCaptain = teamPlayers?.find((p) => p.isViceCaptain);
  const lateChangeAlerts = (teamPlayers || []).filter(
    (p) => p.lateChange || p.injuryStatus || !p.isNamedTeam
  );

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-md" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-80 rounded-md" />
          <Skeleton className="h-80 rounded-md" />
        </div>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <ErrorState
          message="Failed to load dashboard data. Please try again."
          onRetry={() => { refetchTeam(); refetchSettings(); refetchTrades(); }}
        />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto" data-testid="page-dashboard">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">
          {settings?.teamName || "My Team"} Dashboard
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Round {settings?.currentRound || 1} overview and insights
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Projected Score"
          value={Math.round(totalScore)}
          subtitle="Based on player averages"
          icon={Target}
        />
        <StatCard
          title="Team Value"
          value={`$${(totalSalary / 1000).toFixed(0)}K`}
          subtitle={`Cap: $${((settings?.salaryCap || 10000000) / 1000000).toFixed(1)}M`}
          icon={DollarSign}
          accent
        />
        <StatCard
          title="Squad Size"
          value={teamPlayers?.length || 0}
          subtitle={`${onFieldPlayers.length} on field`}
          icon={Users}
        />
        <StatCard
          title="Trades Left"
          value={settings?.tradesRemaining || 0}
          subtitle={`${settings?.totalTradesUsed || 0} used this season`}
          icon={ArrowLeftRight}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              Top Performers
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {onFieldPlayers
              .sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0))
              .slice(0, 5)
              .map((player, i) => (
                <div
                  key={player.id}
                  className="flex items-center justify-between py-2.5 px-3 rounded-md hover-elevate"
                  data-testid={`card-top-performer-${player.id}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-muted-foreground w-5">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium">{player.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {player.team} - {player.position}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <FormTrendIcon trend={player.formTrend} />
                    <Badge variant="secondary" className="font-mono text-xs">
                      {player.avgScore?.toFixed(1)}
                    </Badge>
                  </div>
                </div>
              ))}
            {onFieldPlayers.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                Add players to your team to see top performers
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4 text-accent" />
              Suggested Trades
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {(trades || []).slice(0, 4).map((trade) => (
              <div
                key={trade.id}
                className="py-3 px-3 rounded-md hover-elevate"
                data-testid={`card-trade-suggestion-${trade.id}`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-destructive font-medium">
                      {trade.playerOut.name}
                    </span>
                    <ArrowLeftRight className="w-3 h-3 text-muted-foreground" />
                    <span className="text-green-600 dark:text-green-400 font-medium">
                      {trade.playerIn.name}
                    </span>
                  </div>
                  <Badge
                    variant={trade.confidence > 0.7 ? "default" : "secondary"}
                    className="text-[10px]"
                  >
                    {Math.round(trade.confidence * 100)}%
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {trade.reason}
                </p>
              </div>
            ))}
            {(!trades || trades.length === 0) && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                Generate trade recommendations from the Trade Centre
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {(captain || viceCaptain) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Crown className="w-4 h-4 text-accent" />
              Captain Loophole Strategy
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {viceCaptain && (
                <div className="flex items-center gap-4 p-3 rounded-md bg-muted/50" data-testid="card-vc-pick">
                  <div className="w-10 h-10 rounded-md bg-primary/15 flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-primary">VC</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{viceCaptain.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {viceCaptain.team} vs {viceCaptain.nextOpponent}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{viceCaptain.gameTime || 'TBA'}</span>
                      {viceCaptain.dualPosition && (
                        <Badge variant="secondary" className="text-[9px]">
                          <Repeat2 className="w-2 h-2 mr-0.5" />
                          DPP
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold text-primary">
                      {((viceCaptain.projectedScore || viceCaptain.avgScore || 0) * 2).toFixed(0)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">If VC kept (2x)</p>
                  </div>
                </div>
              )}
              {captain && (
                <div className="flex items-center gap-4 p-3 rounded-md bg-muted/50" data-testid="card-captain-pick">
                  <div className="w-10 h-10 rounded-md bg-accent/15 flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-accent">C</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{captain.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {captain.team} vs {captain.nextOpponent}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{captain.gameTime || 'TBA'}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold text-accent">
                      {((captain.projectedScore || captain.avgScore || 0) * 2).toFixed(0)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Safety net (2x)</p>
                  </div>
                </div>
              )}
            </div>
            {viceCaptain && captain && (
              <div className="p-3 rounded-md bg-accent/5 border border-accent/10">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  <span className="font-semibold text-foreground">Loophole tip:</span> If {viceCaptain.name} (VC)
                  scores 110+ in their {viceCaptain.gameTime || 'early'} game, keep the doubled VC score.
                  If they underperform, switch captaincy to {captain.name} before their {captain.gameTime || 'later'} game for the safety net.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {lateChangeAlerts.length > 0 && (
        <Card className="border-destructive/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-4 h-4" />
              Late Change Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {lateChangeAlerts.map((player) => (
                <div key={player.id} className="flex items-center justify-between p-2.5 rounded-md bg-destructive/5" data-testid={`alert-late-change-${player.id}`}>
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{player.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {player.injuryStatus ? `Injury: ${player.injuryStatus}` : 'Late team change'}
                        {player.lateChange ? ' - LATE OUT RISK' : ''}
                      </p>
                    </div>
                  </div>
                  <Badge variant="destructive" className="text-[10px]">
                    {player.isOnField ? 'On Field' : 'Bench'} - Monitor
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
