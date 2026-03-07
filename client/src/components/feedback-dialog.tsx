import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { MessageSquare, Send } from "lucide-react";
import type { Feedback } from "@shared/schema";

export function FeedbackDialog() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const { data: myFeedback } = useQuery<Feedback[]>({
    queryKey: ["/api/feedback"],
    enabled: open,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/feedback", { subject, message });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/feedback"] });
      setSubject("");
      setMessage("");
      toast({ title: "Feedback sent", description: "Thanks for your feedback!" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to send feedback", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2" data-testid="button-open-feedback">
          <MessageSquare className="w-4 h-4" />
          <span className="text-sm">Send Feedback</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Send Feedback</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-2">
            <Input
              placeholder="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              data-testid="input-feedback-subject"
            />
            <Textarea
              placeholder="Your message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="min-h-[100px]"
              data-testid="input-feedback-message"
            />
            <Button
              onClick={() => submitMutation.mutate()}
              disabled={!subject.trim() || !message.trim() || submitMutation.isPending}
              className="w-full"
              data-testid="button-submit-feedback"
            >
              <Send className="w-3.5 h-3.5 mr-2" />
              {submitMutation.isPending ? "Sending..." : "Send Feedback"}
            </Button>
          </div>

          {myFeedback && myFeedback.length > 0 && (
            <div className="border-t pt-4">
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Your Previous Messages</h4>
              <div className="space-y-2">
                {myFeedback.map((item) => (
                  <div key={item.id} className="rounded-md border p-3 space-y-1" data-testid={`card-my-feedback-${item.id}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{item.subject}</span>
                      <Badge
                        variant={item.status === "responded" ? "default" : "secondary"}
                        className="text-[10px]"
                      >
                        {item.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{item.message}</p>
                    {item.adminResponse && (
                      <div className="rounded bg-muted p-2 mt-2">
                        <span className="text-[10px] font-medium text-muted-foreground">Admin Reply:</span>
                        <p className="text-xs mt-0.5">{item.adminResponse}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
