import { Link } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";

import { signOut } from "@clinrx/api";

import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuthSession } from "@/hooks/useAuthSession";
import { usePowerSyncStatus } from "@/lib/powersync/PowerSyncProvider";
import { supabase } from "@/lib/supabase";

export default function SettingsScreen() {
  return (
    <ProtectedRoute>
      <SettingsContent />
    </ProtectedRoute>
  );
}

function SettingsContent() {
  const { session } = useAuthSession();
  const powerSync = usePowerSyncStatus();

  return (
    <ScrollView className="flex-1 bg-mist">
      <View className="min-h-screen px-5 pb-10 pt-16">
        <View className="mb-7 flex-row items-start justify-between gap-4">
          <View className="flex-1">
            <Text className="text-sm font-semibold uppercase text-leaf">
              Profile
            </Text>
            <Text className="mt-3 text-4xl font-bold text-ink">Settings</Text>
          </View>
          <Link
            className="rounded-lg border border-ink/15 px-4 py-3 text-base font-semibold text-ink"
            href="/interactions"
          >
            Done
          </Link>
        </View>

        <View className="rounded-lg border border-ink/10 bg-white p-4">
          <Text className="text-base font-semibold text-ink">Account</Text>
          <Text className="mt-2 text-sm text-ink/60">Signed in as</Text>
          <Text className="mt-1 text-base font-semibold text-ink">
            {session?.user.email ?? session?.user.id}
          </Text>

          <Pressable
            accessibilityRole="button"
            className="mt-4 rounded-lg border border-coral/40 px-4 py-3"
            onPress={() => void signOut(supabase)}
          >
            <Text className="text-center font-semibold text-coral">
              Sign out
            </Text>
          </Pressable>
        </View>

        <View className="mt-4 rounded-lg border border-ink/10 bg-white p-4">
          <Text className="text-base font-semibold text-ink">Offline sync</Text>
          <Text className="mt-2 text-sm text-ink/60">PowerSync</Text>
          <Text className="mt-1 text-base font-semibold text-ink">
            {getPowerSyncLabel(powerSync)}
          </Text>
          {powerSync.lastSyncedAt ? (
            <Text className="mt-2 text-sm text-ink/60">
              Last synced {new Date(powerSync.lastSyncedAt).toLocaleString()}
            </Text>
          ) : null}
          {powerSync.errorMessage ? (
            <Text className="mt-2 leading-6 text-coral">
              {powerSync.errorMessage}
            </Text>
          ) : null}
        </View>

        <View className="mt-4 rounded-lg border border-ink/10 bg-white p-4">
          <Text className="text-base font-semibold text-ink">
            Reviewer tools
          </Text>
          <Text className="mt-2 leading-6 text-ink/70">
            Inspect PubMed interaction candidates before they become published
            graph edges.
          </Text>
          <Link
            className="mt-4 rounded-lg bg-leaf px-4 py-3 text-center font-semibold text-white"
            href="/review/interactions"
          >
            Open interaction review
          </Link>
        </View>
      </View>
    </ScrollView>
  );
}

function getPowerSyncLabel(powerSync: {
  hasSynced: boolean;
  state: string;
  supported: boolean;
}): string {
  if (!powerSync.supported) {
    return "Not available in web preview";
  }

  if (powerSync.hasSynced) {
    return "Synced";
  }

  switch (powerSync.state) {
    case "connecting":
      return "Connecting";
    case "connected":
      return "Connected";
    case "error":
      return "Needs attention";
    case "signed_out":
      return "Waiting for sign-in";
    default:
      return "Not available";
  }
}
