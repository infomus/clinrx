// Canonical ingredient resolution for ingestion ("baking" consolidation into
// load). Ingestion historically minted ingredient node ids from a SOURCE-PREFIXED,
// only-basic-normalized key (e.g. `health-canada-dpd:ingredient:<lower(name)>`),
// so the same substance fragmented across CPS/DPD/NOC and across salt/ester forms.
//
// This module derives a SOURCE-AGNOSTIC, salt/ester-normalized canonical key, and
// — given an index of the already-consolidated ingredient nodes — resolves a name
// to the existing canonical node id (reusing it) or, for a genuinely new
// substance, a deterministic canonical-key id. Same salt/ester strip and
// mineral/ion deferral as scripts/build-interaction-merge-map.mjs, so ingestion
// stops regenerating the duplication the consolidation removed.

import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

const SALT = new Set(
  (
    "SODIUM POTASSIUM CALCIUM MAGNESIUM HYDROCHLORIDE HCL HYDROBROMIDE BROMIDE CHLORIDE SULFATE SULPHATE " +
    "MESYLATE MALEATE TARTRATE BITARTRATE CITRATE PHOSPHATE ACETATE SUCCINATE FUMARATE BESYLATE BESILATE " +
    "NITRATE OXALATE PAMOATE DECANOATE HYDRATE DIHYDRATE MONOHYDRATE ANHYDROUS DISODIUM TROMETHAMINE " +
    "MEGLUMINE HEMIFUMARATE FUROATE PROPIONATE VALERATE DIPROPIONATE ENANTHATE CYPIONATE PIVALATE CAPROATE " +
    "UNDECYLENATE UNDECANOATE PHENYLPROPIONATE ISOBUTYRATE BUTYRATE HEPTANOATE PALMITATE STEARATE XINAFOATE EMBONATE"
  ).split(" "),
);

// minerals / vitamins / inorganic-ion umbrellas: kept distinct per salt (the
// consolidation deferred these), so the canonical key keeps the full name.
const DEFERRED = new Set(
  (
    "IRON CALCIUM MAGNESIUM ZINC POTASSIUM SODIUM COPPER MANGANESE SELENIUM CHROMIUM MOLYBDENUM IODINE " +
    "FLUORIDE PHOSPHORUS BORON VANADIUM SILICON NICKEL TIN COBALT STRONTIUM INOSITOL CHOLINE BETAINE CARNITINE " +
    "TAURINE LECITHIN AMMONIUM ALUMINUM ALUMINIUM SILVER BISMUTH GOLD MERCURY ALUMINA FERRIC FERROUS CUPRIC " +
    "CUPROUS STANNOUS STANNIC FERRATE TITANIUM THIAMINE RIBOFLAVIN NIACIN NIACINAMIDE NICOTINAMIDE PYRIDOXINE " +
    "BIOTIN CYANOCOBALAMIN METHYLCOBALAMIN HYDROXOCOBALAMIN RETINOL TOCOPHEROL ERGOCALCIFEROL CHOLECALCIFEROL"
  ).split(" "),
);
for (const x of ["ASCORBIC ACID", "FOLIC ACID", "PANTOTHENIC ACID", "L LYSINE", "LYSINE", "POTASSIUM CHLORIDE"]) {
  DEFERRED.add(x);
}
function isDeferred(base: string): boolean {
  return (
    DEFERRED.has(base) ||
    base.startsWith("VITAMIN") ||
    base.startsWith("MULTIVITAMIN") ||
    base.includes("MINERAL") ||
    base.includes("AMINO ACID")
  );
}

/** Source-agnostic, salt/ester-stripped canonical key for an ingredient name. */
export function canonicalMoietyKey(name: string): string {
  // base: drop parenthetical (the salt form for real drugs) then strip salt/ester
  const base = (() => {
    const norm = (name ?? "")
      .toUpperCase()
      .replace(/\(.*?\)/g, " ")
      .replace(/[^A-Z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const tokens = norm.split(" ").filter(Boolean);
    while (tokens.length > 1 && SALT.has(tokens[tokens.length - 1]!)) tokens.pop();
    return tokens.join(" ");
  })();
  if (!isDeferred(base)) return base;
  // minerals / ion umbrellas: keep the full name (incl. parenthetical compound) so
  // distinct salts/forms stay distinct (iron sulfate vs iron gluconate), matching
  // the consolidation's mineral deferral.
  return (name ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function deterministicUuid(input: string): string {
  const hash = createHash("sha256").update(input).digest("hex");
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `5${hash.slice(13, 16)}`,
    `${((Number.parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0")}${hash.slice(18, 20)}`,
    hash.slice(20, 32),
  ].join("-");
}

/** Deterministic canonical-key node id for a brand-new substance. */
export function canonicalIngredientId(name: string): string {
  return deterministicUuid(`ingredient:${canonicalMoietyKey(name)}`);
}

/**
 * Build an index of existing consolidated ingredient nodes:
 * canonicalMoietyKey(name|synonym) -> node id. Lets ingestion reuse the node the
 * consolidation already chose instead of minting a parallel one.
 */
export async function buildIngredientIndex(
  // deno-lint / eslint: the seed clients are created with the pubmed db type;
  // this index only needs `.from(...).select(...)`, so accept a minimal client.
  client: SupabaseClient<Record<string, unknown>>,
): Promise<Map<string, string>> {
  const index = new Map<string, string>();
  const add = (name: string | null, id: string) => {
    if (!name) return;
    const key = canonicalMoietyKey(name);
    if (key && !index.has(key)) index.set(key, id);
  };

  // canonical names first (they win over synonyms on key collisions)
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client
      .from("kg_node")
      .select("id,canonical_name")
      .eq("type", "ingredient")
      .range(from, from + 999);
    if (error) throw error;
    const rows = (data ?? []) as Array<{ id: string; canonical_name: string | null }>;
    for (const r of rows) add(r.canonical_name, r.id);
    if (rows.length < 1000) break;
  }
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client
      .from("kg_node_synonym")
      .select("node_id,synonym")
      .range(from, from + 999);
    if (error) throw error;
    const rows = (data ?? []) as Array<{ node_id: string; synonym: string | null }>;
    for (const r of rows) add(r.synonym, r.node_id);
    if (rows.length < 1000) break;
  }
  return index;
}

/** Resolve an ingredient name to its canonical node id (existing or new). */
export function resolveIngredientId(index: Map<string, string>, name: string): string {
  return index.get(canonicalMoietyKey(name)) ?? canonicalIngredientId(name);
}
