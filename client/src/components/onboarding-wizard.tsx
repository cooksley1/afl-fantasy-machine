import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Camera, Users, ArrowRight, Loader2, Smartphone, Share2, Download, Upload, DollarSign, Sparkles, Brain } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { LeagueSettings } from "@shared/schema";
import { AFL_FANTASY_CLASSIC_2026 } from "@shared/game-rules";
import logoImg from "@assets/1772915052518_1772915124902_no_bg.png";
import teamScreenshotImg from "@assets/my_team_null_2026-03-03_21-58-17_1772535572033.png";

const SALARY_CAP = AFL_FANTASY_CLASSIC_2026.salaryCap;

const settingsFormSchema = z.object({
  teamName: z.string().min(1, "Team name is required").max(50),
  currentRound: z.coerce.number().min(0).max(24),
  tradesRemaining: z.coerce.number().min(0).max(100),
});

type SettingsForm = z.infer<typeof settingsFormSchema>;

interface OnboardingWizardProps {
  onComplete: () => void;
}

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: settings } = useQuery<LeagueSettings>({
    queryKey: ["/api/settings"],
  });

  const form = useForm<SettingsForm>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues: {
      teamName: "My Team",
      currentRound: 1,
      tradesRemaining: 2,
    },
    values: settings
      ? {
          teamName: settings.teamName,
          currentRound: settings.currentRound,
          tradesRemaining: settings.tradesRemaining,
        }
      : undefined,
  });

  const updateMutation = useMutation({
    mutationFn: (data: SettingsForm) => apiRequest("PATCH", "/api/settings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Settings saved" });
      setStep(2);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  function completeOnboarding() {
    localStorage.setItem("afl_onboarding_complete", "true");
    onComplete();
  }

  function handleSkip() {
    form.handleSubmit(
      (data) => {
        updateMutation.mutate(data, {
          onSuccess: () => {
            setStep(2);
          },
        });
      },
      () => {
        setStep(2);
      },
    )();
  }

  const buildTeamMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/season-plan/build-team"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-team"] });
      queryClient.invalidateQueries({ queryKey: ["/api/season-plan"] });
      toast({ title: "Team built!", description: "Your optimal squad and season roadmap are ready." });
      completeOnboarding();
      navigate("/roadmap");
    },
    onError: (error: Error) => {
      toast({ title: "Error building team", description: error.message, variant: "destructive" });
    },
  });

  function handleTeamSetupChoice(path: string) {
    completeOnboarding();
    navigate(path);
  }

  const steps = [
    { label: "Welcome" },
    { label: "Settings" },
    { label: "Team" },
  ];

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4" data-testid="onboarding-wizard">
      <div className="w-full max-w-lg space-y-6">
        <div className="flex items-center justify-center gap-2" data-testid="step-indicator">
          {steps.map((s, i) => (
            <div key={s.label} className="flex items-center gap-2">
              <div
                className={`w-2.5 h-2.5 rounded-full transition-colors ${
                  i === step
                    ? "bg-primary"
                    : i < step
                      ? "bg-primary/50"
                      : "bg-muted-foreground/25"
                }`}
                data-testid={`step-dot-${i}`}
              />
              {i < steps.length - 1 && (
                <div className="w-8 h-px bg-muted-foreground/20" />
              )}
            </div>
          ))}
        </div>

        {step === 0 && (
          <Card data-testid="step-welcome">
            <CardContent className="flex flex-col items-center text-center pt-8 pb-8 space-y-6">
              <img
                src={logoImg}
                alt="AFL Fantasy Machine"
                className="w-24 h-24 object-contain"
                data-testid="img-logo"
              />
              <div className="space-y-2">
                <h1 className="text-2xl font-bold tracking-tight" data-testid="text-welcome-title">
                  Welcome to AFL Fantasy Machine
                </h1>
                <p className="text-muted-foreground text-sm max-w-sm">
                  Your AI-powered command centre for AFL Fantasy.
                  Dominate your league with smart insights and data-driven decisions.
                </p>
              </div>
              <Button
                size="lg"
                onClick={() => setStep(1)}
                data-testid="button-get-started"
              >
                Let's Get Started
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </CardContent>
          </Card>
        )}

        {step === 1 && (
          <Card data-testid="step-settings">
            <CardContent className="pt-6 pb-6 space-y-5">
              <div className="text-center space-y-1">
                <h2 className="text-xl font-bold tracking-tight" data-testid="text-settings-title">
                  League Settings
                </h2>
                <p className="text-muted-foreground text-sm">
                  Set up your league configuration
                </p>
              </div>

              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit((data) => updateMutation.mutate(data))}
                  className="space-y-4"
                  data-testid="form-settings"
                >
                  <FormField
                    control={form.control}
                    name="teamName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Team Name</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="Enter your team name"
                            data-testid="input-team-name"
                          />
                        </FormControl>
                        <FormDescription>Your fantasy team name</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="rounded-md border p-3 flex items-center gap-3" data-testid="display-salary-cap">
                    <DollarSign className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Salary Cap</p>
                      <p className="text-xs text-muted-foreground">
                        Fixed at ${(SALARY_CAP / 1000000).toFixed(2)}M for AFL Fantasy Classic 2026
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="currentRound"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Current Round</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="number"
                              data-testid="input-current-round"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="tradesRemaining"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Trades Remaining</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="number"
                              data-testid="input-trades-remaining"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={handleSkip}
                      data-testid="button-skip"
                    >
                      Skip for now
                    </Button>
                    <Button
                      type="submit"
                      disabled={updateMutation.isPending}
                      data-testid="button-save-continue"
                    >
                      {updateMutation.isPending && (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      )}
                      Save & Continue
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card data-testid="step-build-team">
            <CardContent className="pt-6 pb-6 space-y-5">
              <div className="text-center space-y-1">
                <h2 className="text-xl font-bold tracking-tight" data-testid="text-build-title">
                  Build Your Team
                </h2>
                <p className="text-muted-foreground text-sm">
                  Choose how you'd like to set up your squad
                </p>
              </div>

              <Card
                className={`hover-elevate cursor-pointer border-primary/30 ${buildTeamMutation.isPending ? "pointer-events-none opacity-80" : ""}`}
                onClick={() => !buildTeamMutation.isPending && buildTeamMutation.mutate()}
                data-testid="card-ai-build-team"
              >
                <CardContent className="pt-5 pb-5 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Brain className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-sm" data-testid="text-ai-build-title">Let AI Build Your Team</p>
                      <p className="text-xs text-muted-foreground">
                        Our analytics engine picks the optimal 30-man squad
                      </p>
                    </div>
                    {buildTeamMutation.isPending && (
                      <Loader2 className="w-5 h-5 animate-spin text-primary shrink-0" />
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3 text-primary" />
                      <span>Premium scorers on-field</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3 text-primary" />
                      <span>Cash cows on bench</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3 text-primary" />
                      <span>Bye round coverage</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3 text-primary" />
                      <span>Full season roadmap</span>
                    </div>
                  </div>
                  {buildTeamMutation.isPending && (
                    <p className="text-xs text-primary font-medium text-center">
                      Building your optimal squad and generating season plan...
                    </p>
                  )}
                </CardContent>
              </Card>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-card px-3 text-xs text-muted-foreground">or import your own team</span>
                </div>
              </div>

              <Card
                className="hover-elevate cursor-pointer"
                onClick={() => handleTeamSetupChoice("/analyze")}
                data-testid="card-upload-screenshot"
              >
                <CardContent className="pt-5 pb-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Camera className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm" data-testid="text-upload-title">Upload a Screenshot</p>
                      <p className="text-xs text-muted-foreground">
                        Import your existing team instantly
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2.5 pl-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">How to get your team screenshot</p>
                    <div className="space-y-2">
                      <div className="flex items-start gap-2.5" data-testid="instruction-step-1">
                        <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                          <Smartphone className="w-3 h-3 text-primary" />
                        </div>
                        <p className="text-xs">Open the <span className="font-medium">AFL Fantasy</span> app on your phone</p>
                      </div>
                      <div className="flex items-start gap-2.5" data-testid="instruction-step-2">
                        <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                          <Users className="w-3 h-3 text-primary" />
                        </div>
                        <p className="text-xs">Go to <span className="font-medium">"My Team"</span> to view your squad</p>
                      </div>
                      <div className="flex items-start gap-2.5" data-testid="instruction-step-3">
                        <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                          <Share2 className="w-3 h-3 text-primary" />
                        </div>
                        <p className="text-xs">Tap the <span className="font-medium">share icon</span> (top-right corner)</p>
                      </div>
                      <div className="flex items-start gap-2.5" data-testid="instruction-step-4">
                        <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                          <Download className="w-3 h-3 text-primary" />
                        </div>
                        <p className="text-xs">Choose <span className="font-medium">"Save Image"</span> to save to your device</p>
                      </div>
                      <div className="flex items-start gap-2.5" data-testid="instruction-step-5">
                        <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                          <Upload className="w-3 h-3 text-primary" />
                        </div>
                        <p className="text-xs"><span className="font-medium">Upload here</span> and we'll identify your players</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-md border overflow-hidden bg-muted/30">
                    <img
                      src={teamScreenshotImg}
                      alt="Example AFL Fantasy team screenshot"
                      className="w-full max-h-40 object-contain object-center"
                      data-testid="img-screenshot-example"
                    />
                    <p className="text-[10px] text-muted-foreground text-center py-1.5">
                      Example: AFL Fantasy share image
                    </p>
                  </div>

                  <p className="text-[11px] text-muted-foreground" data-testid="text-upload-note">
                    After uploading, you'll see your identified players. Click "Save as My Team" to save them.
                  </p>
                </CardContent>
              </Card>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-card px-3 text-xs text-muted-foreground">or</span>
                </div>
              </div>

              <Card
                className="hover-elevate cursor-pointer"
                onClick={() => handleTeamSetupChoice("/players")}
                data-testid="card-browse-players"
              >
                <CardContent className="flex items-center gap-3 py-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Users className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Browse & Pick Players</p>
                    <p className="text-xs text-muted-foreground">
                      Build your team manually from the player database
                    </p>
                  </div>
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
