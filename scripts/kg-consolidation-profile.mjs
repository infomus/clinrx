// Phase 1 (READ-ONLY) of KG ingredient consolidation: cluster the interaction-
// bearing spine (ingredient + drug_class nodes) by the canonical identity key
// and report the duplication / typing mess, plus a proposed merge map. No writes.
//
// Policy (confirmed):
//   - Canonical key = ATC substance (level-5, 7-char) when present, else normalized
//     base moiety name.
//   - Salts/esters/hydrates collapse to the base moiety.
//   - Conservative: only deterministic clusters are "auto"; everything ambiguous
//     is flagged for human review. Never cross different ATC substances.
//
// Usage:
//   set -a; source .env; set +a
//   SUPABASE_URL=$EXPO_PUBLIC_SUPABASE_URL node scripts/kg-consolidation-profile.mjs

import { mkdirSync, writeFileSync } from "node:fs";

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}
const H = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` };

// Trailing salt / ester / hydrate tokens stripped to reach the base moiety.
const SALT_TOKENS = new Set([
  "SODIUM", "POTASSIUM", "CALCIUM", "MAGNESIUM", "ZINC", "LITHIUM",
  "HYDROCHLORIDE", "HCL", "DIHYDROCHLORIDE", "HYDROBROMIDE", "HBR", "BROMIDE",
  "CHLORIDE", "SULFATE", "SULPHATE", "BISULFATE", "HEMISULFATE",
  "MESYLATE", "MESILATE", "MALEATE", "TARTRATE", "BITARTRATE", "CITRATE",
  "PHOSPHATE", "DIPHOSPHATE", "ACETATE", "SUCCINATE", "FUMARATE", "HEMIFUMARATE",
  "BESYLATE", "BESILATE", "NITRATE", "OXALATE", "PAMOATE", "EMBONATE",
  "DECANOATE", "ENANTHATE", "PROPIONATE", "VALERATE", "DIPROPIONATE",
  "FUROATE", "XINAFOATE", "LACTATE", "GLUCONATE", "STEARATE", "PALMITATE",
  "TOSYLATE", "TOSILATE", "EDISYLATE", "ISETHIONATE", "TEOCLATE", "TEBUTATE",
  "MONOHYDRATE", "DIHYDRATE", "TRIHYDRATE", "HEMIHYDRATE", "SESQUIHYDRATE",
  "HYDRATE", "ANHYDROUS", "MONOHYDROCHLORIDE", "AXETIL", "PROXETIL",
  "DISODIUM", "TRISODIUM", "TROMETHAMINE", "TROMETAMOL", "MEGLUMINE",
  "ESYLATE", "NAPSYLATE", "POLISTIREX",
]);
const ATC_L5 = /^[A-Z]\d{2}[A-Z]{2}\d{2}$/;

function normalizeBaseName(name) {
  let s = (name ?? "").toUpperCase();
  s = s.replace(/\(.*?\)/g, " "); // drop parentheticals e.g. (WARFARIN SODIUM)
  s = s.replace(/[^A-Z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  let tokens = s.split(" ").filter(Boolean);
  // strip trailing salt/ester/hydrate tokens
  while (tokens.length > 1 && SALT_TOKENS.has(tokens[tokens.length - 1])) {
    tokens.pop();
  }
  return tokens.join(" ");
}

function atcSubstance(identifiers) {
  const ids = identifiers ?? {};
  const candidates = [];
  if (typeof ids.atc_code === "string") candidates.push(ids.atc_code);
  if (Array.isArray(ids.atc)) candidates.push(...ids.atc);
  if (typeof ids.atc === "string") candidates.push(ids.atc);
  for (const c of candidates) {
    const code = String(c).toUpperCase().trim();
    if (ATC_L5.test(code)) return code;
  }
  return null;
}

const SOURCE_PRIORITY = ["CPS", "HEALTH_CANADA_DPD", "HEALTH_CANADA_NOC", "manual_seed"];

async function loadSpineNodes() {
  const all = [];
  for (let off = 0; ; off += 1000) {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/kg_node?type=in.(ingredient,drug_class)` +
        `&select=id,type,canonical_name,source,identifiers&order=id.asc`,
      { headers: { ...H, "Range-Unit": "items", Range: `${off}-${off + 999}` } },
    );
    const page = await res.json();
    if (!Array.isArray(page)) throw new Error(JSON.stringify(page));
    all.push(...page);
    if (page.length < 1000) break;
  }
  return all;
}

function main(nodes) {
  const clusters = new Map();
  let noKey = 0;
  for (const n of nodes) {
    const atc = atcSubstance(n.identifiers);
    const base = normalizeBaseName(n.canonical_name);
    const key = atc ? `atc:${atc}` : base ? `name:${base}` : null;
    if (!key) { noKey += 1; continue; }
    const c = clusters.get(key) ?? { key, atc, members: [], baseNames: new Set(), atcSet: new Set() };
    c.members.push({ id: n.id, name: n.canonical_name, type: n.type, source: n.source, base, atc });
    c.baseNames.add(base);
    if (atc) c.atcSet.add(atc);
    clusters.set(key, c);
  }

  const dupes = [];
  let autoCount = 0, reviewCount = 0, mergeableNodes = 0;
  let mixedTyping = 0, multiSource = 0;

  for (const c of clusters.values()) {
    if (c.members.length < 2) continue;
    const sources = new Set(c.members.map((m) => m.source));
    const types = new Set(c.members.map((m) => m.type));
    const baseNames = [...c.baseNames];
    // Auto only if: ATC-keyed (single substance) AND all members share one base name.
    const atcKeyed = c.key.startsWith("atc:");
    const oneBase = baseNames.length === 1;
    const auto = atcKeyed && oneBase;
    if (auto) autoCount += 1; else reviewCount += 1;
    mergeableNodes += c.members.length - 1;
    if (types.size > 1) mixedTyping += 1;
    if (sources.size > 1) multiSource += 1;

    // canonical pick: prefer ingredient over drug_class, then source priority, then shortest base name.
    const canonical = [...c.members].sort((a, b) =>
      (a.type === "ingredient" ? 0 : 1) - (b.type === "ingredient" ? 0 : 1) ||
      SOURCE_PRIORITY.indexOf(a.source) - SOURCE_PRIORITY.indexOf(b.source) ||
      a.base.length - b.base.length
    )[0];

    dupes.push({
      key: c.key,
      atc: c.atc,
      suggestedCanonicalName: canonical.base || canonical.name,
      canonicalNodeId: canonical.id,
      decision: auto ? "auto" : "review",
      reviewReasons: [
        ...(atcKeyed ? [] : ["no_atc_substance_name_only_match"]),
        ...(oneBase ? [] : [`multiple_base_names:${baseNames.join("|")}`]),
        ...(types.size > 1 ? ["mixed_typing_ingredient_and_class"] : []),
      ],
      sources: [...sources],
      types: [...types],
      memberCount: c.members.length,
      members: c.members,
    });
  }

  dupes.sort((a, b) => b.memberCount - a.memberCount);

  const summary = {
    spineNodes: nodes.length,
    nodesWithoutKey: noKey,
    canonicalMoieties: clusters.size,
    duplicateClusters: dupes.length,
    nodesEliminableByMerge: mergeableNodes,
    autoMergeClusters: autoCount,
    reviewClusters: reviewCount,
    clustersSpanningMultipleSources: multiSource,
    clustersMixingIngredientAndClassTyping: mixedTyping,
    clusterSizeHistogram: dupes.reduce((h, d) => {
      h[d.memberCount] = (h[d.memberCount] ?? 0) + 1;
      return h;
    }, {}),
  };

  mkdirSync("out", { recursive: true });
  writeFileSync(
    "out/kg-consolidation-report.json",
    JSON.stringify({ summary, clusters: dupes }, null, 2),
  );

  console.log("=== KG ingredient/class consolidation profile (READ-ONLY) ===");
  console.log(summary);
  console.log("\nTop 15 duplicate clusters:");
  for (const d of dupes.slice(0, 15)) {
    console.log(
      `  [${d.decision}] ${d.suggestedCanonicalName} (${d.key}) ` +
        `x${d.memberCount}  sources=${d.sources.join(",")} types=${d.types.join(",")}` +
        (d.reviewReasons.length ? `  reasons=${d.reviewReasons.join(";")}` : ""),
    );
  }
  console.log("\nFull report: out/kg-consolidation-report.json");
}

const nodes = await loadSpineNodes();
main(nodes);
