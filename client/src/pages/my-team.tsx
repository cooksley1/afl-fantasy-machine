import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Crown,
  Shield,
  UserMinus,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Brain,
  ChevronRight,
  Zap,
  Target,
  Star,
  Loader2,
  LayoutGrid,
  List,
  MoreVertical,
  SlidersHorizontal,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { getTeamColors, getTeamAbbr } from "@/lib/afl-teams";
import type { PlayerWithTeamInfo, LeagueSettings } from "@shared/schema";

type StatKey = "avg" | "l3" | "be" | "proj" | "priceChange" | "price";

const STAT_OPTIONS: { key: StatKey; label: string; shortLabel: string }[] = [
  { key: "price", label: "Price", shortLabel: "PRC" },
  { key: "avg", label: "Season Average", shortLabel: "AVG" },
  { key: "l3", label: "Last 3 Average", shortLabel: "L3" },
  { key: "be", label: "Breakeven", shortLabel: "BE" },
  { key: "proj", label: "Projected Score", shortLabel: "PROJ" },
  { key: "priceChange", label: "Price Change", shortLabel: "+/-" },
];

const DEFAULT_VISIBLE_STATS: StatKey[] = ["price", "avg", "be"];

interface PlayerAdvice {
  name: string;
  playerId: number;
  action: string;
  captaincy: string;
  reasoning: string;
  formAnalysis: string;
  priceOutlook: string;
  riskLevel: string;
  priority: number;
}

interface TeamAnalysisResult {
  overallRating: number;
  summary: string;
  strengthAreas: string[];
  weaknessAreas: string[];
  playerAdvice: PlayerAdvice[];
  urgentActions: string[];
  byeRiskSummary: string;
  captainStrategy: string;
}

function formatPrice(price: number): string {
  if (price >= 1000000) return `$${(price / 1000000).toFixed(3)}M`;
  return `$${(price / 1000).toFixed(0)}k`;
}

function positionLabel(pos: string): string {
  const map: Record<string, string> = {
    DEF: "DEFENDERS",
    MID: "MIDFIELDERS",
    RUC: "RUCKS",
    FWD: "FORWARDS",
    UTIL: "UTILITY",
  };
  return map[pos] || pos;
}

function getInitials(name: string): string {
  const parts = name.split(" ");
  if (parts.length >= 2) return `${parts[0][0]}. ${parts[parts.length - 1]}`;
  return name;
}

function getPositionDisplay(player: PlayerWithTeamInfo): string {
  if (player.dualPosition) {
    const primary = player.position?.slice(0, 1) || "";
    const dual = player.dualPosition?.slice(0, 1) || "";
    return `${primary}/${dual}`;
  }
  return player.position?.slice(0, 3) || "";
}

function FormBadge({ trend }: { trend: string }) {
  if (trend === "up")
    return (
      <Badge variant="default" className="bg-green-600 dark:bg-green-700 text-white text-[10px]">
        <TrendingUp className="w-3 h-3 mr-1" /> Hot
      </Badge>
    );
  if (trend === "down")
    return (
      <Badge variant="destructive" className="text-[10px]">
        <TrendingDown className="w-3 h-3 mr-1" /> Cold
      </Badge>
    );
  return (
    <Badge variant="secondary" className="text-[10px]">
      <Minus className="w-3 h-3 mr-1" /> Steady
    </Badge>
  );
}

function ActionBadge({ action }: { action: string }) {
  const config: Record<string, { label: string; className: string }> = {
    must_have: { label: "Must Have", className: "bg-green-600 text-white" },
    keep: { label: "Keep", className: "bg-blue-600 text-white" },
    monitor: { label: "Monitor", className: "bg-yellow-600 text-white" },
    trade: { label: "Trade", className: "bg-orange-600 text-white" },
    sell: { label: "Sell", className: "bg-red-600 text-white" },
    buy: { label: "Buy", className: "bg-emerald-600 text-white" },
  };
  const c = config[action] || config.monitor;
  return <Badge className={`${c.className} text-[10px]`}>{c.label}</Badge>;
}

function CaptaincyBadge({ captaincy }: { captaincy: string }) {
  if (captaincy === "captain") return <Badge className="bg-amber-500 text-white text-[10px]"><Crown className="w-3 h-3 mr-0.5" /> Capt</Badge>;
  if (captaincy === "vice_captain") return <Badge className="bg-purple-500 text-white text-[10px]"><Shield className="w-3 h-3 mr-0.5" /> VC</Badge>;
  if (captaincy === "loophole_vc") return <Badge className="bg-indigo-500 text-white text-[10px]"><Target className="w-3 h-3 mr-0.5" /> Loop VC</Badge>;
  return null;
}

function getStatValue(player: PlayerWithTeamInfo, key: StatKey): string {
  switch (key) {
    case "price": return formatPrice(player.price);
    case "avg": return player.avgScore?.toFixed(1) || "0.0";
    case "l3": return player.last3Avg ? Math.round(player.last3Avg).toString() : "0";
    case "be": return player.breakEven?.toString() || "-";
    case "proj": return player.projectedScore ? Math.round(player.projectedScore).toString() : "-";
    case "priceChange": {
      const val = player.priceChange || 0;
      if (val > 0) return `+${(val / 1000).toFixed(0)}k`;
      if (val < 0) return `${(val / 1000).toFixed(0)}k`;
      return "0";
    }
    default: return "-";
  }
}

function getStatColor(player: PlayerWithTeamInfo, key: StatKey): string {
  if (key === "priceChange") {
    const val = player.priceChange || 0;
    if (val > 0) return "text-green-600 dark:text-green-400";
    if (val < 0) return "text-red-500 dark:text-red-400";
  }
  if (key === "be") {
    const be = player.breakEven;
    const avg = player.avgScore || 0;
    if (be !== null && be !== undefined && avg > 0) {
      if (be < avg * 0.8) return "text-green-600 dark:text-green-400";
      if (be > avg * 1.2) return "text-red-500 dark:text-red-400";
    }
  }
  return "";
}

function FieldViewCard({
  player,
  onViewReport,
  visibleStats,
}: {
  player: PlayerWithTeamInfo;
  onViewReport: (id: number) => void;
  visibleStats: StatKey[];
}) {
  const teamColors = getTeamColors(player.team);
  const teamAbbr = getTeamAbbr(player.team);
  const nameParts = player.name.split(" ");
  const lastName = nameParts.length >= 2 ? nameParts[nameParts.length - 1] : player.name;
  const jerseyNum = player.id % 45 + 1;

  return (
    <div
      className="flex flex-col items-center cursor-pointer group"
      onClick={() => onViewReport(player.id)}
      data-testid={`field-card-${player.id}`}
    >
      <div className="relative">
        <div
          className="w-[76px] sm:w-[88px] rounded-lg border border-border/60 overflow-hidden shadow-sm group-hover:shadow-md transition-shadow flex flex-col"
          style={{ background: `linear-gradient(135deg, ${teamColors.primary} 0%, ${teamColors.primary}dd 100%)` }}
        >
          <div className="relative h-[52px] sm:h-[58px] flex items-center justify-center overflow-hidden">
            <span
              className="text-[40px] sm:text-[48px] font-black opacity-[0.12] absolute select-none"
              style={{ color: teamColors.text }}
            >
              {jerseyNum}
            </span>
            <div className="flex flex-col items-center z-10">
              <div
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center border-2"
                style={{ borderColor: `${teamColors.text}66`, backgroundColor: `${teamColors.secondary}44` }}
              >
                <span
                  className="text-sm sm:text-base font-black"
                  style={{ color: teamColors.text }}
                >
                  {jerseyNum}
                </span>
              </div>
            </div>
          </div>

          <div
            className="px-1 py-0.5 text-center"
            style={{ backgroundColor: teamColors.secondary, borderTop: `1px solid ${teamColors.text}33` }}
          >
            <p className="text-[8px] sm:text-[9px] font-bold truncate leading-tight" style={{ color: teamColors.text }}>
              {lastName.toUpperCase()}
            </p>
            <p className="text-[7px] sm:text-[8px] font-medium opacity-70" style={{ color: teamColors.text }}>
              {teamAbbr} {getPositionDisplay(player)}
            </p>
          </div>

          {visibleStats.length > 0 && (
            <div className="bg-background/95 dark:bg-background/90 px-1 py-0.5 space-y-px">
              {visibleStats.map((statKey) => {
                const opt = STAT_OPTIONS.find(s => s.key === statKey);
                if (!opt) return null;
                return (
                  <div key={statKey} className="flex items-center justify-between gap-1" data-testid={`stat-${statKey}-${player.id}`}>
                    <span className="text-[7px] sm:text-[8px] font-semibold text-muted-foreground uppercase">{opt.shortLabel}</span>
                    <span className={`text-[8px] sm:text-[9px] font-mono font-bold ${getStatColor(player, statKey)}`}>
                      {getStatValue(player, statKey)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {player.isCaptain && (
          <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center ring-2 ring-background" data-testid={`field-captain-${player.id}`}>
            <span className="text-[9px] font-bold text-white">C</span>
          </div>
        )}
        {player.isViceCaptain && (
          <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center ring-2 ring-background" data-testid={`field-vc-${player.id}`}>
            <span className="text-[9px] font-bold text-white">V</span>
          </div>
        )}
        {player.injuryStatus && (
          <div className="absolute -bottom-0.5 -right-1 w-4 h-4 rounded-full bg-destructive flex items-center justify-center ring-1 ring-background">
            <AlertTriangle className="w-2.5 h-2.5 text-white" />
          </div>
        )}
      </div>
    </div>
  );
}

function FieldView({
  teamPlayers,
  onViewReport,
  visibleStats,
}: {
  teamPlayers: PlayerWithTeamInfo[];
  onViewReport: (id: number) => void;
  visibleStats: StatKey[];
}) {
  const onFieldByPos = (pos: string) =>
    teamPlayers.filter((p) => p.fieldPosition === pos && p.isOnField);
  const benchByPos = (pos: string) =>
    teamPlayers.filter((p) => p.fieldPosition === pos && !p.isOnField);
  const utilPlayers = teamPlayers.filter((p) => p.fieldPosition === "UTIL");

  const positionGroups = ["DEF", "MID", "RUC", "FWD"];

  return (
    <div className="space-y-3" data-testid="view-field">
      {positionGroups.map((pos) => {
        const onField = onFieldByPos(pos);
        const bench = benchByPos(pos);
        if (onField.length === 0 && bench.length === 0) return null;

        const half = Math.ceil(onField.length / 2);
        const topRow = onField.slice(0, Math.min(half, pos === "RUC" ? onField.length : half));
        const bottomRow = pos === "RUC" ? [] : onField.slice(half);

        return (
          <div key={pos} className="relative" data-testid={`field-group-${pos.toLowerCase()}`}>
            <div className="flex items-stretch gap-2">
              <div className="w-[72px] sm:w-[90px] shrink-0 flex items-center justify-center rounded-l-lg bg-gradient-to-b from-primary/15 to-primary/5 border-r border-border/50">
                <span className="text-[10px] sm:text-xs font-bold text-primary/80 uppercase tracking-wider [writing-mode:vertical-lr] rotate-180">
                  {positionLabel(pos)}
                </span>
              </div>

              <div className="flex-1 py-3">
                <div className="flex flex-wrap justify-center gap-2 sm:gap-4">
                  {topRow.map((p) => (
                    <FieldViewCard key={p.myTeamPlayerId} player={p} onViewReport={onViewReport} visibleStats={visibleStats} />
                  ))}
                </div>
                {bottomRow.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-2 sm:gap-4 mt-3">
                    {bottomRow.map((p) => (
                      <FieldViewCard key={p.myTeamPlayerId} player={p} onViewReport={onViewReport} visibleStats={visibleStats} />
                    ))}
                  </div>
                )}
              </div>

              {bench.length > 0 && (
                <div className="w-[86px] sm:w-[100px] shrink-0 border-l border-border/50 flex flex-col items-center justify-center gap-2 py-2 bg-muted/20 rounded-r-lg">
                  {bench.map((p) => (
                    <FieldViewCard key={p.myTeamPlayerId} player={p} onViewReport={onViewReport} visibleStats={visibleStats} />
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {utilPlayers.length > 0 && (
        <div className="relative" data-testid="field-group-util">
          <div className="flex items-stretch gap-2">
            <div className="w-[72px] sm:w-[90px] shrink-0 flex items-center justify-center rounded-l-lg bg-gradient-to-b from-primary/15 to-primary/5 border-r border-border/50">
              <span className="text-[10px] sm:text-xs font-bold text-primary/80 uppercase tracking-wider [writing-mode:vertical-lr] rotate-180">
                UTILITY
              </span>
            </div>
            <div className="flex-1 py-3">
              <div className="flex flex-wrap justify-center gap-2 sm:gap-4">
                {utilPlayers.map((p) => (
                  <FieldViewCard key={p.myTeamPlayerId} player={p} onViewReport={onViewReport} visibleStats={visibleStats} />
                ))}
              </div>
            </div>
            <div className="w-[72px] sm:w-[90px] shrink-0" />
          </div>
        </div>
      )}
    </div>
  );
}

function ListViewRow({
  player,
  advice,
  onRemove,
  onSetCaptain,
  onSetViceCaptain,
  onViewReport,
}: {
  player: PlayerWithTeamInfo;
  advice?: PlayerAdvice;
  onRemove: (id: number) => void;
  onSetCaptain: (id: number) => void;
  onSetViceCaptain: (id: number) => void;
  onViewReport: (id: number) => void;
}) {
  return (
    <div
      className="flex items-center gap-2 sm:gap-3 py-2.5 px-2 sm:px-3 border-b border-border/40 last:border-b-0 cursor-pointer hover:bg-muted/30 transition-colors"
      data-testid={`list-row-${player.id}`}
      onClick={() => onViewReport(player.id)}
    >
      <div
        className="w-9 h-9 sm:w-10 sm:h-10 rounded-full border border-border flex items-center justify-center shrink-0 relative"
        style={{ backgroundColor: getTeamColors(player.team).primary }}
      >
        {player.isCaptain && (
          <span className="text-[10px] font-bold" style={{ color: getTeamColors(player.team).text }}>C</span>
        )}
        {player.isViceCaptain && (
          <span className="text-[10px] font-bold" style={{ color: getTeamColors(player.team).text }}>V</span>
        )}
        {!player.isCaptain && !player.isViceCaptain && (
          <span className="text-[9px] font-bold" style={{ color: getTeamColors(player.team).text }}>{getTeamAbbr(player.team)}</span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold truncate">{getInitials(player.name)}</span>
          {player.injuryStatus && (
            <AlertTriangle className="w-3 h-3 text-destructive shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 font-bold">
            {getPositionDisplay(player)}
          </Badge>
          <Badge className="text-[9px] px-1 py-0 h-4 bg-primary/10 text-primary hover:bg-primary/10 font-bold border-0">
            {formatPrice(player.price)}
          </Badge>
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
          {player.nextOpponent ? `vs ${player.nextOpponent}` : player.team}
          {player.gameTime ? `, ${player.gameTime}` : ""}
        </p>
      </div>

      <div className="flex items-center gap-3 sm:gap-4 shrink-0">
        <div className="text-center">
          <p className="text-xs font-bold text-muted-foreground">LRD</p>
          <p className="text-sm font-mono font-semibold">{player.last3Avg ? Math.round(player.last3Avg) : 0}</p>
        </div>
        <div className="text-center">
          <p className="text-xs font-bold text-muted-foreground">AVG</p>
          <p className="text-sm font-mono font-semibold">{player.avgScore?.toFixed(1) || "0.0"}</p>
        </div>
        <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => onSetCaptain(player.myTeamPlayerId!)}
            data-testid={`button-captain-${player.id}`}
          >
            <Crown className={`w-3.5 h-3.5 ${player.isCaptain ? "text-red-500" : "text-muted-foreground"}`} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => onSetViceCaptain(player.myTeamPlayerId!)}
            data-testid={`button-vc-${player.id}`}
          >
            <Shield className={`w-3.5 h-3.5 ${player.isViceCaptain ? "text-emerald-500" : "text-muted-foreground"}`} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => onRemove(player.myTeamPlayerId!)}
            data-testid={`button-remove-${player.id}`}
          >
            <MoreVertical className="w-3.5 h-3.5 text-muted-foreground" />
          </Button>
        </div>
      </div>

      {advice && (
        <div className="mt-1 text-[10px] text-muted-foreground line-clamp-1" data-testid={`text-advice-${player.id}`}>
          {advice.reasoning}
        </div>
      )}
    </div>
  );
}

function ListView({
  teamPlayers,
  analysis,
  onRemove,
  onSetCaptain,
  onSetViceCaptain,
  onViewReport,
}: {
  teamPlayers: PlayerWithTeamInfo[];
  analysis: TeamAnalysisResult | null;
  onRemove: (id: number) => void;
  onSetCaptain: (id: number) => void;
  onSetViceCaptain: (id: number) => void;
  onViewReport: (id: number) => void;
}) {
  const getAdvice = (playerId: number) => analysis?.playerAdvice.find(a => a.playerId === playerId);

  const positionGroups = ["DEF", "MID", "RUC", "FWD", "UTIL"];

  return (
    <div className="space-y-0" data-testid="view-list">
      {positionGroups.map((pos) => {
        const players = teamPlayers.filter((p) => p.fieldPosition === pos);
        if (players.length === 0) return null;

        const onField = players.filter((p) => p.isOnField);
        const bench = players.filter((p) => !p.isOnField);
        const all = [...onField, ...bench];

        return (
          <div key={pos}>
            <div className="bg-gradient-to-r from-sky-500 to-sky-400 dark:from-sky-700 dark:to-sky-600 px-3 py-1.5">
              <span className="text-xs font-bold text-white tracking-wide">{positionLabel(pos)}</span>
            </div>
            <div>
              {all.map((player) => (
                <ListViewRow
                  key={player.myTeamPlayerId}
                  player={player}
                  advice={getAdvice(player.id)}
                  onRemove={onRemove}
                  onSetCaptain={onSetCaptain}
                  onSetViceCaptain={onSetViceCaptain}
                  onViewReport={onViewReport}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AnalysisPanel({ analysis }: { analysis: TeamAnalysisResult }) {
  return (
    <div className="space-y-4" data-testid="panel-analysis">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Star className="w-5 h-5 text-yellow-500" />
              <span className="font-semibold">Team Rating</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-2xl font-bold">{analysis.overallRating}</span>
              <span className="text-sm text-muted-foreground">/10</span>
            </div>
          </div>
          <p className="text-sm" data-testid="text-analysis-summary">{analysis.summary}</p>
        </CardContent>
      </Card>

      {analysis.urgentActions.length > 0 && (
        <Card className="border-destructive/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-destructive">
              <Zap className="w-4 h-4" />
              Urgent Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {analysis.urgentActions.map((action, i) => (
              <div key={i} className="flex items-start gap-2 text-sm" data-testid={`urgent-action-${i}`}>
                <span className="text-destructive font-bold shrink-0">{i + 1}.</span>
                <span>{action}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-500" />
              Strengths
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {analysis.strengthAreas.map((s, i) => (
                <li key={i} className="text-sm flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">+</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-red-500" />
              Weaknesses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {analysis.weaknessAreas.map((w, i) => (
                <li key={i} className="text-sm flex items-start gap-2">
                  <span className="text-red-500 mt-0.5">-</span>
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {analysis.captainStrategy && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Crown className="w-4 h-4 text-yellow-500" />
              Captain Strategy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm" data-testid="text-captain-strategy">{analysis.captainStrategy}</p>
          </CardContent>
        </Card>
      )}

      {analysis.byeRiskSummary && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-500" />
              Bye Round Risk
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm" data-testid="text-bye-risk">{analysis.byeRiskSummary}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function MyTeam() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [analysis, setAnalysis] = useState<TeamAnalysisResult | null>(null);
  const [viewMode, setViewMode] = useState<"field" | "list">("field");
  const [visibleStats, setVisibleStats] = useState<StatKey[]>(DEFAULT_VISIBLE_STATS);

  const toggleStat = (key: StatKey) => {
    setVisibleStats(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const { data: teamPlayers, isLoading } = useQuery<PlayerWithTeamInfo[]>({
    queryKey: ["/api/my-team"],
  });

  const { data: settings } = useQuery<LeagueSettings>({
    queryKey: ["/api/settings"],
  });

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/my-team/analyze");
      return res.json();
    },
    onSuccess: (data: TeamAnalysisResult) => {
      setAnalysis(data);
      toast({ title: "Team analysis complete", description: `Rating: ${data.overallRating}/10` });
    },
    onError: (error: Error) => {
      toast({ title: "Analysis failed", description: error.message, variant: "destructive" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/my-team/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-team"] });
      setAnalysis(null);
      toast({ title: "Player removed from team" });
    },
  });

  const captainMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/my-team/${id}/captain`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-team"] });
      toast({ title: "Captain updated" });
    },
  });

  const viceCaptainMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/my-team/${id}/vice-captain`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-team"] });
      toast({ title: "Vice Captain updated" });
    },
  });

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-12 w-full" />
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  const totalSalary = teamPlayers?.reduce((sum, p) => sum + p.price, 0) || 0;
  const salaryCap = settings?.salaryCap || 10000000;
  const remaining = salaryCap - totalSalary;

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-5xl mx-auto" data-testid="page-my-team">
      <div className="bg-gradient-to-r from-sky-500 to-sky-400 dark:from-sky-800 dark:to-sky-700 rounded-xl p-4 text-white">
        <div className="flex items-center justify-between">
          <h1 className="text-lg sm:text-xl font-bold tracking-tight" data-testid="text-page-title">{settings?.teamName || "My Team"}</h1>
          <div className="flex items-center gap-2">
            <div className="text-center bg-white/20 rounded-lg px-3 py-1.5">
              <p className="text-[10px] font-medium opacity-80">Team Value</p>
              <p className="text-sm sm:text-base font-bold" data-testid="text-team-value">
                ${(totalSalary / 1000000).toFixed(3)}M
              </p>
            </div>
            <div className="text-center bg-white/20 rounded-lg px-3 py-1.5">
              <p className="text-[10px] font-medium opacity-80">Rem Salary</p>
              <p className="text-sm sm:text-base font-bold" data-testid="text-remaining-salary">
                ${(remaining / 1000).toFixed(0)}k
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
            <Button
              size="sm"
              variant={viewMode === "field" ? "default" : "ghost"}
              className="gap-1.5 text-xs"
              onClick={() => setViewMode("field")}
              data-testid="button-field-view"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Field
            </Button>
            <Button
              size="sm"
              variant={viewMode === "list" ? "default" : "ghost"}
              className="gap-1.5 text-xs"
              onClick={() => setViewMode("list")}
              data-testid="button-list-view"
            >
              <List className="w-3.5 h-3.5" />
              List
            </Button>
          </div>

          {viewMode === "field" && (
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1.5 text-xs" data-testid="button-stats-config">
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  Stats
                  <Badge variant="secondary" className="text-[9px] ml-0.5">{visibleStats.length}</Badge>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-52 p-3" align="start">
                <p className="text-xs font-semibold mb-2">Visible Card Stats</p>
                <div className="space-y-2">
                  {STAT_OPTIONS.map(opt => (
                    <label
                      key={opt.key}
                      className="flex items-center gap-2 cursor-pointer"
                      data-testid={`toggle-stat-${opt.key}`}
                    >
                      <Checkbox
                        checked={visibleStats.includes(opt.key)}
                        onCheckedChange={() => toggleStat(opt.key)}
                        data-testid={`checkbox-stat-${opt.key}`}
                      />
                      <span className="text-sm">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>

        <Button
          onClick={() => analyzeMutation.mutate()}
          disabled={analyzeMutation.isPending || !teamPlayers?.length}
          size="sm"
          className="gap-1.5"
          data-testid="button-analyze-team"
        >
          {analyzeMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Brain className="w-4 h-4" />
          )}
          {analyzeMutation.isPending ? "Analysing..." : "Analyse Team"}
        </Button>
      </div>

      {analysis && <AnalysisPanel analysis={analysis} />}

      {analyzeMutation.isPending && (
        <Card>
          <CardContent className="p-6 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary mb-3" />
            <p className="font-semibold">AI is analysing your team</p>
            <p className="text-sm text-muted-foreground mt-1">Evaluating every player's form, fixtures, price trajectory, and strategic value...</p>
          </CardContent>
        </Card>
      )}

      <Card className="overflow-hidden">
        {viewMode === "field" && teamPlayers && (
          <>
            <div className="flex justify-between items-center px-3 py-2 bg-muted/30 border-b">
              <span className="text-xs font-bold text-muted-foreground">{teamPlayers.length} PLAYERS</span>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">INTERCHANGE</span>
            </div>
            <CardContent className="p-2 sm:p-4">
              <FieldView
                teamPlayers={teamPlayers}
                onViewReport={(id) => navigate(`/player/${id}`)}
                visibleStats={visibleStats}
              />
            </CardContent>
          </>
        )}

        {viewMode === "list" && teamPlayers && (
          <ListView
            teamPlayers={teamPlayers}
            analysis={analysis}
            onRemove={(id) => removeMutation.mutate(id)}
            onSetCaptain={(id) => captainMutation.mutate(id)}
            onSetViceCaptain={(id) => viceCaptainMutation.mutate(id)}
            onViewReport={(id) => navigate(`/player/${id}`)}
          />
        )}
      </Card>
    </div>
  );
}
