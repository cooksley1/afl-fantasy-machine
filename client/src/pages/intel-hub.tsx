import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Brain,
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
  ArrowUpDown,
  Filter,
  ChevronDown,
  ChevronUp,
  AlertCircle,
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

type SortMode = "date_desc" | "date_asc" | "priority" | "category";
type DateFilter = "all" | "24h" | "3d" | "7d" | "14d";

const ITEMS_PER_PAGE = 15;

function getCategoryIcon(category: string) {
  const cat = CATEGORIES.find((c) => c.id === category);
  return cat?.icon || Brain;
}

function getCategoryLabel(category: string) {
  const cat = CATEGORIES.find((c) => c.id === category);
  return cat?.label || category;
}

function getReportAge(createdAt: Date | string | null): { days: number; isStale: boolean; label: string } {
  if (!createdAt) return { days: 0, isStale: false, label: "Unknown" };
  const now = new Date();
  const created = new Date(createdAt);
  if (isNaN(created.getTime())) return { days: 0, isStale: false, label: "Unknown" };
  const diffMs = now.getTime() - created.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor(diffMs / (1000 * 60));

  let label: string;
  if (minutes < 60) label = `${minutes}m ago`;
  else if (hours < 24) label = `${hours}h ago`;
  else if (days === 1) label = "1 day ago";
  else label = `${days} days ago`;

  return { days, isStale: days >= 7, label };
}

function deduplicateReports(reports: IntelReport[]): IntelReport[] {
  const seen = new Map<string, IntelReport>();

  for (const report of reports) {
    const titleNorm = report.title?.toLowerCase().replace(/\[live intel\]\s*/i, "").trim() || "";
    const contentStart = report.content?.substring(0, 100).toLowerCase().trim() || "";
    const dedupKey = `${report.category}::${titleNorm}`;
    const contentKey = `${report.category}::${contentStart}`;

    const existingByTitle = seen.get(dedupKey);
    const existingByContent = seen.get(contentKey);

    if (existingByTitle) {
      const existingDate = new Date(existingByTitle.createdAt || 0).getTime();
      const currentDate = new Date(report.createdAt || 0).getTime();
      if (currentDate > existingDate) {
        seen.set(dedupKey, report);
        seen.set(contentKey, report);
      }
    } else if (existingByContent) {
      const existingDate = new Date(existingByContent.createdAt || 0).getTime();
      const currentDate = new Date(report.createdAt || 0).getTime();
      if (currentDate > existingDate) {
        seen.set(dedupKey, report);
        seen.set(contentKey, report);
      }
    } else {
      seen.set(dedupKey, report);
      seen.set(contentKey, report);
    }
  }

  const uniqueIds = new Set<number>();
  const result: IntelReport[] = [];
  const values = Array.from(seen.values());
  for (const report of values) {
    if (!uniqueIds.has(report.id)) {
      uniqueIds.add(report.id);
      result.push(report);
    }
  }
  return result;
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

function StalenessBadge({ createdAt }: { createdAt: Date | string | null }) {
  const { isStale, label } = getReportAge(createdAt);
  if (isStale) {
    return (
      <Badge variant="outline" className="text-[10px] border-orange-500/50 text-orange-600 dark:text-orange-400">
        <AlertCircle className="w-2.5 h-2.5 mr-0.5" />
        Stale ({label})
      </Badge>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
      <Clock className="w-3 h-3" />
      {label}
    </span>
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
    club_news: "Club News",
    club_official: "Official Club",
    fantasy_news: "Fantasy News",
  };
  const isClub = source === "club_news" || source === "club_official";
  return (
    <Badge variant="outline" className={`text-[10px] ${isClub ? 'border-green-500/50 text-green-600 dark:text-green-400' : ''}`}>
      <Rss className="w-2.5 h-2.5 mr-0.5" />
      {labels[source] || source}
    </Badge>
  );
}

function IntelCard({ report }: { report: IntelReport }) {
  const Icon = getCategoryIcon(report.category);
  const isLiveIntel = report.title?.startsWith("[Live Intel]");
  const { isStale } = getReportAge(report.createdAt);

  return (
    <Card data-testid={`card-intel-${report.id}`} className={`${isLiveIntel ? "border-primary/30" : ""} ${isStale ? "opacity-60" : ""}`}>
      <CardContent className="p-3">
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
              <StalenessBadge createdAt={report.createdAt} />
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
  const [sortMode, setSortMode] = useState<SortMode>("date_desc");
  const [dateFilter, setDateFilter] = useState<DateFilter>("7d");
  const [displayCount, setDisplayCount] = useState(ITEMS_PER_PAGE);
  const [sourceStatsExpanded, setSourceStatsExpanded] = useState(false);
  const [preGameExpanded, setPreGameExpanded] = useState(false);

  const sinceDate = useMemo(() => {
    if (dateFilter === "all") return undefined;
    const now = new Date();
    const daysMap: Record<string, number> = { "24h": 1, "3d": 3, "7d": 7, "14d": 14 };
    const days = daysMap[dateFilter] || 7;
    return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  }, [dateFilter]);

  const queryKey = sinceDate ? ["/api/intel", { since: sinceDate }] : ["/api/intel"];

  const { data: reports, isLoading, isError, refetch } = useQuery<IntelReport[]>({
    queryKey,
    queryFn: async () => {
      const url = sinceDate ? `/api/intel?since=${encodeURIComponent(sinceDate)}` : "/api/intel";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch intel");
      return res.json();
    },
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

  const processedReports = useMemo(() => {
    if (!reports) return [];

    const deduped = deduplicateReports(reports);

    const categoryFiltered =
      activeCategory === "all"
        ? deduped
        : deduped.filter((r) => r.category === activeCategory);

    const sorted = [...categoryFiltered].sort((a, b) => {
      switch (sortMode) {
        case "date_desc": {
          const aDate = new Date(a.createdAt || 0).getTime();
          const bDate = new Date(b.createdAt || 0).getTime();
          return bDate - aDate;
        }
        case "date_asc": {
          const aDate = new Date(a.createdAt || 0).getTime();
          const bDate = new Date(b.createdAt || 0).getTime();
          return aDate - bDate;
        }
        case "priority": {
          const priorityOrder = { high: 0, medium: 1, low: 2 };
          const aPrio = priorityOrder[a.priority as keyof typeof priorityOrder] ?? 1;
          const bPrio = priorityOrder[b.priority as keyof typeof priorityOrder] ?? 1;
          if (aPrio !== bPrio) return aPrio - bPrio;
          if (a.actionable !== b.actionable) return a.actionable ? -1 : 1;
          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        }
        case "category": {
          const catCompare = a.category.localeCompare(b.category);
          if (catCompare !== 0) return catCompare;
          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        }
        default:
          return 0;
      }
    });

    return sorted;
  }, [reports, activeCategory, sortMode]);

  const visibleReports = processedReports.slice(0, displayCount);
  const hasMore = displayCount < processedReports.length;

  const allDeduped = useMemo(() => (reports ? deduplicateReports(reports) : []), [reports]);
  const highPriority = allDeduped.filter((r) => r.priority === "high");
  const actionable = allDeduped.filter((r) => r.actionable);
  const liveIntel = allDeduped.filter(r => r.source && r.source !== "ai_analysis");
  const staleCount = allDeduped.filter(r => getReportAge(r.createdAt).isStale).length;

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-5xl mx-auto">
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
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-5xl mx-auto">
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
            Live data from all 18 AFL clubs, AFL.com.au, Squiggle + AI analysis
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
              <p className="text-lg font-bold" data-testid="text-high-priority-count">{highPriority.length}</p>
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
              <p className="text-lg font-bold" data-testid="text-actionable-count">{actionable.length}</p>
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
              <p className="text-lg font-bold" data-testid="text-sources-count">{sourceStats?.totalSources || 0}</p>
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
              <p className="text-lg font-bold" data-testid="text-live-intel-count">{liveIntel.length}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">Live Intel</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {sourceStats?.lastFetched && (
        <Card className="bg-muted/30">
          <CardContent className="p-3">
            <button
              onClick={() => setSourceStatsExpanded(!sourceStatsExpanded)}
              className="flex items-center justify-between w-full"
              data-testid="button-toggle-source-stats"
            >
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">
                  Last gather: {new Date(sourceStats.lastFetched).toLocaleString()}
                </span>
                <span className="text-[10px] text-muted-foreground ml-1">
                  ({Object.values(sourceStats.sourceBreakdown || {}).reduce((a, b) => a + b, 0)} sources)
                </span>
              </div>
              {sourceStatsExpanded ? (
                <ChevronUp className="w-3 h-3 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-3 h-3 text-muted-foreground" />
              )}
            </button>
            {sourceStatsExpanded && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {Object.entries(sourceStats.sourceBreakdown || {}).map(([key, count]) => {
                  const sourceLabels: Record<string, string> = {
                    squiggle_fixtures: "Squiggle Fixtures",
                    squiggle_tips: "Squiggle Tips",
                    squiggle_ladder: "Ladder",
                    afl_news: "AFL.com.au",
                    club_news: "Club News",
                    club_official: "Official Club",
                    fantasy_news: "Fantasy News",
                  };
                  const isClub = key === "club_news" || key === "club_official";
                  return (
                    <Badge
                      key={key}
                      variant="secondary"
                      className={`text-[10px] ${isClub ? 'bg-green-500/10 text-green-600 dark:text-green-400' : ''}`}
                      data-testid={`badge-source-${key}`}
                    >
                      {sourceLabels[key] || key}: {count}
                    </Badge>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {preGameAdvice && (
        <Card className="border-orange-500/30">
          <CardContent className="p-3">
            <button
              onClick={() => setPreGameExpanded(!preGameExpanded)}
              className="flex items-center justify-between w-full"
              data-testid="button-toggle-pregame"
            >
              <div className="flex items-center gap-2">
                <Siren className="w-4 h-4 text-orange-500" />
                <span className="text-sm font-semibold">Pre-Game Advice</span>
                <Badge variant="outline" className="text-[10px] border-orange-500/50 text-orange-600 dark:text-orange-400">
                  {preGameAdvice.playerAlerts.length} alerts
                </Badge>
              </div>
              {preGameExpanded ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
            {preGameExpanded && (
              <div className="mt-3">
                <PreGamePanel advice={preGameAdvice} />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {preGameMutation.isPending && (
        <Card className="border-orange-500/30">
          <CardContent className="p-6 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-orange-500 mb-3" />
            <p className="font-semibold">Generating pre-game advice</p>
            <p className="text-sm text-muted-foreground mt-1">Analysing latest intel, injury news, and team selections for final trade decisions...</p>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <Select value={dateFilter} onValueChange={(v) => { setDateFilter(v as DateFilter); setDisplayCount(ITEMS_PER_PAGE); }}>
            <SelectTrigger className="w-[130px]" data-testid="select-date-filter">
              <SelectValue placeholder="Time range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Last 24 hours</SelectItem>
              <SelectItem value="3d">Last 3 days</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="14d">Last 14 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
          <Select value={sortMode} onValueChange={(v) => { setSortMode(v as SortMode); setDisplayCount(ITEMS_PER_PAGE); }}>
            <SelectTrigger className="w-[150px]" data-testid="select-sort-mode">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date_desc">Newest first</SelectItem>
              <SelectItem value="date_asc">Oldest first</SelectItem>
              <SelectItem value="priority">Priority</SelectItem>
              <SelectItem value="category">Category</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {staleCount > 0 && dateFilter === "all" && (
          <Badge variant="outline" className="text-[10px] border-orange-500/50 text-orange-600 dark:text-orange-400" data-testid="badge-stale-count">
            <AlertCircle className="w-3 h-3 mr-1" />
            {staleCount} stale report{staleCount !== 1 ? "s" : ""}
          </Badge>
        )}
        <span className="text-xs text-muted-foreground ml-auto" data-testid="text-report-count">
          {processedReports.length} report{processedReports.length !== 1 ? "s" : ""}
          {reports && allDeduped.length < reports.length && (
            <span> ({reports.length - allDeduped.length} duplicates hidden)</span>
          )}
        </span>
      </div>

      <ScrollArea className="w-full">
        <div className="flex gap-1.5 sm:gap-2 pb-2">
          {CATEGORIES.map((cat) => {
            const count =
              cat.id === "all"
                ? allDeduped.length
                : allDeduped.filter((r) => r.category === cat.id).length;
            const isActive = activeCategory === cat.id;
            return (
              <Button
                key={cat.id}
                variant={isActive ? "default" : "secondary"}
                size="sm"
                onClick={() => { setActiveCategory(cat.id); setDisplayCount(ITEMS_PER_PAGE); }}
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

      {processedReports.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center">
            <Brain className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-semibold text-lg mb-1" data-testid="text-empty-title">No Intel Reports Yet</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
              {dateFilter !== "all"
                ? `No reports found in the selected time range. Try expanding to "All time" or gather new data.`
                : "No intelligence reports available. Gather live data from all 18 AFL club feeds, AFL.com.au, Squiggle, and fantasy news sources, then run AI analysis for actionable insights."}
            </p>
            <div className="flex items-center justify-center gap-2 flex-wrap">
              {dateFilter !== "all" && (
                <Button
                  onClick={() => setDateFilter("all")}
                  variant="outline"
                  data-testid="button-show-all-time"
                >
                  <Clock className="w-4 h-4 mr-2" />
                  Show All Time
                </Button>
              )}
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

      <div className="space-y-2">
        {visibleReports.map((report) => (
          <IntelCard key={report.id} report={report} />
        ))}
      </div>

      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            onClick={() => setDisplayCount((prev) => prev + ITEMS_PER_PAGE)}
            data-testid="button-show-more"
          >
            <ChevronDown className="w-4 h-4 mr-1.5" />
            Show more ({processedReports.length - displayCount} remaining)
          </Button>
        </div>
      )}
    </div>
  );
}
