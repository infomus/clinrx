import NetInfo from "@react-native-community/netinfo";
import { useQuery } from "@tanstack/react-query";
import { Pressable, Text, View } from "react-native";

import { checkPublishedInteractions } from "@clinrx/api";
import type { InteractionResult } from "@clinrx/types";

import { supabase } from "@/lib/supabase";
import { useInteractionCheckerStore } from "@/state/interactionChecker";

const demoDrugs = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Warfarin",
    detail: "Anticoagulant",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Ibuprofen",
    detail: "NSAID",
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Amoxicillin",
    detail: "Beta-lactam antibiotic",
  },
];

export function InteractionChecker() {
  const { selectedNodeIds, toggleNodeId } = useInteractionCheckerStore();

  const interactionsQuery = useQuery({
    queryKey: ["interactions", selectedNodeIds],
    enabled: selectedNodeIds.length >= 2,
    networkMode: "online",
    queryFn: async () => {
      const networkState = await NetInfo.fetch();

      if (networkState.isConnected === false) {
        throw new OnlineConnectionRequiredError();
      }

      return checkPublishedInteractions(supabase, selectedNodeIds);
    },
  });

  const onlineRequired =
    interactionsQuery.error instanceof OnlineConnectionRequiredError;

  return (
    <>
      <View className="mb-6 rounded-lg border border-ink/10 bg-white p-4">
        <Text className="text-base font-semibold text-ink">
          Select study drugs
        </Text>
        <View className="mt-4 gap-3">
          {demoDrugs.map((drug) => {
            const selected = selectedNodeIds.includes(drug.id);

            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }}
                className={`rounded-lg border p-4 ${
                  selected ? "border-leaf bg-leaf" : "border-ink/10 bg-white"
                }`}
                key={drug.id}
                onPress={() => toggleNodeId(drug.id)}
              >
                <Text
                  className={`text-lg font-semibold ${
                    selected ? "text-white" : "text-ink"
                  }`}
                >
                  {drug.name}
                </Text>
                <Text
                  className={`mt-1 text-sm ${
                    selected ? "text-white/80" : "text-ink/60"
                  }`}
                >
                  {drug.detail}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View className="rounded-lg border border-ink/10 bg-white p-4">
        <Text className="text-base font-semibold text-ink">Results</Text>
        {selectedNodeIds.length < 2 ? (
          <Text className="mt-3 leading-6 text-ink/70">
            Select at least two drugs to check the current evidence base.
          </Text>
        ) : interactionsQuery.isLoading ? (
          <Text className="mt-3 leading-6 text-ink/70">
            Checking published graph edges...
          </Text>
        ) : onlineRequired ? (
          <Text className="mt-3 leading-6 text-coral">
            Online connection required. Interaction checking is server-only so
            it can use the current graph and avoid stale safety data.
          </Text>
        ) : interactionsQuery.isError ? (
          <Text className="mt-3 leading-6 text-coral">
            Could not check interactions. Confirm migrations are applied and
            the Supabase project is reachable.
          </Text>
        ) : interactionsQuery.data?.length ? (
          <View className="mt-4 gap-3">
            {interactionsQuery.data.map((result) => (
              <InteractionResultCard
                key={`${result.inputPair.join("-")}-${result.interaction.id}`}
                result={result}
              />
            ))}
          </View>
        ) : (
          <Text className="mt-3 leading-6 text-ink/70">
            No known interaction in the current evidence base. This is an
            educational tool and does not prove the combination is safe.
          </Text>
        )}
      </View>
    </>
  );
}

class OnlineConnectionRequiredError extends Error {
  constructor() {
    super("Online connection required");
    this.name = "OnlineConnectionRequiredError";
  }
}

function InteractionResultCard({ result }: { result: InteractionResult }) {
  return (
    <View className="rounded-lg border border-coral/30 bg-coral/10 p-4">
      <Text className="text-sm font-semibold uppercase text-coral">
        {result.interaction.severity}
      </Text>
      <Text className="mt-2 text-base font-semibold text-ink">
        Published interaction found
      </Text>
      {result.interaction.mechanism ? (
        <Text className="mt-2 leading-6 text-ink/70">
          {result.interaction.mechanism}
        </Text>
      ) : null}
      {result.interaction.management ? (
        <Text className="mt-2 leading-6 text-ink/70">
          Management: {result.interaction.management}
        </Text>
      ) : null}
      <Text className="mt-3 text-sm text-ink/60">
        Evidence: {result.interaction.evidenceLevel ?? "not specified"}
      </Text>
      <Text className="mt-1 text-sm text-ink/60">
        Citations:{" "}
        {result.interaction.citations.map((citation) => citation.pmid).join(", ")}
      </Text>
    </View>
  );
}
