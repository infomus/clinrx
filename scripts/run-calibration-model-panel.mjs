const supabaseUrl =
  process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY ??
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SECRET;

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  throw new Error(
    "SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL, SUPABASE_ANON_KEY or EXPO_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are required.",
  );
}

const setId = process.env.INTERACTION_EVALUATION_SET_ID ??
  "interaction-runtime-live-calibration";
const limit = Number.parseInt(
  process.env.INTERACTION_MODEL_PANEL_LIMIT ?? "1",
  10,
);
const scanLimit = Number.parseInt(
  process.env.INTERACTION_MODEL_PANEL_SCAN_LIMIT ??
    String(Math.max(limit * 10, 10)),
  10,
);
const models = (
  process.env.INTERACTION_MODEL_PANEL_MODELS ??
    "claude-opus-4-8,claude-sonnet-4-6,claude-haiku-4-5-20251001,gpt-5.5,gpt-5.4-mini"
)
  .split(",")
  .map((model) => model.trim())
  .filter(Boolean);
const retrievalStrategies = (
  process.env.INTERACTION_RETRIEVAL_STRATEGIES ??
    "monograph_direct_top8,monograph_direct_plus_pubmed_top10,monograph_plus_safety_top12,ingredient_product_class_guarded_top12"
)
  .split(",")
  .map((strategy) => strategy.trim())
  .filter(Boolean);
const modelSet = new Set(models);
const retrievalStrategySet = new Set(retrievalStrategies);
const expectedMatrixCellCount = modelSet.size * retrievalStrategySet.size;

let accessToken;
let userId;

async function fetchJson(path, options = {}) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    ...options,
    headers: {
      apikey: options.service ? serviceRoleKey : anonKey,
      Authorization: `Bearer ${options.service ? serviceRoleKey : accessToken}`,
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  let json = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  if (!response.ok) {
    const message = json?.msg ?? json?.message ?? json?.error_description ??
      json?.error ?? text;
    throw new Error(`${options.label ?? path} failed ${response.status}: ${message}`);
  }

  return json;
}

async function rest(path, options = {}) {
  return fetchJson(`/rest/v1/${path}`, { ...options, service: true });
}

async function createTempUser() {
  const email = `runtime-model-panel-${Date.now()}@example.com`;
  const password = `Panel-${crypto.randomUUID()}-aA1!`;
  const created = await fetchJson("/auth/v1/admin/users", {
    body: JSON.stringify({ email, email_confirm: true, password }),
    label: "create temporary auth user",
    method: "POST",
    service: true,
  });
  userId = created.id;
  const signedIn = await fetchJson("/auth/v1/token?grant_type=password", {
    body: JSON.stringify({ email, password }),
    label: "sign in temporary auth user",
    method: "POST",
  });
  accessToken = signedIn.access_token;
}

async function deleteTempUser() {
  if (!userId) {
    return;
  }

  await fetchJson(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    label: "delete temporary auth user",
    method: "DELETE",
    service: true,
  });
}

async function loadRequests() {
  return rest(
    `interaction_evaluation_request?select=id,request_fingerprint,input_source_text,input_target_text&set_id=eq.${encodeURIComponent(setId)}&order=created_at.asc&limit=${scanLimit}`,
  );
}

async function loadLatestRun(requestId) {
  const rows = await rest(
    `interaction_evaluation_run?select=resolved_source_id,resolved_target_id&request_id=eq.${encodeURIComponent(requestId)}&resolved_source_id=not.is.null&resolved_target_id=not.is.null&order=run_version.desc&limit=1`,
  );

  return rows[0] ?? null;
}

async function loadExistingMatrixCellCount(requestId) {
  const rows = await rest(
    `interaction_evaluation_run?select=model,retrieval_strategy_version,run_version&request_id=eq.${encodeURIComponent(requestId)}&order=run_version.desc&limit=200`,
  );
  const cells = new Set();

  for (const row of rows) {
    if (
      !modelSet.has(row.model) ||
      !retrievalStrategySet.has(row.retrieval_strategy_version)
    ) {
      continue;
    }

    cells.add(`${row.retrieval_strategy_version}:${row.model}`);
  }

  return cells.size;
}

async function ensureRequestFingerprint(request) {
  if (request.request_fingerprint) {
    return request.request_fingerprint;
  }

  const requestFingerprint = `request:${request.id}`;
  const updatedRows = await rest(
    `interaction_evaluation_request?id=eq.${encodeURIComponent(request.id)}&select=id,request_fingerprint`,
    {
      body: JSON.stringify({ request_fingerprint: requestFingerprint }),
      headers: {
        Prefer: "return=representation",
      },
      label: `set request fingerprint for ${request.id}`,
      method: "PATCH",
    },
  );

  return updatedRows[0]?.request_fingerprint ?? requestFingerprint;
}

function pairFingerprint(leftId, rightId) {
  return [leftId, rightId].sort().join(":");
}

async function runPanelForRequest(request) {
  const run = await loadLatestRun(request.id);

  if (!run?.resolved_source_id || !run?.resolved_target_id) {
    return {
      requestId: request.id,
      skipped: "missing resolved source or target node",
    };
  }

  const existingMatrixCellCount = await loadExistingMatrixCellCount(request.id);

  if (existingMatrixCellCount >= expectedMatrixCellCount) {
    return {
      existingMatrixCellCount,
      requestId: request.id,
      skipped: "matrix already complete",
    };
  }

  const requestFingerprint = await ensureRequestFingerprint(request);
  const nodePairFingerprint = pairFingerprint(
    run.resolved_source_id,
    run.resolved_target_id,
  );
  const started = Date.now();
  const response = await fetchJson("/functions/v1/check-interactions", {
    body: JSON.stringify({
      aiCacheTtlSeconds: 86400,
      aiInferenceMode: "on_miss_or_uncertain",
      calibrationModelPanel: true,
      calibrationModels: models,
      calibrationRetrievalStrategies: retrievalStrategies,
      captureEvaluation: true,
      evaluationCaptureMode: "sync",
      evaluationRequestFingerprints: {
        [nodePairFingerprint]: requestFingerprint,
      },
      evaluationSamplingReason: "manual",
      evaluationSetId: setId,
      evaluationSetName: "Runtime model and retrieval strategy calibration",
      forceEvaluationCapture: true,
      inputLabels: {
        [run.resolved_source_id]: request.input_source_text,
        [run.resolved_target_id]: request.input_target_text,
      },
      nodeIds: [run.resolved_source_id, run.resolved_target_id],
      retrieveRuntimeEvidence: true,
      resultCacheTtlSeconds: 86400,
      useAiInference: true,
      useResultCache: true,
    }),
    label: `model panel for ${request.id}`,
    method: "POST",
  });

  return {
    durationMs: Date.now() - started,
    models,
    requestId: request.id,
    retrievalStrategies,
    runIds: response.evaluation?.runIds ?? [],
  };
}

try {
  await createTempUser();
  const requests = await loadRequests();
  const results = [];

  for (const request of requests) {
    if (results.filter((result) => !result.skipped).length >= limit) {
      break;
    }

    const result = await runPanelForRequest(request);
    results.push(result);
    console.log(JSON.stringify(result));
  }

  console.log(
    `Completed model panel for ${results.filter((result) => !result.skipped).length}/${requests.length} request(s) in ${setId}.`,
  );
} finally {
  await deleteTempUser().catch((error) => {
    console.error(`Could not delete temporary auth user: ${error.message}`);
  });
}
