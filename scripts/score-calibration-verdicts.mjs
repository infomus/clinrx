// Score model/retrieval-strategy answers against the pharmacist's per-request
// ground-truth verdicts (the request-level labels, run_id = null) for a
// calibration set. Reports exact-match accuracy and mean ordinal category
// distance, ranked, per model and per retrieval strategy.
//
// While there are no verdicts yet, it also prints an inter-model consensus
// preview (how often the models agree, and which models are outliers).
//
// Usage:
//   set -a; source .env; set +a
//   INTERACTION_EVALUATION_SET_ID=interaction-runtime-kg-node-calibration-2026-06-14 \
//   node scripts/score-calibration-verdicts.mjs

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const setId = process.env.INTERACTION_EVALUATION_SET_ID ??
  "interaction-runtime-kg-node-calibration-2026-06-14";
const reviewerKey = process.env.INTERACTION_REVIEWER_KEY ?? "shared-password-reviewer";

const MODELS = [
  "claude-opus-4-8",
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
  "gpt-5.5",
  "gpt-5.4-mini",
];
const STRATEGIES = [
  "monograph_direct_top8",
  "monograph_direct_plus_pubmed_top10",
  "monograph_plus_safety_top12",
  "ingredient_product_class_guarded_top12",
];
// ordered category scale for distance scoring
const SCALE = [
  "no_known_interaction",
  "no_action_needed",
  "monitor_therapy",
  "consider_therapy_modification",
  "avoid_combination",
];
const rank = (cat) => SCALE.indexOf(cat);

const MODEL_LABEL = {
  "claude-opus-4-8": "Opus 4.8",
  "claude-sonnet-4-6": "Sonnet 4.6",
  "claude-haiku-4-5-20251001": "Haiku 4.5",
  "gpt-5.5": "GPT-5.5",
  "gpt-5.4-mini": "GPT-5.4 mini",
};
const STRAT_LABEL = {
  monograph_direct_top8: "Monograph direct (8)",
  monograph_direct_plus_pubmed_top10: "Monograph + PubMed (10)",
  monograph_plus_safety_top12: "Monograph + safety (12)",
  ingredient_product_class_guarded_top12: "Ingredient/class guarded (12)",
};

async function rest(path) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${path} failed ${res.status}: ${text}`);
  return json;
}

async function loadRequestIds() {
  const rows = await rest(
    `interaction_evaluation_request?select=id&set_id=eq.${encodeURIComponent(setId)}`,
  );
  return rows.map((r) => r.id);
}

// latest run per (request, model, strategy), paginated past the 1000-row cap
async function loadLatestRuns(requestIds) {
  const filter =
    `request_id=in.(${requestIds.join(",")})` +
    `&model=in.(${MODELS.join(",")})` +
    `&retrieval_strategy_version=in.(${STRATEGIES.join(",")})` +
    `&select=request_id,model,retrieval_strategy_version,run_version,status,answer_category` +
    `&order=request_id.asc,run_version.desc`;
  const all = [];
  for (let off = 0; off < 40000; off += 1000) {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/interaction_evaluation_run?${filter}`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Range-Unit": "items",
          Range: `${off}-${off + 999}`,
        },
      },
    );
    const page = await res.json();
    if (!Array.isArray(page)) break;
    all.push(...page);
    if (page.length < 1000) break;
  }
  const latest = new Map();
  for (const r of all) {
    const k = `${r.request_id}|${r.model}|${r.retrieval_strategy_version}`;
    const prev = latest.get(k);
    if (!prev || r.run_version > prev.run_version) latest.set(k, r);
  }
  return latest;
}

async function loadVerdicts() {
  const rows = await rest(
    `interaction_evaluation_label?select=request_id,final_category` +
      `&set_id=eq.${encodeURIComponent(setId)}` +
      `&reviewer_key=eq.${encodeURIComponent(reviewerKey)}` +
      `&run_id=is.null`,
  );
  const byRequest = new Map();
  for (const r of rows) {
    if (r.final_category) byRequest.set(r.request_id, r.final_category);
  }
  return byRequest;
}

function pct(n, d) {
  return d ? `${((100 * n) / d).toFixed(0)}%` : "—";
}

function scoreGroups(latest, verdicts, keyFn) {
  // keyFn(run) -> group label (model or strategy)
  const agg = new Map();
  for (const run of latest.values()) {
    const verdict = verdicts.get(run.request_id);
    if (!verdict || verdict === "unclear") continue;
    if (run.status !== "completed" || !run.answer_category) continue;
    const vi = rank(verdict);
    const mi = rank(run.answer_category);
    if (vi < 0 || mi < 0) continue;
    const g = keyFn(run);
    const a = agg.get(g) ?? { n: 0, exact: 0, dist: 0 };
    a.n += 1;
    if (mi === vi) a.exact += 1;
    a.dist += Math.abs(mi - vi);
    agg.set(g, a);
  }
  return [...agg.entries()]
    .map(([g, a]) => ({
      group: g,
      n: a.n,
      exact: a.exact,
      exactPct: a.n ? a.exact / a.n : 0,
      meanDist: a.n ? a.dist / a.n : 0,
    }))
    .sort((x, y) => x.meanDist - y.meanDist || y.exactPct - x.exactPct);
}

function consensusPreview(latest, requestIds) {
  // For each (request, strategy), the modal category across the 5 models, then
  // how often each model matches that cross-model consensus.
  const modelHits = new Map(MODELS.map((m) => [m, { n: 0, agree: 0 }]));
  let fullAgreeCells = 0;
  let totalCells = 0;
  for (const rid of requestIds) {
    for (const s of STRATEGIES) {
      const cats = [];
      for (const m of MODELS) {
        const run = latest.get(`${rid}|${m}|${s}`);
        if (run?.status === "completed" && run.answer_category) {
          cats.push([m, run.answer_category]);
        }
      }
      if (cats.length < 2) continue;
      totalCells += 1;
      const counts = {};
      for (const [, c] of cats) counts[c] = (counts[c] ?? 0) + 1;
      const mode = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
      const uniqueCats = new Set(cats.map(([, c]) => c));
      if (uniqueCats.size === 1) fullAgreeCells += 1;
      for (const [m, c] of cats) {
        const h = modelHits.get(m);
        h.n += 1;
        if (c === mode) h.agree += 1;
      }
    }
  }
  return { modelHits, fullAgreeCells, totalCells };
}

async function main() {
  const requestIds = await loadRequestIds();
  const [latest, verdicts] = await Promise.all([
    loadLatestRuns(requestIds),
    loadVerdicts(),
  ]);
  const scored = [...verdicts.entries()].filter(([, v]) => v && v !== "unclear");
  console.log(`Set: ${setId}`);
  console.log(`Requests: ${requestIds.length} | latest run cells: ${latest.size}`);
  console.log(
    `Pharmacist verdicts: ${verdicts.size} (${scored.length} scoreable, ` +
      `${verdicts.size - scored.length} marked unclear)`,
  );

  if (scored.length) {
    console.log("\n=== Model ranking vs pharmacist ground truth ===");
    console.log("(sorted best-first by mean category distance; lower = closer)");
    for (const r of scoreGroups(latest, verdicts, (run) => run.model)) {
      console.log(
        `  ${(MODEL_LABEL[r.group] ?? r.group).padEnd(14)} ` +
          `exact ${pct(r.exact, r.n).padStart(4)}  ` +
          `mean dist ${r.meanDist.toFixed(2)}  (n=${r.n})`,
      );
    }
    console.log("\n=== Retrieval strategy ranking vs ground truth ===");
    for (const r of scoreGroups(latest, verdicts, (run) => run.retrieval_strategy_version)) {
      console.log(
        `  ${(STRAT_LABEL[r.group] ?? r.group).padEnd(30)} ` +
          `exact ${pct(r.exact, r.n).padStart(4)}  ` +
          `mean dist ${r.meanDist.toFixed(2)}  (n=${r.n})`,
      );
    }
  } else {
    console.log("\nNo scoreable verdicts yet — pharmacist has not entered ground truth.");
  }

  // Always show the inter-model consensus preview.
  const { modelHits, fullAgreeCells, totalCells } = consensusPreview(latest, requestIds);
  console.log("\n=== Inter-model consensus PREVIEW (not ground truth) ===");
  console.log(
    `  All 5 models agree on the category in ${fullAgreeCells}/${totalCells} ` +
      `request×strategy cells (${pct(fullAgreeCells, totalCells)}).`,
  );
  console.log("  How often each model matches the cross-model majority:");
  const ranked = [...modelHits.entries()]
    .map(([m, h]) => ({ m, ...h, p: h.n ? h.agree / h.n : 0 }))
    .sort((a, b) => b.p - a.p);
  for (const r of ranked) {
    console.log(
      `    ${(MODEL_LABEL[r.m] ?? r.m).padEnd(14)} ${pct(r.agree, r.n).padStart(4)} ` +
        `agree with majority (n=${r.n})`,
    );
  }
  console.log(
    "\n  Note: agreement with the majority is a structural preview only. The real " +
      "ranking comes from the pharmacist verdicts above once entered.",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
