import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  AlertTriangle,
  Bell,
  BellOff,
  Check,
  CheckCheck,
  ShieldAlert,
  UserMinus,
  UserPlus,
  Newspaper,
  RefreshCw,
  ArrowRight,
} from "lucide-react";
import { useLocation } from "wouter";
import type { PlayerAlert } from "@shared/schema";

const alertTypeConfig: Record<string, { icon: typeof AlertTriangle; label: string; color: string }> = {
  injury: { icon: AlertTriangle, label: "Injury", color: "bg-red-500/10 text-red-500 border-red-500/20" },
  late_change: { icon: UserMinus, label: "Late Change", color: "bg-orange-500/10 text-orange-500 border-orange-500/20" },
  selection: { icon: UserPlus, label: "Selection", color: "bg-green-500/10 text-green-500 border-green-500/20" },
  role_change: { icon: ShieldAlert, label: "Role Change", color: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  news: { icon: Newspaper, label: "News", color: "bg-gray-500/10 text-gray-400 border-gray-500/20" },
};

function timeAgo(date: string | Date): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function AlertsPage() {
  const { data: alerts = [], isLoading } = useQuery<PlayerAlert[]>({
    queryKey: ["/api/player-alerts"],
    refetchInterval: 60000,
  });

  const { data: countData } = useQuery<{ count: number }>({
    queryKey: ["/api/player-alerts/count"],
    refetchInterval: 60000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/player-alerts/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player-alerts/count"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/player-alerts/read-all"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player-alerts/count"] });
    },
  });

  const checkAlertsMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/player-alerts/check"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player-alerts/count"] });
    },
  });

  const unreadCount = countData?.count ?? alerts.filter((a) => !a.isRead).length;

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3">
          <Bell className="w-5 h-5 text-accent" />
          <h1 className="text-lg font-bold" data-testid="text-alerts-title">Player Alerts</h1>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-muted/50 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-w-2xl" data-testid="page-alerts">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="w-5 h-5 text-accent" />
          <h1 className="text-lg font-bold" data-testid="text-alerts-title">Player Alerts</h1>
          {unreadCount > 0 && (
            <Badge variant="destructive" className="text-xs" data-testid="badge-unread-count">
              {unreadCount} new
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => checkAlertsMutation.mutate()}
            disabled={checkAlertsMutation.isPending}
            data-testid="button-check-alerts"
          >
            <RefreshCw className={`w-4 h-4 ${checkAlertsMutation.isPending ? "animate-spin" : ""}`} />
          </Button>
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
              data-testid="button-mark-all-read"
            >
              <CheckCheck className="w-4 h-4 mr-1" />
              Mark all read
            </Button>
          )}
        </div>
      </div>

      {alerts.length === 0 ? (
        <Card className="p-8 text-center space-y-3">
          <BellOff className="w-10 h-10 mx-auto text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground" data-testid="text-no-alerts">
            No alerts yet. We'll notify you when something happens to one of your team players — injuries, late changes, selection news.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => checkAlertsMutation.mutate()}
            disabled={checkAlertsMutation.isPending}
            data-testid="button-check-now"
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${checkAlertsMutation.isPending ? "animate-spin" : ""}`} />
            Check now
          </Button>
        </Card>
      ) : (
        <div className="space-y-2">
          {alerts.map((alert) => {
            const config = alertTypeConfig[alert.alertType] || alertTypeConfig.news;
            const Icon = config.icon;
            return (
              <Card
                key={alert.id}
                className={`p-3 transition-all ${!alert.isRead ? "border-accent/30 bg-accent/5" : "opacity-70"}`}
                data-testid={`card-alert-${alert.id}`}
              >
                <div className="flex gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border ${config.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-accent" data-testid={`text-alert-player-${alert.id}`}>
                            {alert.playerName}
                          </span>
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${config.color}`}>
                            {config.label}
                          </Badge>
                        </div>
                        <p className="text-sm font-medium truncate" data-testid={`text-alert-title-${alert.id}`}>
                          {alert.title}
                        </p>
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0" data-testid={`text-alert-time-${alert.id}`}>
                        {alert.createdAt ? timeAgo(alert.createdAt) : ""}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2" data-testid={`text-alert-message-${alert.id}`}>
                      {alert.message}
                    </p>
                    {!alert.isRead && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-muted-foreground"
                        onClick={() => markReadMutation.mutate(alert.id)}
                        data-testid={`button-mark-read-${alert.id}`}
                      >
                        <Check className="w-3 h-3 mr-1" />
                        Mark read
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
