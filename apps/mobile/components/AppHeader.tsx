import { Link } from "expo-router";
import { Text, View } from "react-native";

import type { Session } from "@clinrx/api";

export function AppHeader({
  eyebrow,
  session,
  title,
}: {
  eyebrow?: string;
  session: Session | null;
  title: string;
}) {
  const label = getAvatarLabel(session);

  return (
    <View className="mb-7 flex-row items-start justify-between gap-4">
      <View className="flex-1">
        <Text className="text-sm font-semibold uppercase text-leaf">
          {eyebrow ?? "ClinRx study app"}
        </Text>
        <Text className="mt-3 text-4xl font-bold text-ink">{title}</Text>
      </View>
      <Link
        accessibilityLabel="Open profile settings"
        className="h-11 w-11 items-center justify-center rounded-full bg-ink text-center text-base font-bold leading-[44px] text-white"
        href="/settings"
      >
        {label}
      </Link>
    </View>
  );
}

function getAvatarLabel(session: Session | null): string {
  const email = session?.user.email;

  if (!email) {
    return "C";
  }

  return email.slice(0, 1).toUpperCase();
}
