import { useQuery } from "@tanstack/react-query";
import { backend } from "@/backend";

/** Squads (teams) the given user belongs to. */
export function useTeams(userId: string) {
  return useQuery({
    queryKey: ["teams", userId],
    queryFn: async () => {
      const { data, error } = await backend
        .from("squad_members")
        .select("role, joined_at, squad:squads(*)")
        .eq("user_id", userId);
      if (error) throw error;
      return (data ?? []).filter((row) => row.squad);
    },
    enabled: !!userId,
    staleTime: 30_000,
  });
}
