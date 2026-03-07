import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Calendar,
  MapPin,
  Clock,
  Trophy,
  ChevronLeft,
  ChevronRight,
  Radio,
} from "lucide-react";
import { getTeamColors, getTeamAbbr } from "@/lib/afl-teams";
import type { Fixture } from "@shared/schema";

interface FixtureGroup {
  roundName: string;
  matches: Fixture[];
}

type GroupedFixtures = Record<string, FixtureGroup>;

function getRoundLabel(round: number, roundName: string): string {
  if (round === 0) return "OR";
  if (round >= 25) {
    const short: Record<number, string> = { 25: "F1", 26: "SF", 27: "PF", 28: "GF" };
    return short[round] || `F${round - 24}`;
  }
  return `R${round}`;
}

function MatchCard({ match }: { match: Fixture }) {
  const homeColors = getTeamColors(match.homeTeam);
  const awayColors = getTeamColors(match.awayTeam);
  const isComplete = match.complete === 100;
  const isLive = match.complete > 0 && match.complete < 100;

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
      className={`overflow-hidden ${isLive ? "ring-1 ring-red-500/50" : ""}`}
      data-testid={`fixture-${match.id}`}
    >
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <MapPin className="w-3 h-3" />
            <span>{match.venue}</span>
          </div>
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
            <MatchCard key={match.id} match={match} />
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
    </div>
  );
}
