import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Trophy, Clock, Radio, ChevronDown, ChevronUp, Star, Info, ChevronLeft, ChevronRight, Download, LayoutGrid, List } from "lucide-react";
import { getTeamColors, getTeamAbbr } from "@/lib/afl-teams";
import { useToast } from "@/hooks/use-toast";
import { PlayerAvatar } from "@/components/player-avatar";

interface MatchStatus {
  id: number;
  homeTeam: string;
  awayTeam: string;
  venue: string;
  date: string;
  localTime: string;
  homeScore: number | null;
  awayScore: number | null;
  complete: number;
  winner: string | null;
  timeStr: string | null;
  roundName: string;
}

interface LivePlayerScore {
  playerId: number;
  playerName: string;
  team: string;
  position: string;
  fantasyScore: number;
  kicks: number;
  handballs: number;
  marks: number;
  tackles: number;
  hitouts: number;
  goals: number;
  behinds: number;
  freesAgainst: number;
  disposals: number;
  isOnMyTeam: boolean;
  isCaptain: boolean;
  isViceCaptain: boolean;
  effectiveScore: number;
  timeOnGround: number | null;
  matchStatus: string;
  aflFantasyId: number | null;
  isOnField: boolean;
  selectionStatus: string;
  fieldPosition: string;
}

type ScoreViewMode = "combined" | "position";

interface LiveRoundData {
  round: number;
  matches: MatchStatus[];
  myTeamScores: LivePlayerScore[];
  totalTeamScore: number;
  projectedTeamScore: number;
  lastUpdated: string;
}

function MatchStatusBadge({ complete, timeStr }: { complete: number; timeStr: string | null }) {
  if (complete === 100) {
    return <Badge className="bg-muted text-muted-foreground text-[10px]" data-testid="badge-match-complete">Final</Badge>;
  }
  if (complete > 0) {
    return (
      <Badge className="bg-red-500 text-white text-[10px] animate-pulse" data-testid="badge-match-live">
        <Radio className="w-2.5 h-2.5 mr-1" />
        {timeStr || "Live"}
      </Badge>
    );
  }
  return <Badge variant="outline" className="text-[10px]" data-testid="badge-match-upcoming">Upcoming</Badge>;
}

function MatchPlayerRow({ player }: { player: LivePlayerScore }) {
  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 ${player.isOnMyTeam ? "bg-primary/5" : ""}`}
      data-testid={`match-player-${player.playerId}`}
    >
      <PlayerAvatar
        aflFantasyId={player.aflFantasyId}
        playerName={player.playerName}
        team={player.team}
        size="xs"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 flex-wrap">
          <span className={`text-xs font-medium ${player.isOnMyTeam ? "text-primary" : ""}`}>{player.playerName}</span>
          {player.isOnMyTeam && <Star className="w-2.5 h-2.5 text-primary fill-primary" />}
          {player.isCaptain && <Badge className="text-[7px] px-0.5 py-0 bg-accent text-accent-foreground">C</Badge>}
          {player.isViceCaptain && <Badge variant="outline" className="text-[7px] px-0.5 py-0">VC</Badge>}
        </div>
        <span className="text-[9px] text-muted-foreground">{player.position}</span>
      </div>
      <div className="text-right shrink-0">
        <div className="text-xs font-bold" data-testid={`match-player-score-${player.playerId}`}>
          {player.fantasyScore}
        </div>
        {player.isCaptain && player.fantasyScore > 0 && (
          <div className="text-[9px] text-accent font-semibold">{player.effectiveScore} eff</div>
        )}
      </div>
    </div>
  );
}

function MatchPlayersPanel({ match, round, myPlayers }: { match: MatchStatus; round: number; myPlayers: LivePlayerScore[] }) {
  const { data: allPlayers, isLoading } = useQuery<LivePlayerScore[]>({
    queryKey: ["/api/live-scores/match-players", match.homeTeam, match.awayTeam, round],
    queryFn: async () => {
      const params = new URLSearchParams({
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        round: String(round),
      });
      const res = await fetch(`/api/live-scores/match-players?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch match players");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const players = allPlayers || [];
  const homePlayers = players
    .filter((p) => p.team === match.homeTeam)
    .sort((a, b) => b.fantasyScore - a.fantasyScore);
  const awayPlayers = players
    .filter((p) => p.team === match.awayTeam)
    .sort((a, b) => b.fantasyScore - a.fantasyScore);

  const myMatchPlayers = myPlayers.filter(
    (p) => p.team === match.homeTeam || p.team === match.awayTeam
  );
  const myMatchTotal = myMatchPlayers.reduce((sum, p) => sum + p.effectiveScore, 0);

  const homeColors = getTeamColors(match.homeTeam);
  const awayColors = getTeamColors(match.awayTeam);

  return (
    <div data-testid={`match-players-${match.id}`}>
      {myMatchPlayers.length > 0 && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-primary/5 border-b">
          <span className="text-[10px] font-medium flex items-center gap-1">
            <Star className="w-2.5 h-2.5 text-primary fill-primary" />
            My Players in Match: {myMatchPlayers.length}
          </span>
          <span className="text-xs font-bold" data-testid={`text-match-total-${match.id}`}>{myMatchTotal} pts</span>
        </div>
      )}

      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b bg-muted/30">
        <div
          className="w-4 h-4 rounded flex items-center justify-center text-[7px] font-bold shrink-0"
          style={{ backgroundColor: homeColors.primary, color: homeColors.text }}
        >
          {getTeamAbbr(match.homeTeam).substring(0, 2)}
        </div>
        <span className="text-[10px] font-bold">{match.homeTeam}</span>
        <span className="text-[10px] text-muted-foreground">({homePlayers.length})</span>
      </div>
      <div className="py-0.5">
        {homePlayers.length > 0 ? (
          homePlayers.map((p) => <MatchPlayerRow key={p.playerId} player={p} />)
        ) : (
          <p className="text-[10px] text-muted-foreground text-center py-2">No players found</p>
        )}
      </div>

      <div className="flex items-center gap-1.5 px-3 py-1.5 border-t border-b bg-muted/30">
        <div
          className="w-4 h-4 rounded flex items-center justify-center text-[7px] font-bold shrink-0"
          style={{ backgroundColor: awayColors.primary, color: awayColors.text }}
        >
          {getTeamAbbr(match.awayTeam).substring(0, 2)}
        </div>
        <span className="text-[10px] font-bold">{match.awayTeam}</span>
        <span className="text-[10px] text-muted-foreground">({awayPlayers.length})</span>
      </div>
      <div className="py-0.5">
        {awayPlayers.length > 0 ? (
          awayPlayers.map((p) => <MatchPlayerRow key={p.playerId} player={p} />)
        ) : (
          <p className="text-[10px] text-muted-foreground text-center py-2">No players found</p>
        )}
      </div>
    </div>
  );
}

function MatchCard({ match, myPlayers, expanded, onToggle, round }: {
  match: MatchStatus;
  myPlayers: LivePlayerScore[];
  expanded: boolean;
  onToggle: () => void;
  round: number;
}) {
  const homeColors = getTeamColors(match.homeTeam);
  const awayColors = getTeamColors(match.awayTeam);
  const isLive = match.complete > 0 && match.complete < 100;
  const isComplete = match.complete === 100;

  const myMatchPlayers = myPlayers.filter(
    (p) => p.team === match.homeTeam || p.team === match.awayTeam
  );
  const hasMyPlayers = myMatchPlayers.length > 0;

  return (
    <Card
      className={`overflow-visible ${isLive ? "ring-1 ring-red-500/50" : ""} cursor-pointer hover-elevate`}
      data-testid={`card-match-${match.id}`}
      onClick={onToggle}
    >
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-muted-foreground">{match.venue}</span>
          <div className="flex items-center gap-1.5">
            {hasMyPlayers && (
              <Badge variant="outline" className="text-[9px]" data-testid={`badge-player-count-${match.id}`}>
                <Star className="w-2 h-2 mr-0.5 fill-current" />
                {myMatchPlayers.length}
              </Badge>
            )}
            <MatchStatusBadge complete={match.complete} timeStr={match.timeStr} />
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
            <span className="text-sm font-medium hidden sm:inline">{match.homeTeam}</span>
            <span className="text-sm font-medium sm:hidden">{getTeamAbbr(match.homeTeam)}</span>
          </div>

          <div className="text-center px-2">
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
              <span className="text-xs text-muted-foreground">
                {(() => {
                  try {
                    const d = new Date(match.localTime);
                    return isNaN(d.getTime()) ? match.date || "TBD" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                  } catch { return match.date || "TBD"; }
                })()}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-1 justify-end">
            <span className="text-sm font-medium text-right hidden sm:inline">{match.awayTeam}</span>
            <span className="text-sm font-medium text-right sm:hidden">{getTeamAbbr(match.awayTeam)}</span>
            <div
              className="w-8 h-8 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0"
              style={{ backgroundColor: awayColors.primary, color: awayColors.text }}
            >
              {getTeamAbbr(match.awayTeam)}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end mt-1.5 gap-1">
          <span className="text-[10px] text-muted-foreground">
            {expanded ? "Hide" : "Show"} all players
          </span>
          {expanded ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
        </div>
      </CardContent>

      {expanded && (
        <div className="border-t" onClick={(e) => e.stopPropagation()}>
          <MatchPlayersPanel match={match} round={round} myPlayers={myPlayers} />
        </div>
      )}
    </Card>
  );
}

function PlayerScoreRow({ player, round, expanded, onToggle }: {
  player: LivePlayerScore;
  round: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const teamColors = getTeamColors(player.team);

  return (
    <div className={`border-b last:border-b-0 ${player.matchStatus === "live" ? "bg-red-50/30 dark:bg-red-950/10" : ""}`}>
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={onToggle}
        data-testid={`row-player-${player.playerId}`}
      >
        <div
          className="w-6 h-6 rounded flex items-center justify-center text-[9px] font-bold shrink-0"
          style={{ backgroundColor: teamColors.primary, color: teamColors.text }}
        >
          {getTeamAbbr(player.team)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className={`text-sm font-medium ${!player.isOnField ? "text-muted-foreground" : ""}`}>{player.playerName}</span>
            {player.isCaptain && <Badge className="text-[8px] px-1 py-0 bg-accent text-accent-foreground">C</Badge>}
            {player.isViceCaptain && <Badge variant="outline" className="text-[8px] px-1 py-0">VC</Badge>}
            {!player.isOnField && <Badge variant="outline" className="text-[8px] px-1 py-0 opacity-60">BENCH</Badge>}
          </div>
          <span className="text-[10px] text-muted-foreground">{player.fieldPosition || player.position} • {getTeamAbbr(player.team)}</span>
        </div>

        <div className="flex items-center gap-2">
          {player.matchStatus === "live" && (
            <Radio className="w-3 h-3 text-red-500 animate-pulse" />
          )}
          <div className="text-right">
            <div className="text-sm font-bold" data-testid={`text-score-${player.playerId}`}>
              {player.fantasyScore}
            </div>
            {player.isCaptain && player.fantasyScore > 0 && (
              <div className="text-[10px] text-accent font-semibold">{player.effectiveScore} eff</div>
            )}
          </div>

          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-2">
          {player.disposals > 0 || player.marks > 0 || player.tackles > 0 || player.hitouts > 0 ? (
            <div className="grid grid-cols-4 sm:grid-cols-4 gap-1 sm:gap-1.5 text-[10px]">
              <div className="bg-muted/50 rounded px-2 py-1 text-center">
                <div className="font-bold">{player.kicks}</div>
                <div className="text-muted-foreground">Kicks</div>
              </div>
              <div className="bg-muted/50 rounded px-2 py-1 text-center">
                <div className="font-bold">{player.handballs}</div>
                <div className="text-muted-foreground">HB</div>
              </div>
              <div className="bg-muted/50 rounded px-2 py-1 text-center">
                <div className="font-bold">{player.marks}</div>
                <div className="text-muted-foreground">Marks</div>
              </div>
              <div className="bg-muted/50 rounded px-2 py-1 text-center">
                <div className="font-bold">{player.tackles}</div>
                <div className="text-muted-foreground">Tackles</div>
              </div>
              <div className="bg-muted/50 rounded px-2 py-1 text-center">
                <div className="font-bold">{player.disposals}</div>
                <div className="text-muted-foreground">Disp</div>
              </div>
              <div className="bg-muted/50 rounded px-2 py-1 text-center">
                <div className="font-bold">{player.hitouts}</div>
                <div className="text-muted-foreground">HO</div>
              </div>
              <div className="bg-muted/50 rounded px-2 py-1 text-center">
                <div className="font-bold">{player.goals}</div>
                <div className="text-muted-foreground">Goals</div>
              </div>
              <div className="bg-muted/50 rounded px-2 py-1 text-center">
                <div className="font-bold">{player.behinds}</div>
                <div className="text-muted-foreground">Behinds</div>
              </div>
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground text-center py-1">
              No stats recorded yet
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function getRoundLabel(round: number): string {
  if (round === 0) return "Opening Round";
  return `Round ${round}`;
}

export default function LiveScoresPage() {
  const [expandedPlayer, setExpandedPlayer] = useState<number | null>(null);
  const [expandedMatch, setExpandedMatch] = useState<number | null>(null);
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [scoreViewMode, setScoreViewMode] = useState<ScoreViewMode>("combined");

  const roundParam = selectedRound !== null ? `?round=${selectedRound}` : "";

  const { data, isLoading, isFetching } = useQuery<LiveRoundData>({
    queryKey: ["/api/live-scores", selectedRound],
    queryFn: async () => {
      const res = await fetch(`/api/live-scores${roundParam}`);
      if (!res.ok) throw new Error("Failed to fetch live scores");
      return res.json();
    },
    refetchInterval: 60000,
  });

  const { toast } = useToast();

  const currentRound = data?.round ?? selectedRound ?? 0;

  const refreshMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("GET", `/api/live-scores${roundParam}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/live-scores", selectedRound] });
      toast({ title: "Scores refreshed", description: "Latest match data loaded" });
    },
    onError: (e: any) => {
      toast({ title: "Refresh failed", description: e.message, variant: "destructive" });
    },
  });

  const fetchScoresMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/live-scores/fetch-scores", { round: currentRound });
    },
    onSuccess: async (res: any) => {
      const result = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/live-scores", selectedRound] });
      if (result.updated > 0) {
        toast({ title: "Scores fetched", description: `Updated ${result.updated} player scores` });
      } else {
        toast({ title: "No new scores", description: "No player stats found for this round yet" });
      }
    },
    onError: () => {
      toast({ title: "No new scores", description: "Could not fetch scores right now — try again later" });
    },
  });

  const handlePrevRound = () => {
    const newRound = Math.max(0, currentRound - 1);
    setSelectedRound(newRound);
    setExpandedMatch(null);
    setExpandedPlayer(null);
  };

  const handleNextRound = () => {
    const newRound = Math.min(24, currentRound + 1);
    setSelectedRound(newRound);
    setExpandedMatch(null);
    setExpandedPlayer(null);
  };

  if (isLoading) {
    return (
      <div className="p-4 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const liveMatches = data?.matches.filter((m) => m.complete > 0 && m.complete < 100) || [];
  const upcomingMatches = data?.matches.filter((m) => m.complete === 0) || [];
  const completedMatches = data?.matches.filter((m) => m.complete === 100) || [];

  const selectedPlayers = (data?.myTeamScores || []).filter(
    p => p.selectionStatus !== "omitted"
  );
  const sortedPlayers = [...selectedPlayers].sort((a, b) => b.effectiveScore - a.effectiveScore);

  const liveCount = liveMatches.length;
  const hasLiveGames = liveCount > 0;

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight" data-testid="text-live-title">
            {hasLiveGames ? (
              <span className="flex items-center gap-2">
                <Radio className="w-5 h-5 text-red-500 animate-pulse" />
                Live Scores
              </span>
            ) : (
              "Live Scores"
            )}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {data?.lastUpdated && `Updated ${new Date(data.lastUpdated).toLocaleTimeString()}`}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="gap-1 text-xs h-8 px-2"
            onClick={() => fetchScoresMutation.mutate()}
            disabled={fetchScoresMutation.isPending}
            data-testid="button-fetch-scores"
            title="Fetch player scores from Squiggle API"
          >
            {fetchScoresMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">Fetch</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1 text-xs h-8 px-2"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending || isFetching}
            data-testid="button-refresh-scores"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${(refreshMutation.isPending || isFetching) ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-center gap-3" data-testid="round-navigator">
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0"
          onClick={handlePrevRound}
          disabled={currentRound <= 0}
          data-testid="button-prev-round"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm font-bold min-w-[130px] text-center" data-testid="text-current-round">
          {getRoundLabel(currentRound)}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0"
          onClick={handleNextRound}
          disabled={currentRound >= 24}
          data-testid="button-next-round"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card data-testid="card-team-total">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-primary" data-testid="text-total-score">
              {Math.round(data?.totalTeamScore || 0)}
            </div>
            <div className="text-[10px] text-muted-foreground font-medium">TEAM SCORE</div>
          </CardContent>
        </Card>
        <Card data-testid="card-projected-total">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-muted-foreground" data-testid="text-projected-score">
              {Math.round(data?.projectedTeamScore || 0)}
            </div>
            <div className="text-[10px] text-muted-foreground font-medium">PROJECTED</div>
          </CardContent>
        </Card>
      </div>

      {data?.round === 0 && (
        <Card data-testid="card-preseason-notice">
          <CardContent className="p-3 flex items-start gap-2">
            <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium">Opening Round</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Opening Round scores don't count for AFL Fantasy Classic, but they contribute to player averages and overall form. Track scores here to get a head start on your analysis. Click any match to see the full squad list.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {(liveMatches.length > 0 || upcomingMatches.length > 0 || completedMatches.length > 0) && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold tracking-tight flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-muted-foreground" />
            Matches ({data?.matches.length || 0})
          </h2>

          {liveMatches.length > 0 && (
            <div className="space-y-2">
              {liveMatches.map((m) => (
                <MatchCard
                  key={m.id}
                  match={m}
                  myPlayers={data?.myTeamScores || []}
                  expanded={expandedMatch === m.id}
                  onToggle={() => setExpandedMatch(expandedMatch === m.id ? null : m.id)}
                  round={currentRound}
                />
              ))}
            </div>
          )}

          {upcomingMatches.length > 0 && (
            <div className="space-y-2">
              {upcomingMatches.map((m) => (
                <MatchCard
                  key={m.id}
                  match={m}
                  myPlayers={data?.myTeamScores || []}
                  expanded={expandedMatch === m.id}
                  onToggle={() => setExpandedMatch(expandedMatch === m.id ? null : m.id)}
                  round={currentRound}
                />
              ))}
            </div>
          )}

          {completedMatches.length > 0 && (
            <div className="space-y-2">
              {completedMatches.map((m) => (
                <MatchCard
                  key={m.id}
                  match={m}
                  myPlayers={data?.myTeamScores || []}
                  expanded={expandedMatch === m.id}
                  onToggle={() => setExpandedMatch(expandedMatch === m.id ? null : m.id)}
                  round={currentRound}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {sortedPlayers.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader className="py-2 px-3 border-b">
            <CardTitle className="text-sm font-bold flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Trophy className="w-4 h-4 text-accent" />
                My Team Scores
              </span>
              <div className="flex items-center gap-1.5">
                <div className="flex items-center gap-0.5 bg-muted rounded-md p-0.5">
                  <Button
                    size="sm"
                    variant={scoreViewMode === "combined" ? "default" : "ghost"}
                    className="gap-1 text-[10px] h-6 px-2 font-normal"
                    onClick={() => setScoreViewMode("combined")}
                    data-testid="button-score-combined"
                  >
                    <List className="w-3 h-3" />
                    By Score
                  </Button>
                  <Button
                    size="sm"
                    variant={scoreViewMode === "position" ? "default" : "ghost"}
                    className="gap-1 text-[10px] h-6 px-2 font-normal"
                    onClick={() => setScoreViewMode("position")}
                    data-testid="button-score-position"
                  >
                    <LayoutGrid className="w-3 h-3" />
                    By Position
                  </Button>
                </div>
                <span className="text-[10px] text-muted-foreground font-normal">
                  {sortedPlayers.filter(p => p.isOnField).length} on-field
                </span>
              </div>
            </CardTitle>
          </CardHeader>
          <div>
            {scoreViewMode === "combined" ? (
              sortedPlayers.map((p) => (
                <PlayerScoreRow
                  key={p.playerId}
                  player={p}
                  round={currentRound}
                  expanded={expandedPlayer === p.playerId}
                  onToggle={() => setExpandedPlayer(expandedPlayer === p.playerId ? null : p.playerId)}
                />
              ))
            ) : (
              ["DEF", "MID", "RUC", "FWD", "UTIL"].map((pos) => {
                const posPlayers = sortedPlayers.filter(p => p.fieldPosition === pos);
                if (posPlayers.length === 0) return null;
                const posLabels: Record<string, string> = { DEF: "Defenders", MID: "Midfielders", RUC: "Rucks", FWD: "Forwards", UTIL: "Utility" };
                return (
                  <div key={pos}>
                    <div className="px-3 py-1.5 bg-muted/40 border-b border-t" data-testid={`group-${pos.toLowerCase()}`}>
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        {posLabels[pos] || pos} ({posPlayers.length})
                      </span>
                    </div>
                    {posPlayers.map((p) => (
                      <PlayerScoreRow
                        key={p.playerId}
                        player={p}
                        round={currentRound}
                        expanded={expandedPlayer === p.playerId}
                        onToggle={() => setExpandedPlayer(expandedPlayer === p.playerId ? null : p.playerId)}
                      />
                    ))}
                  </div>
                );
              })
            )}
          </div>
        </Card>
      )}

      {sortedPlayers.length === 0 && !isLoading && (
        <Card>
          <CardContent className="p-6 text-center">
            <Trophy className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm font-medium">No team players found</p>
            <p className="text-xs text-muted-foreground mt-1">Set up your team first to track live scores</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
