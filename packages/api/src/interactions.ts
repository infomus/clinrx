import type { SupabaseClient } from "@supabase/supabase-js";

import type { InteractionResult } from "@clinrx/types";
import { checkInteractionsInputSchema } from "@clinrx/validation";

interface InteractionRpcRow {
  input_pair: [string, string];
  matched_via: {
    leftNodeId: string;
    rightNodeId: string;
  };
  interaction: InteractionResult["interaction"];
}

interface CheckInteractionsFunctionResponse {
  cache?: {
    enabled: boolean;
    graphVersion?: string;
    hitCount: number;
    missCount: number;
    pairCount: number;
  };
  evaluation?: {
    captureMode?: "async" | "sync";
    error?: string;
    queued?: boolean;
    requestCount?: number;
    requestIds?: string[];
    runIds?: string[];
    setId?: string;
  };
  interactions?: InteractionRpcRow[];
}

export interface CheckPublishedInteractionsOptions {
  aiCacheTtlSeconds?: number;
  aiInferenceMode?: "always" | "on_miss_or_uncertain";
  calibrationModelPanel?: boolean;
  calibrationModels?: string[];
  captureEvaluation?: boolean;
  evaluationCaptureMode?: "async" | "sync";
  evaluationSamplingReason?: string;
  evaluationSampleRate?: number;
  evaluationSetId?: string;
  evaluationSetName?: string;
  forceEvaluationCapture?: boolean;
  inputLabels?: Record<string, string>;
  retrieveRuntimeEvidence?: boolean;
  resultCacheTtlSeconds?: number;
  useAiInference?: boolean;
  useResultCache?: boolean;
}

export async function checkPublishedInteractions(
  client: SupabaseClient,
  nodeIds: readonly string[],
  options: CheckPublishedInteractionsOptions = {},
): Promise<InteractionResult[]> {
  const input = checkInteractionsInputSchema.parse({ nodeIds });

  const { data, error } =
    await client.functions.invoke<CheckInteractionsFunctionResponse>(
      "check-interactions",
      {
        body: {
          aiCacheTtlSeconds: options.aiCacheTtlSeconds,
          aiInferenceMode: options.aiInferenceMode,
          calibrationModelPanel: options.calibrationModelPanel,
          calibrationModels: options.calibrationModels,
          captureEvaluation: options.captureEvaluation ?? false,
          evaluationCaptureMode: options.evaluationCaptureMode,
          evaluationSamplingReason: options.evaluationSamplingReason,
          evaluationSampleRate: options.evaluationSampleRate,
          evaluationSetId: options.evaluationSetId,
          evaluationSetName: options.evaluationSetName,
          forceEvaluationCapture: options.forceEvaluationCapture,
          inputLabels: options.inputLabels,
          nodeIds: input.nodeIds,
          retrieveRuntimeEvidence: options.retrieveRuntimeEvidence,
          resultCacheTtlSeconds: options.resultCacheTtlSeconds,
          useAiInference: options.useAiInference,
          useResultCache: options.useResultCache,
        },
      },
    );

  if (error) {
    throw error;
  }

  return ((data?.interactions ?? []) as InteractionRpcRow[]).map((row) => ({
    inputPair: row.input_pair,
    matchedVia: row.matched_via,
    interaction: row.interaction,
  }));
}

export async function checkPublishedInteractionsRpc(
  client: SupabaseClient,
  nodeIds: readonly string[],
): Promise<InteractionResult[]> {
  const input = checkInteractionsInputSchema.parse({ nodeIds });

  const { data, error } = await client.rpc("check_published_interactions", {
    input_node_ids: input.nodeIds,
  });

  if (error) {
    throw error;
  }

  return ((data ?? []) as InteractionRpcRow[]).map((row) => ({
    inputPair: row.input_pair,
    matchedVia: row.matched_via,
    interaction: row.interaction,
  }));
}
