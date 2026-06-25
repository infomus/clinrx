// Build the ATC class hierarchy: the scaffold class-level interactions and
// "interacting members" ride on. The ATC-5 codes on ingredients self-encode the
// tree (N06AB03 -> N06AB -> N06A -> N06 -> N); names come from the WHO ATC
// reference (scripts/data/atc_classes.json). Creates drug_class nodes for each
// needed L1-L4 code (reusing an existing class node by ATC code or matching name)
// and subclass_of edges ingredient->L4->L3->L2->L1. Idempotent.
//
// Usage: set -a; source .env; set +a
//   SUPABASE_URL=$EXPO_PUBLIC_SUPABASE_URL node scripts/build-atc-hierarchy.mjs [--dry-run]

import { readFileSync } from "node:fs";

const DRY_RUN = process.argv.includes("--dry-run");
const url = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET;
if (!url || !key) throw new Error("SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required");
const H = { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json" };

const ATC = JSON.parse(readFileSync(new URL("./data/atc_classes.json", import.meta.url)));
const lvl = (c) => (/^[A-Z]$/.test(c) ? 1 : /^[A-Z][0-9]{2}$/.test(c) ? 2 : /^[A-Z][0-9]{2}[A-Z]$/.test(c) ? 3 : /^[A-Z][0-9]{2}[A-Z]{2}$/.test(c) ? 4 : /^[A-Z][0-9]{2}[A-Z]{2}[0-9]{2}$/.test(c) ? 5 : 0);
const parent = (c) => {
  const L = lvl(c);
  if (L === 5) return c.slice(0, 5);
  if (L === 4) return c.slice(0, 4);
  if (L === 3) return c.slice(0, 3);
  if (L === 2) return c.slice(0, 1);
  return null;
};
const normName = (s) => String(s).toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

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
const post = async (table, rows) => {
  for (let i = 0; i < rows.length; i += 500) {
    const r = await fetch(`${url}/rest/v1/${table}`, { method: "POST", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(rows.slice(i, i + 500)) });
    if (!r.ok) throw new Error(`insert ${table} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
};

async function main() {
  // ingredient ATC-5 codes
  const ing = await restPage("kg_node?type=eq.ingredient&select=id,identifiers");
  const ingAtc = []; // {id, codes:[atc5...]}
  const needed = new Set();
  const target = (c) => (lvl(c) === 5 ? c.slice(0, 5) : c); // ingredient links to its L4 (or its own level if <5)
  for (const n of ing) {
    const a = n.identifiers?.atc;
    if (!a) continue;
    const codes = (Array.isArray(a) ? a : [a]).filter((c) => lvl(c) >= 2 && lvl(c) <= 5);
    if (!codes.length) continue;
    ingAtc.push({ id: n.id, codes });
    for (const c of codes) {
      let p = target(c);
      needed.add(p);
      while ((p = parent(p))) needed.add(p);
    }
  }
  console.log(`ingredients linked to ATC: ${ingAtc.length}; needed L1-L4 class codes: ${needed.size}`);

  // existing class nodes -> by atc_code and by normalized name
  const cls = await restPage("kg_node?type=eq.drug_class&select=id,canonical_name,identifiers");
  const byCode = {};
  const byName = {};
  for (const c of cls) {
    const code = c.identifiers?.atc_code;
    if (code && !byCode[code]) byCode[code] = c.id;
    const nn = normName(c.canonical_name);
    if (nn && !byName[nn]) byName[nn] = c.id;
  }

  // resolve a node id per needed code; create the missing ones
  const codeNode = {};
  const newNodes = [];
  for (const code of needed) {
    const name = ATC[code];
    if (!name) continue; // shouldn't happen (100% coverage)
    let id = byCode[code] || byName[normName(name)];
    if (!id) {
      id = crypto.randomUUID();
      newNodes.push({ id, type: "drug_class", canonical_name: name, source: "WHO_ATC", identifiers: { atc_code: code, atc_level: lvl(code) } });
    }
    codeNode[code] = id;
  }
  console.log(`existing class nodes reused: ${needed.size - newNodes.length}; new class nodes to create: ${newNodes.length}`);

  // existing subclass_of edges (dedupe)
  const existingSub = new Set(
    (await restPage("kg_edge?relation=eq.subclass_of&select=source_id,target_id")).map((e) => `${e.source_id}|${e.target_id}`),
  );
  const edges = [];
  const seen = new Set();
  const addEdge = (s, t) => {
    if (!s || !t || s === t) return;
    const k = `${s}|${t}`;
    if (seen.has(k) || existingSub.has(k)) return;
    seen.add(k);
    edges.push({ source_id: s, target_id: t, relation: "subclass_of", source: "WHO_ATC", review_status: "published" });
  };
  // ingredient -> its ATC class (L4 for L5 codes; own level otherwise)
  for (const { id, codes } of ingAtc) {
    for (const c of codes) addEdge(id, codeNode[target(c)]);
  }
  // class -> parent class (L4->L3->L2->L1)
  for (const code of needed) {
    const p = parent(code);
    if (p && codeNode[p]) addEdge(codeNode[code], codeNode[p]);
  }
  console.log(`new subclass_of edges: ${edges.length}`);

  if (DRY_RUN) {
    console.log("dry run — sample new classes:", newNodes.slice(0, 5).map((n) => n.identifiers.atc_code + "=" + n.canonical_name).join(" | "));
    return;
  }
  if (newNodes.length) await post("kg_node", newNodes);
  if (edges.length) await post("kg_edge", edges);
  console.log(`created ${newNodes.length} ATC class nodes + ${edges.length} subclass_of edges`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
