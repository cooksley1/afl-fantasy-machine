import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Flame,
  Snowflake,
  BarChart3,
} from "lucide-react";
import type { Player } from "@shared/schema";

export default function FormGuide() {
  const [teamFilter, setTeamFilter] = useState("All Teams");

  const { data: players, isLoading } = useQuery<Player[]>({
    queryKey: ["/api/players"],
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-60 rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  const allPlayers = players || [];
  const filtered =
    teamFilter === "All Teams"
      ? allPlayers
      : allPlayers.filter((p) => p.team === teamFilter);

  const hotPlayers = filtered
    .filter((p) => p.formTrend === "up")
    .sort((a, b) => (b.last3Avg || 0) - (a.last3Avg || 0))
    .slice(0, 10);

  const coldPlayers = filtered
    .filter((p) => p.formTrend === "down")
    .sort((a, b) => (a.last3Avg || 0) - (b.last3Avg || 0))
    .slice(0, 10);

  const topScorers = [...filtered]
    .sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0))
    .slice(0, 10);

  const risingStars = [...filtered]
    .filter((p) => p.last3Avg > p.avgScore * 1.1)
    .sort((a, b) => (b.last3Avg - b.avgScore) - (a.last3Avg - a.avgScore))
    .slice(0, 10);

  const teams = [
    "All Teams",
    ...Array.from(new Set(allPlayers.map((p) => p.team))).sort(),
  ];

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto" data-testid="page-form-guide">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Form Guide</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track player form and identify trends
          </p>
        </div>
        <Select value={teamFilter} onValueChange={setTeamFilter}>
          <SelectTrigger className="w-full sm:w-48" data-testid="select-team-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {teams.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="hot">
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="hot" data-testid="tab-hot">
            <Flame className="w-4 h-4 mr-1.5" /> Hot
          </TabsTrigger>
          <TabsTrigger value="cold" data-testid="tab-cold">
            <Snowflake className="w-4 h-4 mr-1.5" /> Cold
          </TabsTrigger>
          <TabsTrigger value="top" data-testid="tab-top">
            <BarChart3 className="w-4 h-4 mr-1.5" /> Top Scorers
          </TabsTrigger>
          <TabsTrigger value="rising" data-testid="tab-rising">
            <TrendingUp className="w-4 h-4 mr-1.5" /> Rising
          </TabsTrigger>
        </TabsList>

        <TabsContent value="hot">
          <FormList
            players={hotPlayers}
            emptyText="No players trending up currently"
            highlightColor="green"
          />
        </TabsContent>

        <TabsContent value="cold">
          <FormList
            players={coldPlayers}
            emptyText="No players trending down currently"
            highlightColor="red"
          />
        </TabsContent>

        <TabsContent value="top">
          <FormList
            players={topScorers}
            emptyText="No players found"
            highlightColor="blue"
          />
        </TabsContent>

        <TabsContent value="rising">
          <FormList
            players={risingStars}
            emptyText="No rising stars found"
            highlightColor="green"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function FormList({
  players,
  emptyText,
  highlightColor,
}: {
  players: Player[];
  emptyText: string;
  highlightColor: string;
}) {
  if (players.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground text-sm">
          {emptyText}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-3 space-y-0.5">
        {players.map((player, i) => (
          <div
            key={player.id}
            className="flex items-center justify-between py-3 px-3 rounded-md hover-elevate"
            data-testid={`card-form-player-${player.id}`}
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <span className="text-xs font-bold text-muted-foreground w-5 text-right">
                {i + 1}
              </span>
              <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center shrink-0">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">
                  {player.position.slice(0, 3)}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{player.name}</p>
                <p className="text-xs text-muted-foreground">
                  {player.team} | ${(player.price / 1000).toFixed(0)}K
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="hidden sm:block text-right">
                <p className="text-sm font-mono font-medium">{player.avgScore?.toFixed(1)}</p>
                <p className="text-[10px] text-muted-foreground">Season Avg</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-mono font-medium">{player.last3Avg?.toFixed(1)}</p>
                <p className="text-[10px] text-muted-foreground">Last 3</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-mono font-medium">{player.last5Avg?.toFixed(1)}</p>
                <p className="text-[10px] text-muted-foreground">Last 5</p>
              </div>
              <div className="w-10 flex justify-center">
                {player.formTrend === "up" ? (
                  <TrendingUp className="w-4 h-4 text-green-500" />
                ) : player.formTrend === "down" ? (
                  <TrendingDown className="w-4 h-4 text-red-500" />
                ) : (
                  <Minus className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
