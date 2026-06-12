import NetInfo from "@react-native-community/netinfo";
import { useQuery } from "@tanstack/react-query";
import { Pressable, Text, View } from "react-native";

import { checkPublishedInteractions } from "@clinrx/api";
import type { InteractionActionCategory, InteractionResult } from "@clinrx/types";

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

      return checkPublishedInteractions(supabase, selectedNodeIds, {
        aiCacheTtlSeconds: 86400,
        aiInferenceMode: "on_miss_or_uncertain",
        captureEvaluation: true,
        evaluationCaptureMode: "async",
        evaluationSamplingReason: "manual",
        evaluationSampleRate: 1,
        evaluationSetId: "interaction-runtime-live-calibration",
        evaluationSetName: "Live runtime checker calibration",
        inputLabels: Object.fromEntries(
          demoDrugs.map((drug) => [drug.id, drug.name]),
        ),
        retrieveRuntimeEvidence: true,
        resultCacheTtlSeconds: 86400,
        useAiInference: true,
        useResultCache: true,
      });
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
          <View className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4">
            <Text className="text-sm font-semibold uppercase text-green-700">
              No known interaction
            </Text>
            <Text className="mt-2 leading-6 text-ink/70">
              No known interaction in the current evidence base. This is an
              educational tool and does not prove the combination is safe.
            </Text>
          </View>
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
  const actionCategory =
    result.interaction.actionCategory ??
    inferActionCategoryFromSeverity(result.interaction.severity);
  const style = actionCategoryStyles[actionCategory];
  const isRuntimeAi = result.interaction.source === "RuntimeAI";

  return (
    <View className={`rounded-lg border p-4 ${style.panel}`}>
      <Text className={`text-sm font-semibold uppercase ${style.text}`}>
        {actionCategoryLabels[actionCategory]}
      </Text>
      <Text className="mt-2 text-base font-semibold text-ink">
        {isRuntimeAi ? "AI evidence assessment" : "Published interaction found"}
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
        Severity: {result.interaction.severity}
      </Text>
      <Text className="mt-1 text-sm text-ink/60">
        Evidence: {result.interaction.evidenceLevel ?? "not specified"}
      </Text>
      <Text className="mt-1 text-sm text-ink/60">
        Citations:{" "}
        {result.interaction.citations.map((citation) => citation.pmid).join(", ")}
      </Text>
    </View>
  );
}

function inferActionCategoryFromSeverity(
  severity: InteractionResult["interaction"]["severity"],
): InteractionActionCategory {
  switch (severity) {
    case "contraindicated":
      return "avoid_combination";
    case "major":
      return "consider_therapy_modification";
    case "moderate":
      return "monitor_therapy";
    case "minor":
      return "no_action_needed";
    default:
      return "monitor_therapy";
  }
}

const actionCategoryLabels: Record<InteractionActionCategory, string> = {
  avoid_combination: "Avoid combination",
  consider_therapy_modification: "Consider therapy modification",
  monitor_therapy: "Monitor therapy",
  no_action_needed: "No action needed",
  no_known_interaction: "No known interaction",
};

const actionCategoryStyles: Record<
  InteractionActionCategory,
  { panel: string; text: string }
> = {
  avoid_combination: {
    panel: "border-red-200 bg-red-50",
    text: "text-red-700",
  },
  consider_therapy_modification: {
    panel: "border-orange-200 bg-orange-50",
    text: "text-orange-700",
  },
  monitor_therapy: {
    panel: "border-yellow-200 bg-yellow-50",
    text: "text-yellow-700",
  },
  no_action_needed: {
    panel: "border-blue-200 bg-blue-50",
    text: "text-blue-700",
  },
  no_known_interaction: {
    panel: "border-green-200 bg-green-50",
    text: "text-green-700",
  },
};
