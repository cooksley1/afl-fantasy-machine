import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Brain,
  RefreshCw,
  AlertTriangle,
  Crown,
  Calendar,
  Target,
  TrendingUp,
  Zap,
  Shield,
  MapPin,
  History,
  DollarSign,
  Sparkles,
  ArrowRight,
  Clock,
  Satellite,
  Loader2,
  Siren,
  Rss,
  BarChart3,
  Users,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ErrorState } from "@/components/error-state";
import type { IntelReport } from "@shared/schema";

const CATEGORIES = [
  { id: "all", label: "All", icon: Brain },
  { id: "captain_picks", label: "Captains", icon: Crown },
  { id: "cash_cows", label: "Cash Cows", icon: DollarSign },
  { id: "injuries", label: "Injuries", icon: AlertTriangle },
  { id: "team_selection", label: "Teams", icon: Users },
  { id: "bye_strategy", label: "Byes", icon: Calendar },
  { id: "pod_players", label: "POD", icon: Target },
  { id: "breakout", label: "Breakout", icon: TrendingUp },
  { id: "premium_trades", label: "Premiums", icon: Zap },
  { id: "fixtures", label: "Fixtures", icon: BarChart3 },
  { id: "tactical", label: "Tactical", icon: Shield },
  { id: "ground_conditions", label: "Grounds", icon: MapPin },
  { id: "historical", label: "History", icon: History },
];

function getCategoryIcon(category: string) {
  const cat = CATEGORIES.find((c) => c.id === category);
  return cat?.icon || Brain;
}

function getCategoryLabel(category: string) {
  const cat = CATEGORIES.find((c) => c.id === category);
  return cat?.label || category;
}

function PriorityBadge({ priority }: { priority: string }) {
  if (priority === "high") {
    return (
      <Badge variant="destructive" className="text-[10px]">
        High Priority
      </Badge>
    );
  }
  if (priority === "medium") {
    return (
      <Badge variant="default" className="text-[10px]">
        Medium
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-[10px]">
      Low
    </Badge>
  );
}

function SourceBadge({ source }: { source: string | null }) {
  if (!source) return null;
  const labels: Record<string, string> = {
    ai_analysis: "AI Analysis",
    squiggle_fixtures: "Squiggle",
    squiggle_tips: "Predictions",
    squiggle_ladder: "Ladder",
    afl_news: "AFL.com.au",
  };
  return (
    <Badge variant="outline" className="text-[10px]">
      <Rss className="w-2.5 h-2.5 mr-0.5" />
      {labels[source] || source}
    </Badge>
  );
}

function IntelCard({ report }: { report: IntelReport }) {
  const Icon = getCategoryIcon(report.category);
  const isLiveIntel = report.title?.startsWith("[Live Intel]");

  return (
    <Card data-testid={`card-intel-${report.id}`} className={isLiveIntel ? "border-primary/30" : ""}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-md shrink-0 mt-0.5 ${isLiveIntel ? 'bg-primary/20' : 'bg-primary/10'}`}>
            <Icon className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold leading-tight">{report.title}</h3>
              <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                <PriorityBadge priority={report.priority} />
                {report.actionable && (
                  <Badge variant="default" className="bg-accent text-accent-foreground text-[10px]">
                    <ArrowRight className="w-3 h-3 mr-0.5" /> Action
                  </Badge>
                )}
              </div>
            </div>

            <p className="text-sm text-muted-foreground leading-relaxed">
              {report.content}
            </p>

            {report.playerNames && (
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                {report.playerNames.split(",").map((name, i) => (
                  <Badge key={i} variant="secondary" className="text-[10px]">
                    {name.trim()}
                  </Badge>
                ))}
              </div>
            )}

            <div className="flex items-center gap-3 pt-1 text-[10px] text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                {getCategoryLabel(report.category)}
              </span>
              <SourceBadge source={report.source} />
              {report.createdAt && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {new Date(report.createdAt).toLocaleString()}
                </span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface PreGameAdvice {
  tradeDeadlineAdvice: string;
  captainRecommendation: string;
  lastMinuteChanges: string[];
  playerAlerts: { name: string; alert: string; action: string }[];
}

interface SourceStats {
  totalSources: number;
  processedCount: number;
  actionableCount: number;
  lastFetched: string | null;
  sourceBreakdown: Record<string, number>;
}

function PreGamePanel({ advice }: { advice: PreGameAdvice }) {
  return (
    <div className="space-y-3" data-testid="panel-pregame">
      <Card className="border-orange-500/30 bg-orange-500/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Siren className="w-4 h-4 text-orange-500" />
            Pre-Game Trade Advice
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm" data-testid="text-trade-deadline">{advice.tradeDeadlineAdvice}</p>
        </CardContent>
      </Card>

      <Card className="border-yellow-500/30 bg-yellow-500/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Crown className="w-4 h-4 text-yellow-500" />
            Captain Strategy
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm" data-testid="text-captain-rec">{advice.captainRecommendation}</p>
        </CardContent>
      </Card>

      {advice.playerAlerts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              Player Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {advice.playerAlerts.map((alert, i) => (
              <div key={i} className="border-b last:border-0 pb-2 last:pb-0" data-testid={`alert-player-${i}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-xs">{alert.name}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{alert.alert}</p>
                <p className="text-xs font-medium mt-1 text-primary">{alert.action}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {advice.lastMinuteChanges.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="w-4 h-4 text-red-500" />
              Last-Minute Changes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {advice.lastMinuteChanges.map((change, i) => (
                <li key={i} className="text-sm flex items-start gap-2" data-testid={`change-${i}`}>
                  <span className="text-red-500 mt-0.5">!</span>
                  <span>{change}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function IntelHub() {
  const { toast } = useToast();
  const [activeCategory, setActiveCategory] = useState("all");
  const [preGameAdvice, setPreGameAdvice] = useState<PreGameAdvice | null>(null);

  const { data: reports, isLoading, isError, refetch } = useQuery<IntelReport[]>({
    queryKey: ["/api/intel"],
  });

  const { data: sourceStats } = useQuery<SourceStats>({
    queryKey: ["/api/intel/sources/stats"],
  });

  const generateMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/intel/generate"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/intel"] });
      toast({
        title: "Intelligence generated",
        description: "Fresh insights based on current data and AI analysis",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error generating intel", description: error.message, variant: "destructive" });
    },
  });

  const gatherMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/intel/gather");
      return res.json();
    },
    onSuccess: (data: { fetched: number; processed: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/intel"] });
      queryClient.invalidateQueries({ queryKey: ["/api/intel/sources/stats"] });
      toast({
        title: "Data gathered",
        description: `${data.fetched} new sources fetched, ${data.processed} processed`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error gathering data", description: error.message, variant: "destructive" });
    },
  });

  const preGameMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/intel/pre-game");
      return res.json();
    },
    onSuccess: (data: PreGameAdvice) => {
      setPreGameAdvice(data);
      toast({ title: "Pre-game advice ready" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const filtered =
    activeCategory === "all"
      ? reports || []
      : (reports || []).filter((r) => r.category === activeCategory);

  const highPriority = filtered.filter((r) => r.priority === "high");
  const actionable = filtered.filter((r) => r.actionable);
  const liveIntel = (reports || []).filter(r => r.source && r.source !== "ai_analysis");

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        <ErrorState message="Failed to load intelligence data." onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-5xl mx-auto" data-testid="page-intel-hub">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">
            Intel Hub
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live data from AFL sources + AI-powered strategic intelligence
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            onClick={() => gatherMutation.mutate()}
            disabled={gatherMutation.isPending}
            variant="outline"
            size="sm"
            data-testid="button-gather-intel"
          >
            {gatherMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Satellite className="w-4 h-4 mr-1.5" />
            )}
            {gatherMutation.isPending ? "Gathering..." : "Gather Data"}
          </Button>
          <Button
            onClick={() => preGameMutation.mutate()}
            disabled={preGameMutation.isPending}
            variant="outline"
            size="sm"
            data-testid="button-pregame"
          >
            {preGameMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Siren className="w-4 h-4 mr-1.5" />
            )}
            {preGameMutation.isPending ? "Loading..." : "Pre-Game"}
          </Button>
          <Button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            size="sm"
            data-testid="button-generate-intel"
          >
            {generateMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Brain className="w-4 h-4 mr-1.5" />
            )}
            {generateMutation.isPending ? "Analyzing..." : "AI Analysis"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <Card>
          <CardContent className="p-3 sm:p-4 flex items-center gap-3">
            <div className="p-2 rounded-md bg-destructive/10">
              <AlertTriangle className="w-4 h-4 text-destructive" />
            </div>
            <div>
              <p className="text-lg font-bold">{highPriority.length}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">High Priority</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4 flex items-center gap-3">
            <div className="p-2 rounded-md bg-accent/10">
              <ArrowRight className="w-4 h-4 text-accent" />
            </div>
            <div>
              <p className="text-lg font-bold">{actionable.length}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">Actionable</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4 flex items-center gap-3">
            <div className="p-2 rounded-md bg-primary/10">
              <Satellite className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-lg font-bold">{sourceStats?.totalSources || 0}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">Sources</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4 flex items-center gap-3">
            <div className="p-2 rounded-md bg-green-500/10">
              <Rss className="w-4 h-4 text-green-500" />
            </div>
            <div>
              <p className="text-lg font-bold">{liveIntel.length}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">Live Intel</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {sourceStats?.lastFetched && (
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Clock className="w-3 h-3" />
          Last data gather: {new Date(sourceStats.lastFetched).toLocaleString()} |
          Sources: {Object.entries(sourceStats.sourceBreakdown || {}).map(([k, v]) => `${k}: ${v}`).join(', ')}
        </p>
      )}

      {preGameAdvice && <PreGamePanel advice={preGameAdvice} />}

      {preGameMutation.isPending && (
        <Card className="border-orange-500/30">
          <CardContent className="p-6 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-orange-500 mb-3" />
            <p className="font-semibold">Generating pre-game advice</p>
            <p className="text-sm text-muted-foreground mt-1">Analysing latest intel, injury news, and team selections for final trade decisions...</p>
          </CardContent>
        </Card>
      )}

      <ScrollArea className="w-full">
        <div className="flex gap-1.5 sm:gap-2 pb-2">
          {CATEGORIES.map((cat) => {
            const count =
              cat.id === "all"
                ? (reports || []).length
                : (reports || []).filter((r) => r.category === cat.id).length;
            const isActive = activeCategory === cat.id;
            return (
              <Button
                key={cat.id}
                variant={isActive ? "default" : "secondary"}
                size="sm"
                onClick={() => setActiveCategory(cat.id)}
                className="whitespace-nowrap text-xs sm:text-sm"
                data-testid={`button-category-${cat.id}`}
              >
                <cat.icon className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1 sm:mr-1.5" />
                {cat.label}
                {count > 0 && (
                  <span className="ml-1 sm:ml-1.5 text-[10px] opacity-70">({count})</span>
                )}
              </Button>
            );
          })}
        </div>
      </ScrollArea>

      {filtered.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center">
            <Brain className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-semibold text-lg mb-1">No intelligence reports yet</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
              Gather live data from AFL sources, then generate AI analysis for strategic insights
              about captain picks, cash cows, bye strategy, POD plays, and more.
            </p>
            <div className="flex items-center justify-center gap-2">
              <Button
                onClick={() => gatherMutation.mutate()}
                disabled={gatherMutation.isPending}
                variant="outline"
                data-testid="button-gather-intel-empty"
              >
                <Satellite className="w-4 h-4 mr-2" />
                Gather Data First
              </Button>
              <Button
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
                data-testid="button-generate-intel-empty"
              >
                <Brain className="w-4 h-4 mr-2" />
                AI Analysis
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {filtered
          .sort((a, b) => {
            const priorityOrder = { high: 0, medium: 1, low: 2 };
            const aPrio = priorityOrder[a.priority as keyof typeof priorityOrder] ?? 1;
            const bPrio = priorityOrder[b.priority as keyof typeof priorityOrder] ?? 1;
            if (aPrio !== bPrio) return aPrio - bPrio;
            if (a.actionable !== b.actionable) return a.actionable ? -1 : 1;
            return 0;
          })
          .map((report) => (
            <IntelCard key={report.id} report={report} />
          ))}
      </div>
    </div>
  );
}
