import { ScrollView, Text, View } from "react-native";

import { AuthPanel } from "@/components/AuthPanel";

export default function SignInScreen() {
  return (
    <ScrollView className="flex-1 bg-mist">
      <View className="min-h-screen px-5 pb-10 pt-16">
        <View className="mb-7">
          <Text className="text-sm font-semibold uppercase text-leaf">
            ClinRx study app
          </Text>
          <Text className="mt-3 text-4xl font-bold text-ink">
            Study Canadian pharmacy with better signals.
          </Text>
          <Text className="mt-3 text-base leading-6 text-ink/70">
            Sign in to use CPS search, interaction checking, quizzes, audio
            lessons, and OSCE prep.
          </Text>
        </View>
        <AuthPanel />
      </View>
    </ScrollView>
  );
}
