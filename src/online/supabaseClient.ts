import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Online play is strictly optional: when the env vars are absent (e.g. a
// fork without a Supabase project) every online surface renders a friendly
// "offline build" state instead of crashing.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;

export const onlineAvailable = supabase !== null;
