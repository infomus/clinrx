import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  EdgeReviewStatus,
  HealthCanadaMonographCoverage,
  HealthCanadaMonographProductExample,
  PubMedAiReview,
  PubMedAiReviewVerdict,
  PubMedInteractionCandidate,
  PubMedRejectionReason,
} from "@clinrx/types";
import type { KgNode, KgNodeType } from "@clinrx/types";

interface PubMedInteractionCandidateRow {
  id: string;
  pmid: string;
  article_title: string | null;
  article_year: number | null;
  subject_text: string;
  object_text: string;
  resolved_source_id: string | null;
  resolved_target_id: string | null;
  severity: PubMedInteractionCandidate["severity"];
  mechanism: string | null;
  management: string | null;
  evidence_level: string | null;
  extraction_confidence: number;
  source_quote: string | null;
  citations: PubMedInteractionCandidate["citations"];
  review_status: EdgeReviewStatus;
  ai_review: PubMedAiReview | null;
  ai_review_model: string | null;
  ai_review_recommended_rejection_reason: PubMedRejectionReason | null;
  ai_review_score: number | null;
  ai_review_verdict: PubMedAiReviewVerdict | null;
  ai_reviewed_at: string | null;
  rejection_feedback: Record<string, unknown> | null;
  rejection_reason: PubMedRejectionReason | null;
  reviewer_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface KgNodeSearchRow {
  canonical_name: string;
  id: string;
  identifiers: Record<string, unknown>;
  source: string;
  summary: string | null;
  type: KgNodeType;
  created_at: string;
}

interface KgNodeSynonymSearchRow {
  kg_node: KgNodeSearchRow | KgNodeSearchRow[] | null;
  synonym: string;
}

interface KgSourceCrosswalkRow {
  conflicts: string[] | null;
  match_status: "matched" | "possible_match" | "conflict" | "rejected";
  source_a_node_id: string;
  source_b_node_id: string;
}

interface HealthCanadaMonographCoverageRow {
  direct_product_count: number;
  health_canada_node_count: number;
  linked_product_count: number;
  node_id: string;
  product_examples: unknown;
  section_counts: unknown;
  total_chunk_count: number;
  total_product_count: number;
}

type KgNodeSourceCoverage = Pick<KgNode, "sourceConflicts" | "sourceCoverage">;
type KgNodeSourceCoverageValue = NonNullable<KgNode["sourceCoverage"]>;

export interface PubMedCandidateListOptions {
  aiReviewVerdict?: PubMedAiReviewVerdict | "all";
  limit?: number;
  offset?: number;
  resolution?: "all" | "resolved" | "unresolved";
  reviewStatus?: EdgeReviewStatus;
}

export interface PubMedCandidateReviewMetrics {
  candidate: number;
  followUp: number;
  likelyPublishable: number;
  published: number;
  rejected: number;
  resolvedCandidates: number;
  total: number;
}

export async function listPubMedInteractionCandidates(
  client: SupabaseClient,
  reviewStatusOrOptions:
    | EdgeReviewStatus
    | PubMedCandidateListOptions = "candidate",
): Promise<PubMedInteractionCandidate[]> {
  const options =
    typeof reviewStatusOrOptions === "string"
      ? { reviewStatus: reviewStatusOrOptions }
      : reviewStatusOrOptions;

  let query = client
    .from("pubmed_interaction_candidate")
    .select("*")
    .order("created_at", { ascending: false })
    .range(
      options.offset ?? 0,
      (options.offset ?? 0) + (options.limit ?? 50) - 1,
    );

  query = query.eq("review_status", options.reviewStatus ?? "candidate");

  if (options.aiReviewVerdict && options.aiReviewVerdict !== "all") {
    query = query.eq("ai_review_verdict", options.aiReviewVerdict);
  }

  if (options.resolution === "resolved") {
    query = query
      .not("resolved_source_id", "is", null)
      .not("resolved_target_id", "is", null);
  } else if (options.resolution === "unresolved") {
    query = query.or("resolved_source_id.is.null,resolved_target_id.is.null");
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const candidates = ((data ?? []) as PubMedInteractionCandidateRow[]).map(
    mapCandidateRow,
  );
  const resolvedNodeIds = candidates.flatMap((candidate) =>
    [candidate.resolvedSourceId, candidate.resolvedTargetId].filter(
      (nodeId): nodeId is string => Boolean(nodeId),
    ),
  );
  const coverageByNodeId = await getHealthCanadaMonographCoverage(
    client,
    resolvedNodeIds,
  );
  const resolvedNodeById = await getKgNodesById(client, resolvedNodeIds);

  return candidates.map((candidate) => ({
    ...candidate,
    resolvedSourceNode: candidate.resolvedSourceId
      ? (resolvedNodeById.get(candidate.resolvedSourceId) ?? null)
      : null,
    resolvedTargetNode: candidate.resolvedTargetId
      ? (resolvedNodeById.get(candidate.resolvedTargetId) ?? null)
      : null,
    sourceMonographCoverage: candidate.resolvedSourceId
      ? (coverageByNodeId.get(candidate.resolvedSourceId) ?? null)
      : null,
    targetMonographCoverage: candidate.resolvedTargetId
      ? (coverageByNodeId.get(candidate.resolvedTargetId) ?? null)
      : null,
  }));
}

export async function listPubMedInteractionCandidatesByIds(
  client: SupabaseClient,
  candidateIds: string[],
): Promise<PubMedInteractionCandidate[]> {
  const uniqueCandidateIds = [...new Set(candidateIds)];

  if (!uniqueCandidateIds.length) {
    return [];
  }

  const { data, error } = await client
    .from("pubmed_interaction_candidate")
    .select("*")
    .in("id", uniqueCandidateIds);

  if (error) {
    throw error;
  }

  const orderById = new Map(
    candidateIds.map((candidateId, index) => [candidateId, index]),
  );
  const candidates = ((data ?? []) as PubMedInteractionCandidateRow[])
    .map(mapCandidateRow)
    .sort(
      (left, right) =>
        (orderById.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
        (orderById.get(right.id) ?? Number.MAX_SAFE_INTEGER),
    );
  const resolvedNodeIds = candidates.flatMap((candidate) =>
    [candidate.resolvedSourceId, candidate.resolvedTargetId].filter(
      (nodeId): nodeId is string => Boolean(nodeId),
    ),
  );
  const [coverageByNodeId, resolvedNodeById] = await Promise.all([
    getHealthCanadaMonographCoverage(client, resolvedNodeIds),
    getKgNodesById(client, resolvedNodeIds),
  ]);

  return candidates.map((candidate) => ({
    ...candidate,
    resolvedSourceNode: candidate.resolvedSourceId
      ? (resolvedNodeById.get(candidate.resolvedSourceId) ?? null)
      : null,
    resolvedTargetNode: candidate.resolvedTargetId
      ? (resolvedNodeById.get(candidate.resolvedTargetId) ?? null)
      : null,
    sourceMonographCoverage: candidate.resolvedSourceId
      ? (coverageByNodeId.get(candidate.resolvedSourceId) ?? null)
      : null,
    targetMonographCoverage: candidate.resolvedTargetId
      ? (coverageByNodeId.get(candidate.resolvedTargetId) ?? null)
      : null,
  }));
}

export async function getHealthCanadaMonographCoverage(
  client: SupabaseClient,
  nodeIds: string[],
): Promise<Map<string, HealthCanadaMonographCoverage>> {
  const uniqueNodeIds = [...new Set(nodeIds)];
  const coverageByNodeId = new Map<string, HealthCanadaMonographCoverage>();

  if (!uniqueNodeIds.length) {
    return coverageByNodeId;
  }

  const { data, error } = await client.rpc(
    "get_health_canada_monograph_coverage",
    {
      node_ids: uniqueNodeIds,
    },
  );

  if (error) {
    throw error;
  }

  for (const row of (data ?? []) as HealthCanadaMonographCoverageRow[]) {
    coverageByNodeId.set(row.node_id, {
      directProductCount: row.direct_product_count,
      healthCanadaNodeCount: row.health_canada_node_count,
      linkedProductCount: row.linked_product_count,
      productExamples: normalizeProductExamples(row.product_examples),
      sectionCounts: normalizeSectionCounts(row.section_counts),
      totalChunkCount: row.total_chunk_count,
      totalProductCount: row.total_product_count,
    });
  }

  return coverageByNodeId;
}

export async function searchKgNodes(
  client: SupabaseClient,
  query: string,
  limit = 8,
): Promise<KgNode[]> {
  const normalizedQuery = query.trim();

  if (normalizedQuery.length < 2) {
    return [];
  }

  const { data, error } = await client
    .from("kg_node")
    .select("id,type,canonical_name,identifiers,summary,source,created_at")
    .in("type", ["drug", "ingredient", "drug_class"])
    .ilike("canonical_name", `%${normalizedQuery}%`)
    .order("canonical_name", { ascending: true })
    .limit(limit);

  if (error) {
    throw error;
  }

  const { data: synonymData, error: synonymError } = await client
    .from("kg_node_synonym")
    .select(
      "synonym,kg_node:node_id(id,type,canonical_name,identifiers,summary,source,created_at)",
    )
    .ilike("synonym", `%${normalizedQuery}%`)
    .limit(limit);

  if (synonymError) {
    throw synonymError;
  }

  const rowsById = new Map<string, KgNodeSearchRow>();

  for (const row of (data ?? []) as KgNodeSearchRow[]) {
    rowsById.set(row.id, row);
  }

  for (const row of (synonymData ?? []) as KgNodeSynonymSearchRow[]) {
    const node = Array.isArray(row.kg_node) ? row.kg_node[0] : row.kg_node;

    if (node) {
      rowsById.set(node.id, node);
    }
  }

  const sortedRows = [...rowsById.values()]
    .sort((left, right) => {
      const typeOrder =
        getResolutionTypeRank(left.type) - getResolutionTypeRank(right.type);

      return (
        typeOrder || left.canonical_name.localeCompare(right.canonical_name)
      );
    })
    .slice(0, limit);
  const sourceCoverageByNodeId = await getNodeSourceCoverage(
    client,
    sortedRows.map((row) => row.id),
  );

  return sortedRows.map((row) =>
    mapKgNodeRow(row, sourceCoverageByNodeId.get(row.id)),
  );
}

async function getKgNodesById(
  client: SupabaseClient,
  nodeIds: string[],
): Promise<Map<string, KgNode>> {
  const uniqueNodeIds = [...new Set(nodeIds)];
  const nodesById = new Map<string, KgNode>();

  if (!uniqueNodeIds.length) {
    return nodesById;
  }

  const { data, error } = await client
    .from("kg_node")
    .select("id,type,canonical_name,identifiers,summary,source,created_at")
    .in("id", uniqueNodeIds);

  if (error) {
    throw error;
  }

  const sourceCoverageByNodeId = await getNodeSourceCoverage(
    client,
    uniqueNodeIds,
  );

  for (const row of (data ?? []) as KgNodeSearchRow[]) {
    nodesById.set(row.id, mapKgNodeRow(row, sourceCoverageByNodeId.get(row.id)));
  }

  return nodesById;
}

export async function getPubMedCandidateReviewMetrics(
  client: SupabaseClient,
): Promise<PubMedCandidateReviewMetrics> {
  const [
    total,
    candidate,
    followUp,
    published,
    rejected,
    likelyPublishable,
    resolvedCandidates,
  ] = await Promise.all([
    countPubMedCandidates(client),
    countPubMedCandidates(client, { reviewStatus: "candidate" }),
    countPubMedCandidates(client, { reviewStatus: "under_review" }),
    countPubMedCandidates(client, { reviewStatus: "published" }),
    countPubMedCandidates(client, { reviewStatus: "rejected" }),
    countPubMedCandidates(client, {
      aiReviewVerdict: "likely_publishable",
      reviewStatus: "candidate",
    }),
    countPubMedCandidates(client, {
      resolution: "resolved",
      reviewStatus: "candidate",
    }),
  ]);

  return {
    candidate,
    followUp,
    likelyPublishable,
    published,
    rejected,
    resolvedCandidates,
    total,
  };
}

export async function getPubMedCandidateCount(
  client: SupabaseClient,
  options: PubMedCandidateListOptions = {},
): Promise<number> {
  return countPubMedCandidates(client, options);
}

export async function updatePubMedCandidateResolution(
  client: SupabaseClient,
  candidateId: string,
  resolution: {
    resolvedSourceId: string | null;
    resolvedTargetId: string | null;
    reviewerNotes?: string;
  },
): Promise<void> {
  const { error } = await client
    .from("pubmed_interaction_candidate")
    .update({
      resolved_source_id: resolution.resolvedSourceId,
      resolved_target_id: resolution.resolvedTargetId,
      reviewer_notes: resolution.reviewerNotes,
    })
    .eq("id", candidateId);

  if (error) {
    throw error;
  }
}

export async function markPubMedCandidateNeedsFollowUp(
  client: SupabaseClient,
  candidateId: string,
  reviewerNotes?: string,
): Promise<void> {
  const { error } = await client
    .from("pubmed_interaction_candidate")
    .update({
      review_status: "under_review",
      reviewer_notes: reviewerNotes,
    })
    .eq("id", candidateId);

  if (error) {
    throw error;
  }
}

export async function publishPubMedCandidate(
  client: SupabaseClient,
  candidateId: string,
): Promise<string> {
  const { data, error } = await client.rpc(
    "publish_pubmed_interaction_candidate",
    {
      candidate_id: candidateId,
    },
  );

  if (error) {
    throw error;
  }

  return data as string;
}

export async function rejectPubMedCandidate(
  client: SupabaseClient,
  candidateId: string,
  reason: PubMedRejectionReason,
  notes?: string,
): Promise<void> {
  const { error } = await client.rpc("reject_pubmed_interaction_candidate", {
    candidate_id: candidateId,
    notes: notes ?? null,
    reason,
  });

  if (error) {
    throw error;
  }
}

function mapCandidateRow(
  row: PubMedInteractionCandidateRow,
): PubMedInteractionCandidate {
  return {
    id: row.id,
    pmid: row.pmid,
    articleTitle: row.article_title,
    articleYear: row.article_year,
    subjectText: row.subject_text,
    objectText: row.object_text,
    resolvedSourceId: row.resolved_source_id,
    resolvedTargetId: row.resolved_target_id,
    severity: row.severity,
    mechanism: row.mechanism,
    management: row.management,
    evidenceLevel: row.evidence_level,
    extractionConfidence: row.extraction_confidence,
    sourceQuote: row.source_quote,
    citations: row.citations,
    reviewStatus: row.review_status,
    aiReview: row.ai_review,
    aiReviewModel: row.ai_review_model,
    aiReviewRecommendedRejectionReason:
      row.ai_review_recommended_rejection_reason,
    aiReviewScore: row.ai_review_score,
    aiReviewVerdict: row.ai_review_verdict,
    aiReviewedAt: row.ai_reviewed_at,
    rejectionFeedback: row.rejection_feedback,
    rejectionReason: row.rejection_reason,
    reviewerNotes: row.reviewer_notes,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function countPubMedCandidates(
  client: SupabaseClient,
  options: PubMedCandidateListOptions = {},
): Promise<number> {
  let query = client
    .from("pubmed_interaction_candidate")
    .select("id", { count: "exact", head: true });

  if (options.reviewStatus) {
    query = query.eq("review_status", options.reviewStatus);
  }

  if (options.aiReviewVerdict && options.aiReviewVerdict !== "all") {
    query = query.eq("ai_review_verdict", options.aiReviewVerdict);
  }

  if (options.resolution === "resolved") {
    query = query
      .not("resolved_source_id", "is", null)
      .not("resolved_target_id", "is", null);
  } else if (options.resolution === "unresolved") {
    query = query.or("resolved_source_id.is.null,resolved_target_id.is.null");
  }

  const { count, error } = await query;

  if (error) {
    throw error;
  }

  return count ?? 0;
}

async function getNodeSourceCoverage(
  client: SupabaseClient,
  nodeIds: string[],
): Promise<Map<string, KgNodeSourceCoverage>> {
  const sourceCoverageByNodeId = new Map<string, KgNodeSourceCoverage>();

  if (!nodeIds.length) {
    return sourceCoverageByNodeId;
  }

  const [sourceAResponse, sourceBResponse] = await Promise.all([
    client
      .from("kg_source_crosswalk")
      .select("source_a_node_id,source_b_node_id,match_status,conflicts")
      .in("source_a_node_id", nodeIds),
    client
      .from("kg_source_crosswalk")
      .select("source_a_node_id,source_b_node_id,match_status,conflicts")
      .in("source_b_node_id", nodeIds),
  ]);

  if (sourceAResponse.error) {
    throw sourceAResponse.error;
  }

  if (sourceBResponse.error) {
    throw sourceBResponse.error;
  }

  for (const row of (sourceAResponse.data ?? []) as KgSourceCrosswalkRow[]) {
    sourceCoverageByNodeId.set(
      row.source_a_node_id,
      buildNodeSourceCoverage(row, "CPS"),
    );
  }

  for (const row of (sourceBResponse.data ?? []) as KgSourceCrosswalkRow[]) {
    sourceCoverageByNodeId.set(
      row.source_b_node_id,
      buildNodeSourceCoverage(row, "HEALTH_CANADA_DPD"),
    );
  }

  return sourceCoverageByNodeId;
}

function mapKgNodeRow(
  row: KgNodeSearchRow,
  sourceCoverage?: KgNodeSourceCoverage,
): KgNode {
  const defaultCoverage: KgNodeSourceCoverageValue | undefined =
    row.source === "HEALTH_CANADA_DPD"
      ? "health_canada_only"
      : row.source === "CPS"
        ? "cps_only"
        : undefined;
  const coverage = sourceCoverage?.sourceCoverage ?? defaultCoverage;
  const conflicts = sourceCoverage?.sourceConflicts;

  return {
    canonicalName: row.canonical_name,
    createdAt: row.created_at,
    id: row.id,
    identifiers: row.identifiers,
    source: row.source,
    ...(conflicts ? { sourceConflicts: conflicts } : {}),
    ...(coverage ? { sourceCoverage: coverage } : {}),
    summary: row.summary,
    type: row.type,
  };
}

function buildNodeSourceCoverage(
  row: KgSourceCrosswalkRow,
  source: "CPS" | "HEALTH_CANADA_DPD",
): KgNodeSourceCoverage {
  return {
    sourceConflicts: row.conflicts ?? [],
    sourceCoverage: mapCrosswalkStatus(row.match_status, source),
  };
}

function mapCrosswalkStatus(
  status: KgSourceCrosswalkRow["match_status"],
  source: "CPS" | "HEALTH_CANADA_DPD",
): KgNodeSourceCoverageValue {
  switch (status) {
    case "matched":
      return "cps_covered";
    case "possible_match":
      return "possible_source_match";
    case "conflict":
      return "source_conflict";
    case "rejected":
      return source === "HEALTH_CANADA_DPD" ? "health_canada_only" : "cps_only";
    default:
      return source === "HEALTH_CANADA_DPD" ? "health_canada_only" : "cps_only";
  }
}

function getResolutionTypeRank(type: KgNodeType): number {
  switch (type) {
    case "ingredient":
      return 0;
    case "drug_class":
      return 1;
    case "drug":
      return 2;
    default:
      return 3;
  }
}

function normalizeProductExamples(
  value: unknown,
): HealthCanadaMonographProductExample[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const record = item as Record<string, unknown>;
    const chunkCount =
      typeof record.chunkCount === "number" ? record.chunkCount : 0;
    const name = typeof record.name === "string" ? record.name : null;
    const nodeId = typeof record.nodeId === "string" ? record.nodeId : null;

    if (!name || !nodeId) {
      return [];
    }

    return {
      chunkCount,
      din: normalizeStringArray(record.din),
      drugCode: typeof record.drugCode === "string" ? record.drugCode : null,
      name,
      nodeId,
      status: normalizeStringArray(record.status),
    };
  });
}

function normalizeSectionCounts(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([key, count]) =>
      typeof count === "number" ? [[key, count]] : [],
    ),
  );
}

function normalizeStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return value.filter((item): item is string => typeof item === "string");
}
