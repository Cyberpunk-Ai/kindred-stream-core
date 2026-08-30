import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router-compat";
import { backend } from "@/backend";
import { SocialLayout } from "@/components/social/social-nav";
import {
  Radio,
  Users,
  DollarSign,
  Play,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatExternalUrl } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

/**
 * Extract a YouTube video ID from the most common YouTube URL formats.
 *
 * Supported:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://www.youtube.com/shorts/VIDEO_ID
 * - https://www.youtube.com/live/VIDEO_ID
 */
function extractYouTubeId(
  url: string | null | undefined,
): string | null {
  if (!url) return null;

  const value = url.trim();

  if (!value) return null;

  try {
    const parsed = new URL(value);

    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");

    // youtu.be/VIDEO_ID
    if (hostname === "youtu.be") {
      const id = parsed.pathname.split("/").filter(Boolean)[0];

      return id ? id.split(/[?#&]/)[0] : null;
    }

    // youtube.com / m.youtube.com / youtube-nocookie.com
    if (
      hostname === "youtube.com" ||
      hostname === "m.youtube.com" ||
      hostname === "youtube-nocookie.com"
    ) {
      // /watch?v=VIDEO_ID
      if (parsed.pathname === "/watch") {
        const id = parsed.searchParams.get("v");

        return id ? id.split(/[?#&]/)[0] : null;
      }

      // /embed/VIDEO_ID
      // /shorts/VIDEO_ID
      // /live/VIDEO_ID
      const pathMatch = parsed.pathname.match(
        /^\/(?:embed|shorts|live)\/([^/?#]+)/,
      );

      if (pathMatch?.[1]) {
        return pathMatch[1];
      }
    }
  } catch {
    // Fall through to regex handling for values that aren't valid URLs.
  }

  // Fallback for URLs containing YouTube URLs as text.
  const fallbackPatterns = [
    /youtube\.com\/watch\?v=([^&?#]+)/i,
    /youtube\.com\/embed\/([^/?#]+)/i,
    /youtube\.com\/shorts\/([^/?#]+)/i,
    /youtube\.com\/live\/([^/?#]+)/i,
    /youtu\.be\/([^/?#]+)/i,
  ];

  for (const pattern of fallbackPatterns) {
    const match = value.match(pattern);

    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Returns true when the URL is a YouTube URL.
 */
function isYouTubeUrl(
  url: string | null | undefined,
): boolean {
  if (!url) return false;

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname
      .toLowerCase()
      .replace(/^www\./, "");

    return (
      hostname === "youtube.com" ||
      hostname === "m.youtube.com" ||
      hostname === "youtu.be" ||
      hostname === "youtube-nocookie.com"
    );
  } catch {
    return /(?:youtube\.com|youtu\.be)/i.test(url);
  }
}

export default function Live() {
  const { user } = useAuth();

  const [activeViewers, setActiveViewers] =
    useState<number>(1);

  const { data: live = [] } = useQuery({
    queryKey: ["live-tournaments-social"],
    queryFn: async () => {
      const { data, error } = await backend
        .from("tournaments")
        .select("*")
        .eq("status", "live")
        .limit(20);

      if (error) {
        console.error(
          "Failed to load live tournaments:",
          error,
        );

        return [];
      }

      return data ?? [];
    },
  });

  const { data: upcoming = [] } = useQuery({
    queryKey: ["upcoming-tournaments-social"],
    queryFn: async () => {
      const { data, error } = await backend
        .from("tournaments")
        .select("*")
        .eq("status", "upcoming")
        .order("start_date", {
          ascending: true,
        })
        .limit(8);

      if (error) {
        console.error(
          "Failed to load upcoming tournaments:",
          error,
        );

        return [];
      }

      return data ?? [];
    },
  });

  const featuredLive = live[0];

  /**
   * Track viewers using Supabase Realtime presence.
   */
  useEffect(() => {
    if (!featuredLive?.id) return;

    const viewerKey =
      user?.id ||
      `anon-${Math.random()
        .toString(36)
        .substring(2, 9)}`;

    const channel = backend.channel(
      `stream_watchers_${featuredLive.id}`,
      {
        config: {
          presence: {
            key: viewerKey,
          },
        },
      },
    );

    const updateCount = () => {
      const state = channel.presenceState();

      const count = Object.keys(state).length;

      setActiveViewers(Math.max(count, 1));
    };

    channel
      .on(
        "presence",
        {
          event: "sync",
        },
        updateCount,
      )
      .on(
        "presence",
        {
          event: "join",
        },
        updateCount,
      )
      .on(
        "presence",
        {
          event: "leave",
        },
        updateCount,
      )
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            joined_at: new Date().toISOString(),
          });

          updateCount();
        }
      });

    return () => {
      backend.removeChannel(channel);
    };
  }, [featuredLive?.id, user?.id]);

  /**
   * Render the actual stream.
   *
   * IMPORTANT:
   * group_link is intentionally NOT used here.
   * group_link is for the tournament/community group.
   */
  const renderFeaturedStream = () => {
    const streamUrl =
      featuredLive?.live_stream_link?.trim();

    if (!streamUrl) {
      return (
        <div className="aspect-video bg-gradient-to-br from-secondary via-secondary/50 to-secondary flex items-center justify-center">
          <div className="text-center px-6">
            <div className="h-16 w-16 rounded-full bg-destructive/20 flex items-center justify-center mx-auto mb-3 animate-pulse">
              <Radio className="h-8 w-8 text-destructive" />
            </div>

            <p className="font-semibold text-lg mb-1">
              Stream Starting Soon
            </p>

            <p className="text-sm text-muted-foreground">
              Waiting for broadcast...
            </p>
          </div>
        </div>
      );
    }

    const youtubeId = extractYouTubeId(streamUrl);

    /**
     * YouTube stream
     */
    if (youtubeId && isYouTubeUrl(streamUrl)) {
      const embedUrl =
        `https://www.youtube-nocookie.com/embed/${youtubeId}` +
        `?autoplay=1` +
        `&mute=1` +
        `&rel=0` +
        `&modestbranding=1` +
        `&playsinline=1`;

      return (
        <div className="aspect-video bg-black">
          <iframe
            key={youtubeId}
            src={embedUrl}
            title={`${featuredLive.title} - Live Stream`}
            className="w-full h-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      );
    }

    /**
     * Direct video stream.
     */
    return (
      <div className="aspect-video bg-black">
        <video
          src={formatExternalUrl(streamUrl)}
          controls
          playsInline
          preload="metadata"
          className="w-full h-full"
        >
          Your browser does not support video playback.
        </video>
      </div>
    );
  };

  return (
    <SocialLayout
      title="Live"
      subtitle="Tournaments streaming right now"
    >
      {live.length === 0 ? (
        <div className="space-y-8">
          <div className="flex flex-col items-center justify-center py-20 text-center rounded-2xl border border-border/50 bg-card/30">
            <div className="relative mb-6">
              <div className="h-20 w-20 rounded-full bg-secondary flex items-center justify-center">
                <Radio className="h-10 w-10 text-muted-foreground/50" />
              </div>
            </div>

            <p className="font-semibold text-xl mb-2">
              No live streams right now
            </p>

            <p className="text-muted-foreground text-sm max-w-md">
              Check back later for live broadcasts and
              gaming action.
            </p>
          </div>

          {upcoming.length > 0 && (
            <div>
              <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-4 px-1">
                Starting Soon
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {upcoming.map((t: any) => (
                  <Link
                    key={t.id}
                    to={`/tournaments/${t.id}`}
                    className="group rounded-xl bg-card border border-border/50 hover:border-primary/50 p-4 transition-all hover:shadow-lg"
                  >
                    <div className="aspect-video rounded-lg overflow-hidden mb-3 bg-secondary/50 flex items-center justify-center">
                      <Radio className="h-8 w-8 text-muted-foreground/30" />
                    </div>

                    <div className="flex items-center justify-between mb-2">
                      <span className="flex items-center gap-1.5 text-[10px] font-bold text-primary uppercase bg-primary/10 px-2 py-0.5 rounded-full">
                        Upcoming
                      </span>

                      <span className="text-xs text-muted-foreground uppercase">
                        {t.game}
                      </span>
                    </div>

                    <h4 className="font-display font-bold mb-1 line-clamp-1 group-hover:text-primary transition-colors">
                      {t.title}
                    </h4>

                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {t.current_participants ?? 0}/
                        {t.max_participants ?? 0}
                      </span>

                      <span>
                        KES{" "}
                        {Number(
                          t.prize_pool ?? 0,
                        ).toLocaleString()}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6 animate-fade-in">
          {/* FEATURED LIVE STREAM */}

          {featuredLive && (
            <div className="rounded-2xl overflow-hidden border border-border/60 bg-card shadow-sm">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-card border-b border-border/50">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-destructive uppercase tracking-wide">
                  <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
                  LIVE NOW
                </span>

                <span className="text-xs text-muted-foreground">
                  •
                </span>

                <span className="text-xs text-muted-foreground font-medium">
                  {activeViewers}{" "}
                  {activeViewers === 1
                    ? "watching"
                    : "watching"}
                </span>
              </div>

              {renderFeaturedStream()}

              <div className="p-5">
                <Link
                  to={`/tournaments/${featuredLive.id}`}
                >
                  <h3 className="font-display font-bold text-xl mb-2 hover:text-primary transition-colors">
                    {featuredLive.title}
                  </h3>
                </Link>

                <div className="flex flex-wrap items-center justify-between gap-4 mt-3 pt-3 border-t border-border/40">
                  <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Users className="h-4 w-4" />

                      {featuredLive.current_participants ??
                        0}
                      /
                      {featuredLive.max_participants ??
                        0}{" "}
                      players
                    </span>

                    <span className="flex items-center gap-1.5">
                      <DollarSign className="h-4 w-4" />

                      KES{" "}
                      {Number(
                        featuredLive.prize_pool ?? 0,
                      ).toLocaleString()}{" "}
                      prize
                    </span>

                    <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium uppercase">
                      {featuredLive.game}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {featuredLive.live_stream_link && (
                      <a
                        href={formatExternalUrl(
                          featuredLive.live_stream_link,
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-xs text-primary border-primary/40"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Open Stream
                        </Button>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* OTHER LIVE TOURNAMENTS */}

          {live.length > 1 && (
            <div>
              <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-4 px-1">
                More Live
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {live.slice(1).map((t: any) => {
                  const streamUrl =
                    t.live_stream_link?.trim();

                  const youtubeId =
                    extractYouTubeId(streamUrl);

                  return (
                    <Link
                      key={t.id}
                      to={`/tournaments/${t.id}`}
                      className="group rounded-xl bg-card border border-border/50 hover:border-border p-4 transition-all hover:shadow-md hover:-translate-y-0.5"
                    >
                      {youtubeId &&
                      isYouTubeUrl(streamUrl) ? (
                        <div className="aspect-video rounded-lg overflow-hidden mb-3 bg-black relative">
                          <img
                            src={`https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`}
                            alt={t.title}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />

                          <div className="absolute inset-0 bg-black/25 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                            <div className="h-11 w-11 rounded-full bg-white/95 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                              <Play className="h-5 w-5 text-black ml-0.5 fill-black" />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="aspect-video rounded-lg overflow-hidden mb-3 bg-secondary/50 flex items-center justify-center">
                          <Radio className="h-8 w-8 text-muted-foreground/50" />
                        </div>
                      )}

                      <div className="flex items-center justify-between mb-2">
                        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-destructive uppercase tracking-wide">
                          <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
                          LIVE
                        </span>

                        <span className="text-xs text-muted-foreground uppercase">
                          {t.game}
                        </span>
                      </div>

                      <h4 className="font-display font-bold mb-1 line-clamp-1 group-hover:text-primary transition-colors">
                        {t.title}
                      </h4>

                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {t.current_participants ??
                            0}{" "}
                          players
                        </span>

                        <span>
                          KES{" "}
                          {Number(
                            t.prize_pool ?? 0,
                          ).toLocaleString()}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </SocialLayout>
  );
}