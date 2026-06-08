import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

const reviewPassword = "Ilovelayla123!";
const reviewPasswordStorageKey = "clinrx.reviewPasswordAccepted.v1";

export function ReviewPasswordGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const [accepted, setAccepted] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      setAccepted(
        globalThis.localStorage?.getItem(reviewPasswordStorageKey) === "true",
      );
    } catch {
      setAccepted(false);
    }
  }, []);

  if (accepted) {
    return children;
  }

  return (
    <View className="flex-1 justify-center bg-mist px-5">
      <View className="mx-auto w-full max-w-md rounded-lg border border-ink/10 bg-white p-5">
        <Text className="text-sm font-semibold uppercase text-leaf">
          Calibration access
        </Text>
        <Text className="mt-3 text-2xl font-bold text-ink">
          Enter review password
        </Text>
        <TextInput
          className="mt-4 rounded-lg border border-ink/15 bg-white px-3 py-3 text-base text-ink"
          onChangeText={(value) => {
            setPassword(value);
            setError(null);
          }}
          onSubmitEditing={() => {
            if (password === reviewPassword) {
              globalThis.localStorage?.setItem(
                reviewPasswordStorageKey,
                "true",
              );
              setAccepted(true);
            } else {
              setError("Incorrect password.");
            }
          }}
          placeholder="Password"
          placeholderTextColor="#7b8580"
          secureTextEntry
          value={password}
        />
        {error ? <Text className="mt-2 text-sm text-coral">{error}</Text> : null}
        <Pressable
          accessibilityRole="button"
          className="mt-4 rounded-lg bg-leaf px-4 py-3"
          onPress={() => {
            if (password === reviewPassword) {
              globalThis.localStorage?.setItem(
                reviewPasswordStorageKey,
                "true",
              );
              setAccepted(true);
            } else {
              setError("Incorrect password.");
            }
          }}
        >
          <Text className="text-center font-semibold text-white">Continue</Text>
        </Pressable>
      </View>
    </View>
  );
}
