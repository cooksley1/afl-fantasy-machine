import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  { id: "bye_strategy", label: "Byes", icon: Calendar },
  { id: "pod_players", label: "POD", icon: Target },
  { id: "breakout", label: "Breakout", icon: TrendingUp },
  { id: "premium_trades", label: "Premiums", icon: Zap },
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

function IntelCard({ report }: { report: IntelReport }) {
  const Icon = getCategoryIcon(report.category);

  return (
    <Card data-testid={`card-intel-${report.id}`}>
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-md bg-primary/10 shrink-0 mt-0.5">
            <Icon className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold leading-tight">{report.title}</h3>
              <div className="flex items-center gap-2 shrink-0">
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
              <div className="flex items-center gap-2 flex-wrap pt-1">
                {report.playerNames.split(",").map((name, i) => (
                  <Badge key={i} variant="secondary" className="text-[10px]">
                    {name.trim()}
                  </Badge>
                ))}
              </div>
            )}

            <div className="flex items-center gap-3 pt-1 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                {getCategoryLabel(report.category)}
              </span>
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

export default function IntelHub() {
  const { toast } = useToast();
  const [activeCategory, setActiveCategory] = useState("all");

  const { data: reports, isLoading, isError, refetch } = useQuery<IntelReport[]>({
    queryKey: ["/api/intel"],
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
      toast({
        title: "Error generating intel",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const filtered =
    activeCategory === "all"
      ? reports || []
      : (reports || []).filter((r) => r.category === activeCategory);

  const highPriority = filtered.filter((r) => r.priority === "high");
  const actionable = filtered.filter((r) => r.actionable);

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
    <div className="p-6 space-y-6 max-w-5xl mx-auto" data-testid="page-intel-hub">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">
            Intel Hub
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI-powered strategic intelligence for your fantasy team
          </p>
        </div>
        <Button
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          data-testid="button-generate-intel"
        >
          {generateMutation.isPending ? (
            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Brain className="w-4 h-4 mr-2" />
          )}
          {generateMutation.isPending ? "Analyzing..." : "Generate Intelligence"}
        </Button>
      </div>

      {reports && reports.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-md bg-destructive/10">
                <AlertTriangle className="w-4 h-4 text-destructive" />
              </div>
              <div>
                <p className="text-lg font-bold">{highPriority.length}</p>
                <p className="text-xs text-muted-foreground">High Priority</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-md bg-accent/10">
                <ArrowRight className="w-4 h-4 text-accent" />
              </div>
              <div>
                <p className="text-lg font-bold">{actionable.length}</p>
                <p className="text-xs text-muted-foreground">Actionable</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-md bg-primary/10">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-lg font-bold">{(reports || []).length}</p>
                <p className="text-xs text-muted-foreground">Total Insights</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <ScrollArea className="w-full">
        <div className="flex gap-2 pb-2">
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
                data-testid={`button-category-${cat.id}`}
              >
                <cat.icon className="w-3.5 h-3.5 mr-1.5" />
                {cat.label}
                {count > 0 && (
                  <span className="ml-1.5 text-[10px] opacity-70">({count})</span>
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
              Generate intelligence to get AI-powered insights about captain picks, cash cows, 
              bye strategy, points of difference, breakout players, injury impacts, and more.
            </p>
            <Button
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
              data-testid="button-generate-intel-empty"
            >
              <Brain className="w-4 h-4 mr-2" />
              Generate Now
            </Button>
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
