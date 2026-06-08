import * as Linking from "expo-linking";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { sendMagicLink } from "@clinrx/api";

import { supabase } from "@/lib/supabase";

export function AuthPanel() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSendMagicLink() {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setError("Enter your email address.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await sendMagicLink(
        supabase,
        normalizedEmail,
        Linking.createURL("/auth/callback"),
      );
      setSentTo(normalizedEmail);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not send magic link.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View className="rounded-lg border border-ink/10 bg-white p-4">
      <Text className="text-base font-semibold text-ink">Sign in</Text>
      <Text className="mt-2 leading-6 text-ink/70">
        Use a passwordless magic link. No passwords are stored or accepted.
      </Text>

      <TextInput
        autoCapitalize="none"
        autoComplete="email"
        className="mt-4 rounded-lg border border-ink/15 bg-white px-4 py-3 text-base text-ink"
        editable={!submitting}
        inputMode="email"
        onChangeText={setEmail}
        onSubmitEditing={handleSendMagicLink}
        placeholder="student@example.com"
        placeholderTextColor="#7b8580"
        returnKeyType="send"
        value={email}
      />

      <Pressable
        accessibilityRole="button"
        className={`mt-3 rounded-lg px-4 py-3 ${
          submitting ? "bg-ink/30" : "bg-leaf"
        }`}
        disabled={submitting}
        onPress={handleSendMagicLink}
      >
        <Text className="text-center text-base font-semibold text-white">
          {submitting ? "Sending..." : "Send magic link"}
        </Text>
      </Pressable>

      {sentTo ? (
        <Text className="mt-3 leading-6 text-leaf">
          Magic link sent to {sentTo}. Open it on this device/browser to finish
          signing in.
        </Text>
      ) : null}

      {error ? <Text className="mt-3 leading-6 text-coral">{error}</Text> : null}
    </View>
  );
}
