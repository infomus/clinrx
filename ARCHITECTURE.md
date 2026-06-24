# ClinRx — Architecture & Scaffold Specification

> **Purpose of this document.** This is a build specification for a coding agent. It defines the
> stack, the monorepo layout, the data model (a medical **knowledge graph**, not flat vector RAG),
> the per-feature architecture, and a **phased build order**. Follow the phases in sequence.
> Where a decision has a tradeoff, the rationale and a migration trigger are stated inline so they
> are not silently reversed.

---

## 0. Product summary

ClinRx is a multi-platform pharmacy **study** app (web, installable PWA, Android, iOS) for student
pharmacists. **Market scope: Canada-first** — built for Canadian pharmacy students, with the
**CPS** (Compendium of Pharmaceuticals and Specialties, via the CPhA CaaS API) as the authoritative
monograph source under an **exclusive partnership**. **DIN** (Drug Identification Number) is the
primary national drug identifier; US identifiers (RxCUI/NDC) are out of scope for v1. Five features,
in **build priority order**:

1. **Interaction Checker** (built first) — drug–drug / drug–class interaction lookup over our own
   monograph-first, PubMed-supported evidence base (DrugBank deferred on cost, merged later).
   _Safety-critical. The first production tier is deterministic lookup over human-reviewed, published
   edges (§3.5). The current research/calibration tier also evaluates RuntimeAI answers over
   already-indexed evidence for missing/uncertain deterministic answers. RuntimeAI must be
   evidence-traced, cached, versioned, and pharmacist-calibrated before it can replace manual
   publishing for any production path._
2. **Smart Search** — knowledge-graph-augmented retrieval over the CPS dataset.
3. **Quizzing + notifications** — intermittent push quizzes, spaced repetition, anonymous leaderboard.
4. **OSCE voice simulations** — live spoken patient/examiner roleplay via ElevenLabs Conversational AI,
   scored against a rubric.
5. **Interactive audio lessons** — adaptive spoken lessons via ElevenLabs Conversational AI.

### Core principles (do not violate)

- **Logic is platform-agnostic.** Anything that is not rendering lives in `packages/`, never in an app.
  The eventual Next.js web app must be able to import all business logic unchanged.
- **The knowledge graph and indexed evidence are the source of truth for medical facts.** Generation is
  grounded in retrieved subgraphs + cited source text. Models do not free-recall drug facts.
- **The Interaction Checker is regulated-adjacent.** Production defaults must remain conservative:
  deterministic published-KG lookup first, explicit "educational use" disclaimer, and evidence-traced
  RuntimeAI only where calibration metrics justify it.

---

## 1. Locked technical decisions

| Concern                      | Decision                                                                      | Notes                                                             |
| ---------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Package manager              | **pnpm** (workspaces)                                                         |                                                                   |
| Monorepo orchestration       | **Turborepo**                                                                 |                                                                   |
| Language                     | **TypeScript**, `strict: true` everywhere                                     |                                                                   |
| Mobile + web-app surface     | **Expo** (React Native + React Native Web)                                    | One codebase serves Android, iOS, web, PWA today                  |
| Public/marketing web (later) | **Next.js** in `apps/web`                                                     | Added at the SEO trigger (§11). Not built in v1                   |
| Navigation                   | **Expo Router** (file-based)                                                  |                                                                   |
| Styling                      | **NativeWind**                                                                | Tailwind mental model carries to the future Next.js app           |
| Server state                 | **TanStack Query**                                                            |                                                                   |
| Local/UI state               | **Zustand**                                                                   |                                                                   |
| Validation                   | **Zod** (shared package, single source of truth)                              |                                                                   |
| Backend platform             | **Supabase Cloud** (brand-new project)                                        | Postgres + Auth + Storage + Realtime + Edge Functions             |
| Knowledge graph store        | **Postgres** (node/edge tables + recursive CTEs)                              | See §3. Neo4j is the documented escape hatch                      |
| Vector index                 | **pgvector**                                                                  | Embedding dim **1024**, see §1.1                                  |
| LLM                          | **Anthropic Claude Opus 4.8**                                                 | RAG generation + OSCE rubric scoring                              |
| Embeddings                   | **Voyage `voyage-3-large` @ 1024-dim**                                        | §1.1 — dimension is locked into schema                            |
| Reranker                     | **Cohere Rerank candidate**                                                   | Evaluate as a second-stage chunk selector if calibration shows the right evidence exists but wrong chunks are selected |
| Realtime voice + TTS         | **ElevenLabs Conversational AI**                                              | v1 provider for OSCE voice and interactive audio lessons          |
| Voice provider escape hatch  | Provider adapter in `packages/core/voice`                                     | Add Vapi later only if telephony/provider orchestration is needed |
| Offline                      | **PowerSync**                                                                 | §8 — MMKV fallback noted for v1                                   |
| Mobile builds                | **EAS**                                                                       |                                                                   |
| CI                           | **GitHub Actions**                                                            |                                                                   |
| Tests                        | **Vitest** (packages), **React Native Testing Library** (app), Detox deferred |                                                                   |

### 1.1 Embedding dimension is a hard commitment

The pgvector column is declared `vector(1024)`. `voyage-3-large` supports configurable output
dimensions (256 / 512 / 1024 / 2048); **1024** is the default here. Changing the model or dimension
later requires re-embedding all nodes/chunks and a column migration. Confirm the current Voyage model
version at build time and pin it as a constant in `packages/core/kg/embeddings.ts`.
Alternative if you change your mind: OpenAI `text-embedding-3-large` (set dim explicitly).

---

## 2. Monorepo layout

```
clinrx/
├─ apps/
│  └─ mobile/                  # Expo app — Android, iOS, web, PWA (the student app, all targets today)
│     ├─ app/                  # Expo Router routes
│     ├─ components/           # app-specific UI (NOT shared yet — see §10)
│     ├─ app.config.ts         # slug, bundle id, plugins
│     └─ package.json
│  # apps/web/  ← Next.js, added LATER at the SEO trigger (§11). Do not create in v1.
│
├─ packages/
│  ├─ types/                   # shared TS types (generated from Postgres + hand-written domain types)
│  ├─ validation/              # Zod schemas — one source of truth for both apps
│  ├─ api/                     # Supabase client factory + typed data-access functions (no UI)
│  ├─ core/                    # platform-agnostic business logic (the heart of the system)
│  │  ├─ interactions/         # FEATURE 1 — deterministic interaction checker
│  │  ├─ kg/                   # knowledge graph: retrieval, traversal, embeddings, entity-linking
│  │  ├─ search/               # GraphRAG orchestration (entity-link → expand → rerank → generate)
│  │  ├─ quiz/                 # FSRS scheduler + scoring + leaderboard logic
│  │  ├─ voice/                # voice-provider interface + session events
│  │  ├─ osce/                 # OSCE session orchestration glue + rubric scoring
│  │  └─ lessons/              # interactive lesson state orchestration
│  └─ config/                  # shared tsconfig, eslint, prettier, tailwind preset
│
├─ supabase/
│  ├─ migrations/              # SQL migrations (KG schema lives here)
│  ├─ functions/               # Edge Functions (ElevenLabs tools/webhooks, embedding jobs, push scheduler)
│  └─ seed/                    # ingestion scripts (CPS, Health Canada, Ontario ODB, ATC, PubMed) — see §3.4
│
├─ .github/workflows/          # CI
├─ turbo.json
├─ pnpm-workspace.yaml
├─ package.json
└─ ARCHITECTURE.md             # this file
```

**Dependency rule:** `apps/mobile` may import any `packages/*`. `packages/*` may import each other in
the order `types → validation → api → core` (no cycles). `core` must not import from any app and must
not contain React or React Native imports.

---

## 3. Knowledge graph data model (the core)

The medical domain is a graph of typed entities and typed relationships. We model it relationally in
Postgres so it stays inside the single Supabase backbone. Graph traversal uses **recursive CTEs**;
semantic entry uses **pgvector**; name resolution uses **full-text + trigram** on synonyms.

### 3.1 Node and edge types

**Node types** (`kg_node.type`):
`drug` (a marketed product / monograph subject), `ingredient` (active moiety),
`drug_class` (ATC / pharmacologic class node — these form the hierarchy),
`condition` (indication / disease), `symptom`, `adverse_effect`, `population`
(e.g. pregnancy, renal impairment — used for contraindications), `enzyme`
(metabolic enzymes — the 7 major CYP isoenzymes so far; the substrate of the
pharmacokinetic interaction layer, see §3.7).

Interaction edges should normally live at the **ingredient** or **drug_class** level, not on every
marketed product. Example: `AG-CLOPIDOGREL`, `APO-CLOPIDOGREL`, and `AURO-CLOPIDOGREL` are product
nodes; the interaction edge should usually be published against `Clopidogrel` as an ingredient/generic
node so all clopidogrel products inherit it. Publish directly to a product node only when the evidence
is genuinely product-specific.

**Edge types** (`kg_edge.relation`):

- `treats` — drug/ingredient → condition
- `interacts_with` — drug/ingredient/class ↔ drug/ingredient/class (carries severity, mechanism, mgmt, **evidence provenance**, and **review status** — see §3.5)
- `subclass_of` — drug_class → drug_class, and drug → drug_class (the ATC hierarchy)
- `has_ingredient` — drug → ingredient
- `contraindicated_in` — drug/ingredient → condition/population
- `causes` — drug/ingredient → adverse_effect
- `comorbid_with` — condition ↔ condition
- `metabolized_by` — ingredient → enzyme (the drug is a CYP substrate) — §3.7
- `inhibits_enzyme` / `induces_enzyme` — ingredient → enzyme (the drug is a CYP modulator; `properties.strength`) — §3.7

> **Interactions can be class-level.** Many interactions are defined on a class, not a single product.
> The checker therefore resolves each input drug up its `subclass_of` chain and checks
> `interacts_with` edges at every level (drug, ingredient, class). This is why the graph model is the
> right substrate for Feature 1.

> **Resolver rule:** PubMed candidates should auto-resolve to the most general clinically correct node:
> ingredient first, class when the evidence is class-wide, product only when the source specifically
> supports a product/manufacturer-specific interaction. The pharmacist reviewer can override resolution,
> but the default should not create duplicate product-level interaction edges.

### 3.2 Schema (SQL — first migration)

```sql
create extension if not exists vector;
create extension if not exists pg_trgm;

create type kg_node_type as enum (
  'drug','ingredient','drug_class','condition','symptom','adverse_effect','population'
);
create type kg_relation as enum (
  'treats','interacts_with','subclass_of','has_ingredient',
  'contraindicated_in','causes','comorbid_with'
);
create type interaction_severity as enum ('contraindicated','major','moderate','minor','unknown');
-- edges extracted from literature are CANDIDATES until a qualified human publishes them (§3.5)
create type edge_review_status as enum ('candidate','under_review','published','rejected');

create table kg_node (
  id            uuid primary key default gen_random_uuid(),
  type          kg_node_type not null,
  canonical_name text not null,
  -- external identifiers: { din:[], atc:[], rxcui:[], drugbank_id:[], snomed:[] }
  identifiers   jsonb not null default '{}'::jsonb,
  summary       text,                       -- short node description (also embedded)
  embedding     vector(1024),               -- voyage-3-large @ 1024; see §1.1
  source        text not null,              -- 'CPS' | 'ATC' | 'PubMed' | 'DrugBank'(later) | ...
  created_at    timestamptz not null default now()
);

create table kg_node_synonym (
  node_id uuid not null references kg_node(id) on delete cascade,
  synonym text not null,
  source  text not null,
  primary key (node_id, synonym)
);

create table kg_edge (
  id          uuid primary key default gen_random_uuid(),
  source_id   uuid not null references kg_node(id) on delete cascade,
  target_id   uuid not null references kg_node(id) on delete cascade,
  relation    kg_relation not null,
  -- relation-specific payload, e.g. for interacts_with:
  -- { severity, mechanism, management, evidence_level, onset }
  properties  jsonb not null default '{}'::jsonb,
  severity    interaction_severity,         -- denormalized for fast interaction filtering
  -- EVIDENCE PROVENANCE (critical for the monograph-first, PubMed-supported interaction DB, §3.5):
  citations   jsonb not null default '[]'::jsonb,  -- [{ pmid, title, year, quote }]
  evidence_level text,                       -- e.g. 'case_report'|'cohort'|'rct'|'review'|'label'
  extraction_confidence real,                -- 0..1 from the extraction pipeline (null if hand-curated)
  review_status edge_review_status not null default 'candidate',
  reviewed_by  uuid references auth.users(id),
  reviewed_at  timestamptz,
  source      text not null,                 -- 'PubMed' | 'CPS' | 'DrugBank'(later) | 'manual'
  created_at  timestamptz not null default now()
);

-- monograph / reference text attached to nodes, chunked for retrieval
create table kg_chunk (
  id         uuid primary key default gen_random_uuid(),
  node_id    uuid not null references kg_node(id) on delete cascade,
  content    text not null,
  section    text,                          -- e.g. 'Dosing', 'Adverse Effects'
  embedding  vector(1024),
  fts        tsvector generated always as (to_tsvector('english', content)) stored,
  source     text not null
);

-- indexes
create index on kg_node using hnsw (embedding vector_cosine_ops);
create index on kg_chunk using hnsw (embedding vector_cosine_ops);
create index on kg_chunk using gin (fts);
create index on kg_node_synonym using gin (synonym gin_trgm_ops);
create index on kg_edge (relation, severity);
create index on kg_edge (source_id, relation);
create index on kg_edge (target_id, relation);
create index on kg_edge (relation, review_status);  -- checker queries filter to 'published' only
```

### 3.3 Two canonical graph queries

**(a) Resolve a drug to all its class ancestors** (recursive CTE over `subclass_of`):

```sql
with recursive ancestors as (
  select source_id as node_id, target_id as parent_id
  from kg_edge where relation = 'subclass_of' and source_id = $1
  union all
  select e.source_id, e.target_id
  from kg_edge e
  join ancestors a on e.source_id = a.parent_id
  where e.relation = 'subclass_of'
)
select distinct parent_id from ancestors;
```

**(b) Find interactions for a set of drugs, including class-level matches.** Expand each input drug to
`{itself} ∪ {ingredients} ∪ {class ancestors}`, then look for `interacts_with` edges between any two
expanded sets belonging to different input drugs. Implement in `packages/core/interactions/` as a
typed function; keep the SQL in a Postgres function or a parameterized query, never assembled by an LLM.

### 3.4 Ingestion (`supabase/seed/`)

Idempotent scripts, runnable per-source, each producing `kg_node` / `kg_node_synonym` / `kg_edge` /
`kg_chunk` rows and then an embedding pass:

- ATC ingest — builds the `drug_class` hierarchy via `subclass_of` edges.
- `src/cps/ingest-cli.ts` — **the authoritative Canadian monograph and CPS guidance source** (CPS via the CPhA CaaS API; license-gated, see §3.6). Monograph subjects and DPD product listings → `drug` nodes; DPD generic names → `ingredient` nodes linked by `has_ingredient`; Therapeutic Choices and Minor Ailments topics → `condition` nodes; monograph, product listing, and condition-guidance sections → server-only `kg_chunk`; indications → `treats`; AEs → `causes`; contraindications → `contraindicated_in`. Stamp every node/chunk with the CPS revision/source content type it came from.
- Health Canada source-specific jobs under `src/health-canada/` — ingest DPD, NOC/NOCc, Summary Reports, and product monograph context into the same product/ingredient/class graph contract used for CPS.
- `src/ontario/odb-ingest-cli.ts` — ingests Ontario Drug Benefit Formulary/CDI XML as formulary/reimbursement context under source `ONTARIO_ODB_FORMULARY`, linking products to normalized ingredients/classes. This source supplements product/formulary context and must not override CPS or Health Canada clinical facts.
- PubMed jobs under `src/pubmed/` — the literature support layer for the monograph-first interaction workflow (DrugBank is deferred on cost, added later as a higher-precision merge). Adds real-world examples, outcome detail, PK/PD magnitude, and limitations to interaction candidates; see §3.5 for the pipeline. Produces `interacts_with` edges as `review_status = 'candidate'` with PMID citations, evidence level, and extraction confidence. **Candidates are never served by the checker until published.**
- Embedding jobs — backfill `kg_node.embedding` and `kg_chunk.embedding` via Voyage. Batched, resumable.

### 3.5 PubMed interaction-extraction pipeline (`supabase/seed/pubmed/`)

We bootstrap our own interaction database from literature instead of licensing DrugBank initially. This
is an extraction problem, not a load — design for it explicitly:

**Clinical workflow correction:** interaction evidence is monograph-first, with PubMed used as
supporting real-world evidence. For a candidate pair, resolve both sides to active ingredients first,
then retrieve all related CPS and Health Canada monographs by generic and brand/product names. The AI
and reviewer should inspect each monograph's `Drug Interactions` section for enzymes, transporters,
receptors, inducer/inhibitor/substrate/agonist/antagonist roles, examples, interacting classes,
monitoring language, and management recommendations. PubMed evidence should then demonstrate how those
interactions appear in clinical literature, supply case/outcome/PK/PD detail, or expose limitations and
contradictions. Do not let PubMed-only extraction bypass current monograph context.

1. **Harvest** — query the NCBI E-utilities API (esearch/efetch) for interaction-relevant literature;
   pull abstracts (and PMC open-access full text where available). Respect NCBI rate limits and the
   PMC license tier per article (only redistribute/quote what the license permits — store PMIDs and
   short evidence quotes, link out for the rest).
2. **Extract** — Claude reads each source and proposes candidate `interacts_with` edges with subject/
   object drugs (resolved to `kg_node`s via entity linking), severity, mechanism, management, evidence
   level, and a confidence score. Output is structured and validated against a Zod schema.
3. **Stage as candidates** — write edges with `review_status = 'candidate'` and full `citations`.
   Nothing here is authoritative yet.
4. **Human review gate** — a qualified reviewer (pharmacist) promotes `candidate → published` (or
   `rejected`). Only `published` edges are visible to the Interaction Checker. The pipeline may be
   fully automated; the _publish_ step must not be.

> **The dominant risk is false negatives.** A self-built corpus has coverage gaps; a missing edge makes
> the checker say "no interaction found," which a user reads as "safe." Mitigations are mandatory, not
> optional: (a) the checker filters to `review_status = 'published'` and **never** renders a bare
> "safe" — it says "no known interaction _in the current evidence base_"; (b) every served interaction
> shows its PMID citations and evidence level; (c) coverage limits are stated in-product alongside the
> educational-use disclaimer. DrugBank, when added later, merges in as an additional high-precision
> source that raises coverage — it does not change this schema or the checker logic.

### 3.6 Sourcing, provenance & sync strategy

**We ingest into our own database; we never call source APIs at runtime.** GraphRAG requires data
resident in Postgres (chunking, embedding, graph edges, recursive-CTE traversal, vector/FTS search);
a remote API at call time cannot satisfy this, and offline study forbids a runtime dependency. Source
APIs (CPS/CaaS, NCBI) are **build-time / sync-time** inputs only.

**Source authority** (who is canonical for what):

| Source                                         | Authoritative for                                                                                                              | Notes                                                                                                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **CPS** (CPhA CaaS API)                        | Primary licensed Canadian `drug` nodes, DPD product listings, monograph text (`kg_chunk`), Therapeutic Choices / Minor Ailments condition guidance, indications, AEs, contraindications | Exclusive partnership; license must permit a persistent **derived** store + AI-derived artifacts + define retention/deletion on termination (§3.6 licensing) |
| **Health Canada DPD full extract/API**         | DINs, product status, companies, active ingredients, forms, routes, schedules, biosimilar flags                                | Implemented to validate/enrich CPS/CaaS DPD nodes and to create coherent Health Canada-sourced graph nodes for Canadian products absent from CPS              |
| **Health Canada product monographs/register**  | Product-specific monographs, patient medication information, safety-label updates                                              | Implemented for cross-checking CPS sections and surfacing current Canadian product-specific safety context                                                    |
| **Ontario Drug Benefit Formulary/CDI**         | Ontario formulary/reimbursement listing context, benefit/category fields, interchangeability, pricing/effective-date fields    | Importer implemented but deferred for now; not a blocker for interaction-evidence work                                                                        |
| **MedEffect / recalls / safety alerts**        | Current recalls, advisories, completed safety reviews, safety-label change signals                                             | Add ASAP as a time-sensitive safety layer; never treat old PubMed evidence as current if a newer safety alert supersedes it                                  |
| **Notice of Compliance / NOC with Conditions** | Approval status, NOC date, conditions, submission class, manufacturer, therapeutic class                                       | Implemented for provenance, conditional approval context, and current-in-Canada metadata                                                                      |
| **Natural Health Product Database**            | NPNs, NHP product/ingredient records, supplement vocabulary                                                                    | Add ASAP because common interaction questions include supplements/NHPs; evidence quality must be marked separately                                           |
| **ATC**                                        | `drug_class` hierarchy (`subclass_of`)                                                                                         | Strengthen ASAP with ingredient-to-class normalization and crosswalk checks                                                                                  |
| **PubMed**                                     | Real-world clinical evidence, PK/PD detail, case reports, outcome context, candidate discovery, and runtime evaluation evidence | Node-targeted acquisition and full-text chunking are offline jobs. PubMed evidence supports/calibrates RuntimeAI and can become `interacts_with` only after the publish gate |
| **DrugBank vocabulary** _(deferred)_           | Potential synonym/identifier aid                                                                                               | Explicitly not in the ASAP plan; revisit only after license review and budget approval                                                                       |

**Licensing (gate before building the CPS ingest):** confirm the CPS partnership agreement explicitly
grants (a) the right to store/cache CPS data in a persistent DB, (b) the right to create derivative/
AI-derived works (chunks, embeddings, graph edges), (c) deletion/retention obligations on termination,
and (d) attribution requirements. The entire knowledge layer is derivative of CPS — this is a
contractual prerequisite, not an engineering detail.

**CPS implementation checkpoint (2026-06-10):** CaaS API access is confirmed. CPS monographs are
ingested server-side: 794 records, 11,987 chunks, and 305 synonyms. DPD product listings are fully
ingested through offset `10926` of `10926`, and earlier DPD ranges were backfilled so product nodes have
derived ingredient nodes, `has_ingredient` edges, aliases, and product metadata. Therapeutic Choices
condition guidance is ingested from `CONDITION_TC`: 136 topics, 5,405 chunks, and 34 synonyms. Minor
Ailments condition guidance is ingested from `CONDITION_MA`: 74 topics, 2,832 chunks, and 40 synonyms.
The skipped TC/MA keyrefs currently return CaaS `404` and should be retried only when CaaS makes them
available. CPS patient medication information is captured inside monograph chunks when present, but it
is not yet a separately exported patient-information corpus. The final throttled DPD retry/continuation
from offset `9700` completed without `401` failures; the earlier partial `9700-9800` file with 16
records and 84 HTTP `401` failures was not ingested.

**Health Canada DPD checkpoint (2026-06-03):** core DPD API ingest is implemented and completed under
source `HEALTH_CANADA_DPD`: 58,043 products, 66,523 nodes, 241,023 synonyms, 167,753 edges, and 58,043
chunks. The snapshot is stored at `supabase/seed/out/health-canada-dpd-latest.json`. Initial API ingest
covers DIN, product status, company, active ingredients, dosage form, route, schedule/status,
pharmaceutical standard, ATC, and therapeutic class. Add the flat extract or another Health Canada
source pass for biosimilar flags if needed.

The public Health Canada source plan is encoded in `supabase/seed/src/health-canada/sources.ts`.
`pnpm --filter @clinrx/supabase-seed health-canada:sources` prints the implemented/planned source
map. Official API documentation exists for DPD, NOC, Summary Reports, Canada Vigilance, and LNHPD.
Health Canada product monographs are ingested through a DPD/DHPR page/link parser rather than a
monograph-only API.

**Health Canada product monograph checkpoint (2026-06-05):** the importer is implemented and
running in validated production batches under source `HEALTH_CANADA_PRODUCT_MONOGRAPH`. It uses Health Canada DPD rows for
product discovery, fetches the exact DPD Online page by `drug_code`, validates the page DIN against the
DPD API DIN, rejects non-human/veterinary pages, extracts the Product Monograph/Veterinary Labelling
PDF URL and displayed date, computes a PDF SHA-256 checksum, extracts text with local `pdftotext`, and
attaches chunks to the Health Canada DPD product node. Current contiguous processed range is DPD snapshot
offsets `51291-58043`, with `150,822` product-monograph chunks in the database after batch QA. Aggregate
QA deduped overlaps/retries to 6,752 unique DPD products: 4,375 accepted, 2,377 rejected, and zero
accepted validation failures. The range reached the DPD snapshot end; provenance is high confidence, extracted text
sections remain review/cross-check context until parser calibration is pharmacist-validated. Batch QA
requires zero accepted validation failures, matching DPD/page DINs, valid PDF URL/date/checksum, adequate
PDF/text size, extracted brand and ingredient tokens, monograph markers, nonzero chunk output, and
database verification of expected chunk IDs. Rejected/quarantined records remain in the manifest. Latest
QA quarantined seven records (`98126`, `99804-99807`, `100105`, `102782`): one wrong-linked PDF signal
and six missing-marker extractions. No invalid accepted records were written.

**Health Canada NOC/NOCc checkpoint (2026-06-05):** the importer is production-ingested against the
official NOC API under source `HEALTH_CANADA_NOC`: 37,336 NOC records, 76,403 product rows/chunks,
79,189 nodes, 39,065 synonyms, and 93,572 edges. It generates NOC product context, NOC/c condition
flags, NOC date/status, manufacturer, submission/product type, DIN, ingredient, route, form, and
therapeutic class metadata.

**Health Canada Summary Reports checkpoint (2026-06-05):** the importer is production-ingested against
the official Summary Reports API under source `HEALTH_CANADA_SUMMARY_REPORT`: 712 Summary Basis of
Decision records, 8,066 Regulatory Decision Summary records, 269 Summary Safety Review records, 9,972
nodes, 3,858 synonyms, 1,695 explicit ingredient links, and 27,041 regulatory/safety chunks. These
chunks are review-prioritization and stale-evidence context; they are not standalone interaction
edges.

**Ontario ODB checkpoint (2026-06-10):** the Ontario Drug Benefit Formulary/CDI importer is implemented
and unit-tested under source `ONTARIO_ODB_FORMULARY`, but ODB is deferred for now and is not a blocker
for interaction-evidence work. Production ingestion has not run. The official XML endpoint also
currently fails from this environment: strict TLS reports an expired certificate, and the insecure retry
reaches HTTP `502`. Use `ONTARIO_ODB_XML_INPUT_PATH=/path/to/data_extract.xml` with an official snapshot
later if ODB becomes relevant. ODB records should provide formulary/reimbursement context and link to
normalized ingredient/class nodes; they should not override CPS or Health Canada clinical facts.

The CPS ↔ Health Canada DPD crosswalk is populated for the complete CPS DPD vocabulary: 8,649 matched,
1,817 possible matches, and 414 source-conflict rows. Reviewer KG search results surface CPS-covered,
Health Canada-only, possible-match, and source-conflict labels.

DPD offsets `0-3100` were ingested before ingredient derivation was added and have now been
backfilled/re-ingested so product nodes gain derived ingredient nodes, `has_ingredient` edges, product
aliases, and product metadata (`generic_name`, manufacturer, schedule, ATC, therapeutic class).

**Robustness data roadmap (ASAP, excluding DrugBank):**

1. **Maintain CPS/CaaS DPD and condition guidance.** DPD, Therapeutic Choices, and Minor Ailments are
   ingested. Retry skipped CaaS `404` keyrefs only after CaaS makes those documents available, and rerun
   PubMed resolution after any source or resolver change.
2. **Add Health Canada DPD full extract/API.** Use it to validate DIN/product status, active ingredients,
   companies, dosage forms, routes, schedules, biosimilar flags, and cancellation/dormancy state against
   CPS/CaaS DPD nodes. Also use it to fill Canadian product gaps where CPS has no matching record.
3. **Expand Health Canada product monograph coverage.** Cross-check CPS sections, product-specific warnings,
   patient medication information, and safety-label updates. Keep source provenance separate from CPS.
4. **Build monograph-first interaction evidence extraction.** For resolved active ingredients, retrieve
   CPS and Health Canada monographs, identify `Drug Interactions` sections, extract pathway/mechanism
   facts and management language, and expose those exact chunks in AI review before PubMed evidence.
5. **Add MedEffect, recalls, advisories, and Canada Vigilance.** Treat these as current safety signals that
   can affect pharmacist review priority, stale-evidence rejection, and Smart Search safety surfacing.
6. **Surface NOC/NOCc metadata.** Attach approval/condition/submission metadata to products for
   current-in-Canada context and evidence provenance.
7. **Add Natural Health Product data.** Model NHP products/ingredients with NPNs and separate evidence
   quality labels so supplement interactions can be triaged without conflating them with prescription
   drug evidence.
8. **Strengthen ATC and route/form/salt normalization.** Add ingredient-to-class crosswalks and preserve
   route/form/salt distinctions where interaction applicability depends on systemic exposure or specific
   salt/form.
9. **Defer Ontario ODB Formulary/CDI.** The importer is ready for later formulary/reimbursement context,
   but ODB should not block monograph-first interaction review.

Health Canada DPD is both a validation/enrichment source and a gap-filling source. It must normalize
into the same graph contract as CPS: product or monograph `drug` nodes, active `ingredient` nodes,
`drug_class` nodes, source identifiers (`DIN`, `NPN`, CPS keyrefs where applicable), aliases,
manufacturer/company, route, dosage form, strength, status/schedule, and source provenance/revision.
Do not create parallel inconsistent CPS and Health Canada node shapes. When both sources describe the
same product, merge identifiers and provenance onto one node; when Health Canada has a valid Canadian
product absent from CPS, create a Health Canada-sourced node with the same fields and a clear source
coverage flag.

CPS remains the primary licensed Canadian drug reference when a CPS monograph/product record is
present. Health Canada can supersede or annotate regulatory currentness fields such as marketed,
cancelled, dormant, approval/condition status, safety alerts, and label updates. PubMed remains
candidate interaction evidence, and only pharmacist-published interaction edges are served by the
checker.

**Pharmacist review dependency:** before pharmacists begin production review or publishing at scale, the
review pipeline must show the enrichment context above. DPD source coverage and Health Canada
product-monograph coverage are now visible for resolved reviewer nodes, and NOC/NOCc plus Summary
Reports are ingested. Remaining required UI context includes MedEffect/safety alerts, NHP involvement,
route/form/salt applicability, stronger ingredient/class/product resolution confidence, and clearer source
conflicts such as ingredient/status mismatch. Until then, pharmacist sessions are calibration only.

**Sync (not "occasionally" — define it):**

- **Incremental, delta-based.** Pull only what changed since the last sync via the CaaS API's
  changed-since / revision mechanism; do not full-re-ingest on a schedule.
- **Content-hashed re-derivation.** Hash monograph content; re-chunk and **re-embed (Voyage cost)**
  only the monographs whose hash changed. Changed text → update attached nodes/edges and invalidate caches.
- **Versioned provenance.** Stamp every node/chunk with its CPS revision; surface a "data current as
  of" date in-app. This also feeds citation/provenance in Smart Search.
- **Cadence.** Align to CPS's publication cycle (e.g. weekly) rather than ad hoc — CPS issues
  safety-relevant changes (new contraindications/warnings) that should not lag indefinitely.
- **Idempotent + resumable.** Re-running a sync must converge to the same state; partial failures resume.

### 3.7 Mechanism-derived interactions (the relationship taxonomy)

The pharmacist's interaction taxonomy has three axes — **therapeutic
effect/duplication**, **pharmacokinetics**, **pharmacodynamics**. Rather than
hand-author every pairwise `interacts_with` edge, we model the *mechanism* once
per drug and **derive** the pairwise interactions.

The **pharmacokinetic (CYP) sub-layer** is the first built (status 2026-06-23):
`enzyme` nodes + `metabolized_by` / `inhibits_enzyme` / `induces_enzyme` edges at
the ingredient level. Sources: the curated FDA DDI table (`FDA_DDI`, published)
and strict LLM extraction over monograph CLINICAL PHARMACOLOGY / DRUG
INTERACTIONS sections (`CPS_MONOGRAPH` / `HC_MONOGRAPH`, `candidate`). A live view
`kg_pk_interaction` joins modulators to substrates on a shared enzyme to derive
pairwise PK interactions (currently ~17.5k), surfaced for pharmacist review in
the KG explorer. Once severity is confirmed these derive into materialized
`interacts_with` edges at the moiety level — the same shape the checker (§3.3/§3.5)
already consumes, so nothing downstream changes.

**Full design, progress, severity-mapping decision, and roadmap (PD axis,
transporters/UGT, PubMed extraction, materialization gating) live in
`docs/PK_INTERACTION_LAYER.md`.**

---

## 4. Retrieval architecture (GraphRAG)

Smart Search and OSCE both use the same retrieval core in `packages/core/search/`:

1. **Entity linking** — map the query to anchor nodes via (a) trigram/FTS match on
   `kg_node_synonym` and `canonical_name`, and (b) vector search on `kg_node.embedding`. Union + dedupe.
2. **Subgraph expansion** — from anchors, traverse typed edges to a bounded depth (default 2 hops),
   following relations relevant to the query intent (`treats`, `interacts_with`, `subclass_of`,
   `contraindicated_in`, `comorbid_with`). Collect nodes, edges, and the `kg_chunk`s attached to them.
3. **Candidate assembly** — gather chunk candidates from the subgraph + a direct vector/FTS hybrid
   search over `kg_chunk`.
4. **Rerank, when justified by calibration** — deterministic ranking is the current baseline. Evaluate
   Cohere Rerank over candidate chunks if pharmacist labels show the right evidence exists in the
   candidate pool but the wrong chunks are selected.
5. **Generate** — Claude Opus 4.8, given (a) the serialized subgraph (entities + typed relationships)
   and (b) the top reranked chunks, with a strict "answer only from provided context, cite source
   nodes/sections, say 'not found' otherwise" instruction.

The serialized subgraph is what makes this _graph_ RAG: the model sees that drug X `subclass_of` class Y
which `interacts_with` Z, enabling multi-hop answers a flat top-k vector search cannot produce.

---

## 5. Feature architecture

### 5.1 Interaction Checker (FEATURE 1 — build first)

- **Runtime input.** Input is a set of KG node ids resolved from user selections, not unresolved
  free-text in the normal app flow. Product selections expand to active ingredient/class context.
- **Deterministic first tier.** Return all pairwise published interactions including class-level
  interactions — each with severity, mechanism, management, evidence level, and citations — from
  `kg_edge`, filtered to `review_status = 'published'`.
- **RuntimeAI research/calibration tier.** For missing or uncertain deterministic answers, the deployed
  `check-interactions` function can retrieve already-indexed CPS, Health Canada, PubMed, and safety
  evidence and run evidence-grounded model inference. This tier is versioned, cached, evidence-traced,
  and currently evaluated through pharmacist calibration sets. It must not fetch broad PubMed/full-text
  evidence at request time.
- **Data source:** our own monograph-first, PubMed-supported interaction base (§3.5); DrugBank is
  deferred on cost and merged later as an additional higher-precision source. The deterministic code
  path is built against **published** edges; until the corpus has reviewer-published coverage, seed a
  small hand-curated,
  clearly-flagged set so the path is exercisable. The deterministic checker tier only reads
  `published` edges.
- **No false "safe."** The UI renders "no known interaction in the current evidence base," shows
  citations on every served interaction, and states coverage limits with the educational-use disclaimer (§3.5).
- **Surface:** `packages/core/interactions/` exposes `checkInteractions(nodeIds): InteractionResult[]`.
  No platform code. The app calls it via `packages/api`.

### 5.2 Smart Search — GraphRAG per §4. Streamed Claude responses with inline citations to nodes/sections.

### 5.3 Quizzing + notifications

- Question bank as rows linked to `kg_node`s (so questions are tied to graph entities).
- **FSRS** spaced-repetition scheduler in `packages/core/quiz/` (pure functions, fully unit-tested).
- Anonymous competition: pseudonymous handle decoupled from auth identity; **Supabase Realtime**
  subscription drives the live leaderboard.
- Delivery: a scheduled Supabase Edge Function selects due questions and pushes via
  **`expo-notifications`** (APNs/FCM). PWA push is treated as best-effort only, never the primary path.

### 5.4 Voice provider architecture

- **ElevenLabs Conversational AI is the v1 realtime voice provider** for both OSCE prep and interactive
  audio lessons. We are not doing phone numbers, call routing, SIP, or contact-center flows in v1, so
  Vapi is not a required dependency.
- Keep voice logic behind `packages/core/voice` provider contracts. The app and Edge Functions should
  depend on ClinRx session/rubric/lesson abstractions, not directly on ElevenLabs-specific payloads.
- A **Supabase Edge Function** serves ElevenLabs tools/webhooks: it supplies grounded context, receives
  transcript/session events, persists progress, and updates lesson state. Student PII stays out of
  model/voice payloads wherever possible.
- Vapi remains an escape hatch if we later need telephony, provider orchestration across STT/LLM/TTS,
  or more managed call/session infrastructure.

### 5.5 OSCE voice simulations

- ElevenLabs runs the live spoken loop with patient/examiner personas. Case prompts and allowed tools
  come from Supabase Edge Functions.
- **Scoring is separate and deterministic-ish:** after the session, Claude scores the stored transcript
  against a structured OSCE **rubric/checklist** (not a vibes score). Rubric + scoring in
  `packages/core/osce/`. Persist transcript + per-item rubric result.

### 5.6 Interactive audio lessons

- Lessons are **adaptive spoken sessions**, not static prerecorded audio. The lesson controller tracks
  concept coverage, lets the student ask questions, repeat a section, go deeper, or jump ahead, then
  returns to the planned concept sequence.
- ElevenLabs provides realtime voice. `packages/core/lessons` owns the lesson state machine:
  planned concepts, current concept, covered concepts, detours, resume point, and completion criteria.
  Edge Functions expose tools such as `get_lesson_state`, `mark_concept_covered`, `repeat_current`,
  `go_deeper`, and `resume_plan`.

---

## 6. Authentication & data residency

- Supabase Auth with: **Apple OAuth**, **Google OAuth**, **email magic link**, **passkey (WebAuthn)**.
  **No passwords.**
- Passkey note: Supabase's WebAuthn support is evolving; verify current capability at build time and,
  if first-class passwordless passkey isn't available as a primary factor, implement it as an added
  WebAuthn factor and keep magic link as the universal fallback. Document whatever you choose.
- The **anonymous quiz handle** is a separate `profile.display_handle` column, never the email/identity.
- Enforce **Row Level Security** on all user-scoped tables from the first migration.
- **Canadian data residency (PIPEDA).** Students are Canadian, so their PII falls under PIPEDA.
  Provision the Supabase project in the **ca-central** region. Be aware that LLM/embedding/voice calls
  (Anthropic, Voyage, Cohere, ElevenLabs) may egress outside Canada — keep student PII out of
  those payloads (send drug/query content, not identities) and document the data-flow for compliance.

---

## 7. Environment variables

```
# Supabase
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # server / edge functions only, never in client

# Models & retrieval
ANTHROPIC_API_KEY=                  # Claude Opus 4.8
VOYAGE_API_KEY=                     # embeddings
COHERE_API_KEY=                     # rerank

# Voice & audio
ELEVENLABS_API_KEY=                 # server / edge functions only, never in client
EXPO_PUBLIC_ELEVENLABS_AGENT_ID=    # client-safe agent id, if direct client session setup is used

# Offline (if PowerSync)
EXPO_PUBLIC_POWERSYNC_URL=
PS_ADMIN_TOKEN=                    # server / CI only, never in client
POWERSYNC_DATABASE_PASSWORD=        # server / CI only, never in client

# OAuth client ids/secrets are configured in the Supabase dashboard, not here.
```

Rule: anything prefixed `EXPO_PUBLIC_` ships to the client and must be non-secret. Service keys,
Anthropic/Voyage/Cohere/ElevenLabs keys, and the PowerSync token live only in Edge Functions / CI.

---

## 8. Offline strategy

Students need offline study (cached questions + lessons). The CPS license limits offline scope:
syncing raw CPS data to a device is redistribution to hardware we do not control, so PowerSync must
never sync CPS-derived graph/content tables.

- **Recommended:** **PowerSync** — Supabase-native sync that mirrors selected tables into a local
  SQLite DB on device with bidirectional sync and conflict handling. Scope sync to authored quiz
  items, authored lesson metadata/audio references, and the current student's own progress, FSRS
  state, quiz results, and settings.
- **Never sync CPS-derived data:** `kg_chunk`, `kg_edge`, monograph text, interaction edges,
  embeddings, and GraphRAG source material stay server-only. Do not rely on client filtering; keep
  these tables out of PowerSync streams/publications entirely.
- **Lighter v1 fallback** if PowerSync is too much up front: persist TanStack Query caches to **MMKV**
  and pre-download a question/lesson bundle for read-only offline study. This defers true write-sync.
- The interaction checker and GraphRAG search are **online-only** in v1 (they need the full graph and
  the models); do not attempt to ship the graph to the device. If the device is offline, show an
  "online connection required" state.
- Do not build offline monograph reading in v1. Any future version requires a separate CPS capability
  covering subset sync, subscription expiry/wipe, and encrypted local storage.

---

## 9. CI / CD

- **GitHub Actions** on PR: `pnpm install` → `turbo run lint typecheck test build`. Turborepo remote
  cache keyed on the affected graph so only changed packages rebuild.
- **EAS** for iOS/Android builds and submissions; EAS Update for OTA JS updates.
- Web/PWA build output deploys to your host of choice (Vercel-compatible).
- Supabase migrations applied via the Supabase CLI in a deploy job; never edit the hosted schema by hand.

---

## 10. Sharing discipline (the thing that makes "later" cheap)

- Share **types, validation, api, and core logic** aggressively and from day one.
- **Do not** build a shared cross-platform UI library early. Let `apps/mobile` own its components.
  RN and (future) Next.js render differently enough that a premature shared `ui` package becomes a
  liability. Revisit a shared UI layer (e.g. Tamagui) only when real duplication is felt.
- Mental test for any new module: _could this run unchanged inside a Next.js route?_ If not, it has a
  rendering dependency and belongs in an app, not in `packages/`.

---

## 11. The "add the public web app" trigger (future, not v1)

Add `apps/web` (Next.js) the first time you need a page that must be **server-rendered and indexed by
Google** — a public landing page, shareable content article, or pricing page. At that point:

- Create `apps/web`, import the existing `packages/*` unchanged.
- Keep the authenticated student web experience on RN Web (or migrate it later), and use Next.js for
  the public/SEO surface. Both apps share the same backbone and the same `packages/`.
  Nothing in the v1 build needs to change to make this possible **except** keeping logic in `packages/`.

---

## 12. Graph-store escape hatch (when to leave Postgres)

The relational node/edge + recursive-CTE model is correct for a bounded medical ontology on Supabase
Cloud. Migrate the **knowledge layer** (not the app data) to a dedicated graph database — **Neo4j**
(native traversal + Cypher + its own vector index) or Postgres **Apache AGE** if self-hosting — when
you hit: deep multi-hop traversals (4+ hops) that CTEs make slow, a need for graph algorithms
(community detection, centrality) to power retrieval, or graph size where edge-table joins degrade.
App state (users, quiz, sessions, auth, storage) stays in Supabase Postgres regardless.

---

## 13. Build order for the agent (execute in sequence)

**Phase 0 — Foundation**

- Scaffold the monorepo: pnpm workspaces, Turborepo, shared `config` (tsconfig/eslint/prettier/tailwind).
- Create empty `packages/{types,validation,api,core}` with build wiring and the dependency rule enforced.
- Create the Expo app in `apps/mobile` with Expo Router + NativeWind + TanStack Query + Zustand; verify
  it runs on web, iOS, and Android.
- Initialize the Supabase project; wire `packages/api` Supabase client; implement Auth (§6) with RLS.

**Phase 1 — Knowledge graph + Interaction Checker (Feature 1)**

- Apply the §3.2 schema migration.
- Implement `supabase/seed` ingestion for ATC + CPS. CPS monographs, DPD product listings, Therapeutic Choices, and Minor Ailments are loaded; DPD product nodes have derived ingredients, `has_ingredient` edges, aliases, and metadata.
- Add/finish robustness ingestion jobs ASAP: monograph-first Drug Interactions extraction, MedEffect recalls/advisories, Canada Vigilance adverse-reaction data, Natural Health Product data, ATC ingredient-to-class crosswalks, and route/form/salt normalization. Health Canada DPD, product monograph context, NOC/NOCc metadata, and Summary Reports are already production-ingested. Defer ODB and DrugBank/commercial vocabulary.
- Wire the remaining enrichment layers into the pharmacist review UI before production review starts: show CPS and Health Canada Drug Interactions chunks, safety alerts, stale-evidence warnings, NHP flags, route/form mismatches, conditional approval/NOCc context, product-level match warnings, and resolution confidence. DPD source coverage and product-monograph coverage are already visible for resolved reviewer nodes.
- Stand up the **PubMed interaction-extraction pipeline** (§3.5): harvest → Claude extract → stage as
  `candidate` edges with PMID citations → reviewer publish gate. Build a minimal reviewer view to
  promote candidates to `published`.
- Implement `packages/core/interactions/checkInteractions` with class-level expansion (§3.3b, §5.1),
  reading **only `published` edges**; exercise the path against a clearly-flagged hand-curated seed set
  until reviewer-published coverage exists.
- Build the Interaction Checker UI in `apps/mobile`: never shows a bare "safe," surfaces citations and
  the educational-use + coverage disclaimer.

**Phase 2 — Smart Search (GraphRAG)**

- Implement `packages/core/kg` (entity linking, subgraph expansion) and `packages/core/search`
  (assemble → optional calibrated rerank → Claude generate with citations). Streamed UI.

**Phase 3 — Quizzing + notifications**

- Question bank tied to `kg_node`s; FSRS scheduler in `packages/core/quiz`; Realtime leaderboard;
  scheduled Edge Function + `expo-notifications` delivery.

**Phase 4 — Voice, OSCE, and interactive lessons**

- `packages/core/voice` provider contracts with ElevenLabs as v1 provider.
- ElevenLabs session setup + Supabase Edge Function tools/webhooks; persist transcripts/events.
- OSCE rubric scoring in `packages/core/osce`.
- Interactive lesson state machine in `packages/core/lessons`; lesson player/voice UI.

**Cross-cutting (introduce alongside Phase 1+):** offline (§8), tests (Vitest for every `packages/core`
module as it lands, RNTL for app screens), CI (§9).

---

## 14. Open items to confirm during the build

- Exact current Voyage model version (pin in code; dimension stays 1024 unless deliberately changed).
- NCBI E-utilities usage terms + per-article PMC license tiers → bounds what the PubMed pipeline may store/redistribute vs. link out (§3.5).
- Who performs the pharmacist review/publish step, and the bar for promoting a candidate edge to `published`.
- DrugBank (deferred): when budget allows, its license terms and fields → how it merges as an additional high-precision interaction source (does not change the schema).
- Passkey capability in current Supabase Auth → finalizes §6.
- PowerSync vs. MMKV fallback decision for v1 offline scope.
