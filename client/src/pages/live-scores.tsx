import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, RefreshCw, Trophy, Clock, Radio, ChevronDown, ChevronUp, Edit3, Zap, Star, Info } from "lucide-react";
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
}

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

function QuickScoreEntry({ player, round, onClose }: { player: LivePlayerScore; round: number; onClose: () => void }) {
  const { toast } = useToast();
  const [score, setScore] = useState(String(player.fantasyScore || ""));

  const updateMutation = useMutation({
    mutationFn: async () => {
      const numScore = parseInt(score);
      if (isNaN(numScore)) throw new Error("Invalid score");
      return apiRequest("POST", "/api/live-scores/bulk-update", {
        round,
        scores: [{ playerId: player.playerId, fantasyScore: numScore }],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/live-scores"] });
      toast({ title: "Score updated", description: `${player.playerName}: ${score} pts` });
      onClose();
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  return (
    <div className="flex items-center gap-2" data-testid={`quick-score-${player.playerId}`}>
      <Input
        type="number"
        value={score}
        onChange={(e) => setScore(e.target.value)}
        className="w-20 h-8 text-sm"
        placeholder="Score"
        data-testid={`input-score-${player.playerId}`}
        onKeyDown={(e) => { if (e.key === "Enter") updateMutation.mutate(); }}
      />
      <Button
        size="sm"
        variant="default"
        className="h-8 text-xs"
        onClick={() => updateMutation.mutate()}
        disabled={updateMutation.isPending}
        data-testid={`button-save-score-${player.playerId}`}
      >
        {updateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
      </Button>
    </div>
  );
}

function PlayerScoreRow({ player, round, expanded, onToggle }: {
  player: LivePlayerScore;
  round: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [editing, setEditing] = useState(false);
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
            <span className="text-sm font-medium">{player.playerName}</span>
            {player.isCaptain && <Badge className="text-[8px] px-1 py-0 bg-accent text-accent-foreground">C</Badge>}
            {player.isViceCaptain && <Badge variant="outline" className="text-[8px] px-1 py-0">VC</Badge>}
          </div>
          <span className="text-[10px] text-muted-foreground">{player.position} • {getTeamAbbr(player.team)}</span>
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

          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={(e) => { e.stopPropagation(); setEditing(!editing); }}
            data-testid={`button-edit-score-${player.playerId}`}
          >
            <Edit3 className="w-3 h-3" />
          </Button>

          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
        </div>
      </div>

      {editing && (
        <div className="px-3 pb-2">
          <QuickScoreEntry player={player} round={round} onClose={() => setEditing(false)} />
        </div>
      )}

      {expanded && !editing && (
        <div className="px-3 pb-2">
          {player.disposals > 0 || player.marks > 0 || player.tackles > 0 || player.hitouts > 0 ? (
            <div className="grid grid-cols-4 gap-1.5 text-[10px]">
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
              {player.fantasyScore > 0 ? "Score entered manually — stat breakdown not available" : "No stats recorded yet"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function BulkScoreDialog({ players, round }: { players: LivePlayerScore[]; round: number }) {
  const { toast } = useToast();
  const [scores, setScores] = useState<Record<number, string>>(() => {
    const initial: Record<number, string> = {};
    players.forEach((p) => { initial[p.playerId] = String(p.fantasyScore || ""); });
    return initial;
  });
  const [open, setOpen] = useState(false);

  const bulkMutation = useMutation({
    mutationFn: async () => {
      const scoreEntries = Object.entries(scores)
        .filter(([, v]) => v !== "" && !isNaN(parseInt(v)))
        .map(([id, v]) => ({ playerId: parseInt(id), fantasyScore: parseInt(v) }));
      if (scoreEntries.length === 0) throw new Error("No scores to update");
      return apiRequest("POST", "/api/live-scores/bulk-update", { round, scores: scoreEntries });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/live-scores"] });
      toast({ title: "Scores updated", description: `Updated ${Object.keys(scores).length} players` });
      setOpen(false);
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5 text-xs" data-testid="button-bulk-scores">
          <Edit3 className="w-3.5 h-3.5" />
          Enter Scores
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Enter Live Scores — Round {round}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground mb-3">
          Enter fantasy scores from the AFL Fantasy app. Leave blank to skip a player.
        </p>
        <div className="space-y-2">
          {players.map((p) => (
            <div key={p.playerId} className="flex items-center gap-2" data-testid={`bulk-row-${p.playerId}`}>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium block">{p.playerName}</span>
                <span className="text-[10px] text-muted-foreground">{p.position} • {getTeamAbbr(p.team)}</span>
              </div>
              <Input
                type="number"
                value={scores[p.playerId] || ""}
                onChange={(e) => setScores((prev) => ({ ...prev, [p.playerId]: e.target.value }))}
                className="w-20 h-8 text-sm text-right"
                placeholder="—"
                data-testid={`input-bulk-score-${p.playerId}`}
              />
            </div>
          ))}
        </div>
        <Button
          className="w-full mt-3 gap-1.5"
          onClick={() => bulkMutation.mutate()}
          disabled={bulkMutation.isPending}
          data-testid="button-save-bulk-scores"
        >
          {bulkMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          {bulkMutation.isPending ? "Saving..." : "Save All Scores"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export default function LiveScoresPage() {
  const [expandedPlayer, setExpandedPlayer] = useState<number | null>(null);
  const [expandedMatch, setExpandedMatch] = useState<number | null>(null);

  const { data, isLoading, isFetching } = useQuery<LiveRoundData>({
    queryKey: ["/api/live-scores"],
    refetchInterval: 60000,
  });

  const { toast } = useToast();

  const refreshMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("GET", "/api/live-scores");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/live-scores"] });
      toast({ title: "Scores refreshed", description: "Latest match data loaded" });
    },
    onError: (e: any) => {
      toast({ title: "Refresh failed", description: e.message, variant: "destructive" });
    },
  });

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

  const sortedPlayers = [...(data?.myTeamScores || [])].sort((a, b) => b.effectiveScore - a.effectiveScore);

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
            Round {data?.round != null ? data.round : "—"}
            {data?.lastUpdated && ` • Updated ${new Date(data.lastUpdated).toLocaleTimeString()}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data?.myTeamScores && data.myTeamScores.length > 0 && (
            <BulkScoreDialog players={data.myTeamScores} round={data.round} />
          )}
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending || isFetching}
            data-testid="button-refresh-scores"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${(refreshMutation.isPending || isFetching) ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
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
              <p className="text-xs font-medium">Pre-Season — Round 0</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                The season hasn't started yet, so all scores are zero. Click any match to see the full squad list for both teams. Once Round 1 begins, live fantasy scores will appear here.
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
                  round={data?.round ?? 0}
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
                  round={data?.round ?? 0}
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
                  round={data?.round ?? 0}
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
              <span className="text-xs text-muted-foreground font-normal">
                {sortedPlayers.length} players
              </span>
            </CardTitle>
          </CardHeader>
          <div>
            {sortedPlayers.map((p) => (
              <PlayerScoreRow
                key={p.playerId}
                player={p}
                round={data?.round != null ? data.round : 1}
                expanded={expandedPlayer === p.playerId}
                onToggle={() => setExpandedPlayer(expandedPlayer === p.playerId ? null : p.playerId)}
              />
            ))}
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
