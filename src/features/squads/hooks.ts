import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { backend } from "@/backend";
import { useAuth } from "@/lib/auth-context";
import * as api from "./api";

export const squadKeys = {
  all: ["squads"] as const,
  list: () => ["squads", "list"] as const,
  detail: (id?: string) => ["squads", "detail", id] as const,
  invites: (userId?: string) => ["squads", "invites", userId] as const,
  squadInvites: (id?: string) => ["squads", "squad-invites", id] as const,
  requests: (id?: string) => ["squads", "requests", id] as const,
  myRequests: (userId?: string) => ["squads", "my-requests", userId] as const,
  messages: (id?: string) => ["squads", "messages", id] as const,
  events: (id?: string) => ["squads", "events", id] as const,
};

export function useCurrentPlayer() {
  const { user, profile } = useAuth();
  return useMemo(
    () =>
      user
        ? {
            userId: user.id,
            username: profile?.username ?? user.email?.split("@")[0] ?? "Player",
            avatarUrl: profile?.avatar_url ?? null,
          }
        : null,
    [user, profile],
  );
}

/** Every squad visible to the viewer (public squads + their own). */
export function useAllSquads() {
  return useQuery({ queryKey: squadKeys.list(), queryFn: api.fetchSquads, staleTime: 30_000 });
}

export function useMySquads() {
  const me = useCurrentPlayer();
  const { data = [], ...rest } = useAllSquads();
  const mine = useMemo(
    () => (me ? data.filter((s: any) => s.members.some((m: any) => m.userId === me.userId)) : []),
    [data, me],
  );
  return { data: mine, ...rest };
}

export function useSquad(squadId?: string) {
  return useQuery({
    queryKey: squadKeys.detail(squadId),
    enabled: !!squadId,
    queryFn: () => api.fetchSquad(squadId!),
  });
}

export function useMyRole(squad: any) {
  const me = useCurrentPlayer();
  const member = squad?.members?.find((m: any) => m.userId === me?.userId);
  return {
    me,
    role: member?.role ?? null,
    isMember: !!member,
    isOfficer: api.isOfficer(member?.role) || squad?.ownerId === me?.userId,
    isOwner: squad?.ownerId === me?.userId,
  };
}

export function useSquadInvites() {
  const me = useCurrentPlayer();
  return useQuery({
    queryKey: squadKeys.invites(me?.userId),
    enabled: !!me,
    queryFn: () => api.fetchMyInvites(me!.userId),
    refetchInterval: 60_000,
  });
}

export function usePendingSquadInvites(squadId?: string, enabled = true) {
  return useQuery({
    queryKey: squadKeys.squadInvites(squadId),
    enabled: !!squadId && enabled,
    queryFn: () => api.fetchSquadInvites(squadId!),
  });
}

export function useJoinRequests(squadId?: string, enabled = true) {
  return useQuery({
    queryKey: squadKeys.requests(squadId),
    enabled: !!squadId && enabled,
    queryFn: () => api.fetchJoinRequests(squadId!),
    refetchInterval: enabled ? 60_000 : false,
  });
}

export function useMyJoinRequests() {
  const me = useCurrentPlayer();
  return useQuery({
    queryKey: squadKeys.myRequests(me?.userId),
    enabled: !!me,
    queryFn: () => api.fetchMyJoinRequests(me!.userId),
  });
}

export function useSquadMessages(squadId?: string, enabled = true) {
  return useQuery({
    queryKey: squadKeys.messages(squadId),
    enabled: !!squadId && enabled,
    queryFn: () => api.fetchMessages(squadId!),
    refetchInterval: enabled ? 8_000 : false,
  });
}

export function useSquadEvents(squadId?: string, enabled = true) {
  return useQuery({
    queryKey: squadKeys.events(squadId),
    enabled: !!squadId && enabled,
    queryFn: () => api.fetchEvents(squadId!),
  });
}

/** Invalidate every squad query after a mutation. */
export function useSquadRefresh() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: squadKeys.all });
}

export function useSquadMutation<TArgs>(fn: (args: TArgs) => Promise<any>) {
  const refresh = useSquadRefresh();
  return useMutation({ mutationFn: fn, onSuccess: refresh });
}

export interface MemberStats {
  userId: string;
  rating: number;
  matchesPlayed: number;
  matchesWon: number;
  rank: number;
}

/** Live leaderboard rating + global rank for every member of a squad. */
export function useMemberStats(userIds: string[]) {
  const key = [...userIds].sort().join(",");
  return useQuery({
    queryKey: ["squads", "member-stats", key],
    enabled: userIds.length > 0,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<Record<string, MemberStats>> => {
      const { data } = await backend
        .from("leaderboard_stats")
        .select("user_id, points, wins, losses")
        .in("user_id", userIds);

      const out: Record<string, MemberStats> = {};
      await Promise.all(
        (data ?? []).map(async (row: any) => {
          const { count } = await backend
            .from("leaderboard_stats")
            .select("*", { count: "exact", head: true })
            .gt("points", row.points ?? 0);
          const wins = row.wins ?? 0;
          const losses = row.losses ?? 0;
          out[row.user_id] = {
            userId: row.user_id,
            rating: row.points ?? 0,
            matchesPlayed: wins + losses,
            matchesWon: wins,
            rank: (count ?? 0) + 1,
          };
        }),
      );
      return out;
    },
  });
}

/** Username search used by the invite flow. */
export function usePlayerSearch(term: string) {
  const me = useCurrentPlayer();
  const q = term.trim();
  return useQuery({
    queryKey: ["squads", "player-search", q],
    enabled: q.length >= 2,
    staleTime: 30 * 1000,
    queryFn: async () => {
      const { data } = await backend
        .from("profiles")
        .select("user_id, username, avatar_url")
        .ilike("username", `%${q}%`)
        .limit(8);
      return (data ?? []).filter((p: any) => p.user_id !== me?.userId);
    },
  });
}
