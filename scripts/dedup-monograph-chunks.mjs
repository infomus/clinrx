// Monograph chunk dedup. Many single-substance products carry ~98% identical
// monographs; this marks the redundancy (is_canonical=false on duplicate copies)
// without deleting anything, so the divergent 2% is always preserved with
// provenance. Per substance (ingredient), gathers its single-ingredient products'
// monograph chunks, strips brand + page/header/footer noise, clusters
// near-duplicates within each section, and keeps one canonical per cluster.
// Retrieval then selects is_canonical chunks = one boilerplate rep + one per
// divergence cluster.
//
// Writes assignments to kg_chunk_dedup_stage, then calls apply_kg_chunk_dedup().
//
// Usage: set -a; source .env; set +a
//   SUPABASE_URL=$EXPO_PUBLIC_SUPABASE_URL node scripts/dedup-monograph-chunks.mjs [--substance <id>] [--limit N] [--min-products K] [--dry-run] [--verbose]

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const ONLY = opt("--substance", null);
const LIMIT = Number(opt("--limit", "0")) || Infinity;
const MIN_PRODUCTS = Number(opt("--min-products", "2"));
const DRY_RUN = flag("--dry-run");
const VERBOSE = flag("--verbose");
const JACCARD = 0.9; // conservative: only very-similar chunks cluster (preserve divergences)

const url = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET;
if (!url || !key) throw new Error("SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required");
const H = { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json" };

const rest = async (q) => {
  const r = await fetch(`${url}/rest/v1/${q}`, { headers: H });
  if (!r.ok) throw new Error(`REST ${r.status} ${q.slice(0, 80)} :: ${(await r.text()).slice(0, 160)}`);
  return r.json();
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
const uuid = () => crypto.randomUUID();

// ---- noise stripping + normalization ----------------------------------------
const HEADER_FOOTER = [
  /^\s*page\s+\d+\s+of\s+\d+\s*$/i,
  /^\s*product\s+monograph\b/i,
  /^\s*page\s+\d+\s*$/i,
  /^\s*\d+\s+of\s+\d+\s*$/i,
  /^\s*(date\s+of\s+(revision|preparation|approval)|control\s*(no|number))/i,
];
function stripNoise(content, brandRe) {
  const lines = String(content)
    .split(/\r?\n/)
    .filter((ln) => !HEADER_FOOTER.some((re) => re.test(ln)));
  let t = lines.join(" ");
  if (brandRe) t = t.replace(brandRe, " ");
  return t;
}
function norm(content, brandRe) {
  return stripNoise(content, brandRe)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function trigrams(s) {
  const g = new Set();
  for (let i = 0; i < s.length - 2; i++) g.add(s.slice(i, i + 3));
  return g;
}
function jaccard(a, b) {
  if (!a.size || !b.size) return a.size === b.size ? 1 : 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

const GENERIC_WORDS = new Set(
  ("TABLET TABLETS CAPSULE CAPSULES ODT MG ML ORAL SOLUTION FILM COATED EXTENDED RELEASE " +
    "AND OF THE FOR PR SR XR INJECTION SUSPENSION POWDER CREAM OINTMENT DROPS SPRAY").split(" "),
);

async function processSubstance(ingId, ingName, products, prodSource) {
  const pids = products;
  const chunks = [];
  for (let i = 0; i < pids.length; i += 40) {
    const part = await restPage(
      `kg_chunk?node_id=in.(${pids.slice(i, i + 40).join(",")})&select=id,node_id,section,content`,
    );
    chunks.push(...part);
  }
  if (chunks.length < 2) return null;

  // brand tokens = words from product names minus the substance + generics
  const subWords = new Set(String(ingName).toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/));
  const brand = new Set();
  for (const pid of pids) {
    for (const w of String(prodSource[pid]?.name || "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/)) {
      if (w.length > 1 && !GENERIC_WORDS.has(w) && !subWords.has(w)) brand.add(w);
    }
  }
  const brandRe = brand.size
    ? new RegExp("\\b(" + [...brand].map((b) => b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")\\b", "gi")
    : null;

  // cluster within section
  const bySec = {};
  for (const c of chunks) (bySec[c.section || "?"] ??= []).push(c);
  const stage = [];
  let groups = 0,
    redundant = 0;
  for (const cs of Object.values(bySec)) {
    const grams = cs.map((c) => trigrams(norm(c.content, brandRe)));
    const used = new Array(cs.length).fill(false);
    for (let i = 0; i < cs.length; i++) {
      if (used[i]) continue;
      const cl = [i];
      used[i] = true;
      for (let j = i + 1; j < cs.length; j++) {
        if (!used[j] && jaccard(grams[i], grams[j]) >= JACCARD) {
          cl.push(j);
          used[j] = true;
        }
      }
      const gid = uuid();
      const prods = new Set(cl.map((k) => cs[k].node_id));
      // canonical = longest content, prefer CPS source
      const canonical = cl
        .slice()
        .sort(
          (a, b) =>
            (cs[b].content || "").length - (cs[a].content || "").length ||
            (prodSource[cs[a].node_id]?.source === "CPS" ? -1 : 0) - (prodSource[cs[b].node_id]?.source === "CPS" ? -1 : 0),
        )[0];
      for (const k of cl) {
        stage.push({
          chunk_id: cs[k].id,
          dedup_group_id: gid,
          is_canonical: k === canonical,
          dedup_substance_id: ingId,
          dedup_product_count: prods.size,
        });
        if (k !== canonical) redundant++;
      }
      groups++;
    }
  }
  if (VERBOSE) {
    console.log(`  ${ingName}: ${chunks.length} chunks (${pids.length} products) -> ${groups} groups, ${redundant} redundant`);
  }
  return { chunks: chunks.length, groups, redundant, stage };
}

async function main() {
  // single-ingredient products -> ingredient
  const hi = await restPage("kg_edge?relation=eq.has_ingredient&select=source_id,target_id");
  const ingOf = new Map(); // product -> [ingredients]
  for (const e of hi) (ingOf.get(e.source_id) ?? ingOf.set(e.source_id, []).get(e.source_id)).push(e.target_id);
  const ingProducts = new Map(); // ingredient -> [single-ingredient products]
  for (const [pid, ings] of ingOf) {
    if (ings.length !== 1) continue;
    const ing = ings[0];
    (ingProducts.get(ing) ?? ingProducts.set(ing, []).get(ing)).push(pid);
  }

  // product metadata (name, source) for the products we'll touch
  const allPids = [...new Set([...ingProducts.values()].flat())];
  const prodSource = {};
  for (let i = 0; i < allPids.length; i += 150) {
    for (const n of await rest(`kg_node?id=in.(${allPids.slice(i, i + 150).join(",")})&select=id,canonical_name,source`)) {
      prodSource[n.id] = { name: n.canonical_name, source: n.source };
    }
  }

  let targets = [...ingProducts.entries()].filter(([, ps]) => ps.length >= MIN_PRODUCTS);
  if (ONLY) targets = targets.filter(([id]) => id === ONLY);
  // name the ingredients
  const ingIds = targets.map(([id]) => id);
  const ingName = {};
  for (let i = 0; i < ingIds.length; i += 150) {
    for (const n of await rest(`kg_node?id=in.(${ingIds.slice(i, i + 150).join(",")})&select=id,canonical_name`)) {
      ingName[n.id] = n.canonical_name;
    }
  }
  if (LIMIT !== Infinity) targets = targets.slice(0, LIMIT);
  console.log(`substances with >=${MIN_PRODUCTS} single-ingredient products: ${targets.length}${DRY_RUN ? " (dry-run)" : ""}`);

  const allStage = [];
  let totChunks = 0,
    totGroups = 0,
    totRedundant = 0,
    done = 0;
  for (const [ingId, ps] of targets) {
    const r = await processSubstance(ingId, ingName[ingId] || ingId, ps, prodSource);
    if (r) {
      totChunks += r.chunks;
      totGroups += r.groups;
      totRedundant += r.redundant;
      allStage.push(...r.stage);
    }
    if (++done % 200 === 0) console.log(`  ...${done}/${targets.length} substances`);
  }
  console.log(
    `\nprocessed ${totChunks} chunks across ${targets.length} substances -> ${totGroups} groups, ${totRedundant} redundant (${totChunks ? (100 * totRedundant / totChunks).toFixed(0) : 0}% marked non-canonical)`,
  );

  if (DRY_RUN) {
    console.log("(dry run — staged nothing)");
    return;
  }

  // wipe stage, bulk insert, apply
  await fetch(`${url}/rest/v1/kg_chunk_dedup_stage?chunk_id=not.is.null`, { method: "DELETE", headers: { ...H, Prefer: "return=minimal" } });
  for (let i = 0; i < allStage.length; i += 1000) {
    const r = await fetch(`${url}/rest/v1/kg_chunk_dedup_stage`, {
      method: "POST",
      headers: { ...H, Prefer: "return=minimal" },
      body: JSON.stringify(allStage.slice(i, i + 1000)),
    });
    if (!r.ok) throw new Error(`stage insert ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
  // The apply UPDATE can exceed the PostgREST gateway HTTP timeout on a large
  // staging set (it keeps running server-side and completes). Tolerate the 504 by
  // polling the applied count until it reaches the staged count.
  const expected = allStage.length;
  const applied = await fetch(`${url}/rest/v1/rpc/apply_kg_chunk_dedup`, { method: "POST", headers: H, body: "{}" }).catch(() => null);
  if (applied && applied.ok) {
    console.log(`applied dedup to ${await applied.text()} chunks`);
  } else {
    console.log(`apply HTTP returned ${applied ? applied.status : "error"}; polling server-side completion...`);
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const r = await fetch(`${url}/rest/v1/kg_chunk?dedup_substance_id=not.is.null&select=id&limit=1`, { headers: { ...H, Prefer: "count=exact" } });
      const n = Number((r.headers.get("content-range") || "/0").split("/")[1]);
      if (n >= expected) {
        console.log(`applied dedup to ${n} chunks (verified)`);
        break;
      }
      if (i === 59) console.log(`still ${n}/${expected} applied after polling — verify manually`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
