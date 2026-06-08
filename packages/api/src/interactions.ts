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
  interactions?: InteractionRpcRow[];
}

export async function checkPublishedInteractions(
  client: SupabaseClient,
  nodeIds: readonly string[],
): Promise<InteractionResult[]> {
  const input = checkInteractionsInputSchema.parse({ nodeIds });

  const { data, error } =
    await client.functions.invoke<CheckInteractionsFunctionResponse>(
      "check-interactions",
      {
        body: {
          nodeIds: input.nodeIds,
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
