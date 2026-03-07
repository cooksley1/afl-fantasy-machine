import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ChevronDown, ChevronRight, ArrowRightLeft, Crown, Shield, TrendingUp, AlertTriangle, Target, Sparkles, BarChart3, DollarSign, Users, Calendar, Map, Check, ChevronUp } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface SquadPlayer {
  id: number;
  name: string;
  team: string;
  position: string;
  fieldPosition: string;
  isOnField: boolean;
  avgScore: number;
  price: number;
  breakEven: number | null;
  byeRound: number | null;
  ppm: number | null;
  role: string;
}

interface WeeklyPlan {
  round: number;
  phase: string;
  phaseName: string;
  projectedTeamScore: number;
  recommendedCaptain: { id: number; name: string; team: string; avgScore: number; reasoning: string } | null;
  recommendedViceCaptain: { id: number; name: string; team: string; avgScore: number; reasoning: string } | null;
  trades: Array<{
    playerOut: { id: number; name: string; team: string; position: string; avgScore: number; price: number; breakEven: number | null };
    playerIn: { id: number; name: string; team: string; position: string; avgScore: number; price: number; breakEven: number | null; ppm: number | null; owned: number };
    reasoning: string;
    pointsGain: number;
    cashImpact: number;
  }>;
  structureNotes: string[];
  squad: SquadPlayer[];
  keyMetrics: {
    teamValue: number;
    cashInBank: number;
    byeCoverage: { r12: number; r13: number; r14: number };
    premiumCount: number;
    rookieCount: number;
    projectedRank: string;
  };
  flags: string[];
}

interface SeasonPlanData {
  id: number;
  overallStrategy: string;
  weeklyPlans: WeeklyPlan[];
  teamSnapshot: { startingSquad?: SquadPlayer[] };
  totalProjectedScore: number;
  currentRound: number;
}

const phaseColors: Record<string, string> = {
  launch: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  cash_gen: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  bye_warfare: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  run_home: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
};

const phaseBgColors: Record<string, string> = {
  launch: "border-l-blue-500",
  cash_gen: "border-l-emerald-500",
  bye_warfare: "border-l-amber-500",
  run_home: "border-l-purple-500",
};

const roleColors: Record<string, string> = {
  Premium: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
  "Mid-Pricer": "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  "Cash Cow": "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  Rookie: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  Value: "bg-muted text-muted-foreground",
};

function SquadRoster({ squad, title }: { squad: SquadPlayer[]; title: string }) {
  const [showRoster, setShowRoster] = useState(false);

  const posOrder = ["DEF", "MID", "RUC", "FWD", "UTIL"];
  const grouped: Record<string, SquadPlayer[]> = {};
  for (const p of squad) {
    const pos = p.fieldPosition || p.position.split("/")[0];
    if (!grouped[pos]) grouped[pos] = [];
    grouped[pos].push(p);
  }

  return (
    <div className="space-y-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowRoster(!showRoster)}
        className="gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        data-testid="button-toggle-roster"
      >
        <Users className="w-3.5 h-3.5" />
        {title} ({squad.length} players)
        {showRoster ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </Button>
      {showRoster && (
        <div className="space-y-3">
          {posOrder.filter(pos => grouped[pos]?.length > 0).map(pos => (
            <div key={pos} className="space-y-1" data-testid={`roster-position-${pos}`}>
              <p className="text-[10px] font-bold text-muted-foreground/60 uppercase">{pos}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {(grouped[pos] || []).sort((a, b) => b.avgScore - a.avgScore).map(p => (
                  <div
                    key={p.id}
                    className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs ${p.isOnField ? "bg-muted/30" : "bg-muted/10 opacity-70"}`}
                    data-testid={`roster-player-${p.id}`}
                  >
                    <span className="font-medium flex-1 truncate">{p.name}</span>
                    <span className="text-muted-foreground text-[10px] shrink-0">{p.team}</span>
                    <span className="font-semibold shrink-0">{p.avgScore}</span>
                    <Badge variant="outline" className={`text-[8px] px-1 py-0 ${roleColors[p.role] || ""}`}>
                      {p.role}
                    </Badge>
                    <span className="text-muted-foreground text-[10px] shrink-0">${(p.price / 1000).toFixed(0)}k</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RoundCard({ plan, isCurrentRound, defaultOpen, myTeam }: { plan: WeeklyPlan; isCurrentRound: boolean; defaultOpen: boolean; myTeam: any[] | undefined }) {
  const [open, setOpen] = useState(defaultOpen);
  const { toast } = useToast();

  const findMyTeamPlayerId = (playerId: number): number | null => {
    if (!myTeam) return null;
    const entry = myTeam.find((p: any) => p.id === playerId);
    return entry?.myTeamPlayerId || null;
  };

  const setCaptainMutation = useMutation({
    mutationFn: async (playerId: number) => {
      const mtpId = findMyTeamPlayerId(playerId);
      if (!mtpId) throw new Error("Player not on your current team yet");
      return apiRequest("POST", `/api/my-team/${mtpId}/captain`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-team"] });
      toast({ title: "Captain set" });
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const setVCMutation = useMutation({
    mutationFn: async (playerId: number) => {
      const mtpId = findMyTeamPlayerId(playerId);
      if (!mtpId) throw new Error("Player not on your current team yet");
      return apiRequest("POST", `/api/my-team/${mtpId}/vice-captain`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-team"] });
      toast({ title: "Vice-Captain set" });
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const captainOnTeam = plan.recommendedCaptain ? !!findMyTeamPlayerId(plan.recommendedCaptain.id) : false;
  const vcOnTeam = plan.recommendedViceCaptain ? !!findMyTeamPlayerId(plan.recommendedViceCaptain.id) : false;

  return (
    <Card
      className={`border-l-4 ${phaseBgColors[plan.phase] || "border-l-muted"} ${isCurrentRound ? "ring-2 ring-primary/30" : ""}`}
      data-testid={`card-round-${plan.round}`}
    >
      <div
        className="flex items-center gap-3 p-4 cursor-pointer select-none"
        onClick={() => setOpen(!open)}
        data-testid={`button-toggle-round-${plan.round}`}
      >
        {open ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
        <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
          <span className="font-bold text-sm" data-testid={`text-round-number-${plan.round}`}>
            R{plan.round}
          </span>
          <Badge variant="outline" className={`text-[10px] ${phaseColors[plan.phase] || ""}`} data-testid={`badge-phase-${plan.round}`}>
            {plan.phaseName}
          </Badge>
          {isCurrentRound && (
            <Badge className="bg-primary text-primary-foreground text-[10px]" data-testid="badge-current-round">
              Current
            </Badge>
          )}
          {plan.flags.some(f => f.includes("BYE")) && (
            <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px]" data-testid={`badge-bye-${plan.round}`}>
              BYE
            </Badge>
          )}
          {plan.flags.some(f => f.includes("LOOPHOLE")) && (
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]">
              Loophole
            </Badge>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold" data-testid={`text-projected-score-${plan.round}`}>
            {plan.projectedTeamScore.toLocaleString()} pts
          </p>
          <p className="text-[10px] text-muted-foreground">{plan.keyMetrics.projectedRank}</p>
        </div>
      </div>

      {open && (
        <CardContent className="pt-0 pb-4 space-y-4" data-testid={`content-round-${plan.round}`}>
          {plan.flags.length > 0 && (
            <div className="space-y-1.5">
              {plan.flags.map((flag, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-md ${
                    flag.includes("WARNING") ? "bg-red-500/10 text-red-600 dark:text-red-400"
                    : flag.includes("LOOPHOLE") ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : flag.includes("BYE") ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    : "bg-muted text-muted-foreground"
                  }`}
                  data-testid={`flag-${plan.round}-${i}`}
                >
                  {flag.includes("WARNING") ? <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> :
                   flag.includes("LOOPHOLE") ? <Target className="w-3.5 h-3.5 shrink-0" /> :
                   <Calendar className="w-3.5 h-3.5 shrink-0" />}
                  <span className="flex-1">{flag}</span>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {plan.recommendedCaptain && (
              <div className="rounded-md border p-3 space-y-2" data-testid={`captain-pick-${plan.round}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Crown className="w-4 h-4 text-amber-500" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Captain</span>
                  </div>
                  {isCurrentRound && captainOnTeam && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => { e.stopPropagation(); setCaptainMutation.mutate(plan.recommendedCaptain!.id); }}
                      disabled={setCaptainMutation.isPending}
                      data-testid={`button-set-captain-${plan.round}`}
                    >
                      {setCaptainMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Check className="w-3 h-3 mr-1" />Apply</>}
                    </Button>
                  )}
                </div>
                <p className="font-semibold text-sm" data-testid={`text-captain-name-${plan.round}`}>
                  {plan.recommendedCaptain.name}
                </p>
                <p className="text-[11px] text-muted-foreground">{plan.recommendedCaptain.reasoning}</p>
              </div>
            )}
            {plan.recommendedViceCaptain && (
              <div className="rounded-md border p-3 space-y-2" data-testid={`vc-pick-${plan.round}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-blue-500" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vice-Captain</span>
                  </div>
                  {isCurrentRound && vcOnTeam && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => { e.stopPropagation(); setVCMutation.mutate(plan.recommendedViceCaptain!.id); }}
                      disabled={setVCMutation.isPending}
                      data-testid={`button-set-vc-${plan.round}`}
                    >
                      {setVCMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Check className="w-3 h-3 mr-1" />Apply</>}
                    </Button>
                  )}
                </div>
                <p className="font-semibold text-sm" data-testid={`text-vc-name-${plan.round}`}>
                  {plan.recommendedViceCaptain.name}
                </p>
                <p className="text-[11px] text-muted-foreground">{plan.recommendedViceCaptain.reasoning}</p>
              </div>
            )}
          </div>

          {plan.trades.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Planned Trades ({plan.trades.length})
                </span>
              </div>
              {plan.trades.map((trade, i) => (
                <div
                  key={i}
                  className="rounded-md border p-3 space-y-2"
                  data-testid={`trade-${plan.round}-${i}`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/20 text-[10px]">OUT</Badge>
                      <span className="text-sm font-medium">{trade.playerOut.name}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {trade.playerOut.team} · {trade.playerOut.position} · avg {trade.playerOut.avgScore} · ${(trade.playerOut.price / 1000).toFixed(0)}k
                        {trade.playerOut.breakEven != null ? ` · BE ${trade.playerOut.breakEven}` : ""}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]">IN</Badge>
                      <span className="text-sm font-medium">{trade.playerIn.name}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {trade.playerIn.team} · {trade.playerIn.position} · avg {trade.playerIn.avgScore} · ${(trade.playerIn.price / 1000).toFixed(0)}k
                        {trade.playerIn.ppm != null ? ` · ${trade.playerIn.ppm} PPM` : ""}
                        {trade.playerIn.owned < 15 ? ` · ${trade.playerIn.owned}% owned (POD)` : ""}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-[11px]">
                    <span className={`font-semibold ${trade.pointsGain >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {trade.pointsGain >= 0 ? "+" : ""}{trade.pointsGain.toFixed(1)} pts/wk
                    </span>
                    <span className={trade.cashImpact >= 0 ? "text-emerald-600" : "text-red-600"}>
                      {trade.cashImpact >= 0 ? "+" : ""}${(trade.cashImpact / 1000).toFixed(0)}k cash
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{trade.reasoning}</p>
                </div>
              ))}
            </div>
          )}

          {plan.trades.length === 0 && plan.round >= 2 && (
            <div className="text-xs text-muted-foreground italic px-1">
              No trades recommended this round — current squad is optimal for this phase.
            </div>
          )}

          {plan.structureNotes.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Strategy Notes</span>
              {plan.structureNotes.map((note, i) => (
                <p key={i} className="text-[11px] text-muted-foreground flex items-start gap-1.5" data-testid={`note-${plan.round}-${i}`}>
                  <TrendingUp className="w-3 h-3 shrink-0 mt-0.5" />
                  {note}
                </p>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
            <div className="rounded-md bg-muted/50 p-2 text-center" data-testid={`metric-value-${plan.round}`}>
              <p className="text-xs font-semibold">${(plan.keyMetrics.teamValue / 1000000).toFixed(2)}M</p>
              <p className="text-[10px] text-muted-foreground">Team Value</p>
            </div>
            <div className="rounded-md bg-muted/50 p-2 text-center" data-testid={`metric-cash-${plan.round}`}>
              <p className="text-xs font-semibold">${(plan.keyMetrics.cashInBank / 1000).toFixed(0)}k</p>
              <p className="text-[10px] text-muted-foreground">Cash</p>
            </div>
            <div className="rounded-md bg-muted/50 p-2 text-center" data-testid={`metric-premiums-${plan.round}`}>
              <p className="text-xs font-semibold">{plan.keyMetrics.premiumCount}</p>
              <p className="text-[10px] text-muted-foreground">Premiums</p>
            </div>
            <div className="rounded-md bg-muted/50 p-2 text-center" data-testid={`metric-rookies-${plan.round}`}>
              <p className="text-xs font-semibold">{plan.keyMetrics.rookieCount}</p>
              <p className="text-[10px] text-muted-foreground">Rookies</p>
            </div>
            <div className="rounded-md bg-muted/50 p-2 text-center" data-testid={`metric-bye-${plan.round}`}>
              <p className="text-xs font-semibold">{plan.keyMetrics.byeCoverage.r12}/{plan.keyMetrics.byeCoverage.r13}/{plan.keyMetrics.byeCoverage.r14}</p>
              <p className="text-[10px] text-muted-foreground">Bye R12/13/14</p>
            </div>
          </div>

          {plan.squad && plan.squad.length > 0 && (
            <SquadRoster squad={plan.squad} title={`Squad after R${plan.round}`} />
          )}
        </CardContent>
      )}
    </Card>
  );
}

export default function SeasonRoadmap() {
  const { toast } = useToast();

  const { data: plan, isLoading } = useQuery<SeasonPlanData>({
    queryKey: ["/api/season-plan"],
  });

  const { data: myTeam } = useQuery<any[]>({
    queryKey: ["/api/my-team"],
  });

  const generateMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/season-plan/generate"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/season-plan"] });
      toast({ title: "Season plan generated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" data-testid="loader-roadmap" />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
        <div className="text-center space-y-3 py-12">
          <Map className="w-12 h-12 mx-auto text-muted-foreground/40" />
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-roadmap-title">Season Roadmap</h1>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Generate a data-backed strategy for every round of the season — specific players, specific trades, specific captain picks. One click and it's done.
          </p>
          <Button
            size="lg"
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            data-testid="button-generate-plan"
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analysing your team...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Generate Season Plan
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  const weeklyPlans: WeeklyPlan[] = typeof plan.weeklyPlans === "string"
    ? JSON.parse(plan.weeklyPlans)
    : plan.weeklyPlans;

  const startingSquad: SquadPlayer[] = plan.teamSnapshot?.startingSquad || [];

  const phases = [
    { key: "launch", name: "Team Launch", rounds: "R0-R5", color: "bg-blue-500" },
    { key: "cash_gen", name: "Cash Generation", rounds: "R6-R10", color: "bg-emerald-500" },
    { key: "bye_warfare", name: "Bye Warfare", rounds: "R11-R15", color: "bg-amber-500" },
    { key: "run_home", name: "Run Home", rounds: "R16-R24", color: "bg-purple-500" },
  ];

  const totalTrades = weeklyPlans.reduce((sum, wp) => sum + wp.trades.length, 0);
  const avgScore = weeklyPlans.length > 0 ? Math.round(weeklyPlans.reduce((s, w) => s + w.projectedTeamScore, 0) / weeklyPlans.length) : 0;

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-roadmap-title">
            Season Roadmap
          </h1>
          <p className="text-sm text-muted-foreground">Your data-driven path to #1</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          data-testid="button-regenerate-plan"
        >
          {generateMutation.isPending ? (
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          ) : (
            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
          )}
          Regenerate
        </Button>
      </div>

      <Card data-testid="card-strategy-overview">
        <CardContent className="pt-5 pb-5 space-y-4">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-sm">Overall Strategy</h2>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-overall-strategy">
            {plan.overallStrategy}
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-md border p-3 text-center" data-testid="stat-total-projected">
              <p className="text-lg font-bold text-primary">{(plan.totalProjectedScore || 0).toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground">Projected Total</p>
            </div>
            <div className="rounded-md border p-3 text-center" data-testid="stat-avg-score">
              <p className="text-lg font-bold">{avgScore.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground">Avg/Round</p>
            </div>
            <div className="rounded-md border p-3 text-center" data-testid="stat-total-trades">
              <p className="text-lg font-bold">{totalTrades}</p>
              <p className="text-[10px] text-muted-foreground">Planned Trades</p>
            </div>
            <div className="rounded-md border p-3 text-center" data-testid="stat-rounds-covered">
              <p className="text-lg font-bold">{weeklyPlans.length}</p>
              <p className="text-[10px] text-muted-foreground">Rounds Planned</p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {phases.map(phase => (
              <div key={phase.key} className="flex items-center gap-1.5" data-testid={`phase-indicator-${phase.key}`}>
                <div className={`w-2.5 h-2.5 rounded-full ${phase.color}`} />
                <span className="text-[10px] text-muted-foreground">{phase.name} ({phase.rounds})</span>
              </div>
            ))}
          </div>

          {startingSquad.length > 0 && (
            <SquadRoster squad={startingSquad} title="Starting Squad" />
          )}
        </CardContent>
      </Card>

      <div className="space-y-2" data-testid="weekly-plans-list">
        {weeklyPlans.map((wp) => (
          <RoundCard
            key={wp.round}
            plan={wp}
            isCurrentRound={wp.round === plan.currentRound}
            defaultOpen={wp.round === plan.currentRound}
            myTeam={myTeam}
          />
        ))}
      </div>
    </div>
  );
}
