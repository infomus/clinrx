// Combined pharmacodynamic (PD) profile extraction. One Claude call per substance
// reads its monograph (PD-relevant sections) and returns a sparse profile across
// all additive-effect axes at once (cheaper + more consistent than one pass per
// axis). Each contribution becomes a candidate subclass_of edge to that axis's
// functional class node (source=PD_LAYER, cited). QT is handled by its own tiered
// layer and excluded here. Pairwise PD interactions are derived later from
// shared-axis co-membership.
//
// Usage: set -a; source .env; set +a
//   SUPABASE_URL=$EXPO_PUBLIC_SUPABASE_URL node scripts/extract-pd-profile.mjs [--limit N] [--min-chunks K] [--dry-run] [--concurrency K] [--verbose]

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const LIMIT = Number(opt("--limit", "0")) || Infinity;
const MIN_CHUNKS = Number(opt("--min-chunks", "3"));
const DRY_RUN = flag("--dry-run");
const CONCURRENCY = Number(opt("--concurrency", "5"));
const VERBOSE = flag("--verbose");

const url = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET;
const anthropicKey = process.env.ANTHROPIC_API_KEY;
if (!url || !key) throw new Error("SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required");
if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY required");
const H = { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json" };
const MODEL = "claude-opus-4-8";
const PD_SECTION = /WARNING|ADVERSE|CONTRAINDIC|PHARMACOLOG|ACTION AND CLINICAL|PRECAUTION|OVERDOS|DRUG INTERACTION/i;
const LISTING = /product_listing/i; // DPD/product listing metadata — not monograph content
const MAX_CHARS = 16000;

// axis -> functional class node name
const AXES = {
  serotonin_syndrome: "Serotonergic agents",
  cns_depression: "CNS depressants",
  respiratory_depression: "Respiratory depressants",
  bleeding: "Bleeding-risk agents",
  hyperkalemia: "Hyperkalemia-risk agents",
  hyponatremia: "Hyponatremia-risk agents",
  anticholinergic: "Anticholinergic agents",
  hypoglycemia: "Hypoglycemia-risk agents",
  hypotension: "Hypotensive agents",
  bradycardia: "Bradycardia-risk agents",
  seizure_threshold: "Seizure-threshold-lowering agents",
  nephrotoxicity: "Nephrotoxic agents",
  hepatotoxicity: "Hepatotoxic agents",
  myelosuppression: "Myelosuppressive agents",
  ototoxicity: "Ototoxic agents",
  constipation: "Constipating agents",
  photosensitivity: "Photosensitizing agents",
};
const AXIS_KEYS = Object.keys(AXES);

const rest = async (q) => {
  const r = await fetch(`${url}/rest/v1/${q}`, { headers: H });
  if (!r.ok) throw new Error(`REST ${r.status} ${q.slice(0, 80)} :: ${(await r.text()).slice(0, 160)}`);
  return r.json();
};
const restPage = async (base) => {
  const out = [];
  for (let off = 0; ; off += 1000) { const p = await rest(`${base}&limit=1000&offset=${off}`); if (!Array.isArray(p) || !p.length) break; out.push(...p); if (p.length < 1000) break; }
  return out;
};

const TOOL = {
  name: "record_pd_profile",
  description: "Record the additive pharmacodynamic effects this drug meaningfully contributes to. List ONLY axes the drug itself contributes to; omit the rest.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      contributions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            axis: { type: "string", enum: AXIS_KEYS },
            magnitude: { type: "string", enum: ["high", "moderate", "low"] },
            quote: { type: "string", description: "Verbatim snippet from the text supporting this." },
            confidence: { type: "number" },
          },
          required: ["axis", "magnitude", "quote", "confidence"],
        },
      },
    },
    required: ["contributions"],
  },
};
const SYSTEM =
  "You are a pharmacodynamics profiling engine for a Canadian pharmacy knowledge graph. Given ONE drug and its monograph " +
  "excerpts, list the additive-effect axes the drug MEANINGFULLY contributes to (a real, notable effect of THIS drug — not " +
  "an effect merely mentioned as a precaution about other drugs). Axes: serotonin_syndrome (serotonergic activity), " +
  "cns_depression (sedation/CNS depression), respiratory_depression, bleeding (bleeding/antiplatelet/anticoagulant), " +
  "hyperkalemia, hyponatremia/SIADH, anticholinergic, hypoglycemia, hypotension/orthostasis, bradycardia, " +
  "seizure_threshold (lowers seizure threshold), nephrotoxicity, hepatotoxicity, myelosuppression, ototoxicity, " +
  "constipation, photosensitivity. magnitude: high (hallmark/strong effect), moderate, low (minor/occasional). " +
  "Cite a verbatim quote per axis. Be conservative — omit axes that don't clearly apply. Return an empty list if none apply.";

async function profile(name, text, attempt = 0) {
  const body = { model: MODEL, max_tokens: 1500, system: SYSTEM, messages: [{ role: "user", content: `Drug: ${name}\n\nMonograph:\n${text}` }], tools: [TOOL], tool_choice: { type: "tool", name: TOOL.name } };
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "anthropic-version": "2023-06-01", "content-type": "application/json", "x-api-key": anthropicKey }, body: JSON.stringify(body) });
  if (!r.ok) {
    const t = await r.text();
    const isCredit = r.status === 400 && /credit balance/i.test(t); // transient with auto top-up
    if ((r.status === 429 || r.status >= 500 || isCredit) && attempt < 8) {
      await new Promise((res) => setTimeout(res, isCredit ? 45000 : Math.min(2000 * 2 ** attempt, 30000)));
      return profile(name, text, attempt + 1);
    }
    throw new Error(`Anthropic ${r.status}: ${t.slice(0, 200)}`);
  }
  const json = await r.json();
  if (json.stop_reason === "refusal") return { contributions: [], usage: json.usage };
  const block = (json.content ?? []).find((b) => b.type === "tool_use" && b.name === TOOL.name);
  return { contributions: block?.input?.contributions ?? [], usage: json.usage };
}

async function pool(items, k, worker) { let i = 0; await Promise.all(Array.from({ length: Math.min(k, items.length) }, async () => { while (i < items.length) { const idx = i++; await worker(items[idx], idx); } })); }

async function ensureAxisNodes() {
  const existing = await rest("kg_node?type=eq.drug_class&source=eq.PD_LAYER&select=id,identifiers");
  const byAxis = {};
  for (const n of existing) byAxis[n.identifiers?.functional_class] = n.id;
  const toCreate = [];
  for (const [axis, name] of Object.entries(AXES)) {
    if (!byAxis[axis]) { const id = crypto.randomUUID(); byAxis[axis] = id; toCreate.push({ id, type: "drug_class", canonical_name: name, source: "PD_LAYER", identifiers: { functional_class: axis } }); }
  }
  if (toCreate.length && !DRY_RUN) {
    const r = await fetch(`${url}/rest/v1/kg_node`, { method: "POST", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(toCreate) });
    if (!r.ok) throw new Error(`axis node insert ${r.status}: ${(await r.text()).slice(0, 160)}`);
  }
  return byAxis;
}

async function main() {
  let cands = await restPage(`pd_extraction_candidate?chunk_count=gte.${MIN_CHUNKS}&select=node_id`);
  const ids = cands.map((c) => c.node_id);
  const nameOf = {};
  for (let i = 0; i < ids.length; i += 150) for (const n of await rest(`kg_node?id=in.(${ids.slice(i, i + 150).join(",")})&select=id,canonical_name`)) nameOf[n.id] = n.canonical_name;
  const processedSet = DRY_RUN ? new Set() : new Set((await restPage("pd_processed?select=node_id")).map((p) => p.node_id));
  let targets = ids.filter((id) => nameOf[id] && !processedSet.has(id));
  if (LIMIT !== Infinity) targets = targets.slice(0, LIMIT);
  console.log(`PD candidate substances to process: ${targets.length} (skipped ${processedSet.size} already done)${DRY_RUN ? " (dry-run)" : ""}`);
  const axisNode = await ensureAxisNodes();
  const existingEdges = new Set((await restPage("kg_edge?source=eq.PD_LAYER&relation=eq.subclass_of&select=source_id,target_id")).map((e) => `${e.source_id}|${e.target_id}`));

  const edges = [];
  const processedOk = [];
  const stats = { drugs: 0, contributions: 0, byAxis: {}, errors: 0, inTok: 0, outTok: 0 };
  let done = 0;

  await pool(targets, CONCURRENCY, async (nodeId) => {
    let text = "";
    try {
      const prods = (await rest(`kg_edge?target_id=eq.${nodeId}&relation=eq.has_ingredient&select=source_id&limit=200`)).map((e) => e.source_id);
      const chunks = [];
      for (let i = 0; i < prods.length; i += 40) {
        const part = await rest(`kg_chunk?node_id=in.(${prods.slice(i, i + 40).join(",")})&is_canonical=eq.true&select=content,section`);
        // monograph content only — exclude product-listing metadata
        for (const c of part) if (c.section && !LISTING.test(c.section)) chunks.push(c);
      }
      // PD-signal-dense sections first, then the monograph body, then cap
      chunks.sort((a, b) => (PD_SECTION.test(b.section) ? 1 : 0) - (PD_SECTION.test(a.section) ? 1 : 0));
      for (const c of chunks) {
        const block = `\n\n[${c.section}]\n${c.content}`;
        if (text.length + block.length > MAX_CHARS) break;
        text += block;
      }
    } catch (e) { stats.errors++; done++; return; }
    if (!text.trim()) { done++; return; }

    let res, usage;
    try { ({ contributions: res, usage } = await profile(nameOf[nodeId], text.trim())); }
    catch (e) { stats.errors++; console.error(`  ! ${nameOf[nodeId]}: ${e.message}`); done++; return; }
    if (usage) { stats.inTok += (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0); stats.outTok += usage.output_tokens || 0; }
    stats.drugs++;
    processedOk.push(nodeId);
    const seenAxis = new Set();
    for (const c of res || []) {
      if (!AXES[c.axis] || seenAxis.has(c.axis)) continue;
      seenAxis.add(c.axis);
      stats.contributions++;
      stats.byAxis[c.axis] = (stats.byAxis[c.axis] || 0) + 1;
      const tid = axisNode[c.axis];
      const k = `${nodeId}|${tid}`;
      if (existingEdges.has(k)) continue;
      existingEdges.add(k);
      edges.push({ source_id: nodeId, target_id: tid, relation: "subclass_of", source: "PD_LAYER", review_status: "candidate", properties: { pd_axis: c.axis, magnitude: c.magnitude, quote: String(c.quote || "").slice(0, 400) }, extraction_confidence: typeof c.confidence === "number" ? c.confidence : null });
    }
    if (VERBOSE && seenAxis.size) console.log(`  ${nameOf[nodeId]}: ${[...seenAxis].join(", ")}`);
    if (++done % 200 === 0) console.log(`  ...${done}/${targets.length}`);
  });

  const cost = (stats.inTok / 1e6) * 5 + (stats.outTok / 1e6) * 25;
  console.log(`\nprofiled ${stats.drugs} drugs | ${stats.contributions} contributions | new edges ${edges.length} | errors ${stats.errors}`);
  console.log("by axis:", JSON.stringify(stats.byAxis));
  console.log(`tokens in ${stats.inTok} out ${stats.outTok} | cost $${cost.toFixed(2)} ($${(cost / Math.max(done, 1)).toFixed(4)}/drug)`);

  if (DRY_RUN) { console.log("(dry run — nothing written)"); return; }
  for (let i = 0; i < edges.length; i += 200) {
    const r = await fetch(`${url}/rest/v1/kg_edge`, { method: "POST", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(edges.slice(i, i + 200)) });
    if (!r.ok) throw new Error(`edge insert ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
  // record processed drugs (success or empty) so a re-run skips them
  for (let i = 0; i < processedOk.length; i += 500) {
    await fetch(`${url}/rest/v1/pd_processed`, { method: "POST", headers: { ...H, Prefer: "return=minimal,resolution=ignore-duplicates" }, body: JSON.stringify(processedOk.slice(i, i + 500).map((id) => ({ node_id: id }))) });
  }
  console.log(`inserted ${edges.length} PD class-membership edges; recorded ${processedOk.length} processed`);
}

main().catch((e) => { console.error(e); process.exit(1); });
