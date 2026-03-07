import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Eye, Plus, Trash2, Pencil, Upload, Target, Users, TrendingUp, TrendingDown, ShieldCheck, AlertTriangle, ChevronDown, ChevronUp, X, Check } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { LeagueOpponent } from "@shared/schema";

interface MatchupData {
  opponentName: string;
  leagueName: string;
  projectedAdvantage: number;
  myProjected: number;
  oppProjected: number;
  sharedPlayers: Array<{ id: number; name: string; position: string; avgScore: number }>;
  myUniquePicks: Array<{ id: number; name: string; position: string; avgScore: number; price: number; isOnField: boolean }>;
  theirUniquePicks: Array<{ id: number; name: string; position: string; avgScore: number | null; price: number | null }>;
  captainTips: string[];
  weeklyWinStrategy: string;
}

function AddOpponentForm({ onSuccess }: { onSuccess: () => void }) {
  const [leagueName, setLeagueName] = useState("");
  const [opponentName, setOpponentName] = useState("");
  const [totalScore, setTotalScore] = useState("");
  const [lastRoundScore, setLastRoundScore] = useState("");
  const { toast } = useToast();

  const createMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/league/opponents", {
        leagueName: leagueName.trim(),
        opponentName: opponentName.trim(),
        totalScore: totalScore ? parseInt(totalScore) : null,
        lastRoundScore: lastRoundScore ? parseInt(lastRoundScore) : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/league/opponents"] });
      setLeagueName("");
      setOpponentName("");
      setTotalScore("");
      setLastRoundScore("");
      toast({ title: "Opponent added" });
      onSuccess();
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          placeholder="League name (e.g. Work League)"
          value={leagueName}
          onChange={(e) => setLeagueName(e.target.value)}
          data-testid="input-league-name"
        />
        <Input
          placeholder="Opponent name"
          value={opponentName}
          onChange={(e) => setOpponentName(e.target.value)}
          data-testid="input-opponent-name"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          placeholder="Total score (optional)"
          type="number"
          value={totalScore}
          onChange={(e) => setTotalScore(e.target.value)}
          data-testid="input-total-score"
        />
        <Input
          placeholder="Last round score (optional)"
          type="number"
          value={lastRoundScore}
          onChange={(e) => setLastRoundScore(e.target.value)}
          data-testid="input-last-round-score"
        />
      </div>
      <Button
        onClick={() => createMutation.mutate()}
        disabled={!leagueName.trim() || !opponentName.trim() || createMutation.isPending}
        data-testid="button-add-opponent"
      >
        {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
        Add Opponent
      </Button>
    </div>
  );
}

function MatchupAnalysis({ matchup }: { matchup: MatchupData }) {
  const advantagePositive = matchup.projectedAdvantage > 0;

  return (
    <div className="space-y-4 pt-2" data-testid="matchup-analysis">
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center space-y-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Your Projected</p>
          <p className="text-lg font-bold" data-testid="text-my-projected">{matchup.myProjected}</p>
        </div>
        <div className="text-center space-y-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Advantage</p>
          <p className={`text-lg font-bold ${advantagePositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`} data-testid="text-advantage">
            {advantagePositive ? "+" : ""}{matchup.projectedAdvantage}
          </p>
        </div>
        <div className="text-center space-y-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Their Projected</p>
          <p className="text-lg font-bold" data-testid="text-opp-projected">{matchup.oppProjected}</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="flex items-center gap-2">
            {advantagePositive ? <TrendingUp className="w-4 h-4 text-emerald-500" /> : <TrendingDown className="w-4 h-4 text-red-500" />}
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Weekly Win Strategy</span>
          </div>
          <p className="text-sm" data-testid="text-weekly-strategy">{matchup.weeklyWinStrategy}</p>

          {matchup.captainTips.length > 0 && (
            <div className="space-y-1.5 pt-1">
              {matchup.captainTips.map((tip, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground" data-testid={`text-captain-tip-${i}`}>
                  <Target className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" />
                  <span>{tip}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your Unique Picks ({matchup.myUniquePicks.length})</span>
          </div>
          <div className="space-y-1">
            {matchup.myUniquePicks.sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0)).slice(0, 10).map((p) => (
              <div key={p.id} className="flex items-center gap-2 text-xs px-2 py-1 rounded-md bg-muted/30" data-testid={`my-unique-${p.id}`}>
                <span className="font-medium flex-1 truncate">{p.name}</span>
                <Badge variant="outline" className="text-[8px] px-1 py-0">{p.position}</Badge>
                <span className="text-muted-foreground shrink-0">{Math.round(p.avgScore || 0)}</span>
              </div>
            ))}
            {matchup.myUniquePicks.length > 10 && (
              <p className="text-[10px] text-muted-foreground px-2">+{matchup.myUniquePicks.length - 10} more</p>
            )}
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Their Unique Picks ({matchup.theirUniquePicks.length})</span>
          </div>
          <div className="space-y-1">
            {matchup.theirUniquePicks.sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0)).slice(0, 10).map((p, i) => (
              <div key={p.id || i} className="flex items-center gap-2 text-xs px-2 py-1 rounded-md bg-muted/30" data-testid={`their-unique-${p.id || i}`}>
                <span className="font-medium flex-1 truncate">{p.name}</span>
                <Badge variant="outline" className="text-[8px] px-1 py-0">{p.position}</Badge>
                <span className="text-muted-foreground shrink-0">{Math.round(p.avgScore || 0)}</span>
              </div>
            ))}
            {matchup.theirUniquePicks.length > 10 && (
              <p className="text-[10px] text-muted-foreground px-2">+{matchup.theirUniquePicks.length - 10} more</p>
            )}
          </div>
        </div>
      </div>

      {matchup.sharedPlayers.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Shared Players ({matchup.sharedPlayers.length})</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {matchup.sharedPlayers.map((p) => (
              <Badge key={p.id} variant="outline" className="text-[10px]" data-testid={`shared-player-${p.id}`}>
                {p.name}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OpponentCard({ opponent }: { opponent: LeagueOpponent }) {
  const [showMatchup, setShowMatchup] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(opponent.opponentName);
  const [editTotalScore, setEditTotalScore] = useState(opponent.totalScore?.toString() || "");
  const [editLastRound, setEditLastRound] = useState(opponent.lastRoundScore?.toString() || "");
  const [editNotes, setEditNotes] = useState(opponent.notes || "");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const parsedPlayers = opponent.playerData ? JSON.parse(opponent.playerData) : null;

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/league/opponents/${opponent.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/league/opponents"] });
      toast({ title: "Opponent removed" });
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: () => apiRequest("PUT", `/api/league/opponents/${opponent.id}`, {
      opponentName: editName.trim(),
      totalScore: editTotalScore ? parseInt(editTotalScore) : null,
      lastRoundScore: editLastRound ? parseInt(editLastRound) : null,
      notes: editNotes.trim() || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/league/opponents"] });
      setEditing(false);
      toast({ title: "Opponent updated" });
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const screenshotMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("screenshot", file);
      const res = await fetch(`/api/league/opponents/${opponent.id}/analyze-screenshot`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/league/opponents"] });
      if (data.success) {
        toast({ title: "Squad analysed", description: `Found ${data.playersFound} players` });
      } else {
        toast({ title: "Analysis incomplete", description: data.message, variant: "destructive" });
      }
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const matchupQuery = useQuery<MatchupData>({
    queryKey: ["/api/league/opponents", opponent.id, "matchup"],
    enabled: showMatchup && !!opponent.playerData,
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) screenshotMutation.mutate(file);
  };

  return (
    <Card data-testid={`card-opponent-${opponent.id}`}>
      <CardContent className="p-4 space-y-3">
        {editing ? (
          <div className="space-y-2">
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} data-testid="input-edit-name" />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Total score" type="number" value={editTotalScore} onChange={(e) => setEditTotalScore(e.target.value)} data-testid="input-edit-total" />
              <Input placeholder="Last round" type="number" value={editLastRound} onChange={(e) => setEditLastRound(e.target.value)} data-testid="input-edit-last-round" />
            </div>
            <Input placeholder="Notes" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} data-testid="input-edit-notes" />
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending} data-testid="button-save-edit">
                {updateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3 mr-1" />}
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)} data-testid="button-cancel-edit">
                <X className="w-3 h-3 mr-1" />Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-sm" data-testid={`text-opponent-name-${opponent.id}`}>{opponent.opponentName}</h3>
                  <Badge variant="outline" className="text-[10px]" data-testid={`badge-league-${opponent.id}`}>{opponent.leagueName}</Badge>
                </div>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  {opponent.totalScore != null && (
                    <span className="text-xs text-muted-foreground" data-testid={`text-total-score-${opponent.id}`}>
                      Season: {opponent.totalScore.toLocaleString()}
                    </span>
                  )}
                  {opponent.lastRoundScore != null && (
                    <span className="text-xs text-muted-foreground" data-testid={`text-last-round-${opponent.id}`}>
                      Last Rd: {opponent.lastRoundScore}
                    </span>
                  )}
                  {parsedPlayers && (
                    <span className="text-xs text-muted-foreground" data-testid={`text-player-count-${opponent.id}`}>
                      {parsedPlayers.length} players known
                    </span>
                  )}
                </div>
                {opponent.notes && (
                  <p className="text-xs text-muted-foreground mt-1" data-testid={`text-notes-${opponent.id}`}>{opponent.notes}</p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="icon" variant="ghost" onClick={() => setEditing(true)} data-testid={`button-edit-${opponent.id}`}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending} data-testid={`button-delete-${opponent.id}`}>
                  {deleteMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
                data-testid={`input-screenshot-${opponent.id}`}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={screenshotMutation.isPending}
                data-testid={`button-upload-screenshot-${opponent.id}`}
              >
                {screenshotMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <Upload className="w-3 h-3 mr-1.5" />}
                Upload Team Screenshot
              </Button>
              {parsedPlayers && (
                <Button
                  size="sm"
                  variant={showMatchup ? "default" : "outline"}
                  onClick={() => setShowMatchup(!showMatchup)}
                  data-testid={`button-matchup-${opponent.id}`}
                >
                  {showMatchup ? <ChevronUp className="w-3 h-3 mr-1.5" /> : <ChevronDown className="w-3 h-3 mr-1.5" />}
                  Matchup Analysis
                </Button>
              )}
            </div>

            {showMatchup && parsedPlayers && (
              matchupQuery.isLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : matchupQuery.data && "projectedAdvantage" in matchupQuery.data ? (
                <MatchupAnalysis matchup={matchupQuery.data} />
              ) : (
                <p className="text-xs text-muted-foreground py-2" data-testid="text-no-matchup">
                  {(matchupQuery.data as any)?.message || "Unable to generate matchup analysis"}
                </p>
              )
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function LeagueSpy() {
  const [showAddForm, setShowAddForm] = useState(false);

  const { data: opponents, isLoading } = useQuery<LeagueOpponent[]>({
    queryKey: ["/api/league/opponents"],
  });

  const leagues = opponents
    ? Array.from(new Set(opponents.map(o => o.leagueName))).sort()
    : [];

  const defaultTab = leagues.length > 0 ? leagues[0] : "all";

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Eye className="w-5 h-5 text-accent" />
          <h1 className="text-xl font-bold" data-testid="text-page-title">League Spy</h1>
        </div>
        <p className="text-sm text-muted-foreground" data-testid="text-page-subtitle">
          Track your opponents and find your edge
        </p>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="text-sm font-semibold" data-testid="text-add-section-title">Add Opponent</h2>
            <Button
              size="sm"
              variant={showAddForm ? "default" : "outline"}
              onClick={() => setShowAddForm(!showAddForm)}
              data-testid="button-toggle-add-form"
            >
              {showAddForm ? <X className="w-3 h-3 mr-1.5" /> : <Plus className="w-3 h-3 mr-1.5" />}
              {showAddForm ? "Cancel" : "New Opponent"}
            </Button>
          </div>
          {showAddForm && <AddOpponentForm onSuccess={() => setShowAddForm(false)} />}
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : !opponents || opponents.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center space-y-2">
            <Eye className="w-8 h-8 mx-auto text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground" data-testid="text-empty-state">
              No opponents added yet. Add your league opponents to start tracking matchups.
            </p>
          </CardContent>
        </Card>
      ) : leagues.length === 1 ? (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide" data-testid="text-league-title">
            {leagues[0]} ({opponents.length})
          </h2>
          {opponents.map((opp) => (
            <OpponentCard key={opp.id} opponent={opp} />
          ))}
        </div>
      ) : (
        <Tabs defaultValue={defaultTab}>
          <TabsList className="flex-wrap h-auto" data-testid="tabs-leagues">
            {leagues.map((league) => (
              <TabsTrigger key={league} value={league} data-testid={`tab-league-${league.replace(/\s/g, '-').toLowerCase()}`}>
                {league} ({opponents.filter(o => o.leagueName === league).length})
              </TabsTrigger>
            ))}
          </TabsList>
          {leagues.map((league) => (
            <TabsContent key={league} value={league} className="space-y-3 mt-4">
              {opponents
                .filter((o) => o.leagueName === league)
                .map((opp) => (
                  <OpponentCard key={opp.id} opponent={opp} />
                ))}
            </TabsContent>
          ))}
        </Tabs>
      )}

      {opponents && opponents.length > 0 && (
        <Card className="border-accent/30">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Target className="w-5 h-5 text-accent shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h3 className="text-sm font-semibold" data-testid="text-weekly-win-callout-title">Weekly Win Mode</h3>
                <p className="text-xs text-muted-foreground" data-testid="text-weekly-win-callout">
                  Want to prioritise a weekly win over your season outcome? Upload your opponent's team screenshot, then check the Matchup Analysis for captain recommendations that maximise your edge. Be aware: chasing weekly wins with risky captain picks may hurt your long-term season ranking.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
