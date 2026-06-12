import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  CpsMonographCoverage,
  CpsMonographExample,
  EdgeReviewStatus,
  HealthCanadaMonographCoverage,
  HealthCanadaMonographProductExample,
  PubMedAiDecision,
  PubMedAiReview,
  PubMedAiReviewVerdict,
  PubMedAutomationTier,
  PubMedCalibrationReview,
  PubMedCalibrationReviewInput,
  PubMedEvaluationSet,
  PubMedEvaluationSetBundle,
  PubMedEvaluationSetCandidate,
  PubMedEvaluationSetPurpose,
  PubMedEvaluationMetricsReport,
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
  ai_decision: PubMedInteractionCandidate["aiDecision"];
  ai_decision_trace: PubMedInteractionCandidate["aiDecisionTrace"];
  ai_review: PubMedAiReview | null;
  ai_review_model: string | null;
  ai_review_recommended_rejection_reason: PubMedRejectionReason | null;
  ai_review_score: number | null;
  ai_review_verdict: PubMedAiReviewVerdict | null;
  ai_reviewed_at: string | null;
  applicability: Record<string, unknown>;
  automation_metadata: Record<string, unknown>;
  automation_reason: string | null;
  automation_tier: PubMedInteractionCandidate["automationTier"];
  evidence_summary: Record<string, unknown>;
  full_text_evidence_count: number;
  full_text_processed: boolean;
  interaction_action_category: PubMedInteractionCandidate["interactionActionCategory"];
  kg_uncertainty: Record<string, unknown>;
  rejection_feedback: Record<string, unknown> | null;
  rejection_reason: PubMedRejectionReason | null;
  reviewer_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  pipeline_versions: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface KgNodeSearchRow {
  canonical_name: string;
  id: string;
  identifiers: Record<string, unknown>;
  uncertainty: Record<string, unknown>;
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

interface CpsMonographCoverageRow {
  direct_monograph_count: number;
  linked_monograph_count: number;
  monograph_examples: unknown;
  node_id: string;
  product_listing_count: number;
  total_chunk_count: number;
}

interface PubMedEvidenceChunkRow {
  id: string;
  content: string;
  created_at: string;
  extraction_confidence: number | null;
  label: string | null;
  license: string | null;
  pmcid: string | null;
  pmid: string;
  relevance_score: number | null;
  section_path: string[] | null;
  section_title: string | null;
  source_type: PubMedInteractionCandidate["candidateEvidence"] extends
    | Array<{ chunk: infer T }>
    | undefined
    ? T extends { sourceType: infer S }
      ? S
      : never
    : never;
  source_url: string | null;
  structured_content: Record<string, unknown>;
}

interface PubMedCandidateEvidenceRow {
  candidate_id: string;
  confidence: number | null;
  quote: string | null;
  support_type: NonNullable<
    PubMedInteractionCandidate["candidateEvidence"]
  >[number]["supportType"];
  pubmed_evidence_chunk: PubMedEvidenceChunkRow | PubMedEvidenceChunkRow[] | null;
}

interface PubMedCandidateMonographEvidenceRow {
  candidate_id: string;
  confidence: number | null;
  extracted_facts: Record<string, unknown>;
  kg_chunk_id: string;
  quote: string | null;
  section: string | null;
  side: NonNullable<
    PubMedInteractionCandidate["monographEvidence"]
  >[number]["side"];
  source_kind: NonNullable<
    PubMedInteractionCandidate["monographEvidence"]
  >[number]["sourceKind"];
  support_type: NonNullable<
    PubMedInteractionCandidate["monographEvidence"]
  >[number]["supportType"];
}

interface KgChunkEvidenceRow {
  content: string;
  id: string;
  node_id: string;
  section: string | null;
  source: string;
}

interface PubMedCalibrationReviewRow {
  ai_interpretation_assessment: PubMedCalibrationReview["aiInterpretationAssessment"];
  automation_safety_assessment: PubMedCalibrationReview["automationSafetyAssessment"];
  candidate_id: string;
  created_at: string;
  decision: PubMedCalibrationReview["decision"];
  drug_pair_assessment: PubMedCalibrationReview["drugPairAssessment"];
  evidence_retrieval_assessment: PubMedCalibrationReview["evidenceRetrievalAssessment"];
  failure_modes: PubMedCalibrationReview["failureModes"];
  generalization_assessment: PubMedCalibrationReview["generalizationAssessment"];
  human_label: PubMedCalibrationReview["humanLabel"];
  id: string;
  interaction_assessment: PubMedCalibrationReview["interactionAssessment"];
  label_purpose: PubMedCalibrationReview["labelPurpose"];
  missing_context: PubMedCalibrationReview["missingContext"];
  notes: string;
  resolution_assessment: PubMedCalibrationReview["resolutionAssessment"];
  reviewer_id: string | null;
  reviewer_key: string;
  set_id: string;
  severity_management_assessment: PubMedCalibrationReview["severityManagementAssessment"];
  suggested_prevention: string | null;
  time_bucket: PubMedCalibrationReview["timeBucket"];
  updated_at: string;
}

interface PubMedEvaluationSetRow {
  created_at: string;
  created_by: string | null;
  criteria: Record<string, unknown>;
  description: string;
  id: string;
  is_locked: boolean;
  name: string;
  purpose: PubMedEvaluationSetPurpose;
  updated_at: string;
  version: number;
}

interface PubMedEvaluationSetCandidateRow {
  added_by: string | null;
  candidate_id: string;
  created_at: string;
  expected_label: Record<string, unknown>;
  label_purpose: PubMedEvaluationSetPurpose;
  metadata: Record<string, unknown>;
  sampling_reason: PubMedEvaluationSetCandidate["samplingReason"];
  set_id: string;
}

interface PubMedCandidateAutomationMetricRow {
  ai_decision: string;
  ai_review_verdict: string;
  automation_tier: string;
  average_ai_review_score: number | null;
  candidate_count: number;
  full_text_evidence_count: number;
  fully_resolved_count: number;
  monograph_evidence_count: number;
  unresolved_count: number;
}

interface PubMedCalibrationLabelMetricRow {
  ai_decision: string;
  automation_tier: string;
  average_ai_review_score: number | null;
  exact_label_match_count: number;
  human_label: string;
  label_disagreement_count: number;
  label_purpose: PubMedEvaluationSetPurpose;
  review_count: number;
}

interface PubMedCalibrationFailureModeMetricRow {
  failure_mode: string;
  label_purpose: PubMedEvaluationSetPurpose;
  review_count: number;
}

const cpsCoverageBatchSize = 4;

type KgNodeSourceCoverage = Pick<KgNode, "sourceConflicts" | "sourceCoverage">;
type KgNodeSourceCoverageValue = NonNullable<KgNode["sourceCoverage"]>;

export interface PubMedCandidateListOptions {
  aiDecision?: PubMedAiDecision | "all";
  aiReviewVerdict?: PubMedAiReviewVerdict | "all";
  automationTier?: PubMedAutomationTier | "all";
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

  if (options.aiDecision && options.aiDecision !== "all") {
    query = query.eq("ai_decision", options.aiDecision);
  }

  if (options.automationTier && options.automationTier !== "all") {
    query = query.eq("automation_tier", options.automationTier);
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
  const [coverageByNodeId, cpsCoverageByNodeId, resolvedNodeById] =
    await Promise.all([
      getHealthCanadaMonographCoverage(client, resolvedNodeIds),
      getCpsMonographCoverage(client, resolvedNodeIds),
      getKgNodesById(client, resolvedNodeIds),
    ]);
  const [evidenceByCandidateId, monographEvidenceByCandidateId] =
    await Promise.all([
      getCandidateEvidence(
        client,
        candidates.map((candidate) => candidate.id),
      ),
      getCandidateMonographEvidence(
        client,
        candidates.map((candidate) => candidate.id),
      ),
    ]);

  return candidates.map((candidate) => ({
    ...candidate,
    candidateEvidence: evidenceByCandidateId.get(candidate.id) ?? [],
    monographEvidence: monographEvidenceByCandidateId.get(candidate.id) ?? [],
    resolvedSourceNode: candidate.resolvedSourceId
      ? (resolvedNodeById.get(candidate.resolvedSourceId) ?? null)
      : null,
    resolvedTargetNode: candidate.resolvedTargetId
      ? (resolvedNodeById.get(candidate.resolvedTargetId) ?? null)
      : null,
    sourceCpsMonographCoverage: candidate.resolvedSourceId
      ? (cpsCoverageByNodeId.get(candidate.resolvedSourceId) ?? null)
      : null,
    targetCpsMonographCoverage: candidate.resolvedTargetId
      ? (cpsCoverageByNodeId.get(candidate.resolvedTargetId) ?? null)
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
  const [coverageByNodeId, cpsCoverageByNodeId, resolvedNodeById] =
    await Promise.all([
    getHealthCanadaMonographCoverage(client, resolvedNodeIds),
    getCpsMonographCoverage(client, resolvedNodeIds),
    getKgNodesById(client, resolvedNodeIds),
  ]);
  const [evidenceByCandidateId, monographEvidenceByCandidateId] =
    await Promise.all([
      getCandidateEvidence(
        client,
        candidates.map((candidate) => candidate.id),
      ),
      getCandidateMonographEvidence(
        client,
        candidates.map((candidate) => candidate.id),
      ),
    ]);

  return candidates.map((candidate) => ({
    ...candidate,
    candidateEvidence: evidenceByCandidateId.get(candidate.id) ?? [],
    monographEvidence: monographEvidenceByCandidateId.get(candidate.id) ?? [],
    resolvedSourceNode: candidate.resolvedSourceId
      ? (resolvedNodeById.get(candidate.resolvedSourceId) ?? null)
      : null,
    resolvedTargetNode: candidate.resolvedTargetId
      ? (resolvedNodeById.get(candidate.resolvedTargetId) ?? null)
      : null,
    sourceCpsMonographCoverage: candidate.resolvedSourceId
      ? (cpsCoverageByNodeId.get(candidate.resolvedSourceId) ?? null)
      : null,
    targetCpsMonographCoverage: candidate.resolvedTargetId
      ? (cpsCoverageByNodeId.get(candidate.resolvedTargetId) ?? null)
      : null,
    sourceMonographCoverage: candidate.resolvedSourceId
      ? (coverageByNodeId.get(candidate.resolvedSourceId) ?? null)
      : null,
    targetMonographCoverage: candidate.resolvedTargetId
      ? (coverageByNodeId.get(candidate.resolvedTargetId) ?? null)
      : null,
  }));
}

export async function listPubMedEvaluationSets(
  client: SupabaseClient,
  options: {
    includeLocked?: boolean;
    limit?: number;
    purpose?: PubMedEvaluationSetPurpose | "all";
  } = {},
): Promise<PubMedEvaluationSet[]> {
  let query = client
    .from("pubmed_evaluation_set")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 20);

  if (options.purpose && options.purpose !== "all") {
    query = query.eq("purpose", options.purpose);
  }

  if (!options.includeLocked) {
    query = query.eq("is_locked", false);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return ((data ?? []) as PubMedEvaluationSetRow[]).map(mapEvaluationSetRow);
}

export async function getPubMedEvaluationSetCandidates(
  client: SupabaseClient,
  setId: string,
): Promise<PubMedEvaluationSetBundle | null> {
  const [{ data: setData, error: setError }, { data: memberData, error: memberError }] =
    await Promise.all([
      client.from("pubmed_evaluation_set").select("*").eq("id", setId).maybeSingle(),
      client
        .from("pubmed_evaluation_set_candidate")
        .select("*")
        .eq("set_id", setId)
        .order("created_at", { ascending: true }),
    ]);

  if (setError) {
    throw setError;
  }

  if (memberError) {
    throw memberError;
  }

  if (!setData) {
    return null;
  }

  const members = ((memberData ?? []) as PubMedEvaluationSetCandidateRow[]).map(
    mapEvaluationSetCandidateRow,
  );
  const candidates = await listPubMedInteractionCandidatesByIds(
    client,
    members.map((member) => member.candidateId),
  );
  const candidatesById = new Map(
    candidates.map((candidate) => [candidate.id, candidate]),
  );

  return {
    candidates: members.flatMap((member) => {
      const candidate = candidatesById.get(member.candidateId);

      return candidate
        ? [{ candidate, evaluationSetCandidate: member }]
        : [];
    }),
    set: mapEvaluationSetRow(setData as PubMedEvaluationSetRow),
  };
}

export async function getPubMedEvaluationMetrics(
  client: SupabaseClient,
): Promise<PubMedEvaluationMetricsReport> {
  const [automation, labels, failureModes] = await Promise.all([
    client.from("pubmed_candidate_automation_metrics").select("*"),
    client.from("pubmed_calibration_label_metrics").select("*"),
    client.from("pubmed_calibration_failure_mode_metrics").select("*"),
  ]);

  if (automation.error) {
    throw automation.error;
  }

  if (labels.error) {
    throw labels.error;
  }

  if (failureModes.error) {
    throw failureModes.error;
  }

  return {
    automationMetrics: (
      (automation.data ?? []) as PubMedCandidateAutomationMetricRow[]
    ).map((row) => ({
      aiDecision: row.ai_decision as PubMedEvaluationMetricsReport["automationMetrics"][number]["aiDecision"],
      aiReviewVerdict:
        row.ai_review_verdict as PubMedEvaluationMetricsReport["automationMetrics"][number]["aiReviewVerdict"],
      automationTier:
        row.automation_tier as PubMedEvaluationMetricsReport["automationMetrics"][number]["automationTier"],
      averageAiReviewScore: row.average_ai_review_score,
      candidateCount: row.candidate_count,
      fullTextEvidenceCount: row.full_text_evidence_count,
      fullyResolvedCount: row.fully_resolved_count,
      monographEvidenceCount: row.monograph_evidence_count,
      unresolvedCount: row.unresolved_count,
    })),
    calibrationLabelMetrics: (
      (labels.data ?? []) as PubMedCalibrationLabelMetricRow[]
    ).map((row) => ({
      aiDecision: row.ai_decision as PubMedEvaluationMetricsReport["calibrationLabelMetrics"][number]["aiDecision"],
      automationTier:
        row.automation_tier as PubMedEvaluationMetricsReport["calibrationLabelMetrics"][number]["automationTier"],
      averageAiReviewScore: row.average_ai_review_score,
      exactLabelMatchCount: row.exact_label_match_count,
      humanLabel:
        row.human_label as PubMedEvaluationMetricsReport["calibrationLabelMetrics"][number]["humanLabel"],
      labelDisagreementCount: row.label_disagreement_count,
      labelPurpose: row.label_purpose,
      reviewCount: row.review_count,
    })),
    failureModeMetrics: (
      (failureModes.data ?? []) as PubMedCalibrationFailureModeMetricRow[]
    ).map((row) => ({
      failureMode:
        row.failure_mode as PubMedEvaluationMetricsReport["failureModeMetrics"][number]["failureMode"],
      labelPurpose: row.label_purpose,
      reviewCount: row.review_count,
    })),
  };
}

export async function listPubMedCalibrationReviews(
  client: SupabaseClient,
  setId: string,
): Promise<PubMedCalibrationReview[]> {
  const { data, error } = await client
    .from("pubmed_calibration_review")
    .select("*")
    .eq("set_id", setId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }

  return ((data ?? []) as PubMedCalibrationReviewRow[]).map(
    mapCalibrationReviewRow,
  );
}

export async function upsertPubMedCalibrationReview(
  client: SupabaseClient,
  review: PubMedCalibrationReviewInput,
): Promise<PubMedCalibrationReview> {
  const { data, error } = await client
    .from("pubmed_calibration_review")
    .upsert(
      {
        candidate_id: review.candidateId,
        ai_interpretation_assessment:
          review.aiInterpretationAssessment ?? null,
        automation_safety_assessment:
          review.automationSafetyAssessment ?? null,
        decision: review.decision ?? null,
        drug_pair_assessment: review.drugPairAssessment ?? null,
        evidence_retrieval_assessment:
          review.evidenceRetrievalAssessment ?? null,
        failure_modes: review.failureModes ?? [],
        generalization_assessment:
          review.generalizationAssessment ?? null,
        human_label: review.humanLabel ?? null,
        interaction_assessment: review.interactionAssessment ?? null,
        label_purpose: review.labelPurpose ?? null,
        missing_context: review.missingContext,
        notes: review.notes,
        resolution_assessment: review.resolutionAssessment ?? null,
        reviewer_id: review.reviewerId ?? null,
        reviewer_key: review.reviewerKey,
        set_id: review.setId,
        severity_management_assessment:
          review.severityManagementAssessment ?? null,
        suggested_prevention: review.suggestedPrevention ?? null,
        time_bucket: review.timeBucket ?? null,
      },
      {
        onConflict: "set_id,candidate_id,reviewer_key",
      },
    )
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return mapCalibrationReviewRow(data as PubMedCalibrationReviewRow);
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

export async function getCpsMonographCoverage(
  client: SupabaseClient,
  nodeIds: string[],
): Promise<Map<string, CpsMonographCoverage>> {
  const uniqueNodeIds = [...new Set(nodeIds)];
  const coverageByNodeId = new Map<string, CpsMonographCoverage>();

  if (!uniqueNodeIds.length) {
    return coverageByNodeId;
  }

  for (let index = 0; index < uniqueNodeIds.length; index += cpsCoverageBatchSize) {
    const { data, error } = await client.rpc("get_cps_monograph_coverage", {
      node_ids: uniqueNodeIds.slice(index, index + cpsCoverageBatchSize),
    });

    if (error) {
      throw error;
    }

    for (const row of (data ?? []) as CpsMonographCoverageRow[]) {
      coverageByNodeId.set(row.node_id, {
        directMonographCount: row.direct_monograph_count,
        linkedMonographCount: row.linked_monograph_count,
        monographExamples: normalizeCpsMonographExamples(
          row.monograph_examples,
        ),
        productListingCount: row.product_listing_count,
        totalChunkCount: row.total_chunk_count,
      });
    }
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
    .select("id,type,canonical_name,identifiers,uncertainty,summary,source,created_at")
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
      "synonym,kg_node:node_id(id,type,canonical_name,identifiers,uncertainty,summary,source,created_at)",
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
    .select("id,type,canonical_name,identifiers,uncertainty,summary,source,created_at")
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
  const interactionActionCategory =
    row.interaction_action_category ??
    row.ai_review?.actionCategory ??
    inferActionCategoryFromSeverity(row.severity);
  const aiDecisionTrace =
    row.ai_decision_trace ?? row.ai_review?.decisionTrace ?? null;
  const aiReview = row.ai_review
    ? {
        ...row.ai_review,
        actionCategory:
          row.ai_review.actionCategory ?? interactionActionCategory,
        decisionTrace: row.ai_review.decisionTrace ?? aiDecisionTrace,
      }
    : null;

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
    aiDecisionTrace,
    aiReview,
    aiReviewModel: row.ai_review_model,
    aiReviewRecommendedRejectionReason:
      row.ai_review_recommended_rejection_reason,
    aiReviewScore: row.ai_review_score,
    aiReviewVerdict: row.ai_review_verdict,
    aiReviewedAt: row.ai_reviewed_at,
    aiDecision: row.ai_decision ?? null,
    automationMetadata: row.automation_metadata ?? {},
    automationReason: row.automation_reason,
    automationTier: row.automation_tier ?? null,
    kgUncertainty: row.kg_uncertainty ?? {},
    applicability: row.applicability ?? {},
    evidenceSummary: row.evidence_summary ?? {},
    fullTextEvidenceCount: row.full_text_evidence_count ?? 0,
    fullTextProcessed: row.full_text_processed ?? false,
    interactionActionCategory,
    rejectionFeedback: row.rejection_feedback,
    rejectionReason: row.rejection_reason,
    reviewerNotes: row.reviewer_notes,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    pipelineVersions: row.pipeline_versions ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function inferActionCategoryFromSeverity(
  severity: PubMedInteractionCandidate["severity"],
): NonNullable<PubMedInteractionCandidate["interactionActionCategory"]> {
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

function mapCalibrationReviewRow(
  row: PubMedCalibrationReviewRow,
): PubMedCalibrationReview {
  return {
    aiInterpretationAssessment: row.ai_interpretation_assessment ?? null,
    automationSafetyAssessment: row.automation_safety_assessment ?? null,
    candidateId: row.candidate_id,
    createdAt: row.created_at,
    decision: row.decision ?? null,
    drugPairAssessment: row.drug_pair_assessment ?? null,
    evidenceRetrievalAssessment: row.evidence_retrieval_assessment ?? null,
    failureModes: row.failure_modes ?? [],
    generalizationAssessment: row.generalization_assessment ?? null,
    humanLabel: row.human_label ?? null,
    id: row.id,
    interactionAssessment: row.interaction_assessment ?? null,
    labelPurpose: row.label_purpose ?? null,
    missingContext: row.missing_context ?? [],
    notes: row.notes,
    resolutionAssessment: row.resolution_assessment ?? null,
    reviewerId: row.reviewer_id,
    reviewerKey: row.reviewer_key,
    setId: row.set_id,
    severityManagementAssessment:
      row.severity_management_assessment ?? null,
    suggestedPrevention: row.suggested_prevention,
    timeBucket: row.time_bucket ?? null,
    updatedAt: row.updated_at,
  };
}

function mapEvaluationSetRow(row: PubMedEvaluationSetRow): PubMedEvaluationSet {
  return {
    createdAt: row.created_at,
    createdBy: row.created_by,
    criteria: row.criteria ?? {},
    description: row.description,
    id: row.id,
    isLocked: row.is_locked,
    name: row.name,
    purpose: row.purpose,
    updatedAt: row.updated_at,
    version: row.version,
  };
}

function mapEvaluationSetCandidateRow(
  row: PubMedEvaluationSetCandidateRow,
): PubMedEvaluationSetCandidate {
  return {
    addedBy: row.added_by,
    candidateId: row.candidate_id,
    createdAt: row.created_at,
    expectedLabel: row.expected_label ?? {},
    labelPurpose: row.label_purpose,
    metadata: row.metadata ?? {},
    samplingReason: row.sampling_reason,
    setId: row.set_id,
  };
}

async function getCandidateEvidence(
  client: SupabaseClient,
  candidateIds: string[],
): Promise<Map<string, NonNullable<PubMedInteractionCandidate["candidateEvidence"]>>> {
  const uniqueCandidateIds = [...new Set(candidateIds)];
  const evidenceByCandidateId = new Map<
    string,
    NonNullable<PubMedInteractionCandidate["candidateEvidence"]>
  >();

  if (!uniqueCandidateIds.length) {
    return evidenceByCandidateId;
  }

  const { data, error } = await client
    .from("pubmed_candidate_evidence")
    .select(
      "candidate_id,support_type,quote,confidence,pubmed_evidence_chunk:evidence_chunk_id(id,pmid,pmcid,source_type,section_title,section_path,label,content,structured_content,relevance_score,extraction_confidence,license,source_url,created_at)",
    )
    .in("candidate_id", uniqueCandidateIds);

  if (error) {
    if (error.code === "42501" || /permission denied/i.test(error.message)) {
      return evidenceByCandidateId;
    }

    throw error;
  }

  for (const row of (data ?? []) as PubMedCandidateEvidenceRow[]) {
    const chunk = Array.isArray(row.pubmed_evidence_chunk)
      ? row.pubmed_evidence_chunk[0]
      : row.pubmed_evidence_chunk;

    if (!chunk) {
      continue;
    }

    const candidateEvidence = evidenceByCandidateId.get(row.candidate_id) ?? [];
    candidateEvidence.push({
      chunk: {
        content: chunk.content,
        createdAt: chunk.created_at,
        extractionConfidence: chunk.extraction_confidence,
        id: chunk.id,
        label: chunk.label,
        license: chunk.license,
        pmcid: chunk.pmcid,
        pmid: chunk.pmid,
        relevanceScore: chunk.relevance_score,
        sectionPath: chunk.section_path ?? [],
        sectionTitle: chunk.section_title,
        sourceType: chunk.source_type,
        sourceUrl: chunk.source_url,
        structuredContent: chunk.structured_content ?? {},
      },
      confidence: row.confidence,
      quote: row.quote,
      supportType: row.support_type,
    });
    evidenceByCandidateId.set(row.candidate_id, candidateEvidence);
  }

  for (const candidateEvidence of evidenceByCandidateId.values()) {
    candidateEvidence.sort(
      (left, right) =>
        supportTypeRank(left.supportType) - supportTypeRank(right.supportType) ||
        (right.confidence ?? 0) - (left.confidence ?? 0),
    );
  }

  return evidenceByCandidateId;
}

async function getCandidateMonographEvidence(
  client: SupabaseClient,
  candidateIds: string[],
): Promise<
  Map<string, NonNullable<PubMedInteractionCandidate["monographEvidence"]>>
> {
  const uniqueCandidateIds = [...new Set(candidateIds)];
  const evidenceByCandidateId = new Map<
    string,
    NonNullable<PubMedInteractionCandidate["monographEvidence"]>
  >();

  if (!uniqueCandidateIds.length) {
    return evidenceByCandidateId;
  }

  const { data, error } = await client
    .from("pubmed_candidate_monograph_evidence")
    .select("*")
    .in("candidate_id", uniqueCandidateIds);

  if (error) {
    if (error.code === "42501" || /permission denied/i.test(error.message)) {
      return evidenceByCandidateId;
    }

    throw error;
  }

  const rows = (data ?? []) as PubMedCandidateMonographEvidenceRow[];
  const chunksById = await getKgChunksById(
    client,
    rows.map((row) => row.kg_chunk_id),
  );
  const nodesById = await getKgNodesById(
    client,
    [...new Set([...chunksById.values()].map((chunk) => chunk.node_id))],
  );

  for (const row of rows) {
    const chunk = chunksById.get(row.kg_chunk_id);

    if (!chunk) {
      continue;
    }

    const node = nodesById.get(chunk.node_id);
    const candidateEvidence =
      evidenceByCandidateId.get(row.candidate_id) ?? [];

    candidateEvidence.push({
      chunkId: chunk.id,
      confidence: row.confidence,
      content: chunk.content,
      extractedFacts: row.extracted_facts ?? {},
      nodeId: chunk.node_id,
      nodeIdentifiers: node?.identifiers ?? {},
      nodeName: node?.canonicalName ?? null,
      nodeSource: node?.source ?? null,
      quote: row.quote,
      section: row.section ?? chunk.section,
      side: row.side,
      sourceKind: row.source_kind,
      supportType: row.support_type,
    });
    evidenceByCandidateId.set(row.candidate_id, candidateEvidence);
  }

  for (const candidateEvidence of evidenceByCandidateId.values()) {
    candidateEvidence.sort(
      (left, right) =>
        sideRank(left.side) - sideRank(right.side) ||
        monographSourceRank(left.sourceKind) -
          monographSourceRank(right.sourceKind) ||
        supportTypeRank(left.supportType) - supportTypeRank(right.supportType) ||
        (right.confidence ?? 0) - (left.confidence ?? 0),
    );
  }

  return evidenceByCandidateId;
}

async function getKgChunksById(
  client: SupabaseClient,
  chunkIds: string[],
): Promise<Map<string, KgChunkEvidenceRow>> {
  const uniqueChunkIds = [...new Set(chunkIds)];
  const chunksById = new Map<string, KgChunkEvidenceRow>();

  if (!uniqueChunkIds.length) {
    return chunksById;
  }

  const { data, error } = await client
    .from("kg_chunk")
    .select("id,node_id,section,content,source")
    .in("id", uniqueChunkIds);

  if (error) {
    throw error;
  }

  for (const row of (data ?? []) as KgChunkEvidenceRow[]) {
    chunksById.set(row.id, row);
  }

  return chunksById;
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

  if (options.aiDecision && options.aiDecision !== "all") {
    query = query.eq("ai_decision", options.aiDecision);
  }

  if (options.automationTier && options.automationTier !== "all") {
    query = query.eq("automation_tier", options.automationTier);
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

function supportTypeRank(
  supportType:
    | NonNullable<
        PubMedInteractionCandidate["candidateEvidence"]
      >[number]["supportType"]
    | NonNullable<
        PubMedInteractionCandidate["monographEvidence"]
      >[number]["supportType"],
): number {
  switch (supportType) {
    case "supports_interaction":
      return 0;
    case "supports_management":
      return 1;
    case "supports_severity":
      return 2;
    case "supports_mechanism":
      return 3;
    case "contradicts_or_limits":
      return 4;
    case "source_silent":
      return 5;
    default:
      return 6;
  }
}

function sideRank(
  side: NonNullable<
    PubMedInteractionCandidate["monographEvidence"]
  >[number]["side"],
): number {
  switch (side) {
    case "source":
      return 0;
    case "target":
      return 1;
    case "shared":
      return 2;
    default:
      return 3;
  }
}

function monographSourceRank(
  sourceKind: NonNullable<
    PubMedInteractionCandidate["monographEvidence"]
  >[number]["sourceKind"],
): number {
  switch (sourceKind) {
    case "cps_monograph":
      return 0;
    case "health_canada_product_monograph":
      return 1;
    default:
      return 2;
  }
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
    uncertainty: row.uncertainty ?? {},
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

function normalizeCpsMonographExamples(value: unknown): CpsMonographExample[] {
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
    const cpsId = typeof record.cpsId === "string" ? record.cpsId : null;
    const matchKind =
      record.matchKind === "direct" || record.matchKind === "linked"
        ? record.matchKind
        : null;
    const name = typeof record.name === "string" ? record.name : null;
    const nodeId = typeof record.nodeId === "string" ? record.nodeId : null;

    if (!cpsId || !matchKind || !name || !nodeId) {
      return [];
    }

    return {
      chunkCount,
      cpsId,
      matchKind,
      name,
      nodeId,
      productNames: normalizeStringArray(record.productNames) ?? [],
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
