import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Crown,
  Shield,
  UserMinus,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Brain,
  ChevronRight,
  Zap,
  Target,
  Star,
  Loader2,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import type { PlayerWithTeamInfo, LeagueSettings } from "@shared/schema";

interface PlayerAdvice {
  name: string;
  playerId: number;
  action: string;
  captaincy: string;
  reasoning: string;
  formAnalysis: string;
  priceOutlook: string;
  riskLevel: string;
  priority: number;
}

interface TeamAnalysisResult {
  overallRating: number;
  summary: string;
  strengthAreas: string[];
  weaknessAreas: string[];
  playerAdvice: PlayerAdvice[];
  urgentActions: string[];
  byeRiskSummary: string;
  captainStrategy: string;
}

function FormBadge({ trend }: { trend: string }) {
  if (trend === "up")
    return (
      <Badge variant="default" className="bg-green-600 dark:bg-green-700 text-white text-[10px]">
        <TrendingUp className="w-3 h-3 mr-1" /> Hot
      </Badge>
    );
  if (trend === "down")
    return (
      <Badge variant="destructive" className="text-[10px]">
        <TrendingDown className="w-3 h-3 mr-1" /> Cold
      </Badge>
    );
  return (
    <Badge variant="secondary" className="text-[10px]">
      <Minus className="w-3 h-3 mr-1" /> Steady
    </Badge>
  );
}

function ActionBadge({ action }: { action: string }) {
  const config: Record<string, { label: string; className: string }> = {
    must_have: { label: "Must Have", className: "bg-green-600 text-white" },
    keep: { label: "Keep", className: "bg-blue-600 text-white" },
    monitor: { label: "Monitor", className: "bg-yellow-600 text-white" },
    trade: { label: "Trade", className: "bg-orange-600 text-white" },
    sell: { label: "Sell", className: "bg-red-600 text-white" },
    buy: { label: "Buy", className: "bg-emerald-600 text-white" },
  };
  const c = config[action] || config.monitor;
  return <Badge className={`${c.className} text-[10px]`}>{c.label}</Badge>;
}

function CaptaincyBadge({ captaincy }: { captaincy: string }) {
  if (captaincy === "captain") return <Badge className="bg-amber-500 text-white text-[10px]"><Crown className="w-3 h-3 mr-0.5" /> Capt</Badge>;
  if (captaincy === "vice_captain") return <Badge className="bg-purple-500 text-white text-[10px]"><Shield className="w-3 h-3 mr-0.5" /> VC</Badge>;
  if (captaincy === "loophole_vc") return <Badge className="bg-indigo-500 text-white text-[10px]"><Target className="w-3 h-3 mr-0.5" /> Loop VC</Badge>;
  return null;
}

function PlayerRow({
  player,
  advice,
  onRemove,
  onSetCaptain,
  onSetViceCaptain,
  onViewReport,
}: {
  player: PlayerWithTeamInfo;
  advice?: PlayerAdvice;
  onRemove: (id: number) => void;
  onSetCaptain: (id: number) => void;
  onSetViceCaptain: (id: number) => void;
  onViewReport: (id: number) => void;
}) {
  return (
    <div
      className="py-3 px-3 sm:px-4 rounded-md hover-elevate group cursor-pointer"
      data-testid={`card-team-player-${player.id}`}
      role="button"
      tabIndex={0}
      onClick={() => onViewReport(player.id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onViewReport(player.id); } }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-primary uppercase">
              {player.position.slice(0, 3)}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-sm font-semibold truncate">{player.name}</p>
              {player.isCaptain && (
                <Badge variant="default" className="bg-accent text-accent-foreground text-[10px]">
                  <Crown className="w-3 h-3 mr-0.5" /> C
                </Badge>
              )}
              {player.isViceCaptain && (
                <Badge variant="secondary" className="text-[10px]">
                  <Shield className="w-3 h-3 mr-0.5" /> VC
                </Badge>
              )}
              {player.injuryStatus && (
                <Badge variant="destructive" className="text-[10px]">
                  <AlertTriangle className="w-3 h-3 mr-0.5" /> {player.injuryStatus}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <p className="text-xs text-muted-foreground">
                {player.team} | ${(player.price / 1000).toFixed(0)}K
              </p>
              {advice && (
                <>
                  <ActionBadge action={advice.action} />
                  <CaptaincyBadge captaincy={advice.captaincy} />
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-3">
          <div className="flex items-center gap-2 sm:gap-3 text-right">
            <div>
              <p className="text-xs sm:text-sm font-mono font-medium">{player.avgScore?.toFixed(1)}</p>
              <p className="text-[10px] text-muted-foreground">Avg</p>
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-mono font-medium">{player.last3Avg?.toFixed(1)}</p>
              <p className="text-[10px] text-muted-foreground">L3</p>
            </div>
            <div className="hidden sm:block">
              <FormBadge trend={player.formTrend} />
            </div>
          </div>

          <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onSetCaptain(player.myTeamPlayerId!)}
              className={player.isCaptain ? "text-accent" : ""}
              data-testid={`button-captain-${player.id}`}
            >
              <Crown className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onSetViceCaptain(player.myTeamPlayerId!)}
              className={player.isViceCaptain ? "text-primary" : ""}
              data-testid={`button-vc-${player.id}`}
            >
              <Shield className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onRemove(player.myTeamPlayerId!)}
              data-testid={`button-remove-${player.id}`}
            >
              <UserMinus className="w-4 h-4" />
            </Button>
          </div>

          <ChevronRight className="w-4 h-4 text-muted-foreground hidden sm:block" />
        </div>
      </div>

      {advice && (
        <div className="mt-2 ml-[52px] text-xs text-muted-foreground line-clamp-2" data-testid={`text-advice-${player.id}`}>
          {advice.reasoning}
        </div>
      )}
    </div>
  );
}

function AnalysisPanel({ analysis }: { analysis: TeamAnalysisResult }) {
  return (
    <div className="space-y-4" data-testid="panel-analysis">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Star className="w-5 h-5 text-yellow-500" />
              <span className="font-semibold">Team Rating</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-2xl font-bold">{analysis.overallRating}</span>
              <span className="text-sm text-muted-foreground">/10</span>
            </div>
          </div>
          <p className="text-sm" data-testid="text-analysis-summary">{analysis.summary}</p>
        </CardContent>
      </Card>

      {analysis.urgentActions.length > 0 && (
        <Card className="border-destructive/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-destructive">
              <Zap className="w-4 h-4" />
              Urgent Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {analysis.urgentActions.map((action, i) => (
              <div key={i} className="flex items-start gap-2 text-sm" data-testid={`urgent-action-${i}`}>
                <span className="text-destructive font-bold shrink-0">{i + 1}.</span>
                <span>{action}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-500" />
              Strengths
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {analysis.strengthAreas.map((s, i) => (
                <li key={i} className="text-sm flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">+</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-red-500" />
              Weaknesses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {analysis.weaknessAreas.map((w, i) => (
                <li key={i} className="text-sm flex items-start gap-2">
                  <span className="text-red-500 mt-0.5">-</span>
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {analysis.captainStrategy && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Crown className="w-4 h-4 text-yellow-500" />
              Captain Strategy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm" data-testid="text-captain-strategy">{analysis.captainStrategy}</p>
          </CardContent>
        </Card>
      )}

      {analysis.byeRiskSummary && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-500" />
              Bye Round Risk
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm" data-testid="text-bye-risk">{analysis.byeRiskSummary}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function MyTeam() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [analysis, setAnalysis] = useState<TeamAnalysisResult | null>(null);

  const { data: teamPlayers, isLoading } = useQuery<PlayerWithTeamInfo[]>({
    queryKey: ["/api/my-team"],
  });

  const { data: settings } = useQuery<LeagueSettings>({
    queryKey: ["/api/settings"],
  });

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/my-team/analyze");
      return res.json();
    },
    onSuccess: (data: TeamAnalysisResult) => {
      setAnalysis(data);
      toast({ title: "Team analysis complete", description: `Rating: ${data.overallRating}/10` });
    },
    onError: (error: Error) => {
      toast({ title: "Analysis failed", description: error.message, variant: "destructive" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/my-team/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-team"] });
      setAnalysis(null);
      toast({ title: "Player removed from team" });
    },
  });

  const captainMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/my-team/${id}/captain`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-team"] });
      toast({ title: "Captain updated" });
    },
  });

  const viceCaptainMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/my-team/${id}/vice-captain`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-team"] });
      toast({ title: "Vice Captain updated" });
    },
  });

  const positions = ["DEF", "MID", "RUC", "FWD"];
  const getPlayersByPosition = (pos: string) =>
    (teamPlayers || []).filter((p) => p.fieldPosition === pos);
  const benchPlayers = (teamPlayers || []).filter((p) => !p.isOnField);

  const getAdviceForPlayer = (playerId: number): PlayerAdvice | undefined => {
    if (!analysis) return undefined;
    return analysis.playerAdvice.find(a => a.playerId === playerId);
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-12 w-full" />
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  const totalSalary = teamPlayers?.reduce((sum, p) => sum + p.price, 0) || 0;
  const salaryCap = settings?.salaryCap || 10000000;
  const remaining = salaryCap - totalSalary;

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-5xl mx-auto" data-testid="page-my-team">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">My Team</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {teamPlayers?.length || 0} players selected
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="text-xs sm:text-sm py-1 px-2 sm:px-3">
            ${(totalSalary / 1000).toFixed(0)}K / ${(salaryCap / 1000000).toFixed(1)}M
          </Badge>
          <Badge
            variant={remaining >= 0 ? "default" : "destructive"}
            className="text-xs sm:text-sm py-1 px-2 sm:px-3"
          >
            ${(remaining / 1000).toFixed(0)}K left
          </Badge>
          <Button
            onClick={() => analyzeMutation.mutate()}
            disabled={analyzeMutation.isPending || !teamPlayers?.length}
            size="sm"
            className="gap-1.5"
            data-testid="button-analyze-team"
          >
            {analyzeMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Brain className="w-4 h-4" />
            )}
            {analyzeMutation.isPending ? "Analysing..." : "Analyse Team"}
          </Button>
        </div>
      </div>

      {analysis && <AnalysisPanel analysis={analysis} />}

      {analyzeMutation.isPending && (
        <Card>
          <CardContent className="p-6 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary mb-3" />
            <p className="font-semibold">AI is analysing your team</p>
            <p className="text-sm text-muted-foreground mt-1">Evaluating every player's form, fixtures, price trajectory, and strategic value...</p>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="DEF">
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <TabsList className="inline-flex w-auto min-w-full sm:grid sm:grid-cols-5 sm:w-full">
            {positions.map((pos) => (
              <TabsTrigger key={pos} value={pos} className="min-w-[4.5rem] text-xs sm:text-sm" data-testid={`tab-${pos.toLowerCase()}`}>
                {pos} ({getPlayersByPosition(pos).length})
              </TabsTrigger>
            ))}
            <TabsTrigger value="BENCH" className="min-w-[4.5rem] text-xs sm:text-sm" data-testid="tab-bench">
              Bench ({benchPlayers.length})
            </TabsTrigger>
          </TabsList>
        </div>

        {positions.map((pos) => (
          <TabsContent key={pos} value={pos}>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  {pos === "DEF"
                    ? "Defenders"
                    : pos === "MID"
                    ? "Midfielders"
                    : pos === "RUC"
                    ? "Rucks"
                    : "Forwards"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 p-3">
                {getPlayersByPosition(pos).length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No {pos.toLowerCase()} players selected. Add players from the Players page.
                  </div>
                ) : (
                  getPlayersByPosition(pos).map((player) => (
                    <PlayerRow
                      key={player.myTeamPlayerId}
                      player={player}
                      advice={getAdviceForPlayer(player.id)}
                      onRemove={(id) => removeMutation.mutate(id)}
                      onSetCaptain={(id) => captainMutation.mutate(id)}
                      onSetViceCaptain={(id) => viceCaptainMutation.mutate(id)}
                      onViewReport={(id) => navigate(`/player/${id}`)}
                    />
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}

        <TabsContent value="BENCH">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Bench Players
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 p-3">
              {benchPlayers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No bench players
                </div>
              ) : (
                benchPlayers.map((player) => (
                  <PlayerRow
                    key={player.myTeamPlayerId}
                    player={player}
                    advice={getAdviceForPlayer(player.id)}
                    onRemove={(id) => removeMutation.mutate(id)}
                    onSetCaptain={(id) => captainMutation.mutate(id)}
                    onSetViceCaptain={(id) => viceCaptainMutation.mutate(id)}
                    onViewReport={(id) => navigate(`/player/${id}`)}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
