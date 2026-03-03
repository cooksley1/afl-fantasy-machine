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

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
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
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4">
        <div className="rounded-md bg-sidebar-accent/50 p-3">
          <p className="text-[11px] text-sidebar-foreground/60 leading-relaxed">
            AI-powered analysis covering form, injuries, byes, captains, cash cows, and live data from AFL sources.
          </p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
