import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { formatPrice } from "@/lib/player-utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { PlayerAvatar } from "@/components/player-avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  Trash2,
  SlidersHorizontal,
  RefreshCw,
  Users,
  ArrowLeftRight,
  ArrowUpDown,
  UserPlus,
  Search,
  X,
  Check,
  Upload,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { useLocation } from "wouter";
import { getTeamColors, getTeamAbbr } from "@/lib/afl-teams";
import type { PlayerWithTeamInfo, Player, LeagueSettings, Fixture } from "@shared/schema";
import { DataStatusBar } from "@/components/data-status-bar";

type StatKey = "avg" | "l3" | "be" | "proj" | "priceChange" | "price" | "last";

const STAT_OPTIONS: { key: StatKey; label: string; shortLabel: string }[] = [
  { key: "last", label: "Last Score", shortLabel: "LAST" },
  { key: "price", label: "Price", shortLabel: "PRC" },
  { key: "avg", label: "Season Average", shortLabel: "AVG" },
  { key: "l3", label: "Last 3 Average", shortLabel: "L3" },
  { key: "be", label: "Breakeven", shortLabel: "BE" },
  { key: "proj", label: "Projected Score", shortLabel: "PROJ" },
  { key: "priceChange", label: "Price Change", shortLabel: "+/-" },
];

const DEFAULT_VISIBLE_STATS: StatKey[] = ["last", "avg", "be", "price"];

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

type PlayerAction = {
  label: string;
  color: string;
  bg: string;
  priority: number;
};

function getPlayerAction(player: PlayerWithTeamInfo, currentRound: number): PlayerAction {
  const avg = player.avgScore ?? 0;
  const be = player.breakEven ?? 0;
  const l3 = player.last3Avg ?? avg;
  const proj = player.projectedScore ?? avg;
  const gp = player.gamesPlayed ?? 0;
  const injury = player.injuryStatus;
  const selection = player.selectionStatus;
  const cashGen = player.cashGenPotential;
  const captainProb = player.captainProbability ?? 0;
  const formTrend = player.formTrend;
  const price = player.price ?? 0;
  const priceChange = player.priceChange ?? 0;

  if (injury === "OUT" || injury === "SEASON" || injury === "LONG") {
    return { label: "TRADE", color: "text-white", bg: "bg-red-500", priority: 1 };
  }

  if (selection === "omitted") {
    return { label: "TRADE", color: "text-white", bg: "bg-red-500", priority: 1 };
  }

  if (injury === "TEST" || injury === "TBC") {
    return { label: "MONITOR", color: "text-white", bg: "bg-amber-500", priority: 3 };
  }

  if (selection === "emergency") {
    return { label: "MONITOR", color: "text-white", bg: "bg-amber-500", priority: 3 };
  }

  if (player.byeRound === currentRound) {
    return { label: "BYE", color: "text-white", bg: "bg-slate-500", priority: 4 };
  }

  if (captainProb >= 0.15 && avg >= 100) {
    return { label: "CAPTAIN", color: "text-white", bg: "bg-purple-600", priority: 2 };
  }

  if (gp >= 3 && be > avg * 1.3 && avg < 80) {
    return { label: "TRADE", color: "text-white", bg: "bg-red-500", priority: 1 };
  }

  if (gp >= 3 && l3 < avg * 0.75 && formTrend === "down") {
    return { label: "SELL", color: "text-white", bg: "bg-orange-500", priority: 2 };
  }

  if (cashGen && (cashGen === "elite" || cashGen === "high") && gp <= 6 && be < avg * 0.7) {
    return { label: "CASH COW", color: "text-emerald-900", bg: "bg-emerald-400", priority: 5 };
  }

  if (cashGen && (cashGen === "elite" || cashGen === "high") && gp > 6 && priceChange < 0) {
    return { label: "SELL", color: "text-white", bg: "bg-orange-500", priority: 2 };
  }

  if (avg >= 100 && l3 >= avg * 0.95 && gp >= 5) {
    return { label: "HOLD", color: "text-emerald-900", bg: "bg-emerald-300", priority: 6 };
  }

  if (l3 > avg * 1.15 && gp >= 3) {
    return { label: "HOT", color: "text-white", bg: "bg-sky-500", priority: 4 };
  }

  if (gp >= 3 && l3 < avg * 0.85) {
    return { label: "WATCH", color: "text-amber-900", bg: "bg-amber-300", priority: 4 };
  }

  if (avg >= 85 && gp >= 5) {
    return { label: "HOLD", color: "text-emerald-900", bg: "bg-emerald-300", priority: 6 };
  }

  if (gp < 3 && price < 400000) {
    return { label: "DEVELOPING", color: "text-sky-900", bg: "bg-sky-200", priority: 7 };
  }

  return { label: "HOLD", color: "text-emerald-900", bg: "bg-emerald-300", priority: 7 };
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

function getPositionDisplay(player: { position?: string | null; dualPosition?: string | null }): string {
  if (player.dualPosition) {
    const primary = player.position?.slice(0, 1) || "";
    const dual = player.dualPosition?.slice(0, 1) || "";
    return `${primary}/${dual}`;
  }
  return player.position?.slice(0, 3) || "";
}

function canPlayPosition(player: { position?: string | null; dualPosition?: string | null }, targetPos: string): boolean {
  if (targetPos === "UTIL") return true;
  const primary = (player.position || "").toUpperCase();
  const dual = (player.dualPosition || "").toUpperCase();
  return primary === targetPos || dual === targetPos;
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
    case "last": return player.lastRoundScore != null ? player.lastRoundScore.toString() : "-";
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
  if (key === "last") {
    const score = player.lastRoundScore;
    if (score != null) {
      if (score >= 100) return "text-green-600 dark:text-green-400";
      if (score >= 70) return "text-foreground font-bold";
      if (score < 50) return "text-red-500 dark:text-red-400";
    }
    return "";
  }
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
  onTapPlayer,
  visibleStats,
  isBench = false,
  hasPlayed = false,
  currentRound = 1,
}: {
  player: PlayerWithTeamInfo;
  onTapPlayer: (player: PlayerWithTeamInfo) => void;
  visibleStats: StatKey[];
  isBench?: boolean;
  hasPlayed?: boolean;
  currentRound?: number;
}) {
  const teamColors = getTeamColors(player.team);
  const teamAbbr = getTeamAbbr(player.team);
  const nameParts = player.name.split(" ");
  const lastName = nameParts.length >= 2 ? nameParts[nameParts.length - 1] : player.name;
  const jerseyNum = player.id % 45 + 1;

  return (
    <div
      className={`flex flex-col items-center cursor-pointer group ${isBench ? "opacity-60" : ""}`}
      onClick={() => onTapPlayer(player)}
      data-testid={`field-card-${player.id}`}
    >
      <div className="relative">
        <div
          className={`w-[72px] sm:w-[88px] rounded-lg border overflow-hidden shadow-sm group-hover:shadow-md transition-shadow flex flex-col ${isBench ? "border-border/30 grayscale-[40%]" : "border-border/60"} ${hasPlayed ? "ring-2 ring-emerald-500/60" : ""}`}
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
              <PlayerAvatar
                aflFantasyId={player.aflFantasyId}
                playerName={player.name}
                team={player.team}
                size="md"
              />
            </div>
          </div>

          <div
            className="px-1 py-0.5 text-center"
            style={{ backgroundColor: teamColors.secondary, borderTop: `1px solid ${teamColors.secondaryText}33` }}
          >
            <p className="text-[8px] sm:text-[9px] font-bold truncate leading-tight" style={{ color: teamColors.secondaryText }}>
              {lastName.toUpperCase()}
            </p>
            <p className="text-[7px] sm:text-[8px] font-medium opacity-70" style={{ color: teamColors.secondaryText }}>
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
        {player.selectionStatus === "emergency" && (
          <div className="absolute -bottom-0.5 -left-1 w-5 h-4 rounded bg-amber-500 flex items-center justify-center ring-1 ring-background" title="Named as emergency — only plays if a selected player is withdrawn" data-testid={`badge-emg-field-${player.id}`}>
            <span className="text-[7px] font-bold text-white">EMG</span>
          </div>
        )}
        {player.selectionStatus === "omitted" && (
          <div className="absolute -bottom-0.5 -left-1 w-5 h-4 rounded bg-destructive flex items-center justify-center ring-1 ring-background" title="Not selected for this round" data-testid={`badge-out-field-${player.id}`}>
            <span className="text-[7px] font-bold text-white">OUT</span>
          </div>
        )}
        {hasPlayed && (
          <div className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center ring-1 ring-background" data-testid={`badge-played-${player.id}`}>
            <Check className="w-2.5 h-2.5 text-white" />
          </div>
        )}
      </div>
      {(() => {
        const action = getPlayerAction(player, currentRound);
        return (
          <span
            className={`mt-0.5 px-1.5 py-px rounded-full text-[7px] sm:text-[8px] font-bold uppercase leading-tight ${action.bg} ${action.color}`}
            data-testid={`action-${player.id}`}
          >
            {action.label}
          </span>
        );
      })()}
    </div>
  );
}

function EmptyFieldCard({ position, isBench, onTap }: { position: string; isBench: boolean; onTap?: () => void }) {
  return (
    <div
      className={`w-[68px] sm:w-[80px] ${onTap ? "opacity-50 cursor-pointer hover:opacity-70 transition-opacity" : "opacity-30"}`}
      onClick={onTap}
      data-testid={`empty-field-card-${position.toLowerCase()}`}
    >
      <div className="relative flex flex-col items-center">
        <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full border-2 border-dashed border-muted-foreground/30 flex items-center justify-center">
          <UserPlus className="w-4 h-4 text-muted-foreground/50" />
        </div>
        <span className="text-[9px] text-muted-foreground mt-0.5 italic">{onTap ? "Add" : (isBench ? "Bench" : "Empty")}</span>
      </div>
    </div>
  );
}

function FieldView({
  teamPlayers,
  onTapPlayer,
  onAddToSlot,
  visibleStats,
  playedTeams,
  currentRound = 1,
}: {
  teamPlayers: PlayerWithTeamInfo[];
  onTapPlayer: (player: PlayerWithTeamInfo) => void;
  onAddToSlot?: (position: string, isOnField: boolean) => void;
  visibleStats: StatKey[];
  playedTeams: Set<string>;
  currentRound?: number;
}) {
  const { grouped, utilPlayers } = useMemo(() => {
    const byPos: Record<string, { onField: PlayerWithTeamInfo[]; bench: PlayerWithTeamInfo[] }> = {};
    const util: PlayerWithTeamInfo[] = [];
    for (const p of teamPlayers) {
      if (p.fieldPosition === "UTIL") { util.push(p); continue; }
      if (!byPos[p.fieldPosition]) byPos[p.fieldPosition] = { onField: [], bench: [] };
      (p.isOnField ? byPos[p.fieldPosition].onField : byPos[p.fieldPosition].bench).push(p);
    }
    return { grouped: byPos, utilPlayers: util };
  }, [teamPlayers]);

  const onFieldByPos = (pos: string) => grouped[pos]?.onField ?? [];
  const benchByPos = (pos: string) => grouped[pos]?.bench ?? [];

  const positionGroups = ["DEF", "MID", "RUC", "FWD"];

  const posStructure: Record<string, { onField: number; bench: number }> = {
    DEF: { onField: 6, bench: 2 },
    MID: { onField: 8, bench: 2 },
    RUC: { onField: 2, bench: 1 },
    FWD: { onField: 6, bench: 2 },
  };

  return (
    <div className="space-y-1" data-testid="view-field">
      <div className="space-y-3">
        {positionGroups.map((pos) => {
          const onField = onFieldByPos(pos);
          const structure = posStructure[pos] || { onField: 0, bench: 0 };
          const emptyOnField = Math.max(0, structure.onField - onField.length);

          const onFieldWithEmpty = [
            ...onField.map(p => ({ type: "player" as const, player: p })),
            ...Array.from({ length: emptyOnField }).map((_, i) => ({ type: "empty" as const, key: `empty-field-${pos}-${i}` })),
          ];

          const half = Math.ceil(onFieldWithEmpty.length / 2);
          const topRow = pos === "RUC" ? onFieldWithEmpty : onFieldWithEmpty.slice(0, half);
          const bottomRow = pos === "RUC" ? [] : onFieldWithEmpty.slice(half);

          return (
            <div key={pos} className="relative" data-testid={`field-group-${pos.toLowerCase()}`}>
              <div className="flex items-center gap-1 mb-1.5">
                <span className="text-[10px] sm:text-xs font-bold text-primary/80 uppercase tracking-wider px-2">
                  {positionLabel(pos)}
                </span>
                <div className="flex-1 h-px bg-border/40" />
              </div>
              <div className="flex flex-wrap justify-center gap-1.5 sm:gap-3">
                {topRow.map((item) =>
                  item.type === "player" ? (
                    <FieldViewCard key={item.player.myTeamPlayerId} player={item.player} onTapPlayer={onTapPlayer} visibleStats={visibleStats} isBench={false} hasPlayed={playedTeams.has(item.player.team)} currentRound={currentRound} />
                  ) : (
                    <EmptyFieldCard key={item.key} position={pos} isBench={false} onTap={onAddToSlot ? () => onAddToSlot(pos, true) : undefined} />
                  )
                )}
              </div>
              {bottomRow.length > 0 && (
                <div className="flex flex-wrap justify-center gap-1.5 sm:gap-3 mt-2">
                  {bottomRow.map((item) =>
                    item.type === "player" ? (
                      <FieldViewCard key={item.player.myTeamPlayerId} player={item.player} onTapPlayer={onTapPlayer} visibleStats={visibleStats} isBench={false} hasPlayed={playedTeams.has(item.player.team)} currentRound={currentRound} />
                    ) : (
                      <EmptyFieldCard key={item.key} position={pos} isBench={false} onTap={onAddToSlot ? () => onAddToSlot(pos, true) : undefined} />
                    )
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="relative my-4">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t-2 border-dashed border-amber-500/40" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-background px-3 text-[10px] sm:text-xs font-bold text-amber-500/80 uppercase tracking-widest">
            Bench
          </span>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-dashed border-amber-500/20 bg-amber-500/[0.03] p-3">
        {positionGroups.map((pos) => {
          const bench = benchByPos(pos);
          const structure = posStructure[pos] || { onField: 0, bench: 0 };
          const emptyBench = Math.max(0, structure.bench - bench.length);

          const benchWithEmpty = [
            ...bench.map(p => ({ type: "player" as const, player: p })),
            ...Array.from({ length: emptyBench }).map((_, i) => ({ type: "empty" as const, key: `empty-bench-${pos}-${i}` })),
          ];

          return (
            <div key={`bench-${pos}`} className="relative" data-testid={`bench-group-${pos.toLowerCase()}`}>
              <div className="flex items-center gap-1 mb-1.5">
                <span className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-wider px-2">
                  {positionLabel(pos)}
                </span>
                <div className="flex-1 h-px bg-border/30" />
              </div>
              <div className="flex flex-wrap justify-center gap-1.5 sm:gap-3">
                {benchWithEmpty.map((item) =>
                  item.type === "player" ? (
                    <FieldViewCard key={item.player.myTeamPlayerId} player={item.player} onTapPlayer={onTapPlayer} visibleStats={visibleStats} isBench={true} hasPlayed={playedTeams.has(item.player.team)} currentRound={currentRound} />
                  ) : (
                    <EmptyFieldCard key={item.key} position={pos} isBench={true} onTap={onAddToSlot ? () => onAddToSlot(pos, false) : undefined} />
                  )
                )}
              </div>
            </div>
          );
        })}

        <div className="relative" data-testid="field-group-util">
          <div className="flex items-center gap-1 mb-1.5">
            <span className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-wider px-2">
              UTILITY
            </span>
            <div className="flex-1 h-px bg-border/30" />
          </div>
          <div className="flex flex-wrap justify-center gap-1.5 sm:gap-3">
            {utilPlayers.map((p) => (
              <FieldViewCard key={p.myTeamPlayerId} player={p} onTapPlayer={onTapPlayer} visibleStats={visibleStats} isBench={true} hasPlayed={playedTeams.has(p.team)} currentRound={currentRound} />
            ))}
            {utilPlayers.length === 0 && (
              <EmptyFieldCard position="UTIL" isBench={true} onTap={onAddToSlot ? () => onAddToSlot("UTIL", false) : undefined} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ListViewRow({
  player,
  advice,
  onTapPlayer,
  onSetCaptain,
  onSetViceCaptain,
  hasPlayed = false,
  currentRound = 1,
}: {
  player: PlayerWithTeamInfo;
  advice?: PlayerAdvice;
  onTapPlayer: (player: PlayerWithTeamInfo) => void;
  onSetCaptain: (id: number) => void;
  onSetViceCaptain: (id: number) => void;
  hasPlayed?: boolean;
  currentRound?: number;
}) {
  const action = getPlayerAction(player, currentRound);
  return (
    <div
      className={`flex items-center gap-2 sm:gap-3 py-2.5 px-2 sm:px-3 border-b border-border/40 last:border-b-0 cursor-pointer hover:bg-muted/30 transition-colors ${hasPlayed ? "bg-emerald-500/5" : ""}`}
      data-testid={`list-row-${player.id}`}
      onClick={() => onTapPlayer(player)}
    >
      <div className="relative shrink-0">
        <PlayerAvatar
          aflFantasyId={player.aflFantasyId}
          playerName={player.name}
          team={player.team}
          size="sm"
        />
        {player.isCaptain && (
          <div className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 flex items-center justify-center ring-1 ring-background">
            <span className="text-[8px] font-bold text-white">C</span>
          </div>
        )}
        {player.isViceCaptain && (
          <div className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center ring-1 ring-background">
            <span className="text-[8px] font-bold text-white">V</span>
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold">{getInitials(player.name)}</span>
          {player.injuryStatus && (
            <AlertTriangle className="w-3 h-3 text-destructive shrink-0" />
          )}
          {player.selectionStatus === "emergency" && (
            <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 shrink-0" data-testid={`badge-emg-${player.id}`}>EMG</Badge>
          )}
          {player.selectionStatus === "omitted" && (
            <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 bg-destructive/15 text-destructive border-destructive/30 shrink-0" data-testid={`badge-out-${player.id}`}>OUT</Badge>
          )}
          {player.selectionStatus === "selected" && (
            <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 shrink-0" data-testid={`badge-sel-${player.id}`}>IN</Badge>
          )}
          {!player.isOnField && (
            <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 bg-muted text-muted-foreground shrink-0">BENCH</Badge>
          )}
          {hasPlayed && (
            <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 shrink-0" data-testid={`badge-played-list-${player.id}`}>
              <Check className="w-2.5 h-2.5 mr-0.5" />PLAYED
            </Badge>
          )}
          <span className={`text-[8px] px-1.5 py-0 h-3.5 rounded-full font-bold inline-flex items-center ${action.bg} ${action.color}`} data-testid={`action-list-${player.id}`}>
            {action.label}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 font-bold">
            {player.fieldPosition} · {getPositionDisplay(player)}
          </Badge>
          <Badge className="text-[9px] px-1 py-0 h-4 bg-primary/10 text-primary hover:bg-primary/10 font-bold border-0">
            {formatPrice(player.price)}
          </Badge>
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {player.nextOpponent ? `vs ${player.nextOpponent}` : player.team}
          {player.gameTime ? `, ${player.gameTime}` : ""}
        </p>
      </div>

      <div className="flex items-center gap-2 sm:gap-4 shrink-0">
        <div className="text-center">
          <p className="text-[10px] sm:text-xs font-bold text-muted-foreground">LAST</p>
          <p className={`text-sm sm:text-base font-mono font-bold ${
            player.lastRoundScore != null
              ? player.lastRoundScore >= 100
                ? "text-green-600 dark:text-green-400"
                : player.lastRoundScore < 50
                  ? "text-red-500 dark:text-red-400"
                  : ""
              : "text-muted-foreground"
          }`} data-testid={`text-last-score-${player.id}`}>
            {player.lastRoundScore != null ? player.lastRoundScore : "-"}
          </p>
        </div>
        <div className="text-center hidden sm:block">
          <p className="text-xs font-bold text-muted-foreground">AVG</p>
          <p className="text-sm font-mono font-semibold">{player.avgScore?.toFixed(1) || "0.0"}</p>
        </div>
        <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
          <Button
            size="icon"
            variant="ghost"
            className={`h-6 w-6 sm:h-7 sm:w-7 ${player.isCaptain ? "bg-red-500/15 ring-1 ring-red-500/40" : ""}`}
            onClick={() => onSetCaptain(player.myTeamPlayerId!)}
            title="Set as Captain"
            data-testid={`button-captain-${player.id}`}
          >
            <span className={`text-[10px] sm:text-[11px] font-black ${player.isCaptain ? "text-red-500" : "text-muted-foreground"}`}>C</span>
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className={`h-6 w-6 sm:h-7 sm:w-7 ${player.isViceCaptain ? "bg-emerald-500/15 ring-1 ring-emerald-500/40" : ""}`}
            onClick={() => onSetViceCaptain(player.myTeamPlayerId!)}
            title="Set as Vice Captain"
            data-testid={`button-vc-${player.id}`}
          >
            <span className={`text-[10px] sm:text-[11px] font-black ${player.isViceCaptain ? "text-emerald-500" : "text-muted-foreground"}`}>VC</span>
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

function getNumericStatForSort(player: PlayerWithTeamInfo, key: StatKey): number {
  switch (key) {
    case "last": return player.lastRoundScore ?? -1;
    case "price": return player.price || 0;
    case "avg": return player.avgScore || 0;
    case "l3": return player.last3Avg || 0;
    case "be": return player.breakEven || 0;
    case "proj": return player.projectedScore || 0;
    case "priceChange": return player.priceChange || 0;
    default: return 0;
  }
}

function EmptySlot({ position, label }: { position: string; label: string }) {
  return (
    <div className="flex items-center gap-2 sm:gap-3 py-2.5 px-2 sm:px-3 border-b border-border/40 last:border-b-0 opacity-40" data-testid={`empty-slot-${position.toLowerCase()}`}>
      <div className="w-9 h-9 rounded-full border-2 border-dashed border-muted-foreground/30 flex items-center justify-center shrink-0">
        <UserPlus className="w-4 h-4 text-muted-foreground/50" />
      </div>
      <div className="min-w-0 flex-1">
        <span className="text-sm text-muted-foreground italic">{label}</span>
        <div className="text-[10px] text-muted-foreground/60">{position} position</div>
      </div>
    </div>
  );
}

function ListView({
  teamPlayers,
  analysis,
  onTapPlayer,
  onSetCaptain,
  onSetViceCaptain,
  sortBy,
  playedTeams,
  currentRound = 1,
}: {
  teamPlayers: PlayerWithTeamInfo[];
  analysis: TeamAnalysisResult | null;
  onTapPlayer: (player: PlayerWithTeamInfo) => void;
  onSetCaptain: (id: number) => void;
  onSetViceCaptain: (id: number) => void;
  sortBy: "position" | StatKey;
  playedTeams: Set<string>;
  currentRound?: number;
}) {
  const getAdvice = (playerId: number) => analysis?.playerAdvice.find(a => a.playerId === playerId);

  const positionGroups = ["DEF", "MID", "RUC", "FWD", "UTIL"];

  if (sortBy !== "position") {
    const sorted = [...teamPlayers].sort((a, b) => getNumericStatForSort(b, sortBy) - getNumericStatForSort(a, sortBy));
    const statOpt = STAT_OPTIONS.find(s => s.key === sortBy);
    return (
      <div className="space-y-0" data-testid="view-list">
        <div className="bg-gradient-to-r from-sky-500 to-sky-400 dark:from-sky-700 dark:to-sky-600 px-3 py-1.5">
          <span className="text-xs font-bold text-white tracking-wide">Sorted by {statOpt?.label || sortBy}</span>
        </div>
        <div>
          {sorted.map((player) => (
            <ListViewRow
              key={player.myTeamPlayerId}
              player={player}
              advice={getAdvice(player.id)}
              onTapPlayer={onTapPlayer}
              onSetCaptain={onSetCaptain}
              onSetViceCaptain={onSetViceCaptain}
              hasPlayed={playedTeams.has(player.team)}
              currentRound={currentRound}
            />
          ))}
        </div>
      </div>
    );
  }

  const posStructure: Record<string, { onField: number; bench: number }> = {
    DEF: { onField: 6, bench: 2 },
    MID: { onField: 8, bench: 2 },
    RUC: { onField: 2, bench: 1 },
    FWD: { onField: 6, bench: 2 },
  };

  return (
    <div className="space-y-0" data-testid="view-list">
      {positionGroups.map((pos) => {
        if (pos === "UTIL") {
          const utilPlayers = teamPlayers.filter((p) => p.fieldPosition === "UTIL");
          return (
            <div key={pos}>
              <div className="bg-muted/60 px-3 py-1.5 border-y border-border/40">
                <span className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase">Utility (Bench)</span>
              </div>
              <div>
                {utilPlayers.map((player) => (
                  <ListViewRow
                    key={player.myTeamPlayerId}
                    player={player}
                    advice={getAdvice(player.id)}
                    onTapPlayer={onTapPlayer}
                    onSetCaptain={onSetCaptain}
                    onSetViceCaptain={onSetViceCaptain}
                    hasPlayed={playedTeams.has(player.team)}
                    currentRound={currentRound}
                  />
                ))}
                {utilPlayers.length === 0 && (
                  <EmptySlot position="UTIL" label="Empty Utility Slot" />
                )}
              </div>
            </div>
          );
        }

        const players = teamPlayers.filter((p) => p.fieldPosition === pos);
        const onField = players.filter((p) => p.isOnField);
        const bench = players.filter((p) => !p.isOnField);
        const structure = posStructure[pos] || { onField: 0, bench: 0 };
        const emptyOnField = Math.max(0, structure.onField - onField.length);
        const emptyBench = Math.max(0, structure.bench - bench.length);

        return (
          <div key={pos}>
            <div className="bg-gradient-to-r from-sky-500 to-sky-400 dark:from-sky-700 dark:to-sky-600 px-3 py-1.5">
              <span className="text-xs font-bold text-white tracking-wide">{positionLabel(pos)}</span>
            </div>
            <div>
              {onField.map((player) => (
                <ListViewRow
                  key={player.myTeamPlayerId}
                  player={player}
                  advice={getAdvice(player.id)}
                  onTapPlayer={onTapPlayer}
                  onSetCaptain={onSetCaptain}
                  onSetViceCaptain={onSetViceCaptain}
                  hasPlayed={playedTeams.has(player.team)}
                  currentRound={currentRound}
                />
              ))}
              {Array.from({ length: emptyOnField }).map((_, i) => (
                <EmptySlot key={`empty-field-${pos}-${i}`} position={pos} label="Empty Slot" />
              ))}
            </div>
            {(structure.bench > 0 || bench.length > 0) && (
              <>
                <div className="bg-muted/60 px-3 py-1 border-y border-border/40">
                  <span className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase">Bench</span>
                </div>
                <div>
                  {bench.map((player) => (
                    <ListViewRow
                      key={player.myTeamPlayerId}
                      player={player}
                      advice={getAdvice(player.id)}
                      onTapPlayer={onTapPlayer}
                      onSetCaptain={onSetCaptain}
                      onSetViceCaptain={onSetViceCaptain}
                      hasPlayed={playedTeams.has(player.team)}
                      currentRound={currentRound}
                    />
                  ))}
                  {Array.from({ length: emptyBench }).map((_, i) => (
                    <EmptySlot key={`empty-bench-${pos}-${i}`} position={pos} label="Empty Bench Slot" />
                  ))}
                </div>
              </>
            )}
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

type ActionMode = "actions" | "swap" | "replace";

function PlayerActionDialog({
  player,
  teamPlayers,
  salaryCap,
  onClose,
}: {
  player: PlayerWithTeamInfo;
  teamPlayers: PlayerWithTeamInfo[];
  salaryCap: number;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [mode, setMode] = useState<ActionMode>("actions");
  const [replaceSearch, setReplaceSearch] = useState("");
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  const { data: allPlayers } = useQuery<Player[]>({
    queryKey: ["/api/players"],
    enabled: mode === "replace",
  });

  const totalSalary = teamPlayers.reduce((sum, p) => sum + p.price, 0);
  const remainingBudget = salaryCap - totalSalary;
  const budgetAfterRemoval = remainingBudget + player.price;

  const swapMutation = useMutation({
    mutationFn: async (targetId: number) => {
      await apiRequest("POST", "/api/my-team/swap", {
        playerAId: player.myTeamPlayerId,
        playerBId: targetId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-team"] });
      toast({ title: "Players swapped" });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Swap failed", description: err.message, variant: "destructive" });
    },
  });

  const replaceMutation = useMutation({
    mutationFn: async (newPlayerId: number) => {
      const res = await apiRequest("POST", `/api/my-team/${player.myTeamPlayerId}/replace`, {
        newPlayerId,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-team"] });
      toast({ title: "Player replaced", description: `Replaced with ${data.replacedWith}` });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Replace failed", description: err.message, variant: "destructive" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/my-team/${player.myTeamPlayerId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-team"] });
      toast({ title: `${player.name} removed from team` });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Remove failed", description: err.message, variant: "destructive" });
    },
  });

  const captainMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/my-team/${player.myTeamPlayerId}/captain`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-team"] });
      toast({ title: "Captain updated" });
      onClose();
    },
  });

  const viceCaptainMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/my-team/${player.myTeamPlayerId}/vice-captain`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-team"] });
      toast({ title: "Vice Captain updated" });
      onClose();
    },
  });

  const swapCandidates = useMemo(() => {
    return teamPlayers.filter(p => {
      if (p.myTeamPlayerId === player.myTeamPlayerId) return false;
      const aCanPlayBPos = canPlayPosition(player, p.fieldPosition!);
      const bCanPlayAPos = canPlayPosition(p, player.fieldPosition!);
      return aCanPlayBPos && bCanPlayAPos;
    });
  }, [teamPlayers, player]);

  const replaceCandidates = useMemo(() => {
    if (!allPlayers) return [];
    const teamIds = new Set(teamPlayers.map(p => p.id));
    const targetPos = player.fieldPosition!;
    const isSearching = replaceSearch.length >= 2;

    return allPlayers
      .filter(p => {
        if (teamIds.has(p.id)) return false;
        if (!canPlayPosition(p, targetPos)) return false;
        if (!isSearching && p.price > budgetAfterRemoval) return false;
        if (isSearching) {
          const q = replaceSearch.toLowerCase();
          if (!p.name.toLowerCase().includes(q) && !p.team.toLowerCase().includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0))
      .slice(0, isSearching ? 100 : 50);
  }, [allPlayers, teamPlayers, player, budgetAfterRemoval, replaceSearch]);

  const teamColors = getTeamColors(player.team);

  if (mode === "swap") {
    return (
      <>
        <DialogHeader className="pb-2">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-sm">Swap {getInitials(player.name)}</DialogTitle>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setMode("actions")} data-testid="button-back-actions">
              Back
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Currently at {player.fieldPosition} ({player.isOnField ? "on field" : "bench"}).
            Select a teammate to swap with.
          </p>
        </DialogHeader>
        <div className="max-h-[50vh] overflow-y-auto -mx-2">
          {swapCandidates.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No eligible swap candidates</p>
          ) : (
            swapCandidates.map(target => {
              const tc = getTeamColors(target.team);
              return (
                <button
                  key={target.myTeamPlayerId}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-muted/50 transition-colors text-left"
                  onClick={() => swapMutation.mutate(target.myTeamPlayerId!)}
                  disabled={swapMutation.isPending}
                  data-testid={`swap-target-${target.id}`}
                >
                  <div
                    className="w-7 h-7 rounded flex items-center justify-center text-[9px] font-bold shrink-0"
                    style={{ backgroundColor: tc.primary, color: tc.text }}
                  >
                    {getTeamAbbr(target.team)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{target.name}</p>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground">{target.fieldPosition} · {target.isOnField ? "Field" : "Bench"}</span>
                      <span className="text-[10px] text-muted-foreground">avg {(target.avgScore || 0).toFixed(0)}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-mono font-bold">{formatPrice(target.price)}</p>
                  </div>
                  <ArrowLeftRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                </button>
              );
            })
          )}
        </div>
      </>
    );
  }

  if (mode === "replace") {
    return (
      <>
        <DialogHeader className="pb-2">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-sm">Replace {getInitials(player.name)}</DialogTitle>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setMode("actions")} data-testid="button-back-actions">
              Back
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Position: {player.fieldPosition} · Budget: {formatPrice(budgetAfterRemoval)}
          </p>
        </DialogHeader>
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search players..."
            value={replaceSearch}
            onChange={(e) => setReplaceSearch(e.target.value)}
            className="h-8 text-xs pl-8"
            data-testid="input-replace-search"
          />
          {replaceSearch && (
            <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setReplaceSearch("")}>
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
        <div className="max-h-[50vh] overflow-y-auto -mx-2">
          {replaceCandidates.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {replaceSearch ? "No matching players" : "No eligible players"}
            </p>
          ) : (
            replaceCandidates.map(rp => {
              const rc = getTeamColors(rp.team);
              return (
                <button
                  key={rp.id}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-muted/50 transition-colors text-left"
                  onClick={() => replaceMutation.mutate(rp.id)}
                  disabled={replaceMutation.isPending}
                  data-testid={`replace-target-${rp.id}`}
                >
                  <div
                    className="w-7 h-7 rounded flex items-center justify-center text-[9px] font-bold shrink-0"
                    style={{ backgroundColor: rc.primary, color: rc.text }}
                  >
                    {getTeamAbbr(rp.team)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{rp.name}</p>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground">{getPositionDisplay(rp)}</span>
                      <span className="text-[10px] text-muted-foreground">avg {(rp.avgScore || 0).toFixed(0)}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-mono font-bold">{formatPrice(rp.price)}</p>
                  </div>
                  <UserPlus className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                </button>
              );
            })
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <DialogHeader className="pb-0">
        <DialogTitle className="sr-only">Player actions for {player.name}</DialogTitle>
      </DialogHeader>
      <div className="flex items-center gap-3 pb-3 border-b">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
          style={{ backgroundColor: teamColors.primary, color: teamColors.text }}
        >
          {getTeamAbbr(player.team)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm truncate">{player.name}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 font-bold">
              {player.fieldPosition} · {getPositionDisplay(player)}
            </Badge>
            <Badge className="text-[9px] px-1 py-0 h-4 bg-primary/10 text-primary hover:bg-primary/10 font-bold border-0">
              {formatPrice(player.price)}
            </Badge>
            {player.isOnField ? (
              <Badge className="text-[9px] px-1 py-0 h-4 bg-green-500/10 text-green-600 dark:text-green-400 font-bold border-0">On Field</Badge>
            ) : (
              <Badge className="text-[9px] px-1 py-0 h-4 bg-muted text-muted-foreground font-bold border-0">Bench</Badge>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            avg {(player.avgScore || 0).toFixed(1)} · BE {player.breakEven || "-"}
          </p>
        </div>
      </div>

      <div className="space-y-1 pt-2">
        <button
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors text-left"
          onClick={() => navigate(`/player/${player.id}`)}
          data-testid="action-view-report"
        >
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">View Report</p>
            <p className="text-[10px] text-muted-foreground">Full player analysis</p>
          </div>
        </button>

        <button
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors text-left"
          onClick={() => setMode("swap")}
          data-testid="action-swap"
        >
          <ArrowLeftRight className="w-4 h-4 text-blue-500" />
          <div>
            <p className="text-sm font-medium">Swap with Teammate</p>
            <p className="text-[10px] text-muted-foreground">Swap positions or field/bench with an eligible player</p>
          </div>
        </button>

        <button
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors text-left"
          onClick={() => setMode("replace")}
          data-testid="action-replace"
        >
          <UserPlus className="w-4 h-4 text-green-500" />
          <div>
            <p className="text-sm font-medium">Replace with Database Player</p>
            <p className="text-[10px] text-muted-foreground">Swap for a different player from the full list</p>
          </div>
        </button>

        <div className="flex gap-1.5 pt-1">
          <button
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg transition-colors text-left ${
              player.isCaptain ? "bg-red-500/10 ring-1 ring-red-500/30" : "hover:bg-muted/50"
            }`}
            onClick={() => captainMutation.mutate()}
            data-testid="action-captain"
          >
            <Crown className={`w-3.5 h-3.5 ${player.isCaptain ? "text-red-500" : "text-muted-foreground"}`} />
            <span className={`text-xs font-medium ${player.isCaptain ? "text-red-500" : ""}`}>
              {player.isCaptain ? "Captain ✓" : "Set Captain"}
            </span>
          </button>
          <button
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg transition-colors text-left ${
              player.isViceCaptain ? "bg-emerald-500/10 ring-1 ring-emerald-500/30" : "hover:bg-muted/50"
            }`}
            onClick={() => viceCaptainMutation.mutate()}
            data-testid="action-vc"
          >
            <Shield className={`w-3.5 h-3.5 ${player.isViceCaptain ? "text-emerald-500" : "text-muted-foreground"}`} />
            <span className={`text-xs font-medium ${player.isViceCaptain ? "text-emerald-500" : ""}`}>
              {player.isViceCaptain ? "Vice ✓" : "Set Vice"}
            </span>
          </button>
        </div>

        <div className="pt-2 border-t mt-2">
          {!showRemoveConfirm ? (
            <button
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-destructive/10 transition-colors text-left"
              onClick={() => setShowRemoveConfirm(true)}
              data-testid="action-remove"
            >
              <Trash2 className="w-4 h-4 text-destructive" />
              <div>
                <p className="text-sm font-medium text-destructive">Remove from Team</p>
                <p className="text-[10px] text-muted-foreground">Delete this player from your squad</p>
              </div>
            </button>
          ) : (
            <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3">
              <p className="text-xs font-medium mb-2">Remove {player.name}?</p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 h-7 text-xs"
                  onClick={() => setShowRemoveConfirm(false)}
                  data-testid="button-cancel-remove"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="flex-1 h-7 text-xs"
                  onClick={() => removeMutation.mutate()}
                  disabled={removeMutation.isPending}
                  data-testid="button-confirm-remove"
                >
                  {removeMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Remove"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function AddPlayerToSlotDialog({
  position,
  isOnField,
  teamPlayers,
  salaryCap,
  onClose,
}: {
  position: string;
  isOnField: boolean;
  teamPlayers: PlayerWithTeamInfo[];
  salaryCap: number;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");

  const { data: allPlayers } = useQuery<Player[]>({
    queryKey: ["/api/players"],
  });

  const totalSalary = teamPlayers.reduce((sum, p) => sum + p.price, 0);
  const remainingBudget = salaryCap - totalSalary;

  const addMutation = useMutation({
    mutationFn: async (playerId: number) => {
      const res = await apiRequest("POST", "/api/my-team", {
        playerId,
        fieldPosition: position === "UTIL" ? "UTIL" : position,
        isOnField: position === "UTIL" ? false : isOnField,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-team"] });
      toast({ title: "Player added" });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to add", description: err.message, variant: "destructive" });
    },
  });

  const eligiblePlayers = useMemo(() => {
    if (!allPlayers) return [];
    const teamIds = new Set(teamPlayers.map((p) => p.id));
    const isSearching = search.length >= 2;
    const q = search.toLowerCase();
    return allPlayers
      .filter((p) => {
        if (teamIds.has(p.id)) return false;
        if (!isSearching && p.price > remainingBudget) return false;
        if (isSearching) {
          if (!p.name.toLowerCase().includes(q) && !p.team.toLowerCase().includes(q)) return false;
        }
        if (position === "UTIL") return true;
        return canPlayPosition(p, position);
      })
      .sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0))
      .slice(0, isSearching ? 100 : 50);
  }, [allPlayers, teamPlayers, remainingBudget, position, search]);

  return (
    <div className="space-y-3" data-testid="add-player-slot-dialog">
      <p className="text-xs text-muted-foreground">
        Add {position === "UTIL" ? "Utility" : position} player {isOnField ? "(on-field)" : "(bench)"}
        <span className="ml-2 text-emerald-400">${(remainingBudget / 1000).toFixed(0)}K budget</span>
      </p>
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
        <Input
          placeholder="Search player or team..."
          className="pl-7 h-8 text-xs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-testid="input-add-player-search"
        />
        {search && (
          <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setSearch("")}>
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      <div className="max-h-[300px] overflow-y-auto space-y-1">
        {eligiblePlayers.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            {search ? "No matching players" : "No eligible players"}
          </p>
        )}
        {eligiblePlayers.map((p) => {
          const colors = getTeamColors(p.team);
          const overBudget = p.price > remainingBudget;
          return (
            <button
              key={p.id}
              className={`w-full flex items-center gap-2 p-2 rounded-lg hover:bg-accent/50 transition-colors text-left ${overBudget ? "opacity-50" : ""}`}
              onClick={() => addMutation.mutate(p.id)}
              disabled={addMutation.isPending || overBudget}
              data-testid={`add-player-option-${p.id}`}
            >
              <PlayerAvatar playerId={p.aflFantasyId} playerName={p.name} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{p.name}</p>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-bold px-1 rounded" style={{ backgroundColor: colors.primary, color: colors.secondary }}>
                    {getTeamAbbr(p.team)}
                  </span>
                  <span className="text-[9px] text-muted-foreground">{p.position}{p.dualPosition ? `/${p.dualPosition}` : ""}</span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-mono font-semibold">{(p.avgScore || 0).toFixed(0)}</p>
                <p className={`text-[9px] ${overBudget ? "text-red-400 line-through" : "text-muted-foreground"}`}>${((p.price || 0) / 1000).toFixed(0)}K</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function MyTeam() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [analysis, setAnalysis] = useState<TeamAnalysisResult | null>(null);
  const [viewMode, setViewMode] = useState<"field" | "list">("field");
  const [visibleStats, setVisibleStats] = useState<StatKey[]>(DEFAULT_VISIBLE_STATS);
  const [sortBy, setSortBy] = useState<"position" | StatKey>("position");
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerWithTeamInfo | null>(null);
  const [addSlot, setAddSlot] = useState<{ position: string; isOnField: boolean } | null>(null);

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

  const currentRound = settings?.currentRound ?? 1;
  const { data: roundFixtures } = useQuery<{ round: number; roundName: string; matches: Fixture[] }>({
    queryKey: ["/api/fixtures", currentRound],
    enabled: !!settings,
  });

  const playedTeams = useMemo(() => {
    const teams = new Set<string>();
    if (roundFixtures?.matches) {
      for (const match of roundFixtures.matches) {
        if (match.complete === 100) {
          teams.add(match.homeTeam);
          teams.add(match.awayTeam);
        }
      }
    }
    return teams;
  }, [roundFixtures]);

  const clearTeamMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/my-team");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-team"] });
      setAnalysis(null);
      toast({ title: "Team cleared", description: "Upload a new screenshot to rebuild your team." });
    },
    onError: (error: Error) => {
      toast({ title: "Clear failed", description: error.message, variant: "destructive" });
    },
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

  if (!teamPlayers?.length) {
    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto" data-testid="page-my-team">
        <Card>
          <CardContent className="py-16 text-center space-y-4">
            <Users className="w-12 h-12 mx-auto text-muted-foreground" />
            <h2 className="text-xl font-bold" data-testid="text-empty-title">No Team Yet</h2>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              Import your AFL Fantasy team by uploading a screenshot from the app, or browse the player list to build your squad manually.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button
                onClick={() => navigate("/analyze")}
                className="gap-2"
                data-testid="button-upload-screenshot"
              >
                <Upload className="w-4 h-4" />
                Upload Screenshot
              </Button>
              <Button
                onClick={() => navigate("/players")}
                variant="outline"
                className="gap-2"
                data-testid="button-browse-players"
              >
                <Users className="w-4 h-4" />
                Browse Players
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalSalary = teamPlayers?.reduce((sum, p) => sum + p.price, 0) || 0;
  const salaryCap = settings?.salaryCap || 18300000;
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

      <DataStatusBar />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5">
            <Button
              size="sm"
              variant={viewMode === "field" ? "default" : "ghost"}
              className="gap-1 text-xs h-7 px-2"
              onClick={() => setViewMode("field")}
              data-testid="button-field-view"
            >
              <LayoutGrid className="w-3 h-3" />
              Field
            </Button>
            <Button
              size="sm"
              variant={viewMode === "list" ? "default" : "ghost"}
              className="gap-1 text-xs h-7 px-2"
              onClick={() => setViewMode("list")}
              data-testid="button-list-view"
            >
              <List className="w-3 h-3" />
              List
            </Button>
          </div>

          {viewMode === "field" && (
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1 text-xs h-7 px-2" data-testid="button-stats-config">
                  <SlidersHorizontal className="w-3 h-3" />
                  Stats
                  <Badge variant="secondary" className="text-[9px] ml-0.5 h-4 px-1">{visibleStats.length}</Badge>
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

          {viewMode === "list" && (
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1 text-xs h-7 px-2" data-testid="button-sort-config">
                  <SlidersHorizontal className="w-3 h-3" />
                  Sort: {sortBy === "position" ? "Position" : STAT_OPTIONS.find(s => s.key === sortBy)?.label || sortBy}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-52 p-3" align="start">
                <p className="text-xs font-semibold mb-2">Sort Players By</p>
                <div className="space-y-1">
                  <button
                    className={`w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted transition-colors ${sortBy === "position" ? "bg-primary/10 font-semibold" : ""}`}
                    onClick={() => setSortBy("position")}
                    data-testid="sort-position"
                  >
                    Position Group
                  </button>
                  {STAT_OPTIONS.map(opt => (
                    <button
                      key={opt.key}
                      className={`w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted transition-colors ${sortBy === opt.key ? "bg-primary/10 font-semibold" : ""}`}
                      onClick={() => setSortBy(opt.key)}
                      data-testid={`sort-${opt.key}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="gap-1 h-7 px-2 text-xs text-destructive hover:text-destructive"
                disabled={!teamPlayers?.length || clearTeamMutation.isPending}
                data-testid="button-clear-team"
              >
                {clearTeamMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span className="hidden sm:inline">Clear</span>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear Entire Team?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove all {teamPlayers?.length || 0} players from your team. You can re-upload a screenshot in the Team Analyser to rebuild it.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => clearTeamMutation.mutate()}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  data-testid="button-confirm-clear"
                >
                  Clear Team
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button
            onClick={() => analyzeMutation.mutate()}
            disabled={analyzeMutation.isPending || !teamPlayers?.length}
            size="sm"
            className="gap-1 h-7 px-2 text-xs"
            data-testid="button-analyze-team"
          >
            {analyzeMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Brain className="w-3.5 h-3.5" />
            )}
            <span>{analyzeMutation.isPending ? "..." : "Analyse"}</span>
          </Button>
        </div>
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
              <span className="text-[10px] sm:text-xs font-bold text-muted-foreground">{teamPlayers.length} PLAYERS</span>
              <span className="text-[9px] sm:text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">TAP TO MANAGE</span>
            </div>
            <CardContent className="p-1.5 sm:p-4">
              <FieldView
                teamPlayers={teamPlayers}
                onTapPlayer={setSelectedPlayer}
                onAddToSlot={(pos, onField) => setAddSlot({ position: pos, isOnField: onField })}
                visibleStats={visibleStats}
                playedTeams={playedTeams}
                currentRound={currentRound}
              />
            </CardContent>
          </>
        )}

        {viewMode === "list" && teamPlayers && (
          <ListView
            teamPlayers={teamPlayers}
            analysis={analysis}
            onTapPlayer={setSelectedPlayer}
            onSetCaptain={(id) => captainMutation.mutate(id)}
            onSetViceCaptain={(id) => viceCaptainMutation.mutate(id)}
            sortBy={sortBy}
            playedTeams={playedTeams}
            currentRound={currentRound}
          />
        )}
      </Card>

      <Dialog open={!!selectedPlayer} onOpenChange={(open) => { if (!open) setSelectedPlayer(null); }}>
        <DialogContent className="max-w-sm mx-auto" data-testid="dialog-player-actions">
          {selectedPlayer && teamPlayers && (
            <PlayerActionDialog
              player={selectedPlayer}
              teamPlayers={teamPlayers}
              salaryCap={salaryCap}
              onClose={() => setSelectedPlayer(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!addSlot} onOpenChange={(open) => { if (!open) setAddSlot(null); }}>
        <DialogContent className="max-w-sm mx-auto" data-testid="dialog-add-player-slot">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <UserPlus className="w-4 h-4" />
              Add Player — {addSlot?.position === "UTIL" ? "Utility" : addSlot?.position}
            </DialogTitle>
          </DialogHeader>
          {addSlot && teamPlayers && (
            <AddPlayerToSlotDialog
              position={addSlot.position}
              isOnField={addSlot.isOnField}
              teamPlayers={teamPlayers}
              salaryCap={salaryCap}
              onClose={() => setAddSlot(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
