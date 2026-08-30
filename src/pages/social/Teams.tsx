import { useMemo, useState } from "react";
import { SocialLayout } from "@/components/social/social-nav";
import { Link } from "@/lib/router-compat";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import * as api from "@/features/squads/api";
import {
  useAllSquads,
  useCurrentPlayer,
  useMyJoinRequests,
  useMySquads,
  useSquadRefresh,
} from "@/features/squads/hooks";
import {
  CreateSquadDialog,
  SquadCrest,
  StatPill,
  gameLabel,
  initials,
} from "@/components/squads/squad-ui";
import { SquadInvitesPanel } from "@/components/squads/squad-invites";
import { Clock, Loader2, Lock, Search, Shield, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";

export default function Teams() {
  const me = useCurrentPlayer();
  const { data: allSquads = [], isLoading } = useAllSquads();
  const { data: mySquads = [] } = useMySquads();
  const { data: myRequests = {} } = useMyJoinRequests();
  const refresh = useSquadRefresh();
  const [term, setTerm] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const discover = useMemo(() => {
    const mine = new Set(mySquads.map((s: any) => s.id));
    const q = term.trim().toLowerCase();
    return allSquads
      .filter((s: any) => !mine.has(s.id) && s.isPublic)
      .filter((s: any) =>
        q ? `${s.name} ${s.tag} ${gameLabel(s.game)}`.toLowerCase().includes(q) : true,
      );
  }, [allSquads, mySquads, term]);

  const totalMates = mySquads.reduce((n: number, s: any) => n + s.members.length, 0);
  const captainOf = mySquads.filter((s: any) => s.ownerId === me?.userId).length;

  const requestJoin = async (squad: any) => {
    if (!me) return toast.error("Sign in to request a spot");
    setBusy(squad.id);
    try {
      await api.requestToJoin(squad.id, me.userId);
      await refresh();
      toast.success(`Request sent to ${squad.name}. A captain will review it.`);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not send the request");
    } finally {
      setBusy(null);
    }
  };

  const cancelRequest = async (squad: any) => {
    if (!me) return;
    setBusy(squad.id);
    try {
      await api.cancelJoinRequest(squad.id, me.userId);
      await refresh();
      toast.info("Request withdrawn");
    } finally {
      setBusy(null);
    }
  };

  return (
    <SocialLayout
      title="Squads"
      subtitle="Squad up, plan tournaments and climb the ladder together"
    >
      <div className="space-y-6">
        <SquadInvitesPanel />

        <section className="rounded-2xl border border-border/50 bg-gradient-to-br from-primary/[0.07] to-transparent p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-xl font-bold flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                {me ? `Welcome back, ${me.username}` : "Build your squad"}
              </h2>
              <p className="text-sm text-muted-foreground mt-1 max-w-lg">
                Create a clan, invite players, chat in a members-only squad room, schedule
                tournaments and see every teammate's live leaderboard rank.
              </p>
            </div>
            <CreateSquadDialog />
          </div>
          <div className="grid grid-cols-3 gap-3 mt-5 max-w-md">
            <StatPill label="Your squads" value={mySquads.length} accent />
            <StatPill label="Squadmates" value={totalMates} />
            <StatPill label="Captain of" value={captainOf} />
          </div>
        </section>

        <section>
          <h3 className="font-display text-sm font-bold uppercase tracking-wider mb-3">
            My squads
          </h3>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : mySquads.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center">
              <Users className="h-10 w-10 text-primary mx-auto mb-3" />
              <p className="font-display font-bold">You're not in a squad yet</p>
              <p className="text-sm text-muted-foreground mt-1 mb-4">
                Create one in seconds, or request to join a squad below.
              </p>
              <CreateSquadDialog
                trigger={<Button variant="outline">Create your first squad</Button>}
              />
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {mySquads.map((squad: any) => (
                <SquadCard key={squad.id} squad={squad} member />
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h3 className="font-display text-sm font-bold uppercase tracking-wider">
              Discover squads
            </h3>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Search squads or games…"
                className="pl-9"
              />
            </div>
          </div>
          {discover.length === 0 ? (
            <p className="rounded-2xl border border-border/50 bg-card p-6 text-sm text-muted-foreground text-center">
              No public squads match your search yet.
            </p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {discover.map((squad: any) => {
                const status = myRequests[squad.id];
                const full = squad.members.length >= (squad.maxMembers ?? 8);
                return (
                  <SquadCard
                    key={squad.id}
                    squad={squad}
                    action={
                      status === "pending" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          disabled={busy === squad.id}
                          onClick={() => cancelRequest(squad)}
                        >
                          <Clock className="h-3.5 w-3.5" /> Request pending
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className="gap-1.5"
                          disabled={busy === squad.id || full}
                          onClick={() => requestJoin(squad)}
                        >
                          {busy === squad.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <UserPlus className="h-3.5 w-3.5" />
                          )}
                          {full ? "Squad full" : "Request to join"}
                        </Button>
                      )
                    }
                  />
                );
              })}
            </div>
          )}
        </section>
      </div>
    </SocialLayout>
  );
}

function SquadCard({
  squad,
  member,
  action,
}: {
  squad: any;
  member?: boolean;
  action?: React.ReactNode;
}) {
  const body = (
    <>
      <div className="flex items-start gap-3">
        <SquadCrest tag={squad.tag} color={squad.color} />
        <div className="min-w-0 flex-1">
          <p className="font-display font-bold truncate">{squad.name}</p>
          <p className="text-xs text-muted-foreground">{gameLabel(squad.game)}</p>
          {squad.bio && (
            <p className="text-xs text-foreground/70 mt-1.5 line-clamp-2">{squad.bio}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3">
        <div className="flex -space-x-2">
          {squad.members.slice(0, 5).map((m: any) => (
            <Avatar key={m.userId} className="h-7 w-7 border-2 border-card">
              <AvatarImage src={m.avatarUrl ?? undefined} loading="lazy" decoding="async" />
              <AvatarFallback className="text-[9px]">{initials(m.username)}</AvatarFallback>
            </Avatar>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">
          {squad.members.length}/{squad.maxMembers ?? 8} members
        </span>
        {!member && (
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Lock className="h-3 w-3" /> Members only
          </span>
        )}
      </div>
      {action && <div className="mt-3 flex justify-end">{action}</div>}
    </>
  );

  if (member) {
    return (
      <Link
        to={`/teams/${squad.id}`}
        className="block rounded-2xl border border-border/50 bg-card p-4 hover:border-primary/40 transition-colors"
      >
        {body}
      </Link>
    );
  }
  return <div className="rounded-2xl border border-border/50 bg-card p-4">{body}</div>;
}
