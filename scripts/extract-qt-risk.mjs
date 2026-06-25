// QT-prolongation PD layer. For each candidate substance (qt_extraction_candidate),
// gather its QT-mentioning monograph + PubMed evidence and have Claude (strict tool,
// claude-opus-4-8) assess the drug's own QT-prolongation risk tier — CredibleMeds
// style: known / possible / conditional / none. Then link the ingredient to the
// matching functional class node ("QT-prolonging agents (… risk)") with a
// subclass_of edge (source=QT_PD_LAYER, review_status=candidate, cited).
//
// Pairwise QT interactions are derived later from class co-membership (PD analog
// of the kg_pk_interaction view).
//
// Usage: set -a; source .env; set +a
//   SUPABASE_URL=$EXPO_PUBLIC_SUPABASE_URL node scripts/extract-qt-risk.mjs [--limit N] [--dry-run] [--concurrency K] [--verbose]

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const LIMIT = Number(opt("--limit", "0")) || Infinity;
const DRY_RUN = flag("--dry-run");
const CONCURRENCY = Number(opt("--concurrency", "4"));
const VERBOSE = flag("--verbose");

const url = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET;
const anthropicKey = process.env.ANTHROPIC_API_KEY;
if (!url || !key) throw new Error("SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required");
if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY required");
const H = { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json" };
const MODEL = "claude-opus-4-8";
const QT_RE = /torsade|qtc|qt interval|qt[ -]?prolong|prolong[a-z]* .{0,15}qt/i;
const MAX_CHARS = 16000;

const TIERS = {
  known: { name: "QT-prolonging agents (Known risk)", tier: "known" },
  possible: { name: "QT-prolonging agents (Possible risk)", tier: "possible" },
  conditional: { name: "QT-prolonging agents (Conditional risk)", tier: "conditional" },
};

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
  name: "assess_qt_risk",
  description: "Assess whether the named drug itself prolongs the QT interval / causes torsades de pointes, and its risk tier, from the supplied evidence.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      risk_tier: {
        type: "string",
        enum: ["known", "possible", "conditional", "none"],
        description: "known = drug prolongs QTc AND is associated with documented TdP; possible = can prolong QTc but TdP risk not established; conditional = QT/TdP risk only under specific conditions (overdose, hypokalemia, interactions, congenital LQTS); none = this drug is NOT a QT-prolonging agent (QT mentioned for another reason or no effect).",
      },
      rationale: { type: "string", description: "Brief justification grounded in the supplied evidence." },
      quote: { type: "string", description: "Short verbatim snippet supporting the assessment." },
      confidence: { type: "number", description: "0-1 confidence." },
    },
    required: ["risk_tier", "rationale", "quote", "confidence"],
  },
};
const SYSTEM =
  "You are a cardiac-safety classification engine for a Canadian pharmacy knowledge graph. Given the name of ONE drug and " +
  "evidence excerpts (its monograph + literature), assess THAT drug's own risk of QT-interval prolongation / torsades de pointes (TdP), " +
  "using CredibleMeds-style tiers. Judge only the named drug — text often mentions QT as a general precaution or names OTHER QT drugs; " +
  "do not classify the named drug as a prolonger unless the evidence is about IT. Tiers: known (prolongs QTc and documented TdP), " +
  "possible (prolongs QTc, TdP not established), conditional (risk only under specific conditions), none (not a QT-prolonging agent). " +
  "Every assessment must cite a verbatim quote. Use 'none' freely when the drug itself isn't implicated.";

async function assess(name, text, attempt = 0) {
  const body = {
    model: MODEL, max_tokens: 700, system: SYSTEM,
    messages: [{ role: "user", content: `Drug: ${name}\n\nEvidence:\n${text}` }],
    tools: [TOOL], tool_choice: { type: "tool", name: TOOL.name },
  };
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "anthropic-version": "2023-06-01", "content-type": "application/json", "x-api-key": anthropicKey },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text();
    if ((r.status === 429 || r.status >= 500) && attempt < 5) { await new Promise((res) => setTimeout(res, Math.min(2000 * 2 ** attempt, 30000))); return assess(name, text, attempt + 1); }
    throw new Error(`Anthropic ${r.status}: ${t.slice(0, 200)}`);
  }
  const json = await r.json();
  if (json.stop_reason === "refusal") return { res: null, usage: json.usage };
  const block = (json.content ?? []).find((b) => b.type === "tool_use" && b.name === TOOL.name);
  return { res: block?.input ?? null, usage: json.usage };
}

async function pool(items, k, worker) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(k, items.length) }, async () => { while (i < items.length) { const idx = i++; await worker(items[idx], idx); } }));
}

async function ensureTierNodes() {
  const existing = await rest("kg_node?type=eq.drug_class&source=eq.QT_PD_LAYER&select=id,identifiers");
  const byTier = {};
  for (const n of existing) byTier[n.identifiers?.risk_tier] = n.id;
  const toCreate = [];
  for (const t of Object.values(TIERS)) {
    if (!byTier[t.tier]) {
      const id = crypto.randomUUID();
      byTier[t.tier] = id;
      toCreate.push({ id, type: "drug_class", canonical_name: t.name, source: "QT_PD_LAYER", identifiers: { functional_class: "qt_prolongation", risk_tier: t.tier } });
    }
  }
  if (toCreate.length && !DRY_RUN) {
    const r = await fetch(`${url}/rest/v1/kg_node`, { method: "POST", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(toCreate) });
    if (!r.ok) throw new Error(`tier node insert ${r.status}: ${(await r.text()).slice(0, 160)}`);
  }
  return byTier;
}

async function main() {
  let cands = await restPage("qt_extraction_candidate?select=node_id");
  const ids = cands.map((c) => c.node_id);
  const nameOf = {};
  for (let i = 0; i < ids.length; i += 150) {
    for (const n of await rest(`kg_node?id=in.(${ids.slice(i, i + 150).join(",")})&select=id,canonical_name`)) nameOf[n.id] = n.canonical_name;
  }
  let targets = ids.filter((id) => nameOf[id]);
  if (LIMIT !== Infinity) targets = targets.slice(0, LIMIT);
  console.log(`QT candidate substances: ${targets.length}${DRY_RUN ? " (dry-run)" : ""}`);
  const tierNode = await ensureTierNodes();

  // existing QT edges (idempotency)
  const existingEdges = new Set(
    (await restPage("kg_edge?source=eq.QT_PD_LAYER&relation=eq.subclass_of&select=source_id,target_id")).map((e) => `${e.source_id}|${e.target_id}`),
  );

  const edges = [];
  const stats = { none: 0, known: 0, possible: 0, conditional: 0, errors: 0, inTok: 0, outTok: 0 };
  let done = 0;

  await pool(targets, CONCURRENCY, async (nodeId) => {
    // gather QT chunks: monograph (products) + pubmed
    let text = "";
    try {
      const prods = (await rest(`kg_edge?target_id=eq.${nodeId}&relation=eq.has_ingredient&select=source_id&limit=200`)).map((e) => e.source_id);
      const mono = [];
      for (let i = 0; i < prods.length && mono.length < 8; i += 40) {
        const part = await rest(`kg_chunk?node_id=in.(${prods.slice(i, i + 40).join(",")})&is_canonical=eq.true&select=content,section`);
        for (const c of part) if (QT_RE.test(c.content || "")) mono.push(c);
      }
      const pmids = (await rest(`pubmed_article_kg_node?node_id=eq.${nodeId}&select=pmid&limit=60`)).map((p) => p.pmid);
      const pub = [];
      for (let i = 0; i < pmids.length && pub.length < 6; i += 30) {
        const part = await rest(`pubmed_evidence_chunk?pmid=in.(${pmids.slice(i, i + 30).map((p) => encodeURIComponent(p)).join(",")})&select=content,section_title&order=relevance_score.desc.nullslast`);
        for (const c of part) if (QT_RE.test(c.content || "")) pub.push({ content: c.content, section: c.section_title });
      }
      for (const c of [...mono, ...pub]) {
        const block = `\n\n[${c.section || "?"}]\n${c.content}`;
        if (text.length + block.length > MAX_CHARS) break;
        text += block;
      }
    } catch (e) { stats.errors++; done++; return; }
    if (!text.trim()) { done++; return; }

    let res, usage;
    try { ({ res, usage } = await assess(nameOf[nodeId], text.trim())); }
    catch (e) { stats.errors++; console.error(`  ! ${nameOf[nodeId]}: ${e.message}`); done++; return; }
    if (usage) { stats.inTok += (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0); stats.outTok += usage.output_tokens || 0; }
    if (!res) { done++; return; }
    const tier = res.risk_tier;
    stats[tier] = (stats[tier] || 0) + 1;
    if (tier !== "none") {
      const tid = tierNode[tier];
      const k = `${nodeId}|${tid}`;
      if (!existingEdges.has(k)) {
        existingEdges.add(k);
        edges.push({
          source_id: nodeId, target_id: tid, relation: "subclass_of", source: "QT_PD_LAYER", review_status: "candidate",
          properties: { functional_class: "qt_prolongation", risk_tier: tier, rationale: String(res.rationale || "").slice(0, 400), quote: String(res.quote || "").slice(0, 400) },
          extraction_confidence: typeof res.confidence === "number" ? res.confidence : null,
        });
        if (VERBOSE) console.log(`  + ${nameOf[nodeId]} -> QT ${tier} :: ${String(res.quote || "").slice(0, 80)}`);
      }
    }
    if (++done % 100 === 0) console.log(`  ...${done}/${targets.length}`);
  });

  const cost = (stats.inTok / 1e6) * 5 + (stats.outTok / 1e6) * 25;
  console.log(`\nassessed ${done} | known ${stats.known} possible ${stats.possible} conditional ${stats.conditional} none ${stats.none} | errors ${stats.errors}`);
  console.log(`new QT class edges: ${edges.length} | tokens in ${stats.inTok} out ${stats.outTok} | cost $${cost.toFixed(2)} ($${(cost / Math.max(done, 1)).toFixed(4)}/drug)`);

  if (DRY_RUN) { console.log("(dry run — nothing written)"); return; }
  for (let i = 0; i < edges.length; i += 200) {
    const r = await fetch(`${url}/rest/v1/kg_edge`, { method: "POST", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(edges.slice(i, i + 200)) });
    if (!r.ok) throw new Error(`edge insert ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
  console.log(`inserted ${edges.length} QT class-membership edges`);
}

main().catch((e) => { console.error(e); process.exit(1); });
