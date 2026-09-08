import { userPreferenceEngine } from "./UserPreferenceEngine";

export type RecommendationFeedType = "home" | "stories" | "flexes" | "friends" | "explore";
export type RecommendationEntityType =
  "post" | "story" | "flex" | "profile" | "friend" | "tournament" | "comment" | "squad" | "search";
export type RecommendationAction =
  | "view"
  | "like"
  | "save"
  | "share"
  | "hide"
  | "report"
  | "follow"
  | "unfollow"
  | "unlike"
  | "unsave"
  | "comment"
  | "repost"
  | "unrepost"
  | "skip"
  | "watch"
  | "search"
  | "profile_view"
  | "story_view"
  | "flex_view";

export interface RecommendationEvent {
  userId?: string | null;
  entityType: RecommendationEntityType;
  entityId: string;
  action: RecommendationAction;
  /**
   * Free-form signal payload. Recognised keys: authorId, mediaType, content,
   * duration (seconds of watch time), source (feed/surface the event came from).
   */
  metadata?: Record<string, any>;
}

const FLUSH_INTERVAL_MS = 5_000;
const MAX_BUFFER = 40;
const MAX_TRANSPORT_FAILURES = 2;

/**
 * Records engagement signals.
 *
 * Learning happens client-side immediately (so ranking reacts instantly), while
 * server delivery is batched and best-effort. If no collection endpoint is
 * deployed in this environment, the transport disables itself after a couple of
 * failures instead of firing a request per interaction.
 */
export class RecommendationEventService {
  private readonly baseUrl = "/api/recommendations/events";
  private buffer: RecommendationEvent[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private failures = 0;
  private transportEnabled = true;

  async recordEvent(event: RecommendationEvent) {
    // 1. Immediate client-side personalisation.
    try {
      userPreferenceEngine.recordEvent(event);
    } catch {
      /* never block the UI on preference learning */
    }

    // 2. Batched, best-effort server delivery.
    if (!this.transportEnabled || typeof window === "undefined") return;
    this.buffer.push(event);
    if (this.buffer.length >= MAX_BUFFER) {
      await this.flush();
      return;
    }
    if (!this.timer) {
      this.timer = setTimeout(() => void this.flush(), FLUSH_INTERVAL_MS);
    }
  }

  async flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.transportEnabled || this.buffer.length === 0) return;

    const events = this.buffer;
    this.buffer = [];
    try {
      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events }),
        keepalive: true,
      });
      if (!response.ok) throw new Error(String(response.status));
      this.failures = 0;
    } catch {
      this.failures += 1;
      if (this.failures >= MAX_TRANSPORT_FAILURES) this.transportEnabled = false;
    }
  }
}

export const recommendationEventService = new RecommendationEventService();

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => void recommendationEventService.flush());
}
