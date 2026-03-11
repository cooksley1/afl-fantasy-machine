import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Star,
  TrendingUp,
  ArrowRight,
  DollarSign,
  Target,
  Zap,
  ChevronDown,
  ChevronUp,
  Loader2,
  Sparkles,
  CheckCircle2,
  ArrowRightLeft,
  Crown,
  Trophy,
} from "lucide-react";
import { getTeamColors, getTeamAbbr } from "@/lib/afl-teams";

interface TradeStep {
  round: number;
  playerOut: { id: number; name: string; team: string; position: string; price: number; avgScore: number; weeklyGain: number; role: string };
  playerIn: { id: number; name: string; team: string; position: string; price: number; avgScore: number; role: string };
  cashRequired: number;
  projectedCashAvailable: number;
  reasoning: string;
}

interface DreamPlayer {
  id: number;
  name: string;
  team: string;
  position: string;
  price: number;
  avgScore: number;
  fieldPosition: string;
  isOnField: boolean;
  reasoning: string;
}

interface StartingPlayer extends DreamPlayer {
  isDreamPlayer: boolean;
}

interface DreamTeamData {
  dreamTeam: DreamPlayer[];
  dreamTeamCost: number;
  startingTeam: StartingPlayer[];
  startingTeamCost: number;
  tradePath: TradeStep[];
  estimatedCompletionRound: number;
  summary: string;
}

function PlayerRow({ player, showDreamBadge }: { player: DreamPlayer | StartingPlayer; showDreamBadge?: boolean }) {
  const colors = getTeamColors(player.team);
  const isDream = showDreamBadge && "isDreamPlayer" in player && player.isDreamPlayer;
  const isStepping = showDreamBadge && "isDreamPlayer" in player && !player.isDreamPlayer && player.isOnField;

  return (
    <div
      className={`flex items-center gap-2 p-2 rounded-md ${isDream ? "bg-green-500/5 border border-green-500/20" : isStepping ? "bg-amber-500/5 border border-amber-500/20" : "bg-muted/50"}`}
      data-testid={`player-row-${player.id}`}
    >
      <div
        className="w-7 h-7 rounded flex items-center justify-center text-[9px] font-bold shrink-0"
        style={{ backgroundColor: colors.primary, color: colors.text }}
      >
        {getTeamAbbr(player.team)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium truncate">{player.name}</span>
          {isDream && <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />}
          {isStepping && <TrendingUp className="w-3 h-3 text-amber-500 shrink-0" />}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>{player.fieldPosition}</span>
          <span>${(player.price / 1000).toFixed(0)}k</span>
          <span>avg {(player.avgScore || 0).toFixed(0)}</span>
        </div>
      </div>
      {!player.isOnField && (
        <Badge className="text-[8px] bg-muted text-muted-foreground shrink-0">Bench</Badge>
      )}
    </div>
  );
}

function PositionGroup({ position, players, showDreamBadge }: { position: string; players: (DreamPlayer | StartingPlayer)[]; showDreamBadge?: boolean }) {
  const onField = players.filter(p => p.isOnField);
  const bench = players.filter(p => !p.isOnField);

  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <Badge variant="outline" className="text-[10px] font-bold">{position}</Badge>
        <span className="text-[10px] text-muted-foreground">{onField.length} on field, {bench.length} bench</span>
      </div>
      <div className="space-y-1">
        {[...onField, ...bench].map(p => (
          <PlayerRow key={p.id} player={p} showDreamBadge={showDreamBadge} />
        ))}
      </div>
    </div>
  );
}

function TradePathTimeline({ tradePath }: { tradePath: TradeStep[] }) {
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  if (tradePath.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground">
        <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500" />
        <p className="text-sm font-medium">Your dream team fits within budget!</p>
        <p className="text-xs mt-1">No trades needed — you can start with your ideal squad.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="trade-path-timeline">
      {tradePath.map((step, i) => {
        const outColors = getTeamColors(step.playerOut.team);
        const inColors = getTeamColors(step.playerIn.team);
        const isExpanded = expandedStep === i;
        const pointsGain = step.playerIn.avgScore - step.playerOut.avgScore;

        return (
          <Card
            key={i}
            className="overflow-hidden cursor-pointer"
            onClick={() => setExpandedStep(isExpanded ? null : i)}
            data-testid={`trade-step-${i}`}
          >
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-[10px] font-bold shrink-0">
                    R{step.round}
                  </div>
                  <span className="text-xs font-medium">Trade {i + 1} of {tradePath.length}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge className="text-[9px] bg-green-500/10 text-green-600 dark:text-green-400">
                    +{pointsGain.toFixed(0)} pts
                  </Badge>
                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <div
                    className="w-6 h-6 rounded flex items-center justify-center text-[8px] font-bold shrink-0"
                    style={{ backgroundColor: outColors.primary, color: outColors.text }}
                  >
                    {getTeamAbbr(step.playerOut.team)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium truncate text-red-500">{step.playerOut.name}</p>
                    <p className="text-[9px] text-muted-foreground">avg {step.playerOut.avgScore.toFixed(0)}</p>
                  </div>
                </div>

                <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />

                <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
                  <div className="min-w-0 text-right">
                    <p className="text-[11px] font-medium truncate text-green-500">{step.playerIn.name}</p>
                    <p className="text-[9px] text-muted-foreground">avg {step.playerIn.avgScore.toFixed(0)}</p>
                  </div>
                  <div
                    className="w-6 h-6 rounded flex items-center justify-center text-[8px] font-bold shrink-0"
                    style={{ backgroundColor: inColors.primary, color: inColors.text }}
                  >
                    {getTeamAbbr(step.playerIn.team)}
                  </div>
                </div>
              </div>

              {isExpanded && (
                <div className="mt-3 pt-3 border-t space-y-2">
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{step.reasoning}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-muted/50 rounded p-2">
                      <p className="text-[9px] text-muted-foreground uppercase">Cash Required</p>
                      <p className="text-xs font-bold">${(step.cashRequired / 1000).toFixed(0)}k</p>
                    </div>
                    <div className="bg-muted/50 rounded p-2">
                      <p className="text-[9px] text-muted-foreground uppercase">Weekly Growth</p>
                      <p className="text-xs font-bold text-green-500">+${(step.playerOut.weeklyGain / 1000).toFixed(0)}k/wk</p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export default function DreamTeamPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"dream" | "starting" | "path">("dream");

  const { data, isLoading, refetch, isFetching } = useQuery<DreamTeamData>({
    queryKey: ["/api/dream-team/reverse-engineer"],
    enabled: false,
  });

  const [hasGenerated, setHasGenerated] = useState(false);

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await refetch();
      return res.data;
    },
    onSuccess: () => {
      setHasGenerated(true);
      setActiveTab("dream");
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const activateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/dream-team/activate-starting");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-team"] });
      toast({ title: "Starting squad activated", description: "Your team has been set to the dream team starting squad." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const positions = ["DEF", "MID", "RUC", "FWD", "UTIL"];

  function groupByPosition(players: (DreamPlayer | StartingPlayer)[]) {
    const groups: Record<string, typeof players> = {};
    for (const pos of positions) {
      groups[pos] = players.filter(p => p.fieldPosition === pos);
    }
    return groups;
  }

  if (!hasGenerated && !data) {
    return (
      <div className="p-4 sm:p-6 max-w-4xl mx-auto" data-testid="page-dream-team">
        <div className="flex items-center gap-2 mb-6">
          <Crown className="w-5 h-5 text-amber-500" />
          <h1 className="text-xl font-bold tracking-tight" data-testid="text-dream-team-title">
            Reverse Engineer
          </h1>
        </div>

        <Card className="overflow-hidden">
          <CardContent className="p-6 text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-amber-500/10 flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-amber-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold mb-1">Reverse-Engineer Your Dream Team</h2>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-md mx-auto">
                We'll build the absolute best squad ignoring the salary cap, then work backwards to create a budget-compliant starting team with a trade path to get you there as fast as possible.
              </p>
            </div>
            <div className="space-y-2 text-left max-w-sm mx-auto">
              <div className="flex items-start gap-2">
                <Star className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">Build the best possible 30-player squad — no budget limits</p>
              </div>
              <div className="flex items-start gap-2">
                <DollarSign className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">Create a budget squad with cash cows that will rise in value</p>
              </div>
              <div className="flex items-start gap-2">
                <Target className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">Get a round-by-round trade path to upgrade to your dream team</p>
              </div>
            </div>
            <Button
              size="lg"
              className="gap-2"
              onClick={() => generateMutation.mutate()}
              disabled={isFetching}
              data-testid="button-build-dream-team"
            >
              {isFetching ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Building Dream Team...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Build My Dream Team
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading || isFetching) {
    return (
      <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-4" data-testid="page-dream-team">
        <div className="flex items-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
          <h1 className="text-xl font-bold">Building your team...</h1>
        </div>
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4 sm:p-6 max-w-4xl mx-auto" data-testid="page-dream-team">
        <div className="flex items-center gap-2 mb-6">
          <Crown className="w-5 h-5 text-amber-500" />
          <h1 className="text-xl font-bold tracking-tight" data-testid="text-dream-team-title">
            Reverse Engineer
          </h1>
        </div>
        <Card className="overflow-hidden">
          <CardContent className="p-6 text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-amber-500/10 flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-amber-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold mb-1">Something went wrong</h2>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-md mx-auto">
                We couldn't load your dream team data. Try generating it again.
              </p>
            </div>
            <Button
              size="lg"
              className="gap-2"
              onClick={() => generateMutation.mutate()}
              disabled={isFetching}
              data-testid="button-build-dream-team-retry"
            >
              {isFetching ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Building...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Build My Dream Team
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const dreamGroups = groupByPosition(data.dreamTeam);
  const startGroups = groupByPosition(data.startingTeam);
  const dreamOnFieldCount = data.dreamTeam.filter(p => p.isOnField).length;
  const dreamOnFieldScore = data.dreamTeam.filter(p => p.isOnField).reduce((s, p) => s + (p.avgScore || 0), 0);
  const startOnFieldScore = data.startingTeam.filter(p => p.isOnField).reduce((s, p) => s + (p.avgScore || 0), 0);
  const lockedIn = data.startingTeam.filter(p => p.isDreamPlayer && p.isOnField).length;

  const tabs = [
    { key: "dream" as const, label: "Dream", icon: Crown },
    { key: "starting" as const, label: "Start", icon: Zap },
    { key: "path" as const, label: "Trade Path", icon: ArrowRightLeft },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-4" data-testid="page-dream-team">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Crown className="w-5 h-5 text-amber-500" />
          <h1 className="text-xl font-bold tracking-tight" data-testid="text-dream-team-title">
            Reverse Engineer
          </h1>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={() => generateMutation.mutate()}
          disabled={isFetching}
          data-testid="button-rebuild"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Rebuild
        </Button>
      </div>

      <Card data-testid="card-summary">
        <CardContent className="p-3">
          <p className="text-xs leading-relaxed text-muted-foreground" data-testid="text-summary">{data.summary}</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
        <Card>
          <CardContent className="p-2.5 text-center">
            <p className="text-[9px] uppercase text-muted-foreground">Dream Cost</p>
            <p className="text-sm font-bold">${(data.dreamTeamCost / 1000000).toFixed(2)}M</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-2.5 text-center">
            <p className="text-[9px] uppercase text-muted-foreground">Start Cost</p>
            <p className="text-sm font-bold">${(data.startingTeamCost / 1000000).toFixed(2)}M</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-2.5 text-center">
            <p className="text-[9px] uppercase text-muted-foreground">Complete By</p>
            <p className="text-sm font-bold">R{data.estimatedCompletionRound}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-1 p-1 bg-muted rounded-lg">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid={`tab-${tab.key}`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "dream" && (
        <div className="space-y-4" data-testid="section-dream-team">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" />
              <h2 className="text-sm font-semibold">The Dream Team</h2>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span>{dreamOnFieldCount} on field</span>
              <span>avg {dreamOnFieldScore.toFixed(0)}</span>
            </div>
          </div>
          {positions.map(pos => {
            const group = dreamGroups[pos];
            if (!group || group.length === 0) return null;
            return <PositionGroup key={pos} position={pos} players={group} />;
          })}
        </div>
      )}

      {activeTab === "starting" && (
        <div className="space-y-4" data-testid="section-starting-team">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-blue-500" />
              <h2 className="text-sm font-semibold">Your Starting Squad</h2>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span>{lockedIn} dream players locked in</span>
            </div>
          </div>

          <div className="flex gap-2">
            <div className="flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-green-500" />
              <span className="text-[10px] text-muted-foreground">Dream player</span>
            </div>
            <div className="flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-amber-500" />
              <span className="text-[10px] text-muted-foreground">Stepping stone</span>
            </div>
          </div>

          {positions.map(pos => {
            const group = startGroups[pos];
            if (!group || group.length === 0) return null;
            return <PositionGroup key={pos} position={pos} players={group} showDreamBadge />;
          })}

          <Button
            className="w-full gap-2"
            onClick={() => activateMutation.mutate()}
            disabled={activateMutation.isPending}
            data-testid="button-activate-starting"
          >
            {activateMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Activating...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                Activate Starting Squad
              </>
            )}
          </Button>
        </div>
      )}

      {activeTab === "path" && (
        <div className="space-y-4" data-testid="section-trade-path">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold">Trade Path to Dream Team</h2>
            </div>
            <Badge variant="outline" className="text-[10px]">
              {data.tradePath.length} {data.tradePath.length === 1 ? "trade" : "trades"}
            </Badge>
          </div>

          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-green-500" />
                <span className="text-xs font-medium">Score Progression</span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                <div className="text-center">
                  <p className="text-[9px] text-muted-foreground uppercase">Start</p>
                  <p className="text-base sm:text-lg font-bold">{startOnFieldScore.toFixed(0)}</p>
                </div>
                <div className="text-center">
                  <p className="text-[9px] text-muted-foreground uppercase">Dream</p>
                  <p className="text-base sm:text-lg font-bold text-green-500">{dreamOnFieldScore.toFixed(0)}</p>
                </div>
                <div className="text-center">
                  <p className="text-[9px] text-muted-foreground uppercase">Gain</p>
                  <p className="text-base sm:text-lg font-bold text-amber-500">+{(dreamOnFieldScore - startOnFieldScore).toFixed(0)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <TradePathTimeline tradePath={data.tradePath} />
        </div>
      )}
    </div>
  );
}
