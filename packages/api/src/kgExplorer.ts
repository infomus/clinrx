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
  chunks: Record<string, number>;
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

export interface KgNameSuggestion {
  name: string;
  count: number;
}

export async function suggestKgNodeNames(
  client: ClinRxSupabaseClient,
  passcode: string,
  query: string,
  limit = 10,
): Promise<KgNameSuggestion[]> {
  const { data, error } = await client.rpc("kg_explorer_suggest", {
    p_passcode: passcode,
    p_query: query,
    p_limit: limit,
  });
  if (error) throw error;
  return ((data as Record<string, unknown>[] | null) ?? []).map((r) => ({
    name: r.name as string,
    count: Number(r.count ?? 0),
  }));
}

export async function searchKgExplorerNodes(
  client: ClinRxSupabaseClient,
  passcode: string,
  query: string,
  limit = 20,
  sources: string[] | null = null,
): Promise<KgSearchNode[]> {
  const { data, error } = await client.rpc("kg_explorer_search", {
    p_passcode: passcode,
    p_query: query,
    p_limit: limit,
    p_sources: sources && sources.length ? sources : null,
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
    chunks: (row.chunks as Record<string, number>) ?? {},
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

export interface KgMoietyMember {
  id: string;
  name: string;
  type: KgNodeType;
  source: string;
  degree: number;
  chunks: Record<string, number>;
}

export interface KgMoietyGroup {
  moiety: string;
  total: number;
  nIngredient: number;
  nClass: number;
  nProduct: number;
  nSources: number;
  sources: string[];
  totalDegree: number;
  members: KgMoietyMember[];
}

export interface KgDuplicationOverview {
  summary: {
    spineNodes: number;
    moieties: number;
    duplicateMoieties: number;
    eliminableNodes: number;
  };
  top: Array<{
    moiety: string;
    total: number;
    nIngredient: number;
    nClass: number;
    nSources: number;
    sources: string[];
  }>;
}

export async function searchKgGroupedNodes(
  client: ClinRxSupabaseClient,
  passcode: string,
  query: string,
  limit = 40,
  sources: string[] | null = null,
): Promise<KgMoietyGroup[]> {
  const { data, error } = await client.rpc("kg_explorer_search_grouped", {
    p_passcode: passcode,
    p_query: query,
    p_limit: limit,
    p_sources: sources && sources.length ? sources : null,
  });
  if (error) throw error;
  return ((data as Record<string, unknown>[] | null) ?? []).map((row) => ({
    moiety: (row.moiety as string) ?? "",
    total: Number(row.total ?? 0),
    nIngredient: Number(row.n_ingredient ?? 0),
    nClass: Number(row.n_class ?? 0),
    nProduct: Number(row.n_product ?? 0),
    nSources: Number(row.n_sources ?? 0),
    sources: (row.sources as string[] | null) ?? [],
    totalDegree: Number(row.total_degree ?? 0),
    members: ((row.members as Record<string, unknown>[] | null) ?? []).map((m) => ({
      id: m.id as string,
      name: m.name as string,
      type: m.type as KgNodeType,
      source: m.source as string,
      degree: Number(m.degree ?? 0),
      chunks: (m.chunks as Record<string, number>) ?? {},
    })),
  }));
}

export async function getKgDuplicationOverview(
  client: ClinRxSupabaseClient,
  passcode: string,
  limit = 100,
): Promise<KgDuplicationOverview> {
  const { data, error } = await client.rpc("kg_explorer_duplication", {
    p_passcode: passcode,
    p_limit: limit,
  });
  if (error) throw error;
  const row = (data as Record<string, unknown> | null) ?? {};
  const summary = (row.summary as Record<string, unknown>) ?? {};
  return {
    summary: {
      spineNodes: Number(summary.spine_nodes ?? 0),
      moieties: Number(summary.moieties ?? 0),
      duplicateMoieties: Number(summary.duplicate_moieties ?? 0),
      eliminableNodes: Number(summary.eliminable_nodes ?? 0),
    },
    top: ((row.top as Record<string, unknown>[] | null) ?? []).map((t) => ({
      moiety: (t.moiety as string) ?? "",
      total: Number(t.total ?? 0),
      nIngredient: Number(t.n_ingredient ?? 0),
      nClass: Number(t.n_class ?? 0),
      nSources: Number(t.n_sources ?? 0),
      sources: (t.sources as string[] | null) ?? [],
    })),
  };
}

export interface KgChunkStat {
  kind: string;
  count: number;
}

export interface KgChunk {
  layer: "monograph" | "pubmed";
  kind: string;
  section: string | null;
  sourceType: string | null;
  pmid: string | null;
  url: string | null;
  content: string;
}

export interface KgChunkPage {
  total: number;
  chunks: KgChunk[];
}

export async function getKgNodeChunkStats(
  client: ClinRxSupabaseClient,
  passcode: string,
  nodeId: string,
): Promise<KgChunkStat[]> {
  const { data, error } = await client.rpc("kg_explorer_node_chunk_stats", {
    p_passcode: passcode,
    p_node_id: nodeId,
  });
  if (error) throw error;
  return ((data as Record<string, unknown>[] | null) ?? []).map((r) => ({
    kind: r.kind as string,
    count: Number(r.count ?? 0),
  }));
}

export async function getKgNodeChunks(
  client: ClinRxSupabaseClient,
  passcode: string,
  nodeId: string,
  options: {
    query?: string | null;
    kind?: string | null;
    limit?: number;
    offset?: number;
  } = {},
): Promise<KgChunkPage> {
  const { data, error } = await client.rpc("kg_explorer_node_chunks", {
    p_passcode: passcode,
    p_node_id: nodeId,
    p_query: options.query ?? null,
    p_kind: options.kind ?? null,
    p_limit: options.limit ?? 25,
    p_offset: options.offset ?? 0,
  });
  if (error) throw error;
  const row = (data as Record<string, unknown> | null) ?? {};
  return {
    total: Number(row.total ?? 0),
    chunks: ((row.chunks as Record<string, unknown>[] | null) ?? []).map((c) => ({
      layer: (c.layer as "monograph" | "pubmed") ?? "monograph",
      kind: c.kind as string,
      section: (c.section as string | null) ?? null,
      sourceType: (c.source_type as string | null) ?? null,
      pmid: (c.pmid as string | null) ?? null,
      url: (c.url as string | null) ?? null,
      content: (c.content as string) ?? "",
    })),
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
