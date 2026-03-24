import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Radio, ChevronDown, ChevronUp, Crown, Shield, ArrowLeft } from "lucide-react";
import { getTeamColors, getTeamAbbr } from "@/lib/afl-teams";
import { PlayerAvatar } from "@/components/player-avatar";

interface H2HPlayerScore {
  playerId: number;
  playerName: string;
  team: string;
  position: string;
  fieldPosition: string;
  fantasyScore: number;
  projectedScore: number;
  avgScore: number;
  isCaptain: boolean;
  isViceCaptain: boolean;
  effectiveScore: number;
  matchStatus: "live" | "complete" | "upcoming" | "bye" | "dnp";
  isOnField: boolean;
  opponent: string | null;
  kicks: number;
  handballs: number;
  marks: number;
  tackles: number;
  hitouts: number;
  goals: number;
  behinds: number;
  disposals: number;
  aflFantasyId: number | null;
  selectionStatus: string;
}

interface H2HMatchupData {
  opponentName: string;
  leagueName: string;
  round: number;
  myTeam: H2HPlayerScore[];
  oppTeam: H2HPlayerScore[];
  myTotal: number;
  oppTotal: number;
  myProjected: number;
  oppProjected: number;
  myForecast: number;
  oppForecast: number;
  lastUpdated: string;
  hasActiveGames: boolean;
  suggestedPollInterval: number;
}

const POS_ORDER = ["DEF", "MID", "RUC", "FWD"];
const POS_LABELS: Record<string, string> = {
  DEF: "DEFENDERS",
  MID: "MIDFIELDERS",
  RUC: "RUCKS",
  FWD: "FORWARDS",
};

function PlayerCell({
  player,
  side,
  onPlayerClick,
}: {
  player: H2HPlayerScore | null;
  side: "left" | "right";
  onPlayerClick?: (playerId: number) => void;
}) {
  if (!player) {
    return <div className="flex-1 min-w-0 p-1.5" />;
  }

  const teamColors = getTeamColors(player.team);
  const teamAbbr = getTeamAbbr(player.team);
  const oppAbbr = player.opponent ? getTeamAbbr(player.opponent) : null;
  const isLive = player.matchStatus === "live";
  const isComplete = player.matchStatus === "complete";
  const isBye = player.matchStatus === "bye";
  const isDnp = player.matchStatus === "dnp";
  const isUpcoming = player.matchStatus === "upcoming";
  const hasScore = isLive || isComplete;

  const scoreDisplay = hasScore
    ? player.fantasyScore
    : isUpcoming
    ? ""
    : "";

  const handleClick = () => {
    if (player.playerId && player.playerId > 0 && onPlayerClick) {
      onPlayerClick(player.playerId);
    }
  };

  return (
    <div
      className={`flex-1 min-w-0 p-1 ${side === "left" ? "pr-0.5" : "pl-0.5"}`}
      data-testid={`h2h-player-${player.playerId}-${side}`}
    >
      <div
        onClick={handleClick}
        className={`rounded-lg p-1.5 relative overflow-hidden cursor-pointer active:scale-[0.98] transition-transform ${
          isDnp || isBye
            ? "bg-muted/40 opacity-60"
            : isLive
            ? "bg-green-500/10 border border-green-500/30"
            : isComplete
            ? "bg-card border border-border"
            : "bg-card border border-border/50"
        }`}
      >
        <div
          className="absolute top-0 left-0 w-1 h-full"
          style={{ backgroundColor: teamColors.primary }}
        />

        <div className={`flex items-center gap-1.5 ${side === "right" ? "flex-row-reverse" : ""}`}>
          <PlayerAvatar
            aflFantasyId={player.aflFantasyId}
            playerName={player.playerName}
            size={28}
          />

          <div className={`flex-1 min-w-0 ${side === "right" ? "text-right" : ""}`}>
            <div className="flex items-center gap-0.5" style={{ justifyContent: side === "right" ? "flex-end" : "flex-start" }}>
              {player.isCaptain && (
                <Crown className="w-3 h-3 text-yellow-500 shrink-0" />
              )}
              {player.isViceCaptain && (
                <Shield className="w-3 h-3 text-blue-400 shrink-0" />
              )}
              <span className="text-[11px] font-medium truncate leading-tight">
                {player.playerName.split(" ").pop()}
              </span>
            </div>

            <div className={`flex items-center gap-1 text-[9px] text-muted-foreground ${side === "right" ? "justify-end" : ""}`}>
              <span className="font-medium" style={{ color: teamColors.primary }}>
                {teamAbbr}
              </span>
              {oppAbbr && (
                <>
                  <span>vs</span>
                  <span>{oppAbbr}</span>
                </>
              )}
              {isBye && <span className="text-orange-400 font-medium">BYE</span>}
            </div>
          </div>

          <div className={`shrink-0 ${side === "right" ? "mr-1" : "ml-1"}`}>
            {isDnp ? (
              <Badge className="bg-red-500/20 text-red-400 text-[8px] px-1 py-0 font-bold border-0">
                DNP
              </Badge>
            ) : isBye ? (
              <Badge className="bg-orange-500/20 text-orange-400 text-[8px] px-1 py-0 font-bold border-0">
                BYE
              </Badge>
            ) : isUpcoming ? (
              <span className="text-[10px] text-muted-foreground/50">—</span>
            ) : hasScore ? (
              <div
                className={`min-w-[32px] text-center rounded px-1.5 py-0.5 text-[12px] font-bold ${
                  isLive
                    ? "bg-green-500/20 text-green-400"
                    : "bg-primary/10 text-primary"
                }`}
              >
                {isLive && <Radio className="w-2 h-2 inline mr-0.5 animate-pulse" />}
                {scoreDisplay}
              </div>
            ) : null}
          </div>
        </div>

        {!player.isOnField && !isDnp && !isBye && (
          <Badge className="absolute top-0.5 right-0.5 bg-muted text-muted-foreground text-[7px] px-1 py-0 border-0">
            BENCH
          </Badge>
        )}
      </div>
    </div>
  );
}

function PositionSection({
  position,
  label,
  myPlayers,
  oppPlayers,
  onPlayerClick,
}: {
  position: string;
  label: string;
  myPlayers: H2HPlayerScore[];
  oppPlayers: H2HPlayerScore[];
  onPlayerClick?: (playerId: number) => void;
}) {
  const maxRows = Math.max(myPlayers.length, oppPlayers.length);

  return (
    <div data-testid={`h2h-section-${position.toLowerCase()}`}>
      <div className="bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 py-1 text-center">
        <span className="text-[10px] font-bold tracking-widest text-primary uppercase">
          {label}
        </span>
      </div>

      {Array.from({ length: maxRows }).map((_, i) => (
        <div key={i} className="flex">
          <PlayerCell
            player={myPlayers[i] || null}
            side="left"
            onPlayerClick={onPlayerClick}
          />
          <PlayerCell
            player={oppPlayers[i] || null}
            side="right"
            onPlayerClick={onPlayerClick}
          />
        </div>
      ))}
    </div>
  );
}

export default function H2HMatchupView({
  opponentId,
  round,
  onBack,
}: {
  opponentId: number;
  round?: number;
  onBack: () => void;
}) {
  const [, navigate] = useLocation();
  const [pollInterval, setPollInterval] = useState(60000);

  const handlePlayerClick = (playerId: number) => {
    navigate(`/player/${playerId}`);
  };

  const roundParam = round != null ? `?round=${round}` : "";
  const { data, isLoading, isFetching } = useQuery<H2HMatchupData>({
    queryKey: ["/api/league/opponents", opponentId, "live-matchup", round],
    queryFn: async () => {
      const res = await fetch(`/api/league/opponents/${opponentId}/live-matchup${roundParam}`);
      if (!res.ok) throw new Error("Failed to fetch matchup");
      return res.json();
    },
    refetchInterval: pollInterval,
  });

  useEffect(() => {
    if (data?.suggestedPollInterval) {
      setPollInterval(data.suggestedPollInterval);
    }
  }, [data?.suggestedPollInterval]);

  if (isLoading) {
    return (
      <div className="p-4 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4 text-center">
        <p className="text-sm text-muted-foreground">No matchup data available</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
      </div>
    );
  }

  const getPositionPlayers = (team: H2HPlayerScore[], pos: string) =>
    team.filter(p => p.fieldPosition === pos && p.isOnField).sort((a, b) => b.effectiveScore - a.effectiveScore);

  const myBench = data.myTeam.filter(p => !p.isOnField);
  const oppBench = data.oppTeam.filter(p => !p.isOnField);

  const myUtil = data.myTeam.filter(p => p.fieldPosition === "UTIL" && p.isOnField);
  const oppUtil = data.oppTeam.filter(p => p.fieldPosition === "UTIL" && p.isOnField);

  const scoreDiff = data.myTotal - data.oppTotal;
  const forecastDiff = data.myForecast - data.oppForecast;

  return (
    <div className="space-y-0" data-testid="h2h-matchup-view">
      <div className="flex items-center justify-between px-3 py-2">
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onBack} data-testid="button-h2h-back">
          <ArrowLeft className="w-3.5 h-3.5 mr-1" />
          Back
        </Button>
        <div className="flex items-center gap-1.5">
          {data.hasActiveGames && (
            <Radio className="w-3 h-3 text-red-500 animate-pulse" />
          )}
          <span className="text-[10px] text-muted-foreground">
            {isFetching ? "Updating..." : `Updated ${new Date(data.lastUpdated).toLocaleTimeString()}`}
          </span>
        </div>
      </div>

      <Card className="mx-2 mb-2 overflow-hidden" data-testid="card-h2h-header">
        <CardContent className="p-0">
          <div className="flex items-stretch">
            <div className="flex-1 p-3 text-center border-r border-border/50">
              <div className="text-[10px] text-muted-foreground font-medium mb-0.5">MY TEAM</div>
              <div className={`text-3xl font-bold ${scoreDiff > 0 ? "text-green-400" : scoreDiff < 0 ? "text-red-400" : "text-primary"}`} data-testid="text-my-total">
                {data.myTotal}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                Proj: {data.myProjected} · Fcst: {data.myForecast}
              </div>
            </div>

            <div className="flex items-center px-2">
              <div className="text-center">
                <div className="text-[9px] text-muted-foreground font-medium">{data.leagueName}</div>
                <div className="text-xs font-bold text-muted-foreground my-0.5">VS</div>
                <div className="text-[9px] text-muted-foreground">Rd {data.round}</div>
              </div>
            </div>

            <div className="flex-1 p-3 text-center border-l border-border/50">
              <div className="text-[10px] text-muted-foreground font-medium mb-0.5 truncate">{data.opponentName.toUpperCase()}</div>
              <div className={`text-3xl font-bold ${scoreDiff < 0 ? "text-green-400" : scoreDiff > 0 ? "text-red-400" : "text-primary"}`} data-testid="text-opp-total">
                {data.oppTotal}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                Proj: {data.oppProjected} · Fcst: {data.oppForecast}
              </div>
            </div>
          </div>

          <div className={`text-center py-1.5 text-[11px] font-bold border-t border-border/50 ${
            forecastDiff > 0 ? "bg-green-500/10 text-green-400" : forecastDiff < 0 ? "bg-red-500/10 text-red-400" : "bg-muted/30 text-muted-foreground"
          }`} data-testid="text-forecast-diff">
            {forecastDiff > 0 ? `▲ Forecast +${forecastDiff}` : forecastDiff < 0 ? `▼ Forecast ${forecastDiff}` : "Forecast: Level"}
          </div>
        </CardContent>
      </Card>

      <div className="mx-2 rounded-lg border border-border overflow-hidden bg-card" data-testid="card-h2h-players">
        <div className="flex bg-muted/30 border-b border-border">
          <div className="flex-1 text-center py-1">
            <span className="text-[9px] font-bold text-muted-foreground tracking-wider">MY TEAM</span>
          </div>
          <div className="flex-1 text-center py-1">
            <span className="text-[9px] font-bold text-muted-foreground tracking-wider">{data.opponentName.toUpperCase().slice(0, 15)}</span>
          </div>
        </div>

        {POS_ORDER.map(pos => (
          <PositionSection
            key={pos}
            position={pos}
            label={POS_LABELS[pos]}
            myPlayers={getPositionPlayers(data.myTeam, pos)}
            oppPlayers={getPositionPlayers(data.oppTeam, pos)}
            onPlayerClick={handlePlayerClick}
          />
        ))}

        {(myBench.length > 0 || oppBench.length > 0) && (
          <PositionSection
            position="bench"
            label="Bench"
            myPlayers={myBench}
            oppPlayers={oppBench}
            onPlayerClick={handlePlayerClick}
          />
        )}

        {(myUtil.length > 0 || oppUtil.length > 0) && (
          <PositionSection
            position="util"
            label="UTILITY"
            myPlayers={myUtil}
            oppPlayers={oppUtil}
            onPlayerClick={handlePlayerClick}
          />
        )}
      </div>

      <div className="px-2 py-1.5 text-center">
        <span className="text-[9px] text-muted-foreground">
          Auto-refreshing every {Math.round(pollInterval / 1000)}s
          {data.hasActiveGames && " · Live games detected"}
        </span>
      </div>
    </div>
  );
}
