import "react-native-url-polyfill/auto";
import "expo-sqlite/localStorage/install";

import { createClinRxSupabaseClient } from "@clinrx/api";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = createClinRxSupabaseClient({
  url: supabaseUrl ?? "https://missing-project.supabase.co",
  anonKey: supabaseAnonKey ?? "missing-publishable-key",
});
