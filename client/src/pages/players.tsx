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
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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

type SortField = "avgScore" | "price" | "last3Avg" | "ownedByPercent" | "name";

export default function Players() {
  const { toast } = useToast();
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
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-40" />
        <div className="flex gap-3">
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-9 w-36" />
        </div>
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto" data-testid="page-players">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Player Database</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {filtered.length} players available
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search players..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-players"
          />
        </div>
        <Select value={teamFilter} onValueChange={setTeamFilter}>
          <SelectTrigger className="w-full sm:w-44" data-testid="select-team-filter">
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
          <SelectTrigger className="w-full sm:w-40" data-testid="select-position-filter">
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
            filtered.slice(0, 50).map((player) => {
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
                        {player.injuryStatus && (
                          <AlertTriangle className="w-3 h-3 text-destructive shrink-0" />
                        )}
                        {isOnTeam && (
                          <Badge variant="default" className="text-[10px]">
                            In Team
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {player.team}
                        {player.nextOpponent && ` vs ${player.nextOpponent}`}
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
                    <span className="text-sm font-mono">${(player.price / 1000).toFixed(0)}K</span>
                  </div>
                  <div className="hidden lg:block w-14 text-center">
                    <span className="text-xs text-muted-foreground">
                      {player.ownedByPercent?.toFixed(0)}%
                    </span>
                  </div>
                  <div className="w-12 flex justify-center">
                    {player.formTrend === "up" ? (
                      <TrendingUp className="w-4 h-4 text-green-500" />
                    ) : player.formTrend === "down" ? (
                      <TrendingDown className="w-4 h-4 text-red-500" />
                    ) : (
                      <Minus className="w-4 h-4 text-muted-foreground" />
                    )}
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
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
