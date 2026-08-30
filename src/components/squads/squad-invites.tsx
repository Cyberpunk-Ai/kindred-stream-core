import { useState } from "react";
import { Button } from "@/components/ui/button";
import * as api from "@/features/squads/api";
import { useCurrentPlayer, useSquadInvites, useSquadRefresh } from "@/features/squads/hooks";
import { SquadCrest, RoleBadge, gameLabel } from "./squad-ui";
import { Check, Loader2, MailOpen, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { useNavigate } from "@/lib/router-compat";

export function SquadInvitesPanel({ compact = false }: { compact?: boolean }) {
  const me = useCurrentPlayer();
  const { data: invites = [] } = useSquadInvites();
  const refresh = useSquadRefresh();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);

  if (!me || invites.length === 0) return null;

  const respond = async (invite: any, accept: boolean) => {
    setBusy(invite.id);
    try {
      await api.respondToInvite(invite.id, accept);
      await refresh();
      if (accept) {
        toast.success(`Welcome to ${invite.squad.name}!`);
        navigate(`/teams/${invite.squadId}`);
      } else {
        toast.info("Invite declined");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Could not respond to the invite");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-2xl border border-primary/30 bg-primary/[0.04] p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <MailOpen className="h-4 w-4 text-primary" />
        <h2 className="font-display text-sm font-bold uppercase tracking-wider">
          Squad invites
          <span className="ml-2 rounded-full bg-primary/15 text-primary px-2 py-0.5 text-[11px]">
            {invites.length}
          </span>
        </h2>
      </div>
      <div className="space-y-2.5">
        {invites.map((invite: any) => (
          <div
            key={invite.id}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-border/50 bg-card p-3"
          >
            <SquadCrest tag={invite.squad.tag} color={invite.squad.color} size="sm" />
            <div className="flex-1 min-w-[180px]">
              <p className="text-sm font-semibold leading-tight">
                {invite.squad.name}{" "}
                <span className="text-muted-foreground font-normal">
                  · {gameLabel(invite.squad.game)}
                </span>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {invite.fromUsername} invited you as {invite.role.replace("_", "-")} ·{" "}
                {formatDistanceToNow(new Date(invite.createdAt), { addSuffix: true })}
              </p>
              {!compact && invite.message && (
                <p className="text-xs italic text-foreground/70 mt-1">“{invite.message}”</p>
              )}
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <RoleBadge role={invite.role} />
              <Button
                size="sm"
                className="gap-1.5"
                disabled={busy === invite.id}
                onClick={() => respond(invite, true)}
              >
                {busy === invite.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={busy === invite.id}
                onClick={() => respond(invite, false)}
              >
                <X className="h-3.5 w-3.5" /> Decline
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
