import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Ban, ShieldAlert, Clock, CircleAlert } from "lucide-react";
import type { Player } from "@shared/schema";

type AvailabilityLevel = "out" | "doubtful" | "warning" | "available";

interface AvailabilityInfo {
  level: AvailabilityLevel;
  label: string;
  detail?: string;
}

const OUT_KEYWORDS = ["ACL", "knee reconstruction", "season", "indefinite", "retired", "delisted", "suspended"];
const LONG_KEYWORDS = ["6-8", "8-10", "10-12", "6-10", "8-12", "long term"];

function parseWeeksOut(status: string): string | null {
  const match = status.match(/(\d+[-–]\d+\s*weeks?)/i);
  if (match) return match[1];
  const singleMatch = status.match(/(\d+)\s*weeks?/i);
  if (singleMatch) return `${singleMatch[1]} weeks`;
  return null;
}

function getAvailability(player: Pick<Player, "injuryStatus" | "selectionStatus" | "isNamedTeam" | "lateChange">): AvailabilityInfo | null {
  if (player.injuryStatus) {
    const status = player.injuryStatus;
    const isDefinitelyOut = OUT_KEYWORDS.some(k => status.toLowerCase().includes(k.toLowerCase()));
    const isLongTerm = LONG_KEYWORDS.some(k => status.toLowerCase().includes(k.toLowerCase()));
    const weeks = parseWeeksOut(status);

    if (isDefinitelyOut) {
      return { level: "out", label: "OUT", detail: status };
    }
    if (isLongTerm) {
      return { level: "out", label: weeks || "Long Term", detail: status };
    }
    if (weeks) {
      return { level: "doubtful", label: weeks, detail: status };
    }
    if (status.toLowerCase().includes("test") || status.toLowerCase().includes("managed")) {
      return { level: "warning", label: "Test", detail: status };
    }
    return { level: "doubtful", label: "Injured", detail: status };
  }

  if (player.selectionStatus === "omitted") {
    return { level: "out", label: "Omitted", detail: "Dropped from team" };
  }

  if (player.isNamedTeam === false) {
    return { level: "out", label: "Not Named", detail: "Not in selected team" };
  }

  if (player.lateChange) {
    return { level: "warning", label: "Late Change", detail: "Late team change" };
  }

  if (player.selectionStatus === "emergency") {
    return { level: "warning", label: "Emergency", detail: "Named as emergency" };
  }

  return null;
}

const levelStyles: Record<AvailabilityLevel, string> = {
  out: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
  doubtful: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30",
  warning: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  available: "",
};

const levelIcons: Record<AvailabilityLevel, typeof AlertTriangle> = {
  out: Ban,
  doubtful: ShieldAlert,
  warning: CircleAlert,
  available: Clock,
};

interface PlayerAvailabilityBadgeProps {
  player: Pick<Player, "injuryStatus" | "selectionStatus" | "isNamedTeam" | "lateChange">;
  size?: "sm" | "md";
  showDetail?: boolean;
}

export function PlayerAvailabilityBadge({ player, size = "sm", showDetail = false }: PlayerAvailabilityBadgeProps) {
  const info = getAvailability(player);
  if (!info) return null;

  const Icon = levelIcons[info.level];
  const textSize = size === "sm" ? "text-[10px]" : "text-xs";

  return (
    <Badge
      variant="outline"
      className={`${textSize} gap-0.5 ${levelStyles[info.level]}`}
      data-testid={`badge-availability-${info.level}`}
      title={info.detail}
    >
      <Icon className={size === "sm" ? "w-2.5 h-2.5" : "w-3 h-3"} />
      {info.label}
      {showDetail && info.detail && info.detail !== info.label && (
        <span className="opacity-70 ml-0.5">— {info.detail}</span>
      )}
    </Badge>
  );
}

interface PlayerAvailabilityIndicatorProps {
  player: Pick<Player, "injuryStatus" | "selectionStatus" | "isNamedTeam" | "lateChange">;
}

export function PlayerAvailabilityDot({ player }: PlayerAvailabilityIndicatorProps) {
  const info = getAvailability(player);
  if (!info) return null;

  const dotColor: Record<AvailabilityLevel, string> = {
    out: "bg-red-500",
    doubtful: "bg-orange-500",
    warning: "bg-amber-500",
    available: "bg-green-500",
  };

  return (
    <div
      className={`w-2 h-2 rounded-full ${dotColor[info.level]} shrink-0`}
      title={`${info.label}${info.detail ? `: ${info.detail}` : ""}`}
      data-testid={`dot-availability-${info.level}`}
    />
  );
}

export { getAvailability, type AvailabilityInfo, type AvailabilityLevel };
