/**
 * Database schema types, re-exported through the backend layer.
 *
 * Frontend code must import schema types from here (`@/backend/database`) so no
 * page, component, hook or service references a vendor-specific module path.
 */
export type {
  Database,
  Tables,
  TablesInsert,
  TablesUpdate,
  Enums,
  CompositeTypes,
  Json,
} from "@/integrations/supabase/types";
