import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { backendConfig } from "../config.ts";

/**
 * Data adapter. The default provider is the managed backend client; the `rest`
 * provider targets any PostgREST-compatible API (self-hosted Postgres gateway,
 * VPS deployment, Contabo, etc.) using the same query builder, so call sites do
 * not change.
 */
function createRestDataClient(): SupabaseClient<Database> {
  const url = backendConfig.restUrl;
  if (!url) {
    throw new Error(
      "BACKEND_PROVIDER=rest requires VITE_BACKEND_REST_URL (base URL of the data API).",
    );
  }
  return createClient<Database>(url, backendConfig.restKey ?? "public-anon-key", {
    auth: {
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

let restClient: SupabaseClient<Database> | undefined;

export function getDataClient(): SupabaseClient<Database> {
  if (backendConfig.data === "rest") {
    if (!restClient) restClient = createRestDataClient();
    return restClient;
  }
  return supabase as unknown as SupabaseClient<Database>;
}
