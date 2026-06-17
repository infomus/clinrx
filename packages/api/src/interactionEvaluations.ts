import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  InteractionEvaluationEvidence,
  InteractionEvaluationLabel,
  InteractionEvaluationLabelInput,
  InteractionEvaluationPurpose,
  InteractionEvaluationRequest,
  InteractionEvaluationRequestWithRun,
  InteractionEvaluationRun,
  InteractionEvaluationRunWithEvidence,
  InteractionEvaluationSet,
  InteractionEvaluationSetBundle,
  KgNode,
  KgNodeType,
} from "@clinrx/types";

interface InteractionEvaluationSetRow {
  created_at: string;
  created_by: string | null;
  criteria: Record<string, unknown>;
  description: string;
  id: string;
  is_locked: boolean;
  name: string;
  purpose: InteractionEvaluationPurpose;
  updated_at: string;
  version: number;
}

interface InteractionEvaluationRequestRow {
  created_at: string;
  expected_category: InteractionEvaluationRequest["expectedCategory"];
  id: string;
  input_source_text: string;
  input_target_text: string;
  metadata: Record<string, unknown>;
  request_fingerprint?: string | null;
  sampling_reason: InteractionEvaluationRequest["samplingReason"];
  set_id: string;
  source_candidate_id: string | null;
  updated_at: string;
}

interface InteractionEvaluationRunRow {
  answer_category: InteractionEvaluationRun["answerCategory"];
  answer_summary: string | null;
  automation_tier: InteractionEvaluationRun["automationTier"];
  confidence: number | null;
  created_at: string;
  decision_trace: InteractionEvaluationRun["decisionTrace"];
  id: string;
  management: string | null;
  metadata: Record<string, unknown>;
  model: string | null;
  prompt_version: string | null;
  request_id: string;
  resolved_entities: Record<string, unknown>;
  resolved_source_id: string | null;
  resolved_target_id: string | null;
  retrieval_strategy_version: string;
  run_version: number;
  severity: InteractionEvaluationRun["severity"];
  status: InteractionEvaluationRun["status"];
}

interface InteractionEvaluationEvidenceRow {
  chunk_id: string | null;
  content: string;
  created_at: string;
  id: string;
  metadata: Record<string, unknown>;
  quote: string | null;
  rank: number;
  run_id: string;
  source_id: string | null;
  source_kind: InteractionEvaluationEvidence["sourceKind"];
  source_table: string | null;
  support_type: InteractionEvaluationEvidence["supportType"];
  used_in_answer: boolean;
}

interface InteractionEvaluationLabelRow {
  ai_interpretation_assessment: InteractionEvaluationLabel["aiInterpretationAssessment"];
  automation_safety_assessment: InteractionEvaluationLabel["automationSafetyAssessment"];
  created_at: string;
  entity_resolution_assessment: InteractionEvaluationLabel["entityResolutionAssessment"];
  evidence_retrieval_assessment: InteractionEvaluationLabel["evidenceRetrievalAssessment"];
  failure_modes: InteractionEvaluationLabel["failureModes"];
  final_category: InteractionEvaluationLabel["finalCategory"];
  generalization_assessment: InteractionEvaluationLabel["generalizationAssessment"];
  id: string;
  management_assessment: InteractionEvaluationLabel["managementAssessment"];
  missing_context: InteractionEvaluationLabel["missingContext"];
  notes: string;
  request_id: string;
  reviewer_id: string | null;
  reviewer_key: string;
  run_id: string | null;
  set_id: string;
  suggested_prevention: string | null;
  updated_at: string;
}

interface KgNodeRow {
  canonical_name: string;
  created_at: string;
  id: string;
  identifiers: Record<string, unknown>;
  source: string;
  summary: string | null;
  type: KgNodeType;
  uncertainty: Record<string, unknown>;
}

export async function listInteractionEvaluationSets(
  client: SupabaseClient,
  options: {
    includeLocked?: boolean;
    limit?: number;
    purpose?: InteractionEvaluationPurpose | "all";
  } = {},
): Promise<InteractionEvaluationSet[]> {
  let query = client
    .from("interaction_evaluation_set")
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

  return ((data ?? []) as InteractionEvaluationSetRow[]).map(
    mapInteractionEvaluationSetRow,
  );
}

export async function getInteractionEvaluationSetRequests(
  client: SupabaseClient,
  setId: string,
): Promise<InteractionEvaluationSetBundle | null> {
  const [setResult, requestResult] = await Promise.all([
    client
      .from("interaction_evaluation_set")
      .select("*")
      .eq("id", setId)
      .maybeSingle(),
    client
      .from("interaction_evaluation_request")
      .select("*")
      .eq("set_id", setId)
      .order("created_at", { ascending: true }),
  ]);

  if (setResult.error) {
    throw setResult.error;
  }
  if (requestResult.error) {
    throw requestResult.error;
  }
  if (!setResult.data) {
    return null;
  }

  const requests = ((requestResult.data ?? []) as InteractionEvaluationRequestRow[])
    .map(mapInteractionEvaluationRequestRow);
  const runsByRequestId = await getComparableRunsByRequestId(
    client,
    requests.map((request) => request.id),
  );
  const runs = [...runsByRequestId.values()].flat();
  const [evidenceByRunId, labels, nodeById] = await Promise.all([
    getEvidenceByRunId(
      client,
      runs.map((run) => run.id),
    ),
    listInteractionEvaluationLabels(client, setId),
    getKgNodesById(
      client,
      runs.flatMap((run) =>
        [run.resolvedSourceId, run.resolvedTargetId].filter(
          (nodeId): nodeId is string => Boolean(nodeId),
        ),
      ),
    ),
  ]);
  const labelsByRequestId = new Map<string, InteractionEvaluationLabel[]>();
  const labelsByRunId = new Map<string, InteractionEvaluationLabel[]>();

  for (const label of labels) {
    const requestLabels = labelsByRequestId.get(label.requestId) ?? [];
    requestLabels.push(label);
    labelsByRequestId.set(label.requestId, requestLabels);

    if (label.runId) {
      const runLabels = labelsByRunId.get(label.runId) ?? [];
      runLabels.push(label);
      labelsByRunId.set(label.runId, runLabels);
    }
  }

  return {
    requests: requests.map((request): InteractionEvaluationRequestWithRun => {
      const requestRuns = runsByRequestId.get(request.id) ?? [];
      const hydratedRuns = requestRuns.map((run): InteractionEvaluationRun => ({
        ...run,
        resolvedSourceNode: run.resolvedSourceId
          ? (nodeById.get(run.resolvedSourceId) ?? null)
          : null,
        resolvedTargetNode: run.resolvedTargetId
          ? (nodeById.get(run.resolvedTargetId) ?? null)
          : null,
      }));
      const run = hydratedRuns[0] ?? null;
      const runItems = hydratedRuns.map((
        run,
      ): InteractionEvaluationRunWithEvidence => ({
        evidence: evidenceByRunId.get(run.id) ?? [],
        labels: labelsByRunId.get(run.id) ?? [],
        run,
      }));

      return {
        evidence: run ? (evidenceByRunId.get(run.id) ?? []) : [],
        labels: labelsByRequestId.get(request.id) ?? [],
        request,
        run,
        runs: runItems,
      };
    }),
    set: mapInteractionEvaluationSetRow(
      setResult.data as InteractionEvaluationSetRow,
    ),
  };
}

export async function listInteractionEvaluationLabels(
  client: SupabaseClient,
  setId: string,
): Promise<InteractionEvaluationLabel[]> {
  const { data, error } = await client
    .from("interaction_evaluation_label")
    .select("*")
    .eq("set_id", setId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }

  return ((data ?? []) as InteractionEvaluationLabelRow[]).map(
    mapInteractionEvaluationLabelRow,
  );
}

export async function upsertInteractionEvaluationLabel(
  client: SupabaseClient,
  label: InteractionEvaluationLabelInput,
): Promise<InteractionEvaluationLabel> {
  const { data, error } = await client
    .from("interaction_evaluation_label")
    .upsert(
      {
        ai_interpretation_assessment: label.aiInterpretationAssessment ?? null,
        automation_safety_assessment:
          label.automationSafetyAssessment ?? null,
        entity_resolution_assessment:
          label.entityResolutionAssessment ?? null,
        evidence_retrieval_assessment:
          label.evidenceRetrievalAssessment ?? null,
        failure_modes: label.failureModes ?? [],
        final_category: label.finalCategory ?? null,
        generalization_assessment: label.generalizationAssessment ?? null,
        management_assessment: label.managementAssessment ?? null,
        missing_context: label.missingContext ?? [],
        notes: label.notes,
        request_id: label.requestId,
        reviewer_id: label.reviewerId ?? null,
        reviewer_key: label.reviewerKey,
        run_id: label.runId ?? null,
        set_id: label.setId,
        suggested_prevention: label.suggestedPrevention ?? null,
      },
      {
        onConflict: "set_id,request_id,run_id,reviewer_key",
      },
    )
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return mapInteractionEvaluationLabelRow(data as InteractionEvaluationLabelRow);
}

async function getComparableRunsByRequestId(
  client: SupabaseClient,
  requestIds: string[],
): Promise<Map<string, InteractionEvaluationRun[]>> {
  const runsByRequestId = new Map<string, InteractionEvaluationRun[]>();
  const seenKeysByRequestId = new Map<string, Set<string>>();

  if (!requestIds.length) {
    return runsByRequestId;
  }

  const { data, error } = await client
    .from("interaction_evaluation_run")
    .select("*")
    .in("request_id", requestIds)
    .order("run_version", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  for (const row of (data ?? []) as InteractionEvaluationRunRow[]) {
    const seenKeys = seenKeysByRequestId.get(row.request_id) ?? new Set<string>();
    const modelKey = getRunComparisonKey(row);

    if (seenKeys.has(modelKey)) {
      continue;
    }

    seenKeys.add(modelKey);
    seenKeysByRequestId.set(row.request_id, seenKeys);
    runsByRequestId.set(row.request_id, [
      ...(runsByRequestId.get(row.request_id) ?? []),
      mapInteractionEvaluationRunRow(row),
    ]);
  }

  for (const [requestId, runs] of runsByRequestId.entries()) {
    runsByRequestId.set(requestId, [...runs].sort(compareEvaluationRuns));
  }

  return runsByRequestId;
}

function getRunComparisonKey(row: InteractionEvaluationRunRow): string {
  // Keyed on model + retrieval strategy only (not prompt_version) so each matrix
  // cell shows the single latest run for that model/strategy. Including
  // prompt_version would surface superseded prompt revisions (e.g. v3 alongside
  // v4) as duplicate answers in the reviewer matrix.
  return [
    row.model ?? "unknown-model",
    row.retrieval_strategy_version,
  ].join(":");
}

function compareEvaluationRuns(
  left: InteractionEvaluationRun,
  right: InteractionEvaluationRun,
): number {
  return strategySortRank(left.retrievalStrategyVersion) -
      strategySortRank(right.retrievalStrategyVersion) ||
    modelSortRank(left.model) - modelSortRank(right.model) ||
    right.runVersion - left.runVersion;
}

function strategySortRank(strategy?: string | null): number {
  switch (strategy) {
    case "monograph_direct_top8":
      return 0;
    case "monograph_direct_plus_pubmed_top10":
    case "indexed-monograph-pubmed-runtime-v1":
      return 1;
    case "monograph_plus_safety_top12":
      return 2;
    case "ingredient_product_class_guarded_top12":
      return 3;
    case "published-kg-runtime-v1":
      return 4;
    default:
      return 5;
  }
}

function modelSortRank(model?: string | null): number {
  switch (model) {
    case "claude-opus-4-8":
      return 0;
    case "claude-sonnet-4-6":
      return 1;
    case "claude-haiku-4-5-20251001":
    case "claude-haiku-4-5":
      return 2;
    case "gpt-5.5":
      return 3;
    case "gpt-5.4-mini":
      return 4;
    case "deterministic-published-kg-lookup":
      return 5;
    default:
      return 6;
  }
}

async function getEvidenceByRunId(
  client: SupabaseClient,
  runIds: string[],
): Promise<Map<string, InteractionEvaluationEvidence[]>> {
  const evidenceByRunId = new Map<string, InteractionEvaluationEvidence[]>();

  if (!runIds.length) {
    return evidenceByRunId;
  }

  const { data, error } = await client
    .from("interaction_evaluation_evidence")
    .select("*")
    .in("run_id", runIds)
    .order("rank", { ascending: true });

  if (error) {
    throw error;
  }

  for (const row of (data ?? []) as InteractionEvaluationEvidenceRow[]) {
    const evidence = evidenceByRunId.get(row.run_id) ?? [];
    evidence.push(mapInteractionEvaluationEvidenceRow(row));
    evidenceByRunId.set(row.run_id, evidence);
  }

  return evidenceByRunId;
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

  for (const row of (data ?? []) as KgNodeRow[]) {
    nodesById.set(row.id, {
      canonicalName: row.canonical_name,
      createdAt: row.created_at,
      id: row.id,
      identifiers: row.identifiers ?? {},
      source: row.source,
      summary: row.summary,
      type: row.type,
      uncertainty: row.uncertainty ?? {},
    });
  }

  return nodesById;
}

function mapInteractionEvaluationSetRow(
  row: InteractionEvaluationSetRow,
): InteractionEvaluationSet {
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

function mapInteractionEvaluationRequestRow(
  row: InteractionEvaluationRequestRow,
): InteractionEvaluationRequest {
  return {
    createdAt: row.created_at,
    expectedCategory: row.expected_category ?? null,
    id: row.id,
    inputSourceText: row.input_source_text,
    inputTargetText: row.input_target_text,
    metadata: row.metadata ?? {},
    requestFingerprint: row.request_fingerprint ?? null,
    samplingReason: row.sampling_reason,
    setId: row.set_id,
    sourceCandidateId: row.source_candidate_id,
    updatedAt: row.updated_at,
  };
}

function mapInteractionEvaluationRunRow(
  row: InteractionEvaluationRunRow,
): InteractionEvaluationRun {
  return {
    answerCategory: row.answer_category ?? null,
    answerSummary: row.answer_summary,
    automationTier: row.automation_tier ?? null,
    confidence: row.confidence,
    createdAt: row.created_at,
    decisionTrace: row.decision_trace ?? {},
    id: row.id,
    management: row.management,
    metadata: row.metadata ?? {},
    model: row.model,
    promptVersion: row.prompt_version,
    requestId: row.request_id,
    resolvedEntities: row.resolved_entities ?? {},
    resolvedSourceId: row.resolved_source_id,
    resolvedTargetId: row.resolved_target_id,
    retrievalStrategyVersion: row.retrieval_strategy_version,
    runVersion: row.run_version,
    severity: row.severity ?? null,
    status: row.status,
  };
}

function mapInteractionEvaluationEvidenceRow(
  row: InteractionEvaluationEvidenceRow,
): InteractionEvaluationEvidence {
  return {
    chunkId: row.chunk_id,
    content: row.content,
    createdAt: row.created_at,
    id: row.id,
    metadata: row.metadata ?? {},
    quote: row.quote,
    rank: row.rank,
    runId: row.run_id,
    sourceId: row.source_id,
    sourceKind: row.source_kind,
    sourceTable: row.source_table,
    supportType: row.support_type,
    usedInAnswer: row.used_in_answer,
  };
}

function mapInteractionEvaluationLabelRow(
  row: InteractionEvaluationLabelRow,
): InteractionEvaluationLabel {
  return {
    aiInterpretationAssessment: row.ai_interpretation_assessment ?? null,
    automationSafetyAssessment: row.automation_safety_assessment ?? null,
    createdAt: row.created_at,
    entityResolutionAssessment: row.entity_resolution_assessment ?? null,
    evidenceRetrievalAssessment: row.evidence_retrieval_assessment ?? null,
    failureModes: row.failure_modes ?? [],
    finalCategory: row.final_category ?? null,
    generalizationAssessment: row.generalization_assessment ?? null,
    id: row.id,
    managementAssessment: row.management_assessment ?? null,
    missingContext: row.missing_context ?? [],
    notes: row.notes,
    requestId: row.request_id,
    reviewerId: row.reviewer_id,
    reviewerKey: row.reviewer_key,
    runId: row.run_id,
    setId: row.set_id,
    suggestedPrevention: row.suggested_prevention,
    updatedAt: row.updated_at,
  };
}
