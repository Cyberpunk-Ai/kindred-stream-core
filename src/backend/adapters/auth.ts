import { backendConfig } from "../config.ts";

/**
 * Auth adapter. The default provider is the managed backend auth service.
 * `AUTH_PROVIDER=custom` routes the auth surface used by the app to a
 * self-hosted gateway (`VITE_AUTH_API_URL`) that implements:
 *
 *   POST {api}/sign-in   { email, password } -> { session, user }
 *   POST {api}/sign-up   { email, password, data } -> { session, user }
 *   POST {api}/sign-out
 *   GET  {api}/session   -> { session, user }
 *   POST {api}/recover   { email }
 *   POST {api}/resend    { email, type }
 *   POST {api}/user      { ...attributes } -> { user }
 */
const SESSION_KEY = "gf_custom_auth_session";

type Listener = (event: string, session: unknown) => void;

function url(path: string): string {
  return `${(backendConfig.authUrl ?? "").replace(/\/+$/, "")}/${path}`;
}

function readSession(): unknown {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSession(session: unknown): void {
  if (typeof window === "undefined") return;
  if (session) window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else window.localStorage.removeItem(SESSION_KEY);
}

function createCustomAuth() {
  const listeners = new Set<Listener>();
  const emit = (event: string, session: unknown) => listeners.forEach((l) => l(event, session));

  async function post(path: string, body?: unknown) {
    const res = await fetch(url(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok)
      return {
        data: { session: null, user: null },
        error: new Error(json.message ?? res.statusText),
      };
    return { data: json, error: null };
  }

  return {
    async getSession() {
      return { data: { session: readSession() }, error: null };
    },
    async getUser() {
      const res = await fetch(url("session"), { credentials: "include" });
      const json = await res.json().catch(() => ({}));
      return {
        data: { user: json.user ?? null },
        error: res.ok ? null : new Error(res.statusText),
      };
    },
    async signInWithPassword(credentials: { email: string; password: string }) {
      const result = await post("sign-in", credentials);
      if (!result.error) {
        writeSession(result.data.session);
        emit("SIGNED_IN", result.data.session);
      }
      return result;
    },
    async signUp(credentials: { email: string; password: string; options?: unknown }) {
      return post("sign-up", credentials);
    },
    async signOut() {
      const result = await post("sign-out");
      writeSession(null);
      emit("SIGNED_OUT", null);
      return { error: result.error };
    },
    async resetPasswordForEmail(email: string) {
      return post("recover", { email });
    },
    async resend(payload: unknown) {
      return post("resend", payload);
    },
    async updateUser(attributes: unknown) {
      return post("user", attributes);
    },
    async setSession(session: unknown) {
      writeSession(session);
      emit("SIGNED_IN", session);
      return { data: { session }, error: null };
    },
    onAuthStateChange(callback: Listener) {
      listeners.add(callback);
      return {
        data: {
          subscription: {
            unsubscribe: () => listeners.delete(callback),
          },
        },
      };
    },
  };
}

let customAuth: ReturnType<typeof createCustomAuth> | undefined;

/** Returns an override auth API, or `undefined` to use the default backend. */
export function getAuthOverride(): unknown | undefined {
  if (backendConfig.auth !== "custom") return undefined;
  if (!backendConfig.authUrl) {
    console.warn(
      "[backend] AUTH_PROVIDER=custom requires VITE_AUTH_API_URL. Falling back to the default auth provider.",
    );
    return undefined;
  }
  if (!customAuth) customAuth = createCustomAuth();
  return customAuth;
}
