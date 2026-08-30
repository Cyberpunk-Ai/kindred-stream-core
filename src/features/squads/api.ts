/**
 * Squad data layer — backed by the database so squads, invites, join requests,
 * chat and planning are shared across every player and device.
 */
import { backend } from "@/backend";
import type { Database, Json } from "@/integrations/supabase/types";

export type SquadRole = "captain" | "co_captain" | "player" | "sub";
export type RsvpStatus = "in" | "out" | "maybe";
export type GameType = Database["public"]["Enums"]["game_type"];
export type InviteStatus = Database["public"]["Enums"]["squad_invite_status"];

type SquadRowBase = Database["public"]["Tables"]["squads"]["Row"];
type SquadMemberRow = Database["public"]["Tables"]["squad_members"]["Row"];
type SquadRow = SquadRowBase & { squad_members?: SquadMemberRow[] | null };
type SquadInviteRow = Database["public"]["Tables"]["squad_invites"]["Row"];
type SquadJoinRequestRow = Database["public"]["Tables"]["squad_join_requests"]["Row"];
type SquadMessageRow = Database["public"]["Tables"]["squad_messages"]["Row"];
type SquadEventRow = Database["public"]["Tables"]["squad_events"]["Row"];

interface ProfileInfo {
  username: string;
  avatarUrl: string | null;
}

export const SQUAD_COLORS = [
  { name: "Neon", value: "142 76% 45%" },
  { name: "Violet", value: "280 100% 60%" },
  { name: "Cyan", value: "190 95% 50%" },
  { name: "Amber", value: "38 95% 55%" },
  { name: "Rose", value: "347 90% 60%" },
];

export const ROLE_LABELS: Record<SquadRole, string> = {
  captain: "Captain",
  co_captain: "Co-captain",
  player: "Player",
  sub: "Sub",
};

export function isOfficer(role?: string | null) {
  return role === "captain" || role === "co_captain";
}

function parseRsvps(json: Json | null | undefined): Record<string, RsvpStatus> {
  if (json && typeof json === "object" && !Array.isArray(json)) {
    return json as Record<string, RsvpStatus>;
  }
  return {};
}

async function profileMap(userIds: string[]): Promise<Record<string, ProfileInfo>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return {};
  const { data } = await backend
    .from("profiles")
    .select("user_id, username, avatar_url")
    .in("user_id", ids);
  const out: Record<string, ProfileInfo> = {};
  for (const p of data ?? [])
    out[p.user_id] = { username: p.username ?? "Player", avatarUrl: p.avatar_url ?? null };
  return out;
}

function shapeSquad(row: SquadRow, profiles: Record<string, ProfileInfo>) {
  const members = (row.squad_members ?? []).map((m) => ({
    userId: m.user_id,
    role: (m.role ?? "player") as SquadRole,
    joinedAt: m.joined_at,
    username: profiles[m.user_id]?.username ?? "Player",
    avatarUrl: profiles[m.user_id]?.avatarUrl ?? null,
  }));
  const order: Record<SquadRole, number> = { captain: 0, co_captain: 1, player: 2, sub: 3 };
  members.sort((a, b) => (order[a.role] ?? 9) - (order[b.role] ?? 9));
  return {
    id: row.id,
    name: row.name,
    tag: row.tag ?? "",
    game: row.game ?? "other",
    bio: row.description ?? "",
    color: row.color ?? SQUAD_COLORS[0].value,
    ownerId: row.captain_id,
    isPublic: row.is_public !== false,
    maxMembers: row.max_members ?? 8,
    createdAt: row.created_at,
    members,
  };
}

export type Squad = ReturnType<typeof shapeSquad>;

const SQUAD_SELECT = "*, squad_members(user_id, role, joined_at)";

export async function fetchSquads(): Promise<Squad[]> {
  const { data, error } = await backend
    .from("squads")
    .select(SQUAD_SELECT)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as SquadRow[];
  const profiles = await profileMap(
    rows.flatMap((s) => (s.squad_members ?? []).map((m) => m.user_id)),
  );
  return rows.map((s) => shapeSquad(s, profiles));
}

export async function fetchSquad(squadId: string): Promise<Squad | null> {
  const { data, error } = await backend
    .from("squads")
    .select(SQUAD_SELECT)
    .eq("id", squadId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as SquadRow;
  const profiles = await profileMap((row.squad_members ?? []).map((m) => m.user_id));
  return shapeSquad(row, profiles);
}

export async function createSquad(input: {
  name: string;
  tag: string;
  game: GameType;
  bio?: string;
  color?: string;
  isPublic?: boolean;
  ownerId: string;
}) {
  const { data, error } = await backend
    .from("squads")
    .insert({
      name: input.name.trim(),
      tag: input.tag.trim().toUpperCase().slice(0, 6),
      game: input.game,
      description: input.bio?.trim() || null,
      color: input.color ?? SQUAD_COLORS[0].value,
      is_public: input.isPublic ?? true,
      captain_id: input.ownerId,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function updateSquad(
  squadId: string,
  patch: Database["public"]["Tables"]["squads"]["Update"],
) {
  const { error } = await backend.from("squads").update(patch).eq("id", squadId);
  if (error) throw error;
}

export async function deleteSquad(squadId: string) {
  const { error } = await backend.from("squads").delete().eq("id", squadId);
  if (error) throw error;
}

export async function setMemberRole(squadId: string, userId: string, role: SquadRole) {
  const { error } = await backend
    .from("squad_members")
    .update({ role })
    .eq("squad_id", squadId)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function removeMember(squadId: string, userId: string) {
  const { error } = await backend
    .from("squad_members")
    .delete()
    .eq("squad_id", squadId)
    .eq("user_id", userId);
  if (error) throw error;
}

/* ---------------- invites ---------------- */

export async function fetchMyInvites(userId: string) {
  const { data, error } = await backend
    .from("squad_invites")
    .select("*, squads(*)")
    .eq("invitee_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as (SquadInviteRow & { squads: SquadRowBase | null })[];
  const profiles = await profileMap(rows.map((i) => i.inviter_id));
  return rows.map((i) => ({
    id: i.id,
    squadId: i.squad_id,
    role: "player" as SquadRole,
    message: i.message,
    createdAt: i.created_at,
    fromUsername: profiles[i.inviter_id]?.username ?? "A captain",
    squad: {
      id: i.squads?.id,
      name: i.squads?.name ?? "Squad",
      tag: i.squads?.tag ?? "",
      game: i.squads?.game ?? "other",
      color: i.squads?.color ?? SQUAD_COLORS[0].value,
    },
  }));
}

export async function fetchSquadInvites(squadId: string) {
  const { data, error } = await backend
    .from("squad_invites")
    .select("*")
    .eq("squad_id", squadId)
    .eq("status", "pending");
  if (error) return [];
  const rows = (data ?? []) as SquadInviteRow[];
  const profiles = await profileMap(rows.map((i) => i.invitee_id));
  return rows.map((i) => ({
    id: i.id,
    role: "player" as SquadRole,
    toUsername: profiles[i.invitee_id]?.username ?? "Player",
  }));
}

export async function invitePlayer(input: {
  squadId: string;
  inviterId: string;
  inviteeId: string;
  role: SquadRole;
  message?: string;
}) {
  const { data: existing } = await backend
    .from("squad_members")
    .select("user_id")
    .eq("squad_id", input.squadId)
    .eq("user_id", input.inviteeId)
    .maybeSingle();
  if (existing) throw new Error("That player is already in this squad");

  const { error } = await backend.from("squad_invites").insert({
    squad_id: input.squadId,
    inviter_id: input.inviterId,
    invitee_id: input.inviteeId,
    message: input.message ?? null,
    status: "pending",
  });
  if (error) {
    if (error.code === "23505") throw new Error("That player already has a pending invite");
    throw error;
  }
}

export async function respondToInvite(inviteId: string, accept: boolean) {
  const { error } = await backend
    .from("squad_invites")
    .update({ status: accept ? "accepted" : "rejected" })
    .eq("id", inviteId);
  if (error) throw error;
}

export async function cancelInvite(inviteId: string) {
  const { error } = await backend.from("squad_invites").delete().eq("id", inviteId);
  if (error) throw error;
}

/* ---------------- join requests ---------------- */

export async function fetchJoinRequests(squadId: string) {
  const { data, error } = await backend
    .from("squad_join_requests")
    .select("*")
    .eq("squad_id", squadId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) return [];
  const rows = (data ?? []) as SquadJoinRequestRow[];
  const profiles = await profileMap(rows.map((r) => r.user_id));
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    message: r.message,
    createdAt: r.created_at,
    username: profiles[r.user_id]?.username ?? "Player",
    avatarUrl: profiles[r.user_id]?.avatarUrl ?? null,
  }));
}

export async function fetchMyJoinRequests(userId: string) {
  const { data } = await backend
    .from("squad_join_requests")
    .select("id, squad_id, status")
    .eq("user_id", userId);
  const out: Record<string, InviteStatus> = {};
  for (const r of data ?? []) out[r.squad_id] = r.status;
  return out;
}

export async function requestToJoin(squadId: string, userId: string, message?: string) {
  const { error } = await backend.from("squad_join_requests").upsert(
    {
      squad_id: squadId,
      user_id: userId,
      message: message ?? null,
      status: "pending",
      responded_at: null,
    },
    { onConflict: "squad_id,user_id" },
  );
  if (error) throw error;
}

export async function respondToJoinRequest(
  requestId: string,
  approve: boolean,
  _officerId: string,
) {
  const { error } = await backend
    .from("squad_join_requests")
    .update({ status: approve ? "accepted" : "rejected", responded_at: new Date().toISOString() })
    .eq("id", requestId);
  if (error) throw error;
}

export async function cancelJoinRequest(squadId: string, userId: string) {
  await backend.from("squad_join_requests").delete().eq("squad_id", squadId).eq("user_id", userId);
}

/* ---------------- chat ---------------- */

export async function fetchMessages(squadId: string) {
  const { data, error } = await backend
    .from("squad_messages")
    .select("*")
    .eq("squad_id", squadId)
    .order("created_at", { ascending: true })
    .limit(300);
  if (error) throw error;
  const rows = (data ?? []) as SquadMessageRow[];
  return rows.map((m) => ({
    id: m.id,
    userId: m.is_system ? "system" : m.user_id,
    username: m.username,
    avatarUrl: m.avatar_url,
    text: m.content,
    pinned: m.pinned,
    createdAt: m.created_at,
  }));
}

export async function sendMessage(
  squadId: string,
  author: { userId: string; username: string; avatarUrl?: string | null },
  text: string,
) {
  const trimmed = text.trim().slice(0, 1000);
  if (!trimmed) return;
  const { error } = await backend.from("squad_messages").insert({
    squad_id: squadId,
    user_id: author.userId,
    username: author.username,
    avatar_url: author.avatarUrl ?? null,
    content: trimmed,
  });
  if (error) throw error;
}

export async function togglePin(messageId: string, pinned: boolean) {
  const { error } = await backend.from("squad_messages").update({ pinned }).eq("id", messageId);
  if (error) throw error;
}

/* ---------------- planning ---------------- */

export async function fetchEvents(squadId: string) {
  const { data, error } = await backend
    .from("squad_events")
    .select("*")
    .eq("squad_id", squadId)
    .order("starts_at", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as SquadEventRow[];
  return rows.map((e) => ({
    id: e.id,
    title: e.title,
    game: e.game,
    startsAt: e.starts_at,
    notes: e.notes,
    type: e.type,
    createdBy: e.created_by,
    rsvps: parseRsvps(e.rsvps),
  }));
}

export type SquadEvent = Awaited<ReturnType<typeof fetchEvents>>[number];

export async function addEvent(
  squadId: string,
  input: {
    title: string;
    game: GameType;
    startsAt: string;
    notes?: string;
    type?: string;
    createdBy: string;
  },
) {
  const { error } = await backend.from("squad_events").insert({
    squad_id: squadId,
    title: input.title.trim(),
    game: input.game,
    starts_at: new Date(input.startsAt).toISOString(),
    notes: input.notes?.trim() || null,
    type: input.type ?? "tournament",
    created_by: input.createdBy,
    rsvps: { [input.createdBy]: "in" } satisfies Record<string, RsvpStatus>,
  });
  if (error) throw error;
}

export async function removeEvent(eventId: string) {
  const { error } = await backend.from("squad_events").delete().eq("id", eventId);
  if (error) throw error;
}

export async function rsvp(eventId: string, userId: string, status: RsvpStatus) {
  const { data } = await backend
    .from("squad_events")
    .select("rsvps")
    .eq("id", eventId)
    .maybeSingle();
  const next: Record<string, RsvpStatus> = { ...parseRsvps(data?.rsvps), [userId]: status };
  const { error } = await backend.from("squad_events").update({ rsvps: next }).eq("id", eventId);
  if (error) throw error;
}
