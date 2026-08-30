import { backend } from "@/backend";
import type { Database } from "@/backend/database";
import { getStorageUrl } from "@/lib/storage-url";

export type Payment = Database["public"]["Tables"]["payments"]["Row"];

export class PaymentService {
  async initiatePayment(params: {
    userId: string;
    tournamentId?: string;
    amount: number;
    method: string;
    transactionCode?: string;
  }): Promise<{ payment: Payment | null; error?: Error }> {
    try {
      const { data, error } = await backend
        .from("payments")
        .insert({
          user_id: params.userId,
          tournament_id: params.tournamentId ?? "",
          amount: params.amount,
          method: params.method,
          transaction_code: params.transactionCode,
          status: "pending",
        })
        .select()
        .single();

      if (error) throw error;
      return { payment: data };
    } catch (err: any) {
      return { payment: null, error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  async verifyPayment(paymentId: string, verifiedBy: string): Promise<{ error?: Error }> {
    try {
      const { error } = await backend
        .from("payments")
        .update({ status: "verified" })
        .eq("id", paymentId);

      if (error) throw error;
      return {};
    } catch (err: any) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  async rejectPayment(
    paymentId: string,
    reason: string,
    rejectedBy: string,
  ): Promise<{ error?: Error }> {
    try {
      const { error } = await backend
        .from("payments")
        .update({ status: "rejected" })
        .eq("id", paymentId);

      if (error) throw error;
      return {};
    } catch (err: any) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  async getPaymentHistory(userId: string, limit: number = 20): Promise<Payment[]> {
    try {
      const { data, error } = await backend
        .from("payments")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) return [];
      return data as Payment[];
    } catch (err) {
      return [];
    }
  }

  async getPendingPayments(): Promise<Payment[]> {
    try {
      const { data, error } = await backend
        .from("payments")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: true });

      if (error) return [];
      return data as Payment[];
    } catch (err) {
      return [];
    }
  }

  async uploadScreenshot(file: File, paymentId: string): Promise<{ url: string; error?: Error }> {
    try {
      const {
        data: { user },
      } = await backend.auth.getUser();
      if (!user) throw new Error("You must be signed in to upload a receipt");

      const fileExt = file.name.split(".").pop();
      // storage policies require the first folder to be the user's id
      const filePath = `${user.id}/${paymentId}.${fileExt}`;
      // Use canonical 'support' bucket for payment proof uploads
      const { error: uploadError } = await backend.storage
        .from("support")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const signedUrl = await getStorageUrl("support", filePath);

      // Update payment record with screenshot URL
      await backend
        .from("payments")
        .update({ screenshot_url: signedUrl } as any)
        .eq("id", paymentId);

      return { url: signedUrl };
    } catch (err: any) {
      return { url: "", error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  async getPaymentsWithTournaments(userId: string): Promise<any[]> {
    try {
      const { data } = await backend
        .from("payments")
        .select("*, tournaments(title)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      return data ?? [];
    } catch (err) {
      return [];
    }
  }

  async getRewardsWithTournaments(userId: string): Promise<any[]> {
    try {
      const { data } = await backend
        .from("rewards")
        .select("*, tournaments(title)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      return data ?? [];
    } catch (err) {
      return [];
    }
  }

  async getRewards(userId: string, limit?: number): Promise<any[]> {
    try {
      let query = backend
        .from("rewards")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (limit) query = query.limit(limit);
      const { data } = await query;
      return data ?? [];
    } catch (err) {
      return [];
    }
  }

  async claimReward(rewardId: string): Promise<{ error?: Error }> {
    try {
      const { error } = await backend
        .from("rewards")
        .update({ status: "claimed", claimed_at: new Date().toISOString() } as any)
        .eq("id", rewardId);
      if (error) throw error;
      return {};
    } catch (err: any) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }
}

export const paymentService = new PaymentService();
