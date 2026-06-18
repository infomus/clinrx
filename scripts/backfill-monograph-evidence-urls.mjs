// Backfill direct source URLs onto monograph evidence rows so the calibration
// reviewer can open the real CPS / Health Canada source and cross-check the
// extraction. The URL is derived from the evidence chunk's kg_node identifiers
// (cps_id for CPS, drug_code for Health Canada DPD), which the anon reviewer
// cannot read directly — so we (service role) compute it and write it onto the
// evidence row's metadata.sourceUrl, which the reviewer can read.
//
// Scope: the latest run per active 2x2 matrix cell for the calibration set
// (exactly what the reviewer sees).
//
// Usage:
//   set -a; source .env; set +a
//   node scripts/backfill-monograph-evidence-urls.mjs            # apply
//   DRY_RUN=1 node scripts/backfill-monograph-evidence-urls.mjs  # preview only

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const setId = process.env.INTERACTION_EVALUATION_SET_ID ??
  "interaction-runtime-kg-node-calibration-2026-06-14";
const dryRun = process.env.DRY_RUN === "1";

const MODELS = new Set(["claude-sonnet-4-6", "gpt-5.4-mini"]);
const STRATEGIES = new Set([
  "monograph_direct_plus_pubmed_top10",
  "ingredient_product_class_guarded_top12",
]);

const H = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  "content-type": "application/json",
};

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function getJson(path, extraHeaders) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: { ...H, ...extraHeaders },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

function monographUrl(node) {
  const ids = node.identifiers ?? {};
  if (node.source === "CPS" && typeof ids.cps_id === "string") {
    return {
      url: `https://cps2.pharmacists.ca/document/monograph/${encodeURIComponent(ids.cps_id)}`,
      label: "Open CPS monograph",
    };
  }
  if (node.source === "HEALTH_CANADA_DPD") {
    const code = ids.drug_code ?? ids.drug_identification_number ??
      (Array.isArray(ids.din) ? ids.din[0] : undefined);
    if (node.source === "HEALTH_CANADA_DPD" && ids.drug_code) {
      return {
        url: `https://health-products.canada.ca/dpd-bdpp/info?lang=en&code=${encodeURIComponent(ids.drug_code)}`,
        label: "Open Health Canada listing",
      };
    }
    // DIN-only node with no drug_code: link to a DPD search by DIN.
    if (code) {
      return {
        url: `https://health-products.canada.ca/dpd-bdpp/dispatch-repartition?lang=en`,
        label: "Open Health Canada DPD",
      };
    }
  }
  return null;
}

async function main() {
  const requests = await getJson(
    `interaction_evaluation_request?select=id&set_id=eq.${encodeURIComponent(setId)}`,
  );
  const requestIds = requests.map((r) => r.id);

  // Latest run per (request, model, strategy) for the active 2x2.
  const runs = [];
  for (let off = 0;; off += 1000) {
    const page = await getJson(
      `interaction_evaluation_run?request_id=in.(${requestIds.join(",")})` +
        `&select=id,request_id,model,retrieval_strategy_version,run_version` +
        `&order=run_version.desc,created_at.desc,id.desc`,
      { "Range-Unit": "items", Range: `${off}-${off + 999}` },
    );
    runs.push(...page);
    if (page.length < 1000) break;
  }
  const latest = new Map();
  for (const r of runs) {
    if (!MODELS.has(r.model) || !STRATEGIES.has(r.retrieval_strategy_version)) {
      continue;
    }
    const key = `${r.request_id}|${r.model}|${r.retrieval_strategy_version}`;
    if (!latest.has(key)) latest.set(key, r.id);
  }
  const runIds = [...latest.values()];
  console.log(`Set: ${setId}`);
  console.log(`Visible 2x2 runs: ${runIds.length}`);

  // Monograph evidence for those runs.
  const evidence = [];
  for (const runChunk of chunk(runIds, 40)) {
    const rows = await getJson(
      `interaction_evaluation_evidence?run_id=in.(${runChunk.join(",")})` +
        `&or=(source_kind.eq.cps_monograph,source_kind.eq.health_canada_product_monograph)` +
        `&select=id,source_kind,metadata`,
    );
    evidence.push(...rows);
  }
  console.log(`Monograph evidence rows: ${evidence.length}`);

  // Resolve node identifiers for the chunk nodes.
  const nodeIds = [
    ...new Set(
      evidence.map((e) => e.metadata?.kgNodeId).filter((v) => typeof v === "string"),
    ),
  ];
  const nodeById = new Map();
  for (const idChunk of chunk(nodeIds, 100)) {
    const nodes = await getJson(
      `kg_node?id=in.(${idChunk.join(",")})&select=id,source,identifiers`,
    );
    for (const n of nodes) nodeById.set(n.id, n);
  }

  // Build updates.
  const updates = [];
  let skippedNoNode = 0;
  let skippedNoUrl = 0;
  for (const e of evidence) {
    const nodeId = e.metadata?.kgNodeId;
    const node = nodeId ? nodeById.get(nodeId) : null;
    if (!node) {
      skippedNoNode += 1;
      continue;
    }
    const link = monographUrl(node);
    if (!link) {
      skippedNoUrl += 1;
      continue;
    }
    if (e.metadata?.sourceUrl === link.url) continue; // already set
    updates.push({
      id: e.id,
      metadata: { ...e.metadata, sourceUrl: link.url, sourceLabel: link.label },
    });
  }

  const byLabel = {};
  for (const u of updates) {
    byLabel[u.metadata.sourceLabel] = (byLabel[u.metadata.sourceLabel] ?? 0) + 1;
  }
  console.log(
    `To update: ${updates.length} (skipped: ${skippedNoNode} no-node, ${skippedNoUrl} no-url)`,
  );
  console.log("By link type:", byLabel);
  console.log("Sample:", updates.slice(0, 3).map((u) => u.metadata.sourceUrl));

  if (dryRun) {
    console.log("DRY_RUN=1 — no writes.");
    return;
  }

  let done = 0;
  for (const batch of chunk(updates, 25)) {
    await Promise.all(
      batch.map((u) =>
        fetch(
          `${supabaseUrl}/rest/v1/interaction_evaluation_evidence?id=eq.${u.id}`,
          {
            method: "PATCH",
            headers: { ...H, Prefer: "return=minimal" },
            body: JSON.stringify({ metadata: u.metadata }),
          },
        ).then((res) => {
          if (!res.ok) throw new Error(`PATCH ${u.id} -> ${res.status}`);
        })
      ),
    );
    done += batch.length;
    process.stdout.write(`\rUpdated ${done}/${updates.length}`);
  }
  console.log(`\nDone. Updated ${done} evidence rows.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
