import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ClipboardCheck,
  ArrowRightLeft,
  Crown,
  Shield,
  ArrowRight,
  Copy,
  Share2,
  Check,
  Lightbulb,
  PartyPopper,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TradeStep {
  step: number;
  out: { name: string; price: number; avgScore: number };
  in: { name: string; price: number; avgScore: number };
  reason: string;
  scoreDiff: number;
}

interface FieldMove {
  action: string;
  player: string;
  reason: string;
}

interface GameDayGuideData {
  round: number;
  tradesRemaining: number;
  trades: TradeStep[];
  captain: { name: string; avgScore: number; position: string } | null;
  viceCaptain: { name: string; avgScore: number; position: string } | null;
  fieldMoves: FieldMove[];
  tips: string[];
  isEmpty: boolean;
}

function getStorageKey(round: number) {
  return `afl_gameday_checks_r${round}`;
}

function getStoredChecks(round: number): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(getStorageKey(round));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function storeChecks(round: number, checks: Record<string, boolean>) {
  localStorage.setItem(getStorageKey(round), JSON.stringify(checks));
}

export default function GameDayGuide() {
  const { toast } = useToast();
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);

  const { data: guide, isLoading } = useQuery<GameDayGuideData>({
    queryKey: ["/api/game-day-guide"],
  });

  useEffect(() => {
    if (guide?.round !== undefined) {
      setChecks(getStoredChecks(guide.round));
    }
  }, [guide?.round]);

  useEffect(() => {
    if (guide?.round !== undefined) {
      storeChecks(guide.round, checks);
    }
  }, [checks, guide?.round]);

  const toggleCheck = (key: string) => {
    setChecks((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const formatGuideText = (): string => {
    if (!guide) return "";
    const lines: string[] = [];
    lines.push(`=== GAME DAY GUIDE — Round ${guide.round} ===`);
    lines.push("");

    if (guide.trades.length > 0) {
      lines.push("TRADES TO MAKE:");
      for (const t of guide.trades) {
        lines.push(
          `  Step ${t.step}: ${t.out.name} ($${(t.out.price / 1000).toFixed(0)}k) OUT -> ${t.in.name} ($${(t.in.price / 1000).toFixed(0)}k) IN`
        );
        lines.push(`    Reason: ${t.reason}`);
      }
      lines.push("");
    }

    if (guide.captain) {
      lines.push(`CAPTAIN: ${guide.captain.name} (avg ${guide.captain.avgScore})`);
    }
    if (guide.viceCaptain) {
      lines.push(`VICE-CAPTAIN: ${guide.viceCaptain.name} (avg ${guide.viceCaptain.avgScore})`);
    }
    if (guide.captain || guide.viceCaptain) lines.push("");

    if (guide.fieldMoves.length > 0) {
      lines.push("FIELD/BENCH CHANGES:");
      for (const m of guide.fieldMoves) {
        lines.push(`  ${m.action}: ${m.player} — ${m.reason}`);
      }
      lines.push("");
    }

    if (guide.tips.length > 0) {
      lines.push("QUICK STEPS:");
      guide.tips.forEach((tip, i) => {
        lines.push(`  ${i + 1}. ${tip}`);
      });
    }

    return lines.join("\n");
  };

  const handleCopy = async () => {
    const text = formatGuideText();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({ title: "Copied to clipboard" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Failed to copy", variant: "destructive" });
    }
  };

  const handleShare = async () => {
    const text = formatGuideText();
    if (navigator.share) {
      try {
        await navigator.share({ title: `Game Day Guide — Round ${guide?.round}`, text });
      } catch {
        // user cancelled
      }
    } else {
      handleCopy();
    }
  };

  const totalSteps =
    (guide?.trades.length || 0) +
    (guide?.captain ? 1 : 0) +
    (guide?.viceCaptain ? 1 : 0) +
    (guide?.fieldMoves.length || 0);
  const completedSteps = Object.values(checks).filter(Boolean).length;

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <ClipboardCheck className="w-6 h-6 text-accent" />
          <h1 className="text-xl font-bold" data-testid="text-page-title">
            Game Day Guide
          </h1>
          {guide && (
            <Badge variant="outline" data-testid="badge-round">
              Round {guide.round}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground" data-testid="text-page-subtitle">
          Your step-by-step checklist for updating your team in the official AFL Fantasy app
        </p>
      </div>

      {guide && !guide.isEmpty && (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Badge variant="outline" data-testid="badge-progress">
              {completedSteps} / {totalSteps} done
            </Badge>
            {guide.tradesRemaining > 0 && (
              <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20" data-testid="badge-trades-remaining">
                {guide.tradesRemaining} trade{guide.tradesRemaining !== 1 ? "s" : ""} available
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCopy} data-testid="button-copy">
              {copied ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleShare} data-testid="button-share">
              <Share2 className="w-4 h-4 mr-1" />
              Share
            </Button>
          </div>
        </div>
      )}

      {guide?.isEmpty ? (
        <Card data-testid="card-empty-state">
          <CardContent className="p-8 text-center space-y-3">
            <PartyPopper className="w-10 h-10 text-accent mx-auto" />
            <h2 className="text-lg font-semibold" data-testid="text-empty-title">
              Your team is set!
            </h2>
            <p className="text-sm text-muted-foreground" data-testid="text-empty-message">
              No changes needed this round. Sit back and watch the points roll in.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {guide && guide.trades.length > 0 && (
            <Card data-testid="card-trades-section">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <ArrowRightLeft className="w-4 h-4 text-accent" />
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Trades to Make
                  </h2>
                </div>
                <div className="space-y-2">
                  {guide.trades.map((trade) => {
                    const key = `trade-${trade.step}`;
                    return (
                      <div
                        key={key}
                        className={`rounded-md border p-3 transition-opacity ${checks[key] ? "opacity-50" : ""}`}
                        data-testid={`checklist-trade-${trade.step}`}
                      >
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={!!checks[key]}
                            onCheckedChange={() => toggleCheck(key)}
                            className="mt-1"
                            data-testid={`checkbox-trade-${trade.step}`}
                          />
                          <div className="flex-1 min-w-0 space-y-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[10px]">Step {trade.step}</Badge>
                              {trade.scoreDiff > 0 && (
                                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]">
                                  +{trade.scoreDiff.toFixed(1)} pts
                                </Badge>
                              )}
                            </div>
                            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                              <div className="rounded-md bg-red-500/5 border border-red-500/15 p-2 space-y-0.5">
                                <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/20 text-[10px] mb-0.5">OUT</Badge>
                                <p className="text-sm font-semibold">{trade.out.name}</p>
                                <p className="text-[10px] text-muted-foreground">${(trade.out.price / 1000).toFixed(0)}k · avg {trade.out.avgScore}</p>
                              </div>
                              <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                              <div className="rounded-md bg-emerald-500/5 border border-emerald-500/15 p-2 space-y-0.5">
                                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px] mb-0.5">IN</Badge>
                                <p className="text-sm font-semibold">{trade.in.name}</p>
                                <p className="text-[10px] text-muted-foreground">${(trade.in.price / 1000).toFixed(0)}k · avg {trade.in.avgScore}</p>
                              </div>
                            </div>
                            <p className="text-[11px] text-muted-foreground italic leading-relaxed">{trade.reason}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {guide && (guide.captain || guide.viceCaptain) && (
            <Card data-testid="card-captain-section">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Crown className="w-4 h-4 text-amber-500" />
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Set Your Captain
                  </h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {guide.captain && (
                    <div
                      className={`flex items-start gap-3 rounded-md border p-3 transition-opacity ${checks["captain"] ? "opacity-50" : ""}`}
                      data-testid="checklist-captain"
                    >
                      <Checkbox
                        checked={!!checks["captain"]}
                        onCheckedChange={() => toggleCheck("captain")}
                        className="mt-0.5"
                        data-testid="checkbox-captain"
                      />
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-1.5">
                          <Crown className="w-3.5 h-3.5 text-amber-500" />
                          <span className="text-xs font-semibold text-muted-foreground">Captain</span>
                        </div>
                        <p className="text-sm font-semibold" data-testid="text-captain-name">
                          {guide.captain.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {guide.captain.position} · avg {guide.captain.avgScore}
                        </p>
                      </div>
                    </div>
                  )}
                  {guide.viceCaptain && (
                    <div
                      className={`flex items-start gap-3 rounded-md border p-3 transition-opacity ${checks["viceCaptain"] ? "opacity-50" : ""}`}
                      data-testid="checklist-vice-captain"
                    >
                      <Checkbox
                        checked={!!checks["viceCaptain"]}
                        onCheckedChange={() => toggleCheck("viceCaptain")}
                        className="mt-0.5"
                        data-testid="checkbox-vice-captain"
                      />
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-1.5">
                          <Shield className="w-3.5 h-3.5 text-blue-500" />
                          <span className="text-xs font-semibold text-muted-foreground">Vice-Captain</span>
                        </div>
                        <p className="text-sm font-semibold" data-testid="text-vc-name">
                          {guide.viceCaptain.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {guide.viceCaptain.position} · avg {guide.viceCaptain.avgScore}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {guide && guide.fieldMoves.length > 0 && (
            <Card data-testid="card-field-moves-section">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <ArrowRightLeft className="w-4 h-4 text-accent" />
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Field / Bench Changes
                  </h2>
                </div>
                <div className="space-y-2">
                  {guide.fieldMoves.map((move, i) => {
                    const key = `field-move-${i}`;
                    return (
                      <div
                        key={key}
                        className={`flex items-start gap-3 rounded-md border p-3 transition-opacity ${checks[key] ? "opacity-50" : ""}`}
                        data-testid={`checklist-field-move-${i}`}
                      >
                        <Checkbox
                          checked={!!checks[key]}
                          onCheckedChange={() => toggleCheck(key)}
                          className="mt-0.5"
                          data-testid={`checkbox-field-move-${i}`}
                        />
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20 text-[10px]">
                              {move.action}
                            </Badge>
                            <span className="text-sm font-semibold">{move.player}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground italic">{move.reason}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {guide && guide.tips.length > 0 && (
            <Card data-testid="card-tips-section">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-amber-500" />
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Quick Tips
                  </h2>
                </div>
                <ol className="space-y-1.5 list-decimal list-inside">
                  {guide.tips.map((tip, i) => (
                    <li
                      key={i}
                      className="text-sm text-muted-foreground"
                      data-testid={`text-tip-${i}`}
                    >
                      {tip}
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
