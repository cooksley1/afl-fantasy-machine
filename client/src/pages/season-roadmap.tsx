import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ChevronDown, ChevronRight, ArrowRightLeft, Crown, Shield, TrendingUp, AlertTriangle, Target, Sparkles, BarChart3, DollarSign, Users, Calendar, Map } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface WeeklyPlan {
  round: number;
  phase: string;
  phaseName: string;
  projectedTeamScore: number;
  recommendedCaptain: { name: string; team: string; avgScore: number; reasoning: string } | null;
  recommendedViceCaptain: { name: string; team: string; avgScore: number; reasoning: string } | null;
  trades: Array<{
    playerOut: { name: string; team: string; position: string; avgScore: number; price: number };
    playerIn: { name: string; team: string; position: string; avgScore: number; price: number };
    reasoning: string;
    pointsGain: number;
    cashImpact: number;
  }>;
  structureNotes: string[];
  keyMetrics: {
    teamValue: number;
    cashInBank: number;
    byeCoverage: { r12: number; r13: number; r14: number };
    premiumCount: number;
    rookieCount: number;
  };
  flags: string[];
}

interface SeasonPlanData {
  id: number;
  overallStrategy: string;
  weeklyPlans: WeeklyPlan[];
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

function RoundCard({ plan, isCurrentRound, defaultOpen }: { plan: WeeklyPlan; isCurrentRound: boolean; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

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
        <div className="flex items-center gap-2 flex-1 min-w-0">
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
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold" data-testid={`text-projected-score-${plan.round}`}>
            {plan.projectedTeamScore.toLocaleString()} pts
          </p>
          <p className="text-[10px] text-muted-foreground">projected</p>
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
                    : "bg-muted text-muted-foreground"
                  }`}
                  data-testid={`flag-${plan.round}-${i}`}
                >
                  {flag.includes("WARNING") ? <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> :
                   flag.includes("LOOPHOLE") ? <Target className="w-3.5 h-3.5 shrink-0" /> :
                   <Calendar className="w-3.5 h-3.5 shrink-0" />}
                  {flag}
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {plan.recommendedCaptain && (
              <div className="rounded-md border p-3 space-y-1" data-testid={`captain-pick-${plan.round}`}>
                <div className="flex items-center gap-2">
                  <Crown className="w-4 h-4 text-amber-500" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Captain</span>
                </div>
                <p className="font-semibold text-sm" data-testid={`text-captain-name-${plan.round}`}>
                  {plan.recommendedCaptain.name}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {plan.recommendedCaptain.team} — avg {plan.recommendedCaptain.avgScore}
                </p>
                <p className="text-[11px] text-muted-foreground italic">{plan.recommendedCaptain.reasoning}</p>
              </div>
            )}
            {plan.recommendedViceCaptain && (
              <div className="rounded-md border p-3 space-y-1" data-testid={`vc-pick-${plan.round}`}>
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-blue-500" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vice-Captain</span>
                </div>
                <p className="font-semibold text-sm" data-testid={`text-vc-name-${plan.round}`}>
                  {plan.recommendedViceCaptain.name}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {plan.recommendedViceCaptain.team} — avg {plan.recommendedViceCaptain.avgScore}
                </p>
                <p className="text-[11px] text-muted-foreground italic">{plan.recommendedViceCaptain.reasoning}</p>
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
                      <span className="text-[10px] text-muted-foreground">({trade.playerOut.position}, avg {trade.playerOut.avgScore})</span>
                    </div>
                    <ArrowRightLeft className="w-3 h-3 text-muted-foreground shrink-0" />
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]">IN</Badge>
                      <span className="text-sm font-medium">{trade.playerIn.name}</span>
                      <span className="text-[10px] text-muted-foreground">({trade.playerIn.position}, avg {trade.playerIn.avgScore})</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-[11px]">
                    <span className={trade.pointsGain >= 0 ? "text-emerald-600" : "text-red-600"}>
                      {trade.pointsGain >= 0 ? "+" : ""}{trade.pointsGain.toFixed(1)} pts/wk
                    </span>
                    <span className={trade.cashImpact >= 0 ? "text-emerald-600" : "text-red-600"}>
                      {trade.cashImpact >= 0 ? "+" : ""}${(trade.cashImpact / 1000).toFixed(0)}k cash
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground italic">{trade.reasoning}</p>
                </div>
              ))}
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

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
            <div className="rounded-md bg-muted/50 p-2 text-center" data-testid={`metric-value-${plan.round}`}>
              <DollarSign className="w-3.5 h-3.5 mx-auto text-muted-foreground mb-0.5" />
              <p className="text-xs font-semibold">${(plan.keyMetrics.teamValue / 1000000).toFixed(2)}M</p>
              <p className="text-[10px] text-muted-foreground">Team Value</p>
            </div>
            <div className="rounded-md bg-muted/50 p-2 text-center" data-testid={`metric-cash-${plan.round}`}>
              <BarChart3 className="w-3.5 h-3.5 mx-auto text-muted-foreground mb-0.5" />
              <p className="text-xs font-semibold">${(plan.keyMetrics.cashInBank / 1000).toFixed(0)}k</p>
              <p className="text-[10px] text-muted-foreground">Cash</p>
            </div>
            <div className="rounded-md bg-muted/50 p-2 text-center" data-testid={`metric-premiums-${plan.round}`}>
              <Users className="w-3.5 h-3.5 mx-auto text-muted-foreground mb-0.5" />
              <p className="text-xs font-semibold">{plan.keyMetrics.premiumCount}</p>
              <p className="text-[10px] text-muted-foreground">Premiums</p>
            </div>
            <div className="rounded-md bg-muted/50 p-2 text-center" data-testid={`metric-rookies-${plan.round}`}>
              <Sparkles className="w-3.5 h-3.5 mx-auto text-muted-foreground mb-0.5" />
              <p className="text-xs font-semibold">{plan.keyMetrics.rookieCount}</p>
              <p className="text-[10px] text-muted-foreground">Rookies</p>
            </div>
          </div>
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
            Generate a data-backed strategy for every round of the season. 
            Your roadmap will include optimal captain picks, planned trades, and phase-specific tactics — all aimed at getting you to first place.
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
                Generating your plan...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Generate Season Plan
              </>
            )}
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Uses your current team to build a full 24-round strategy
          </p>
        </div>
      </div>
    );
  }

  const weeklyPlans: WeeklyPlan[] = typeof plan.weeklyPlans === "string"
    ? JSON.parse(plan.weeklyPlans)
    : plan.weeklyPlans;

  const phases = [
    { key: "launch", name: "Team Launch", rounds: "R0-R5", color: "bg-blue-500" },
    { key: "cash_gen", name: "Cash Generation", rounds: "R6-R10", color: "bg-emerald-500" },
    { key: "bye_warfare", name: "Bye Warfare", rounds: "R11-R15", color: "bg-amber-500" },
    { key: "run_home", name: "Run Home", rounds: "R16-R24", color: "bg-purple-500" },
  ];

  const totalTrades = weeklyPlans.reduce((sum, wp) => sum + wp.trades.length, 0);

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-roadmap-title">
            Season Roadmap
          </h1>
          <p className="text-sm text-muted-foreground">Your data-driven path to first place</p>
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
            <div className="rounded-md border p-3 text-center" data-testid="stat-rounds-covered">
              <p className="text-lg font-bold">{weeklyPlans.length}</p>
              <p className="text-[10px] text-muted-foreground">Rounds Planned</p>
            </div>
            <div className="rounded-md border p-3 text-center" data-testid="stat-total-trades">
              <p className="text-lg font-bold">{totalTrades}</p>
              <p className="text-[10px] text-muted-foreground">Planned Trades</p>
            </div>
            <div className="rounded-md border p-3 text-center" data-testid="stat-avg-score">
              <p className="text-lg font-bold">
                {weeklyPlans.length > 0 ? Math.round(weeklyPlans.reduce((s, w) => s + w.projectedTeamScore, 0) / weeklyPlans.length).toLocaleString() : 0}
              </p>
              <p className="text-[10px] text-muted-foreground">Avg/Round</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {phases.map(phase => (
              <div key={phase.key} className="flex items-center gap-1.5" data-testid={`phase-indicator-${phase.key}`}>
                <div className={`w-2.5 h-2.5 rounded-full ${phase.color}`} />
                <span className="text-[10px] text-muted-foreground">{phase.name} ({phase.rounds})</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2" data-testid="weekly-plans-list">
        {weeklyPlans.map((wp) => (
          <RoundCard
            key={wp.round}
            plan={wp}
            isCurrentRound={wp.round === plan.currentRound}
            defaultOpen={wp.round === plan.currentRound}
          />
        ))}
      </div>
    </div>
  );
}
