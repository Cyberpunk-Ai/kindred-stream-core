/* eslint-disable react-refresh/only-export-components */
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { GAME_TYPES } from "@/constants/game-types";
import type { GameType } from "@/features/squads/api";
import * as api from "@/features/squads/api";
import { SQUAD_COLORS, ROLE_LABELS, type SquadRole } from "@/features/squads/api";
import { useCurrentPlayer, usePlayerSearch, useSquadRefresh } from "@/features/squads/hooks";
import { Crown, Loader2, Plus, Search, Shield, Star, UserPlus, Users } from "lucide-react";
import { useNavigate } from "@/lib/router-compat";
import { useMemo } from "react";
import { toast } from "sonner";

export { SQUAD_COLORS };

export function initials(name?: string) {
  return (name ?? "?").slice(0, 2).toUpperCase();
}

export function gameLabel(id?: string | null) {
  return GAME_TYPES.find((g) => g.id === id)?.label ?? id ?? "Any game";
}

export function SquadCrest({
  tag,
  color,
  size = "md",
}: {
  tag: string;
  color: string;
  size?: "sm" | "md" | "lg";
}) {
  const dims = { sm: "h-9 w-9 text-[11px]", md: "h-12 w-12 text-sm", lg: "h-16 w-16 text-lg" }[
    size
  ];
  return (
    <div
      className={cn(
        "shrink-0 rounded-xl grid place-items-center font-display font-bold tracking-tight border",
        dims,
      )}
      style={{
        background: `hsl(${color} / 0.14)`,
        borderColor: `hsl(${color} / 0.4)`,
        color: `hsl(${color})`,
        boxShadow: `0 0 18px hsl(${color} / 0.18)`,
      }}
    >
      {tag || "GF"}
    </div>
  );
}

export function RoleBadge({ role }: { role: SquadRole }) {
  const map: Record<string, { className: string; icon: any }> = {
    captain: { className: "bg-primary/15 text-primary border-primary/30", icon: Crown },
    co_captain: { className: "bg-accent/15 text-accent border-accent/30", icon: Star },
    player: { className: "bg-secondary text-foreground/80 border-border/50", icon: Users },
    sub: { className: "bg-secondary/60 text-muted-foreground border-border/50", icon: Shield },
  };
  const { className, icon: Icon } = map[role] ?? map.player;
  return (
    <Badge variant="outline" className={cn("gap-1 text-[10px] font-semibold", className)}>
      <Icon className="h-3 w-3" />
      {ROLE_LABELS[role] ?? "Player"}
    </Badge>
  );
}

export function CreateSquadDialog({ trigger }: { trigger?: React.ReactNode }) {
  const me = useCurrentPlayer();
  const refresh = useSquadRefresh();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [game, setGame] = useState<GameType>(GAME_TYPES[0].id);
  const [bio, setBio] = useState("");
  const [color, setColor] = useState(SQUAD_COLORS[0].value);
  const [isPublic, setIsPublic] = useState(true);

  const submit = async () => {
    if (!me) return toast.error("Sign in to create a squad");
    if (name.trim().length < 3) return toast.error("Squad name needs at least 3 characters");
    if (tag.trim().length < 2) return toast.error("Pick a 2–6 character clan tag");
    setSaving(true);
    try {
      const id = await api.createSquad({
        name,
        tag,
        game,
        bio,
        color,
        isPublic,
        ownerId: me.userId,
      });
      await refresh();
      toast.success(`${name.trim()} is live. Invite your squadmates!`);
      setOpen(false);
      setName("");
      setTag("");
      setBio("");
      navigate(`/teams/${id}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not create the squad");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button className="gap-2">
            <Plus className="h-4 w-4" /> Create squad
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Create your squad</DialogTitle>
          <DialogDescription>
            Build a roster, plan tournaments and track every member's rank.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-[1fr_110px] gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Squad name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Midnight Mavericks"
                maxLength={40}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Tag</label>
              <Input
                value={tag}
                onChange={(e) => setTag(e.target.value.toUpperCase())}
                placeholder="MMV"
                maxLength={6}
                className="uppercase"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Main game</label>
            <Select value={game} onValueChange={(v) => setGame(v as GameType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GAME_TYPES.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Squad bio</label>
            <Textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Weeknight scrims, weekend cash cups. Serious players only."
              rows={3}
              maxLength={200}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground">Crest colour</label>
            <div className="flex gap-2">
              {SQUAD_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  aria-label={c.name}
                  className={cn(
                    "h-8 w-8 rounded-lg border-2 transition-transform",
                    color === c.value ? "scale-110" : "border-transparent opacity-70",
                  )}
                  style={{
                    background: `hsl(${c.value} / 0.25)`,
                    borderColor: color === c.value ? `hsl(${c.value})` : undefined,
                  }}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border/50 px-3 py-2.5">
            <div>
              <p className="text-sm font-semibold">Discoverable squad</p>
              <p className="text-[11px] text-muted-foreground">
                Players can find you and request to join. Officers approve every request.
              </p>
            </div>
            <Switch
              checked={isPublic}
              onCheckedChange={setIsPublic}
              aria-label="Discoverable squad"
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={saving} className="w-full gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
            Create squad
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function InvitePlayerDialog({ squadId, squadName }: { squadId: string; squadName: string }) {
  const me = useCurrentPlayer();
  const refresh = useSquadRefresh();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [role, setRole] = useState<SquadRole>("player");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const { data: results = [], isFetching } = usePlayerSearch(term);

  const invite = async (player: any) => {
    if (!me) return toast.error("Sign in first");
    setBusy(player.user_id);
    try {
      await api.invitePlayer({
        squadId,
        inviterId: me.userId,
        inviteeId: player.user_id,
        role,
        message: message.trim() || undefined,
      });
      await refresh();
      toast.success(`Invite sent to ${player.username}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not send the invite");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <UserPlus className="h-4 w-4" /> Invite
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Invite squadmates to {squadName}</DialogTitle>
          <DialogDescription>Search players by username and send them an invite.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search username…"
              className="pl-9"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select value={role} onValueChange={(v) => setRole(v as SquadRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="player">Player</SelectItem>
                <SelectItem value="sub">Substitute</SelectItem>
                <SelectItem value="co_captain">Co-captain</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Note (optional)"
              maxLength={80}
            />
          </div>
          <div className="rounded-xl border border-border/50 divide-y divide-border/30 max-h-64 overflow-y-auto">
            {term.trim().length < 2 ? (
              <p className="p-4 text-xs text-muted-foreground text-center">
                Type at least 2 characters to search players.
              </p>
            ) : isFetching ? (
              <p className="p-4 text-xs text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
              </p>
            ) : results.length === 0 ? (
              <p className="p-4 text-xs text-muted-foreground text-center">No players found.</p>
            ) : (
              results.map((p: any) => (
                <div key={p.user_id} className="flex items-center gap-3 p-3">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={p.avatar_url ?? undefined} loading="lazy" decoding="async" />
                    <AvatarFallback>{initials(p.username)}</AvatarFallback>
                  </Avatar>
                  <span className="flex-1 text-sm font-semibold truncate">{p.username}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === p.user_id}
                    onClick={() => invite(p)}
                  >
                    {busy === p.user_id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      "Invite"
                    )}
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function StatPill({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl bg-secondary/50 border border-border/40 px-3 py-2">
      <div className={cn("font-display text-lg font-bold leading-none", accent && "text-primary")}>
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

export function useNextEvent(events: any[] = []) {
  return useMemo(() => {
    const upcoming = (events ?? [])
      .filter((e) => new Date(e.startsAt).getTime() > Date.now() - 3600_000)
      .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
    return upcoming[0];
  }, [events]);
}
