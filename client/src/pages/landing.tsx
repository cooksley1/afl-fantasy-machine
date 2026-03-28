import { TrendingUp, Brain, Shield, ArrowRight, BarChart3, Users, ChevronDown, Zap, Loader2 } from "lucide-react";
import logoImg from "@assets/1772915052518_1772915124902_no_bg.png";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";

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

const faqs = [
  {
    q: "What is AFL Fantasy Machine?",
    a: "AFL Fantasy Machine is an AI-powered advisor for AFL Fantasy Classic 2026. It provides smart trade recommendations, player projections, tag intelligence, live score tracking, and strategic insights to help you dominate your league.",
  },
  {
    q: "How does the scoring system work?",
    a: "AFL Fantasy Classic uses official AFL scoring: Kick ×3, Handball ×2, Mark ×3, Tackle ×4, Hitout ×1, Goal ×6, Behind ×1, Free Against ×-3. Your squad of 30 players generates points each round, with 22 on-field and 8 on the bench.",
  },
  {
    q: "What data sources does the app use?",
    a: "We pull live data from Footywire (match stats), Squiggle API (fixtures, tips, ladder), AFL.com.au RSS (official news), and Google News feeds for all 18 AFL clubs. Player photos come from the official AFL Fantasy API.",
  },
  {
    q: "How are player projections calculated?",
    a: "Projections use a multi-factor Bayesian model blending recent form, season average, opponent difficulty, venue history, weather, and role changes. The engine also calculates floors, ceilings, captain probability, and consistency ratings.",
  },
  {
    q: "What is the tag intelligence system?",
    a: "Tag intelligence analyses historical tagging patterns across all 18 AFL teams. It identifies which teams use dedicated taggers, who those taggers target, and how much that typically reduces a player's score — giving you a risk warning before each round.",
  },
  {
    q: "How does the trade engine work?",
    a: "The trade engine evaluates 20+ factors including score difference, breakeven trends, cash generation potential, fixture difficulty, DPP flexibility, and season phase. Each trade gets a Trade EV score combining score uplift and long-term value.",
  },
  {
    q: "Is AFL Fantasy Machine free?",
    a: "Yes, the core features are completely free. Sign in with Google, Apple, GitHub, or email to get started.",
  },
  {
    q: "How often is data updated?",
    a: "Data is gathered automatically every 4 hours during the season, covering news, injury updates, team selections, and form trends. Match scores are pulled from Footywire immediately after games finish.",
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b last:border-b-0" data-testid={`faq-item-${q.slice(0, 20).replace(/\s/g, '-').toLowerCase()}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-4 text-left text-foreground font-medium hover:text-accent transition-colors"
        data-testid={`faq-trigger-${q.slice(0, 20).replace(/\s/g, '-').toLowerCase()}`}
      >
        <span className="pr-4 text-sm sm:text-base">{q}</span>
        <ChevronDown className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <p className="pb-4 text-sm text-muted-foreground leading-relaxed" data-testid={`faq-answer-${q.slice(0, 20).replace(/\s/g, '-').toLowerCase()}`}>
          {a}
        </p>
      )}
    </div>
  );
}

export default function LandingPage() {
  const [devLoading, setDevLoading] = useState(false);
  const isDev = import.meta.env.DEV;

  const handleDevLogin = async () => {
    setDevLoading(true);
    try {
      await apiRequest("POST", "/api/auth/dev-login");
      window.location.href = "/";
    } catch {
      setDevLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background" data-testid="landing-page">
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-background/80 border-b">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={logoImg} alt="AFL Fantasy Machine" className="w-8 h-8 object-contain" data-testid="img-nav-logo" />
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

      <section className="pb-16 sm:pb-24 px-4 sm:px-6" data-testid="landing-faq-section">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center text-foreground mb-3">
            Frequently Asked Questions
          </h2>
          <p className="text-center text-muted-foreground mb-8 max-w-lg mx-auto">
            Everything you need to know about AFL Fantasy Machine.
          </p>
          <Card className="border bg-card">
            <CardContent className="p-4 sm:p-6">
              {faqs.map((faq) => (
                <FaqItem key={faq.q} q={faq.q} a={faq.a} />
              ))}
            </CardContent>
          </Card>
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
            <img src={logoImg} alt="AFL Fantasy Machine" className="w-4 h-4 object-contain" data-testid="img-footer-logo" />
            <span>AFL Fantasy Machine</span>
          </div>
          <div className="flex items-center gap-3">
            {isDev && (
              <button
                onClick={handleDevLogin}
                disabled={devLoading}
                className="text-[10px] text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors cursor-pointer"
                data-testid="button-dev-login"
              >
                {devLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : "dev"}
              </button>
            )}
            <span>&copy; 2026 All rights reserved</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
