/* eslint-disable react-refresh/only-export-components */
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  ReactNode,
} from "react";
import type { User, Session } from "@supabase/supabase-js";
import { backend } from "@/backend";
import { signInWithOAuthProvider } from "@/lib/oauth";
import { Tables } from "@/backend/database";
import { track } from "@/lib/analytics";
import { siteConfig } from "@/config/site";

type Profile = Tables<"profiles">;

type AuthResult = { error: Error | null; needsEmailConfirmation?: boolean };

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isEmailVerified: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<AuthResult>;
  register: (
    email: string,
    password: string,
    username: string,
    referralCode?: string,
    extra?: { phone?: string; gameHandle?: string },
  ) => Promise<AuthResult>;
  signInWithGoogle: (
    redirectPath?: string,
  ) => Promise<{ error: Error | null; redirected?: boolean }>;
  resendVerification: (email: string) => Promise<{ error: Error | null }>;
  requestPasswordReset: (email: string) => Promise<{ error: Error | null }>;
  logout: () => Promise<void>;
  updateProfile: (data: Partial<Profile>) => Promise<{ error: Error | null }>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const generateReferralCode = useCallback((username?: string) => {
    const base = String(username ?? "")
      .replace(/[^A-Z0-9]/gi, "")
      .slice(0, 6)
      .toUpperCase();
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `${base || "GF"}${suffix}`.slice(0, 10);
  }, []);

  const getPendingReferralCode = useCallback(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("gameflex_referral_code");
  }, []);

  const clearPendingReferralCode = useCallback(() => {
    if (typeof window === "undefined") return;
    localStorage.removeItem("gameflex_referral_code");
  }, []);

  const applyPendingReferral = useCallback(
    async (userId: string) => {
      const referralCode = getPendingReferralCode();
      if (!referralCode) return;

      const cleanCode = referralCode.trim();

      const { data: referrer, error: referrerError } = await backend
        .from("profiles")
        .select("user_id")
        .ilike("referral_code", cleanCode)
        .maybeSingle();

      if (referrerError || !referrer?.user_id || referrer.user_id === userId) {
        clearPendingReferralCode();
        return;
      }

      const { data: existing, error: existingError } = await backend
        .from("referrals")
        .select("id")
        .eq("referred_id", userId)
        .maybeSingle();

      if (existingError || existing) {
        clearPendingReferralCode();
        return;
      }

      const { error: insertError } = await backend.from("referrals").insert({
        referrer_id: referrer.user_id,
        referred_id: userId,
        status: "completed",
        bonus_claimed: false,
      });

      if (!insertError) {
        await backend
          .from("profiles")
          .update({ referral_source: `ref_${cleanCode.toUpperCase()}` })
          .eq("user_id", userId);
      }

      clearPendingReferralCode();
    },
    [clearPendingReferralCode, getPendingReferralCode],
  );

  const fetchProfile = useCallback(
    async (userId: string, metadata?: { username?: string; email?: string }) => {
      const { data } = await backend
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (data) {
        if (!data.referral_code) {
          const referral_code = generateReferralCode(data.username);
          await backend.from("profiles").update({ referral_code }).eq("user_id", userId);
          setProfile({ ...data, referral_code });
          return { ...data, referral_code };
        }
        setProfile(data);
        return data;
      }

      const username = metadata?.username || `Player${Math.floor(1000 + Math.random() * 9000)}`;
      const profileData = {
        user_id: userId,
        username,
        email: metadata?.email ?? null,
        referral_code: generateReferralCode(username),
      };

      const { data: inserted } = await backend
        .from("profiles")
        .insert(profileData)
        .select("*")
        .maybeSingle();

      const resolved = inserted ?? ({ ...profileData } as Profile);
      setProfile(resolved);
      return resolved;
    },
    [generateReferralCode],
  );

  const checkAdminRole = useCallback(async (userId: string, _userEmail?: string | null) => {
    // Authorization is determined by the database role model, not by a browser-visible
    // environment variable. Keep any bootstrap/default admin email server-side only.
    const { data } = await backend
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    setIsAdmin(!!data);
  }, []);

  const hydratedUserIdRef = useRef<string | null>(null);

  const syncSession = useCallback(
    async (nextSession: Session | null) => {
      const nextUser = nextSession?.user ?? null;
      const nextUserId = nextUser?.id ?? null;
      setSession(nextSession);
      setUser(nextUser);

      if (!nextUserId) {
        hydratedUserIdRef.current = null;
        setProfile(null);
        setIsAdmin(false);
        return;
      }

      if (hydratedUserIdRef.current === nextUserId) {
        return;
      }

      hydratedUserIdRef.current = nextUserId;
      await Promise.all([
        fetchProfile(nextUserId, {
          username: nextUser?.user_metadata?.username,
          email: nextUser?.email,
        }),
        checkAdminRole(nextUserId, nextUser?.email),
        applyPendingReferral(nextUserId),
      ]);
    },
    [applyPendingReferral, checkAdminRole, fetchProfile],
  );

  useEffect(() => {
    let isActive = true;

    const {
      data: { subscription },
    } = backend.auth.onAuthStateChange((_event, session) => {
      if (!isActive) return;
      void syncSession(session);
    });

    void backend.auth.getSession().then(({ data: { session } }) => {
      if (!isActive) return;
      void syncSession(session);
      setIsLoading(false);
    });

    return () => {
      isActive = false;
      hydratedUserIdRef.current = null;
      subscription.unsubscribe();
    };
  }, [syncSession]);

  const login = useCallback(async (email: string, password: string) => {
    const { error } = await backend.auth.signInWithPassword({
      email,
      password,
    });
    const loginDomain = (() => {
      try {
        return new URL(siteConfig.url).hostname;
      } catch {
        return "gameflex.co.ke";
      }
    })();
    if (!error)
      void track("login", { method: email.includes(`@${loginDomain}`) ? "phone" : "email" });
    return {
      error: error ? new Error(error.message) : null,
      needsEmailConfirmation: !!error && /confirm/i.test(error.message ?? ""),
    };
  }, []);

  const register = useCallback(
    async (
      email: string,
      password: string,
      username: string,
      referralCode?: string,
      extra?: { phone?: string; gameHandle?: string },
    ) => {
      if (typeof window !== "undefined" && referralCode) {
        localStorage.setItem("gameflex_referral_code", referralCode);
      }

      const redirectUrl = `${window.location.origin}/auth/callback`;

      const { data, error } = await backend.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            username,
            phone: extra?.phone ?? null,
            game_handle: extra?.gameHandle ?? null,
          },
        },
      });
      if (!error) void track("signup", { username });
      return {
        error: error ? new Error(error.message) : null,
        // With email confirmation on, signUp returns no session until the
        // user clicks the link in their inbox.
        needsEmailConfirmation: !error && !data.session,
      };
    },
    [],
  );

  const resendVerification = useCallback(async (email: string) => {
    const { error } = await backend.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    return { error: error ? new Error(error.message) : null };
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    const { error } = await backend.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    return { error: error ? new Error(error.message) : null };
  }, []);

  const signInWithGoogle = useCallback(async (redirectPath?: string) => {
    if (typeof window !== "undefined" && redirectPath && redirectPath.startsWith("/")) {
      sessionStorage.setItem("gameflex_post_auth_redirect", redirectPath);
    }
    const result = await signInWithOAuthProvider("google", {
      redirectTo: `${window.location.origin}/auth/callback`,
    });
    if (result.error) return { error: result.error };
    if (!result.redirected) void track("login", { method: "google" });
    return { error: null, redirected: !!result.redirected };
  }, []);

  const logout = useCallback(async () => {
    await backend.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setIsAdmin(false);
  }, []);

  const updateProfile = useCallback(
    async (data: Partial<Profile>) => {
      if (!user) return { error: new Error("Not authenticated") };

      let { error } = await backend.from("profiles").update(data).eq("user_id", user.id);

      if (
        error &&
        (error.message?.includes("column") ||
          error.message?.includes("schema cache") ||
          error.code === "PGRST204")
      ) {
        console.warn("Profile update schema fallback active:", error.message);
        const safeKeys = [
          "username",
          "game_handle",
          "bio",
          "avatar_url",
          "phone",
          "referral_code",
          "updated_at",
        ] as const;
        const safeData: Partial<Profile> = {};
        for (const k of safeKeys) {
          if (k in data) {
            (safeData as Record<string, unknown>)[k] = data[k];
          }
        }
        const retry = await backend.from("profiles").update(safeData).eq("user_id", user.id);
        error = retry.error;
      }

      if (!error) {
        await fetchProfile(user.id);
      }

      return { error: error ? new Error(error.message) : null };
    },
    [user, fetchProfile],
  );

  const refreshProfile = useCallback(async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  }, [user, fetchProfile]);

  const value = useMemo(
    () => ({
      user,
      session,
      profile,
      isLoading,
      isAuthenticated: !!user,
      isEmailVerified: !!user?.email_confirmed_at,
      isAdmin,
      login,
      register,
      signInWithGoogle,
      resendVerification,
      requestPasswordReset,
      logout,
      updateProfile,
      refreshProfile,
    }),
    [
      user,
      session,
      profile,
      isLoading,
      isAdmin,
      login,
      register,
      signInWithGoogle,
      resendVerification,
      requestPasswordReset,
      logout,
      updateProfile,
      refreshProfile,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
