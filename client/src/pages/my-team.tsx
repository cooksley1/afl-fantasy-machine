import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Crown,
  Shield,
  UserMinus,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { PlayerWithTeamInfo, LeagueSettings } from "@shared/schema";

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

function PlayerRow({
  player,
  onRemove,
  onSetCaptain,
  onSetViceCaptain,
}: {
  player: PlayerWithTeamInfo;
  onRemove: (id: number) => void;
  onSetCaptain: (id: number) => void;
  onSetViceCaptain: (id: number) => void;
}) {
  return (
    <div
      className="flex items-center justify-between py-3 px-4 rounded-md hover-elevate group"
      data-testid={`card-team-player-${player.id}`}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
          <span className="text-xs font-bold text-primary uppercase">
            {player.position.slice(0, 3)}
          </span>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold truncate">{player.name}</p>
            {player.isCaptain && (
              <Badge variant="default" className="bg-accent text-accent-foreground text-[10px]">
                <Crown className="w-3 h-3 mr-0.5" /> C
              </Badge>
            )}
            {player.isViceCaptain && (
              <Badge variant="secondary" className="text-[10px]">
                <Shield className="w-3 h-3 mr-0.5" /> VC
              </Badge>
            )}
            {player.injuryStatus && (
              <Badge variant="destructive" className="text-[10px]">
                <AlertTriangle className="w-3 h-3 mr-0.5" /> {player.injuryStatus}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {player.team} | ${(player.price / 1000).toFixed(0)}K
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        <div className="flex items-center gap-2 sm:gap-3 text-right">
          <div>
            <p className="text-xs sm:text-sm font-mono font-medium">{player.avgScore?.toFixed(1)}</p>
            <p className="text-[10px] text-muted-foreground">Avg</p>
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-mono font-medium">{player.last3Avg?.toFixed(1)}</p>
            <p className="text-[10px] text-muted-foreground">L3</p>
          </div>
          <div className="hidden sm:block">
            <FormBadge trend={player.formTrend} />
          </div>
        </div>

        <div className="flex items-center gap-0.5 sm:gap-1">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onSetCaptain(player.myTeamPlayerId!)}
            className={player.isCaptain ? "text-accent" : ""}
            data-testid={`button-captain-${player.id}`}
          >
            <Crown className="w-4 h-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onSetViceCaptain(player.myTeamPlayerId!)}
            className={player.isViceCaptain ? "text-primary" : ""}
            data-testid={`button-vc-${player.id}`}
          >
            <Shield className="w-4 h-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onRemove(player.myTeamPlayerId!)}
            data-testid={`button-remove-${player.id}`}
          >
            <UserMinus className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function MyTeam() {
  const { toast } = useToast();

  const { data: teamPlayers, isLoading } = useQuery<PlayerWithTeamInfo[]>({
    queryKey: ["/api/my-team"],
  });

  const { data: settings } = useQuery<LeagueSettings>({
    queryKey: ["/api/settings"],
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/my-team/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-team"] });
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

  const positions = ["DEF", "MID", "RUC", "FWD"];
  const getPlayersByPosition = (pos: string) =>
    (teamPlayers || []).filter((p) => p.fieldPosition === pos);
  const benchPlayers = (teamPlayers || []).filter((p) => !p.isOnField);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">My Team</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {teamPlayers?.length || 0} players selected
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Badge variant="secondary" className="text-sm py-1 px-3">
            Salary: ${(totalSalary / 1000).toFixed(0)}K / ${(salaryCap / 1000000).toFixed(1)}M
          </Badge>
          <Badge
            variant={remaining >= 0 ? "default" : "destructive"}
            className="text-sm py-1 px-3"
          >
            ${(remaining / 1000).toFixed(0)}K remaining
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="DEF">
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <TabsList className="inline-flex w-auto min-w-full sm:grid sm:grid-cols-5 sm:w-full">
            {positions.map((pos) => (
              <TabsTrigger key={pos} value={pos} className="min-w-[4.5rem] text-xs sm:text-sm" data-testid={`tab-${pos.toLowerCase()}`}>
                {pos} ({getPlayersByPosition(pos).length})
              </TabsTrigger>
            ))}
            <TabsTrigger value="BENCH" className="min-w-[4.5rem] text-xs sm:text-sm" data-testid="tab-bench">
              Bench ({benchPlayers.length})
            </TabsTrigger>
          </TabsList>
        </div>

        {positions.map((pos) => (
          <TabsContent key={pos} value={pos}>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  {pos === "DEF"
                    ? "Defenders"
                    : pos === "MID"
                    ? "Midfielders"
                    : pos === "RUC"
                    ? "Rucks"
                    : "Forwards"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 p-3">
                {getPlayersByPosition(pos).length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No {pos.toLowerCase()} players selected. Add players from the Players page.
                  </div>
                ) : (
                  getPlayersByPosition(pos).map((player) => (
                    <PlayerRow
                      key={player.myTeamPlayerId}
                      player={player}
                      onRemove={(id) => removeMutation.mutate(id)}
                      onSetCaptain={(id) => captainMutation.mutate(id)}
                      onSetViceCaptain={(id) => viceCaptainMutation.mutate(id)}
                    />
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}

        <TabsContent value="BENCH">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Bench Players
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 p-3">
              {benchPlayers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No bench players
                </div>
              ) : (
                benchPlayers.map((player) => (
                  <PlayerRow
                    key={player.myTeamPlayerId}
                    player={player}
                    onRemove={(id) => removeMutation.mutate(id)}
                    onSetCaptain={(id) => captainMutation.mutate(id)}
                    onSetViceCaptain={(id) => viceCaptainMutation.mutate(id)}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
