# Pharmacokinetic (CYP) interaction layer

The relationship taxonomy the pharmacist defined has three axes — **therapeutic
effect / duplication**, **pharmacokinetics**, and **pharmacodynamics**. This doc
covers the **pharmacokinetic (PK) axis, CYP sub-layer**, which is the first one
built. Status as of **2026-06-23**.

The idea: instead of authoring N² drug-pair interaction edges by hand, model the
*mechanism* once per drug and **derive** the pairwise interactions. A drug is a
**substrate** of a CYP enzyme, or an **inhibitor**/**inducer** of it. Any
inhibitor/inducer of enzyme E paired with any substrate of E is a candidate PK
interaction — computed, not authored.

## Schema

- **Node type** `enzyme` (added to `kg_node.type`). Seven CYP isoenzyme nodes
  exist: CYP1A2, CYP2B6, CYP2C8, CYP2C9, CYP2C19, CYP2D6, CYP3A4 (the clinically
  dominant set; `identifiers.enzyme_family = 'CYP'`).
- **Relations** (added to `kg_edge.relation`): `metabolized_by` (ingredient →
  enzyme; the drug is a substrate), `inhibits_enzyme`, `induces_enzyme`
  (ingredient → enzyme; the drug is a modulator). `properties.strength` ∈
  `strong | moderate | weak | unspecified`.
- PK edges always attach at the **ingredient (moiety)** level so they join
  cleanly regardless of which product a monograph belonged to.

Migrations: `20260618240000_pk_enzyme_schema.sql` (type + relations),
`20260618241000_pk_interaction_derivation.sql` (the derivation view + RPC),
`20260623150000_kg_pk_strength_review.sql` (review queue + grade RPCs).

## What's built

### 1. FDA-seeded edges (published)
`scripts/seed-pk-cyp-edges.mjs` + `scripts/data/fda_pk_cyp.json` seed the curated
FDA drug-interaction substrate/inhibitor/inducer table. These are a small,
high-precision, regulatory-grade index → inserted as `source = 'FDA_DDI'`,
`review_status = 'published'`. Counts: 54 `metabolized_by`, 98 `inhibits_enzyme`,
51 `induces_enzyme`.

### 2. Monograph CYP extraction (candidate)
`scripts/extract-monograph-cyp-edges.mjs` — strict-tool-use extraction
(`claude-opus-4-8`) over the CLINICAL PHARMACOLOGY / DRUG INTERACTIONS monograph
chunks (194 drug monographs, ~722 CYP-mentioning chunks). For each it pulls
`{drug, enzyme, role, strength, quote, confidence}` triples — restricted to the 7
enzymes, every fact backed by a verbatim quote, no inference — then maps the drug
name to a canonical ingredient node (same salt-stripping normalization as the FDA
seed) and inserts cited edges:

- `source = 'CPS_MONOGRAPH' | 'HC_MONOGRAPH'`, `review_status = 'candidate'`
  (LLM-extracted → needs pharmacist review).
- `citations = [chunk ids]`, `properties = { strength, quote }`,
  `extraction_confidence`.
- Idempotent (skips existing monograph triples); reversible
  (`delete from kg_edge where source in ('CPS_MONOGRAPH','HC_MONOGRAPH')`).

First run (2026-06-23) inserted **420 edges** (804 relations extracted, 302
in-run dupes, 82 unmapped class/metabolite/non-formulary names dropped, 0
errors). It captures both subject-drug metabolism *and* the interacting drugs
named in monographs (ketoconazole, clarithromycin, ritonavir as CYP3A4
inhibitors; codeine → CYP2D6 …) — the modulator side the small FDA index missed.

Coverage lift:

| relation | FDA-only | + monograph | total |
|---|---|---|---|
| metabolized_by (substrates) | 54 | +249 | 303 (5.6×) |
| inhibits_enzyme | 98 | +122 | 220 |
| induces_enzyme | 51 | +49 | 100 |

### 3. Derivation view — `kg_pk_interaction`
Live view (no materialized edges): joins each modulator edge to every
`metabolized_by` edge on the same enzyme (excluding self), yielding mechanism
(inhibition/induction), effect (substrate exposure ↑/↓), and a **draft** severity.
Read only through the SECURITY DEFINER RPC `kg_explorer_pk_interactions`.

Derived PK interactions: **2,663 (FDA-only) → 17,510 (with monograph), 6.6×.**
Spot-checked: clarithromycin (CYP3A4 inhibitor) → raises simvastatin exposure.

> ⚠️ The view currently has **no `review_status` filter**, so unreviewed
> candidate edges flow into the derivation. That is correct for the explorer
> (the review surface), but **before this feeds the runtime checker or is
> materialized as `interacts_with` edges, gate the view on
> `review_status = 'published'`.**

### 4. Strength-review surface (explorer)
Most monograph modulator edges carry `strength = 'unspecified'` (the text didn't
quantify), which the draft mapping collapses to `minor`. A modulator edge fans
out to every substrate of its enzyme, so grading the **127** unspecified
modulator edges sets the severity of **~8,900** derived interactions (avg ~70
each) — the highest-leverage manual review available.

- RPCs (`20260623150000`): `kg_explorer_pk_strength_queue` (highest fan-out
  first, with quote + confidence + substrate count) and
  `kg_explorer_grade_pk_edge` (grade `strong|moderate|weak` → publish / reject /
  reset — the explorer's first **write** RPC, guarded to monograph PK edges).
- API: `getPkStrengthQueue` / `gradePkStrengthEdge` in `packages/api/src/kgExplorer.ts`.
- UI: "PK strength review — grade CYP modulators" card in
  `apps/mobile/app/review/kg.tsx` (`clinrx.ca/review/kg`).
- The review queue covers `CPS_MONOGRAPH` / `HC_MONOGRAPH` / `PUBMED` candidate
  modulator edges (migration `20260623170000`); `FDA_DDI` stays out (curated).

### 5. PubMed CYP extraction (candidate) — emerging-drug gap
`scripts/extract-pubmed-cyp-edges.mjs` fills the gap for drugs whose CYP roles
are documented in the literature but not in any ingested monograph (e.g.
cariprazine, cobicistat, the PARP inhibitors, modern azoles/oncology TKIs).
Candidates come from `pubmed_cyp_extraction_candidate` (migration
`20260623160000`): articles whose `pubmed_evidence_chunk` text mentions a CYP
isoenzyme AND that are linked to an ingredient node with **no existing CYP edge**.
Scope (2026-06-23): **3,371 candidate articles** across **2,809 gap nodes**.

The article (pmid) is the unit of extraction; the same strict tool + drug→
ingredient mapping as the monograph pass is used, so it captures both the subject
drug and interacting drugs named in the article. Edges: `source = 'PUBMED'`,
`review_status = 'candidate'`, `citations = [pmid]`, `properties = { strength,
quote, pmid }`. De-duped against **all** existing CYP edges (any source) so it
only adds genuinely new triples.

Full run (2026-06-24): 3,371 articles, 12,994 relations, **1,645 new edges**
(849 `metabolized_by` + 595 `inhibits_enzyme` + 201 `induces_enzyme`), 7,184
dupes, 4,165 unmapped (classes / metabolites / herbals / experimental
compounds), 0 errors, $108.55. Effect: ingredient CYP coverage **272 → 744
drugs**; derived PK interactions **17,510 → 243,387** (the combinatorial growth
from the new modulator × shared-enzyme-substrate pairs — most are minor/
unspecified, which is why review + severity gating matter). PubMed is noisier
than monographs (in-vitro findings, salt/excipient name artifacts), so the
strength-review queue's **reject** control matters here; the queue is now ~555
unspecified modulator edges (was 127).

## Severity mapping (draft — pharmacist to confirm)

The derivation stamps severity from the **modulator strength alone**:

| modulator strength | → severity |
|---|---|
| strong | major |
| moderate | moderate |
| weak / unspecified | minor |

This is a first pass. It ignores: (2) how dependent the substrate is on that
enzyme (fraction-metabolized / FDA "sensitive substrate" — present in the data
but unused), (3) the substrate's therapeutic index, (4) inhibition vs induction
asymmetry. The substrate-sensitivity signal exists (`metabolized_by` strength: 54
FDA `sensitive`) but the formula does not read it yet.

Open questions for the pharmacist (see also `PHARMACIST_REVIEW_HANDOFF.md`):

1. Severity from modulator strength alone for v1, or combine with substrate
   sensitivity?
2. Should strong inhibitor × sensitive substrate escalate to `contraindicated`?
3. Default for `unspecified` strength — `minor` (current) or, more
   conservatively, `moderate`/`unknown` so "magnitude unknown" never reads as
   "low risk"?
4. Score induction on the same scale as inhibition?
5. Use `unknown` (review/monitor) rather than silently `minor` when magnitude is
   indeterminable?

## Roadmap

1. **Pharmacist grades the 127 unspecified modulator edges** (the review surface,
   highest fan-out first) and **confirms the severity-mapping rule**. Grading
   flips those edges `candidate → published`.
2. **Gate `kg_pk_interaction` on `review_status = 'published'`** before any
   runtime-facing use.
3. **Grade substrate sensitivity by exception** (narrow-therapeutic-index drugs
   first) if the mapping incorporates the substrate axis.
4. **Materialize** the confirmed derived PK interactions as `interacts_with`
   edges at the moiety level (with mechanism/severity/citations) so the runtime
   checker and Smart Search consume them like any other edge.
5. **PubMed CYP extraction** for emerging drugs with no monograph CYP text —
   done (see "What's built" §5); its candidate edges flow into the same review
   queue and derivation view.
6. **Surface PK interactions in the explorer node drawer** (a panel backed by
   `kg_explorer_pk_interactions`).
7. **Extend the PK axis** beyond CYP: transporters (P-gp/BCRP), UGT — new
   `enzyme`/transporter nodes + the same substrate/inhibitor/inducer relations.
8. **Other taxonomy axes**: pharmacodynamics (receptor agonist/antagonist,
   additive/opposing effects) and therapeutic-effect/duplication. ATC
   class-level interactions ride on the consolidated spine
   (see `KG_CONSOLIDATION_PLAN.md`).

## Reproduce

```sh
set -a; source .env; set +a
SUPABASE_URL=$EXPO_PUBLIC_SUPABASE_URL node scripts/seed-pk-cyp-edges.mjs
# strict LLM extraction (needs ANTHROPIC_API_KEY); --dry-run / --limit N / --verbose supported
SUPABASE_URL=$EXPO_PUBLIC_SUPABASE_URL node scripts/extract-monograph-cyp-edges.mjs --concurrency 5
# PubMed gap fill (reads pubmed_cyp_extraction_candidate; migration 20260623160000 builds it)
SUPABASE_URL=$EXPO_PUBLIC_SUPABASE_URL node scripts/extract-pubmed-cyp-edges.mjs --concurrency 5
```
