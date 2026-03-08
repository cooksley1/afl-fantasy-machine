import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Calendar,
  MapPin,
  Clock,
  Trophy,
  ChevronLeft,
  ChevronRight,
  Radio,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Eye,
  Zap,
  Shield,
  ExternalLink,
  Loader2,
  Sparkles,
} from "lucide-react";
import { getTeamColors, getTeamAbbr } from "@/lib/afl-teams";
import type { Fixture } from "@shared/schema";

interface FixtureGroup {
  roundName: string;
  matches: Fixture[];
}

type GroupedFixtures = Record<string, FixtureGroup>;

interface MatchSynopsis {
  synopsis: string;
  topPerformers: {
    name: string;
    team: string;
    position: string;
    score: number;
    scoreDiff: number | null;
    subFlag: boolean;
  }[];
  keyObservations: {
    player: string;
    team: string;
    type: string;
    observation: string;
  }[];
  highlightsUrl: string | null;
}

function getRoundLabel(round: number, roundName: string): string {
  if (round === 0) return "OR";
  if (round >= 25) {
    const short: Record<number, string> = { 25: "F1", 26: "SF", 27: "PF", 28: "GF" };
    return short[round] || `F${round - 24}`;
  }
  return `R${round}`;
}

function getObservationIcon(type: string) {
  switch (type) {
    case "breakout": return <TrendingUp className="w-3.5 h-3.5 text-green-500" />;
    case "bust": return <TrendingDown className="w-3.5 h-3.5 text-red-500" />;
    case "injury":
    case "sub": return <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />;
    case "tag": return <Shield className="w-3.5 h-3.5 text-orange-500" />;
    case "role_change": return <Zap className="w-3.5 h-3.5 text-blue-500" />;
    case "watch": return <Eye className="w-3.5 h-3.5 text-purple-500" />;
    default: return <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />;
  }
}

function getObservationLabel(type: string) {
  switch (type) {
    case "breakout": return "Breakout";
    case "bust": return "Bust";
    case "injury": return "Injury";
    case "sub": return "Subbed";
    case "tag": return "Tagged";
    case "role_change": return "Role Change";
    case "watch": return "Watch";
    default: return "Note";
  }
}

function getObservationBadgeColor(type: string) {
  switch (type) {
    case "breakout": return "bg-green-500/10 text-green-600 dark:text-green-400";
    case "bust": return "bg-red-500/10 text-red-600 dark:text-red-400";
    case "injury":
    case "sub": return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
    case "tag": return "bg-orange-500/10 text-orange-600 dark:text-orange-400";
    case "role_change": return "bg-blue-500/10 text-blue-600 dark:text-blue-400";
    case "watch": return "bg-purple-500/10 text-purple-600 dark:text-purple-400";
    default: return "bg-muted text-muted-foreground";
  }
}

function MatchSynopsisDialog({
  match,
  open,
  onOpenChange,
}: {
  match: Fixture;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isLoading } = useQuery<MatchSynopsis>({
    queryKey: [`/api/fixtures/${match.round}/match-synopsis?home=${encodeURIComponent(match.homeTeam)}&away=${encodeURIComponent(match.awayTeam)}`],
    enabled: open,
  });

  const homeColors = getTeamColors(match.homeTeam);
  const awayColors = getTeamColors(match.awayTeam);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto p-0" data-testid="dialog-match-synopsis">
        <div
          className="p-4 pb-3 border-b"
          style={{
            background: `linear-gradient(135deg, ${homeColors.primary}15, ${awayColors.primary}15)`,
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-base font-semibold" data-testid="text-synopsis-title">
              Fantasy Synopsis
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-2">
              <div
                className="w-9 h-9 rounded-md flex items-center justify-center text-[11px] font-bold"
                style={{ backgroundColor: homeColors.primary, color: homeColors.text }}
              >
                {getTeamAbbr(match.homeTeam)}
              </div>
              <span className="text-sm font-medium">{match.homeTeam}</span>
            </div>
            <div className="text-center px-2">
              <div className="flex items-center gap-1.5">
                <span className={`text-lg font-bold ${match.winner === match.homeTeam ? "text-foreground" : "text-muted-foreground"}`}>
                  {match.homeScore}
                </span>
                <span className="text-muted-foreground text-xs">-</span>
                <span className={`text-lg font-bold ${match.winner === match.awayTeam ? "text-foreground" : "text-muted-foreground"}`}>
                  {match.awayScore}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-right">{match.awayTeam}</span>
              <div
                className="w-9 h-9 rounded-md flex items-center justify-center text-[11px] font-bold"
                style={{ backgroundColor: awayColors.primary, color: awayColors.text }}
              >
                {getTeamAbbr(match.awayTeam)}
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {isLoading ? (
            <div className="space-y-3" data-testid="skeleton-synopsis">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Generating fantasy analysis...</span>
              </div>
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : data ? (
            <>
              <div data-testid="text-synopsis-body">
                <p className="text-sm leading-relaxed text-foreground">{data.synopsis}</p>
              </div>

              {data.topPerformers.length > 0 && (
                <div data-testid="section-top-performers">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Trophy className="w-3.5 h-3.5 text-amber-500" />
                    Top Fantasy Performers
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {data.topPerformers.map((p, i) => {
                      const teamColors = getTeamColors(p.team);
                      return (
                        <div
                          key={i}
                          className="flex items-center gap-2 p-2 rounded-md bg-muted/50"
                          data-testid={`performer-${i}`}
                        >
                          <div
                            className="w-6 h-6 rounded flex items-center justify-center text-[8px] font-bold shrink-0"
                            style={{ backgroundColor: teamColors.primary, color: teamColors.text }}
                          >
                            {getTeamAbbr(p.team)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium truncate">{p.name}</p>
                            <div className="flex items-center gap-1">
                              <span className="text-xs font-bold">{p.score}</span>
                              {p.scoreDiff !== null && (
                                <span className={`text-[10px] ${p.scoreDiff >= 0 ? "text-green-500" : "text-red-500"}`}>
                                  {p.scoreDiff >= 0 ? "+" : ""}{p.scoreDiff}
                                </span>
                              )}
                              {p.subFlag && (
                                <AlertTriangle className="w-3 h-3 text-amber-500" />
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {data.keyObservations.length > 0 && (
                <div data-testid="section-key-observations">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5" />
                    Key Observations
                  </h3>
                  <div className="space-y-2">
                    {data.keyObservations.map((obs, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 p-2 rounded-md bg-muted/50"
                        data-testid={`observation-${i}`}
                      >
                        <div className="shrink-0 mt-0.5">
                          {getObservationIcon(obs.type)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-xs font-semibold">{obs.player}</span>
                            <Badge className={`text-[9px] px-1 py-0 h-4 ${getObservationBadgeColor(obs.type)}`}>
                              {getObservationLabel(obs.type)}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-snug">{obs.observation}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.highlightsUrl && (
                <a
                  href={data.highlightsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full p-2.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-sm font-medium"
                  data-testid="link-highlights"
                >
                  <ExternalLink className="w-4 h-4" />
                  Watch Match Highlights
                </a>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              No synopsis available for this match.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MatchCard({ match, onClick }: { match: Fixture; onClick?: () => void }) {
  const homeColors = getTeamColors(match.homeTeam);
  const awayColors = getTeamColors(match.awayTeam);
  const isComplete = match.complete === 100;
  const isLive = match.complete > 0 && match.complete < 100;
  const isClickable = isComplete || isLive;

  const dateStr = (() => {
    try {
      const d = new Date(match.localTime);
      if (isNaN(d.getTime())) return match.date;
      return d.toLocaleDateString("en-AU", {
        weekday: "short",
        day: "numeric",
        month: "short",
      });
    } catch {
      return match.date;
    }
  })();

  const timeStr = (() => {
    try {
      const d = new Date(match.localTime);
      if (isNaN(d.getTime())) return "";
      return d.toLocaleTimeString("en-AU", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  })();

  return (
    <Card
      className={`overflow-hidden ${isLive ? "ring-1 ring-red-500/50" : ""} ${isClickable ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""}`}
      onClick={isClickable ? onClick : undefined}
      data-testid={`fixture-${match.id}`}
    >
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <MapPin className="w-3 h-3" />
            <span>{match.venue}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {isClickable && (
              <Badge variant="outline" className="text-[9px] gap-1" data-testid="badge-tap-synopsis">
                <Sparkles className="w-2.5 h-2.5" />
                Synopsis
              </Badge>
            )}
            {isLive && (
              <Badge className="bg-red-500 text-white text-[9px] animate-pulse" data-testid="badge-live">
                <Radio className="w-2.5 h-2.5 mr-1" />
                {match.timeStr || "Live"}
              </Badge>
            )}
            {isComplete && (
              <Badge className="bg-muted text-muted-foreground text-[9px]" data-testid="badge-complete">
                Full Time
              </Badge>
            )}
            {!isLive && !isComplete && (
              <Badge variant="outline" className="text-[9px]" data-testid="badge-upcoming">
                Upcoming
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-1">
            <div
              className="w-8 h-8 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0"
              style={{ backgroundColor: homeColors.primary, color: homeColors.text }}
            >
              {getTeamAbbr(match.homeTeam)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium hidden sm:block">{match.homeTeam}</p>
              <p className="text-sm font-medium sm:hidden">{getTeamAbbr(match.homeTeam)}</p>
            </div>
          </div>

          <div className="text-center px-2 shrink-0">
            {(isLive || isComplete) ? (
              <div className="flex items-center gap-1.5">
                <span className={`text-lg font-bold ${match.winner === match.homeTeam ? "text-foreground" : "text-muted-foreground"}`}>
                  {match.homeScore}
                </span>
                <span className="text-muted-foreground text-xs">-</span>
                <span className={`text-lg font-bold ${match.winner === match.awayTeam ? "text-foreground" : "text-muted-foreground"}`}>
                  {match.awayScore}
                </span>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-xs font-medium">{timeStr}</p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-1 justify-end">
            <div className="min-w-0 text-right">
              <p className="text-sm font-medium hidden sm:block">{match.awayTeam}</p>
              <p className="text-sm font-medium sm:hidden">{getTeamAbbr(match.awayTeam)}</p>
            </div>
            <div
              className="w-8 h-8 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0"
              style={{ backgroundColor: awayColors.primary, color: awayColors.text }}
            >
              {getTeamAbbr(match.awayTeam)}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 mt-2 text-[10px] text-muted-foreground">
          <Clock className="w-3 h-3" />
          <span>{dateStr}</span>
        </div>
      </CardContent>
    </Card>
  );
}

const BYE_ROUNDS: Record<number, string[]> = {
  12: ["Brisbane Lions", "Collingwood", "Fremantle", "Geelong", "Gold Coast", "Greater Western Sydney"],
  13: ["Adelaide", "Carlton", "Essendon", "Hawthorn", "Melbourne", "North Melbourne"],
  14: ["Port Adelaide", "Richmond", "St Kilda", "Sydney", "West Coast", "Western Bulldogs"],
};

export default function SchedulePage() {
  const { data, isLoading } = useQuery<GroupedFixtures>({
    queryKey: ["/api/fixtures"],
  });

  const rounds = useMemo(() => {
    if (!data) return [];
    return Object.keys(data)
      .map(Number)
      .sort((a, b) => a - b);
  }, [data]);

  const homeAndAwayRounds = useMemo(() => {
    return rounds.filter((r) => r <= 24);
  }, [rounds]);

  const finalsRounds = useMemo(() => {
    return rounds.filter((r) => r >= 25);
  }, [rounds]);

  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [synopsisMatch, setSynopsisMatch] = useState<Fixture | null>(null);

  const activeRound = selectedRound ?? (rounds.length > 0 ? rounds[0] : 0);
  const activeGroup = data?.[String(activeRound)];

  const prevRound = rounds[rounds.indexOf(activeRound) - 1];
  const nextRound = rounds[rounds.indexOf(activeRound) + 1];

  const byeTeams = BYE_ROUNDS[activeRound] || [];

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-4 max-w-4xl mx-auto" data-testid="page-schedule">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold">Season Schedule</h1>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-8 w-12 shrink-0" />
          ))}
        </div>
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-4xl mx-auto" data-testid="page-schedule">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold tracking-tight" data-testid="text-schedule-title">
            Season Schedule
          </h1>
        </div>
        <Badge variant="outline" className="text-xs" data-testid="badge-game-count">
          {rounds.length > 0 ? `${Object.values(data || {}).reduce((s, g) => s + g.matches.length, 0)} games` : ""}
        </Badge>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          disabled={prevRound === undefined}
          onClick={() => setSelectedRound(prevRound)}
          data-testid="button-prev-round"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>

        <ScrollArea className="flex-1">
          <div className="flex gap-1.5 pb-1">
            {homeAndAwayRounds.map((r) => {
              const group = data?.[String(r)];
              const hasLive = group?.matches.some((m) => m.complete > 0 && m.complete < 100);
              const allComplete = group?.matches.every((m) => m.complete === 100);
              return (
                <Button
                  key={r}
                  variant={activeRound === r ? "default" : "outline"}
                  size="sm"
                  className={`h-8 px-2.5 text-xs shrink-0 ${hasLive ? "ring-1 ring-red-500" : ""} ${allComplete ? "opacity-70" : ""}`}
                  onClick={() => setSelectedRound(r)}
                  data-testid={`button-round-${r}`}
                >
                  {getRoundLabel(r, group?.roundName || "")}
                </Button>
              );
            })}
            {finalsRounds.length > 0 && (
              <>
                <div className="w-px bg-border mx-1 shrink-0" />
                {finalsRounds.map((r) => {
                  const group = data?.[String(r)];
                  return (
                    <Button
                      key={r}
                      variant={activeRound === r ? "default" : "outline"}
                      size="sm"
                      className="h-8 px-2.5 text-xs shrink-0"
                      onClick={() => setSelectedRound(r)}
                      data-testid={`button-round-${r}`}
                    >
                      {getRoundLabel(r, group?.roundName || "")}
                    </Button>
                  );
                })}
              </>
            )}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          disabled={nextRound === undefined}
          onClick={() => setSelectedRound(nextRound)}
          data-testid="button-next-round"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold" data-testid="text-round-name">
          {activeGroup?.roundName || getRoundLabel(activeRound, "")}
        </h2>
        {activeGroup && (
          <Badge variant="secondary" className="text-xs">
            {activeGroup.matches.length} {activeGroup.matches.length === 1 ? "game" : "games"}
          </Badge>
        )}
      </div>

      {byeTeams.length > 0 && (
        <Card data-testid="card-bye-teams">
          <CardContent className="p-3">
            <p className="text-xs font-medium mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
              Teams on Bye
            </p>
            <div className="flex flex-wrap gap-1.5">
              {byeTeams.map((team) => {
                const colors = getTeamColors(team);
                return (
                  <Badge
                    key={team}
                    className="text-[10px] px-1.5 py-0.5"
                    style={{ backgroundColor: colors.primary, color: colors.text }}
                  >
                    {getTeamAbbr(team)}
                  </Badge>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {activeGroup ? (
        <div className="space-y-3">
          {activeGroup.matches.map((match) => (
            <MatchCard
              key={match.id}
              match={match}
              onClick={() => setSynopsisMatch(match)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground" data-testid="text-no-fixtures">
          <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No fixtures found for this round</p>
        </div>
      )}

      {activeRound === 0 && activeGroup && (
        <Card data-testid="card-opening-round-info">
          <CardContent className="p-3 flex items-start gap-2">
            <Trophy className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium">Opening Round</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                The Opening Round kicks off the AFL season. While scores don't count for AFL Fantasy Classic, they contribute to player averages and form — giving you an early edge on your analysis.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {synopsisMatch && (
        <MatchSynopsisDialog
          match={synopsisMatch}
          open={!!synopsisMatch}
          onOpenChange={(open) => {
            if (!open) setSynopsisMatch(null);
          }}
        />
      )}
    </div>
  );
}
