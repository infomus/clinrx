// Strict LLM extraction of the PK (CYP) layer from PubMed evidence, for the
// "emerging drug" gap: drugs whose CYP roles are documented in the literature but
// not in any monograph we ingested (e.g. cariprazine, cobicistat).
//
// Candidate articles come from pubmed_cyp_extraction_candidate (migration
// 20260623160000): articles that mention a CYP isoenzyme and are linked to an
// ingredient node with no existing CYP edge. The ARTICLE (pmid) is the unit of
// extraction; drug names found in the text are mapped to ingredient nodes the
// same way as the monograph pass, so this also captures interacting drugs named
// in the article.
//
// Output: cited ingredient -> enzyme edges (metabolized_by / inhibits_enzyme /
// induces_enzyme), source = 'PUBMED', review_status = 'candidate', citations =
// [pmid], properties = { strength, quote }, extraction_confidence. De-duped
// against ALL existing CYP edges (any source) so it only fills genuine gaps.
//
// Usage:
//   set -a; source .env; set +a
//   SUPABASE_URL=$EXPO_PUBLIC_SUPABASE_URL node scripts/extract-pubmed-cyp-edges.mjs [--limit N] [--dry-run] [--concurrency K] [--verbose]

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const LIMIT = Number(opt("--limit", "0")) || Infinity; // # of articles
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
const CYP_RE = /\bCYP\s?-?\d/i;
const MAX_CHARS_PER_ARTICLE = 18000;

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

// base-name normalization (mirrors seed-pk-cyp-edges.mjs / monograph extractor)
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

const TOOL = {
  name: "record_cyp_relations",
  description:
    "Record every cytochrome-P450 (CYP) metabolism, inhibition, or induction relationship explicitly stated in the article text.",
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
            drug: { type: "string", description: "The drug/substance name exactly as written." },
            enzyme: { type: "string", enum: ENZYMES },
            role: {
              type: "string",
              enum: ["substrate", "inhibitor", "inducer"],
              description: "substrate = metabolized by the enzyme; inhibitor = inhibits it; inducer = induces it.",
            },
            strength: { type: "string", enum: ["strong", "moderate", "weak", "unspecified"] },
            confidence: { type: "number", description: "0-1 confidence this is explicitly and unambiguously stated." },
            quote: { type: "string", description: "Short verbatim snippet from the text supporting this relationship." },
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
  "From supplied PubMed article text (abstract / full-text sections), extract ONLY cytochrome-P450 (CYP) " +
  "relationships that are EXPLICITLY stated: a drug being metabolized by (substrate of), inhibiting, or " +
  "inducing a specific CYP isoenzyme. Restrict to these isoenzymes: " + ENZYMES.join(", ") + ". " +
  "Treat 'CYP3A', 'CYP3A4/5', 'CYP3A5' as CYP3A4. Ignore other enzymes/transporters (UGT, P-gp, CYP2E1, etc.). " +
  "Extract the subject drug AND any named interacting drugs. Do NOT infer or generalize: if the text only says " +
  "'CYP3A4 inhibitors increase levels' without naming a drug, do not invent one. Use strength 'weak' or " +
  "'unspecified' for purely in-vitro findings unless a clinical magnitude is stated. Every relation must be " +
  "supported by a verbatim quote from the supplied text. Return an empty list when nothing qualifies.";

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
      await new Promise((res) => setTimeout(res, Math.min(2000 * 2 ** attempt, 30000)));
      return extractRelations(text, attempt + 1);
    }
    throw new Error(`Anthropic ${r.status}: ${errText.slice(0, 300)}`);
  }
  const json = await r.json();
  if (json.stop_reason === "refusal") return { relations: [], usage: json.usage };
  const block = (json.content ?? []).find((b) => b.type === "tool_use" && b.name === TOOL.name);
  const rels = block?.input?.relations;
  return { relations: Array.isArray(rels) ? rels : [], usage: json.usage };
}

async function pool(items, k, worker) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(k, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        await worker(items[idx], idx);
      }
    }),
  );
}

async function main() {
  const enzNodes = await rest("kg_node?type=eq.enzyme&select=id,canonical_name");
  const enzId = Object.fromEntries(enzNodes.map((n) => [n.canonical_name, n.id]));
  for (const e of ENZYMES) if (!enzId[e]) throw new Error(`enzyme node missing: ${e}`);

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

  // De-dupe against ALL existing CYP edges (any source) — PubMed only fills gaps.
  const existing = await restPage(
    "kg_edge?relation=in.(metabolized_by,inhibits_enzyme,induces_enzyme)&select=source_id,target_id,relation",
  );
  const seen = new Set(existing.map((e) => `${e.source_id}|${e.target_id}|${e.relation}`));
  console.log(`enzymes ${ENZYMES.length}, ingredient nodes ${ing.length}, existing CYP edges ${existing.length}`);

  // Distinct candidate articles.
  const cand = await restPage("pubmed_cyp_extraction_candidate?select=pmid");
  let pmids = [...new Set(cand.map((r) => r.pmid))];
  console.log(`candidate articles: ${pmids.length}`);
  if (LIMIT !== Infinity) pmids = pmids.slice(0, LIMIT);
  console.log(`processing ${pmids.length} articles${DRY_RUN ? " (dry-run)" : ""}\n`);

  const toInsert = [];
  const stats = { rels: 0, unmappedDrug: 0, dupes: 0, edges: 0, errors: 0, inTok: 0, outTok: 0 };
  const unmappedNames = new Set();
  let done = 0;

  await pool(pmids, CONCURRENCY, async (pmid) => {
    let chunks;
    try {
      chunks = await rest(
        `pubmed_evidence_chunk?pmid=eq.${encodeURIComponent(pmid)}&select=id,content,section_title&order=relevance_score.desc.nullslast`,
      );
    } catch (e) {
      stats.errors++;
      done++;
      return;
    }
    const cyp = (Array.isArray(chunks) ? chunks : []).filter((c) => CYP_RE.test(c.content || ""));
    if (!cyp.length) {
      done++;
      return;
    }
    let text = `PMID ${pmid}`;
    for (const c of cyp) {
      const block = `\n\n[${c.section_title || "?"}]\n${c.content}`;
      if (text.length + block.length > MAX_CHARS_PER_ARTICLE) break;
      text += block;
    }
    let rels, usage;
    try {
      ({ relations: rels, usage } = await extractRelations(text));
    } catch (e) {
      stats.errors++;
      console.error(`  ! pmid ${pmid}: ${e.message}`);
      done++;
      return;
    }
    if (usage) {
      stats.inTok += (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0);
      stats.outTok += usage.output_tokens || 0;
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
        properties: { strength: rel.strength, quote: String(rel.quote || "").slice(0, 500), pmid },
        citations: [pmid],
        extraction_confidence: typeof rel.confidence === "number" ? rel.confidence : null,
        review_status: "candidate",
        source: "PUBMED",
      });
      if (VERBOSE) {
        console.log(`  + ${ingr.canonical_name} --${relation}(${rel.strength})--> ${rel.enzyme}  [pmid ${pmid}]`);
      }
    }
    done++;
    if (done % 50 === 0) console.log(`  ...${done}/${pmids.length} articles`);
  });

  const estCost = (stats.inTok / 1e6) * 5 + (stats.outTok / 1e6) * 25;
  console.log(
    `\nrelations ${stats.rels} | new edges ${stats.edges} | dupes ${stats.dupes} | unmapped-drug ${stats.unmappedDrug} | errors ${stats.errors}`,
  );
  console.log(
    `tokens: in ${stats.inTok} out ${stats.outTok} | cost $${estCost.toFixed(2)} over ${done} articles ($${(estCost / Math.max(done, 1)).toFixed(4)}/article)`,
  );
  if (unmappedNames.size) {
    console.log(`unmapped drug names (${unmappedNames.size}): ${[...unmappedNames].slice(0, 40).join(", ")}`);
  }

  if (DRY_RUN) {
    console.log("\n-- dry run: sample of edges that WOULD be inserted --");
    for (const e of toInsert.slice(0, 25)) {
      console.log(`  ${e.relation} ${e.source_id.slice(0, 8)}->${e.target_id.slice(0, 8)} ${e.properties.strength} conf=${e.extraction_confidence} pmid=${e.properties.pmid} :: ${e.properties.quote.slice(0, 80)}`);
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
  console.log(`\ninserted ${toInsert.length} PubMed PK edges`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
