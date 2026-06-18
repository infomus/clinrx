import type {
  EdgeReviewStatus,
  InteractionSeverity,
  KgNodeType,
  KgRelation,
} from "@clinrx/types";

import type { ClinRxSupabaseClient } from "./supabase.js";

// Knowledge-graph explorer: thin typed wrappers over the SECURITY DEFINER RPCs
// (see migration 20260618120000_kg_explorer_rpcs.sql). All calls are gated by the
// shared review passcode, passed through from the client.

export interface KgSearchNode {
  id: string;
  type: KgNodeType;
  canonicalName: string;
  source: string;
  identifiers: Record<string, unknown>;
  summary: string | null;
  degree: number;
}

export interface KgNodeDetail {
  id: string;
  type: KgNodeType;
  canonicalName: string;
  identifiers: Record<string, unknown>;
  summary: string | null;
  source: string;
  createdAt: string;
  degree: number;
  chunkCount: number;
  synonyms: Array<{ synonym: string; source: string }>;
  crosswalk: Array<{
    sourceA: string;
    sourceANodeId: string;
    sourceB: string;
    sourceBNodeId: string;
    matchStatus: string;
    matchType: string;
    confidence: number;
    conflicts: unknown;
  }>;
}

export interface KgEdge {
  id: string;
  direction: "in" | "out";
  neighborId: string;
  neighborName: string;
  neighborType: KgNodeType;
  neighborSource: string;
  relation: KgRelation;
  severity: InteractionSeverity | null;
  evidenceLevel: string | null;
  extractionConfidence: number | null;
  reviewStatus: EdgeReviewStatus;
  citations: unknown;
  source: string;
  createdAt: string;
}

export interface KgEdgePage {
  total: number;
  edges: KgEdge[];
}

export interface KgEdgeFilters {
  relation?: KgRelation | null;
  severities?: InteractionSeverity[] | null;
  statuses?: EdgeReviewStatus[] | null;
  minConfidence?: number | null;
  neighborQuery?: string | null;
  limit?: number;
  offset?: number;
}

export async function searchKgExplorerNodes(
  client: ClinRxSupabaseClient,
  passcode: string,
  query: string,
  limit = 20,
): Promise<KgSearchNode[]> {
  const { data, error } = await client.rpc("kg_explorer_search", {
    p_passcode: passcode,
    p_query: query,
    p_limit: limit,
  });
  if (error) throw error;
  return ((data as Record<string, unknown>[] | null) ?? []).map((row) => ({
    id: row.id as string,
    type: row.type as KgNodeType,
    canonicalName: row.canonical_name as string,
    source: row.source as string,
    identifiers: (row.identifiers as Record<string, unknown>) ?? {},
    summary: (row.summary as string | null) ?? null,
    degree: Number(row.degree ?? 0),
  }));
}

export async function getKgExplorerNode(
  client: ClinRxSupabaseClient,
  passcode: string,
  nodeId: string,
): Promise<KgNodeDetail | null> {
  const { data, error } = await client.rpc("kg_explorer_node", {
    p_passcode: passcode,
    p_node_id: nodeId,
  });
  if (error) throw error;
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    id: row.id as string,
    type: row.type as KgNodeType,
    canonicalName: row.canonical_name as string,
    identifiers: (row.identifiers as Record<string, unknown>) ?? {},
    summary: (row.summary as string | null) ?? null,
    source: row.source as string,
    createdAt: row.created_at as string,
    degree: Number(row.degree ?? 0),
    chunkCount: Number(row.chunk_count ?? 0),
    synonyms: ((row.synonyms as Record<string, unknown>[] | null) ?? []).map(
      (s) => ({ synonym: s.synonym as string, source: s.source as string }),
    ),
    crosswalk: ((row.crosswalk as Record<string, unknown>[] | null) ?? []).map(
      (c) => ({
        sourceA: c.source_a as string,
        sourceANodeId: c.source_a_node_id as string,
        sourceB: c.source_b as string,
        sourceBNodeId: c.source_b_node_id as string,
        matchStatus: c.match_status as string,
        matchType: c.match_type as string,
        confidence: Number(c.confidence ?? 0),
        conflicts: c.conflicts,
      }),
    ),
  };
}

export async function getKgExplorerEdges(
  client: ClinRxSupabaseClient,
  passcode: string,
  nodeId: string,
  filters: KgEdgeFilters = {},
): Promise<KgEdgePage> {
  const { data, error } = await client.rpc("kg_explorer_edges", {
    p_passcode: passcode,
    p_node_id: nodeId,
    p_relation: filters.relation ?? null,
    p_severities: filters.severities ?? null,
    p_statuses: filters.statuses ?? null,
    p_min_confidence: filters.minConfidence ?? null,
    p_neighbor_query: filters.neighborQuery ?? null,
    p_limit: filters.limit ?? 50,
    p_offset: filters.offset ?? 0,
  });
  if (error) throw error;
  const row = (data as Record<string, unknown> | null) ?? {};
  return {
    total: Number(row.total ?? 0),
    edges: ((row.edges as Record<string, unknown>[] | null) ?? []).map((e) => ({
      id: e.id as string,
      direction: e.direction as "in" | "out",
      neighborId: e.neighbor_id as string,
      neighborName: e.neighbor_name as string,
      neighborType: e.neighbor_type as KgNodeType,
      neighborSource: e.neighbor_source as string,
      relation: e.relation as KgRelation,
      severity: (e.severity as InteractionSeverity | null) ?? null,
      evidenceLevel: (e.evidence_level as string | null) ?? null,
      extractionConfidence: e.extraction_confidence === null ||
          e.extraction_confidence === undefined
        ? null
        : Number(e.extraction_confidence),
      reviewStatus: e.review_status as EdgeReviewStatus,
      citations: e.citations,
      source: e.source as string,
      createdAt: e.created_at as string,
    })),
  };
}
