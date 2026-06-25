# Knowledge Graph consolidation plan

> **Related:** this doc covers consolidating the **node spine** (deduplicating
> ingredients/classes across sources). The **relationship/interaction layer** that
> rides on that spine is tracked separately in **`PK_INTERACTION_LAYER.md`** — the
> pharmacokinetic (CYP) axis is already being built (mechanism edges + derived
> interactions) at the ingredient/moiety level the consolidation produces.

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
1. **Identity key (resolved 2026-06-24): salt-stripped base-name is PRIMARY; ATC-5 is a guardrail/validator, not the key.** We propagated ATC-5 from single-ingredient products onto ingredients (migration `20260624130000`), lifting ingredient ATC coverage 42% → 59% (+1,586). But the data shows ATC **cannot** drive cross-source dedup: ~97% of duplicate moiety clusters involve **NOC**, and **NOC products carry zero ATC**. Of the 2,186 duplicate clusters: 709 have no ATC on any member, 1,426 have ATC on only one member (can't cross-check), 27 have ≥2 members agreeing (deterministic merge), 24 have an ATC **conflict** (ATC catches a bad name-merge). So: merge by base-name, **block** merges where two members carry conflicting ATC-5, prefer-confirm where they agree, and keep ATC purely as a guardrail. (The +17pp moiety ATC coverage still directly benefits the ATC class-rollup layer.)
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

## Progress
- **2026-06-18** — Phase 2 (matched-crosswalk small clusters) merged (migration `20260618232000`).
- **2026-06-24** — **Interaction-bearing consolidation** (the prioritized high-value spine): merged the duplicate clusters of every ingredient that carries an interaction/PK edge, PubMed candidate, or calibration eval (`scripts/build-interaction-merge-map.mjs` → migration `20260624140000`). 678 clusters → **1,244 losers absorbed** (incl. 793 non-leaf NOC ingredient nodes — the "later" handling for those). Ingredient nodes 9,274 → 8,030. **PK-substance fragmentation 88% → 2%** (the retrieval-miss risk for interaction drugs is essentially eliminated). Minerals/vitamins deferred, combination members excluded, ATC-conflict clusters skipped for review.
- **2026-06-25** — Finished the clean spine (Steps 1–3):
  - **Step 1 — clean long tail** (`build-interaction-merge-map.mjs SCOPE=all` → `20260624150000`): merged the remaining clean single-substance duplicate clusters (1,300 clusters → 1,799 losers). Tightened guards: inorganic/ion umbrellas (iron/ferric/ammonium…) and nutritionals/vitamins deferred; a member merges only if its parenthetical names the **same** substance (a salt form), not a different one (combination). Ingredient nodes 8,030 → 6,231.
  - **Step 2 — ingredient/class double-typing** (`20260624160000`): 439 DPD `drug_class` nodes were ATC-5 (substance) "pseudo-classes"; merged each into its ingredient (re-homing + `atc_code → atc`). drug_class 1,369 → 930. Eliminates the "no substance double-typed as both ingredient and class" violation.
  - **Step 3 — class aliases** (`20260624170000`): of 38 exact-name class clusters only 1 was a true alias dup (CLINRX + CPS "SSRIs"); merged. The other 37 are legitimate multi-ATC substances or generic "COMBINATIONS" labels — left alone.
  - **Verified re-homing preserves everything**: products re-link to canonical via `has_ingredient` (escitalopram = 1 node, 112 products), loser names kept as synonyms, PubMed article links re-pointed (erlotinib canonical = 60), monograph chunks untouched (they live on products, not ingredients).
  - **Ingredient ATC coverage 42% → 83%**. Remaining deferred: minerals/vitamins, combination-as-ingredient nodes, ATC-conflict clusters, and the multi-ATC/ester substance pseudo-classes (esters like furoate/propionate not yet in the salt list).
- **Open (Lexicomp-informed) workstreams**: monograph substance-level chunk dedup with divergence preservation (98%-similar product monographs); curated functional class membership + PD risk-tier categories (e.g. QT-prolongation Moderate / Indeterminate-Avoid), the "interacting members" class-interaction model; bake canonical-resolution into ingestion so duplication stops regenerating.

## Acceptance criteria
- One canonical ingredient node per moiety; no interaction edges on products.
- Chunks / PubMed links / candidates all resolve to canonical nodes (zero orphans).
- Search returns the moiety with products grouped; crosswalk records every merge.
- Runtime resolution maps user input → canonical moiety deterministically.
