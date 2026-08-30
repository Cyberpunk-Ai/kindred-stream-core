import { backend } from "@/backend";
import type { Database } from "@/backend/database";

export type LeaderboardStats = Database["public"]["Tables"]["leaderboard_stats"]["Row"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export interface LeaderboardEntry {
  user_id: string;
  username: string;
  avatar_url?: string;
  points: number;
  wins: number;
  losses: number;
  rank: number;
}

export class LeaderboardService {
  async getGlobal(limit: number = 100, offset: number = 0): Promise<LeaderboardEntry[]> {
    try {
      const { data, error } = await backend
        .from("leaderboard_stats")
        .select("*, profiles!inner(username, avatar_url)")
        .order("points", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      return (data || []).map((row: any, i) => ({
        user_id: row.user_id,
        username: row.profiles?.username || "Unknown",
        avatar_url: row.profiles?.avatar_url,
        points: row.points ?? 0,
        wins: row.wins ?? 0,
        losses: row.losses ?? 0,
        rank: offset + i + 1,
      }));
    } catch (err) {
      console.error(err);
      return [];
    }
  }

  /** Note: leaderboard_stats has no per-game column; this returns the global leaderboard. */
  async getByGame(game: string, limit: number = 100): Promise<LeaderboardEntry[]> {
    try {
      const { data, error } = await backend
        .from("leaderboard_stats")
        .select("*, profiles!inner(username, avatar_url)")
        .order("points", { ascending: false })
        .limit(limit);

      if (error) throw error;

      return (data || []).map((row: any, i) => ({
        user_id: row.user_id,
        username: row.profiles?.username || "Unknown",
        avatar_url: row.profiles?.avatar_url,
        points: row.points ?? 0,
        wins: row.wins ?? 0,
        losses: row.losses ?? 0,
        rank: i + 1,
      }));
    } catch (err) {
      console.error(err);
      return [];
    }
  }

  async getUserRank(userId: string): Promise<{ rank: number; stats: LeaderboardStats | null }> {
    try {
      // Basic implementation
      const { data: stats, error } = await backend
        .from("leaderboard_stats")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (error || !stats) return { rank: 0, stats: null };

      // To get real rank, we need to count how many players have a higher rating
      const { count } = await backend
        .from("leaderboard_stats")
        .select("*", { count: "exact", head: true })
        .gt("points", stats.points ?? 0);

      return {
        rank: (count || 0) + 1,
        stats: stats as LeaderboardStats,
      };
    } catch (err) {
      return { rank: 0, stats: null };
    }
  }

  async updateStats(userId: string, stats: Partial<LeaderboardStats>): Promise<{ error?: Error }> {
    try {
      const { error } = await backend
        .from("leaderboard_stats")
        .update(stats as any)
        .eq("user_id", userId);

      if (error) throw error;
      return {};
    } catch (err: any) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  async getTopPlayers(limit: number = 10): Promise<Profile[]> {
    try {
      const { data, error } = await backend
        .from("leaderboard_stats")
        .select("profiles!inner(*)")
        .order("rating", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data || []).map((d: any) => d.profiles) as Profile[];
    } catch (err) {
      return [];
    }
  }

  async getTournamentLeaderboard(tournamentId: string): Promise<LeaderboardEntry[]> {
    // Simplified stub since tournament leaderboards might depend on matches
    return [];
  }

  /**
   * Global leaderboard joined with profile info, ranked by points (matches the
   * actual `leaderboard_stats` schema used by Leaderboard/Home pages).
   */
  async getGlobalWithProfiles(limit: number = 50): Promise<any[]> {
    try {
      const { data: statsData, error } = await backend
        .from("leaderboard_stats")
        .select("*")
        .order("points", { ascending: false })
        .limit(limit);
      if (error) throw error;
      if (!statsData || statsData.length === 0) return [];

      const userIds = [...new Set(statsData.map((s: any) => s.user_id))];
      const { data: profiles } = await backend
        .from("profiles")
        .select("user_id, username, avatar_url, game_handle, phone, bio")
        .in("user_id", userIds);

      const profileMap = new Map((profiles ?? []).map((p: any) => [p.user_id, p]));

      return statsData.map((s: any, i: number) => ({
        ...s,
        rank: i + 1,
        profiles: profileMap.get(s.user_id),
      }));
    } catch (err) {
      console.error(err);
      return [];
    }
  }

  async getUserStats(userId: string): Promise<LeaderboardStats | null> {
    try {
      const { data } = await backend
        .from("leaderboard_stats")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      return data ?? null;
    } catch (err) {
      return null;
    }
  }
}

export const leaderboardService = new LeaderboardService();
