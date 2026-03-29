import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Users,
  ArrowLeftRight,
  TrendingUp,
  Settings,
  Trophy,
  Brain,
  Camera,
  Radio,
  Calendar,
  ShieldCheck,
  LogOut,
  HelpCircle,
  Map,
  Eye,
  ClipboardCheck,
  FlaskConical,
  Crown,
  Bell,
} from "lucide-react";
import logoImg from "@assets/1772915052518_1772915124902_no_bg.png";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { FeedbackDialog } from "@/components/feedback-dialog";

const navGroups = [
  {
    label: "MY TEAM",
    testId: "group-my-team",
    items: [
      { title: "Dashboard", subtitle: "Your command centre", url: "/", icon: LayoutDashboard },
      { title: "My Team", subtitle: "Manage your squad", url: "/team", icon: Users },
      { title: "Trade Centre", subtitle: "Find and execute trades", url: "/trades", icon: ArrowLeftRight },
      { title: "Season Roadmap", subtitle: "Your path to #1", url: "/roadmap", icon: Map },
      { title: "Game Day Guide", subtitle: "Step-by-step checklist", url: "/game-day", icon: ClipboardCheck },
      { title: "Team Lab", subtitle: "Build & compare teams", url: "/sandbox", icon: FlaskConical },
      { title: "Reverse Engineer", subtitle: "Build your ultimate squad", url: "/dream", icon: Crown },
    ],
  },
  {
    label: "INTELLIGENCE",
    testId: "group-intelligence",
    items: [
      { title: "Intel Hub", subtitle: "AI-powered insights", url: "/intel", icon: Brain, badge: "Live", badgeClass: "bg-accent text-accent-foreground" },
      { title: "Form Guide", subtitle: "Player trends & stats", url: "/form", icon: TrendingUp },
      { title: "Player Database", subtitle: "Browse all players", url: "/players", icon: Trophy },
      { title: "League Spy", subtitle: "Track opponents", url: "/league", icon: Eye },
    ],
  },
  {
    label: "TOOLS",
    testId: "group-tools",
    items: [
      { title: "Team Upload & Analyser", subtitle: "Upload & analyse", url: "/analyze", icon: Camera },
      { title: "Live Scores", subtitle: "Real-time scores", url: "/live", icon: Radio, badge: "Live", badgeClass: "bg-red-500 text-white" },
      { title: "Schedule", subtitle: "Season fixtures", url: "/schedule", icon: Calendar },
    ],
  },
  {
    label: "ACCOUNT",
    testId: "group-account",
    items: [
      { title: "Settings", subtitle: "League configuration", url: "/settings", icon: Settings },
      { title: "FAQ", subtitle: "Help & guides", url: "/faq", icon: HelpCircle },
    ],
  },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user } = useAuth();

  const { data: alertCountData } = useQuery<{ count: number }>({
    queryKey: ["/api/player-alerts/count"],
    refetchInterval: 60000,
    enabled: !!user,
  });
  const unreadAlertCount = alertCountData?.count || 0;

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center justify-between">
          <Link href="/">
            <div className="flex items-center gap-3 cursor-pointer" data-testid="link-home">
              <img src={logoImg} alt="AFL Fantasy Machine" className="w-10 h-10 rounded-md object-contain shrink-0" data-testid="img-sidebar-logo" />
              <div>
                <h1 className="text-base font-bold tracking-tight text-sidebar-foreground">
                  AFL Fantasy
                </h1>
                <p className="text-xs text-sidebar-foreground/60">Machine</p>
              </div>
            </div>
          </Link>
          <Link href="/alerts">
            <button
              className="relative p-2 rounded-md hover:bg-sidebar-accent transition-colors"
              data-testid="button-alerts-bell"
            >
              <Bell className={`w-5 h-5 ${unreadAlertCount > 0 ? "text-accent" : "text-sidebar-foreground/60"}`} />
              {unreadAlertCount > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1"
                  data-testid="badge-alert-count"
                >
                  {unreadAlertCount > 99 ? "99+" : unreadAlertCount}
                </span>
              )}
            </button>
          </Link>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {navGroups.map((group) => (
          <SidebarGroup key={group.label} data-testid={group.testId}>
            <SidebarGroupLabel className="text-sidebar-foreground/40 uppercase text-[10px] tracking-widest font-semibold">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isActive = location === item.url ||
                    (item.url !== "/" && location.startsWith(item.url));
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        data-active={isActive}
                        className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-accent min-h-[44px]"
                      >
                        <Link href={item.url} data-testid={`link-nav-${item.title.toLowerCase().replace(/\s/g, '-')}`}>
                          <item.icon className="w-4 h-4" />
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-sm">{item.title}</span>
                            <span className="text-[10px] text-sidebar-foreground/40 group-data-[collapsible=icon]:hidden">{item.subtitle}</span>
                          </div>
                          {item.badge && (
                            <Badge variant="default" className={`ml-auto text-[10px] ${item.badgeClass}`}>
                              {item.badge}
                            </Badge>
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
                {group.label === "ACCOUNT" && user?.isAdmin && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      data-active={location === "/admin"}
                      className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-accent min-h-[44px]"
                    >
                      <Link href="/admin" data-testid="link-nav-admin">
                        <ShieldCheck className="w-4 h-4" />
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-sm">Admin</span>
                          <span className="text-[10px] text-sidebar-foreground/40 group-data-[collapsible=icon]:hidden">System management</span>
                        </div>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="p-4 space-y-3">
        <FeedbackDialog />
        <p className="text-[10px] text-sidebar-foreground/40 text-center group-data-[collapsible=icon]:hidden">We read every message</p>
        <p className="text-[9px] text-sidebar-foreground/30 text-center group-data-[collapsible=icon]:hidden" data-testid="text-app-version">v2.10.7</p>

        {user && (
          <div className="rounded-md bg-sidebar-accent/50 p-3 space-y-2">
            <div className="flex items-center gap-2">
              {user.profileImageUrl ? (
                <img
                  src={user.profileImageUrl}
                  alt=""
                  className="w-7 h-7 rounded-full shrink-0"
                  data-testid="img-user-sidebar-avatar"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-sidebar-accent flex items-center justify-center shrink-0">
                  <Users className="w-3.5 h-3.5 text-sidebar-foreground/60" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-sidebar-foreground truncate" data-testid="text-sidebar-username">
                  {[user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "User"}
                </p>
                {user.email && (
                  <p className="text-[10px] text-sidebar-foreground/50 truncate">
                    {user.email}
                  </p>
                )}
              </div>
            </div>
            <a href="/api/logout" className="block">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2 h-7 text-sidebar-foreground/60 hover:text-sidebar-foreground"
                data-testid="button-logout"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="text-xs">Sign Out</span>
              </Button>
            </a>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
