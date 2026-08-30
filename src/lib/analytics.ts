// Lightweight event tracker. Append-only; browser-only.
import { backend } from "@/backend";

export type AnalyticsEvent =
  | "login"
  | "signup"
  | "session_start"
  | "tournament_viewed"
  | "tournament_joined"
  | "match_completed"
  | "purchase_made"
  | "friend_added"
  | "referral"
  | "search"
  | "post_created"
  | "post_liked";

const SESSION_KEY = "gf_session_id";

function getSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  let id = window.sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

function getDevice(): string {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (/Mobi|Android|iPhone/i.test(ua)) return "mobile";
  if (/Tablet|iPad/i.test(ua)) return "tablet";
  return "desktop";
}

// Analytics writes to the `analytics_events` table. Disable per-environment
// with VITE_ANALYTICS_ENABLED=false.
const ANALYTICS_ENABLED = import.meta.env["VITE_ANALYTICS_ENABLED"] !== "false";

export async function track(
  event: AnalyticsEvent,
  properties: Record<string, unknown> = {},
): Promise<void> {
  if (!ANALYTICS_ENABLED || typeof window === "undefined") return;
  try {
    const { data: userData } = await backend.auth.getUser();
    await backend.from("analytics_events").insert({
      user_id: userData?.user?.id ?? null,
      event_name: event,
      properties: {
        ...properties,
        session_id: getSessionId(),
        device: getDevice(),
        path: window.location.pathname,
      } as never,
    });
  } catch (err) {
    if (import.meta.env.DEV) console.warn("[analytics] track failed", err);
  }
}

let sessionStarted = false;
export function startSession() {
  if (sessionStarted) return;
  sessionStarted = true;
  void track("session_start", { referrer: document.referrer || null });
}
