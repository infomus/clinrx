import * as Linking from "expo-linking";
import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, Text, View } from "react-native";

import { completeAuthRedirect } from "@clinrx/api";

import { supabase } from "@/lib/supabase";

export default function AuthCallbackScreen() {
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const resolveCurrentUrl = async () => {
      if (Platform.OS === "web" && typeof window !== "undefined") {
        return window.location.href;
      }

      return Linking.getInitialURL();
    };

    resolveCurrentUrl()
      .then((currentUrl) => {
        if (!currentUrl) {
          throw new Error("Could not read the auth callback URL.");
        }

        return completeAuthRedirect(supabase, currentUrl);
      })
      .then(() => setComplete(true))
      .catch((caughtError) => {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Could not finish sign-in.",
        );
      });
  }, []);

  if (complete) {
    return <Redirect href="/" />;
  }

  return (
    <View className="flex-1 items-center justify-center bg-mist px-5">
      <View className="w-full rounded-lg border border-ink/10 bg-white p-4">
        <Text className="text-lg font-semibold text-ink">
          {error ? "Sign-in failed" : "Finishing sign-in"}
        </Text>
        <Text className={`mt-2 leading-6 ${error ? "text-coral" : "text-ink/70"}`}>
          {error ?? "Creating your ClinRx session..."}
        </Text>
      </View>
    </View>
  );
}
