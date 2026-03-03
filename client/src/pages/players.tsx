import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  UserPlus,
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowUpDown,
  AlertTriangle,
  Repeat2,
  Gauge,
  Star,
  DollarSign,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import type { Player, PlayerWithTeamInfo } from "@shared/schema";

const AFL_TEAMS = [
  "All Teams",
  "Adelaide",
  "Brisbane Lions",
  "Carlton",
  "Collingwood",
  "Essendon",
  "Fremantle",
  "Geelong",
  "Gold Coast",
  "GWS Giants",
  "Hawthorn",
  "Melbourne",
  "North Melbourne",
  "Port Adelaide",
  "Richmond",
  "St Kilda",
  "Sydney",
  "West Coast",
  "Western Bulldogs",
];

const POSITIONS = ["All Positions", "DEF", "MID", "RUC", "FWD"];

type SortField = "avgScore" | "price" | "last3Avg" | "ownedByPercent" | "name" | "consistencyRating";

export default function Players() {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("All Teams");
  const [posFilter, setPosFilter] = useState("All Positions");
  const [sortBy, setSortBy] = useState<SortField>("avgScore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const { data: players, isLoading } = useQuery<Player[]>({
    queryKey: ["/api/players"],
  });

  const { data: myTeam } = useQuery<PlayerWithTeamInfo[]>({
    queryKey: ["/api/my-team"],
  });

  const addMutation = useMutation({
    mutationFn: (data: { playerId: number; fieldPosition: string }) =>
      apiRequest("POST", "/api/my-team", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-team"] });
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      toast({ title: "Player added to team" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const myTeamPlayerIds = new Set(myTeam?.map((p) => p.id) || []);

  const filtered = (players || [])
    .filter((p) => {
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (teamFilter !== "All Teams" && p.team !== teamFilter) return false;
      if (posFilter !== "All Positions" && p.position !== posFilter) return false;
      return true;
    })
    .sort((a, b) => {
      const aVal = a[sortBy] ?? 0;
      const bVal = b[sortBy] ?? 0;
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === "asc"
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });

  const toggleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir("desc");
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-4">
        <Skeleton className="h-8 w-40" />
        <div className="flex flex-col sm:flex-row gap-3">
          <Skeleton className="h-9 w-full sm:flex-1" />
          <Skeleton className="h-9 w-full sm:w-36" />
          <Skeleton className="h-9 w-full sm:w-36" />
        </div>
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-24 sm:h-14 rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  const FormIcon = ({ trend }: { trend: string }) => {
    if (trend === "up") return <TrendingUp className="w-4 h-4 text-green-500" />;
    if (trend === "down") return <TrendingDown className="w-4 h-4 text-red-500" />;
    return <Minus className="w-4 h-4 text-muted-foreground" />;
  };

  const ConsistencyIndicator = ({ rating, stdDev, avg }: { rating: number | null; stdDev: number | null; avg: number }) => {
    if (rating === null) return null;
    let color = "text-muted-foreground";
    let bgColor = "bg-muted";
    let label = "Low";
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
      label = "Avg";
    } else if (avg < 60 && rating >= 5) {
      color = "text-orange-600 dark:text-orange-400";
      bgColor = "bg-orange-500/10";
      label = "Low Avg";
    } else {
      color = "text-red-500";
      bgColor = "bg-red-500/10";
      label = "Volatile";
    }
    return (
      <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${bgColor}`} data-testid="indicator-consistency">
        <Gauge className={`w-3 h-3 ${color}`} />
        <span className={`text-[10px] font-medium ${color}`}>{label}</span>
        {stdDev !== null && (
          <span className="text-[9px] text-muted-foreground">±{stdDev.toFixed(0)}</span>
        )}
      </div>
    );
  };

  const CashGenBadge = ({ potential }: { potential: string | null }) => {
    if (!potential) return null;
    const colors: Record<string, string> = {
      elite: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30",
      high: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
      medium: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30",
      low: "bg-muted text-muted-foreground",
    };
    return (
      <Badge variant="outline" className={`text-[10px] gap-0.5 ${colors[potential] || ''}`} data-testid="badge-cash-gen">
        <DollarSign className="w-2.5 h-2.5" />
        {potential === "elite" ? "Cash Gen $$" : potential === "high" ? "Cash Gen $" : "Cash Gen"}
      </Badge>
    );
  };

  const PlayerBadges = ({ player, isOnTeam }: { player: Player; isOnTeam: boolean }) => (
    <div className="flex items-center gap-1.5 flex-wrap">
      {player.dualPosition && (
        <Badge variant="secondary" className="text-[10px] gap-0.5">
          <Repeat2 className="w-2.5 h-2.5" />
          {player.position}/{player.dualPosition}
        </Badge>
      )}
      {player.isDebutant && (
        <Badge variant="outline" className="text-[10px] gap-0.5 border-purple-500/50 text-purple-600 dark:text-purple-400 bg-purple-500/10" data-testid="badge-debutant">
          <Star className="w-2.5 h-2.5" />
          Debut{player.debutRound ? ` R${player.debutRound}` : ''}
        </Badge>
      )}
      <CashGenBadge potential={player.cashGenPotential} />
      {player.injuryStatus && (
        <Badge variant="destructive" className="text-[10px]">
          <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
          {player.injuryStatus}
        </Badge>
      )}
      {player.lateChange && (
        <Badge variant="destructive" className="text-[10px]">
          Late Change
        </Badge>
      )}
      {isOnTeam && (
        <Badge variant="default" className="text-[10px]">
          In Team
        </Badge>
      )}
    </div>
  );

  const renderMobileCard = (player: Player) => {
    const isOnTeam = myTeamPlayerIds.has(player.id);
    return (
      <Card
        key={player.id}
        className={isOnTeam ? "bg-primary/5" : ""}
        data-testid={`card-player-${player.id}`}
      >
        <CardContent className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2.5 min-w-0 flex-1">
              <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center shrink-0">
                <span className="text-[10px] font-bold text-muted-foreground uppercase">
                  {player.position.slice(0, 3)}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate" data-testid={`text-player-name-${player.id}`}>
                  {player.name}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {player.team}
                  {player.nextOpponent && ` vs ${player.nextOpponent}`}
                </p>
                <div className="mt-1.5">
                  <PlayerBadges player={player} isOnTeam={isOnTeam} />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <FormIcon trend={player.formTrend} />
              {!isOnTeam && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() =>
                    addMutation.mutate({
                      playerId: player.id,
                      fieldPosition: player.position,
                    })
                  }
                  disabled={addMutation.isPending}
                  data-testid={`button-add-player-${player.id}`}
                >
                  <UserPlus className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-5 gap-1.5 mt-3 pt-2.5 border-t border-border/50">
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Avg</p>
              <p className="text-sm font-mono font-medium" data-testid={`text-avg-${player.id}`}>
                {player.avgScore?.toFixed(1)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Price</p>
              <p className="text-sm font-mono font-medium" data-testid={`text-price-${player.id}`}>
                ${(player.price / 1000).toFixed(0)}K
              </p>
              {player.priceChange !== 0 && (
                <p className={`text-[10px] font-mono ${player.priceChange > 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {player.priceChange > 0 ? '+' : ''}{(player.priceChange / 1000).toFixed(0)}K
                </p>
              )}
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">L3</p>
              <p className="text-sm font-mono text-muted-foreground" data-testid={`text-l3-${player.id}`}>
                {player.last3Avg?.toFixed(1)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">BE</p>
              <p className={`text-sm font-mono ${
                player.breakEven && player.avgScore && player.breakEven < player.avgScore
                  ? 'text-green-500'
                  : player.breakEven && player.avgScore && player.breakEven > player.avgScore
                  ? 'text-red-500'
                  : 'text-muted-foreground'
              }`} data-testid={`text-be-${player.id}`}>
                {player.breakEven ?? '-'}
              </p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Con</p>
              <ConsistencyIndicator rating={player.consistencyRating} stdDev={player.scoreStdDev} avg={player.avgScore || 0} />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderDesktopRow = (player: Player) => {
    const isOnTeam = myTeamPlayerIds.has(player.id);
    return (
      <div
        key={player.id}
        className={`flex items-center justify-between py-2.5 px-3 rounded-md hover-elevate ${
          isOnTeam ? "bg-primary/5" : ""
        }`}
        data-testid={`card-player-${player.id}`}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center shrink-0">
            <span className="text-[10px] font-bold text-muted-foreground uppercase">
              {player.position.slice(0, 3)}
            </span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium truncate">{player.name}</p>
              <PlayerBadges player={player} isOnTeam={isOnTeam} />
            </div>
            <p className="text-xs text-muted-foreground">
              {player.team}
              {player.nextOpponent && ` vs ${player.nextOpponent}`}
              {player.venue && ` @ ${player.venue}`}
              {player.projectedScore ? ` | Proj: ${player.projectedScore.toFixed(0)}` : ''}
              {player.ceilingScore ? ` | Ceil: ${player.ceilingScore}` : ''}
            </p>
          </div>
        </div>

        <div className="hidden md:block w-16 text-center">
          <span className="text-sm font-mono font-medium">{player.avgScore?.toFixed(1)}</span>
        </div>
        <div className="hidden md:block w-14 text-center">
          <span className="text-sm font-mono text-muted-foreground">
            {player.last3Avg?.toFixed(1)}
          </span>
        </div>
        <div className="hidden lg:block w-20 text-center">
          <div className="text-sm font-mono">${(player.price / 1000).toFixed(0)}K</div>
          {player.priceChange !== 0 && (
            <div className={`text-[10px] ${player.priceChange > 0 ? 'text-green-500' : 'text-red-500'}`}>
              {player.priceChange > 0 ? '+' : ''}{(player.priceChange / 1000).toFixed(0)}K
            </div>
          )}
        </div>
        <div className="hidden xl:block w-14 text-center">
          <span className={`text-sm font-mono ${
            player.breakEven && player.avgScore && player.breakEven < player.avgScore
              ? 'text-green-500'
              : player.breakEven && player.avgScore && player.breakEven > player.avgScore
              ? 'text-red-500'
              : 'text-muted-foreground'
          }`}>
            {player.breakEven ?? '-'}
          </span>
        </div>
        <div className="hidden xl:block w-16 text-center">
          <ConsistencyIndicator rating={player.consistencyRating} stdDev={player.scoreStdDev} avg={player.avgScore || 0} />
        </div>
        <div className="hidden lg:block w-14 text-center">
          <span className="text-xs text-muted-foreground">
            {player.ownedByPercent?.toFixed(0)}%
          </span>
        </div>
        <div className="w-12 flex justify-center">
          <FormIcon trend={player.formTrend} />
        </div>
        <div className="w-10 flex justify-end">
          {!isOnTeam && (
            <Button
              size="icon"
              variant="ghost"
              onClick={() =>
                addMutation.mutate({
                  playerId: player.id,
                  fieldPosition: player.position,
                })
              }
              disabled={addMutation.isPending}
              data-testid={`button-add-player-${player.id}`}
            >
              <UserPlus className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 max-w-6xl mx-auto" data-testid="page-players">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight" data-testid="text-page-title">Player Database</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {filtered.length} players available
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search players..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-players"
          />
        </div>
        <div className="flex gap-2 w-full">
          <Select value={teamFilter} onValueChange={setTeamFilter}>
            <SelectTrigger className="flex-1 sm:flex-none sm:w-44" data-testid="select-team-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AFL_TEAMS.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={posFilter} onValueChange={setPosFilter}>
            <SelectTrigger className="flex-1 sm:flex-none sm:w-40" data-testid="select-position-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {POSITIONS.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {isMobile && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {(["avgScore", "price", "consistencyRating", "name"] as SortField[]).map((field) => (
              <Button
                key={field}
                variant={sortBy === field ? "default" : "outline"}
                size="sm"
                onClick={() => toggleSort(field)}
                className="shrink-0"
                data-testid={`button-sort-${field}`}
              >
                {field === "avgScore" ? "Avg" : field === "price" ? "Price" : field === "consistencyRating" ? "Consistency" : "Name"}
                <ArrowUpDown className="w-3 h-3 ml-1" />
              </Button>
            ))}
          </div>
        )}
      </div>

      {isMobile ? (
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No players match your filters
            </div>
          ) : (
            filtered.slice(0, 50).map((player) => renderMobileCard(player))
          )}
        </div>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-3 text-xs text-muted-foreground font-medium uppercase tracking-wide px-1">
              <div className="flex-1 min-w-0">
                <button
                  onClick={() => toggleSort("name")}
                  className="flex items-center gap-1"
                  data-testid="button-sort-name"
                >
                  Player <ArrowUpDown className="w-3 h-3" />
                </button>
              </div>
              <div className="hidden md:block w-16 text-center">
                <button
                  onClick={() => toggleSort("avgScore")}
                  className="flex items-center gap-1 mx-auto"
                  data-testid="button-sort-avg"
                >
                  Avg <ArrowUpDown className="w-3 h-3" />
                </button>
              </div>
              <div className="hidden md:block w-14 text-center">L3</div>
              <div className="hidden lg:block w-20 text-center">
                <button
                  onClick={() => toggleSort("price")}
                  className="flex items-center gap-1 mx-auto"
                  data-testid="button-sort-price"
                >
                  Price <ArrowUpDown className="w-3 h-3" />
                </button>
              </div>
              <div className="hidden xl:block w-14 text-center">BE</div>
              <div className="hidden xl:block w-16 text-center">
                <button
                  onClick={() => toggleSort("consistencyRating")}
                  className="flex items-center gap-1 mx-auto"
                  data-testid="button-sort-consistency"
                >
                  Con <ArrowUpDown className="w-3 h-3" />
                </button>
              </div>
              <div className="hidden lg:block w-14 text-center">Own%</div>
              <div className="w-12 text-center">Form</div>
              <div className="w-10"></div>
            </div>
          </CardHeader>
          <CardContent className="space-y-0.5 p-3">
            {filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                No players match your filters
              </div>
            ) : (
              filtered.slice(0, 50).map((player) => renderDesktopRow(player))
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
