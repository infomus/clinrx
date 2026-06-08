import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type ClinRxSupabaseClient = SupabaseClient;

export interface SupabaseClientConfig {
  url: string;
  anonKey: string;
}

export function createClinRxSupabaseClient({
  url,
  anonKey,
}: SupabaseClientConfig): ClinRxSupabaseClient {
  if (!url || !anonKey) {
    throw new Error("Supabase URL and anon key are required.");
  }

  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
}
