import { backendConfig } from "../config.ts";
import type { RealtimeChannelLike } from "../types.ts";

/**
 * Realtime adapter. `REALTIME_PROVIDER=none` disables live subscriptions
 * (useful when moving to a backend without a realtime service) by returning
 * inert channels, so subscribing components keep working with polling/refetch.
 */
function createNoopChannel(topic: string): RealtimeChannelLike {
  const channel: RealtimeChannelLike = {
    topic,
    on: () => channel,
    subscribe: (callback) => {
      callback?.("CLOSED");
      return channel;
    },
    unsubscribe: async () => "ok",
    send: async () => "ok",
    track: async () => "ok",
    untrack: async () => "ok",
    presenceState: () => ({}),
  };
  return channel;
}

export function getRealtimeOverride():
  | {
      channel: (topic: string) => RealtimeChannelLike;
      removeChannel: () => Promise<string>;
      removeAllChannels: () => Promise<string[]>;
      getChannels: () => RealtimeChannelLike[];
    }
  | undefined {
  if (backendConfig.realtime !== "none") return undefined;
  return {
    channel: (topic: string) => createNoopChannel(topic),
    removeChannel: async () => "ok",
    removeAllChannels: async () => [],
    getChannels: () => [],
  };
}
