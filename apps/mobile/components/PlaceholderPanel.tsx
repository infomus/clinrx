import { Text, View } from "react-native";

export function PlaceholderPanel({
  items,
  title,
}: {
  items: string[];
  title: string;
}) {
  return (
    <View className="rounded-lg border border-ink/10 bg-white p-4">
      <Text className="text-base font-semibold text-ink">{title}</Text>
      <View className="mt-4 gap-3">
        {items.map((item) => (
          <View className="rounded-lg border border-ink/10 bg-mist p-4" key={item}>
            <Text className="leading-6 text-ink/75">{item}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
