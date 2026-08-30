import { backend } from "@/backend";
import type { Database } from "@/backend/database";

export type Tournament = Database["public"]["Tables"]["tournaments"]["Row"];
export type Registration = Database["public"]["Tables"]["registrations"]["Row"];
export type Match = Database["public"]["Tables"]["matches"]["Row"];
export type GameRoom = Database["public"]["Tables"]["game_rooms"]["Row"];

export type TournamentInput = Omit<
  Database["public"]["Tables"]["tournaments"]["Insert"],
  "id" | "created_at" | "updated_at"
>;

export interface LeaderboardEntry {
  user_id: string;
  username?: string;
  points: number;
  rank: number;
}

export class TournamentService {
  async getAll(filters?: {
    status?: string;
    game?: string;
    search?: string;
    /** Max rows to fetch. Defaults to 50 so list pages never pull the whole table. */
    limit?: number;
    /** Zero-based page index, used with `limit`. */
    page?: number;
  }): Promise<Tournament[]> {
    try {
      let query = backend.from("tournaments").select("*").order("created_at", { ascending: false });

      if (filters?.status)
        query = query.eq(
          "status",
          filters.status as Database["public"]["Enums"]["tournament_status"],
        );
      if (filters?.game)
        query = query.eq("game", filters.game as Database["public"]["Enums"]["game_type"]);
      if (filters?.search) query = query.ilike("title", `%${filters.search}%`);

      // Always bound the result set — an unbounded select grows with the table.
      const limit = filters?.limit ?? 50;
      const page = filters?.page ?? 0;
      query = query.range(page * limit, page * limit + limit - 1);

      const { data, error } = await query;
      if (error) throw error;
      return data as Tournament[];
    } catch (err) {
      console.error(err);
      return [];
    }
  }

  async getById(id: string): Promise<Tournament | null> {
    try {
      const { data, error } = await backend.from("tournaments").select("*").eq("id", id).single();
      if (error) throw error;
      return data as Tournament;
    } catch (err) {
      console.error(err);
      return null;
    }
  }

  async create(data: TournamentInput): Promise<{ tournament: Tournament | null; error?: Error }> {
    try {
      const { data: result, error } = await backend
        .from("tournaments")
        .insert(data as any)
        .select()
        .single();
      if (error) throw error;
      return { tournament: result as Tournament };
    } catch (err: any) {
      return { tournament: null, error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  async update(id: string, data: Partial<TournamentInput>): Promise<{ error?: Error }> {
    try {
      const { error } = await backend
        .from("tournaments")
        .update(data as any)
        .eq("id", id);
      if (error) throw error;
      return {};
    } catch (err: any) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  async delete(id: string): Promise<{ error?: Error }> {
    try {
      const { error } = await backend.from("tournaments").delete().eq("id", id);
      if (error) throw error;
      return {};
    } catch (err: any) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  async joinTournament(
    tournamentId: string,
    userId: string,
    gameHandle: string,
    paymentId?: string,
  ): Promise<{ registration: Registration | null; error?: Error }> {
    try {
      const { data, error } = await backend
        .from("registrations")
        .insert({
          tournament_id: tournamentId,
          user_id: userId,
          game_handle: gameHandle,
          payment_id: paymentId,
          status: "pending",
        } as any)
        .select()
        .single();

      if (error) throw error;
      return { registration: data as Registration };
    } catch (err: any) {
      return {
        registration: null,
        error: err instanceof Error ? err : new Error(String(err)),
      };
    }
  }

  async leaveTournament(tournamentId: string, userId: string): Promise<{ error?: Error }> {
    try {
      const { error } = await backend
        .from("registrations")
        .delete()
        .eq("tournament_id", tournamentId)
        .eq("user_id", userId);
      if (error) throw error;
      return {};
    } catch (err: any) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  async getRegistrations(tournamentId: string): Promise<Registration[]> {
    try {
      const { data, error } = await backend
        .from("registrations")
        .select("*, profiles!inner(*)")
        .eq("tournament_id", tournamentId);
      if (error) return [];
      return data as any[];
    } catch (err) {
      return [];
    }
  }

  async getUserRegistrations(userId: string): Promise<Registration[]> {
    try {
      const { data, error } = await backend
        .from("registrations")
        .select("*, tournaments!inner(*)")
        .eq("user_id", userId);
      if (error) return [];
      return data as any[];
    } catch (err) {
      return [];
    }
  }

  async getMatches(tournamentId: string): Promise<Match[]> {
    try {
      const { data, error } = await backend
        .from("matches")
        .select(
          "*, player1:profiles!matches_player1_id_fkey(*), player2:profiles!matches_player2_id_fkey(*)",
        )
        .eq("tournament_id", tournamentId)
        .order("round_number", { ascending: true });
      if (error) return [];
      return data as any[];
    } catch (err) {
      return [];
    }
  }

  async updateScore(
    matchId: string,
    player1Score: number,
    player2Score: number,
  ): Promise<{ error?: Error }> {
    try {
      const { error } = await backend
        .from("matches")
        .update({
          player1_score: player1Score,
          player2_score: player2Score,
          status: "completed",
          winner_id:
            player1Score > player2Score
              ? "player1_id"
              : player2Score > player1Score
                ? "player2_id"
                : null, // Requires custom logic to fetch actual IDs, simplified here
        } as any)
        .eq("id", matchId);
      if (error) throw error;
      return {};
    } catch (err: any) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  async getLeaderboard(tournamentId: string): Promise<LeaderboardEntry[]> {
    // Basic stub - in reality you might aggregate matches or fetch from a materialized view
    try {
      const { data, error } = await backend
        .from("registrations")
        .select("user_id, profiles!inner(username)")
        .eq("tournament_id", tournamentId);
      if (error) return [];
      return data.map((row: any, i) => ({
        user_id: row.user_id,
        username: row.profiles?.username,
        points: 0,
        rank: i + 1,
      }));
    } catch (err) {
      return [];
    }
  }

  async getGameRooms(tournamentId: string): Promise<GameRoom[]> {
    try {
      const { data, error } = await backend
        .from("game_rooms")
        .select("*")
        .eq("tournament_id", tournamentId);
      if (error) return [];
      return data as GameRoom[];
    } catch (err) {
      return [];
    }
  }

  /** Matches for a tournament, enriched with player profile info (for bracket display). */
  async getMatchesWithProfiles(tournamentId: string): Promise<any[]> {
    try {
      const { data } = await backend
        .from("matches")
        .select("*")
        .eq("tournament_id", tournamentId)
        .order("round", { ascending: true })
        .order("match_number", { ascending: true });

      if (!data || data.length === 0) return [];

      const playerIds = [
        ...new Set([
          ...data.map((m: any) => m.player1_id).filter(Boolean),
          ...data.map((m: any) => m.player2_id).filter(Boolean),
          ...data.map((m: any) => m.winner_id).filter(Boolean),
        ]),
      ] as string[];

      if (playerIds.length === 0)
        return data.map((m: any) => ({ ...m, player1: null, player2: null }));

      const { data: profiles } = await backend
        .from("profiles")
        .select("user_id, username, avatar_url, game_handle")
        .in("user_id", playerIds);

      const profileMap = new Map((profiles ?? []).map((p: any) => [p.user_id, p]));

      return data.map((m: any) => ({
        ...m,
        player1: m.player1_id ? profileMap.get(m.player1_id) : null,
        player2: m.player2_id ? profileMap.get(m.player2_id) : null,
        winner: m.winner_id ? profileMap.get(m.winner_id) : null,
      }));
    } catch (err) {
      return [];
    }
  }

  /** Registrations for a tournament, enriched with profile info. */
  async getRegistrationsWithProfiles(tournamentId: string): Promise<any[]> {
    try {
      const { data, error } = await backend
        .from("registrations")
        .select("*")
        .eq("tournament_id", tournamentId);
      if (error) throw error;
      const regsData = data ?? [];
      if (regsData.length === 0) return [];

      const userIds = [...new Set(regsData.map((r: any) => r.user_id))];
      const { data: profiles } = await backend
        .from("profiles")
        .select("user_id, username, avatar_url")
        .in("user_id", userIds);

      const profileMap = new Map((profiles ?? []).map((p: any) => [p.user_id, p]));

      return regsData.map((r: any) => ({
        ...r,
        profiles: profileMap.get(r.user_id),
      }));
    } catch (err) {
      return [];
    }
  }

  async getUserRegistration(tournamentId: string, userId: string): Promise<Registration | null> {
    try {
      const { data, error } = await backend
        .from("registrations")
        .select("*")
        .eq("tournament_id", tournamentId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    } catch (err) {
      return null;
    }
  }

  /** Matches a user has played across all tournaments, with tournament title/game. */
  async getUserMatches(userId: string): Promise<any[]> {
    try {
      const { data } = await backend
        .from("matches")
        .select("*, tournaments(id, title, game)")
        .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
        .order("scheduled_at", { ascending: false });
      return data ?? [];
    } catch (err) {
      return [];
    }
  }

  async getUpcomingUserMatches(userId: string, limit: number = 3): Promise<any[]> {
    try {
      const { data } = await backend
        .from("matches")
        .select("*, tournaments(title, game)")
        .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
        .in("status", ["scheduled", "live"])
        .order("scheduled_at", { ascending: true })
        .limit(limit);
      return data ?? [];
    } catch (err) {
      return [];
    }
  }

  async getRecentCompletedMatches(userId: string, limit: number = 6): Promise<any[]> {
    try {
      const { data } = await backend
        .from("matches")
        .select("*, tournaments(title, game)")
        .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(limit);
      return data ?? [];
    } catch (err) {
      return [];
    }
  }

  async getProfilesByIds(userIds: string[], limit: number = 200): Promise<any[]> {
    try {
      if (userIds.length === 0) {
        const { data } = await backend
          .from("profiles")
          .select("user_id, username, avatar_url, game_handle")
          .limit(limit);
        return data ?? [];
      }
      const { data } = await backend
        .from("profiles")
        .select("user_id, username, avatar_url, game_handle")
        .in("user_id", userIds);
      return data ?? [];
    } catch (err) {
      return [];
    }
  }

  /** All active (non-expired) game rooms, with tournament + match info, for the game-rooms page. */
  async getActiveGameRooms(): Promise<any[]> {
    try {
      const { data, error } = await backend
        .from("game_rooms")
        .select(
          `
          *,
          tournaments(title, game),
          matches(round, match_number, player1_id, player2_id, status)
        `,
        )
        .gte("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    } catch (err) {
      return [];
    }
  }
}

export const tournamentService = new TournamentService();
