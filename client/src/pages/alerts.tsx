import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
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
  Settings,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useLocation } from "wouter";
import type { PlayerAlert } from "@shared/schema";

const ALERT_TYPES = ["injury", "late_change", "selection", "role_change", "news"] as const;

const alertTypeConfig: Record<string, { icon: typeof AlertTriangle; label: string; color: string; description: string }> = {
  injury: { icon: AlertTriangle, label: "Injury", color: "bg-red-500/10 text-red-500 border-red-500/20", description: "Hamstring, knee, concussion, etc." },
  late_change: { icon: UserMinus, label: "Late Change", color: "bg-orange-500/10 text-orange-500 border-orange-500/20", description: "Omissions, managed, late swaps" },
  selection: { icon: UserPlus, label: "Selection", color: "bg-green-500/10 text-green-500 border-green-500/20", description: "Named, recalled, debuts" },
  role_change: { icon: ShieldAlert, label: "Role Change", color: "bg-blue-500/10 text-blue-500 border-blue-500/20", description: "Position moves, tagging, vest" },
  news: { icon: Newspaper, label: "News", color: "bg-gray-500/10 text-gray-400 border-gray-500/20", description: "General player mentions" },
};

function getAlertPrefs(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem("afl_alert_prefs");
    if (raw) return JSON.parse(raw);
  } catch {}
  const defaults: Record<string, boolean> = {};
  for (const t of ALERT_TYPES) defaults[t] = true;
  return defaults;
}

function saveAlertPrefs(prefs: Record<string, boolean>) {
  localStorage.setItem("afl_alert_prefs", JSON.stringify(prefs));
}

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
  const [prefs, setPrefs] = useState(getAlertPrefs);
  const [showSettings, setShowSettings] = useState(false);

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

  const togglePref = (type: string) => {
    const updated = { ...prefs, [type]: !prefs[type] };
    setPrefs(updated);
    saveAlertPrefs(updated);
  };

  const enabledTypes = new Set(Object.entries(prefs).filter(([, v]) => v).map(([k]) => k));
  const filteredAlerts = alerts.filter((a) => enabledTypes.has(a.alertType));
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
            onClick={() => setShowSettings(!showSettings)}
            data-testid="button-alert-settings"
          >
            <Settings className="w-4 h-4" />
            {showSettings ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
          </Button>
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

      {showSettings && (
        <Card className="p-4 space-y-3" data-testid="card-alert-settings">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Alert Preferences</p>
          <p className="text-[11px] text-muted-foreground">Choose which alert types you want to see. Disabled types are hidden from your feed.</p>
          <div className="space-y-2">
            {ALERT_TYPES.map((type) => {
              const config = alertTypeConfig[type];
              const Icon = config.icon;
              return (
                <div key={type} className="flex items-center justify-between py-1" data-testid={`pref-toggle-${type}`}>
                  <div className="flex items-center gap-2.5">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center border ${config.color}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{config.label}</p>
                      <p className="text-[10px] text-muted-foreground">{config.description}</p>
                    </div>
                  </div>
                  <Switch
                    checked={!!prefs[type]}
                    onCheckedChange={() => togglePref(type)}
                    data-testid={`switch-${type}`}
                  />
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {filteredAlerts.length === 0 ? (
        <Card className="p-8 text-center space-y-3">
          <BellOff className="w-10 h-10 mx-auto text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground" data-testid="text-no-alerts">
            {alerts.length > 0
              ? "All alerts are hidden by your preferences. Tap the settings icon to adjust."
              : "No alerts yet. We'll notify you when something happens to one of your team players — injuries, late changes, selection news."}
          </p>
          {alerts.length === 0 && (
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
          )}
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredAlerts.map((alert) => <AlertCard key={alert.id} alert={alert} config={alertTypeConfig[alert.alertType] || alertTypeConfig.news} onMarkRead={() => markReadMutation.mutate(alert.id)} />)}
        </div>
      )}
    </div>
  );
}

function AlertCard({ alert, config, onMarkRead }: { alert: PlayerAlert; config: typeof alertTypeConfig[string]; onMarkRead: () => void }) {
  const [, navigate] = useLocation();
  const Icon = config.icon;
  const hasPlayer = alert.playerId != null;

  return (
    <Card
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
                <span
                  className={`text-xs font-semibold text-accent ${hasPlayer ? "cursor-pointer hover:underline" : ""}`}
                  onClick={hasPlayer ? () => navigate(`/player/${alert.playerId}`) : undefined}
                  data-testid={`text-alert-player-${alert.id}`}
                >
                  {alert.playerName}
                </span>
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${config.color}`}>
                  {config.label}
                </Badge>
              </div>
              <p className="text-sm font-medium" data-testid={`text-alert-title-${alert.id}`}>
                {alert.title}
              </p>
            </div>
            <span className="text-[10px] text-muted-foreground shrink-0" data-testid={`text-alert-time-${alert.id}`}>
              {alert.createdAt ? timeAgo(alert.createdAt) : ""}
            </span>
          </div>
          <p className="text-xs text-muted-foreground" data-testid={`text-alert-message-${alert.id}`}>
            {alert.message}
          </p>
          {!alert.isRead && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground"
              onClick={onMarkRead}
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
}
