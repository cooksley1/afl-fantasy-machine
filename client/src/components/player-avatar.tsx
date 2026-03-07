import { useState } from "react";
import { getTeamColors, getTeamAbbr } from "@/lib/afl-teams";

export function getPlayerPhotoUrl(aflFantasyId: number | null | undefined): string | null {
  if (!aflFantasyId) return null;
  return `https://fantasy.afl.com.au/assets/media/players/afl/${aflFantasyId}.webp`;
}

export function PlayerAvatar({
  aflFantasyId,
  playerName,
  team,
  size = "sm",
  className = "",
}: {
  aflFantasyId?: number | null;
  playerName: string;
  team: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const [imgError, setImgError] = useState(false);
  const photoUrl = getPlayerPhotoUrl(aflFantasyId);
  const teamColors = getTeamColors(team);
  const abbr = getTeamAbbr(team);

  const sizeClasses = {
    xs: "w-7 h-7",
    sm: "w-9 h-9",
    md: "w-11 h-11",
    lg: "w-14 h-14",
  };

  const textSizes = {
    xs: "text-[8px]",
    sm: "text-[9px]",
    md: "text-[11px]",
    lg: "text-sm",
  };

  const sizeClass = sizeClasses[size];
  const textSize = textSizes[size];

  if (photoUrl && !imgError) {
    return (
      <div
        className={`${sizeClass} rounded-full overflow-hidden border shrink-0 bg-muted ${className}`}
        style={{ borderColor: teamColors.primary }}
        data-testid={`avatar-${playerName.replace(/\s+/g, "-").toLowerCase()}`}
      >
        <img
          src={photoUrl}
          alt={playerName}
          className="w-full h-full object-cover object-top"
          loading="lazy"
          onError={() => setImgError(true)}
        />
      </div>
    );
  }

  return (
    <div
      className={`${sizeClass} rounded-full flex items-center justify-center shrink-0 border ${className}`}
      style={{ backgroundColor: teamColors.primary, borderColor: teamColors.secondary }}
      data-testid={`avatar-${playerName.replace(/\s+/g, "-").toLowerCase()}`}
    >
      <span className={`${textSize} font-bold`} style={{ color: teamColors.text }}>{abbr}</span>
    </div>
  );
}
