import { useLocation, Link } from "wouter";
import {
  LayoutDashboard,
  Users,
  ArrowLeftRight,
  TrendingUp,
  Settings,
  Trophy,
  Zap,
  Brain,
  Camera,
  Radio,
  Calendar,
  ShieldCheck,
  LogOut,
} from "lucide-react";
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

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Live Scores", url: "/live", icon: Radio },
  { title: "Schedule", url: "/schedule", icon: Calendar },
  { title: "My Team", url: "/team", icon: Users },
  { title: "Players", url: "/players", icon: Trophy },
  { title: "Trade Centre", url: "/trades", icon: ArrowLeftRight },
  { title: "Form Guide", url: "/form", icon: TrendingUp },
  { title: "Intel Hub", url: "/intel", icon: Brain },
  { title: "Team Analyzer", url: "/analyze", icon: Camera },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user } = useAuth();

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link href="/">
          <div className="flex items-center gap-3 cursor-pointer" data-testid="link-home">
            <div className="w-10 h-10 rounded-md bg-accent flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5 text-accent-foreground" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-sidebar-foreground">
                AFL Fantasy
              </h1>
              <p className="text-xs text-sidebar-foreground/60">Machine</p>
            </div>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/40 uppercase text-[10px] tracking-widest font-semibold">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
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
                        <span className="text-sm">{item.title}</span>
                        {item.title === "Live Scores" && (
                          <Badge variant="default" className="ml-auto text-[10px] bg-red-500 text-white">
                            Live
                          </Badge>
                        )}
                        {item.title === "Intel Hub" && (
                          <Badge variant="default" className="ml-auto text-[10px] bg-accent text-accent-foreground">
                            Live
                          </Badge>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
              {user?.isAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    data-active={location === "/admin"}
                    className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-accent min-h-[44px]"
                  >
                    <Link href="/admin" data-testid="link-nav-admin">
                      <ShieldCheck className="w-4 h-4" />
                      <span className="text-sm">Admin</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 space-y-3">
        <FeedbackDialog />

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
