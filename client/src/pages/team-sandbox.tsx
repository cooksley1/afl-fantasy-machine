import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FlaskConical,
  Plus,
  Sparkles,
  Trash2,
  Pencil,
  GitCompareArrows,
  Play,
  Check,
  X,
  Loader2,
  Users,
  DollarSign,
  TrendingUp,
  Calendar,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { SavedTeam } from "@shared/schema";

interface ComparisonData {
  currentTeam: { value: number; projectedScore: number; playerCount: number };
  savedTeam: { value: number; projectedScore: number; playerCount: number; name: string };
  sharedPlayers: number;
  onlyInCurrent: Array<{ id: number; name: string; position: string; avgScore: number; price: number }>;
  onlyInSaved: Array<{ id: number; name: string; position: string; avgScore: number; price: number }>;
  scoreDiff: number;
  valueDiff: number;
}

const sourceLabels: Record<string, { label: string; className: string }> = {
  manual: { label: "Manual", className: "bg-muted text-muted-foreground" },
  "ai-built": { label: "AI Built", className: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20" },
  wizard: { label: "Wizard", className: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" },
  imported: { label: "Imported", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
};

function TeamCard({
  team,
  onActivate,
  onCompare,
  onDelete,
  onEditName,
  isActivating,
}: {
  team: SavedTeam;
  onActivate: () => void;
  onCompare: () => void;
  onDelete: () => void;
  onEditName: () => void;
  isActivating: boolean;
}) {
  const sourceMeta = sourceLabels[team.source] || sourceLabels.manual;
  let playerCount = 0;
  try {
    const parsed = JSON.parse(team.playerData);
    playerCount = Array.isArray(parsed) ? parsed.length : 0;
  } catch {}

  return (
    <Card
      className={team.isActive ? "ring-2 ring-emerald-500/50" : ""}
      data-testid={`card-saved-team-${team.id}`}
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold truncate" data-testid={`text-team-name-${team.id}`}>
                {team.name}
              </h3>
              <Badge variant="outline" className={`text-[10px] ${sourceMeta.className}`} data-testid={`badge-source-${team.id}`}>
                {sourceMeta.label}
              </Badge>
              {team.isActive && (
                <Badge className="bg-emerald-500 text-white text-[10px]" data-testid={`badge-active-${team.id}`}>
                  Active
                </Badge>
              )}
            </div>
            {team.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2" data-testid={`text-team-desc-${team.id}`}>
                {team.description}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1">
              <DollarSign className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs font-semibold" data-testid={`text-team-value-${team.id}`}>
                ${(team.teamValue / 1000000).toFixed(2)}M
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground">Value</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1">
              <TrendingUp className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs font-semibold" data-testid={`text-team-projected-${team.id}`}>
                {team.projectedScore ?? "—"}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground">Projected</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1">
              <Users className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs font-semibold" data-testid={`text-team-players-${team.id}`}>
                {playerCount}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground">Players</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1">
              <Calendar className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs font-semibold" data-testid={`text-team-created-${team.id}`}>
                {team.createdAt ? new Date(team.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "—"}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground">Created</p>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          {!team.isActive && (
            <Button
              size="sm"
              variant="default"
              onClick={onActivate}
              disabled={isActivating}
              data-testid={`button-activate-${team.id}`}
            >
              {isActivating ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Play className="w-3 h-3 mr-1" />}
              Activate
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={onCompare}
            data-testid={`button-compare-${team.id}`}
          >
            <GitCompareArrows className="w-3 h-3 mr-1" />
            Compare
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onEditName}
            data-testid={`button-edit-${team.id}`}
          >
            <Pencil className="w-3 h-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDelete}
            data-testid={`button-delete-${team.id}`}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ComparisonModal({
  open,
  onClose,
  data,
  isLoading,
}: {
  open: boolean;
  onClose: () => void;
  data: ComparisonData | null;
  isLoading: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" data-testid="dialog-comparison">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCompareArrows className="w-5 h-5" />
            Team Comparison
          </DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="space-y-3 py-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}

        {data && !isLoading && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardContent className="p-3 space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground">Active Team</p>
                  <p className="text-sm font-bold" data-testid="text-compare-current-value">
                    ${(data.currentTeam.value / 1000000).toFixed(2)}M
                  </p>
                  <p className="text-xs text-muted-foreground" data-testid="text-compare-current-score">
                    Projected: {data.currentTeam.projectedScore} pts
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {data.currentTeam.playerCount} players
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground">{data.savedTeam.name}</p>
                  <p className="text-sm font-bold" data-testid="text-compare-saved-value">
                    ${(data.savedTeam.value / 1000000).toFixed(2)}M
                  </p>
                  <p className="text-xs text-muted-foreground" data-testid="text-compare-saved-score">
                    Projected: {data.savedTeam.projectedScore ?? "—"} pts
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {data.savedTeam.playerCount} players
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className={`text-lg font-bold ${data.scoreDiff > 0 ? "text-emerald-600" : data.scoreDiff < 0 ? "text-red-600" : ""}`} data-testid="text-score-diff">
                  {data.scoreDiff > 0 ? "+" : ""}{data.scoreDiff} pts
                </p>
                <p className="text-[10px] text-muted-foreground">Score Diff</p>
              </div>
              <div>
                <p className={`text-lg font-bold ${data.valueDiff > 0 ? "text-emerald-600" : data.valueDiff < 0 ? "text-red-600" : ""}`} data-testid="text-value-diff">
                  {data.valueDiff > 0 ? "+" : ""}${(data.valueDiff / 1000).toFixed(0)}k
                </p>
                <p className="text-[10px] text-muted-foreground">Value Diff</p>
              </div>
              <div>
                <p className="text-lg font-bold" data-testid="text-shared-count">
                  {data.sharedPlayers}
                </p>
                <p className="text-[10px] text-muted-foreground">Shared Players</p>
              </div>
            </div>

            {data.onlyInCurrent.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Only in Active Team</p>
                <div className="space-y-1">
                  {data.onlyInCurrent.map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-xs px-2 py-1.5 rounded-md bg-muted/30" data-testid={`text-only-current-${p.id}`}>
                      <span className="font-medium">{p.name}</span>
                      <span className="text-muted-foreground">{p.position} · avg {p.avgScore} · ${(p.price / 1000).toFixed(0)}k</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.onlyInSaved.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Only in {data.savedTeam.name}</p>
                <div className="space-y-1">
                  {data.onlyInSaved.map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-xs px-2 py-1.5 rounded-md bg-muted/30" data-testid={`text-only-saved-${p.id}`}>
                      <span className="font-medium">{p.name}</span>
                      <span className="text-muted-foreground">{p.position} · avg {p.avgScore} · ${(p.price / 1000).toFixed(0)}k</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function TeamSandbox() {
  const { toast } = useToast();
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [compareTeamId, setCompareTeamId] = useState<number | null>(null);
  const [activatingId, setActivatingId] = useState<number | null>(null);

  const { data: savedTeams, isLoading } = useQuery<SavedTeam[]>({
    queryKey: ["/api/saved-teams"],
  });

  const { data: comparisonData, isLoading: isComparing } = useQuery<ComparisonData>({
    queryKey: ["/api/saved-teams", compareTeamId, "compare"],
    enabled: compareTeamId !== null,
  });

  const activeTeam = savedTeams?.find((t) => t.isActive);

  const saveCurrentMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/saved-teams", {
        name: newName || "My Team Snapshot",
        description: newDescription || null,
        source: "manual",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-teams"] });
      setNewName("");
      setNewDescription("");
      toast({ title: "Team saved", description: "Current team saved as a new variant" });
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const aiBuilMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/saved-teams/from-wizard", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-teams"] });
      toast({ title: "AI team created", description: "A new AI-built team variant has been saved" });
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const activateMutation = useMutation({
    mutationFn: async (id: number) => {
      setActivatingId(id);
      return apiRequest("POST", `/api/saved-teams/${id}/activate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-teams"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-team"] });
      setActivatingId(null);
      toast({ title: "Team activated", description: "This team is now your active squad" });
    },
    onError: (error: Error) => {
      setActivatingId(null);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/saved-teams/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-teams"] });
      toast({ title: "Team deleted" });
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, name, description }: { id: number; name: string; description: string }) => {
      return apiRequest("PUT", `/api/saved-teams/${id}`, { name, description });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-teams"] });
      setEditingId(null);
      toast({ title: "Team updated" });
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const startEdit = (team: SavedTeam) => {
    setEditingId(team.id);
    setEditName(team.name);
    setEditDescription(team.description || "");
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-5 h-5 text-accent" />
          <h1 className="text-xl font-bold" data-testid="text-page-title">Team Lab</h1>
        </div>
        <p className="text-sm text-muted-foreground" data-testid="text-page-subtitle">
          Build, compare, and test different team configurations
        </p>
      </div>

      {activeTeam && (
        <div className="flex items-center gap-2">
          <Badge className="bg-emerald-500 text-white" data-testid="badge-active-team">
            Active: {activeTeam.name}
          </Badge>
        </div>
      )}

      <Card data-testid="card-create-team">
        <CardContent className="p-4 space-y-3">
          <p className="text-sm font-semibold">Create New Team Variant</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              placeholder="Team name (e.g. Cash Cow Heavy)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              data-testid="input-new-team-name"
            />
            <Input
              placeholder="Description (optional)"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              data-testid="input-new-team-description"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              onClick={() => saveCurrentMutation.mutate()}
              disabled={saveCurrentMutation.isPending}
              data-testid="button-save-current"
            >
              {saveCurrentMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
              ) : (
                <Plus className="w-4 h-4 mr-1" />
              )}
              Save Current Team
            </Button>
            <Button
              variant="outline"
              onClick={() => aiBuilMutation.mutate()}
              disabled={aiBuilMutation.isPending}
              data-testid="button-ai-build"
            >
              {aiBuilMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
              ) : (
                <Sparkles className="w-4 h-4 mr-1" />
              )}
              Let AI Build a New Team
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      )}

      {!isLoading && savedTeams && savedTeams.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center space-y-2">
            <FlaskConical className="w-10 h-10 mx-auto text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground" data-testid="text-empty-state">
              No saved team variants yet. Save your current team or let AI build one to get started.
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && savedTeams && savedTeams.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="grid-saved-teams">
          {savedTeams.map((team) =>
            editingId === team.id ? (
              <Card key={team.id} data-testid={`card-edit-team-${team.id}`}>
                <CardContent className="p-4 space-y-3">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    data-testid={`input-edit-name-${team.id}`}
                  />
                  <Textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="resize-none"
                    data-testid={`input-edit-desc-${team.id}`}
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => updateMutation.mutate({ id: team.id, name: editName, description: editDescription })}
                      disabled={updateMutation.isPending}
                      data-testid={`button-save-edit-${team.id}`}
                    >
                      {updateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Check className="w-3 h-3 mr-1" />}
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingId(null)}
                      data-testid={`button-cancel-edit-${team.id}`}
                    >
                      <X className="w-3 h-3 mr-1" />
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <TeamCard
                key={team.id}
                team={team}
                onActivate={() => activateMutation.mutate(team.id)}
                onCompare={() => setCompareTeamId(team.id)}
                onDelete={() => deleteMutation.mutate(team.id)}
                onEditName={() => startEdit(team)}
                isActivating={activatingId === team.id}
              />
            )
          )}
        </div>
      )}

      <ComparisonModal
        open={compareTeamId !== null}
        onClose={() => setCompareTeamId(null)}
        data={comparisonData ?? null}
        isLoading={isComparing}
      />
    </div>
  );
}
