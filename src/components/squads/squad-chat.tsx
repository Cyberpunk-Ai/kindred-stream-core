import { useEffect, useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import * as api from "@/features/squads/api";
import { useCurrentPlayer, useSquadMessages, useSquadRefresh } from "@/features/squads/hooks";
import { initials } from "./squad-ui";
import { Loader2, Pin, Send, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

const QUICK = ["GG!", "Ready in 5", "Can't make it tonight", "Scrim at 8?", "Check the bracket"];

export function SquadChat({ squad, canPost = true }: { squad: any; canPost?: boolean }) {
  const me = useCurrentPlayer();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const { data: messages = [], isLoading, refetch } = useSquadMessages(squad.id, canPost);
  const refresh = useSquadRefresh();

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const send = async (value: string) => {
    if (!me || !value.trim() || sending) return;
    setSending(true);
    try {
      await api.sendMessage(squad.id, me, value);
      setText("");
      await refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Message could not be sent");
    } finally {
      setSending(false);
    }
  };

  const pinned = messages.filter((m: any) => m.pinned);

  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden flex flex-col h-[560px]">
      {pinned.length > 0 && (
        <div className="border-b border-border/40 bg-primary/[0.04] px-4 py-2.5 space-y-1">
          {pinned.map((m: any) => (
            <div key={m.id} className="flex items-start gap-2 text-xs">
              <Pin className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
              <span className="text-foreground/80">
                <span className="font-semibold">{m.username}: </span>
                {m.text}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 space-y-3">
        {isLoading && (
          <div className="flex justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {messages.map((m: any) => {
          const mine = me && m.userId === me.userId;
          const system = m.userId === "system";
          if (system)
            return (
              <div key={m.id} className="flex justify-center">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary/60 px-3 py-1 text-[11px] text-muted-foreground">
                  <Sparkles className="h-3 w-3 text-primary" />
                  {m.text}
                </span>
              </div>
            );
          return (
            <div key={m.id} className={cn("flex items-end gap-2", mine && "flex-row-reverse")}>
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarImage src={m.avatarUrl ?? undefined} loading="lazy" decoding="async" />
                <AvatarFallback className="text-[10px]">{initials(m.username)}</AvatarFallback>
              </Avatar>
              <div className={cn("max-w-[76%] group", mine && "text-right")}>
                <div className="flex items-center gap-2 mb-1 text-[11px] text-muted-foreground justify-between">
                  <span className="font-semibold text-foreground/70">
                    {mine ? "You" : m.username}
                  </span>
                  <span>{format(new Date(m.createdAt), "HH:mm")}</span>
                </div>
                <div
                  className={cn(
                    "rounded-2xl px-3.5 py-2 text-[13.5px] leading-relaxed break-words",
                    mine
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-secondary/70 rounded-bl-md",
                  )}
                >
                  {m.text}
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await api.togglePin(m.id, !m.pinned);
                    await refetch();
                    refresh();
                  }}
                  className="mt-1 text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:text-primary"
                >
                  {m.pinned ? "Unpin" : "Pin message"}
                </button>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div className="border-t border-border/40 p-3 space-y-2">
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {QUICK.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => send(q)}
              disabled={!me || sending}
              className="shrink-0 rounded-full border border-border/50 bg-secondary/40 px-3 py-1 text-[11px] hover:border-primary/50 hover:text-primary transition-colors disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
          }}
        >
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={me ? "Message your squad…" : "Sign in to chat"}
            disabled={!me || sending}
            maxLength={1000}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!me || !text.trim() || sending}
            aria-label="Send message"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </div>
    </div>
  );
}
