# Knowledge Graph consolidation plan

## Why
The KG fragments the same real-world drug into many nodes across sources and
granularities, and they are not reconciled. Measured state (2026-06-18):

- **168k nodes** = 155k `drug` (products: DPD 65k + NOC 79k) · 11.4k `ingredient` · 1.4k `drug_class` · 210 condition.
- **263k edges** = 234k `has_ingredient` + 28k `subclass_of` + **1 `interacts_with`** (the interaction layer is essentially empty).
- The interaction-bearing spine (`ingredient` + `drug_class`, ~12.8k nodes) collapses to only **~5.8k real moieties**: **~2.5k moieties are duplicated, ~6.9k spine nodes (~54%) are redundant**, almost entirely **cross-source triplication** (CPS + DPD + NOC each minted their own node — e.g. warfarin = 3 `WARFARIN SODIUM` ingredient nodes + 1 `WARFARIN` ATC class node + ~18 product nodes, crosswalk empty).

**Sequencing:** because `interacts_with` is unpopulated and the 907
`pubmed_interaction_candidate` rows have not yet been promoted to edges,
consolidating **now** is low-risk and prevents bolting the interaction layer onto
a fragmented spine.

## End state (target model)
A canonical **ingredient/moiety spine**:
- Exactly **one canonical `ingredient` node per active moiety**, identity unified across sources. Interactions attach here (and class-level interactions on the ATC class).
- **Products / brands / NOC approvals stay as their own `drug` nodes** but hang off the moiety via `has_ingredient`; they carry route/form/DIN/strength (needed for the route-sensitivity work) and **never** carry interaction edges.
- Consistent typing: substance = `ingredient`, ATC group = `drug_class`, product = `drug`. No substance double-typed as both ingredient and class.
- **Salts/forms collapse to the base moiety** (WARFARIN SODIUM → WARFARIN); salt kept as an attribute.
- Every merge recorded in `kg_source_crosswalk` (auditable, reversible) with full source provenance. Search returns the canonical moiety with products grouped under it.

## Policy (confirmed)
1. **Identity key:** ATC substance (level-5) first, normalized base-moiety name as fallback/validator. **Open wrinkle:** ingredient nodes carry no usable ATC (it lives on products), so the key must be derived — *decision pending* between (a) propagate ATC from linked products + name (hybrid), (b) name-only on standardized generic names, (c) external reference (RxNorm IN).
2. **Salts/esters/hydrates → collapse to base moiety. Combinations → map to multiple moieties, never collapse to one.**
3. **Conservative:** auto-merge only deterministic high-confidence clusters; everything ambiguous → pharmacist queue. **Never merge across different substances. Under-merge beats over-merge.**
4. **Minerals / vitamins / electrolytes** (CALCIUM ×131, MAGNESIUM ×83, …) handled as a **separate, deferred track** — ambiguous, ATC-less, mostly nutritional.

## Re-homing (critical — what must follow every merge)
When N source nodes merge into one canonical node, every reference must be
re-pointed to the canonical id and de-duplicated, or evidence is orphaned:

1. **`kg_edge`** — re-point `source_id` / `target_id`; dedupe by (source, target, relation), merging `properties` / `citations`, keeping highest `review_status` / `extraction_confidence`.
2. **`kg_chunk.node_id`** — the monograph chunks (CPS / Health Canada / NOC) attached to the merged nodes.
3. **`pubmed_article_kg_node.node_id`** — the article↔node links (so PubMed evidence still resolves to the canonical moiety).
4. **`pubmed_interaction_candidate`** endpoints — the 907 candidate interactions, re-pointed before promotion.
5. **`kg_source_crosswalk`** — collapse rows that referenced the merged nodes; write a new row recording the merge (status, confidence, provenance).
6. **`kg_node_synonym`** + identifiers — union all names/DINs/cps_id/ATC onto the canonical node as synonyms / provenance arrays.

Everything is provenance-preserving and reversible (the crosswalk records the merge).

## Phases
- **0 — Freeze + snapshot.** Pharmacist review paused; back up `kg_node` / `kg_edge` / `kg_source_crosswalk` / `kg_chunk` links; finalize the key-derivation decision.
- **1 — Profiling dry-run (read-only).** Cluster the spine by canonical key; quantify duplicates, typing inconsistencies, salt collapses, combinations; emit a proposed merge map. *(Started: `scripts/kg-consolidation-profile.mjs` + the explorer's duplication overview.)* Review with a pharmacist.
- **2 — Deterministic auto-merge** of the safe subset, with full re-homing (above), idempotent, verifying edge/chunk conservation.
- **3 — Ambiguous queue** surfaced in the KG explorer for human merge/split adjudication.
- **4 — Bake normalization into ingestion** so new DPD/CPS/NOC rows attach to canonical nodes at load; promote the 907 PubMed candidates to `interacts_with` **at the moiety level** only after the spine is clean.
- **5 — Re-point runtime resolution** to the canonical moiety; re-validate on the interaction calibration set.

## Acceptance criteria
- One canonical ingredient node per moiety; no interaction edges on products.
- Chunks / PubMed links / candidates all resolve to canonical nodes (zero orphans).
- Search returns the moiety with products grouped; crosswalk records every merge.
- Runtime resolution maps user input → canonical moiety deterministically.
