import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { backendConfig, isDefaultBackend } from "./config.ts";
import { getAuthOverride } from "./adapters/auth.ts";
import { getDataClient } from "./adapters/data.ts";
import { getRealtimeOverride } from "./adapters/realtime.ts";
import { getStorageOverride } from "./adapters/storage.ts";

export { backendConfig, isDefaultBackend } from "./config.ts";
export type { BackendConfig } from "./config.ts";

/**
 * The single backend entry point for all client code.
 *
 * UI, hooks and services must import `backend` from here instead of a vendor
 * SDK. Each capability resolves through its own adapter, so data, auth, storage
 * and realtime can be pointed at different providers via environment variables
 * without touching a single call site.
 */
function createBackend(): SupabaseClient<Database> {
  const data = getDataClient();
  const overrides: Record<string, unknown> = {};

  const storage = getStorageOverride();
  if (storage) overrides["storage"] = storage;

  const auth = getAuthOverride();
  if (auth) overrides["auth"] = auth;

  const realtime = getRealtimeOverride();
  if (realtime) Object.assign(overrides, realtime);

  if (Object.keys(overrides).length === 0) return data;

  return new Proxy(data, {
    get(target, prop, receiver) {
      if (prop in overrides) return overrides[prop as string];
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

let instance: SupabaseClient<Database> | undefined;

export const backend = new Proxy({} as SupabaseClient<Database>, {
  get(_, prop, receiver) {
    if (!instance) instance = createBackend();
    const value = Reflect.get(instance, prop, receiver);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

/** Human-readable summary of the active providers (useful for diagnostics). */
export function describeBackend(): string {
  return `data=${backendConfig.data} auth=${backendConfig.auth} storage=${backendConfig.storage} realtime=${backendConfig.realtime}`;
}
