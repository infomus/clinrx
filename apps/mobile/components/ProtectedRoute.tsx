import { Redirect } from "expo-router";
import { Text, View } from "react-native";

import { useAuthSession } from "@/hooks/useAuthSession";
import { isSupabaseConfigured } from "@/lib/supabase";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { loading, session } = useAuthSession();

  if (!isSupabaseConfigured) {
    return (
      <View className="flex-1 justify-center bg-mist px-5">
        <View className="rounded-lg border border-coral/20 bg-white p-4">
          <Text className="text-base font-semibold text-ink">
            Supabase is not configured
          </Text>
          <Text className="mt-2 leading-6 text-ink/70">
            Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to
            the Expo environment.
          </Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View className="flex-1 justify-center bg-mist px-5">
        <Text className="text-base text-ink/70">Checking session...</Text>
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/sign-in" />;
  }

  return children;
}
