import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Camera,
  Upload,
  Users,
  ArrowLeftRight,
  Crown,
  Target,
  AlertTriangle,
  Loader2,
  X,
  ImageIcon,
  Save,
  CheckCircle,
  HelpCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface AnalysisPlayer {
  name: string;
  team?: string;
  position: string;
  score?: number;
  price?: number;
  isCaptain?: boolean;
  isViceCaptain?: boolean;
  isEmergency?: boolean;
  isOnField?: boolean;
}

interface AmbiguousPlayer {
  inputName: string;
  position: string;
  team?: string;
  isOnField?: boolean;
  isCaptain?: boolean;
  isViceCaptain?: boolean;
  isEmergency?: boolean;
  candidates: { id: number; name: string; team: string; position: string; avgScore: number | null; price: number | null }[];
}

interface AnalysisResult {
  players: AnalysisPlayer[];
  analysis: string;
  recommendations: { type: string; detail: string; priority: string }[];
  captainTip: string;
  tradeSuggestions: string[];
  captainName: string | null;
  viceCaptainName: string | null;
}

const priorityColor: Record<string, string> = {
  high: "bg-destructive text-destructive-foreground",
  medium: "bg-accent text-accent-foreground",
  low: "bg-secondary text-secondary-foreground",
};

const typeIcon: Record<string, any> = {
  trade: ArrowLeftRight,
  captain: Crown,
  structure: Users,
  cash_cow: Target,
  upgrade: Target,
};

export default function TeamAnalyzer() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [teamSaved, setTeamSaved] = useState(false);
  const [disambiguationData, setDisambiguationData] = useState<AmbiguousPlayer[] | null>(null);
  const [disambiguationChoices, setDisambiguationChoices] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const analyzeMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("screenshot", file);
      const res = await fetch("/api/analyze-screenshot", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Analysis failed — please try again with a clearer image" }));
        throw new Error(err.message || "Analysis failed");
      }
      return res.json() as Promise<AnalysisResult>;
    },
    onSuccess: (data) => {
      setResult(data);
      toast({ title: "Analysis complete", description: `Identified ${data.players?.length || 0} players` });
    },
    onError: (error: Error) => {
      toast({ title: "Analysis failed", description: error.message, variant: "destructive" });
    },
  });

  function doSave(players: AnalysisPlayer[]) {
    saveMutation.mutate(players);
  }

  const saveMutation = useMutation({
    mutationFn: async (players: AnalysisPlayer[]) => {
      const captainPlayer = players.find(p => p.isCaptain);
      const vcPlayer = players.find(p => p.isViceCaptain);
      const res = await apiRequest("POST", "/api/my-team/save-from-analyzer", {
        players,
        captainName: captainPlayer?.name || result?.captainName || null,
        viceCaptainName: vcPlayer?.name || result?.viceCaptainName || null,
      });
      return res.json() as Promise<{ success: boolean; savedCount: number; notFound: string[]; totalOnTeam: number; needsDisambiguation?: boolean; ambiguous?: AmbiguousPlayer[] }>;
    },
    onSuccess: (data) => {
      if (data.needsDisambiguation && data.ambiguous && data.ambiguous.length > 0) {
        setDisambiguationData(data.ambiguous);
        setDisambiguationChoices({});
        return;
      }
      setTeamSaved(true);
      queryClient.invalidateQueries({ queryKey: ["/api/my-team"] });
      const msg = data.notFound.length > 0
        ? `Saved ${data.savedCount} players. ${data.notFound.length} not matched: ${data.notFound.join(", ")}`
        : `Saved ${data.savedCount} players to your team`;
      toast({ title: "Team saved!", description: msg });
    },
    onError: (error: Error) => {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    },
  });

  function handleDisambiguationConfirm() {
    if (!result || !disambiguationData) return;
    const updatedPlayers = [...result.players];
    for (const amb of disambiguationData) {
      const chosenName = disambiguationChoices[amb.inputName];
      if (chosenName) {
        const idx = updatedPlayers.findIndex(p => p.name === amb.inputName);
        if (idx >= 0) {
          updatedPlayers[idx] = { ...updatedPlayers[idx], name: chosenName };
        } else {
          updatedPlayers.push({
            name: chosenName,
            position: amb.position,
            isOnField: amb.isOnField,
            isCaptain: amb.isCaptain,
            isViceCaptain: amb.isViceCaptain,
            isEmergency: amb.isEmergency,
          });
        }
      }
    }
    setDisambiguationData(null);
    setResult({ ...result, players: updatedPlayers });
    doSave(updatedPlayers);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please upload an image file", variant: "destructive" });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum file size is 10MB", variant: "destructive" });
      return;
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setResult(null);
    setTeamSaved(false);
    setDisambiguationData(null);
  }

  function clearFile() {
    setSelectedFile(null);
    setPreviewUrl(null);
    setResult(null);
    setTeamSaved(false);
    setDisambiguationData(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-4xl mx-auto" data-testid="page-team-analyzer">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight" data-testid="text-page-title">
          Team Upload & Analyser
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
          Upload a screenshot of your AFL Fantasy team for AI-powered analysis
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3 px-4 pt-4">
          <CardTitle className="text-sm sm:text-base font-semibold flex items-center gap-2">
            <Camera className="w-4 h-4 text-primary" />
            Upload Screenshot
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
            data-testid="input-screenshot"
          />

          {!selectedFile ? (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed rounded-lg p-8 sm:p-12 flex flex-col items-center gap-3 text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors cursor-pointer"
              data-testid="button-upload-area"
            >
              <Upload className="w-8 h-8 sm:w-10 sm:h-10" />
              <div className="text-center">
                <p className="text-sm font-medium">Tap to upload screenshot</p>
                <p className="text-xs mt-1">PNG, JPG up to 10MB</p>
              </div>
            </button>
          ) : (
            <div className="space-y-3">
              <div className="relative">
                <img
                  src={previewUrl!}
                  alt="Team screenshot"
                  className="w-full rounded-lg border max-h-80 object-contain bg-muted"
                  data-testid="img-preview"
                />
                <button
                  onClick={clearFile}
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-background/80 hover:bg-background border shadow-sm"
                  data-testid="button-clear-image"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => selectedFile && analyzeMutation.mutate(selectedFile)}
                  disabled={analyzeMutation.isPending}
                  className="flex-1"
                  data-testid="button-analyze"
                >
                  {analyzeMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Analysing...
                    </>
                  ) : (
                    <>
                      <ImageIcon className="w-4 h-4 mr-2" />
                      Analyse Team
                    </>
                  )}
                </Button>
                <Button variant="outline" onClick={() => fileInputRef.current?.click()} data-testid="button-change-image">
                  Change
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {analyzeMutation.isPending && (
        <div className="space-y-3">
          <Skeleton className="h-32 rounded-md" />
          <Skeleton className="h-24 rounded-md" />
          <Skeleton className="h-24 rounded-md" />
        </div>
      )}

      {result && (
        <>
          {result.players.length > 0 && (
            <Card>
              <CardHeader className="pb-2 px-4 pt-4">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm sm:text-base font-semibold flex items-center gap-2">
                    <Users className="w-4 h-4 text-primary" />
                    Players Identified ({result.players.length})
                  </CardTitle>
                  {teamSaved ? (
                    <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-0 gap-1" data-testid="badge-team-saved">
                      <CheckCircle className="w-3 h-3" />
                      Saved
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => doSave(result.players)}
                      disabled={saveMutation.isPending}
                      data-testid="button-save-team"
                    >
                      {saveMutation.isPending ? (
                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Save className="w-3.5 h-3.5 mr-1.5" />
                      )}
                      Save as My Team
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="flex flex-wrap gap-1.5">
                  {result.players.map((p, i) => (
                    <Badge key={i} variant="secondary" className={`text-xs py-1 ${p.isOnField === false ? 'opacity-70' : ''}`} data-testid={`badge-player-${i}`}>
                      {p.name}
                      <span className="text-muted-foreground ml-1">{p.position}</span>
                      {p.score !== undefined && p.score > 0 && (
                        <span className="ml-1 font-bold">{p.score}</span>
                      )}
                      {p.isCaptain && <span className="ml-1 text-[9px] font-bold text-red-500">(C)</span>}
                      {p.isViceCaptain && <span className="ml-1 text-[9px] font-bold text-emerald-500">(VC)</span>}
                      {p.isEmergency && <span className="ml-1 text-[9px] font-bold text-amber-500">(E)</span>}
                      {p.isOnField === false && <span className="ml-1 text-[9px] font-medium text-muted-foreground">(Bench)</span>}
                    </Badge>
                  ))}
                </div>
                {!teamSaved && (
                  <p className="text-[11px] text-muted-foreground mt-3">
                    Saving will replace your current team with these {result.players.length} identified players.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2 px-4 pt-4">
              <CardTitle className="text-sm sm:text-base font-semibold flex items-center gap-2">
                <Target className="w-4 h-4 text-accent" />
                Team Analysis
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-sm leading-relaxed text-muted-foreground" data-testid="text-analysis">
                {result.analysis}
              </p>
            </CardContent>
          </Card>

          {result.captainTip && (
            <Card>
              <CardHeader className="pb-2 px-4 pt-4">
                <CardTitle className="text-sm sm:text-base font-semibold flex items-center gap-2">
                  <Crown className="w-4 h-4 text-accent" />
                  Captain Loophole Tip
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className="text-sm leading-relaxed" data-testid="text-captain-tip">
                  {result.captainTip}
                </p>
              </CardContent>
            </Card>
          )}

          {result.recommendations.length > 0 && (
            <Card>
              <CardHeader className="pb-2 px-4 pt-4">
                <CardTitle className="text-sm sm:text-base font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-primary" />
                  Recommendations
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                {result.recommendations.map((rec, i) => {
                  const Icon = typeIcon[rec.type] || Target;
                  return (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-md bg-muted/50" data-testid={`card-recommendation-${i}`}>
                      <Icon className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge className={`text-[10px] ${priorityColor[rec.priority] || priorityColor.medium}`}>
                            {rec.priority}
                          </Badge>
                          <span className="text-[11px] text-muted-foreground capitalize">{rec.type}</span>
                        </div>
                        <p className="text-sm leading-relaxed">{rec.detail}</p>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {result.tradeSuggestions.length > 0 && (
            <Card>
              <CardHeader className="pb-2 px-4 pt-4">
                <CardTitle className="text-sm sm:text-base font-semibold flex items-center gap-2">
                  <ArrowLeftRight className="w-4 h-4 text-accent" />
                  Trade Suggestions
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                {result.tradeSuggestions.map((suggestion, i) => (
                  <div key={i} className="p-3 rounded-md bg-muted/50 text-sm leading-relaxed" data-testid={`card-trade-suggestion-${i}`}>
                    {suggestion}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Dialog open={!!disambiguationData} onOpenChange={(open) => { if (!open) setDisambiguationData(null); }}>
        <DialogContent className="max-w-md" data-testid="dialog-disambiguation">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <HelpCircle className="w-4 h-4 text-amber-500" />
              Which player did you mean?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            {disambiguationData?.map((amb) => (
              <div key={amb.inputName} className="space-y-2">
                <p className="text-sm font-medium">
                  "{amb.inputName}" <span className="text-muted-foreground">({amb.position})</span>
                </p>
                <RadioGroup
                  value={disambiguationChoices[amb.inputName] || ""}
                  onValueChange={(val) =>
                    setDisambiguationChoices(prev => ({ ...prev, [amb.inputName]: val }))
                  }
                  className="space-y-1.5"
                >
                  {amb.candidates.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center space-x-3 rounded-md border p-3 hover:bg-muted/50 cursor-pointer"
                      onClick={() => setDisambiguationChoices(prev => ({ ...prev, [amb.inputName]: c.name }))}
                      data-testid={`radio-candidate-${c.id}`}
                    >
                      <RadioGroupItem value={c.name} id={`candidate-${c.id}`} />
                      <Label htmlFor={`candidate-${c.id}`} className="flex-1 cursor-pointer">
                        <span className="font-medium text-sm">{c.name}</span>
                        <span className="text-xs text-muted-foreground ml-2">{c.team}</span>
                        {c.avgScore !== null && (
                          <span className="text-xs text-muted-foreground ml-2">Avg: {Math.round(c.avgScore)}</span>
                        )}
                        {c.price !== null && (
                          <span className="text-xs text-muted-foreground ml-2">
                            ${c.price >= 1000000 ? (c.price / 1000000).toFixed(3) + "M" : Math.round(c.price / 1000) + "K"}
                          </span>
                        )}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDisambiguationData(null)}
              data-testid="button-cancel-disambiguation"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDisambiguationConfirm}
              disabled={disambiguationData ? disambiguationData.some(a => !disambiguationChoices[a.inputName]) : true}
              data-testid="button-confirm-disambiguation"
            >
              Confirm & Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
