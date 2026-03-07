import { Zap, TrendingUp, Brain, Shield, ArrowRight, BarChart3, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const features = [
  {
    icon: Brain,
    title: "AI-Powered Insights",
    description: "Smart trade recommendations, tag warnings, and projection models that learn from real AFL data.",
  },
  {
    icon: TrendingUp,
    title: "Live Score Tracking",
    description: "Real-time scores, form trends, and breakeven tracking to stay ahead every round.",
  },
  {
    icon: BarChart3,
    title: "Advanced Projections",
    description: "Multi-factor projection engine covering form, venue, opponent difficulty, and more.",
  },
  {
    icon: Shield,
    title: "Tag Intelligence",
    description: "Evidence-based tag warnings using real AFL tagging history and pre-game reports.",
  },
  {
    icon: Users,
    title: "Squad Management",
    description: "Full 30-player squad management with field/list views, captaincy, and position optimisation.",
  },
  {
    icon: Zap,
    title: "Trade Engine",
    description: "Automated trade analysis with expected value, cash generation, and fixture-aware scoring.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background" data-testid="landing-page">
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-background/80 border-b">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-accent flex items-center justify-center">
              <Zap className="w-4 h-4 text-accent-foreground" />
            </div>
            <span className="font-bold tracking-tight text-foreground">AFL Fantasy Machine</span>
          </div>
          <a href="/api/login">
            <Button size="sm" data-testid="button-login-nav">
              Sign In
            </Button>
          </a>
        </div>
      </nav>

      <section className="pt-28 pb-16 sm:pt-36 sm:pb-24 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent/10 text-accent text-xs font-medium mb-6">
            <Zap className="w-3 h-3" />
            AFL Fantasy Classic 2026
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground leading-tight">
            Win Your League
            <br />
            <span className="text-accent">Every Single Week</span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            AI-powered analysis, live projections, and evidence-based trade recommendations. 
            Built for serious AFL Fantasy coaches who play to win.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <a href="/api/login">
              <Button size="lg" className="w-full sm:w-auto text-base px-8" data-testid="button-login-hero">
                Get Started Free
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </a>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Sign in with Google, Apple, GitHub, or email
          </p>
        </div>
      </section>

      <section className="pb-16 sm:pb-24 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center text-foreground mb-3">
            Everything You Need to Dominate
          </h2>
          <p className="text-center text-muted-foreground mb-10 max-w-lg mx-auto">
            A complete fantasy toolkit powered by data science and AFL intelligence.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((feature) => (
              <Card
                key={feature.title}
                className="group border bg-card hover:bg-card/80 transition-colors"
                data-testid={`card-feature-${feature.title.toLowerCase().replace(/\s/g, '-')}`}
              >
                <CardContent className="p-5">
                  <div className="w-9 h-9 rounded-md bg-accent/10 flex items-center justify-center mb-3 group-hover:bg-accent/20 transition-colors">
                    <feature.icon className="w-4 h-4 text-accent" />
                  </div>
                  <h3 className="font-semibold text-foreground mb-1.5">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="pb-16 sm:pb-24 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="rounded-xl bg-card border p-8 sm:p-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-3">
              Ready to Start Winning?
            </h2>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Join coaches using data-driven decisions to climb the AFL Fantasy rankings.
            </p>
            <a href="/api/login">
              <Button size="lg" className="text-base px-8" data-testid="button-login-cta">
                Sign In and Get Started
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t py-6 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Zap className="w-3 h-3 text-accent" />
            <span>AFL Fantasy Machine</span>
          </div>
          <span>&copy; 2026 All rights reserved</span>
        </div>
      </footer>
    </div>
  );
}
