import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Settings, Save, DollarSign } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { LeagueSettings, Player } from "@shared/schema";
import { AFL_FANTASY_CLASSIC_2026 } from "@shared/game-rules";

const SALARY_CAP = AFL_FANTASY_CLASSIC_2026.salaryCap;

const settingsFormSchema = z.object({
  teamName: z.string().min(1, "Team name is required").max(50),
  currentRound: z.coerce.number().min(0).max(24),
  tradesRemaining: z.coerce.number().min(0).max(100),
});

type SettingsForm = z.infer<typeof settingsFormSchema>;

export default function SettingsPage() {
  const { toast } = useToast();

  const { data: settings, isLoading } = useQuery<LeagueSettings>({
    queryKey: ["/api/settings"],
  });

  const { data: myTeam } = useQuery<Player[]>({
    queryKey: ["/api/my-team"],
  });

  const teamValue = myTeam?.reduce((sum, p) => sum + (p.price || 0), 0) ?? 0;
  const remaining = SALARY_CAP - teamValue;

  const form = useForm<SettingsForm>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues: {
      teamName: settings?.teamName || "My Team",
      currentRound: settings?.currentRound ?? 1,
      tradesRemaining: settings?.tradesRemaining || 2,
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
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-2xl mx-auto">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64 rounded-md" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-2xl mx-auto" data-testid="page-settings">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure your league and team settings
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Settings className="w-4 h-4 text-primary" />
            League Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((data) => updateMutation.mutate(data))}
              className="space-y-5"
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
                    <FormDescription>
                      Your fantasy team name as it appears in your league
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="rounded-md border p-4 space-y-2" data-testid="display-salary-cap">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Salary Cap</span>
                </div>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-lg font-semibold" data-testid="text-salary-cap-value">
                      ${(SALARY_CAP / 1000000).toFixed(2)}M
                    </p>
                    <p className="text-xs text-muted-foreground">
                      AFL Fantasy Classic 2026 — fixed cap
                    </p>
                  </div>
                  {myTeam && myTeam.length > 0 && (
                    <div className="text-right">
                      <p className="text-lg font-semibold" data-testid="text-remaining-budget">
                        ${(remaining / 1000000).toFixed(2)}M
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Remaining budget
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                      <FormLabel>Trades This Round</FormLabel>
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

              <Button
                type="submit"
                disabled={updateMutation.isPending}
                data-testid="button-save-settings"
              >
                <Save className="w-4 h-4 mr-2" />
                Save Settings
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
