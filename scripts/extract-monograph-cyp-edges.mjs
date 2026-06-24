// Strict LLM extraction of the pharmacokinetic (CYP) layer from monograph text.
//
// For every CPS / Health-Canada monograph chunk in the CLINICAL PHARMACOLOGY /
// DRUG INTERACTIONS sections that mentions a CYP enzyme, ask Claude (strict tool
// use, claude-opus-4-8) to pull {drug, enzyme, role, strength, quote} triples,
// then materialize cited ingredient -> enzyme edges:
//   substrate -> metabolized_by, inhibitor -> inhibits_enzyme, inducer -> induces_enzyme
// source = CPS_MONOGRAPH / HC_MONOGRAPH, review_status = 'candidate' (needs review),
// citations = [chunk ids], properties = { strength, quote }, extraction_confidence.
//
// Drug names are mapped to canonical ingredient nodes with the same base-name
// normalization used by seed-pk-cyp-edges.mjs, so the new edges join cleanly with
// the FDA-derived edges in the kg_pk_interaction view. Enzymes are restricted to
// the 7 nodes the FDA pass created (the clinically dominant isoforms).
//
// Idempotent: skips any (source_id, target_id, relation) already present from a
// *_MONOGRAPH source, and de-dupes within a run.
//
// Usage:
//   set -a; source .env; set +a
//   SUPABASE_URL=$EXPO_PUBLIC_SUPABASE_URL node scripts/extract-monograph-cyp-edges.mjs [--limit N] [--dry-run] [--concurrency K] [--verbose]

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const LIMIT = Number(opt("--limit", "0")) || Infinity; // # of drug nodes
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
const ENZYMES = ["CYP1A2", "CYP2B6", "CYP2C8", "CYP2C9", "CYP2C19", "CYP2D6", "CYP3A4"];
const ROLE_TO_RELATION = {
  substrate: "metabolized_by",
  inhibitor: "inhibits_enzyme",
  inducer: "induces_enzyme",
};
const TARGET_SECTIONS =
  "or=(section.ilike.CLINICAL PHARMACOLOGY*,section.ilike.DRUG INTERACTIONS*,section.ilike.ACTION AND CLINICAL PHARMACOLOGY*,section.ilike.Action and Clinical Pharmacology*)";
const CYP_RE = /\bCYP\s?-?\d/i;
const MAX_CHARS_PER_NODE = 16000;

// ---- Supabase REST helpers -------------------------------------------------
const rest = async (q) => {
  const r = await fetch(`${url}/rest/v1/${q}`, { headers: H });
  const t = await r.text();
  let d;
  try {
    d = JSON.parse(t);
  } catch {
    d = t;
  }
  if (!r.ok) throw new Error(`REST ${r.status} ${q.slice(0, 80)} :: ${String(t).slice(0, 200)}`);
  return d;
};
const restPage = async (base) => {
  const out = [];
  for (let off = 0; ; off += 1000) {
    const p = await rest(`${base}&limit=1000&offset=${off}`);
    if (!Array.isArray(p) || !p.length) break;
    out.push(...p);
    if (p.length < 1000) break;
  }
  return out;
};

// ---- ingredient base-name normalization (mirrors seed-pk-cyp-edges.mjs) -----
const SALT = new Set([
  "SODIUM", "POTASSIUM", "CALCIUM", "MAGNESIUM", "HYDROCHLORIDE", "HCL",
  "HYDROBROMIDE", "BROMIDE", "CHLORIDE", "SULFATE", "SULPHATE", "MESYLATE",
  "MALEATE", "TARTRATE", "BITARTRATE", "CITRATE", "PHOSPHATE", "ACETATE",
  "SUCCINATE", "FUMARATE", "BESYLATE", "BESILATE", "NITRATE", "OXALATE",
  "PAMOATE", "DECANOATE", "HYDRATE", "DIHYDRATE", "MONOHYDRATE", "ANHYDROUS",
  "DISODIUM", "TROMETHAMINE", "MEGLUMINE", "HEMIFUMARATE",
]);
function base(n) {
  let s = (n || "").toUpperCase().replace(/\(.*?\)/g, " ")
    .replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const t = s.split(" ").filter(Boolean);
  while (t.length > 1 && SALT.has(t[t.length - 1])) t.pop();
  return t.join(" ");
}

// ---- Anthropic strict extraction -------------------------------------------
const TOOL = {
  name: "record_cyp_relations",
  description:
    "Record every cytochrome-P450 (CYP) metabolism, inhibition, or induction relationship explicitly stated in the monograph text.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      relations: {
        type: "array",
        description: "One entry per explicitly stated drug<->enzyme relationship. Empty array if none.",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            drug: {
              type: "string",
              description: "The drug/substance name exactly as written in the text (the subject drug or a named interacting drug).",
            },
            enzyme: { type: "string", enum: ENZYMES },
            role: {
              type: "string",
              enum: ["substrate", "inhibitor", "inducer"],
              description: "substrate = the drug is metabolized by the enzyme; inhibitor = the drug inhibits it; inducer = the drug induces it.",
            },
            strength: {
              type: "string",
              enum: ["strong", "moderate", "weak", "unspecified"],
            },
            confidence: {
              type: "number",
              description: "0-1 confidence that this relationship is explicitly and unambiguously stated.",
            },
            quote: {
              type: "string",
              description: "Short verbatim snippet from the text that supports this relationship.",
            },
          },
          required: ["drug", "enzyme", "role", "strength", "confidence", "quote"],
        },
      },
    },
    required: ["relations"],
  },
};

const SYSTEM =
  "You are a clinical-pharmacology extraction engine for a Canadian pharmacy knowledge graph. " +
  "From supplied drug-monograph text, extract ONLY cytochrome-P450 (CYP) relationships that are EXPLICITLY stated: " +
  "a drug being metabolized by (substrate of), inhibiting, or inducing a specific CYP isoenzyme. " +
  "Restrict to these isoenzymes: " + ENZYMES.join(", ") + ". " +
  "Treat 'CYP3A', 'CYP3A4/5', and 'CYP3A5' as CYP3A4. Ignore other enzymes/transporters (e.g. UGT, P-gp, CYP2E1). " +
  "Extract the subject drug AND any named interacting drugs (e.g. 'ketoconazole, a CYP3A4 inhibitor'). " +
  "Do NOT infer or generalize: if the text only says 'CYP3A4 inhibitors increase levels' without naming a drug, do not invent one. " +
  "Every relation must be supported by a verbatim quote from the supplied text. Return an empty list when nothing qualifies.";

async function extractRelations(text, attempt = 0) {
  const body = {
    model: MODEL,
    max_tokens: 2000,
    system: SYSTEM,
    messages: [{ role: "user", content: text }],
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL.name },
  };
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "x-api-key": anthropicKey,
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const errText = await r.text();
    if ((r.status === 429 || r.status >= 500) && attempt < 5) {
      const wait = Math.min(2000 * 2 ** attempt, 30000);
      await new Promise((res) => setTimeout(res, wait));
      return extractRelations(text, attempt + 1);
    }
    throw new Error(`Anthropic ${r.status}: ${errText.slice(0, 300)}`);
  }
  const json = await r.json();
  if (json.stop_reason === "refusal") return [];
  const block = (json.content ?? []).find((b) => b.type === "tool_use" && b.name === TOOL.name);
  const rels = block?.input?.relations;
  return Array.isArray(rels) ? rels : [];
}

// ---- simple concurrency pool ----------------------------------------------
async function pool(items, k, worker) {
  let i = 0;
  const runners = Array.from({ length: Math.min(k, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
}

// ---- main ------------------------------------------------------------------
async function main() {
  // Enzyme node ids.
  const enzNodes = await rest("kg_node?type=eq.enzyme&select=id,canonical_name");
  const enzId = Object.fromEntries(enzNodes.map((n) => [n.canonical_name, n.id]));
  for (const e of ENZYMES) if (!enzId[e]) throw new Error(`enzyme node missing: ${e}`);

  // Ingredient nodes -> base-name index.
  const ing = await restPage("kg_node?type=eq.ingredient&select=id,canonical_name,source");
  const byBase = {};
  for (const n of ing) (byBase[base(n.canonical_name)] ??= []).push(n);
  const resolveIngredient = (name) => {
    const c = byBase[base(name)];
    if (!c) return null;
    return (
      c.find((n) => n.canonical_name.toUpperCase() === name.toUpperCase()) ||
      c.find((n) => n.canonical_name.toUpperCase() === base(name)) ||
      c.find((n) => n.source === "CPS") || c[0]
    );
  };
  console.log(`enzymes ${ENZYMES.length}, ingredient nodes ${ing.length}`);

  // Existing monograph edges (idempotency).
  const existing = await restPage(
    "kg_edge?source=in.(CPS_MONOGRAPH,HC_MONOGRAPH)&select=source_id,target_id,relation",
  );
  const seen = new Set(existing.map((e) => `${e.source_id}|${e.target_id}|${e.relation}`));
  console.log(`existing monograph edges: ${existing.length}`);

  // Candidate chunks -> group CYP-mentioning ones by owning drug node.
  const chunks = await restPage(
    `kg_chunk?select=id,node_id,content,section,source&${TARGET_SECTIONS}`,
  );
  const byNode = new Map();
  for (const c of chunks) {
    if (!CYP_RE.test(c.content || "")) continue;
    if (!byNode.has(c.node_id)) byNode.set(c.node_id, []);
    byNode.get(c.node_id).push(c);
  }
  let nodes = [...byNode.entries()];
  console.log(`candidate drug nodes: ${nodes.length} (CYP chunks: ${chunks.filter((c) => CYP_RE.test(c.content || "")).length})`);
  if (LIMIT !== Infinity) nodes = nodes.slice(0, LIMIT);
  console.log(`processing ${nodes.length} nodes${DRY_RUN ? " (dry-run)" : ""}\n`);

  // Owner drug-node names (for logging/context).
  const ownerIds = nodes.map(([id]) => id);
  const owners = {};
  for (let i = 0; i < ownerIds.length; i += 200) {
    const part = await rest(`kg_node?id=in.(${ownerIds.slice(i, i + 200).join(",")})&select=id,canonical_name`);
    for (const n of part) owners[n.id] = n.canonical_name;
  }

  const toInsert = [];
  const stats = { rels: 0, unmappedDrug: 0, dupes: 0, edges: 0, errors: 0 };
  const unmappedNames = new Set();
  let done = 0;

  await pool(nodes, CONCURRENCY, async ([nodeId, nodeChunks]) => {
    const sorted = nodeChunks.sort((a, b) => (a.section || "").localeCompare(b.section || ""));
    let text = "";
    const usedChunkIds = [];
    for (const c of sorted) {
      const block = `\n\n[${c.section || "?"}]\n${c.content}`;
      if (text.length + block.length > MAX_CHARS_PER_NODE) break;
      text += block;
      usedChunkIds.push(c.id);
    }
    const srcLabel = nodeChunks[0].source === "CPS" ? "CPS_MONOGRAPH" : "HC_MONOGRAPH";
    let rels;
    try {
      rels = await extractRelations(text.trim());
    } catch (e) {
      stats.errors++;
      console.error(`  ! ${owners[nodeId] || nodeId}: ${e.message}`);
      done++;
      return;
    }
    for (const rel of rels) {
      stats.rels++;
      const relation = ROLE_TO_RELATION[rel.role];
      const tid = enzId[rel.enzyme];
      if (!relation || !tid) continue;
      const ingr = resolveIngredient(rel.drug);
      if (!ingr) {
        stats.unmappedDrug++;
        unmappedNames.add(rel.drug);
        continue;
      }
      const k = `${ingr.id}|${tid}|${relation}`;
      if (seen.has(k)) {
        stats.dupes++;
        continue;
      }
      seen.add(k);
      stats.edges++;
      toInsert.push({
        source_id: ingr.id,
        target_id: tid,
        relation,
        properties: { strength: rel.strength, quote: String(rel.quote || "").slice(0, 500) },
        citations: usedChunkIds,
        extraction_confidence: typeof rel.confidence === "number" ? rel.confidence : null,
        review_status: "candidate",
        source: srcLabel,
      });
      if (VERBOSE) {
        console.log(`  + ${ingr.canonical_name} --${relation}(${rel.strength})--> ${rel.enzyme}  [${owners[nodeId]}]`);
      }
    }
    done++;
    if (done % 20 === 0) console.log(`  ...${done}/${nodes.length} nodes`);
  });

  console.log(
    `\nrelations extracted ${stats.rels} | new edges ${stats.edges} | dupes ${stats.dupes} | unmapped-drug ${stats.unmappedDrug} | errors ${stats.errors}`,
  );
  if (unmappedNames.size) {
    console.log(`unmapped drug names (${unmappedNames.size}): ${[...unmappedNames].slice(0, 40).join(", ")}`);
  }

  if (DRY_RUN) {
    console.log("\n-- dry run: sample of edges that WOULD be inserted --");
    for (const e of toInsert.slice(0, 25)) {
      console.log(`  ${e.relation} ${e.source_id.slice(0, 8)}->${e.target_id.slice(0, 8)} ${e.properties.strength} conf=${e.extraction_confidence} :: ${e.properties.quote.slice(0, 90)}`);
    }
    console.log(`\n(${toInsert.length} edges; not inserted)`);
    return;
  }

  for (let i = 0; i < toInsert.length; i += 200) {
    const r = await fetch(`${url}/rest/v1/kg_edge`, {
      method: "POST",
      headers: { ...H, Prefer: "return=minimal" },
      body: JSON.stringify(toInsert.slice(i, i + 200)),
    });
    if (!r.ok) throw new Error(`insert ${r.status}: ${(await r.text()).slice(0, 300)}`);
  }
  console.log(`\ninserted ${toInsert.length} monograph PK edges`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
