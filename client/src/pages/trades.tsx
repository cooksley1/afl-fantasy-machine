import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeftRight,
  Zap,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Brain,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { TradeRecommendationWithPlayers, LeagueSettings } from "@shared/schema";

function ConfidenceBar({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  return (
    <div className="flex items-center gap-2">
      <Progress value={pct} className="h-1.5 flex-1" />
      <span className="text-xs font-mono font-medium w-8 text-right">{pct}%</span>
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

  const generateMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/trade-recommendations/generate"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trade-recommendations"] });
      toast({ title: "Trade recommendations generated", description: "New suggestions based on current form and data" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const aiGenerateMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/trade-recommendations/generate-ai"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trade-recommendations"] });
      toast({ title: "AI trade analysis complete", description: "Deep analysis of form, matchups, bye strategy, and more" });
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

  const highConfidence = (trades || []).filter((t) => t.confidence >= 0.7);
  const medConfidence = (trades || []).filter(
    (t) => t.confidence >= 0.4 && t.confidence < 0.7
  );
  const lowConfidence = (trades || []).filter((t) => t.confidence < 0.4);

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-5xl mx-auto" data-testid="page-trades">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Trade Centre</h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI-powered trade recommendations for your team
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

      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-accent/15 flex items-center justify-center">
                <ArrowLeftRight className="w-5 h-5 text-accent" />
              </div>
              <div>
                <p className="text-sm font-semibold">Trades Remaining</p>
                <p className="text-xs text-muted-foreground">
                  {settings?.totalTradesUsed || 0} used this season
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-accent">
                {settings?.tradesRemaining || 0}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {(!trades || trades.length === 0) && (
        <Card>
          <CardContent className="py-16 text-center">
            <ArrowLeftRight className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-semibold text-lg mb-1">No recommendations yet</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
              Click "Generate Recommendations" to get AI-powered trade suggestions based on your team's form, upcoming fixtures, and player values.
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

      {highConfidence.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-green-600 dark:text-green-400 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            Strong Recommendations
          </h2>
          {highConfidence.map((trade) => (
            <TradeCard
              key={trade.id}
              trade={trade}
              onExecute={() => executeTradeMutation.mutate(trade.id)}
              isPending={executeTradeMutation.isPending}
            />
          ))}
        </div>
      )}

      {medConfidence.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-accent flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Worth Considering
          </h2>
          {medConfidence.map((trade) => (
            <TradeCard
              key={trade.id}
              trade={trade}
              onExecute={() => executeTradeMutation.mutate(trade.id)}
              isPending={executeTradeMutation.isPending}
            />
          ))}
        </div>
      )}

      {lowConfidence.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
            Speculative
          </h2>
          {lowConfidence.map((trade) => (
            <TradeCard
              key={trade.id}
              trade={trade}
              onExecute={() => executeTradeMutation.mutate(trade.id)}
              isPending={executeTradeMutation.isPending}
            />
          ))}
        </div>
      )}
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
  return (
    <Card data-testid={`card-trade-${trade.id}`}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="destructive" className="text-[10px]">OUT</Badge>
                  <p className="text-sm font-semibold truncate">{trade.playerOut.name}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {trade.playerOut.team} | {trade.playerOut.position} | Avg: {trade.playerOut.avgScore?.toFixed(1)} | ${(trade.playerOut.price / 1000).toFixed(0)}K
                </p>
              </div>

              <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="default" className="bg-green-600 dark:bg-green-700 text-white text-[10px]">IN</Badge>
                  <p className="text-sm font-semibold truncate">{trade.playerIn.name}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {trade.playerIn.team} | {trade.playerIn.position} | Avg: {trade.playerIn.avgScore?.toFixed(1)} | ${(trade.playerIn.price / 1000).toFixed(0)}K
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 sm:gap-4">
            <div className="flex-1 max-w-48">
              <ConfidenceBar confidence={trade.confidence} />
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                <span className={trade.scoreDifference > 0 ? "text-green-500" : trade.scoreDifference < 0 ? "text-red-500" : ""}>
                  {trade.scoreDifference > 0 ? "+" : ""}
                  {trade.scoreDifference?.toFixed(1)} pts
                </span>
                <span>|</span>
                <span className={trade.priceChange > 0 ? "text-green-500" : trade.priceChange < 0 ? "text-red-500" : ""}>
                  {trade.priceChange > 0 ? "+" : ""}${(trade.priceChange / 1000).toFixed(0)}K
                </span>
              </div>
            </div>

            <Button
              size="sm"
              onClick={onExecute}
              disabled={isPending}
              data-testid={`button-execute-trade-${trade.id}`}
            >
              Execute Trade
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground mt-3 leading-relaxed border-t pt-3">
          {trade.reason}
        </p>
      </CardContent>
    </Card>
  );
}
