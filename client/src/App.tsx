import { useState } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { OnboardingWizard } from "@/components/onboarding-wizard";
import { useAuth } from "@/hooks/use-auth";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import MyTeam from "@/pages/my-team";
import Players from "@/pages/players";
import Trades from "@/pages/trades";
import FormGuide from "@/pages/form-guide";
import IntelHub from "@/pages/intel-hub";
import TeamAnalyzer from "@/pages/team-analyzer";
import PlayerReportPage from "@/pages/player-report";
import SettingsPage from "@/pages/settings-page";
import LiveScoresPage from "@/pages/live-scores";
import LandingPage from "@/pages/landing";
import AdminPage from "@/pages/admin";
import SchedulePage from "@/pages/schedule";
import FAQPage from "@/pages/faq";
import SeasonRoadmap from "@/pages/season-roadmap";
import LeagueSpy from "@/pages/league-spy";
import TeamSandbox from "@/pages/team-sandbox";
import GameDayGuide from "@/pages/game-day-guide";
import { Loader2 } from "lucide-react";
import logoImg from "@assets/1772915052518_1772915124902_no_bg.png";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/team" component={MyTeam} />
      <Route path="/players" component={Players} />
      <Route path="/trades" component={Trades} />
      <Route path="/form" component={FormGuide} />
      <Route path="/intel" component={IntelHub} />
      <Route path="/analyze" component={TeamAnalyzer} />
      <Route path="/player/:id" component={PlayerReportPage} />
      <Route path="/live" component={LiveScoresPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/schedule" component={SchedulePage} />
      <Route path="/admin" component={AdminPage} />
      <Route path="/faq" component={FAQPage} />
      <Route path="/roadmap" component={SeasonRoadmap} />
      <Route path="/game-day" component={GameDayGuide} />
      <Route path="/sandbox" component={TeamSandbox} />
      <Route path="/league" component={LeagueSpy} />
      <Route component={NotFound} />
    </Switch>
  );
}

const sidebarStyle = {
  "--sidebar-width": "15rem",
  "--sidebar-width-icon": "3rem",
};

function AuthenticatedApp() {
  const [onboardingComplete, setOnboardingComplete] = useState(
    () => localStorage.getItem("afl_onboarding_complete") === "true"
  );

  if (!onboardingComplete) {
    return <OnboardingWizard onComplete={() => setOnboardingComplete(true)} />;
  }

  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center justify-between gap-2 px-3 py-2 border-b h-12 shrink-0">
            <div className="flex items-center gap-2">
              <SidebarTrigger data-testid="button-sidebar-toggle" className="h-9 w-9" />
              <div className="flex items-center gap-1.5 sm:hidden">
                <img src={logoImg} alt="AFL Fantasy Machine" className="w-5 h-5 object-contain" data-testid="img-mobile-header-logo" />
                <span className="text-sm font-semibold tracking-tight">AFL Fantasy Machine</span>
              </div>
            </div>
            <ThemeToggle />
          </header>
          <main className="flex-1 overflow-y-auto overflow-x-hidden">
            <Router />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function AppContent() {
  const { user, isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
          <span className="text-sm text-muted-foreground">Loading...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LandingPage />;
  }

  return <AuthenticatedApp />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppContent />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
