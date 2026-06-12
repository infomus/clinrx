import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface CheckInteractionsRequest {
  aiCacheTtlSeconds?: unknown;
  aiInferenceMode?: unknown;
  captureEvaluation?: unknown;
  calibrationModelPanel?: unknown;
  calibrationModels?: unknown;
  evaluationCaptureMode?: unknown;
  evaluationSamplingReason?: unknown;
  evaluationSampleRate?: unknown;
  evaluationSetId?: unknown;
  evaluationSetName?: unknown;
  forceEvaluationCapture?: unknown;
  inputLabels?: unknown;
  nodeIds?: unknown;
  retrieveRuntimeEvidence?: unknown;
  resultCacheTtlSeconds?: unknown;
  useAiInference?: unknown;
  useResultCache?: unknown;
}

interface InteractionRpcRow {
  input_pair: string[];
  matched_via?: {
    leftNodeId?: string;
    rightNodeId?: string;
  };
  interaction: {
    actionCategory?: InteractionActionCategory;
    aiDecisionTrace?: unknown;
    citations?: unknown;
    evidenceLevel?: string | null;
    id: string;
    management?: string | null;
    mechanism?: string | null;
    severity?: InteractionSeverity | null;
    source?: string | null;
    sourceId?: string;
    targetId?: string;
  };
}

interface KgNodeRow {
  canonical_name: string;
  id: string;
  identifiers?: Record<string, unknown> | null;
  source: string;
  summary?: string | null;
  type: string;
}

interface KgEdgeRow {
  source_id: string;
  target_id: string;
}

interface KgChunkRow {
  content: string;
  id: string;
  node_id: string;
  section: string | null;
  source: string;
}

interface CrosswalkSourceBRow {
  source_b_node_id: string;
}

interface CrosswalkSourceARow {
  source_a_node_id: string;
}

interface RuntimeEvidenceRow {
  chunk_id: string | null;
  content: string;
  metadata: Record<string, unknown>;
  quote: string | null;
  rank: number;
  source_id: string | null;
  source_kind:
    | "cps_monograph"
    | "health_canada_product_monograph"
    | "pubmed"
    | "kg_edge"
    | "safety"
    | "nhp"
    | "other";
  source_table: string | null;
  support_type:
    | "supports_interaction"
    | "supports_mechanism"
    | "supports_severity"
    | "supports_management"
    | "contradicts_or_limits"
    | "source_silent"
    | "retrieved";
  used_in_answer: boolean;
}

interface PubMedCandidateRow {
  ai_decision?: string | null;
  ai_review_score?: number | null;
  article_title?: string | null;
  article_year?: number | null;
  automation_tier?: string | null;
  evidence_level?: string | null;
  extraction_confidence?: number | null;
  id: string;
  interaction_action_category?: string | null;
  management?: string | null;
  mechanism?: string | null;
  object_text: string;
  pmid: string;
  review_status: string;
  severity?: InteractionSeverity | null;
  source_quote?: string | null;
  subject_text: string;
}

interface PubMedEvidenceJoinRow {
  candidate_id: string;
  confidence?: number | null;
  pubmed_evidence_chunk:
    | PubMedEvidenceChunkRow
    | PubMedEvidenceChunkRow[]
    | null;
  quote?: string | null;
  support_type: RuntimeEvidenceRow["support_type"];
}

interface PubMedEvidenceChunkRow {
  content: string;
  extraction_confidence?: number | null;
  id: string;
  label?: string | null;
  license?: string | null;
  pmcid?: string | null;
  pmid: string;
  relevance_score?: number | null;
  section_path?: string[] | null;
  section_title?: string | null;
  source_type: string;
  source_url?: string | null;
  structured_content?: Record<string, unknown> | null;
}

interface PairCacheRow {
  pair_fingerprint: string;
  response: {
    interactions?: InteractionRpcRow[];
  };
}

interface CheckInteractionsResult {
  cache: {
    aiHitCount?: number;
    aiMissCount?: number;
    calibrationAiHitCount?: number;
    calibrationAiMissCount?: number;
    enabled: boolean;
    evidenceVersion?: string;
    graphVersion?: string;
    hitCount: number;
    missCount: number;
    pairCount: number;
  };
  evaluationInteractions?: InteractionRpcRow[];
  interactions: InteractionRpcRow[];
}

interface EvaluationCaptureResult {
  requestCount?: number;
  requestIds?: string[];
  runIds?: string[];
  setId?: string;
}

interface RuntimeAiAnswer {
  actionCategory: InteractionActionCategory;
  confidence: number;
  evidenceSupport: "direct" | "indirect" | "insufficient" | "conflicting";
  latencyMs?: number;
  management: string | null;
  mechanism: string | null;
  rationale: string;
  structuredOutputMethod?: RuntimeStructuredOutputMethod;
  structuredOutputRetryCount?: number;
  severity: InteractionSeverity;
  uncertainty: string[];
  usedEvidenceIds: string[];
}

interface RuntimeAiCacheRow {
  pair_fingerprint: string;
  response: {
    interactions?: InteractionRpcRow[];
  };
}

type InteractionActionCategory =
  | "no_known_interaction"
  | "no_action_needed"
  | "monitor_therapy"
  | "consider_therapy_modification"
  | "avoid_combination";

type InteractionSeverity =
  | "contraindicated"
  | "major"
  | "moderate"
  | "minor"
  | "unknown";

type RuntimeModelProvider = "anthropic" | "openai";

type RuntimeStructuredOutputMethod =
  | "anthropic_tool_use"
  | "anthropic_json_text"
  | "openai_json_schema";

interface RuntimeAiProviderKeys {
  anthropicApiKey?: string;
  openaiApiKey?: string;
}

const defaultEvaluationSetId = "interaction-runtime-live-calibration";
const defaultEvaluationSetName = "Live runtime checker calibration";
const defaultAiCacheTtlSeconds = 86400;
const defaultInteractionAiModel = "claude-opus-4-8";
const defaultCalibrationModelPanel = [
  "claude-opus-4-8",
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
  "gpt-5.5",
  "gpt-5.4-mini",
];
const defaultResultCacheTtlSeconds = 86400;
const interactionAiPromptVersion = "interaction-runtime-ai-v1";
const interactionAiRetrievalStrategyVersion = "indexed-monograph-pubmed-runtime-v1";
const enzymePattern =
  /\b(?:CYP\s*[-]?\s*\d[A-Z]?\d?|CYP\d[A-Z]\d|UGT\d[A-Z0-9]*|cytochrome\s+P450)\b/gi;
const transporterPattern =
  /\b(?:P[-\s]?gp|P[-\s]?glycoprotein|BCRP|OATP[0-9A-Z]*|OCT[0-9A-Z]*|MATE[0-9A-Z]*|MRP[0-9A-Z]*)\b/gi;
const receptorPattern =
  /\b(?:serotonin|dopamine|adrenergic|muscarinic|cholinergic|opioid|NMDA|GABA|histamine|estrogen|androgen|glucocorticoid)\s+receptors?\b/gi;
const managementSignalPatterns: Array<[string, RegExp]> = [
  ["avoid", /\bavoid(?:ance)?\b/i],
  ["contraindicated", /\bcontraindicat(?:ed|ion|ions)?\b/i],
  ["monitor", /\bmonitor(?:ing)?\b/i],
  ["dose_adjustment", /\bdose (?:adjust|adjustment|reduce|reduction|increase)\b/i],
  ["not_recommended", /\bnot recommended\b/i],
  ["caution", /\bcaution\b/i],
];
const runtimeAiAssessmentToolName = "record_interaction_assessment";

Deno.serve(async (request) => {
  const requestStartedAt = Date.now();

  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authorization = request.headers.get("Authorization");

  if (!authorization) {
    return jsonResponse({ error: "Missing Authorization header" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey =
    Deno.env.get("CLINRX_SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_SECRET");
  const providerKeys: RuntimeAiProviderKeys = {
    anthropicApiKey: Deno.env.get("ANTHROPIC_API_KEY") ?? undefined,
    openaiApiKey: Deno.env.get("OPENAI_API_KEY") ?? undefined,
  };
  const interactionAiModel =
    Deno.env.get("CLINRX_INTERACTION_AI_MODEL") ?? defaultInteractionAiModel;

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return jsonResponse({ error: "Server is not configured" }, 500);
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
  });

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const body = (await request.json()) as CheckInteractionsRequest;
  const nodeIds = Array.isArray(body.nodeIds) ? body.nodeIds : [];
  const inputLabels = parseInputLabels(body.inputLabels);

  if (
    nodeIds.length < 2 ||
    nodeIds.some((nodeId) => typeof nodeId !== "string")
  ) {
    return jsonResponse({ error: "nodeIds must contain at least two ids" }, 400);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  let checkResult: CheckInteractionsResult;

  try {
    checkResult = await checkInteractionsWithCache({
      aiCacheTtlSeconds: getOptionalNumber(body.aiCacheTtlSeconds) ??
        defaultAiCacheTtlSeconds,
      aiInferenceMode: getAiInferenceMode(body.aiInferenceMode),
      adminClient,
      calibrationModels: body.calibrationModelPanel === true
        ? getCalibrationModels(body.calibrationModels, interactionAiModel)
        : [],
      inputLabels,
      interactionAiModel,
      nodeIds: nodeIds as string[],
      providerKeys,
      retrieveRuntimeEvidence: body.retrieveRuntimeEvidence !== false,
      resultCacheTtlSeconds: getOptionalNumber(body.resultCacheTtlSeconds) ??
        defaultResultCacheTtlSeconds,
      useAiInference: body.useAiInference === true,
      useResultCache: body.useResultCache !== false,
    });
  } catch (checkError) {
    return jsonResponse(
      {
        error: checkError instanceof Error
          ? checkError.message
          : "Could not check interactions",
      },
      500,
    );
  }
  const lookupDurationMs = Date.now() - requestStartedAt;

  const interactions = checkResult.interactions;
  let evaluation:
    | {
        captureMode?: "async" | "sync";
        error?: string;
        queued?: boolean;
        requestCount?: number;
        requestIds?: string[];
        runIds?: string[];
        setId?: string;
      }
    | undefined;

  const evaluationSetId = getOptionalString(body.evaluationSetId) ??
    defaultEvaluationSetId;
  const shouldCaptureEvaluation = body.captureEvaluation === true &&
    shouldSampleEvaluation(
      getOptionalNumber(body.evaluationSampleRate) ?? 1,
      body.forceEvaluationCapture === true,
    );

  if (shouldCaptureEvaluation) {
    const captureStartedAt = Date.now();
    const capturePromise = captureRuntimeEvaluation({
      adminClient,
      evaluationSetId,
      evaluationSetName: getOptionalString(body.evaluationSetName) ??
        defaultEvaluationSetName,
      inputLabels,
      interactions: checkResult.evaluationInteractions ?? interactions,
      lookupDurationMs,
      nodeIds: nodeIds as string[],
      retrieveRuntimeEvidence: body.retrieveRuntimeEvidence !== false,
      samplingReason: getOptionalString(body.evaluationSamplingReason) ??
        "manual",
      totalDurationMsBeforeCapture: captureStartedAt - requestStartedAt,
    });
    const captureMode = getCaptureMode(body.evaluationCaptureMode);

    if (captureMode === "sync") {
      try {
        evaluation = {
          captureMode,
          ...(await capturePromise),
        };
      } catch (captureError) {
        console.error("Failed to capture runtime interaction evaluation", {
          error: captureError instanceof Error
            ? captureError.message
            : String(captureError),
        });
        evaluation = {
          captureMode,
          error: captureError instanceof Error
            ? captureError.message
            : "Failed to capture runtime evaluation",
        };
      }
    } else {
      scheduleBackgroundTask(
        capturePromise.catch((captureError) => {
          console.error("Failed to capture runtime interaction evaluation", {
            error: captureError instanceof Error
              ? captureError.message
              : String(captureError),
          });
        }),
      );

      evaluation = {
        captureMode,
        queued: true,
        requestCount: getInputPairs(Array.from(new Set(nodeIds as string[])))
          .length,
        setId: evaluationSetId,
      };
    }
  } else if (body.captureEvaluation === true) {
    evaluation = {
      queued: false,
      requestCount: 0,
      setId: evaluationSetId,
    };
  }

  return jsonResponse(
    {
      cache: checkResult.cache,
      evaluation,
      interactions,
    },
    200,
  );
});

async function checkInteractionsWithCache({
  aiCacheTtlSeconds,
  aiInferenceMode,
  adminClient,
  calibrationModels,
  inputLabels,
  interactionAiModel,
  nodeIds,
  providerKeys,
  retrieveRuntimeEvidence,
  resultCacheTtlSeconds,
  useAiInference,
  useResultCache,
}: {
  aiCacheTtlSeconds: number;
  aiInferenceMode: "always" | "on_miss_or_uncertain";
  adminClient: ReturnType<typeof createClient>;
  calibrationModels: string[];
  inputLabels: Record<string, string>;
  interactionAiModel: string;
  nodeIds: string[];
  providerKeys: RuntimeAiProviderKeys;
  retrieveRuntimeEvidence: boolean;
  resultCacheTtlSeconds: number;
  useAiInference: boolean;
  useResultCache: boolean;
}): Promise<CheckInteractionsResult> {
  const uniqueNodeIds = Array.from(new Set(nodeIds));
  const pairs = getInputPairs(uniqueNodeIds);
  const attachCalibrationPanel = async ({
    cache,
    deterministicInteractions,
    graphVersion,
    responseInteractions,
  }: {
    cache: CheckInteractionsResult["cache"];
    deterministicInteractions: InteractionRpcRow[];
    graphVersion: string | null;
    responseInteractions: InteractionRpcRow[];
  }): Promise<CheckInteractionsResult> => {
    if (!calibrationModels.length || !useAiInference) {
      return {
        cache,
        interactions: responseInteractions,
      };
    }

    const panelResult = await buildCalibrationModelPanel({
      aiCacheTtlSeconds,
      adminClient,
      calibrationModels,
      deterministicInteractions,
      graphVersion,
      inputLabels,
      nodeIds,
      pairs,
      providerKeys,
      retrieveRuntimeEvidence,
      seedInteractions: responseInteractions,
      useResultCache,
    });

    return {
      cache: {
        ...cache,
        ...(panelResult?.cache ?? {}),
      },
      evaluationInteractions: panelResult?.interactions.length
        ? panelResult.interactions
        : responseInteractions,
      interactions: responseInteractions,
    };
  };

  if (!useResultCache || pairs.length === 0) {
    const interactions = await fetchPublishedInteractions(adminClient, nodeIds);
    const aiResult = useAiInference
      ? await augmentWithRuntimeAiInference({
        aiCacheTtlSeconds,
        aiInferenceMode,
        adminClient,
        deterministicInteractions: interactions,
        graphVersion: null,
        inputLabels,
        interactionAiModel,
        nodeIds,
        pairs,
        providerKeys,
        retrieveRuntimeEvidence,
        useResultCache,
      })
      : null;

    return attachCalibrationPanel({
      cache: {
        enabled: false,
        ...(aiResult?.cache ?? {}),
        hitCount: 0,
        missCount: pairs.length,
        pairCount: pairs.length,
      },
      deterministicInteractions: interactions,
      graphVersion: null,
      responseInteractions: aiResult?.interactions ?? interactions,
    });
  }

  const graphVersion = await getGraphVersion(adminClient);

  if (!graphVersion) {
    const interactions = await fetchPublishedInteractions(adminClient, nodeIds);
    const aiResult = useAiInference
      ? await augmentWithRuntimeAiInference({
        aiCacheTtlSeconds,
        aiInferenceMode,
        adminClient,
        deterministicInteractions: interactions,
        graphVersion: null,
        inputLabels,
        interactionAiModel,
        nodeIds,
        pairs,
        providerKeys,
        retrieveRuntimeEvidence,
        useResultCache,
      })
      : null;

    return attachCalibrationPanel({
      cache: {
        enabled: false,
        ...(aiResult?.cache ?? {}),
        hitCount: 0,
        missCount: pairs.length,
        pairCount: pairs.length,
      },
      deterministicInteractions: interactions,
      graphVersion: null,
      responseInteractions: aiResult?.interactions ?? interactions,
    });
  }

  const pairFingerprints = pairs.map(([leftId, rightId]) =>
    pairFingerprint(leftId, rightId)
  );
  const cachedByPair = await getCachedPairResults(
    adminClient,
    graphVersion,
    pairFingerprints,
  );
  const hitCount = cachedByPair.size;

  if (hitCount === pairs.length) {
    const deterministicInteractions = sortInteractions(
      pairFingerprints.flatMap((fingerprint) =>
        cachedByPair.get(fingerprint) ?? []
      ),
    );
    const aiResult = useAiInference
      ? await augmentWithRuntimeAiInference({
        aiCacheTtlSeconds,
        aiInferenceMode,
        adminClient,
        deterministicInteractions,
        graphVersion,
        inputLabels,
        interactionAiModel,
        nodeIds,
        pairs,
        providerKeys,
        retrieveRuntimeEvidence,
        useResultCache,
      })
      : null;

    return attachCalibrationPanel({
      cache: {
        enabled: true,
        ...(aiResult?.cache ?? {}),
        graphVersion,
        hitCount,
        missCount: 0,
        pairCount: pairs.length,
      },
      deterministicInteractions,
      graphVersion,
      responseInteractions: aiResult?.interactions ?? deterministicInteractions,
    });
  }

  const interactions = await fetchPublishedInteractions(adminClient, nodeIds);
  const aiResult = useAiInference
    ? await augmentWithRuntimeAiInference({
      aiCacheTtlSeconds,
      aiInferenceMode,
      adminClient,
      deterministicInteractions: interactions,
      graphVersion,
      inputLabels,
      interactionAiModel,
      nodeIds,
      pairs,
      providerKeys,
      retrieveRuntimeEvidence,
      useResultCache,
    })
    : null;
  const cacheWrite = upsertPairResultCache({
    adminClient,
    graphVersion,
    interactions,
    pairs,
    resultCacheTtlSeconds,
  });

  scheduleBackgroundTask(
    cacheWrite.catch((cacheError) => {
      console.error("Failed to write interaction result cache", {
        error: cacheError instanceof Error ? cacheError.message : String(cacheError),
      });
    }),
  );

  return attachCalibrationPanel({
    cache: {
      enabled: true,
      ...(aiResult?.cache ?? {}),
      graphVersion,
      hitCount,
      missCount: pairs.length - hitCount,
      pairCount: pairs.length,
    },
    deterministicInteractions: interactions,
    graphVersion,
    responseInteractions: aiResult?.interactions ?? interactions,
  });
}

async function fetchPublishedInteractions(
  adminClient: ReturnType<typeof createClient>,
  nodeIds: string[],
): Promise<InteractionRpcRow[]> {
  const { data, error } = await adminClient.rpc("check_published_interactions", {
    input_node_ids: nodeIds,
  });

  if (error) {
    throw error;
  }

  return ((data ?? []) as InteractionRpcRow[]).filter(isInteractionRpcRow);
}

async function getGraphVersion(
  adminClient: ReturnType<typeof createClient>,
): Promise<string | null> {
  const { data, error } = await adminClient.rpc(
    "get_interaction_graph_cache_version",
  );

  if (error || typeof data !== "string") {
    console.error("Failed to read interaction graph cache version", {
      error: error?.message ?? "Missing cache version",
    });
    return null;
  }

  return data;
}

async function getCachedPairResults(
  adminClient: ReturnType<typeof createClient>,
  graphVersion: string,
  pairFingerprints: string[],
): Promise<Map<string, InteractionRpcRow[]>> {
  const cachedByPair = new Map<string, InteractionRpcRow[]>();

  if (!pairFingerprints.length) {
    return cachedByPair;
  }

  const { data, error } = await adminClient
    .from("interaction_checker_result_cache")
    .select("pair_fingerprint,response")
    .eq("engine", "published_kg_lookup")
    .eq("graph_version", graphVersion)
    .eq("retrieval_strategy_version", "published-kg-runtime-v1")
    .in("pair_fingerprint", pairFingerprints)
    .gt("expires_at", new Date().toISOString());

  if (error) {
    console.error("Failed to read interaction result cache", {
      error: error.message,
    });
    return cachedByPair;
  }

  for (const row of (data ?? []) as PairCacheRow[]) {
    cachedByPair.set(
      row.pair_fingerprint,
      ((row.response?.interactions ?? []) as InteractionRpcRow[]).filter(
        isInteractionRpcRow,
      ),
    );
  }

  return cachedByPair;
}

async function upsertPairResultCache({
  adminClient,
  graphVersion,
  interactions,
  pairs,
  resultCacheTtlSeconds,
}: {
  adminClient: ReturnType<typeof createClient>;
  graphVersion: string;
  interactions: InteractionRpcRow[];
  pairs: Array<[string, string]>;
  resultCacheTtlSeconds: number;
}): Promise<void> {
  const interactionsByPair = groupInteractionsByPair(interactions);
  const expiresAt = new Date(
    Date.now() + Math.max(1, resultCacheTtlSeconds) * 1000,
  ).toISOString();
  const rows = pairs.map(([leftId, rightId]) => {
    const fingerprint = pairFingerprint(leftId, rightId);
    const pairInteractions = interactionsByPair.get(fingerprint) ?? [];

    return {
      cache_key:
        `published_kg_lookup:published-kg-runtime-v1:${graphVersion}:${fingerprint}`,
      decision_trace: {
        cache_source: "check-interactions",
        result_count: pairInteractions.length,
      },
      engine: "published_kg_lookup",
      evidence: [],
      evidence_version: graphVersion,
      expires_at: expiresAt,
      graph_version: graphVersion,
      input_node_ids: fingerprint.split(":"),
      metadata: {
        cache_ttl_seconds: resultCacheTtlSeconds,
      },
      model: "deterministic-published-kg-lookup",
      pair_fingerprint: fingerprint,
      response: {
        interactions: pairInteractions,
      },
      retrieval_strategy_version: "published-kg-runtime-v1",
    };
  });

  if (!rows.length) {
    return;
  }

  const { error } = await adminClient
    .from("interaction_checker_result_cache")
    .upsert(rows, { onConflict: "cache_key" });

  if (error) {
    throw error;
  }
}

async function augmentWithRuntimeAiInference({
  aiCacheTtlSeconds,
  aiInferenceMode,
  adminClient,
  deterministicInteractions,
  graphVersion,
  inputLabels,
  interactionAiModel,
  nodeIds,
  pairs,
  providerKeys,
  retrieveRuntimeEvidence,
  useResultCache,
}: {
  aiCacheTtlSeconds: number;
  aiInferenceMode: "always" | "on_miss_or_uncertain";
  adminClient: ReturnType<typeof createClient>;
  deterministicInteractions: InteractionRpcRow[];
  graphVersion: string | null;
  inputLabels: Record<string, string>;
  interactionAiModel: string;
  nodeIds: string[];
  pairs: Array<[string, string]>;
  providerKeys: RuntimeAiProviderKeys;
  retrieveRuntimeEvidence: boolean;
  useResultCache: boolean;
}): Promise<{
  cache: {
    aiHitCount: number;
    aiMissCount: number;
    evidenceVersion?: string;
    graphVersion?: string;
  };
  interactions: InteractionRpcRow[];
} | null> {
  if (!retrieveRuntimeEvidence || !pairs.length) {
    return null;
  }

  const deterministicByPair = groupInteractionsByPair(deterministicInteractions);
  const candidatePairs = pairs.filter(([leftId, rightId]) =>
    shouldRunAiForPair(
      deterministicByPair.get(pairFingerprint(leftId, rightId)) ?? [],
      aiInferenceMode,
    )
  );

  if (!candidatePairs.length) {
    return null;
  }

  const [resolvedGraphVersion, evidenceVersion] = await Promise.all([
    graphVersion ? Promise.resolve(graphVersion) : getGraphVersion(adminClient),
    getEvidenceVersion(adminClient),
  ]);
  const pairFingerprints = candidatePairs.map(([leftId, rightId]) =>
    pairFingerprint(leftId, rightId)
  );
  const cachedByPair = useResultCache && resolvedGraphVersion && evidenceVersion
    ? await getCachedAiResults({
      adminClient,
      evidenceVersion,
      graphVersion: resolvedGraphVersion,
      interactionAiModel,
      pairFingerprints,
    })
    : new Map<string, InteractionRpcRow[]>();
  const aiRowsByPair = new Map<string, InteractionRpcRow[]>(
    [...cachedByPair.entries()],
  );
  const missingPairs = candidatePairs.filter(([leftId, rightId]) =>
    !cachedByPair.has(pairFingerprint(leftId, rightId))
  );

  const provider = getRuntimeModelProvider(interactionAiModel);
  const missingKeyMessage = getMissingProviderKeyMessage(provider);

  if (missingPairs.length && !hasProviderKey(providerKeys, provider)) {
    console.error(
      `Runtime AI inference requested but ${missingKeyMessage}.`,
    );
  }

  if (missingPairs.length && hasProviderKey(providerKeys, provider)) {
    const nodesById = await getKgNodesById(adminClient, nodeIds);
    const retrievedEvidenceByPair = await retrieveRuntimeEvidenceByPair({
      adminClient,
      nodesById,
      pairs: missingPairs,
    });

    for (const [leftId, rightId] of missingPairs) {
      const fingerprint = pairFingerprint(leftId, rightId);
      const leftNode = nodesById.get(leftId);
      const rightNode = nodesById.get(rightId);
      const leftLabel = inputLabels[leftId] ?? leftNode?.canonical_name ?? leftId;
      const rightLabel = inputLabels[rightId] ?? rightNode?.canonical_name ??
        rightId;
      const deterministicRows = deterministicByPair.get(fingerprint) ?? [];
      const evidenceRows = rerankEvidenceRows([
        ...buildEvidenceRows(deterministicRows),
        ...(retrievedEvidenceByPair.get(fingerprint) ?? []),
      ]).slice(0, 18);
      const substantiveEvidence = evidenceRows.filter(
        (row) =>
          row.source_kind !== "kg_edge" ||
          row.support_type !== "source_silent",
      );

      if (!substantiveEvidence.length) {
        continue;
      }

      try {
        const answer = await runRuntimeAiAssessment({
          evidenceRows,
          interactionAiModel,
          leftLabel,
          providerKeys,
          rightLabel,
        });
        const interactionRow = buildRuntimeAiInteractionRow({
          answer,
          evidenceRows,
          interactionAiModel,
          leftId,
          rightId,
          leftNode,
          rightNode,
          pairFingerprint: fingerprint,
        });

        aiRowsByPair.set(fingerprint, [interactionRow]);

        if (useResultCache && resolvedGraphVersion && evidenceVersion) {
          scheduleBackgroundTask(
            upsertRuntimeAiCache({
              adminClient,
              aiCacheTtlSeconds,
              evidenceRows,
              evidenceVersion,
              graphVersion: resolvedGraphVersion,
              interactionAiModel,
              pairFingerprint: fingerprint,
              rows: [interactionRow],
            }).catch((cacheError) => {
              console.error("Failed to write runtime AI cache", {
                error: cacheError instanceof Error
                  ? cacheError.message
                  : String(cacheError),
              });
            }),
          );
        }
      } catch (aiError) {
        console.error("Runtime AI interaction assessment failed", {
          error: aiError instanceof Error ? aiError.message : String(aiError),
          pairFingerprint: fingerprint,
        });
      }
    }
  }

  if (!aiRowsByPair.size) {
    return {
      cache: {
        aiHitCount: cachedByPair.size,
        aiMissCount: missingPairs.length,
        ...(evidenceVersion ? { evidenceVersion } : {}),
        ...(resolvedGraphVersion ? { graphVersion: resolvedGraphVersion } : {}),
      },
      interactions: deterministicInteractions,
    };
  }

  const finalByPair = new Map<string, InteractionRpcRow[]>(
    [...deterministicByPair.entries()],
  );

  for (const [fingerprint, rows] of aiRowsByPair.entries()) {
    finalByPair.set(fingerprint, rows);
  }

  return {
    cache: {
      aiHitCount: cachedByPair.size,
      aiMissCount: missingPairs.length,
      ...(evidenceVersion ? { evidenceVersion } : {}),
      ...(resolvedGraphVersion ? { graphVersion: resolvedGraphVersion } : {}),
    },
    interactions: sortInteractions([...finalByPair.values()].flat()),
  };
}

async function buildCalibrationModelPanel({
  aiCacheTtlSeconds,
  adminClient,
  calibrationModels,
  deterministicInteractions,
  graphVersion,
  inputLabels,
  nodeIds,
  pairs,
  providerKeys,
  retrieveRuntimeEvidence,
  seedInteractions,
  useResultCache,
}: {
  aiCacheTtlSeconds: number;
  adminClient: ReturnType<typeof createClient>;
  calibrationModels: string[];
  deterministicInteractions: InteractionRpcRow[];
  graphVersion: string | null;
  inputLabels: Record<string, string>;
  nodeIds: string[];
  pairs: Array<[string, string]>;
  providerKeys: RuntimeAiProviderKeys;
  retrieveRuntimeEvidence: boolean;
  seedInteractions: InteractionRpcRow[];
  useResultCache: boolean;
}): Promise<{
  cache: {
    calibrationAiHitCount: number;
    calibrationAiMissCount: number;
    evidenceVersion?: string;
    graphVersion?: string;
  };
  interactions: InteractionRpcRow[];
} | null> {
  if (!retrieveRuntimeEvidence || !pairs.length || !calibrationModels.length) {
    return null;
  }

  const [resolvedGraphVersion, evidenceVersion] = await Promise.all([
    graphVersion ? Promise.resolve(graphVersion) : getGraphVersion(adminClient),
    getEvidenceVersion(adminClient),
  ]);
  const pairFingerprints = pairs.map(([leftId, rightId]) =>
    pairFingerprint(leftId, rightId)
  );
  const deterministicByPair = groupInteractionsByPair(deterministicInteractions);
  const seededRowsByModelPair = groupRuntimeAiRowsByModelPair(seedInteractions);
  const cachedRowsByModelPair = new Map<string, InteractionRpcRow[]>();
  let calibrationAiHitCount = 0;
  let calibrationAiMissCount = 0;

  if (useResultCache && resolvedGraphVersion && evidenceVersion) {
    await Promise.all(
      calibrationModels.map(async (model) => {
        const cachedByPair = await getCachedAiResults({
          adminClient,
          evidenceVersion,
          graphVersion: resolvedGraphVersion,
          interactionAiModel: model,
          pairFingerprints,
        });

        for (const [fingerprint, rows] of cachedByPair.entries()) {
          cachedRowsByModelPair.set(modelPairKey(model, fingerprint), rows);
        }

        calibrationAiHitCount += cachedByPair.size;
      }),
    );
  }

  const missingModelPairs = pairs.flatMap(([leftId, rightId]) => {
    const fingerprint = pairFingerprint(leftId, rightId);

    return calibrationModels.flatMap((model) =>
      seededRowsByModelPair.has(modelPairKey(model, fingerprint)) ||
        cachedRowsByModelPair.has(modelPairKey(model, fingerprint))
        ? []
        : [{ fingerprint, leftId, model, rightId }]
    );
  });

  calibrationAiMissCount = missingModelPairs.length;

  const generatedRowsByModelPair = new Map<string, InteractionRpcRow[]>();

  if (missingModelPairs.length) {
    const nodesById = await getKgNodesById(adminClient, nodeIds);
    const missingPairs = [
      ...new Map(
        missingModelPairs.map((item) => [
          item.fingerprint,
          [item.leftId, item.rightId] as [string, string],
        ]),
      ).values(),
    ];
    const retrievedEvidenceByPair = await retrieveRuntimeEvidenceByPair({
      adminClient,
      nodesById,
      pairs: missingPairs,
    });

    for (const { fingerprint, leftId, model, rightId } of missingModelPairs) {
      const leftNode = nodesById.get(leftId);
      const rightNode = nodesById.get(rightId);
      const leftLabel = inputLabels[leftId] ?? leftNode?.canonical_name ??
        leftId;
      const rightLabel = inputLabels[rightId] ?? rightNode?.canonical_name ??
        rightId;
      const evidenceRows = rerankEvidenceRows([
        ...buildEvidenceRows(deterministicByPair.get(fingerprint) ?? []),
        ...(retrievedEvidenceByPair.get(fingerprint) ?? []),
      ]).slice(0, 18);
      const substantiveEvidence = evidenceRows.filter(
        (row) =>
          row.source_kind !== "kg_edge" ||
          row.support_type !== "source_silent",
      );

      if (!substantiveEvidence.length) {
        continue;
      }

      const assessmentStartedAt = Date.now();
      const provider = getRuntimeModelProvider(model);

      try {
        if (!hasProviderKey(providerKeys, provider)) {
          throw new Error(
            `Calibration model panel requested ${model} but ${
              getMissingProviderKeyMessage(provider)
            }.`,
          );
        }

        const answer = await runRuntimeAiAssessment({
          evidenceRows,
          interactionAiModel: model,
          leftLabel,
          providerKeys,
          rightLabel,
        });
        const interactionRow = buildRuntimeAiInteractionRow({
          answer,
          evidenceRows,
          interactionAiModel: model,
          leftId,
          rightId,
          leftNode,
          rightNode,
          pairFingerprint: fingerprint,
        });

        generatedRowsByModelPair.set(modelPairKey(model, fingerprint), [
          interactionRow,
        ]);

        if (useResultCache && resolvedGraphVersion && evidenceVersion) {
          scheduleBackgroundTask(
            upsertRuntimeAiCache({
              adminClient,
              aiCacheTtlSeconds,
              evidenceRows,
              evidenceVersion,
              graphVersion: resolvedGraphVersion,
              interactionAiModel: model,
              pairFingerprint: fingerprint,
              rows: [interactionRow],
            }).catch((cacheError) => {
              console.error("Failed to write calibration runtime AI cache", {
                error: cacheError instanceof Error
                  ? cacheError.message
                  : String(cacheError),
              });
            }),
          );
        }
      } catch (aiError) {
        console.error("Calibration runtime AI assessment failed", {
          error: aiError instanceof Error ? aiError.message : String(aiError),
          model,
          pairFingerprint: fingerprint,
        });
        generatedRowsByModelPair.set(modelPairKey(model, fingerprint), [
          buildRuntimeAiFailureRow({
            error: aiError,
            evidenceRows,
            interactionAiModel: model,
            latencyMs: Date.now() - assessmentStartedAt,
            leftId,
            rightId,
            leftNode,
            rightNode,
            pairFingerprint: fingerprint,
          }),
        ]);
      }
    }
  }

  const interactions = pairs.flatMap(([leftId, rightId]) => {
    const fingerprint = pairFingerprint(leftId, rightId);

    return calibrationModels.flatMap((model) =>
      seededRowsByModelPair.get(modelPairKey(model, fingerprint)) ??
        cachedRowsByModelPair.get(modelPairKey(model, fingerprint)) ??
        generatedRowsByModelPair.get(modelPairKey(model, fingerprint)) ??
        []
    );
  });

  return {
    cache: {
      calibrationAiHitCount,
      calibrationAiMissCount,
      ...(evidenceVersion ? { evidenceVersion } : {}),
      ...(resolvedGraphVersion ? { graphVersion: resolvedGraphVersion } : {}),
    },
    interactions: sortInteractions(interactions),
  };
}

async function getEvidenceVersion(
  adminClient: ReturnType<typeof createClient>,
): Promise<string | null> {
  const { data, error } = await adminClient.rpc(
    "get_interaction_evidence_cache_version",
  );

  if (error || typeof data !== "string") {
    console.error("Failed to read interaction evidence cache version", {
      error: error?.message ?? "Missing evidence cache version",
    });
    return null;
  }

  return data;
}

async function getCachedAiResults({
  adminClient,
  evidenceVersion,
  graphVersion,
  interactionAiModel,
  pairFingerprints,
}: {
  adminClient: ReturnType<typeof createClient>;
  evidenceVersion: string;
  graphVersion: string;
  interactionAiModel: string;
  pairFingerprints: string[];
}): Promise<Map<string, InteractionRpcRow[]>> {
  const cachedByPair = new Map<string, InteractionRpcRow[]>();

  if (!pairFingerprints.length) {
    return cachedByPair;
  }

  const { data, error } = await adminClient
    .from("interaction_checker_result_cache")
    .select("pair_fingerprint,response")
    .eq("engine", "ai_evidence_inference")
    .eq("graph_version", graphVersion)
    .eq("evidence_version", evidenceVersion)
    .eq("retrieval_strategy_version", interactionAiRetrievalStrategyVersion)
    .eq("prompt_version", interactionAiPromptVersion)
    .eq("model", interactionAiModel)
    .in("pair_fingerprint", pairFingerprints)
    .gt("expires_at", new Date().toISOString());

  if (error) {
    console.error("Failed to read runtime AI cache", { error: error.message });
    return cachedByPair;
  }

  for (const row of (data ?? []) as RuntimeAiCacheRow[]) {
    cachedByPair.set(
      row.pair_fingerprint,
      ((row.response?.interactions ?? []) as InteractionRpcRow[]).filter(
        isInteractionRpcRow,
      ),
    );
  }

  return cachedByPair;
}

async function upsertRuntimeAiCache({
  adminClient,
  aiCacheTtlSeconds,
  evidenceRows,
  evidenceVersion,
  graphVersion,
  interactionAiModel,
  pairFingerprint,
  rows,
}: {
  adminClient: ReturnType<typeof createClient>;
  aiCacheTtlSeconds: number;
  evidenceRows: RuntimeEvidenceRow[];
  evidenceVersion: string;
  graphVersion: string;
  interactionAiModel: string;
  pairFingerprint: string;
  rows: InteractionRpcRow[];
}): Promise<void> {
  const answer = rows[0]?.interaction;
  const expiresAt = new Date(
    Date.now() + Math.max(1, aiCacheTtlSeconds) * 1000,
  ).toISOString();
  const { error } = await adminClient
    .from("interaction_checker_result_cache")
    .upsert(
      {
        answer_category: answer?.actionCategory ?? null,
        answer_summary: answer?.mechanism ?? null,
        cache_key:
          `ai_evidence_inference:${interactionAiRetrievalStrategyVersion}:${interactionAiPromptVersion}:${interactionAiModel}:${graphVersion}:${evidenceVersion}:${pairFingerprint}`,
        confidence: getTraceConfidence(answer?.aiDecisionTrace),
        decision_trace: answer?.aiDecisionTrace ?? {},
        engine: "ai_evidence_inference",
        evidence: evidenceRows.map(toPromptEvidence),
        evidence_version: evidenceVersion,
        expires_at: expiresAt,
        graph_version: graphVersion,
        input_node_ids: pairFingerprint.split(":"),
        management: answer?.management ?? null,
        metadata: {
          cache_ttl_seconds: aiCacheTtlSeconds,
          prompt_version: interactionAiPromptVersion,
        },
        model: interactionAiModel,
        pair_fingerprint: pairFingerprint,
        prompt_version: interactionAiPromptVersion,
        response: {
          interactions: rows,
        },
        retrieval_strategy_version: interactionAiRetrievalStrategyVersion,
      },
      { onConflict: "cache_key" },
    );

  if (error) {
    throw error;
  }
}

async function runRuntimeAiAssessment({
  evidenceRows,
  interactionAiModel,
  leftLabel,
  providerKeys,
  rightLabel,
}: {
  evidenceRows: RuntimeEvidenceRow[];
  interactionAiModel: string;
  leftLabel: string;
  providerKeys: RuntimeAiProviderKeys;
  rightLabel: string;
}): Promise<RuntimeAiAnswer> {
  const assessmentStartedAt = Date.now();
  const provider = getRuntimeModelProvider(interactionAiModel);
  const promptEvidenceRows = evidenceRows.slice(0, 14);
  const promptEvidenceIds = promptEvidenceRows.map((_, index) =>
    getPromptEvidenceId(index)
  );
  const basePromptPayload = {
    categories: [
      "no_known_interaction",
      "no_action_needed",
      "monitor_therapy",
      "consider_therapy_modification",
      "avoid_combination",
    ],
    evidence: promptEvidenceRows.map(toPromptEvidence),
    validEvidenceIds: promptEvidenceIds,
    inputPair: {
      source: leftLabel,
      target: rightLabel,
    },
    outputShape: {
      actionCategory: "one category string",
      confidence: "number 0 to 1",
      evidenceSupport: "direct|indirect|insufficient|conflicting",
      management: "string or null",
      mechanism: "string or null",
      rationale: "short explanation grounded only in provided evidence",
      severity: "contraindicated|major|moderate|minor|unknown",
      uncertainty: ["string"],
      usedEvidenceIds: [
        "at least one exact short evidence[].id value used for the answer, such as E1",
      ],
    },
    rules: [
      "Use only the provided evidence. Do not use outside knowledge.",
      "Prefer official CPS and Health Canada monograph evidence over PubMed.",
      "PubMed evidence is supporting literature, not a replacement for current monograph context.",
      "Mechanism-only evidence should not become a broad interaction unless it supports a clinically actionable risk.",
      "If evidence is absent, source-silent, unrelated, or insufficient, use no_known_interaction with low confidence.",
      "Every completed answer must cite at least one exact short evidence[].id value such as E1 or E2 in usedEvidenceIds.",
      `Only these usedEvidenceIds are valid: ${promptEvidenceIds.join(", ")}.`,
      `Use the ${runtimeAiAssessmentToolName} tool when available.`,
      "If returning text instead of tool output, return one JSON object only. No markdown.",
      "Start JSON text with { and end with }.",
    ],
  };
  let lastError: unknown = null;
  let lastRawText = "";
  const maxStructuredOutputAttempts = 1;

  for (let attempt = 0; attempt < maxStructuredOutputAttempts; attempt += 1) {
    const promptPayload = attempt === 0
      ? basePromptPayload
      : {
        ...basePromptPayload,
        previousInvalidOutput: truncate(lastRawText, 1200),
        previousParserError: lastError instanceof Error
          ? lastError.message
          : String(lastError ?? "Unknown parser error"),
        repairInstruction:
          "The prior response was not valid structured output. Re-evaluate the same evidence and return only the required tool call or one valid JSON object. Do not add explanation outside the structured answer.",
    };

      try {
      const modelResponse = await callRuntimeAiAssessmentModelWithFallback({
        interactionAiModel,
        promptPayload,
        promptEvidenceIds,
        provider,
        providerKeys,
      });
      lastRawText = modelResponse.rawText;

      const answer = requireValidRuntimeAiEvidenceIds(
        validateRuntimeAiAnswer(parseRuntimeAiModelResponse(modelResponse)),
        promptEvidenceRows,
      );

      return {
        ...answer,
        latencyMs: Date.now() - assessmentStartedAt,
        structuredOutputMethod: modelResponse.structuredOutputMethod,
        structuredOutputRetryCount: attempt,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `Runtime AI answer could not be parsed after ${maxStructuredOutputAttempts} attempt(s): ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }${lastRawText ? `; output: ${truncate(lastRawText, 500)}` : ""}`,
  );
}

async function callRuntimeAiAssessmentModelWithFallback({
  interactionAiModel,
  promptPayload,
  promptEvidenceIds,
  provider,
  providerKeys,
}: {
  interactionAiModel: string;
  promptPayload: unknown;
  promptEvidenceIds: string[];
  provider: RuntimeModelProvider;
  providerKeys: RuntimeAiProviderKeys;
}): Promise<{
  rawText: string;
  structuredOutputMethod: RuntimeStructuredOutputMethod;
  toolInput: unknown;
}> {
  if (provider === "openai") {
    const openaiApiKey = providerKeys.openaiApiKey;

    if (!openaiApiKey) {
      throw new Error(getMissingProviderKeyMessage(provider));
    }

    return callOpenAiRuntimeAiAssessmentModel({
      interactionAiModel,
      openaiApiKey,
      promptPayload,
      promptEvidenceIds,
    });
  }

  const anthropicApiKey = providerKeys.anthropicApiKey;

  if (!anthropicApiKey) {
    throw new Error(getMissingProviderKeyMessage(provider));
  }

  try {
    return await callAnthropicRuntimeAiAssessmentModel({
      anthropicApiKey,
      interactionAiModel,
      promptPayload,
      promptEvidenceIds,
      useTool: true,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("Anthropic request failed: 400")
    ) {
      return callAnthropicRuntimeAiAssessmentModel({
        anthropicApiKey,
        interactionAiModel,
        promptPayload,
        promptEvidenceIds,
        useTool: false,
      });
    }

    throw error;
  }
}

async function callAnthropicRuntimeAiAssessmentModel({
  anthropicApiKey,
  interactionAiModel,
  promptPayload,
  promptEvidenceIds,
  useTool,
}: {
  anthropicApiKey: string;
  interactionAiModel: string;
  promptPayload: unknown;
  promptEvidenceIds: string[];
  useTool: boolean;
}): Promise<{
  rawText: string;
  structuredOutputMethod: RuntimeStructuredOutputMethod;
  toolInput: unknown;
}> {
  const body: Record<string, unknown> = {
    max_tokens: 700,
    messages: [
      {
        role: "user",
        content: JSON.stringify(promptPayload),
      },
    ],
    model: interactionAiModel,
    system:
      "You are ClinRx's conservative Canadian pharmacy interaction checker. You classify drug-pair interaction action categories using only supplied evidence chunks and must cite the exact evidence ids used.",
  };

  if (useTool) {
    body.tools = [buildRuntimeAiAssessmentTool(promptEvidenceIds)];
    body.tool_choice = {
      name: runtimeAiAssessmentToolName,
      type: "tool",
    };
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    body: JSON.stringify(body),
    headers: {
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "x-api-key": anthropicApiKey,
    },
    method: "POST",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Anthropic request failed: ${response.status} ${truncate(errorText, 600)}`,
    );
  }

  const json = (await response.json()) as {
    content?: Array<{
      input?: unknown;
      name?: string;
      text?: string;
      type: string;
    }>;
  };
  const toolBlock = (json.content ?? []).find((block) =>
    block.type === "tool_use" && block.name === runtimeAiAssessmentToolName
  );
  const text = (json.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("\n")
    .trim();

  return {
    rawText: text,
    structuredOutputMethod: toolBlock ? "anthropic_tool_use" : "anthropic_json_text",
    toolInput: toolBlock?.input,
  };
}

async function callOpenAiRuntimeAiAssessmentModel({
  interactionAiModel,
  openaiApiKey,
  promptPayload,
  promptEvidenceIds,
}: {
  interactionAiModel: string;
  openaiApiKey: string;
  promptPayload: unknown;
  promptEvidenceIds: string[];
}): Promise<{
  rawText: string;
  structuredOutputMethod: RuntimeStructuredOutputMethod;
  toolInput: unknown;
}> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    body: JSON.stringify({
      input: [
        {
          content:
            "You are ClinRx's conservative Canadian pharmacy interaction checker. You classify drug-pair interaction action categories using only supplied evidence chunks and must cite the exact evidence ids used.",
          role: "system",
        },
        {
          content: JSON.stringify(promptPayload),
          role: "user",
        },
      ],
      max_output_tokens: 700,
      model: interactionAiModel,
      reasoning: {
        effort: "low",
      },
      store: false,
      text: {
        format: {
          name: "interaction_assessment",
          schema: buildRuntimeAiAssessmentSchema(promptEvidenceIds),
          strict: true,
          type: "json_schema",
        },
      },
    }),
    headers: {
      Authorization: `Bearer ${openaiApiKey}`,
      "content-type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `OpenAI request failed: ${response.status} ${truncate(errorText, 600)}`,
    );
  }

  const json = await response.json();
  const text = extractOpenAiResponseText(json).trim();

  return {
    rawText: text,
    structuredOutputMethod: "openai_json_schema",
    toolInput: JSON.parse(extractJsonObject(text)),
  };
}

function parseRuntimeAiModelResponse(modelResponse: {
  rawText: string;
  toolInput: unknown;
}): unknown {
  if (modelResponse.toolInput && typeof modelResponse.toolInput === "object") {
    return modelResponse.toolInput;
  }

  return JSON.parse(extractJsonObject(modelResponse.rawText));
}

function extractOpenAiResponseText(value: unknown): string {
  if (!value || typeof value !== "object") {
    return "";
  }

  const response = value as {
    output?: Array<{
      content?: Array<{ text?: string; type?: string }>;
      type?: string;
    }>;
    output_text?: unknown;
  };

  if (typeof response.output_text === "string") {
    return response.output_text;
  }

  return (response.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) =>
      (item.type === "output_text" || item.type === "text") &&
      typeof item.text === "string"
    )
    .map((item) => item.text ?? "")
    .join("\n");
}

function buildRuntimeAiAssessmentTool(promptEvidenceIds: string[]) {
  return {
    description:
      "Record the conservative drug interaction assessment using only the supplied evidence.",
    input_schema: buildRuntimeAiAssessmentSchema(promptEvidenceIds),
    name: runtimeAiAssessmentToolName,
  };
}

function buildRuntimeAiAssessmentSchema(promptEvidenceIds: string[]) {
  return {
    additionalProperties: false,
    properties: {
      actionCategory: {
        enum: [
          "no_known_interaction",
          "no_action_needed",
          "monitor_therapy",
          "consider_therapy_modification",
          "avoid_combination",
        ],
        type: "string",
      },
      confidence: {
        maximum: 1,
        minimum: 0,
        type: "number",
      },
      evidenceSupport: {
        enum: ["direct", "indirect", "insufficient", "conflicting"],
        type: "string",
      },
      management: {
        type: ["string", "null"],
      },
      mechanism: {
        type: ["string", "null"],
      },
      rationale: {
        type: "string",
      },
      severity: {
        enum: ["contraindicated", "major", "moderate", "minor", "unknown"],
        type: "string",
      },
      uncertainty: {
        items: { type: "string" },
        type: "array",
      },
      usedEvidenceIds: {
        items: {
          enum: promptEvidenceIds.length ? promptEvidenceIds : ["E1"],
          type: "string",
        },
        minItems: 1,
        type: "array",
      },
    },
    required: [
      "actionCategory",
      "confidence",
      "evidenceSupport",
      "management",
      "mechanism",
      "rationale",
      "severity",
      "uncertainty",
      "usedEvidenceIds",
    ],
    type: "object",
  };
}

function getRuntimeModelProvider(model: string): RuntimeModelProvider {
  return /^gpt-|^o[0-9]/i.test(model) ? "openai" : "anthropic";
}

function hasProviderKey(
  providerKeys: RuntimeAiProviderKeys,
  provider: RuntimeModelProvider,
): boolean {
  return provider === "openai"
    ? Boolean(providerKeys.openaiApiKey)
    : Boolean(providerKeys.anthropicApiKey);
}

function getMissingProviderKeyMessage(provider: RuntimeModelProvider): string {
  return provider === "openai"
    ? "OPENAI_API_KEY is missing"
    : "ANTHROPIC_API_KEY is missing";
}

function requireValidRuntimeAiEvidenceIds(
  answer: RuntimeAiAnswer,
  evidenceRows: RuntimeEvidenceRow[],
): RuntimeAiAnswer {
  const allowedIds = new Set(
    evidenceRows.map((_, index) => getPromptEvidenceId(index)),
  );
  const usedEvidenceIds = [...new Set(answer.usedEvidenceIds)].filter((id) =>
    allowedIds.has(id)
  );

  if (!usedEvidenceIds.length) {
    throw new Error(
      "Runtime AI answer did not cite any valid prompt evidence IDs.",
    );
  }

  return {
    ...answer,
    usedEvidenceIds,
  };
}

function buildRuntimeAiInteractionRow({
  answer,
  evidenceRows,
  interactionAiModel,
  leftId,
  leftNode,
  pairFingerprint,
  rightId,
  rightNode,
}: {
  answer: RuntimeAiAnswer;
  evidenceRows: RuntimeEvidenceRow[];
  interactionAiModel: string;
  leftId: string;
  leftNode?: KgNodeRow;
  pairFingerprint: string;
  rightId: string;
  rightNode?: KgNodeRow;
}): InteractionRpcRow {
  const usedEvidence = evidenceRows.filter((row, index) =>
    isRuntimeEvidenceUsed(row, index, answer.usedEvidenceIds)
  );

  return {
    input_pair: [leftId, rightId],
    matched_via: {
      leftNodeId: leftId,
      rightNodeId: rightId,
    },
    interaction: {
      actionCategory: answer.actionCategory,
      aiDecisionTrace: {
        chunkAssessments: usedEvidence.map((evidence) => ({
          chunkId: evidence.chunk_id ?? evidence.source_id ?? undefined,
          conclusion: evidence.content,
          promptEvidenceId: evidence.metadata.promptEvidenceId,
          quote: evidence.quote,
          sourceKind: evidence.source_kind,
          supportType: evidence.support_type,
        })),
        evidenceSupport: answer.evidenceSupport,
        finalRationale: answer.rationale,
        latencyMs: answer.latencyMs,
        model: interactionAiModel,
        promptEvidence: evidenceRows.map(toPromptEvidence),
        promptVersion: interactionAiPromptVersion,
        retrievalNotes:
          "Runtime AI assessment over indexed CPS/Health Canada/PubMed evidence only.",
        retrievalStrategyVersion: interactionAiRetrievalStrategyVersion,
        structuredOutputMethod: answer.structuredOutputMethod,
        structuredOutputRetryCount: answer.structuredOutputRetryCount,
        uncertainty: answer.uncertainty,
        usedEvidenceIds: answer.usedEvidenceIds,
        confidence: answer.confidence,
      },
      citations: buildRuntimeAiCitations(usedEvidence),
      evidenceLevel: `runtime_ai:${answer.evidenceSupport}`,
      id: `runtime-ai:${pairFingerprint}:${crypto.randomUUID()}`,
      management: answer.management,
      mechanism: answer.mechanism ?? answer.rationale,
      severity: answer.severity,
      source: "RuntimeAI",
      sourceId: leftNode?.id ?? leftId,
      targetId: rightNode?.id ?? rightId,
    },
  };
}

function buildRuntimeAiFailureRow({
  error,
  evidenceRows,
  interactionAiModel,
  latencyMs,
  leftId,
  leftNode,
  pairFingerprint,
  rightId,
  rightNode,
}: {
  error: unknown;
  evidenceRows: RuntimeEvidenceRow[];
  interactionAiModel: string;
  latencyMs: number;
  leftId: string;
  leftNode?: KgNodeRow;
  pairFingerprint: string;
  rightId: string;
  rightNode?: KgNodeRow;
}): InteractionRpcRow {
  const errorMessage = truncate(
    error instanceof Error ? error.message : String(error),
    600,
  );

  return {
    input_pair: [leftId, rightId],
    matched_via: {
      leftNodeId: leftId,
      rightNodeId: rightId,
    },
    interaction: {
      aiDecisionTrace: {
        chunkAssessments: [],
        confidence: null,
        finalRationale:
          `${interactionAiModel} did not return a usable structured assessment.`,
        latencyMs,
        model: interactionAiModel,
        promptEvidence: evidenceRows.map(toPromptEvidence),
        promptVersion: interactionAiPromptVersion,
        retrievalNotes:
          "Runtime AI assessment failed after evidence retrieval; prompt evidence is preserved for calibration review.",
        retrievalStrategyVersion: interactionAiRetrievalStrategyVersion,
        runtimeError: errorMessage,
        runtimeStatus: "failed",
        uncertainty: [
          "Model call failed or returned malformed structured output.",
        ],
        usedEvidenceIds: [],
      },
      citations: [],
      evidenceLevel: "runtime_ai:failed",
      id:
        `runtime-ai-failed:${pairFingerprint}:${interactionAiModel}:${crypto.randomUUID()}`,
      management: null,
      mechanism: `AI assessment failed: ${errorMessage}`,
      severity: "unknown",
      source: "RuntimeAI",
      sourceId: leftNode?.id ?? leftId,
      targetId: rightNode?.id ?? rightId,
    },
  };
}

async function captureRuntimeEvaluation({
  adminClient,
  evaluationSetId,
  evaluationSetName,
  inputLabels,
  interactions,
  lookupDurationMs,
  nodeIds,
  retrieveRuntimeEvidence,
  samplingReason,
  totalDurationMsBeforeCapture,
}: {
  adminClient: ReturnType<typeof createClient>;
  evaluationSetId: string;
  evaluationSetName: string;
  inputLabels: Record<string, string>;
  interactions: InteractionRpcRow[];
  lookupDurationMs: number;
  nodeIds: string[];
  retrieveRuntimeEvidence: boolean;
  samplingReason: string;
  totalDurationMsBeforeCapture: number;
}): Promise<{
  requestCount: number;
  requestIds: string[];
  runIds: string[];
  setId: string;
}> {
  const uniqueNodeIds = Array.from(new Set(nodeIds));
  const pairs = getInputPairs(uniqueNodeIds);

  if (pairs.length === 0) {
    return {
      requestCount: 0,
      requestIds: [],
      runIds: [],
      setId: evaluationSetId,
    };
  }

  const nodesById = await getKgNodesById(adminClient, uniqueNodeIds);
  const retrievedEvidenceByPair = retrieveRuntimeEvidence
    ? await retrieveRuntimeEvidenceByPair({
      adminClient,
      nodesById,
      pairs,
    })
    : new Map<string, RuntimeEvidenceRow[]>();
  const interactionsByPair = new Map<string, InteractionRpcRow[]>();

  for (const interaction of interactions) {
    const [leftId, rightId] = interaction.input_pair ?? [];

    if (!leftId || !rightId) {
      continue;
    }

    const key = pairFingerprint(leftId, rightId);
    interactionsByPair.set(key, [
      ...(interactionsByPair.get(key) ?? []),
      interaction,
    ]);
  }

  const captures = pairs.flatMap(([leftId, rightId]) => {
    const leftNode = nodesById.get(leftId);
    const rightNode = nodesById.get(rightId);
    const leftLabel = inputLabels[leftId] ?? leftNode?.canonical_name ?? leftId;
    const rightLabel = inputLabels[rightId] ?? rightNode?.canonical_name ??
      rightId;
    const requestFingerprint = `kg-node-pair:${pairFingerprint(leftId, rightId)}`;
    const allPairInteractions =
      interactionsByPair.get(pairFingerprint(leftId, rightId)) ?? [];
    const interactionGroups = allPairInteractions.length
      ? allPairInteractions.map((interaction) => [interaction])
      : [[] as InteractionRpcRow[]];

    return interactionGroups.map((pairInteractions) => {
    const topInteraction = pairInteractions[0] ?? null;
    const aiDecisionTrace = topInteraction?.interaction.aiDecisionTrace &&
        typeof topInteraction.interaction.aiDecisionTrace === "object"
      ? topInteraction.interaction.aiDecisionTrace as Record<string, unknown>
      : null;
    const isRuntimeAi = topInteraction?.interaction.source === "RuntimeAI";
    const isFailedRuntimeAi = isRuntimeAi &&
      getTraceString(aiDecisionTrace, "runtimeStatus") === "failed";
    const answerCategory = isFailedRuntimeAi
      ? null
      : getAnswerCategory(topInteraction);
    const answerSummary = buildAnswerSummary(
      leftLabel,
      rightLabel,
      topInteraction,
    );
    const resolvedSourceId = topInteraction?.matched_via?.leftNodeId ?? leftId;
    const resolvedTargetId = topInteraction?.matched_via?.rightNodeId ??
      rightId;
    const tracePromptEvidenceRows = isRuntimeAi
      ? getTracePromptEvidenceRows(aiDecisionTrace)
      : [];
    const evidenceRows = markAiUsedEvidence(
      rerankEvidenceRows(
        tracePromptEvidenceRows.length
          ? tracePromptEvidenceRows
          : [
            ...buildEvidenceRows(pairInteractions),
            ...(retrievedEvidenceByPair.get(pairFingerprint(leftId, rightId)) ??
              []),
          ],
      ),
      topInteraction?.interaction.aiDecisionTrace,
    );
    const model = isRuntimeAi
      ? getTraceString(aiDecisionTrace, "model") ?? defaultInteractionAiModel
      : "deterministic-published-kg-lookup";
    const promptVersion = isRuntimeAi
      ? getTraceString(aiDecisionTrace, "promptVersion") ??
        interactionAiPromptVersion
      : null;
    const retrievalStrategyVersion = isRuntimeAi
      ? getTraceString(aiDecisionTrace, "retrievalStrategyVersion") ??
        interactionAiRetrievalStrategyVersion
      : "published-kg-runtime-v1";

    return {
      answer_category: answerCategory,
      answer_summary: answerSummary,
      automation_tier: isFailedRuntimeAi ? "quarantine" : "sample_for_audit",
      confidence: isFailedRuntimeAi ? null : getTraceConfidence(aiDecisionTrace),
      decision_trace: {
        chunkAssessments: evidenceRows.map((evidence) => ({
          chunkId: evidence.chunk_id,
          conclusion: evidence.content,
          quote: evidence.quote,
          supportType: evidence.support_type,
        })),
        finalRationale:
          typeof aiDecisionTrace?.finalRationale === "string"
            ? aiDecisionTrace.finalRationale
            : answerSummary,
        retrievalNotes:
          typeof aiDecisionTrace?.retrievalNotes === "string"
            ? aiDecisionTrace.retrievalNotes
            : "Deterministic runtime lookup against published KG interactions using the selected nodes plus has_ingredient/subclass_of expansion.",
        runtime: {
          capture_version: "check-interactions-runtime-evaluation-v2",
          ai_answer_source: isRuntimeAi ? "runtime_ai" : "deterministic_kg",
          evidence_retrieval_enabled: retrieveRuntimeEvidence,
          evidence_retrieval_strategy: "indexed-monograph-pubmed-runtime-v1",
          interaction_count: allPairInteractions.length,
          lookup_duration_ms: lookupDurationMs,
          retrieved_evidence_count:
            retrievedEvidenceByPair.get(pairFingerprint(leftId, rightId))
              ?.length ?? 0,
          total_duration_ms_before_capture: totalDurationMsBeforeCapture,
        },
        uncertainty: pairInteractions.length
          ? []
          : [
            "No published KG edge matched this pair; this does not prove absence of an interaction outside the current evidence base.",
          ],
        ...(aiDecisionTrace ?? {}),
      },
      evidence: evidenceRows,
      input_source_text: leftLabel,
      input_target_text: rightLabel,
      management: isFailedRuntimeAi
        ? null
        : topInteraction?.interaction.management ?? null,
      model,
      prompt_version: promptVersion,
      request_fingerprint: requestFingerprint,
      request_metadata: {
        input_node_ids: [leftId, rightId],
        input_nodes: [
          serializeNode(leftNode, leftId, leftLabel),
          serializeNode(rightNode, rightId, rightLabel),
        ],
        requested_at: new Date().toISOString(),
        runtime_capture: true,
      },
      resolved_entities: {
        inputs: [
          serializeNode(leftNode, leftId, leftLabel),
          serializeNode(rightNode, rightId, rightLabel),
        ],
        matched_via: topInteraction?.matched_via ?? null,
        matches: pairInteractions.map((row) => ({
          interaction_id: row.interaction.id,
          matched_via: row.matched_via ?? null,
          source_id: row.interaction.sourceId ?? null,
          target_id: row.interaction.targetId ?? null,
        })),
      },
      resolved_source_id: resolvedSourceId,
      resolved_target_id: resolvedTargetId,
      retrieval_strategy_version: retrievalStrategyVersion,
      run_metadata: {
        capture_source: "check-interactions",
        evidence_retrieval_enabled: retrieveRuntimeEvidence,
        evidence_retrieval_strategy: "indexed-monograph-pubmed-runtime-v1",
        model,
        prompt_version: promptVersion,
        input_pair: [leftId, rightId],
        matched_interaction_ids: pairInteractions.map((row) =>
          row.interaction.id
        ),
        retrieved_evidence_count:
          retrievedEvidenceByPair.get(pairFingerprint(leftId, rightId))
            ?.length ?? 0,
        result_count: pairInteractions.length,
      },
      sampling_reason: normalizeSamplingReason(samplingReason),
      severity: isFailedRuntimeAi
        ? "unknown"
        : topInteraction?.interaction.severity ?? "unknown",
      status: isFailedRuntimeAi ? "failed" : "completed",
    };
    });
  });

  const { data, error } = await adminClient.rpc(
    "capture_interaction_evaluation_runs",
    {
      payload: {
        captures,
        criteria: {
          capture_source: "check-interactions",
          pair_unit: "selected_node_pair",
          runtime_checker: "published_kg_lookup",
        },
        description:
          "Live request-time captures from the interaction checker. Pharmacists evaluate whether entity resolution, retrieved evidence, and the final action category match the request.",
        is_locked: false,
        purpose: "calibration",
        set_id: evaluationSetId,
        set_name: evaluationSetName,
        version: 1,
      },
    },
  );

  if (error) {
    throw error;
  }

  const result = (data ?? {}) as EvaluationCaptureResult;

  return {
    requestCount: result.requestCount ?? captures.length,
    requestIds: result.requestIds ?? [],
    runIds: result.runIds ?? [],
    setId: result.setId ?? evaluationSetId,
  };
}

async function retrieveRuntimeEvidenceByPair({
  adminClient,
  nodesById,
  pairs,
}: {
  adminClient: ReturnType<typeof createClient>;
  nodesById: Map<string, KgNodeRow>;
  pairs: Array<[string, string]>;
}): Promise<Map<string, RuntimeEvidenceRow[]>> {
  const evidenceByPair = new Map<string, RuntimeEvidenceRow[]>();
  const uniqueNodeIds = [
    ...new Set(pairs.flatMap(([leftId, rightId]) => [leftId, rightId])),
  ];
  const lookupScopes = await loadLookupScopes(adminClient, uniqueNodeIds);

  await Promise.all(
    pairs.map(async ([leftId, rightId]) => {
      const leftNode = nodesById.get(leftId);
      const rightNode = nodesById.get(rightId);
      const pair = pairFingerprint(leftId, rightId);

      if (!leftNode || !rightNode) {
        evidenceByPair.set(pair, []);
        return;
      }

      const [leftMonographEvidence, rightMonographEvidence, pubmedEvidence] =
        await Promise.all([
          loadRuntimeMonographEvidenceForSide({
            adminClient,
            counterpartText: rightNode.canonical_name,
            node: leftNode,
            side: "source",
          }),
          loadRuntimeMonographEvidenceForSide({
            adminClient,
            counterpartText: leftNode.canonical_name,
            node: rightNode,
            side: "target",
          }),
          loadRuntimePubMedEvidenceForPair({
            adminClient,
            leftScope: lookupScopes.get(leftId) ?? [leftId],
            rightScope: lookupScopes.get(rightId) ?? [rightId],
          }),
        ]);

      evidenceByPair.set(
        pair,
        rerankEvidenceRows([
          ...leftMonographEvidence,
          ...rightMonographEvidence,
          ...pubmedEvidence,
        ]).slice(0, 18),
      );
    }),
  );

  return evidenceByPair;
}

async function loadLookupScopes(
  adminClient: ReturnType<typeof createClient>,
  nodeIds: string[],
): Promise<Map<string, string[]>> {
  const scopes = new Map<string, string[]>();

  await Promise.all(
    nodeIds.map(async (nodeId) => {
      const scope = new Set<string>([nodeId]);
      let frontier = [nodeId];

      for (let depth = 0; depth < 4 && frontier.length; depth += 1) {
        const { data, error } = await adminClient
          .from("kg_edge")
          .select("source_id,target_id")
          .in("source_id", frontier)
          .in("relation", ["has_ingredient", "subclass_of"])
          .limit(500);

        if (error) {
          throw error;
        }

        const nextFrontier = [
          ...new Set(
            ((data ?? []) as KgEdgeRow[])
              .map((row) => row.target_id)
              .filter((targetId) => !scope.has(targetId)),
          ),
        ];

        for (const targetId of nextFrontier) {
          scope.add(targetId);
        }

        frontier = nextFrontier;
      }

      scopes.set(nodeId, [...scope]);
    }),
  );

  return scopes;
}

async function loadRuntimeMonographEvidenceForSide({
  adminClient,
  counterpartText,
  node,
  side,
}: {
  adminClient: ReturnType<typeof createClient>;
  counterpartText: string;
  node: KgNodeRow;
  side: "source" | "target";
}): Promise<RuntimeEvidenceRow[]> {
  const [cpsChunks, healthCanadaChunks] = await Promise.all([
    loadCpsInteractionChunks(adminClient, node),
    loadHealthCanadaInteractionChunks(adminClient, node),
  ]);
  const selectedChunks = [
    ...rankInteractionChunks(cpsChunks).slice(0, 4),
    ...rankInteractionChunks(healthCanadaChunks).slice(0, 4),
  ];

  return selectedChunks.map((chunk, index): RuntimeEvidenceRow => {
    const facts = extractMonographFacts(chunk.content, counterpartText);
    const supportType = classifyMonographSupportType(chunk, facts);

    return {
      chunk_id: chunk.id,
      content: chunk.content,
      metadata: {
        counterpartText,
        extractedFacts: facts,
        kgNodeId: chunk.node_id,
        retrieval: "runtime_monograph_evidence",
        section: chunk.section,
        side,
      },
      quote: selectEvidenceQuote(chunk.content, counterpartText),
      rank: index,
      source_id: chunk.id,
      source_kind: chunk.sourceKind,
      source_table: "kg_chunk",
      support_type: supportType,
      used_in_answer: false,
    };
  });
}

async function loadCpsInteractionChunks(
  adminClient: ReturnType<typeof createClient>,
  node: KgNodeRow,
): Promise<Array<KgChunkRow & { sourceKind: "cps_monograph" }>> {
  const candidateNodes = await loadCpsCandidateNodes(adminClient, node);
  const monographNodes = await resolveCpsMonographNodes(adminClient, [
    node,
    ...candidateNodes,
  ]);

  if (!monographNodes.length) {
    return [];
  }

  const chunks = await loadChunksForNodes(
    adminClient,
    monographNodes.map((monograph) => monograph.id),
    "CPS",
  );

  return selectInteractionOrFallbackChunks(chunks).map((chunk) => ({
    ...chunk,
    sourceKind: "cps_monograph",
  }));
}

async function loadHealthCanadaInteractionChunks(
  adminClient: ReturnType<typeof createClient>,
  node: KgNodeRow,
): Promise<
  Array<KgChunkRow & { sourceKind: "health_canada_product_monograph" }>
> {
  const healthCanadaNodes = await loadHealthCanadaCandidateNodes(
    adminClient,
    node,
  );
  const productNodes = await loadHealthCanadaProductNodes(
    adminClient,
    healthCanadaNodes,
  );

  if (!productNodes.length) {
    return [];
  }

  const chunks = await loadChunksForNodes(
    adminClient,
    productNodes.map((product) => product.id),
    "HEALTH_CANADA_PRODUCT_MONOGRAPH",
  );

  return selectInteractionOrFallbackChunks(chunks).map((chunk) => ({
    ...chunk,
    sourceKind: "health_canada_product_monograph",
  }));
}

async function loadCpsCandidateNodes(
  adminClient: ReturnType<typeof createClient>,
  node: KgNodeRow,
): Promise<KgNodeRow[]> {
  const nodeIds = new Set<string>();

  if (node.source === "CPS") {
    nodeIds.add(node.id);
  }

  for (const id of await loadCrosswalkNodeIds(adminClient, node.id, "CPS")) {
    nodeIds.add(id);
  }

  for (const product of await loadReverseLinkedProducts(
    adminClient,
    [...nodeIds],
    "CPS",
  )) {
    nodeIds.add(product.id);
  }

  return [...(await getKgNodesById(adminClient, [...nodeIds])).values()];
}

async function resolveCpsMonographNodes(
  adminClient: ReturnType<typeof createClient>,
  candidateNodes: KgNodeRow[],
): Promise<KgNodeRow[]> {
  const monographNodesById = new Map<string, KgNodeRow>();
  const normalizedCandidateNames = new Set<string>();

  for (const node of candidateNodes) {
    if (node.source !== "CPS" || node.type !== "drug") {
      normalizedCandidateNames.add(normalizeName(node.canonical_name));
      continue;
    }

    if (readStringIdentifier(node, "caas_type") === "MONOGRAPH") {
      monographNodesById.set(node.id, node);
    }

    for (const value of [
      node.canonical_name,
      stripStrengthSuffix(node.canonical_name),
      readStringIdentifier(node, "generic_name"),
      readStringIdentifier(node, "brand_name"),
      readStringIdentifier(node, "name"),
    ]) {
      const normalized = normalizeName(value);

      if (normalized) {
        normalizedCandidateNames.add(normalized);
      }
    }
  }

  if (normalizedCandidateNames.size) {
    const allMonographs = await loadAllCpsMonographs(adminClient);

    for (const monograph of allMonographs) {
      if (normalizedCandidateNames.has(normalizeName(monograph.canonical_name))) {
        monographNodesById.set(monograph.id, monograph);
      }
    }
  }

  return [...monographNodesById.values()];
}

async function loadHealthCanadaCandidateNodes(
  adminClient: ReturnType<typeof createClient>,
  node: KgNodeRow,
): Promise<KgNodeRow[]> {
  const nodeIds = new Set<string>();

  if (node.source === "HEALTH_CANADA_DPD") {
    nodeIds.add(node.id);
  }

  for (const id of await loadCrosswalkNodeIds(
    adminClient,
    node.id,
    "HEALTH_CANADA_DPD",
  )) {
    nodeIds.add(id);
  }

  return [...(await getKgNodesById(adminClient, [...nodeIds])).values()];
}

async function loadHealthCanadaProductNodes(
  adminClient: ReturnType<typeof createClient>,
  nodes: KgNodeRow[],
): Promise<KgNodeRow[]> {
  const productNodesById = new Map<string, KgNodeRow>();

  for (const node of nodes) {
    if (node.source === "HEALTH_CANADA_DPD" && node.type === "drug") {
      productNodesById.set(node.id, node);
    }
  }

  for (const product of await loadReverseLinkedProducts(
    adminClient,
    nodes.map((node) => node.id),
    "HEALTH_CANADA_DPD",
  )) {
    productNodesById.set(product.id, product);
  }

  return [...productNodesById.values()];
}

async function loadReverseLinkedProducts(
  adminClient: ReturnType<typeof createClient>,
  nodeIds: string[],
  source: "CPS" | "HEALTH_CANADA_DPD",
): Promise<KgNodeRow[]> {
  const uniqueNodeIds = [...new Set(nodeIds)];

  if (!uniqueNodeIds.length) {
    return [];
  }

  const { data, error } = await adminClient
    .from("kg_edge")
    .select("source_id,target_id")
    .eq("source", source)
    .in("relation", ["has_ingredient", "subclass_of"])
    .in("target_id", uniqueNodeIds.slice(0, 75))
    .limit(500);

  if (error) {
    throw error;
  }

  const productIds = [
    ...new Set(((data ?? []) as KgEdgeRow[]).map((row) => row.source_id)),
  ];
  const nodes = [...(await getKgNodesById(adminClient, productIds)).values()];

  return nodes.filter((node) => node.source === source && node.type === "drug");
}

async function loadCrosswalkNodeIds(
  adminClient: ReturnType<typeof createClient>,
  nodeId: string,
  targetSource: string,
): Promise<string[]> {
  const [sourceAResult, sourceBResult] = await Promise.all([
    adminClient
      .from("kg_source_crosswalk")
      .select("source_b_node_id")
      .eq("source_a_node_id", nodeId)
      .eq("source_b", targetSource)
      .in("match_status", ["matched", "possible_match"]),
    adminClient
      .from("kg_source_crosswalk")
      .select("source_a_node_id")
      .eq("source_b_node_id", nodeId)
      .eq("source_a", targetSource)
      .in("match_status", ["matched", "possible_match"]),
  ]);

  if (sourceAResult.error) {
    throw sourceAResult.error;
  }

  if (sourceBResult.error) {
    throw sourceBResult.error;
  }

  return [
    ...((sourceAResult.data ?? []) as CrosswalkSourceBRow[]).map(
      (row) => row.source_b_node_id,
    ),
    ...((sourceBResult.data ?? []) as CrosswalkSourceARow[]).map(
      (row) => row.source_a_node_id,
    ),
  ];
}

async function loadAllCpsMonographs(
  adminClient: ReturnType<typeof createClient>,
): Promise<KgNodeRow[]> {
  const { data, error } = await adminClient
    .from("kg_node")
    .select("id,type,canonical_name,identifiers,summary,source")
    .eq("source", "CPS")
    .eq("type", "drug")
    .eq("identifiers->>caas_type", "MONOGRAPH")
    .limit(1500);

  if (error) {
    throw error;
  }

  return (data ?? []) as KgNodeRow[];
}

async function loadChunksForNodes(
  adminClient: ReturnType<typeof createClient>,
  nodeIds: string[],
  source: "CPS" | "HEALTH_CANADA_PRODUCT_MONOGRAPH",
): Promise<KgChunkRow[]> {
  const uniqueNodeIds = [...new Set(nodeIds)];

  if (!uniqueNodeIds.length) {
    return [];
  }

  const { data, error } = await adminClient
    .from("kg_chunk")
    .select("id,node_id,section,content,source")
    .eq("source", source)
    .in("node_id", uniqueNodeIds.slice(0, 75))
    .limit(500);

  if (error) {
    throw error;
  }

  return (data ?? []) as KgChunkRow[];
}

async function loadRuntimePubMedEvidenceForPair({
  adminClient,
  leftScope,
  rightScope,
}: {
  adminClient: ReturnType<typeof createClient>;
  leftScope: string[];
  rightScope: string[];
}): Promise<RuntimeEvidenceRow[]> {
  const candidates = await loadRuntimePubMedCandidatesForPair({
    adminClient,
    leftScope,
    rightScope,
  });

  if (!candidates.length) {
    return [];
  }

  const evidenceRows = await loadRuntimePubMedEvidenceForCandidates(
    adminClient,
    candidates.slice(0, 8),
  );
  const candidateFallbackRows = candidates
    .filter((candidate) => candidate.source_quote)
    .slice(0, 4)
    .map((candidate, index): RuntimeEvidenceRow => ({
      chunk_id: null,
      content: [
        `PubMed candidate ${candidate.pmid}.`,
        candidate.article_title ? `Title: ${candidate.article_title}.` : null,
        candidate.mechanism ? `Mechanism: ${candidate.mechanism}` : null,
        candidate.management ? `Management: ${candidate.management}` : null,
        candidate.source_quote ? `Quote: ${candidate.source_quote}` : null,
      ]
        .filter(Boolean)
        .join(" "),
      metadata: {
        aiDecision: candidate.ai_decision ?? null,
        aiReviewScore: candidate.ai_review_score ?? null,
        articleTitle: candidate.article_title ?? null,
        articleYear: candidate.article_year ?? null,
        automationTier: candidate.automation_tier ?? null,
        candidateId: candidate.id,
        evidenceLevel: candidate.evidence_level ?? null,
        extractionConfidence: candidate.extraction_confidence ?? null,
        objectText: candidate.object_text,
        pmid: candidate.pmid,
        reviewStatus: candidate.review_status,
        subjectText: candidate.subject_text,
      },
      quote: candidate.source_quote ?? null,
      rank: index,
      source_id: candidate.id,
      source_kind: "pubmed",
      source_table: "pubmed_interaction_candidate",
      support_type: "supports_interaction",
      used_in_answer: false,
    }));

  return rerankEvidenceRows([...evidenceRows, ...candidateFallbackRows]).slice(
    0,
    8,
  );
}

async function loadRuntimePubMedCandidatesForPair({
  adminClient,
  leftScope,
  rightScope,
}: {
  adminClient: ReturnType<typeof createClient>;
  leftScope: string[];
  rightScope: string[];
}): Promise<PubMedCandidateRow[]> {
  const select =
    "id,pmid,article_title,article_year,subject_text,object_text,severity,mechanism,management,evidence_level,extraction_confidence,source_quote,review_status,interaction_action_category,ai_decision,ai_review_score,automation_tier";
  const [directResult, reverseResult] = await Promise.all([
    adminClient
      .from("pubmed_interaction_candidate")
      .select(select)
      .in("resolved_source_id", leftScope.slice(0, 75))
      .in("resolved_target_id", rightScope.slice(0, 75))
      .neq("review_status", "rejected")
      .limit(12),
    adminClient
      .from("pubmed_interaction_candidate")
      .select(select)
      .in("resolved_source_id", rightScope.slice(0, 75))
      .in("resolved_target_id", leftScope.slice(0, 75))
      .neq("review_status", "rejected")
      .limit(12),
  ]);

  if (directResult.error) {
    throw directResult.error;
  }

  if (reverseResult.error) {
    throw reverseResult.error;
  }

  const candidatesById = new Map<string, PubMedCandidateRow>();

  for (const candidate of [
    ...((directResult.data ?? []) as PubMedCandidateRow[]),
    ...((reverseResult.data ?? []) as PubMedCandidateRow[]),
  ]) {
    candidatesById.set(candidate.id, candidate);
  }

  return [...candidatesById.values()].sort(
    (left, right) =>
      pubMedCandidateRank(left) - pubMedCandidateRank(right) ||
      (right.ai_review_score ?? 0) - (left.ai_review_score ?? 0) ||
      (right.extraction_confidence ?? 0) - (left.extraction_confidence ?? 0),
  );
}

async function loadRuntimePubMedEvidenceForCandidates(
  adminClient: ReturnType<typeof createClient>,
  candidates: PubMedCandidateRow[],
): Promise<RuntimeEvidenceRow[]> {
  const candidateIds = candidates.map((candidate) => candidate.id);
  const candidateById = new Map(candidates.map((candidate) => [
    candidate.id,
    candidate,
  ]));

  if (!candidateIds.length) {
    return [];
  }

  const { data, error } = await adminClient
    .from("pubmed_candidate_evidence")
    .select(
      "candidate_id,support_type,quote,confidence,pubmed_evidence_chunk:evidence_chunk_id(id,pmid,pmcid,source_type,section_title,section_path,label,content,structured_content,relevance_score,extraction_confidence,license,source_url)",
    )
    .in("candidate_id", candidateIds)
    .limit(80);

  if (error) {
    throw error;
  }

  return ((data ?? []) as PubMedEvidenceJoinRow[])
    .flatMap((row): RuntimeEvidenceRow[] => {
      const chunk = Array.isArray(row.pubmed_evidence_chunk)
        ? row.pubmed_evidence_chunk[0]
        : row.pubmed_evidence_chunk;
      const candidate = candidateById.get(row.candidate_id);

      if (!chunk?.content) {
        return [];
      }

      return [
        {
          chunk_id: chunk.id,
          content: chunk.content,
          metadata: {
            articleTitle: candidate?.article_title ?? null,
            articleYear: candidate?.article_year ?? null,
            candidateId: row.candidate_id,
            confidence: row.confidence ?? null,
            extractionConfidence: chunk.extraction_confidence ?? null,
            label: chunk.label ?? null,
            license: chunk.license ?? null,
            pmcid: chunk.pmcid ?? null,
            pmid: chunk.pmid,
            relevanceScore: chunk.relevance_score ?? null,
            reviewStatus: candidate?.review_status ?? null,
            sectionPath: chunk.section_path ?? [],
            sectionTitle: chunk.section_title ?? null,
            sourceType: chunk.source_type,
            sourceUrl: chunk.source_url ?? null,
            structuredContent: chunk.structured_content ?? {},
          },
          quote: row.quote ?? null,
          rank: 0,
          source_id: chunk.id,
          source_kind: "pubmed",
          source_table: "pubmed_evidence_chunk",
          support_type: row.support_type,
          used_in_answer: false,
        },
      ];
    })
    .sort(
      (left, right) =>
        supportTypeRank(left.support_type) -
          supportTypeRank(right.support_type) ||
        Number(right.metadata.confidence ?? 0) -
          Number(left.metadata.confidence ?? 0),
    )
    .slice(0, 8);
}

async function getKgNodesById(
  adminClient: ReturnType<typeof createClient>,
  nodeIds: string[],
): Promise<Map<string, KgNodeRow>> {
  const { data, error } = await adminClient
    .from("kg_node")
    .select("id,type,canonical_name,identifiers,summary,source")
    .in("id", nodeIds);

  if (error) {
    throw error;
  }

  return new Map<string, KgNodeRow>(
    ((data ?? []) as KgNodeRow[]).map((node) => [node.id, node]),
  );
}

function selectInteractionOrFallbackChunks(chunks: KgChunkRow[]): KgChunkRow[] {
  const interactionChunks = chunks.filter(isInteractionChunk);

  if (interactionChunks.length) {
    return interactionChunks;
  }

  return chunks.filter(isFallbackSafetyChunk);
}

function rankInteractionChunks<
  T extends KgChunkRow & {
    sourceKind: "cps_monograph" | "health_canada_product_monograph";
  },
>(chunks: T[]): T[] {
  return [...chunks].sort((left, right) => {
    const leftInteraction = isInteractionChunk(left) ? 1 : 0;
    const rightInteraction = isInteractionChunk(right) ? 1 : 0;
    const leftDrugInteraction = /drug[_\s-]*interactions?/i.test(
      left.section ?? "",
    )
      ? 1
      : 0;
    const rightDrugInteraction = /drug[_\s-]*interactions?/i.test(
      right.section ?? "",
    )
      ? 1
      : 0;

    return (
      rightDrugInteraction - leftDrugInteraction ||
      rightInteraction - leftInteraction ||
      left.content.length - right.content.length
    );
  });
}

function isInteractionChunk(chunk: Pick<KgChunkRow, "section" | "content">) {
  return /interactions?/i.test(
    `${chunk.section ?? ""} ${chunk.content.slice(0, 200)}`,
  );
}

function isFallbackSafetyChunk(chunk: Pick<KgChunkRow, "section" | "content">) {
  return /(warning|precaution|contraindication)/i.test(
    `${chunk.section ?? ""} ${chunk.content.slice(0, 200)}`,
  );
}

function extractMonographFacts(content: string, counterpartText = "") {
  const normalizedCounterpart = normalizeName(counterpartText);
  const normalizedContent = normalizeName(content);
  const counterpartTokens = normalizedCounterpart
    .split(" ")
    .filter((token) => token.length >= 5);

  return {
    counterpartMentioned: counterpartTokens.some((token) =>
      normalizedContent.includes(token)
    ),
    enzymes: uniqueMatches(content, enzymePattern),
    management: extractManagementSignals(content),
    receptors: uniqueMatches(content, receptorPattern),
    roles: extractRoleSignals(content),
    transporters: uniqueMatches(content, transporterPattern),
  };
}

function classifyMonographSupportType(
  chunk: KgChunkRow,
  facts: ReturnType<typeof extractMonographFacts>,
): RuntimeEvidenceRow["support_type"] {
  if (/no (clinically )?significant .*interactions?/i.test(chunk.content)) {
    return "contradicts_or_limits";
  }

  if (facts.counterpartMentioned) {
    return "supports_interaction";
  }

  if (facts.management.length) {
    return "supports_management";
  }

  return "supports_mechanism";
}

function selectEvidenceQuote(content: string, counterpartText: string): string {
  const normalizedCounterpart = normalizeName(counterpartText);
  const counterpartTokens = normalizedCounterpart
    .split(" ")
    .filter((token) => token.length >= 5);
  const sentences = content
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
  const preferred =
    sentences.find((sentence) => {
      const normalizedSentence = normalizeName(sentence);

      return counterpartTokens.some((token) => normalizedSentence.includes(token));
    }) ??
    sentences.find((sentence) =>
      /(cyp|ugt|p-gp|p glycoprotein|inhibit|induc|substrate|monitor|avoid|dose)/i.test(
        sentence,
      ),
    ) ??
    sentences[0] ??
    content;

  return truncate(preferred, 700);
}

function extractRoleSignals(content: string): string[] {
  const roles: string[] = [];

  if (/\binhibit(?:ors?|s|ed|ing|ion)?\b/i.test(content)) {
    roles.push("inhibitor");
  }

  if (/\binduc(?:ers?|es|ed|ing|tion)?\b/i.test(content)) {
    roles.push("inducer");
  }

  if (/\bsubstrates?\b/i.test(content)) {
    roles.push("substrate");
  }

  if (/\bantagonists?\b/i.test(content)) {
    roles.push("antagonist");
  }

  if (/\bagonists?\b/i.test(content)) {
    roles.push("agonist");
  }

  return roles;
}

function extractManagementSignals(content: string): string[] {
  const signals: string[] = [];

  for (const [label, pattern] of managementSignalPatterns) {
    if (pattern.test(content)) {
      signals.push(label);
    }
  }

  return signals;
}

function uniqueMatches(content: string, pattern: RegExp): string[] {
  pattern.lastIndex = 0;

  return [
    ...new Set(
      [...content.matchAll(pattern)].map((match) =>
        match[0].replace(/\s+/g, " ").trim(),
      ),
    ),
  ];
}

function buildEvidenceRows(interactions: InteractionRpcRow[]): RuntimeEvidenceRow[] {
  if (!interactions.length) {
    return [
      {
        chunk_id: null,
        content:
          "No published KG interaction edge was returned for this input pair.",
        metadata: {
          source: "check_published_interactions",
        },
        quote: null,
        rank: 0,
        source_id: null,
        source_kind: "kg_edge",
        source_table: "kg_edge",
        support_type: "source_silent",
        used_in_answer: true,
      },
    ];
  }

  return interactions.map((row, index) => {
    const interaction = row.interaction;
    const contentParts = [
      `Published KG edge ${interaction.id}.`,
      `Action category: ${getAnswerCategory(row)}.`,
      `Severity: ${interaction.severity ?? "unknown"}.`,
      interaction.mechanism ? `Mechanism: ${interaction.mechanism}` : null,
      interaction.management ? `Management: ${interaction.management}` : null,
      interaction.evidenceLevel
        ? `Evidence level: ${interaction.evidenceLevel}.`
        : null,
      formatCitations(interaction.citations),
    ].filter(Boolean);

    return {
      chunk_id: null,
      content: contentParts.join(" "),
      metadata: {
        citations: Array.isArray(interaction.citations)
          ? interaction.citations
          : [],
        interaction_source: interaction.source ?? null,
        matched_via: row.matched_via ?? null,
        source_id: interaction.sourceId ?? null,
        target_id: interaction.targetId ?? null,
      },
      quote: interaction.mechanism ?? interaction.management ?? null,
      rank: index,
      source_id: interaction.id,
      source_kind: "kg_edge",
      source_table: "kg_edge",
      support_type: "supports_interaction",
      used_in_answer: index === 0,
    };
  });
}

function buildAnswerSummary(
  leftLabel: string,
  rightLabel: string,
  topInteraction: InteractionRpcRow | null,
): string {
  if (!topInteraction) {
    return `No known interaction was found between ${leftLabel} and ${rightLabel} in the currently published knowledge graph.`;
  }

  const mechanism = topInteraction.interaction.mechanism?.trim();

  if (mechanism) {
    return mechanism;
  }

  return `A published knowledge-graph interaction was found between ${leftLabel} and ${rightLabel}.`;
}

function formatCitations(citations: unknown): string | null {
  if (!Array.isArray(citations) || !citations.length) {
    return null;
  }

  const citationText = citations
    .map((citation) => {
      if (
        citation &&
        typeof citation === "object" &&
        "pmid" in citation &&
        typeof (citation as { pmid?: unknown }).pmid === "string"
      ) {
        return `PMID ${(citation as { pmid: string }).pmid}`;
      }

      return null;
    })
    .filter(Boolean)
    .join(", ");

  return citationText ? `Citations: ${citationText}.` : null;
}

function buildRuntimeAiCitations(evidenceRows: RuntimeEvidenceRow[]) {
  return evidenceRows.flatMap((row) => {
    const pmid = row.metadata.pmid;

    if (typeof pmid !== "string" || !pmid) {
      return [];
    }

    return [
      {
        pmid,
        quote: row.quote ?? undefined,
        title: typeof row.metadata.articleTitle === "string"
          ? row.metadata.articleTitle
          : undefined,
        year: typeof row.metadata.articleYear === "number"
          ? row.metadata.articleYear
          : undefined,
      },
    ];
  });
}

function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);

  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model output did not contain a JSON object.");
  }

  return trimmed.slice(start, end + 1);
}

function getAnswerCategory(
  topInteraction: InteractionRpcRow | null,
): InteractionActionCategory {
  const actionCategory = topInteraction?.interaction.actionCategory;

  if (actionCategory && isInteractionActionCategory(actionCategory)) {
    return actionCategory;
  }

  switch (topInteraction?.interaction.severity) {
    case "contraindicated":
      return "avoid_combination";
    case "major":
      return "consider_therapy_modification";
    case "moderate":
      return "monitor_therapy";
    case "minor":
      return "no_action_needed";
    default:
      return topInteraction ? "monitor_therapy" : "no_known_interaction";
  }
}

function getAiInferenceMode(value: unknown): "always" | "on_miss_or_uncertain" {
  return value === "always" ? "always" : "on_miss_or_uncertain";
}

function getEvidenceId(row: RuntimeEvidenceRow): string {
  return row.chunk_id ?? row.source_id ?? `${row.source_kind}:${row.rank}`;
}

function getPromptEvidenceId(index: number): string {
  return `E${index + 1}`;
}

function isRuntimeEvidenceUsed(
  row: RuntimeEvidenceRow,
  index: number,
  usedEvidenceIds: Iterable<string>,
): boolean {
  const used = usedEvidenceIds instanceof Set
    ? usedEvidenceIds
    : new Set(usedEvidenceIds);
  const promptEvidenceId = typeof row.metadata.promptEvidenceId === "string"
    ? row.metadata.promptEvidenceId
    : getPromptEvidenceId(index);

  return used.has(promptEvidenceId) || used.has(getEvidenceId(row));
}

function getTraceConfidence(trace: unknown): number | null {
  if (!trace || typeof trace !== "object") {
    return null;
  }

  const confidence = (trace as { confidence?: unknown }).confidence;

  return typeof confidence === "number" ? confidence : null;
}

function pubMedCandidateRank(candidate: PubMedCandidateRow): number {
  if (candidate.review_status === "published") {
    return 0;
  }

  if (candidate.automation_tier === "auto_publish_ready") {
    return 1;
  }

  if (candidate.ai_decision === "publishable") {
    return 2;
  }

  if (candidate.review_status === "candidate") {
    return 3;
  }

  return 4;
}

function readStringIdentifier(node: KgNodeRow, key: string): string {
  const value = node.identifiers?.[key];

  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }

  return "";
}

function rerankEvidenceRows(rows: RuntimeEvidenceRow[]): RuntimeEvidenceRow[] {
  const seen = new Set<string>();
  const deduped: RuntimeEvidenceRow[] = [];

  for (const row of rows) {
    const key = [
      row.source_kind,
      row.source_table ?? "",
      row.source_id ?? "",
      row.chunk_id ?? "",
      row.support_type,
      row.content.slice(0, 120),
    ].join(":");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(row);
  }

  return deduped
    .sort(
      (left, right) =>
        Number(right.used_in_answer) - Number(left.used_in_answer) ||
        sourceKindRank(left.source_kind) - sourceKindRank(right.source_kind) ||
        supportTypeRank(left.support_type) - supportTypeRank(right.support_type) ||
        left.rank - right.rank,
    )
    .map((row, rank) => ({ ...row, rank }));
}

function sourceKindRank(sourceKind: RuntimeEvidenceRow["source_kind"]): number {
  switch (sourceKind) {
    case "kg_edge":
      return 0;
    case "cps_monograph":
      return 1;
    case "health_canada_product_monograph":
      return 2;
    case "safety":
      return 3;
    case "pubmed":
      return 4;
    case "nhp":
      return 5;
    default:
      return 6;
  }
}

function supportTypeRank(supportType: RuntimeEvidenceRow["support_type"]): number {
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

function getInputPairs(nodeIds: string[]): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];

  for (let i = 0; i < nodeIds.length; i += 1) {
    for (let j = i + 1; j < nodeIds.length; j += 1) {
      const leftId = nodeIds[i];
      const rightId = nodeIds[j];

      if (leftId && rightId) {
        pairs.push([leftId, rightId]);
      }
    }
  }

  return pairs;
}

function getCaptureMode(value: unknown): "async" | "sync" {
  return value === "sync" ? "sync" : "async";
}

function getOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getOptionalNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function groupInteractionsByPair(
  interactions: InteractionRpcRow[],
): Map<string, InteractionRpcRow[]> {
  const interactionsByPair = new Map<string, InteractionRpcRow[]>();

  for (const interaction of interactions) {
    const [leftId, rightId] = interaction.input_pair ?? [];

    if (!leftId || !rightId) {
      continue;
    }

    const fingerprint = pairFingerprint(leftId, rightId);
    interactionsByPair.set(fingerprint, [
      ...(interactionsByPair.get(fingerprint) ?? []),
      interaction,
    ]);
  }

  return interactionsByPair;
}

function groupRuntimeAiRowsByModelPair(
  interactions: InteractionRpcRow[],
): Map<string, InteractionRpcRow[]> {
  const rowsByModelPair = new Map<string, InteractionRpcRow[]>();

  for (const interaction of interactions) {
    if (interaction.interaction.source !== "RuntimeAI") {
      continue;
    }

    const [leftId, rightId] = interaction.input_pair ?? [];
    const trace = interaction.interaction.aiDecisionTrace &&
        typeof interaction.interaction.aiDecisionTrace === "object"
      ? interaction.interaction.aiDecisionTrace as Record<string, unknown>
      : null;
    const model = getTraceString(trace, "model");

    if (!leftId || !rightId || !model) {
      continue;
    }

    const key = modelPairKey(model, pairFingerprint(leftId, rightId));
    rowsByModelPair.set(key, [...(rowsByModelPair.get(key) ?? []), interaction]);
  }

  return rowsByModelPair;
}

function modelPairKey(model: string, fingerprint: string): string {
  return `${model}:${fingerprint}`;
}

function getCalibrationModels(
  value: unknown,
  fallbackPrimaryModel: string,
): string[] {
  const allowedModels = new Set([
    ...defaultCalibrationModelPanel,
    fallbackPrimaryModel,
    "claude-haiku-4-5",
  ]);
  const requestedModels = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : defaultCalibrationModelPanel;
  const models = requestedModels.filter((model) => allowedModels.has(model));
  const normalized = models.map((model) =>
    model === "claude-haiku-4-5" ? "claude-haiku-4-5-20251001" : model
  );

  return [...new Set(normalized)].slice(0, 3);
}

function isInteractionActionCategory(
  value: string,
): value is InteractionActionCategory {
  return [
    "no_known_interaction",
    "no_action_needed",
    "monitor_therapy",
    "consider_therapy_modification",
    "avoid_combination",
  ].includes(value);
}

function isInteractionSeverity(value: string): value is InteractionSeverity {
  return [
    "contraindicated",
    "major",
    "moderate",
    "minor",
    "unknown",
  ].includes(value);
}

function isInteractionRpcRow(value: unknown): value is InteractionRpcRow {
  if (!value || typeof value !== "object") {
    return false;
  }

  const row = value as Partial<InteractionRpcRow>;
  return Array.isArray(row.input_pair) &&
    row.input_pair.every((nodeId) => typeof nodeId === "string") &&
    Boolean(row.interaction) &&
    typeof row.interaction?.id === "string";
}

function markAiUsedEvidence(
  evidenceRows: RuntimeEvidenceRow[],
  aiDecisionTrace: unknown,
): RuntimeEvidenceRow[] {
  if (!aiDecisionTrace || typeof aiDecisionTrace !== "object") {
    return evidenceRows;
  }

  const usedEvidenceIds = (aiDecisionTrace as {
    usedEvidenceIds?: unknown;
  }).usedEvidenceIds;

  if (!Array.isArray(usedEvidenceIds)) {
    return evidenceRows;
  }

  const used = new Set(
    usedEvidenceIds.filter((item): item is string => typeof item === "string"),
  );

  if (!used.size) {
    return evidenceRows;
  }

  return evidenceRows.map((row, index) => ({
    ...row,
    used_in_answer: row.used_in_answer ||
      isRuntimeEvidenceUsed(row, index, used),
  }));
}

function getTracePromptEvidenceRows(
  trace: Record<string, unknown> | null,
): RuntimeEvidenceRow[] {
  const promptEvidence = trace?.promptEvidence;

  if (!Array.isArray(promptEvidence)) {
    return [];
  }

  return promptEvidence.flatMap((item, index): RuntimeEvidenceRow[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const row = item as Record<string, unknown>;
    const content = getTraceString(row, "content");

    if (!content) {
      return [];
    }

    return [
      {
        chunk_id: getNullableTraceString(row, "chunk_id"),
        content,
        metadata: getTraceRecord(row, "metadata") ?? {},
        quote: getNullableTraceString(row, "quote"),
        rank: typeof row.rank === "number" && Number.isFinite(row.rank)
          ? row.rank
          : index,
        source_id: getNullableTraceString(row, "source_id"),
        source_kind: getRuntimeEvidenceSourceKind(row.source_kind) ?? "other",
        source_table: getNullableTraceString(row, "source_table"),
        support_type: getRuntimeEvidenceSupportType(row.support_type) ??
          "retrieved",
        used_in_answer: typeof row.used_in_answer === "boolean"
          ? row.used_in_answer
          : false,
      },
    ];
  });
}

function getTraceString(
  trace: Record<string, unknown> | null,
  key: string,
): string | null {
  const value = trace?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getNullableTraceString(
  trace: Record<string, unknown>,
  key: string,
): string | null {
  const value = trace[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getTraceRecord(
  trace: Record<string, unknown>,
  key: string,
): Record<string, unknown> | null {
  const value = trace[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function getRuntimeEvidenceSourceKind(
  value: unknown,
): RuntimeEvidenceRow["source_kind"] | null {
  return typeof value === "string" &&
      [
        "cps_monograph",
        "health_canada_product_monograph",
        "pubmed",
        "kg_edge",
        "safety",
        "nhp",
        "other",
      ].includes(value)
    ? value as RuntimeEvidenceRow["source_kind"]
    : null;
}

function getRuntimeEvidenceSupportType(
  value: unknown,
): RuntimeEvidenceRow["support_type"] | null {
  return typeof value === "string" &&
      [
        "supports_interaction",
        "supports_mechanism",
        "supports_severity",
        "supports_management",
        "contradicts_or_limits",
        "source_silent",
        "retrieved",
      ].includes(value)
    ? value as RuntimeEvidenceRow["support_type"]
    : null;
}

function normalizeSamplingReason(reason: string): string {
  const allowedReasons = [
    "known_interaction",
    "known_no_interaction",
    "high_risk_pair",
    "common_pair",
    "class_interaction",
    "product_specific",
    "cps_supported",
    "health_canada_only",
    "pubmed_emerging",
    "nhp_or_supplement",
    "negative_control",
    "prior_failure",
    "random_drift_sample",
    "manual",
  ];

  return allowedReasons.includes(reason) ? reason : "manual";
}

function pairFingerprint(leftId: string, rightId: string): string {
  return [leftId, rightId].sort().join(":");
}

function stripStrengthSuffix(value: string): string {
  return value.replace(
    /\s*(-\s*)?[0-9]+\s*(MG|MCG|G|ML|HR).*$/i,
    "",
  );
}

function normalizeName(value = ""): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function shouldRunAiForPair(
  deterministicInteractions: InteractionRpcRow[],
  mode: "always" | "on_miss_or_uncertain",
): boolean {
  if (mode === "always") {
    return true;
  }

  return deterministicInteractions.length === 0;
}

function parseInputLabels(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([key, label]) =>
      typeof label === "string" && label.trim()
        ? [[key, label.trim()]]
        : []
    ),
  );
}

function serializeNode(
  node: KgNodeRow | undefined,
  fallbackId: string,
  fallbackLabel: string,
) {
  return {
    canonical_name: node?.canonical_name ?? fallbackLabel,
    id: node?.id ?? fallbackId,
    identifiers: node?.identifiers ?? {},
    source: node?.source ?? "unknown",
    summary: node?.summary ?? null,
    type: node?.type ?? "unknown",
  };
}

function shouldSampleEvaluation(
  sampleRate: number,
  forceEvaluationCapture: boolean,
): boolean {
  if (forceEvaluationCapture) {
    return true;
  }

  if (sampleRate <= 0) {
    return false;
  }

  if (sampleRate >= 1) {
    return true;
  }

  return Math.random() < sampleRate;
}

function toPromptEvidence(row: RuntimeEvidenceRow, index: number) {
  const id = getPromptEvidenceId(index);
  const originalEvidenceId = getEvidenceId(row);

  return {
    chunk_id: row.chunk_id,
    content: truncate(row.content, 1400),
    id,
    metadata: {
      ...row.metadata,
      originalEvidenceId,
      promptEvidenceId: id,
    },
    originalEvidenceId,
    quote: row.quote,
    rank: row.rank,
    source_id: row.source_id,
    source_kind: row.source_kind,
    sourceKind: row.source_kind,
    source_table: row.source_table,
    sourceTable: row.source_table,
    support_type: row.support_type,
    supportType: row.support_type,
    used_in_answer: row.used_in_answer,
    usedInCurrentAnswer: row.used_in_answer,
  };
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function validateRuntimeAiAnswer(value: unknown): RuntimeAiAnswer {
  if (!value || typeof value !== "object") {
    throw new Error("Runtime AI answer must be a JSON object.");
  }

  const candidate = value as Partial<RuntimeAiAnswer> & {
    action_category?: unknown;
    evidence_support?: unknown;
    used_evidence_ids?: unknown;
  };
  const actionCategory = normalizeActionCategory(
    candidate.actionCategory ?? candidate.action_category,
  );

  if (!actionCategory || !isInteractionActionCategory(actionCategory)) {
    throw new Error("Runtime AI answer has invalid actionCategory.");
  }

  const severity = normalizeInteractionSeverity(candidate.severity);

  if (!severity || !isInteractionSeverity(severity)) {
    throw new Error("Runtime AI answer has invalid severity.");
  }

  const evidenceSupport = normalizeEvidenceSupport(
    candidate.evidenceSupport ?? candidate.evidence_support,
  );

  if (
    evidenceSupport !== "direct" &&
    evidenceSupport !== "indirect" &&
    evidenceSupport !== "insufficient" &&
    evidenceSupport !== "conflicting"
  ) {
    throw new Error("Runtime AI answer has invalid evidenceSupport.");
  }

  const confidence = typeof candidate.confidence === "number"
    ? Math.max(0, Math.min(1, candidate.confidence))
    : 0;
  const usedEvidenceValue =
    candidate.usedEvidenceIds ?? candidate.used_evidence_ids;

  return {
    actionCategory,
    confidence,
    evidenceSupport,
    management: typeof candidate.management === "string" &&
        candidate.management.trim()
      ? candidate.management.trim()
      : null,
    mechanism: typeof candidate.mechanism === "string" &&
        candidate.mechanism.trim()
      ? candidate.mechanism.trim()
      : null,
    rationale: typeof candidate.rationale === "string" &&
        candidate.rationale.trim()
      ? candidate.rationale.trim()
      : "Runtime AI assessment did not provide a rationale.",
    severity,
    uncertainty: Array.isArray(candidate.uncertainty)
      ? candidate.uncertainty.filter((item): item is string =>
        typeof item === "string"
      )
      : [],
    usedEvidenceIds: Array.isArray(usedEvidenceValue)
      ? usedEvidenceValue.filter((item): item is string =>
          typeof item === "string"
        )
      : [],
  };
}

function normalizeActionCategory(value: unknown): InteractionActionCategory | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (isInteractionActionCategory(normalized)) {
    return normalized;
  }

  return null;
}

function normalizeEvidenceSupport(
  value: unknown,
): RuntimeAiAnswer["evidenceSupport"] | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  switch (normalized) {
    case "direct":
    case "direct_support":
      return "direct";
    case "indirect":
    case "mechanism":
    case "mechanistic":
    case "mechanism_only":
      return "indirect";
    case "insufficient":
    case "insufficient_evidence":
    case "none":
      return "insufficient";
    case "conflicting":
    case "conflict":
      return "conflicting";
    default:
      return null;
  }
}

function normalizeInteractionSeverity(value: unknown): InteractionSeverity | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (isInteractionSeverity(normalized)) {
    return normalized;
  }

  return null;
}

function sortInteractions(interactions: InteractionRpcRow[]): InteractionRpcRow[] {
  return [...interactions].sort(
    (left, right) => getInteractionRank(left) - getInteractionRank(right),
  );
}

function getInteractionRank(row: InteractionRpcRow): number {
  switch (getAnswerCategory(row)) {
    case "avoid_combination":
      return 0;
    case "consider_therapy_modification":
      return 1;
    case "monitor_therapy":
      return 2;
    case "no_action_needed":
      return 3;
    case "no_known_interaction":
      return 4;
    default:
      return 5;
  }
}

function scheduleBackgroundTask(task: Promise<unknown>): void {
  const edgeRuntime = (globalThis as typeof globalThis & {
    EdgeRuntime?: {
      waitUntil?: (task: Promise<unknown>) => void;
    };
  }).EdgeRuntime;

  if (edgeRuntime?.waitUntil) {
    edgeRuntime.waitUntil(task);
    return;
  }

  void task;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
