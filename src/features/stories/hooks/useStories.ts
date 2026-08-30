import { useQuery } from "@tanstack/react-query";
import { backend } from "@/backend";

/** Active (non-expired) stories for a user, newest first. */
export function useStories(userId: string) {
  return useQuery({
    queryKey: ["stories", userId],
    queryFn: async () => {
      const { data, error } = await backend
        .from("user_statuses")
        .select("*")
        .eq("user_id", userId)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!userId,
    staleTime: 30_000,
  });
}
