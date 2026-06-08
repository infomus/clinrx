import { ScrollView, Text, View } from "react-native";

import type { Session } from "@clinrx/api";

import { AppHeader } from "@/components/AppHeader";

export function FeatureShell({
  children,
  description,
  eyebrow,
  session,
  title,
}: {
  children: React.ReactNode;
  description: string;
  eyebrow?: string;
  session: Session | null;
  title: string;
}) {
  return (
    <ScrollView className="flex-1 bg-mist">
      <View className="min-h-screen px-5 pb-10 pt-16">
        <AppHeader eyebrow={eyebrow} session={session} title={title} />
        <Text className="mb-6 text-base leading-6 text-ink/70">
          {description}
        </Text>
        {children}
      </View>
    </ScrollView>
  );
}
