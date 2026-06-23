// Seed the pharmacokinetic (CYP) layer from the FDA DDI table:
//   - ensure CYP enzyme nodes (type=enzyme),
//   - map each FDA substance to a canonical ingredient node (normalized base name),
//   - insert drug -> enzyme edges (inhibits_enzyme / induces_enzyme / metabolized_by
//     with properties.strength), source = 'FDA_DDI'.
// Idempotency: skips enzyme nodes that already exist and FDA_DDI edges already present.
// Requires the schema migration 20260618240000 (enzyme type + relations) applied.
//
// Usage: set -a; source .env; set +a; SUPABASE_URL=$EXPO_PUBLIC_SUPABASE_URL node scripts/seed-pk-cyp-edges.mjs

import { readFileSync } from "node:fs";

const url = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET;
if (!url || !key) throw new Error("SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required");
const H = { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json" };

const { substances, records } = JSON.parse(
  readFileSync(new URL("./data/fda_pk_cyp.json", import.meta.url)),
);

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
const get = async (q) => (await fetch(`${url}/rest/v1/${q}`, { headers: H })).json();

async function main() {
  const enzymes = [...new Set(records.map((r) => r.enzyme))];
  let enzNodes = await get("kg_node?type=eq.enzyme&select=id,canonical_name");
  const have = new Set(enzNodes.map((n) => n.canonical_name));
  const toCreate = enzymes.filter((e) => !have.has(e))
    .map((e) => ({ type: "enzyme", canonical_name: e, source: "FDA_DDI", identifiers: { enzyme_family: "CYP" } }));
  if (toCreate.length) {
    await fetch(`${url}/rest/v1/kg_node`, { method: "POST", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(toCreate) });
  }
  enzNodes = await get("kg_node?type=eq.enzyme&select=id,canonical_name");
  const enzId = Object.fromEntries(enzNodes.map((n) => [n.canonical_name, n.id]));

  const ing = [];
  for (let off = 0; ; off += 1000) {
    const p = await get(`kg_node?type=eq.ingredient&select=id,canonical_name,source&limit=1000&offset=${off}`);
    if (!p.length) break;
    ing.push(...p);
    if (p.length < 1000) break;
  }
  const byBase = {};
  for (const n of ing) (byBase[base(n.canonical_name)] ??= []).push(n);
  const pick = (sub) => {
    const c = byBase[base(sub)];
    if (!c) return null;
    return c.find((n) => n.canonical_name.toUpperCase() === sub.toUpperCase()) ||
      c.find((n) => n.canonical_name.toUpperCase() === base(sub)) ||
      c.find((n) => n.source === "CPS") || c[0];
  };
  const subMap = {};
  const unmapped = [];
  for (const s of substances) {
    const n = pick(s);
    if (n) subMap[s] = n.id; else unmapped.push(s);
  }
  console.log(`mapped ${Object.keys(subMap).length}/${substances.length}; unmapped ${unmapped.length}`);

  const edges = records
    .map((r) => ({ sid: subMap[r.substance], tid: enzId[r.enzyme], r }))
    .filter((e) => e.sid && e.tid)
    .map((e) => ({ source_id: e.sid, target_id: e.tid, relation: e.r.relation, properties: { strength: e.r.strength }, source: "FDA_DDI", review_status: "published" }));
  for (let i = 0; i < edges.length; i += 200) {
    await fetch(`${url}/rest/v1/kg_edge`, { method: "POST", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(edges.slice(i, i + 200)) });
  }
  console.log(`inserted ${edges.length} PK edges`);
}
main().catch((e) => { console.error(e); process.exit(1); });
