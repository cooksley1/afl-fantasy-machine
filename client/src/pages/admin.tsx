import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ShieldCheck,
  Ban,
  Eye,
  Users,
  MessageSquare,
  Reply,
  Archive,
  Trash2,
  Crown,
  Mail,
} from "lucide-react";
import { useState } from "react";
import type { User, Feedback } from "@shared/schema";

function UsersTab() {
  const { toast } = useToast();
  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
  });

  const blockMutation = useMutation({
    mutationFn: async ({ id, blocked }: { id: string; blocked: boolean }) => {
      await apiRequest("PATCH", `/api/admin/users/${id}/block`, { blocked });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User updated" });
    },
  });

  const adminMutation = useMutation({
    mutationFn: async ({ id, admin }: { id: string; admin: boolean }) => {
      await apiRequest("PATCH", `/api/admin/users/${id}/admin`, { admin });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Admin status updated" });
    },
  });

  const impersonateMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/admin/impersonate/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Now impersonating user" });
      window.location.href = "/";
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-muted-foreground">
          {users?.length || 0} registered users
        </h3>
      </div>
      {users?.map((user) => (
        <Card key={user.id} data-testid={`card-user-${user.id}`}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                {user.profileImageUrl ? (
                  <img
                    src={user.profileImageUrl}
                    alt=""
                    className="w-10 h-10 rounded-full shrink-0"
                    data-testid={`img-user-avatar-${user.id}`}
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <Users className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate" data-testid={`text-user-name-${user.id}`}>
                      {[user.firstName, user.lastName].filter(Boolean).join(" ") || "No name"}
                    </span>
                    {user.isAdmin && (
                      <Badge variant="default" className="text-[10px]">Admin</Badge>
                    )}
                    {user.isBlocked && (
                      <Badge variant="destructive" className="text-[10px]">Blocked</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Mail className="w-3 h-3" />
                    <span className="truncate" data-testid={`text-user-email-${user.id}`}>
                      {user.email || "No email"}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    <span className="text-[10px] text-muted-foreground">
                      Joined {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "Unknown"}
                    </span>
                    {user.loginCount != null && user.loginCount > 0 && (
                      <span className="text-[10px] text-muted-foreground" data-testid={`text-login-count-${user.id}`}>
                        {user.loginCount} login{user.loginCount !== 1 ? "s" : ""}
                      </span>
                    )}
                    {user.lastLoginAt && (
                      <span className="text-[10px] text-muted-foreground" data-testid={`text-last-login-${user.id}`}>
                        Last: {new Date(user.lastLoginAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => adminMutation.mutate({ id: user.id, admin: !user.isAdmin })}
                  disabled={adminMutation.isPending}
                  data-testid={`button-toggle-admin-${user.id}`}
                  title={user.isAdmin ? "Remove admin" : "Make admin"}
                >
                  <Crown className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant={user.isBlocked ? "default" : "outline"}
                  size="sm"
                  onClick={() => blockMutation.mutate({ id: user.id, blocked: !user.isBlocked })}
                  disabled={blockMutation.isPending}
                  data-testid={`button-toggle-block-${user.id}`}
                  title={user.isBlocked ? "Unblock" : "Block"}
                >
                  {user.isBlocked ? <ShieldCheck className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => impersonateMutation.mutate(user.id)}
                  disabled={impersonateMutation.isPending}
                  data-testid={`button-impersonate-${user.id}`}
                  title="Impersonate"
                >
                  <Eye className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function FeedbackTab() {
  const { toast } = useToast();
  const [replyText, setReplyText] = useState<Record<number, string>>({});

  const { data: feedbackList, isLoading } = useQuery<Feedback[]>({
    queryKey: ["/api/admin/feedback"],
  });

  const respondMutation = useMutation({
    mutationFn: async ({ id, response }: { id: number; response: string }) => {
      await apiRequest("PATCH", `/api/admin/feedback/${id}/respond`, { response });
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/feedback"] });
      setReplyText((prev) => ({ ...prev, [id]: "" }));
      toast({ title: "Response sent" });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("PATCH", `/api/admin/feedback/${id}/archive`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/feedback"] });
      toast({ title: "Feedback archived" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/feedback/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/feedback"] });
      toast({ title: "Feedback deleted" });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  const active = feedbackList?.filter((f) => !f.isArchived) || [];
  const archived = feedbackList?.filter((f) => f.isArchived) || [];

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-muted-foreground">
        {active.length} active, {archived.length} archived
      </h3>
      {active.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No feedback messages yet.
        </div>
      )}
      {active.map((item) => (
        <Card key={item.id} data-testid={`card-feedback-${item.id}`}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm" data-testid={`text-feedback-subject-${item.id}`}>
                    {item.subject}
                  </span>
                  <Badge
                    variant={item.status === "unread" ? "default" : "secondary"}
                    className="text-[10px]"
                  >
                    {item.status}
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground">
                  From: {item.userName || item.userEmail || "Unknown"} &middot;{" "}
                  {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ""}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => archiveMutation.mutate(item.id)}
                  disabled={archiveMutation.isPending}
                  data-testid={`button-archive-feedback-${item.id}`}
                  title="Archive"
                >
                  <Archive className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteMutation.mutate(item.id)}
                  disabled={deleteMutation.isPending}
                  data-testid={`button-delete-feedback-${item.id}`}
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </Button>
              </div>
            </div>
            <p className="text-sm text-foreground" data-testid={`text-feedback-message-${item.id}`}>
              {item.message}
            </p>
            {item.adminResponse && (
              <div className="rounded-md bg-muted p-3">
                <span className="text-xs font-medium text-muted-foreground">Admin Response:</span>
                <p className="text-sm mt-1">{item.adminResponse}</p>
              </div>
            )}
            <div className="flex gap-2">
              <Textarea
                placeholder="Write a response..."
                value={replyText[item.id] || ""}
                onChange={(e) => setReplyText((prev) => ({ ...prev, [item.id]: e.target.value }))}
                className="text-sm min-h-[60px]"
                data-testid={`input-reply-${item.id}`}
              />
              <Button
                size="sm"
                onClick={() =>
                  respondMutation.mutate({
                    id: item.id,
                    response: replyText[item.id] || "",
                  })
                }
                disabled={!replyText[item.id]?.trim() || respondMutation.isPending}
                data-testid={`button-reply-${item.id}`}
                className="shrink-0"
              >
                <Reply className="w-3.5 h-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      {archived.length > 0 && (
        <div className="pt-4 border-t">
          <h4 className="text-sm font-medium text-muted-foreground mb-3">Archived</h4>
          {archived.map((item) => (
            <Card key={item.id} className="opacity-60 mb-2" data-testid={`card-feedback-archived-${item.id}`}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium">{item.subject}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {item.userName || item.userEmail}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteMutation.mutate(item.id)}
                    data-testid={`button-delete-archived-${item.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  const { user } = useAuth();

  if (!user?.isAdmin) {
    return (
      <div className="flex items-center justify-center h-full p-8" data-testid="admin-access-denied">
        <Card className="max-w-sm w-full">
          <CardContent className="p-6 text-center space-y-3">
            <ShieldCheck className="w-10 h-10 text-muted-foreground mx-auto" />
            <h2 className="text-lg font-semibold">Access Denied</h2>
            <p className="text-sm text-muted-foreground">
              You don't have admin permissions to access this page.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6" data-testid="admin-page">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Admin Panel</h1>
        <p className="text-sm text-muted-foreground">Manage users and feedback</p>
      </div>

      <Tabs defaultValue="users">
        <TabsList data-testid="admin-tabs">
          <TabsTrigger value="users" data-testid="tab-users">
            <Users className="w-3.5 h-3.5 mr-1.5" />
            Users
          </TabsTrigger>
          <TabsTrigger value="feedback" data-testid="tab-feedback">
            <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
            Feedback
          </TabsTrigger>
        </TabsList>
        <TabsContent value="users" className="mt-4">
          <UsersTab />
        </TabsContent>
        <TabsContent value="feedback" className="mt-4">
          <FeedbackTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
