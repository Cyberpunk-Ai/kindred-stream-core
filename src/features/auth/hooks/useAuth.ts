import { useAuth as useGlobalAuth } from "@/lib/auth-context";

export function useAuth() {
  return useGlobalAuth();
}
