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
import { Camera, Users, ArrowRight, Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { LeagueSettings } from "@shared/schema";
import logoImg from "@assets/1772915052518_1772915124902_no_bg.png";

const settingsFormSchema = z.object({
  teamName: z.string().min(1, "Team name is required").max(50),
  salaryCap: z.coerce.number().min(1000000).max(20000000),
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
      salaryCap: 18300000,
      currentRound: 1,
      tradesRemaining: 2,
    },
    values: settings
      ? {
          teamName: settings.teamName,
          salaryCap: settings.salaryCap,
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

                  <FormField
                    control={form.control}
                    name="salaryCap"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Salary Cap ($)</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            data-testid="input-salary-cap"
                          />
                        </FormControl>
                        <FormDescription>Default: $18,300,000</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

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
                  How do you want to set up your team?
                </h2>
                <p className="text-muted-foreground text-sm">
                  Choose how to get started with your squad
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Card
                  className="hover-elevate cursor-pointer"
                  onClick={() => handleTeamSetupChoice("/analyze")}
                  data-testid="card-upload-screenshot"
                >
                  <CardContent className="flex flex-col items-center text-center py-8 space-y-3">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <Camera className="w-6 h-6 text-primary" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-semibold text-sm">Upload a Screenshot</p>
                      <p className="text-xs text-muted-foreground">
                        Import your existing team instantly
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card
                  className="hover-elevate cursor-pointer"
                  onClick={() => handleTeamSetupChoice("/players")}
                  data-testid="card-browse-players"
                >
                  <CardContent className="flex flex-col items-center text-center py-8 space-y-3">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <Users className="w-6 h-6 text-primary" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-semibold text-sm">Browse & Pick Players</p>
                      <p className="text-xs text-muted-foreground">
                        Build your team from the player database
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
