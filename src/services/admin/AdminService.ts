import { backend } from "@/backend";
import type { Database } from "@/backend/database";
import { startOfDay, subDays, format } from "date-fns";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type UserRole = Database["public"]["Tables"]["user_roles"]["Row"];
export type AppRole = Database["public"]["Enums"]["app_role"];
export type SupportTicket = Database["public"]["Tables"]["support_tickets"]["Row"];
export type TicketMessage = Database["public"]["Tables"]["ticket_messages"]["Row"];
export type Reward = Database["public"]["Tables"]["rewards"]["Row"];
export type Registration = Database["public"]["Tables"]["registrations"]["Row"];
export type Referral = Database["public"]["Tables"]["referrals"]["Row"];
export type Match = Database["public"]["Tables"]["matches"]["Row"];
export type GameRoom = Database["public"]["Tables"]["game_rooms"]["Row"];

export class AdminService {
  // ---------- Users ----------
  async getUsers(limit = 200): Promise<Profile[]> {
    try {
      const { data, error } = await backend
        .from("profiles")
        .select("*")
        .limit(limit)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    } catch (err) {
      console.error("[AdminService] getUsers:", err);
      return [];
    }
  }

  async logWhatsAppMessage(payload: {
    userId: string;
    phone: string;
    message: string;
  }): Promise<{ error?: Error }> {
    try {
      const { error } = await backend.from("whatsapp_messages").insert({
        user_id: payload.userId,
        phone: payload.phone,
        type: "promotion",
        message: payload.message,
        status: "sent",
      });
      if (error) throw error;
      return {};
    } catch (err: any) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  // ---------- Roles ----------
  async getUserRoles(limit = 200): Promise<UserRole[]> {
    try {
      const { data, error } = await backend
        .from("user_roles")
        .select("*")
        .limit(limit)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    } catch (err) {
      console.error("[AdminService] getUserRoles:", err);
      return [];
    }
  }

  async getProfilesBasic(
    limit = 200,
  ): Promise<Pick<Profile, "user_id" | "username" | "email" | "avatar_url">[]> {
    try {
      const { data, error } = await backend
        .from("profiles")
        .select("user_id, username, email, avatar_url")
        .limit(limit)
        .order("username");
      if (error) throw error;
      return data ?? [];
    } catch (err) {
      console.error("[AdminService] getProfilesBasic:", err);
      return [];
    }
  }

  async addUserRole(userId: string, role: AppRole): Promise<{ error?: Error }> {
    try {
      const { error } = await backend.from("user_roles").insert({ user_id: userId, role });
      if (error) throw error;
      return {};
    } catch (err: any) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  async removeUserRole(roleId: string): Promise<{ error?: Error }> {
    try {
      const { error } = await backend.from("user_roles").delete().eq("id", roleId);
      if (error) throw error;
      return {};
    } catch (err: any) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  // ---------- Support tickets ----------
  async getSupportTickets(statusFilter?: string): Promise<any[]> {
    try {
      let query = backend
        .from("support_tickets")
        .select("*")
        .limit(200)
        .order("created_at", { ascending: false });

      if (
        statusFilter &&
        statusFilter !== "all" &&
        ["open", "in_progress", "resolved", "closed"].includes(statusFilter)
      ) {
        query = query.eq("status", statusFilter as any);
      }

      const { data } = await query;
      if (!data || data.length === 0) return [];

      const userIds = [...new Set(data.map((t) => t.user_id))];
      const { data: profiles } = await backend
        .from("profiles")
        .select("user_id, username, email, phone")
        .in("user_id", userIds);

      const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) ?? []);

      return data.map((t) => ({ ...t, profiles: profileMap.get(t.user_id) }));
    } catch (err) {
      console.error("[AdminService] getSupportTickets:", err);
      return [];
    }
  }

  async getTicketMessages(ticketId: string): Promise<TicketMessage[]> {
    try {
      const { data, error } = await backend
        .from("ticket_messages")
        .select("*")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    } catch (err) {
      console.error("[AdminService] getTicketMessages:", err);
      return [];
    }
  }

  async updateTicketStatus(
    ticketId: string,
    status: "open" | "in_progress" | "resolved" | "closed",
  ): Promise<{ error?: Error }> {
    try {
      const { error } = await backend.from("support_tickets").update({ status }).eq("id", ticketId);
      if (error) throw error;
      return {};
    } catch (err: any) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  async sendTicketMessage(params: {
    ticketId: string;
    userId: string;
    message: string;
    ticketStatus: string;
    ticketOwnerId: string;
  }): Promise<{ error?: Error }> {
    try {
      const { error } = await backend.from("ticket_messages").insert({
        ticket_id: params.ticketId,
        user_id: params.userId,
        message: params.message,
        is_staff: true,
      });
      if (error) throw error;

      if (params.ticketStatus === "open") {
        await backend
          .from("support_tickets")
          .update({ status: "in_progress" })
          .eq("id", params.ticketId);
      }

      await backend.from("notifications").insert({
        user_id: params.ticketOwnerId,
        type: "system",
        title: "Support Reply",
        message: "You have a new reply on your support ticket",
        action_url: "/support",
      });

      return {};
    } catch (err: any) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  // ---------- Rewards ----------
  async getRewards(statusFilter?: string): Promise<any[]> {
    try {
      let query = backend
        .from("rewards")
        .select("*, tournaments(title)")
        .limit(200)
        .order("created_at", { ascending: false });

      if (statusFilter && statusFilter !== "all") {
        query = query.eq("status", statusFilter as any);
      }

      const { data } = await query;
      if (!data || data.length === 0) return [];

      const userIds = [...new Set(data.map((r) => r.user_id))];
      const { data: profiles } = await backend
        .from("profiles")
        .select("user_id, username, avatar_url, phone")
        .in("user_id", userIds);

      const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) ?? []);

      return data.map((r) => ({ ...r, profiles: profileMap.get(r.user_id) }));
    } catch (err) {
      console.error("[AdminService] getRewards:", err);
      return [];
    }
  }

  async getUsersForRewards(
    limit = 200,
  ): Promise<Pick<Profile, "user_id" | "username" | "email">[]> {
    try {
      const { data, error } = await backend
        .from("profiles")
        .select("user_id, username, email")
        .limit(limit)
        .order("username");
      if (error) throw error;
      return data ?? [];
    } catch (err) {
      return [];
    }
  }

  async approveReward(reward: {
    id: string;
    user_id: string;
    amount: number;
  }): Promise<{ error?: Error }> {
    try {
      const { error: rewardError } = await backend
        .from("rewards")
        .update({ status: "claimed", claimed_at: new Date().toISOString() })
        .eq("id", reward.id);
      if (rewardError) throw rewardError;

      const { data: profile } = await backend
        .from("profiles")
        .select("wallet_balance")
        .eq("user_id", reward.user_id)
        .single();

      const newBalance = (profile?.wallet_balance || 0) + Number(reward.amount);

      const { error: walletError } = await backend
        .from("profiles")
        .update({ wallet_balance: newBalance })
        .eq("user_id", reward.user_id);
      if (walletError) throw walletError;

      await backend.from("notifications").insert({
        user_id: reward.user_id,
        type: "payment",
        title: "Reward Claimed! 🎉",
        message: `KES ${Number(reward.amount).toLocaleString()} has been added to your wallet.`,
        action_url: "/wallet",
      });

      return {};
    } catch (err: any) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  async createReward(params: {
    userId: string;
    type: string;
    amount: number;
    description?: string;
  }): Promise<{ error?: Error }> {
    try {
      const { error } = await backend.from("rewards").insert({
        user_id: params.userId,
        type: params.type as any,
        amount: params.amount,
        description: params.description || `Manual ${params.type} reward`,
        status: "pending",
      });
      if (error) throw error;

      await backend.from("notifications").insert({
        user_id: params.userId,
        type: "payment",
        title: "New Reward! 🎁",
        message: `You've received a ${params.type} reward of KES ${Number(params.amount).toLocaleString()}`,
        action_url: "/rewards",
      });

      return {};
    } catch (err: any) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  // ---------- Registrations ----------
  async getTournamentsList(): Promise<{ id: string; title: string }[]> {
    try {
      const { data, error } = await backend
        .from("tournaments")
        .select("id, title")
        .limit(200)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    } catch (err) {
      return [];
    }
  }

  async getRegistrations(filters: { tournamentId?: string; status?: string }): Promise<any[]> {
    try {
      let query = backend
        .from("registrations")
        .select("*, tournaments(id, title, game)")
        .limit(200)
        .order("created_at", { ascending: false });

      if (filters.tournamentId && filters.tournamentId !== "all") {
        query = query.eq("tournament_id", filters.tournamentId);
      }
      if (filters.status && filters.status !== "all") {
        query = query.eq("status", filters.status as any);
      }

      const { data } = await query;
      if (!data || data.length === 0) return [];

      const userIds = [...new Set(data.map((r) => r.user_id))];
      const { data: profiles } = await backend
        .from("profiles")
        .select("user_id, username, email, phone, game_handle")
        .in("user_id", userIds);

      const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) ?? []);

      return data.map((r) => ({ ...r, profile: profileMap.get(r.user_id) }));
    } catch (err) {
      console.error("[AdminService] getRegistrations:", err);
      return [];
    }
  }

  async updateRegistrationStatus(id: string, status: string): Promise<{ error?: Error }> {
    try {
      const { error } = await backend
        .from("registrations")
        .update({ status: status as any })
        .eq("id", id);
      if (error) throw error;
      return {};
    } catch (err: any) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  async confirmAllPendingRegistrations(tournamentId: string): Promise<{ error?: Error }> {
    try {
      const { error } = await backend
        .from("registrations")
        .update({ status: "confirmed" })
        .eq("tournament_id", tournamentId)
        .eq("status", "pending");
      if (error) throw error;
      return {};
    } catch (err: any) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  // ---------- Referrals ----------
  async getReferrals(): Promise<any[]> {
    try {
      const { data: refData, error } = await backend
        .from("referrals")
        .select("*")
        .limit(200)
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (!refData || refData.length === 0) return [];

      const userIds = new Set<string>();
      refData.forEach((r) => {
        if (r.referrer_id) userIds.add(r.referrer_id);
        if (r.referred_id) userIds.add(r.referred_id);
      });

      const { data: profiles } = await backend
        .from("profiles")
        .select("user_id, username, avatar_url, email, referral_code")
        .in("user_id", Array.from(userIds));

      const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));

      return refData.map((r) => ({
        ...r,
        referrer: profileMap.get(r.referrer_id) || {
          username: "Unknown User",
          referral_code: "N/A",
        },
        referred: profileMap.get(r.referred_id) || { username: "New User", email: "" },
      }));
    } catch (err) {
      console.error("[AdminService] getReferrals:", err);
      return [];
    }
  }

  async toggleReferralStatus(id: string, newStatus: string): Promise<{ error?: Error }> {
    try {
      const { error } = await backend
        .from("referrals")
        .update({ status: newStatus as any })
        .eq("id", id);
      if (error) throw error;
      return {};
    } catch (err: any) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  async deleteReferral(id: string): Promise<{ error?: Error }> {
    try {
      const { error } = await backend.from("referrals").delete().eq("id", id);
      if (error) throw error;
      return {};
    } catch (err: any) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  async awardReferralBonus(id: string, referrerId: string): Promise<{ error?: Error }> {
    try {
      const { error: refErr } = await backend
        .from("referrals")
        .update({ bonus_claimed: true, status: "completed" })
        .eq("id", id);
      if (refErr) throw refErr;

      try {
        await backend.from("rewards").insert({
          user_id: referrerId,
          type: "referral",
          title: "Referral Bonus",
          coins: 100,
          description: "Bonus awarded for referring a new member to GameFlex",
        } as any);
      } catch {
        // ignore reward log failure if schema differs
      }

      return {};
    } catch (err: any) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  // ---------- Matches ----------
  async getActiveTournamentsList(): Promise<{ id: string; title: string; game: string }[]> {
    try {
      const { data, error } = await backend
        .from("tournaments")
        .select("id, title, game")
        .in("status", ["live", "registration_open", "registration_closed", "upcoming"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    } catch (err) {
      return [];
    }
  }

  async getMatches(tournamentFilter?: string): Promise<any[]> {
    try {
      let query = backend
        .from("matches")
        .select("*, tournaments(id, title, game)")
        .limit(200)
        .order("round", { ascending: true })
        .order("match_number", { ascending: true });

      if (tournamentFilter && tournamentFilter !== "all") {
        query = query.eq("tournament_id", tournamentFilter);
      }

      const { data } = await query;
      if (!data || data.length === 0) return [];

      const playerIds = [
        ...new Set([
          ...data.map((m) => m.player1_id).filter(Boolean),
          ...data.map((m) => m.player2_id).filter(Boolean),
        ]),
      ];

      const { data: profiles } = await backend
        .from("profiles")
        .select("user_id, username, game_handle")
        .in("user_id", playerIds as string[]);

      const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) ?? []);

      return data.map((m) => ({
        ...m,
        player1: profileMap.get(m.player1_id as string),
        player2: profileMap.get(m.player2_id as string),
        winner: m.winner_id ? profileMap.get(m.winner_id) : null,
      }));
    } catch (err) {
      console.error("[AdminService] getMatches:", err);
      return [];
    }
  }

  async getConfirmedPlayers(
    tournamentId: string,
  ): Promise<{ user_id: string; username: string; game_handle: string }[]> {
    try {
      if (!tournamentId) return [];
      const { data } = await backend
        .from("registrations")
        .select("user_id, game_handle")
        .eq("tournament_id", tournamentId)
        .eq("status", "confirmed");

      if (!data || data.length === 0) return [];

      const userIds = data.map((r) => r.user_id);
      const { data: profiles } = await backend
        .from("profiles")
        .select("user_id, username")
        .in("user_id", userIds);

      const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) ?? []);

      return data.map((r) => ({
        user_id: r.user_id,
        username: profileMap.get(r.user_id)?.username ?? "Unknown",
        game_handle: r.game_handle ?? "",
      }));
    } catch (err) {
      return [];
    }
  }

  async createMatch(data: {
    tournament_id: string;
    round: number;
    match_number: number;
    player1_id?: string;
    player2_id?: string;
    scheduled_at?: string;
  }): Promise<{ error?: Error }> {
    try {
      const { error } = await backend.from("matches").insert({
        tournament_id: data.tournament_id,
        round: data.round,
        match_number: data.match_number,
        player1_id: data.player1_id || null,
        player2_id: data.player2_id || null,
        scheduled_at: data.scheduled_at ? new Date(data.scheduled_at).toISOString() : null,
        status: "scheduled",
      });
      if (error) throw error;
      return {};
    } catch (err: any) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  async updateMatch(params: {
    id: string;
    status: string;
    player1_score?: number;
    player2_score?: number;
    winner_id?: string;
  }): Promise<{ error?: Error }> {
    try {
      const update: any = { status: params.status };
      if (params.player1_score !== undefined) update.player1_score = params.player1_score;
      if (params.player2_score !== undefined) update.player2_score = params.player2_score;
      if (params.winner_id) {
        update.winner_id = params.winner_id;
        update.completed_at = new Date().toISOString();
      }

      const { error } = await backend.from("matches").update(update).eq("id", params.id);
      if (error) throw error;
      return {};
    } catch (err: any) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  // ---------- Game rooms ----------
  async getMatchesForRoom(
    tournamentId: string,
  ): Promise<{ id: string; round: number; match_number: number }[]> {
    try {
      if (!tournamentId) return [];
      const { data, error } = await backend
        .from("matches")
        .select("id, round, match_number")
        .eq("tournament_id", tournamentId)
        .in("status", ["scheduled", "live"])
        .order("round", { ascending: true });
      if (error) throw error;
      return data ?? [];
    } catch (err) {
      return [];
    }
  }

  async getGameRooms(): Promise<any[]> {
    try {
      const { data, error } = await backend
        .from("game_rooms")
        .select("*, tournaments(id, title, game), matches(round, match_number)")
        .limit(200)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    } catch (err) {
      console.error("[AdminService] getGameRooms:", err);
      return [];
    }
  }

  async createGameRoom(data: {
    tournament_id: string;
    match_id?: string;
    room_code: string;
    password?: string;
    platform: string;
    expires_at?: string;
  }): Promise<{ error?: Error }> {
    try {
      const expiresAt = data.expires_at
        ? new Date(data.expires_at).toISOString()
        : new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

      const { error } = await backend.from("game_rooms").insert({
        tournament_id: data.tournament_id,
        match_id: data.match_id || null,
        room_code: data.room_code,
        password: data.password || null,
        platform: data.platform as any,
        expires_at: expiresAt,
      });
      if (error) throw error;
      return {};
    } catch (err: any) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  async deleteGameRoom(id: string): Promise<{ error?: Error }> {
    try {
      const { error } = await backend.from("game_rooms").delete().eq("id", id);
      if (error) throw error;
      return {};
    } catch (err: any) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  // ---------- Dashboard ----------
  async getHealth(): Promise<{ db: boolean; auth: boolean; payments: boolean }> {
    let db = false,
      auth = false,
      payments = false;
    try {
      const { error } = await backend.from("profiles").select("user_id").limit(1);
      db = !error;
    } catch {
      db = false;
    }
    try {
      const { error } = await backend.auth.getSession();
      auth = !error;
    } catch {
      auth = false;
    }
    try {
      const { error } = await backend.from("payments").select("id").limit(1);
      payments = !error;
    } catch {
      payments = false;
    }
    return { db, auth, payments };
  }

  async getDashboardStats() {
    const todayStart = startOfDay(new Date()).toISOString();
    const [
      { count: totalUsers },
      { count: activeTournaments },
      { data: pendingPaymentsData },
      { data: revenueData },
      { count: totalMatches },
      { count: pendingRegistrations },
      { count: signupsToday },
      { count: postsToday },
      { count: messagesTotal },
    ] = await Promise.all([
      backend.from("profiles").select("*", { count: "exact", head: true }),
      backend
        .from("tournaments")
        .select("*", { count: "exact", head: true })
        .in("status", ["live", "registration_open", "upcoming"]),
      backend.from("payments").select("*").eq("status", "pending"),
      backend.from("payments").select("amount").eq("status", "verified"),
      backend.from("matches").select("*", { count: "exact", head: true }),
      backend
        .from("registrations")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending"),
      backend
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .gte("created_at", todayStart),
      backend
        .from("user_statuses")
        .select("*", { count: "exact", head: true })
        .gte("created_at", todayStart),
      backend.from("messages").select("*", { count: "exact", head: true }),
    ]);

    const totalRevenue = revenueData?.reduce((sum, p) => sum + Number(p.amount), 0) ?? 0;

    return {
      totalUsers: totalUsers ?? 0,
      activeTournaments: activeTournaments ?? 0,
      pendingPayments: pendingPaymentsData?.length ?? 0,
      totalRevenue,
      totalMatches: totalMatches ?? 0,
      pendingRegistrations: pendingRegistrations ?? 0,
      signupsToday: signupsToday ?? 0,
      postsToday: postsToday ?? 0,
      messagesTotal: messagesTotal ?? 0,
    };
  }

  async getRevenueChart(days = 7) {
    const startDate = subDays(new Date(), days);
    const { data } = await backend
      .from("payments")
      .select("amount, created_at")
      .eq("status", "verified")
      .gte("created_at", startDate.toISOString());

    const dailyRevenue: Record<string, number> = {};
    for (let i = 0; i < days; i++) {
      const date = format(subDays(new Date(), days - 1 - i), "MMM dd");
      dailyRevenue[date] = 0;
    }

    data?.forEach((p) => {
      const date = format(new Date(p.created_at), "MMM dd");
      if (dailyRevenue[date] !== undefined) dailyRevenue[date] += Number(p.amount);
    });

    return Object.entries(dailyRevenue).map(([name, value]) => ({ name, value }));
  }

  async getSignupsChart(days = 7) {
    const startDate = subDays(new Date(), days);
    const { data } = await backend
      .from("profiles")
      .select("created_at")
      .gte("created_at", startDate.toISOString());

    const dailySignups: Record<string, number> = {};
    for (let i = 0; i < days; i++) {
      const date = format(subDays(new Date(), days - 1 - i), "MMM dd");
      dailySignups[date] = 0;
    }

    data?.forEach((p) => {
      const date = format(new Date(p.created_at), "MMM dd");
      if (dailySignups[date] !== undefined) dailySignups[date] += 1;
    });

    return Object.entries(dailySignups).map(([name, value]) => ({ name, value }));
  }

  async getPendingPaymentsPreview(limit = 5) {
    const { data: paymentsData } = await backend
      .from("payments")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (!paymentsData || paymentsData.length === 0) return [];

    const userIds = [...new Set(paymentsData.map((p) => p.user_id))];
    const { data: profiles } = await backend
      .from("profiles")
      .select("user_id, username")
      .in("user_id", userIds);

    const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) ?? []);

    return paymentsData.map((p) => ({ ...p, profile: profileMap.get(p.user_id) }));
  }

  async getLiveTournaments() {
    const { data } = await backend.from("tournaments").select("*").eq("status", "live");
    return data ?? [];
  }

  async getRecentActivity(limit = 5) {
    const { data } = await backend
      .from("activity_feed")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    return data ?? [];
  }

  async getTableCounts(tables: string[]): Promise<Record<string, number>> {
    const results = await Promise.all(
      tables.map(async (t) => {
        const { count } = await backend.from(t as any).select("*", { count: "exact", head: true });
        return [t, count ?? 0] as const;
      }),
    );
    return Object.fromEntries(results);
  }

  async exportTable(table: string): Promise<any[]> {
    const { data, error } = await backend.from(table as any).select("*");
    if (error) throw error;
    return data ?? [];
  }
}

export const adminService = new AdminService();
