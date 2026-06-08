import type { SupabaseClient } from "@supabase/supabase-js";

import type { CpsSearchResult } from "@clinrx/types";
import { cpsSearchInputSchema } from "@clinrx/validation";

interface CpsSearchRpcRow {
  chunk_id: string;
  excerpt: string;
  node_id: string;
  node_name: string;
  node_type: CpsSearchResult["nodeType"];
  rank: number;
  section?: string | null;
}

interface CpsSearchFunctionResponse {
  results?: CpsSearchRpcRow[];
}

export async function searchCps(
  client: SupabaseClient,
  input: {
    limit?: number;
    query: string;
  },
): Promise<CpsSearchResult[]> {
  const parsedInput = cpsSearchInputSchema.parse(input);

  const { data, error } =
    await client.functions.invoke<CpsSearchFunctionResponse>("search-cps", {
      body: parsedInput,
    });

  if (error) {
    throw error;
  }

  return (data?.results ?? []).map((row) => ({
    chunkId: row.chunk_id,
    excerpt: row.excerpt,
    nodeId: row.node_id,
    nodeName: row.node_name,
    nodeType: row.node_type,
    rank: row.rank,
    section: row.section ?? null,
  }));
}
