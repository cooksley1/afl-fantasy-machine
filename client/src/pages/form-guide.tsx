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
  Gauge,
  Star,
  DollarSign,
  Zap,
} from "lucide-react";
import type { Player } from "@shared/schema";

function ConsistencyBadge({ rating, stdDev, avg }: { rating: number | null; stdDev: number | null; avg: number }) {
  if (rating === null) return null;
  let color = "text-muted-foreground";
  let bgColor = "bg-muted";
  let label = "Volatile";
  if (avg >= 80 && rating >= 7.5) {
    color = "text-green-600 dark:text-green-400";
    bgColor = "bg-green-500/10";
    label = "Elite";
  } else if (avg >= 70 && rating >= 6.5) {
    color = "text-blue-600 dark:text-blue-400";
    bgColor = "bg-blue-500/10";
    label = "Good";
  } else if (rating >= 5.5) {
    color = "text-yellow-600 dark:text-yellow-400";
    bgColor = "bg-yellow-500/10";
    label = "Average";
  } else if (avg < 60 && rating >= 5) {
    color = "text-orange-600 dark:text-orange-400";
    bgColor = "bg-orange-500/10";
    label = "Low Avg";
  } else {
    color = "text-red-500";
    bgColor = "bg-red-500/10";
  }
  return (
    <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${bgColor}`}>
      <Gauge className={`w-3 h-3 ${color}`} />
      <span className={`text-[10px] font-medium ${color}`}>{label}</span>
      {stdDev !== null && (
        <span className="text-[9px] text-muted-foreground">±{stdDev.toFixed(0)}</span>
      )}
    </div>
  );
}

function ScoreSparkline({ scores, avg }: { scores: string | null; avg: number }) {
  if (!scores) return null;
  const nums = scores.split(',').map(Number).filter(n => !isNaN(n));
  if (nums.length === 0) return null;
  const max = Math.max(...nums, avg + 20);
  const min = Math.min(...nums, avg - 20);
  const range = max - min || 1;
  const height = 24;
  const width = 80;
  const step = width / (nums.length - 1 || 1);

  return (
    <div className="flex items-center gap-1.5">
      <svg width={width} height={height} className="shrink-0">
        <line
          x1={0} y1={height - ((avg - min) / range) * height}
          x2={width} y2={height - ((avg - min) / range) * height}
          stroke="currentColor" className="text-muted-foreground/30" strokeWidth={1} strokeDasharray="2,2"
        />
        <polyline
          fill="none"
          stroke="currentColor"
          className="text-primary"
          strokeWidth={1.5}
          points={nums.map((s, i) => `${i * step},${height - ((s - min) / range) * height}`).join(' ')}
        />
        {nums.map((s, i) => (
          <circle
            key={i}
            cx={i * step}
            cy={height - ((s - min) / range) * height}
            r={2}
            className={s >= avg ? "fill-green-500" : "fill-red-400"}
          />
        ))}
      </svg>
      <div className="flex flex-col text-[9px] text-muted-foreground leading-tight">
        {nums.slice(-3).map((s, i) => (
          <span key={i} className={s >= avg ? "text-green-600 dark:text-green-400 font-medium" : "text-red-500"}>
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function FormGuide() {
  const [teamFilter, setTeamFilter] = useState("All Teams");

  const { data: players, isLoading } = useQuery<Player[]>({
    queryKey: ["/api/players"],
  });

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
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

  if (allPlayers.length === 0) {
    return (
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-6xl mx-auto" data-testid="page-form-guide">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Form Guide</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track player form, consistency, and debutant cash cows
          </p>
        </div>
        <Card>
          <CardContent className="py-16 text-center">
            <BarChart3 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-semibold text-lg mb-1" data-testid="text-empty-title">No Form Data Available Yet</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Player form data will appear here once the season begins and scores are recorded. Check back after Round 1.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

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

  const mostConsistent = [...filtered]
    .filter((p) => p.consistencyRating !== null && (p.avgScore || 0) >= 70)
    .sort((a, b) => (b.consistencyRating || 0) - (a.consistencyRating || 0))
    .slice(0, 15);

  const debutants = [...filtered]
    .filter((p) => p.isDebutant)
    .sort((a, b) => {
      const aGen = { elite: 4, high: 3, medium: 2, low: 1 }[a.cashGenPotential || ''] || 0;
      const bGen = { elite: 4, high: 3, medium: 2, low: 1 }[b.cashGenPotential || ''] || 0;
      if (bGen !== aGen) return bGen - aGen;
      return (b.avgScore || 0) - (a.avgScore || 0);
    });

  const breakoutPlayers = [...filtered]
    .filter((p) => (p.breakoutScore ?? 0) >= 0.50)
    .sort((a, b) => (b.breakoutScore ?? 0) - (a.breakoutScore ?? 0));

  const teams = [
    "All Teams",
    ...Array.from(new Set(allPlayers.map((p) => p.team))).sort(),
  ];

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-6xl mx-auto" data-testid="page-form-guide">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Form Guide</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track player form, consistency, and debutant cash cows
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
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <TabsList className="inline-flex w-auto min-w-full sm:grid sm:grid-cols-7 sm:w-full">
            <TabsTrigger value="hot" className="text-xs sm:text-sm" data-testid="tab-hot">
              <Flame className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-1.5" /> Hot
            </TabsTrigger>
            <TabsTrigger value="cold" className="text-xs sm:text-sm" data-testid="tab-cold">
              <Snowflake className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-1.5" /> Cold
            </TabsTrigger>
            <TabsTrigger value="top" className="text-xs sm:text-sm" data-testid="tab-top">
              <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-1.5" /> Top
            </TabsTrigger>
            <TabsTrigger value="rising" className="text-xs sm:text-sm" data-testid="tab-rising">
              <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-1.5" /> Rising
            </TabsTrigger>
            <TabsTrigger value="consistent" className="text-xs sm:text-sm" data-testid="tab-consistent">
              <Gauge className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-1.5" /> Consistent
            </TabsTrigger>
            <TabsTrigger value="breakouts" className="text-xs sm:text-sm" data-testid="tab-breakouts">
              <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-1.5" /> Breakouts
              {breakoutPlayers.length > 0 && (
                <span className="ml-1 text-[10px] opacity-70">({breakoutPlayers.length})</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="debutants" className="text-xs sm:text-sm" data-testid="tab-debutants">
              <Star className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-1.5" /> Debutants
              {debutants.length > 0 && (
                <span className="ml-1 text-[10px] opacity-70">({debutants.length})</span>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

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

        <TabsContent value="consistent">
          <ConsistentList players={mostConsistent} />
        </TabsContent>

        <TabsContent value="breakouts">
          <BreakoutList players={breakoutPlayers} />
        </TabsContent>

        <TabsContent value="debutants">
          <DebutantList players={debutants} />
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
                <p className="text-sm font-semibold">{player.name}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs text-muted-foreground">
                    {player.team} | ${(player.price / 1000).toFixed(0)}K
                  </p>
                  <ConsistencyBadge rating={player.consistencyRating} stdDev={player.scoreStdDev} avg={player.avgScore || 0} />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-4">
              <div className="hidden sm:block text-right">
                <p className="text-sm font-mono font-medium">{player.avgScore?.toFixed(1)}</p>
                <p className="text-[10px] text-muted-foreground">Season Avg</p>
              </div>
              <div className="text-right">
                <p className="text-xs sm:text-sm font-mono font-medium">{player.last3Avg?.toFixed(1)}</p>
                <p className="text-[10px] text-muted-foreground">L3</p>
              </div>
              <div className="text-right">
                <p className="text-xs sm:text-sm font-mono font-medium">{player.last5Avg?.toFixed(1)}</p>
                <p className="text-[10px] text-muted-foreground">L5</p>
              </div>
              <div className="w-6 sm:w-10 flex justify-center">
                {player.formTrend === "up" ? (
                  <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-500" />
                ) : player.formTrend === "down" ? (
                  <TrendingDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-500" />
                ) : (
                  <Minus className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
                )}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ConsistentList({ players }: { players: Player[] }) {
  if (players.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground text-sm">
          No consistency data available yet
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card className="bg-muted/30">
        <CardContent className="p-3">
          <p className="text-xs text-muted-foreground">
            <Gauge className="w-3 h-3 inline mr-1" />
            Players ranked by scoring consistency (low standard deviation + high average). 
            Elite consistency means reliably scoring within a tight range - the backbone of your team.
            ±N shows the typical score variation from their average.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-3 space-y-0.5">
          {players.map((player, i) => (
            <div
              key={player.id}
              className="flex items-center justify-between py-3 px-3 rounded-md hover-elevate"
              data-testid={`card-consistent-player-${player.id}`}
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
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{player.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {player.team} | ${(player.price / 1000).toFixed(0)}K | Avg: {player.avgScore?.toFixed(1)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                <div className="hidden sm:block">
                  <ScoreSparkline scores={player.recentScores} avg={player.avgScore || 0} />
                </div>
                <ConsistencyBadge rating={player.consistencyRating} stdDev={player.scoreStdDev} avg={player.avgScore || 0} />
                <div className="text-right">
                  <p className="text-sm font-mono font-bold" data-testid={`text-consistency-rating-${player.id}`}>
                    {player.consistencyRating?.toFixed(1)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">/10</p>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function DebutantList({ players }: { players: Player[] }) {
  if (players.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Star className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-semibold text-lg mb-1">No debutants found</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Debutants are first-year players who make their AFL debut during the season.
            They start at basement prices and can generate significant cash as they score above their break-even.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card className="bg-purple-500/5 border-purple-500/20">
        <CardContent className="p-3">
          <p className="text-xs text-muted-foreground">
            <Star className="w-3 h-3 inline mr-1 text-purple-500" />
            Season debutants at basement prices with cash generation potential. These players can rise rapidly in value
            as they score above their break-even. The best cash cows score 20+ above their BE consistently.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-3 space-y-0.5">
          {players.map((player, i) => {
            const scoringAboveBE = (player.avgScore || 0) - (player.breakEven || 0);
            const cashColors: Record<string, string> = {
              elite: "text-green-600 dark:text-green-400",
              high: "text-blue-600 dark:text-blue-400",
              medium: "text-yellow-600 dark:text-yellow-400",
              low: "text-muted-foreground",
            };
            return (
              <div
                key={player.id}
                className="flex items-center justify-between py-3 px-3 rounded-md hover-elevate"
                data-testid={`card-debutant-${player.id}`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="text-xs font-bold text-muted-foreground w-5 text-right">
                    {i + 1}
                  </span>
                  <div className="w-9 h-9 rounded-md bg-purple-500/10 flex items-center justify-center shrink-0">
                    <Star className="w-4 h-4 text-purple-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold">{player.name}</p>
                      {player.debutRound && (
                        <Badge variant="outline" className="text-[10px] border-purple-500/50 text-purple-600 dark:text-purple-400">
                          Debut R{player.debutRound}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {player.team} | {player.position}{player.dualPosition ? `/${player.dualPosition}` : ''} | ${(player.price / 1000).toFixed(0)}K
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                  <div className="text-right">
                    <p className="text-xs font-mono">{player.avgScore?.toFixed(1)}</p>
                    <p className="text-[10px] text-muted-foreground">Avg</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-xs font-mono ${player.breakEven && player.avgScore && player.breakEven < player.avgScore ? 'text-green-500' : 'text-red-500'}`}>
                      {player.breakEven ?? '-'}
                    </p>
                    <p className="text-[10px] text-muted-foreground">BE</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-mono font-bold ${cashColors[player.cashGenPotential || ''] || 'text-muted-foreground'}`}
                       data-testid={`text-cash-gen-${player.id}`}>
                      +{scoringAboveBE > 0 ? scoringAboveBE.toFixed(0) : '0'}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      <DollarSign className="w-2.5 h-2.5 inline" />
                      {player.cashGenPotential || 'none'}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function BreakoutList({ players }: { players: Player[] }) {
  if (players.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Zap className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-semibold text-lg mb-1">No breakout candidates</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Breakout candidates are players showing signs of a significant scoring increase based on form trends,
            output increases, and age profile.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card className="bg-orange-500/5 border-orange-500/20">
        <CardContent className="p-3">
          <p className="text-xs text-muted-foreground">
            <Zap className="w-3 h-3 inline mr-1 text-orange-500" />
            Breakout score combines form trend (40%), output increase (25%), disposal proxy (20%), and age factor (15%).
            Scores above 65 are flagged as hot breakout candidates. Scores 50-64 are warm prospects to watch.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-3 space-y-0.5">
          {players.map((player, i) => {
            const score = player.breakoutScore ?? 0;
            const isHot = score >= 0.65;
            return (
              <div
                key={player.id}
                className="flex items-center justify-between py-3 px-3 rounded-md hover-elevate"
                data-testid={`card-breakout-player-${player.id}`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="text-xs font-bold text-muted-foreground w-5 text-right">
                    {i + 1}
                  </span>
                  <div className={`w-9 h-9 rounded-md flex items-center justify-center shrink-0 ${isHot ? 'bg-red-500/10' : 'bg-amber-500/10'}`}>
                    <Zap className={`w-4 h-4 ${isHot ? 'text-red-500' : 'text-amber-500'}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold">{player.name}</p>
                      <Badge
                        variant={isHot ? "destructive" : "secondary"}
                        className="text-[10px]"
                      >
                        {isHot ? 'Hot' : 'Warm'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {player.team} | {player.position}{player.dualPosition ? `/${player.dualPosition}` : ''} | ${(player.price / 1000).toFixed(0)}K
                      {player.age ? ` | Age ${player.age}` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                  <div className="text-right hidden sm:block">
                    <p className="text-xs font-mono">{player.avgScore?.toFixed(1)}</p>
                    <p className="text-[10px] text-muted-foreground">Avg</p>
                  </div>
                  <div className="text-right hidden sm:block">
                    <p className="text-xs font-mono">{player.last3Avg?.toFixed(1)}</p>
                    <p className="text-[10px] text-muted-foreground">L3</p>
                  </div>
                  <div className="w-20 sm:w-24">
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full ${isHot ? 'bg-red-500' : 'bg-amber-500'}`}
                          style={{ width: `${Math.min(100, score * 100)}%` }}
                        />
                      </div>
                      <span className={`text-xs font-mono font-bold ${isHot ? 'text-red-500' : 'text-amber-600 dark:text-amber-400'}`}
                            data-testid={`text-breakout-score-${player.id}`}>
                        {(score * 100).toFixed(0)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
