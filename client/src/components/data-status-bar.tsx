import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { RefreshCw, Clock, ChevronDown, ChevronUp, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

interface SyncSourceStatus {
  lastSync: string | null;
  status: "idle" | "syncing" | "error";
  error?: string;
}

interface DataStatus {
  isRunning: boolean;
  isGathering: boolean;
  isManualRefreshing: boolean;
  lastGatherTime: string | null;
  serverStartTime: string | null;
  sources: Record<string, SyncSourceStatus>;
}

const SOURCE_LABELS: Record<string, string> = {
  aflFantasyPrices: "Rosters & IDs",
  dfsAustralia: "Player Stats",
  footywirePrices: "Prices",
  liveScores: "Live Scores",
  wheelo: "Advanced Ratings",
  fixtures: "Fixtures",
  injuryAndLineups: "Injuries & Lineups",
  intel: "News & Intel",
};

const SOURCE_ORDER = [
  "footywirePrices",
  "aflFantasyPrices",
  "liveScores",
  "injuryAndLineups",
  "fixtures",
  "dfsAustralia",
  "wheelo",
  "intel",
];

function formatTimeAgo(isoString: string): string {
  const now = new Date();
  const then = new Date(isoString);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ${diffMins % 60}m ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

function formatLocalTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function getLatestSyncTime(sources: Record<string, SyncSourceStatus>): string | null {
  let latest: string | null = null;
  for (const source of Object.values(sources)) {
    if (source.lastSync) {
      if (!latest || new Date(source.lastSync) > new Date(latest)) {
        latest = source.lastSync;
      }
    }
  }
  return latest;
}

export function DataStatusBar() {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);

  const { data: status } = useQuery<DataStatus>({
    queryKey: ["/api/data/status"],
    refetchInterval: 30000,
  });

  const refreshMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/data/refresh"),
    onSuccess: async (res) => {
      const result = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/data/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-team"] });
      if (result.success) {
        toast({
          title: "Data refreshed",
          description: `All sources updated in ${(result.duration / 1000).toFixed(0)}s`,
        });
      } else {
        toast({
          title: "Refresh completed with errors",
          description: result.errors?.join(", ") || "Some sources failed",
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Refresh failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (!status) return null;

  const visibleSources = Object.entries(status.sources).filter(
    ([key]) => SOURCE_LABELS[key]
  );

  const latestSync = getLatestSyncTime(status.sources);
  const isRefreshing = refreshMutation.isPending || status.isManualRefreshing || status.isGathering;
  const activeSyncs = visibleSources.filter(([, s]) => s.status === "syncing").length;
  const errorSyncs = visibleSources.filter(([, s]) => s.status === "error").length;

  const sortedSources = visibleSources.sort(([a], [b]) => {
    const ai = SOURCE_ORDER.indexOf(a);
    const bi = SOURCE_ORDER.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return (
    <div className="rounded-lg border border-border/50 bg-card/50 overflow-hidden" data-testid="data-status-bar">
      <div className="flex items-center justify-between px-3 py-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors min-w-0 flex-1"
          data-testid="button-toggle-status"
        >
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">
            {activeSyncs > 0 ? (
              <span className="text-blue-500">Syncing {activeSyncs} source{activeSyncs > 1 ? "s" : ""}...</span>
            ) : latestSync ? (
              <>Last refreshed {formatTimeAgo(latestSync)}</>
            ) : (
              "Data loading..."
            )}
          </span>
          {errorSyncs > 0 && (
            <span className="text-amber-500 shrink-0">{errorSyncs} error{errorSyncs > 1 ? "s" : ""}</span>
          )}
          {expanded ? <ChevronUp className="w-3 h-3 shrink-0" /> : <ChevronDown className="w-3 h-3 shrink-0" />}
        </button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => refreshMutation.mutate()}
          disabled={isRefreshing}
          className="ml-2 h-7 text-xs gap-1.5 shrink-0"
          data-testid="button-refresh-data"
        >
          {isRefreshing ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <RefreshCw className="w-3 h-3" />
          )}
          {isRefreshing ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      {expanded && (
        <div className="border-t border-border/50 px-3 py-2 space-y-1.5">
          {sortedSources.map(([key, source]) => (
            <div key={key} className="flex items-center justify-between text-xs" data-testid={`status-source-${key}`}>
              <div className="flex items-center gap-1.5">
                {source.status === "syncing" ? (
                  <Loader2 className="w-3 h-3 text-blue-500 animate-spin" />
                ) : source.status === "error" ? (
                  <AlertCircle className="w-3 h-3 text-amber-500" />
                ) : source.lastSync ? (
                  <CheckCircle2 className="w-3 h-3 text-green-500" />
                ) : (
                  <Clock className="w-3 h-3 text-muted-foreground" />
                )}
                <span className="text-muted-foreground">{SOURCE_LABELS[key] || key}</span>
              </div>
              <span className={
                source.status === "syncing"
                  ? "text-blue-500"
                  : source.status === "error"
                  ? "text-amber-500"
                  : "text-muted-foreground"
              }>
                {source.status === "syncing"
                  ? "Syncing..."
                  : source.status === "error"
                  ? "Error"
                  : source.lastSync
                  ? formatTimeAgo(source.lastSync)
                  : "Pending"}
              </span>
            </div>
          ))}

          <div className="pt-1.5 mt-1.5 border-t border-border/30 text-[11px] text-muted-foreground">
            <p>Auto-refresh every 4 hours. Live scores every 2 min during games.</p>
            {status.serverStartTime && (
              <p>Server started: {new Date(status.serverStartTime).toLocaleString([], {
                weekday: "short",
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              })}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
