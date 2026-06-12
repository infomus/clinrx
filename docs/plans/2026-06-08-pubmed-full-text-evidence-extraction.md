# PubMed Full-Text Evidence Extraction Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Upgrade the interaction evidence pipeline to be monograph-first, then PubMed-supported. CPS and Health Canada monograph `Drug Interactions` sections should establish the interaction/pathway context; PubMed abstracts/full text should provide real-world examples, outcome detail, PK/PD magnitude, and limitations. Full-text processing must remain license-aware and preserve only clinically relevant evidence chunks, including structured table evidence and selective figure/graph interpretations.

**Architecture:** Add a required monograph interaction-context pass before PubMed enrichment. For each candidate pair, resolve both drugs to active ingredients, retrieve related CPS and Health Canada monographs by generic and brand/product names, select `Drug Interactions` chunks, extract pathway/mechanism and management facts, and expose those chunks in the AI decision trace. Keep the existing PubMed abstract pipeline as literature triage, then add an enrichment path for PMIDs with legally accessible full text, prioritizing PMC Open Access JATS XML. Store article provenance and evidence-grade snippets/chunks, not entire article bodies. Require every extracted interaction candidate to point to supporting monograph and/or PubMed evidence from exact chunks.

**Tech Stack:** TypeScript, Supabase/Postgres, existing `supabase/seed/src/pubmed/*` pipeline, NCBI E-utilities, PMC ID Converter/OA services, JATS XML parsing, optional PDF fallback, selective vision model calls for figures/graphs.

---

## Product/Clinical Rationale

The current PubMed interaction pipeline only gives AI the article title, abstract text, year, journal, and PMID. That is useful for smoke testing extraction and review workflow, but it is not robust enough for a serious drug interaction evidence base.

Abstract-only extraction can miss:

- interaction details buried in results, discussion, case details, or supplementary material;
- PK/PD quantitative effects reported only in tables, e.g. AUC/Cmax changes;
- dose, route, population, and timing constraints needed for clinical applicability;
- negative or limiting context that should downgrade or reject a candidate;
- graph/figure evidence where the signal is visual rather than prose;
- management/severity details omitted from the abstract.

Target behavior:

- AI should first retrieve current CPS and Health Canada monograph interaction sections for the resolved active ingredients.
- AI should extract enzyme/transporter/receptor roles, inducer/inhibitor/substrate/agonist/antagonist labels, interacting examples/classes, and management/monitoring language from monographs.
- AI should process full text where legally/technically available.
- The system should store only relevant, important evidence chunks and structured evidence metadata.
- Tables and figures should be treated as first-class evidence sources, not flattened into lossy text.
- Pharmacists should see exact monograph and PubMed supporting evidence before publishing an interaction edge.

---

## Current State Summary

Existing relevant files:

- `supabase/seed/src/pubmed/harvest.ts`
  - Uses PubMed `esearch.fcgi` and `efetch.fcgi`.
  - Maps `Article.Abstract.AbstractText` into `abstractText`.
  - Filters out articles with no abstract.

- `supabase/seed/src/pubmed/extract.ts`
  - Sends the harvested `PubMedArticleInput` object to Claude.
  - Current prompt asks for candidates supported by the abstract.
  - Extracts `subjectText`, `objectText`, severity, mechanism, management, evidence level, confidence, `sourceQuote`, and citations.

- `supabase/seed/src/pubmed/stage.ts`
  - Stages extracted candidates into `pubmed_interaction_candidate`.
  - Stores short quote and citation metadata.

- `supabase/migrations/20260526150000_pubmed_interaction_candidates.sql`
  - Defines candidate table and publish function.
  - Published candidates become `kg_edge` rows with `source = 'PubMed'`.

Important current limitation:

- No full article body or PMC full text is fetched.
- No `kg_chunk` rows are created for PubMed evidence.
- No structured table extraction exists.
- No figure/graph extraction exists.
- No first-class monograph `Drug Interactions` evidence selector/trace exists yet. Current review surfaces monograph coverage, but not the exact CPS and Health Canada interaction chunks used for the AI decision.

## Pre-Implementation Source Gap Status

Before implementing full-text evidence ingestion/extraction/staging and AI re-review, the Canadian
source graph must be coherent enough that AI review can resolve entities against the right product,
ingredient, class, condition, and source-provenance context.

Current status as of 2026-06-10:

- CPS monographs are ingested: 794 records, 11,987 chunks, and 305 synonyms.
- CPS DPD product listings are fully ingested: 10,926 of 10,926 keyrefs, with derived `ingredient`
  nodes, `has_ingredient` edges, aliases, and product metadata.
- CPS Therapeutic Choices condition guidance is ingested from CaaS `CONDITION_TC`: 136 topics, 5,405
  chunks, and 34 synonyms. Four manifest keyrefs currently return CaaS `404` and were skipped.
- CPS Minor Ailments condition guidance is ingested from CaaS `CONDITION_MA`: 74 topics, 2,832
  chunks, and 40 synonyms. Five manifest keyrefs currently return CaaS `404` and were skipped.
- CPS patient medication information is available within monograph chunks where monographs contain
  patient-information sections. It is not yet a separately exported CPS patient-information corpus.
- Health Canada DPD, NOC/NOCc, Summary Reports, and product monograph context are implemented and
  production-ingested as described in `supabase/seed/README.md`.
- Ontario ODB Formulary/CDI ingestion is implemented and unit-tested under source
  `ONTARIO_ODB_FORMULARY`, but ODB is deferred for now and is not a blocker for interaction-evidence
  work.

Full-text PubMed work can proceed after the monograph-first interaction-context pass is represented in
the plan/UI. ODB should remain deferred; do not design AI review as though ODB rows are already present.

## Pharmacist-Guided Evidence Workflow

The pharmacist workflow to encode is:

1. Identify the relevant monographs for each drug in the pair.
2. Search CPS and Health Canada monograph databases by active ingredient, for example `Acetaminophen`.
3. Retrieve all monographs related to that ingredient, including generic and brand/product monographs.
4. Inspect the `Drug Interactions` section in each relevant monograph.
5. Extract pathway facts from that section:
   - enzymes, transporters, and receptors;
   - whether the drug is described as an inducer, inhibitor, substrate, antagonist, or agonist;
   - interacting drug examples and drug classes;
   - management or monitoring language.
6. Use those monograph facts to understand the expected interaction risk and mechanism.
7. Use PubMed afterward to demonstrate real-life examples, clinical outcomes, quantitative PK/PD effects,
   contradictions, or limitations.

Implementation consequence: AI review must show the pharmacist the exact monograph chunks and metadata
used to decide the interaction category. Monograph context cannot be collapsed to "coverage exists";
the reviewer needs to see source, section, product/ingredient, DIN or CPS id when available, monograph
date/provenance, chunk id, extracted pathway facts, and linked PubMed chunks.

---

## Design Principles

0. **Monograph-first evidence hierarchy**
   - CPS and Health Canada monograph `Drug Interactions` sections are the first source for current expected interaction risk, pathway/mechanism, and management language.
   - PubMed is used after monograph review to demonstrate real-world examples, quantify effects, or identify limitations/contradictions.
   - AI review should not label a PubMed candidate publishable without showing whether current monograph context supports, narrows, contradicts, or is silent on the pair/pathway.

1. **Full text for extraction, not wholesale storage**
   - We do not need to store entire article bodies.
   - We need to process full text and retain the evidence chunks that justify/reject interaction candidates.

2. **Full text is not automatically better**
   - Full text should increase recall only when paired with precision gates.
   - Do not dump an entire article into a model and ask for every possible interaction.
   - Treat full text as evidence retrieval plus validation, not as an unchecked candidate-volume amplifier.

3. **License-aware ingestion**
   - Prefer PMC Open Access full-text XML.
   - Store license and provenance for every artifact.
   - Do not persist large copyrighted article bodies from non-reusable sources.

4. **Evidence-first candidate extraction**
   - Every candidate must cite supporting evidence.
   - Evidence source types: paragraph, table, figure caption, figure interpretation, supplement.
   - Unsupported candidates should be rejected or marked low confidence.
   - Evidence that only supports a mechanism, severity, management recommendation, or limitation must be labeled separately; do not let mechanism-only evidence imply a proven clinical interaction.

5. **Tables are structured data**
   - Preserve headers, row labels, cell values, footnotes, and table IDs.
   - Do not treat tables as plain markdown blobs unless no better option exists.

6. **Figures/graphs are selective and expensive**
   - Use figure captions and nearby text as a cheap relevance filter.
   - Run vision only when the figure likely contains interaction-relevant evidence.
   - Store vision-derived interpretation with explicit uncertainty.

7. **Pharmacist review is calibration, not the end-state workflow**
   - The review pipeline is primarily for measuring and improving ingestion, retrieval, entity resolution, evidence selection, and inference quality.
   - Pharmacists should not be expected to manually approve every interaction forever.
   - The end-state interaction checker should be AI-powered, evidence-traced, and evaluated against pharmacist calibration sets.
   - For the current MVP, manual publish remains a conservative temporary gate until calibration metrics support higher automation.

7a. **Calibration unit is a request-time checker run**
   - Pharmacists should evaluate simulated interaction-checker requests, not PubMed-extracted candidates as the primary review unit.
   - The canonical review question is: "For this drug-pair request, did the system retrieve the right evidence and produce the right interaction answer?"
   - A calibration card must show the user-style input pair, resolved entities, retrieved monograph/PubMed/safety evidence, the AI answer category, management text, evidence trace, and source metadata.
   - Pharmacist labels should measure entity resolution, retrieval recall/precision, evidence interpretation, final action-category accuracy, management wording, generalization, and automation safety.
   - PubMed candidate extraction remains useful for discovering evidence and hard examples, but it should feed runtime evaluation sets rather than define the pharmacist workflow.
   - The runtime evaluation schema is source-agnostic so later request-time runs can use all indexed PubMed evidence, CPS/Health Canada monographs, NHP/safety sources, and published graph edges without changing the pharmacist UI.
   - Implemented live bridge: the deployed `check-interactions` edge function can write actual app checker calls into `interaction_evaluation_*` tables when `captureEvaluation` is enabled. It records deterministic published-KG answers, source-silent no-known-interaction evidence, and RuntimeAI answers with exact prompt evidence rows under the same request/run/evidence contract.

7b. **Runtime latency model**
   - Evaluation capture must not block the checker answer. Runtime calls should default to async capture and only use sync capture for tests or debugging.
   - Deterministic published-KG lookups should be cached by sorted node-pair fingerprint and graph version. Any `kg_edge` mutation bumps the graph version and invalidates stale cache keys.
   - AI-powered answers should be cached separately by pair fingerprint, evidence version, retrieval strategy, prompt version, and model. Indexed PubMed/monograph evidence mutations bump the evidence version.
   - Request time must use already-indexed evidence chunks. Broad PubMed fetching, full-text extraction, and model-based article extraction remain offline ingestion tasks.
   - The runtime order should be: deterministic KG answer if available -> indexed monograph/PubMed/safety retrieval -> LLM only for missing/conflicting/low-confidence cases -> cache final answer and write evaluation trace.

7c. **Runtime evidence retrieval without LLM**
   - Implemented in `check-interactions`: evaluation capture now retrieves bounded indexed evidence per pair without making model calls.
   - The runtime retriever expands selected nodes through ingredient/class lookup scope, CPS/Health Canada crosswalks, and linked product nodes.
   - Retrieved evidence includes CPS Drug Interactions chunks, Health Canada product-monograph Drug Interactions chunks, fallback safety chunks when direct interaction chunks are absent, and already-staged PubMed candidate/full-text chunks for resolved candidate pairs.
   - Retrieved chunks are written to `interaction_evaluation_evidence` with source kind, chunk ID, section/source metadata, side, support type, and deterministic pathway/management facts.

7d. **Online runtime AI inference over indexed evidence**
   - Implemented in `check-interactions` behind `useAiInference: true`.
   - Default app mode is `aiInferenceMode: "on_miss_or_uncertain"`: deterministic published-KG answers skip the model; missing deterministic answers retrieve indexed evidence and call the online Anthropic API.
   - Runtime inference uses Claude Opus 4.8 by default and intentionally omits sampling parameters such as `temperature`, because current Opus 4.8 rejects non-default sampling params.
   - The prompt is constrained to the five checker categories: `no_known_interaction`, `no_action_needed`, `monitor_therapy`, `consider_therapy_modification`, and `avoid_combination`.
   - RuntimeAI rows include `actionCategory`, severity, management, mechanism/rationale, confidence, evidence support, uncertainty, used evidence IDs, model, prompt version, retrieval strategy version, and the exact `promptEvidence` rows supplied to the model.
   - RuntimeAI cache entries use `interaction_checker_result_cache.engine = 'ai_evidence_inference'`, keyed by sorted pair fingerprint, graph version, evidence version, retrieval strategy, prompt version, and model.
   - Evaluation capture now records RuntimeAI runs with model `claude-opus-4-8`, prompt `interaction-runtime-ai-v1`, retrieval strategy `indexed-monograph-pubmed-runtime-v1`, and prompt evidence rows marked with `used_in_answer`.
   - Runtime must continue to use already-indexed evidence only. Broad PubMed fetching, full-text extraction, and offline candidate extraction remain seed/offline jobs.

7e. **Calibration model and runtime-strategy comparison panel**
   - Implemented as an opt-in calibration path, not the normal checker path.
   - Default panel: Opus 4.8 (`claude-opus-4-8`), Sonnet 4.6 (`claude-sonnet-4-6`), Haiku 4.5 (`claude-haiku-4-5-20251001`), GPT-5.5 (`gpt-5.5`), and GPT-5.4 mini (`gpt-5.4-mini`).
   - OpenAI model-panel runs use the Responses API with JSON Schema structured output and require `OPENAI_API_KEY`.
   - Each model evaluates the same resolved request and retrieved evidence, then writes a separate `interaction_evaluation_run` for the same `interaction_evaluation_request`.
   - Pharmacist labels are now unique per request/run/reviewer, so the same reviewer can independently label each model answer.
   - RuntimeAI traces store per-model `latencyMs`. Failed or malformed model outputs are captured as failed evaluation runs with `runtimeStatus`, `runtimeError`, preserved prompt evidence, and latency so calibration measures reliability as well as answer quality.
   - RuntimeAI now requests forced structured output where available, accepts JSON/fenced-JSON fallback, and prompts models with short evidence IDs (`E1`, `E2`, etc.) while retaining original source/chunk IDs in metadata. Invalid structured output is captured as a failed run instead of synchronously retried by default, so latency metrics reflect first-pass runtime behavior.
   - Use `pnpm calibration:model-panel` with `INTERACTION_EVALUATION_SET_ID` and `INTERACTION_MODEL_PANEL_LIMIT` to precompute model-comparison runs in controlled batches.
   - The same calibration set should also evaluate retrieval/KG strategies, not just LLMs: direct ingredient-only expansion, ingredient+brand/product expansion, ingredient+class expansion, monograph-first evidence ranking, PubMed-only fallback, and conservative source-conflict quarantine. Track retrieval correctness, entity resolution correctness, evidence sufficiency, latency, and false-positive over-warning for each strategy.

8. **Protect checker quality over raw coverage**
   - The interaction checker should not become noisier or more alarmist just because the extraction source is richer.
   - Low-confidence, preclinical, product-specific, stale, or special-population evidence should be clearly flagged and should not become broad published edges by default.

---

## Risk: Full Text Can Degrade KG and Checker Quality

Processing full text can make the knowledge graph worse if it is implemented as naive extraction over large noisy documents. This plan must explicitly guard against the following failure modes:

1. **False-positive extraction from weak signals**
   - Full text contains background statements, coadministration mentions, enzyme facts, speculative mechanisms, adverse-effect discussions, and related-work summaries.
   - Risk: the model turns `Drug A is a CYP3A4 substrate` plus `Drug B is a CYP3A4 inhibitor` into a candidate even if the article did not directly support that pair.
   - Mitigation: require direct cited evidence for the pair, classify mechanism-only evidence separately, and reject coadministration-only mentions.

2. **Context dilution**
   - Abstracts are dense and curated; full text includes methods boilerplate, references, limitations, unrelated comparator arms, and background facts.
   - Risk: the model anchors on irrelevant text or misses the clinically important part.
   - Mitigation: run deterministic evidence selection first, pass only relevant chunks/tables/figures to extraction, and preserve nearby context without sending the full article indiscriminately.

3. **Table and figure misinterpretation**
   - Tables have footnotes, units, confidence intervals, comparators, merged cells, and dose arms. Figures may show trends without precise numeric values.
   - Risk: wrong magnitude, wrong comparator, wrong group, or exaggerated severity.
   - Mitigation: parse tables structurally, preserve headers/footnotes, require table-cell provenance, and instruct vision not to invent numeric precision.

4. **Wrong clinical generalization**
   - Evidence may be animal-only, in vitro, healthy-volunteer PK, high-dose, route-specific, oncology-specific, product/formulation-specific, investigational, or otherwise not broadly applicable.
   - Risk: publishing a broad interaction edge that over-warns users.
   - Mitigation: extract applicability fields, downgrade non-clinical/special-context evidence, and require pharmacist confirmation before publishing broad edges.

5. **Duplicate and contradictory evidence**
   - Review articles and full text may mention old evidence, contradicted findings, or the same pair multiple times across sections/tables.
   - Risk: duplicated candidates, stale candidates, or candidates that ignore limitations elsewhere in the paper.
   - Mitigation: dedupe by normalized pair/evidence context, search selected chunks for contradicting/limiting evidence, and expose contradictions in review.

6. **Reviewer queue degradation and alert fatigue**
   - More full-text candidates can flood pharmacists with low-quality work.
   - Risk: lower reviewer trust and slower publication of good edges.
   - Mitigation: use precision-gated staging, validation scores, likely-reject routing, and reviewer filters by evidence type/confidence/applicability.

7. **Checker UX degradation**
   - A richer evidence base can make the checker over-warn if low-confidence or narrow-context evidence is published too broadly.
   - Risk: students learn alert fatigue instead of clinical judgment.
   - Mitigation: publish only pharmacist-approved edges, preserve evidence level/applicability, and avoid rendering low-confidence findings as general warnings.

Quality rule: **full-text extraction is allowed to increase recall only when it does not reduce precision, provenance, or reviewability.** If a candidate cannot point to exact evidence and pass validation, it should not enter the normal publish queue.

---

## Proposed Data Model

### New table: `pubmed_article_full_text`

Stores full-text availability/provenance metadata, not the full article body by default.

Columns:

- `pmid text primary key`
- `pmcid text`
- `doi text`
- `article_title text`
- `journal text`
- `article_year integer`
- `full_text_status text`
  - `not_checked`
  - `not_available`
  - `pmc_oa_available`
  - `pmc_non_oa`
  - `publisher_only`
  - `failed`
- `license text`
- `license_url text`
- `source_url text`
- `oa_package_url text`
- `checked_at timestamptz`
- `processed_at timestamptz`
- `error_message text`
- `metadata jsonb not null default '{}'::jsonb`

### New table: `pubmed_evidence_chunk`

Stores relevant evidence snippets/chunks extracted from full text.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `pmid text not null`
- `pmcid text`
- `source_type text not null`
  - `abstract`
  - `paragraph`
  - `table`
  - `figure_caption`
  - `figure_interpretation`
  - `supplement`
- `section_title text`
- `section_path text[]`
- `label text`
  - examples: `Table 2`, `Figure 3`, `Results > Pharmacokinetic outcomes`
- `content text not null`
- `structured_content jsonb not null default '{}'::jsonb`
  - tables: headers, rows, footnotes, cell coordinates
  - figures: image URL/path, caption, interpreted variables/effect direction
- `relevance_score real`
- `extraction_confidence real`
- `license text`
- `source_url text`
- `created_at timestamptz not null default now()`

Indexes:

- `(pmid)`
- `(pmcid)`
- `(source_type)`
- FTS index on `content`
- Optional pgvector embedding later, but do not block MVP on embeddings.

### Candidate link table: `pubmed_candidate_evidence`

Links candidates to supporting evidence chunks.

Columns:

- `candidate_id uuid references pubmed_interaction_candidate(id) on delete cascade`
- `evidence_chunk_id uuid references pubmed_evidence_chunk(id) on delete cascade`
- `support_type text not null`
  - `supports_interaction`
  - `supports_mechanism`
  - `supports_severity`
  - `supports_management`
  - `contradicts_or_limits`
- `quote text`
- `confidence real`
- primary key `(candidate_id, evidence_chunk_id, support_type)`

### Candidate monograph evidence link

PubMed evidence is not enough for the pharmacist workflow. Add a companion link from candidates to
monograph `kg_chunk` rows, or generalize the evidence-link table if this is implemented before the
PubMed-specific migration is finalized.

Suggested table: `interaction_candidate_monograph_evidence`

Columns:

- `candidate_id uuid references pubmed_interaction_candidate(id) on delete cascade`
- `kg_chunk_id uuid references kg_chunk(id) on delete cascade`
- `support_type text not null`
  - `supports_interaction`
  - `supports_mechanism`
  - `supports_severity`
  - `supports_management`
  - `contradicts_or_limits`
  - `source_silent`
- `source_kind text not null`
  - `cps_monograph`
  - `health_canada_product_monograph`
- `section text`
- `quote text`
- `extracted_facts jsonb not null default '{}'::jsonb`
  - enzymes/transporters/receptors;
  - inducer/inhibitor/substrate/agonist/antagonist role;
  - interacting examples/classes;
  - management/monitoring language;
  - route/form/population caveats.
- `confidence real`
- primary key `(candidate_id, kg_chunk_id, support_type)`

These links should drive the AI decision trace and reviewer UI. Coverage counts alone are insufficient.

### Candidate table additions

Modify `pubmed_interaction_candidate`:

- `interaction_action_category text`
  - `no_known_interaction`
  - `no_action_needed`
  - `monitor_therapy`
  - `consider_therapy_modification`
  - `avoid_combination`
- `ai_decision_trace jsonb not null default '{}'::jsonb`
  - monograph and PubMed chunk-level evidence assessments used by AI review/extraction;
  - retrieval notes;
  - final rationale summary;
  - uncertainty/limitations.
- `full_text_processed boolean not null default false`
- `full_text_evidence_count integer not null default 0`
- `evidence_summary jsonb not null default '{}'::jsonb`
  - monograph support summary;
  - PubMed support summary;
  - source conflicts/silence;
  - final evidence hierarchy decision.
- `applicability jsonb not null default '{}'::jsonb`
  - human/animal/in-vitro
  - route
  - dose
  - population
  - timing
  - quantitative effect values

---

## Extraction Strategy

### Stage 0: Monograph interaction context

Before PubMed extraction or re-review, build the monograph context for each candidate pair.

Inputs:

- resolved source and target graph nodes;
- active ingredient expansion through `has_ingredient`;
- CPS monograph coverage and related CPS product/brand/generic monographs;
- Health Canada product monograph coverage and related DPD products.

Steps:

1. Expand each resolved node to active ingredient(s) and clinically relevant class ancestors.
2. Retrieve CPS monograph chunks for direct and linked monographs, prioritizing sections whose title
   matches `Drug Interactions` or equivalent interaction terminology.
3. Retrieve Health Canada product monograph chunks with section
   `health_canada_product_monograph_drug_interactions`.
4. Keep product provenance attached: source, node id, CPS id or DIN/drug code, brand/generic/product
   name, monograph date where available, section, chunk id, and source URL when available.
5. Extract structured pathway facts:
   - enzyme/transporter/receptor;
   - inducer/inhibitor/substrate/agonist/antagonist role;
   - examples and interacting classes;
   - management/monitoring language;
   - route/form/population caveats.
6. Classify monograph support for the pair:
   - direct pair named;
   - class/pathway support;
   - mechanism-only support;
   - monograph silent;
   - contradiction/limitation.
7. Store candidate-to-monograph evidence links and include them in `ai_decision_trace`.

Acceptance criteria:

- Reviewer UI can show exact CPS and Health Canada `Drug Interactions` chunks used by AI review.
- AI re-review can state whether monographs support, narrow, contradict, or are silent on the PubMed
  candidate.
- PubMed-only evidence cannot enter the publish queue without this monograph context being visible or
  explicitly marked unavailable.

### Stage A: Abstract triage remains

Keep current pipeline:

```sh
pnpm seed:pubmed:harvest:batch
pnpm seed:pubmed:extract:batch
pnpm seed:pubmed:stage
```

But treat the output as triage, not final evidence quality.

### Stage B: Full-text discovery

For each harvested PMID:

1. Query NCBI ID Converter / ELink to find PMCID.
2. Query PMC OA service to determine whether reusable full text is available.
3. Store availability/license metadata in `pubmed_article_full_text`.

Acceptance criteria:

- Each PMID gets one full-text metadata row.
- Failures are recorded and resumable.
- No candidate extraction depends on full text being available for every article.

### Stage C: Full-text acquisition

Priority order:

1. PMC OA JATS XML.
2. PMC OA downloadable package with XML assets.
3. PDF fallback only when license permits and XML is unavailable.
4. Publisher HTML/PDF only if terms allow text mining and storage of derived chunks.

For MVP, implement **PMC OA JATS XML only**. Add PDF/HTML later.

Acceptance criteria:

- Can download and parse JATS XML for a sample PMCID.
- Does not store raw full text permanently by default.
- Can re-fetch by PMCID/source URL if needed.

### Stage D: JATS section parsing

Parse:

- title
- abstract
- body sections
- paragraph text
- table wraps
- figures and captions
- supplementary material links when present
- references only for metadata/context, not as interaction evidence by default

Represent parsed article as an internal type:

```ts
interface ParsedFullTextArticle {
  pmid: string;
  pmcid: string;
  title: string;
  license?: string;
  sections: ParsedSection[];
  tables: ParsedTable[];
  figures: ParsedFigure[];
  supplements: ParsedSupplement[];
}
```

### Stage E: Evidence chunk selection

Use a cheap deterministic filter before LLM calls.

Interaction keyword classes:

- `interaction`, `interact`, `coadministration`, `co-administered`
- `CYP`, `CYP3A4`, `CYP2D6`, `UGT`, `P-gp`, `BCRP`, `OATP`
- `inhibitor`, `inducer`, `substrate`
- `AUC`, `Cmax`, `Tmax`, `half-life`, `clearance`
- `contraindicated`, `avoid`, `dose adjustment`, `monitor`
- `pharmacokinetic`, `pharmacodynamic`

Drug/entity signal:

- match known drug names/classes from existing `kg_node` and synonyms where feasible;
- also allow unknown/investigational names so we do not miss new entities.

Chunk inclusion rules:

- Include all abstract chunks.
- Include paragraphs with interaction/drug signal.
- Include tables with interaction/drug/PK signal in title, caption, headers, row labels, footnotes, or cells.
- Include figure captions with interaction/drug/PK signal.
- Include nearby paragraph context around relevant tables/figures.

### Stage F: Structured table extraction

For JATS `table-wrap`:

- Extract table label/title/caption.
- Extract column headers, row headers, body rows, footnotes.
- Preserve merged cell context where possible.
- Convert each relevant row into structured evidence JSON.

Example structured table chunk:

```json
{
  "tableLabel": "Table 2",
  "caption": "Effect of coadministration on pharmacokinetic parameters",
  "columns": ["Treatment", "AUC ratio", "Cmax ratio", "90% CI"],
  "rows": [
    {
      "rowIndex": 1,
      "cells": {
        "Treatment": "Drug A + ketoconazole",
        "AUC ratio": "2.4",
        "Cmax ratio": "1.8",
        "90% CI": "1.9-3.0"
      }
    }
  ],
  "footnotes": ["Values are geometric mean ratios"]
}
```

LLM prompt should receive table JSON, not only flattened text.

### Stage G: Selective figure/graph processing

Do not run vision on every image.

First pass relevance filter:

- figure caption/title mentions drugs, PK/PD, concentration, exposure, AUC, Cmax, hazard ratio, odds ratio, interaction, metabolism, inhibitor/inducer/substrate;
- nearby text references an interaction-relevant result;
- abstract/staged candidate mentions evidence likely shown in figures.

Vision prompt should ask for:

- chart type;
- x/y axes and units;
- drugs/groups/interventions compared;
- direction and approximate magnitude of effect;
- whether the figure supports a drug-drug or drug-class interaction;
- limitations/uncertainty;
- exact figure label/caption provenance.

Do not ask the vision model to invent numeric precision from plots. It can estimate trends/magnitude unless the figure itself prints numeric values.

### Stage H: Full-text candidate extraction

Add a new extractor that consumes selected evidence chunks.

Output shape should include:

```ts
interface FullTextInteractionCandidate {
  pmid: string;
  pmcid?: string;
  articleTitle: string;
  articleYear?: number;
  subjectText: string;
  objectText: string;
  severity: InteractionSeverity;
  actionCategory:
    | "no_known_interaction"
    | "no_action_needed"
    | "monitor_therapy"
    | "consider_therapy_modification"
    | "avoid_combination";
  mechanism?: string;
  management?: string;
  evidenceLevel?: string;
  extractionConfidence: number;
  evidenceChunkRefs: Array<{
    chunkId: string;
    supportType: string;
    quote?: string;
    confidence: number;
  }>;
  quantitativeEffects?: Array<{
    metric: string;
    value: string;
    comparator?: string;
    sourceChunkId: string;
  }>;
  applicability?: {
    evidenceContext?: "human" | "animal" | "in_vitro" | "unknown";
    route?: string;
    dose?: string;
    population?: string;
    timing?: string;
  };
  aiDecisionTrace?: {
    chunkAssessments?: Array<{
      chunkId?: string;
      supportType?: string;
      quote?: string;
      conclusion: string;
      limitation?: string | null;
    }>;
    finalRationale?: string;
    retrievalNotes?: string;
    uncertainty?: string[];
  };
}
```

Extraction rules:

- Do not extract unless evidence directly supports a concrete interaction.
- Co-use/coadministration alone is not enough.
- Therapeutic alternatives are not interactions.
- Adverse effects of one drug alone are not interactions.
- PK enzyme facts alone are not interactions unless connected to a second drug/class by evidence in the article.
- Prefer conservative severity unless article directly supports stronger severity.
- Do not promote background/related-work statements to interaction candidates unless the paper itself clearly endorses the claim and provides a traceable citation/evidence chunk.
- Assign every candidate exactly one action category:
  - `no_known_interaction` when the supplied evidence does not support a known clinically meaningful interaction.
  - `no_action_needed` when an interaction/exposure change exists but no action or monitoring is supported.
  - `monitor_therapy` when monitoring/caution is supported.
  - `consider_therapy_modification` when dose adjustment, interruption, alternative therapy, or another active change is supported.
  - `avoid_combination` when avoidance or contraindication is supported.
- Preserve an AI decision trace that identifies the chunks used, the conclusion drawn from each, relevant quotes, limitations, retrieval notes, final rationale, and uncertainty.
- Assign a publishability tier before staging:
  - `publish_queue_candidate`: direct human clinical evidence, resolved pair, specific supporting evidence, no major contradiction.
  - `needs_context`: plausible evidence but missing applicability, unclear generalization, weak management/severity, or table/figure ambiguity.
  - `likely_reject`: coadministration-only, mechanism-only, animal/in-vitro-only without clinical support, contradicted, unsupported, duplicate, or irrelevant.
- Default to `needs_context` or `likely_reject` when evidence context is narrow, preclinical, product/formulation-specific, investigational, stale, or visually inferred with uncertainty.

### Stage I: Validation/cross-check pass

Add a second AI or deterministic validation pass for full-text-derived candidates.

Validation questions:

- Were CPS and Health Canada monograph `Drug Interactions` sections checked for both resolved active ingredients?
- Do monographs support, narrow, contradict, or stay silent on the candidate pair/pathway?
- Are pathway facts extracted from monographs accurate and tied to exact chunks?
- Does the cited chunk actually support the candidate?
- Is the pair correct?
- Is the evidence human/animal/in-vitro?
- Is it clinically actionable or only mechanistic/preclinical?
- Is severity supported?
- Is management supported?
- Is the action category supported by the cited chunks?
- Are the cited chunks actually the chunks used to make the decision?
- Are there contradictions/limitations elsewhere in the article?

Failed validation outcomes:

- reject before staging;
- or stage with `ai_review_verdict = likely_reject` and explicit reason.

---

## Reviewer UI Requirements

Update the pharmacist review screen to show full-text evidence when available.

For each candidate, show:

- resolved active ingredients and linked product/brand/generic monographs for both sides;
- CPS monograph `Drug Interactions` chunks used by AI review;
- Health Canada product monograph `Drug Interactions` chunks used by AI review;
- source metadata for monograph chunks: source, node id, CPS id or DIN/drug code, product/brand/generic
  name, monograph date/provenance, section, chunk id, and source URL when available;
- extracted monograph pathway facts: enzyme/transporter/receptor, inducer/inhibitor/substrate/agonist/
  antagonist role, examples/classes, monitoring, management, and route/form/population caveats;
- whether monographs directly support, class/pathway-support, contradict/limit, or are silent on the
  PubMed candidate;
- article metadata: PMID, PMCID, title, year, journal;
- source type badges: abstract, full-text paragraph, table, figure;
- exact supporting quote(s);
- chunk IDs, section paths, support type, relevance/confidence, license, and source URL for every evidence chunk used;
- AI decision trace: chunk-by-chunk assessments, retrieval notes, final rationale, and uncertainty;
- AI action category shown with fixed color semantics:
  - green: No known interaction;
  - blue: No action needed;
  - yellow: Monitor therapy;
  - orange: Consider therapy modification;
  - red: Avoid combination;
- table rows/cells in a readable table view;
- figure caption and AI figure interpretation when used;
- quantitative effects: AUC, Cmax, HR, OR, etc.;
- applicability context: human/animal/in-vitro, dose, route, population;
- AI concerns and validation notes;
- license/source link.

Reviewer actions should remain:

- publish;
- reject with structured reason;
- mark needs more context;
- edit/confirm resolved nodes.

---

## Implementation Tasks

### Task 0: Add monograph interaction evidence context

**Objective:** Make CPS and Health Canada monograph `Drug Interactions` sections first-class evidence
for candidate AI review before PubMed full-text enrichment.

**Files:**

- Create migration for candidate-to-`kg_chunk` monograph evidence links, or generalize the existing
  candidate evidence table before shipping it.
- Modify or create seed/API code that retrieves monograph interaction chunks for resolved candidates.
- Modify AI review code to include monograph chunks and structured pathway facts in `ai_decision_trace`.
- Modify reviewer API/UI to expose exact monograph chunks and metadata.

**Steps:**

1. For each resolved candidate node, expand to active ingredient(s) through `has_ingredient`.
2. Retrieve CPS monographs and Health Canada product monographs linked to those ingredients/products.
3. Filter to `Drug Interactions` sections first, with fallback to warnings/precautions only when no
   interaction section exists.
4. Extract enzyme/transporter/receptor and inducer/inhibitor/substrate/agonist/antagonist facts.
5. Link candidate rows to the exact monograph chunks used.
6. Include monograph support status in AI review: direct support, class/pathway support, mechanism-only,
   silent, contradiction/limitation.

**Acceptance:**

- Reviewer can see the exact CPS and Health Canada monograph chunks used by AI review.
- Reviewer can see source metadata: CPS id or DIN/drug code, product/brand/generic name, section,
  date/provenance when available, and chunk id.
- AI re-review distinguishes monograph evidence from PubMed evidence.
- PubMed-only candidates are not treated as publish-queue-ready unless monograph context is visible or
  explicitly unavailable.

### Task 1: Add full-text metadata migration

**Objective:** Create `pubmed_article_full_text` to track PMID -> full-text availability and license provenance.

**Files:**

- Create: `supabase/migrations/YYYYMMDDHHMMSS_pubmed_full_text_metadata.sql`

**Steps:**

1. Write migration with table, constraints, indexes, and service-role grants.
2. Run Supabase migration lint/type generation if available.
3. Verify table shape in generated Supabase types.

**Acceptance:**

- Migration applies cleanly.
- Service role can select/insert/update rows.
- Existing candidate workflow is unaffected.

### Task 2: Add evidence chunk migrations

**Objective:** Create `pubmed_evidence_chunk` and `pubmed_candidate_evidence`.

**Files:**

- Create: `supabase/migrations/YYYYMMDDHHMMSS_pubmed_evidence_chunks.sql`

**Steps:**

1. Create evidence chunk table.
2. Create candidate-evidence link table.
3. Add FTS index on evidence content.
4. Add service-role grants.
5. Add optional authenticated read grants only if reviewer UI needs direct client access.

**Acceptance:**

- Evidence chunks can be inserted and linked to candidates.
- Deleting/rejecting candidates does not orphan candidate links.

### Task 3: Add candidate evidence columns

**Objective:** Extend `pubmed_interaction_candidate` with full-text evidence summary fields.

**Files:**

- Create: `supabase/migrations/YYYYMMDDHHMMSS_pubmed_candidate_full_text_fields.sql`

**Steps:**

1. Add `full_text_processed`, `full_text_evidence_count`, `evidence_summary`, and `applicability`.
2. Backfill safe defaults.
3. Update generated Supabase types.
4. Update API mapping in `packages/api/src/pubmedCandidates.ts`.
5. Update shared types in `packages/types/src/index.ts`.

**Acceptance:**

- Existing candidate list still loads.
- New fields are optional-safe in UI.

### Task 4: Implement PMID -> PMCID/OA discovery

**Objective:** Add a resumable discovery command that determines full-text availability for harvested PMIDs.

**Files:**

- Create: `supabase/seed/src/pubmed/full-text-discovery.ts`
- Create: `supabase/seed/src/pubmed/full-text-discovery-cli.ts`
- Modify: `package.json`
- Modify: `supabase/seed/README.md`

**Steps:**

1. Implement NCBI ID conversion/ELink lookup for PMID -> PMCID/DOI.
2. Query PMC OA service for reusable full-text package metadata.
3. Upsert `pubmed_article_full_text` rows.
4. Add checkpoint/resume file in `supabase/seed/out/`.
5. Add command: `pnpm seed:pubmed:fulltext:discover`.

**Acceptance:**

- Running command against a small PMID list writes metadata rows.
- Failures are recorded but do not stop the whole batch.
- Command respects NCBI/PMC rate limits.

### Task 5: Implement PMC OA XML fetcher

**Objective:** Download PMC OA JATS XML for available articles.

**Files:**

- Create: `supabase/seed/src/pubmed/pmc-oa-fetch.ts`
- Test: `supabase/seed/src/pubmed/pmc-oa-fetch.test.ts` or existing test convention

**Steps:**

1. Accept PMCID/OA package URL.
2. Download OA package or XML resource.
3. Extract JATS XML text.
4. Avoid permanently storing raw full text unless a debug flag is set.
5. Return XML plus source/license metadata to parser.

**Acceptance:**

- Can fetch a known PMC OA sample.
- Handles missing XML gracefully.
- Does not write raw article bodies by default.

### Task 6: Implement JATS XML parser

**Objective:** Parse sections, paragraphs, tables, figures, captions, and supplements from JATS XML.

**Files:**

- Create: `supabase/seed/src/pubmed/jats-parser.ts`
- Test: `supabase/seed/src/pubmed/jats-parser.test.ts`

**Steps:**

1. Define internal parsed article types.
2. Parse article title, abstract, body sections.
3. Preserve nested section path.
4. Parse `table-wrap` into structured tables.
5. Parse `fig` captions and image hrefs.
6. Parse supplementary material links.

**Acceptance:**

- Parser preserves section hierarchy.
- Parser returns structured tables with headers/rows/footnotes.
- Parser returns figure labels/captions/assets.

### Task 7: Implement evidence relevance selector

**Objective:** Select only interaction-relevant chunks before LLM extraction.

**Files:**

- Create: `supabase/seed/src/pubmed/evidence-selector.ts`
- Test: `supabase/seed/src/pubmed/evidence-selector.test.ts`

**Steps:**

1. Add keyword and PK/PD signal detection.
2. Add drug/synonym signal hook using known graph nodes where feasible.
3. Include nearby paragraph context for relevant tables/figures.
4. Score chunks by relevance.
5. Return selected chunks with source type and provenance.

**Acceptance:**

- Includes table rows with AUC/Cmax interaction terms.
- Excludes unrelated methods boilerplate.
- Never drops abstract entirely.

### Task 8: Persist evidence chunks

**Objective:** Store selected evidence chunks in Supabase.

**Files:**

- Create: `supabase/seed/src/pubmed/evidence-stage.ts`
- Create: `supabase/seed/src/pubmed/evidence-stage-cli.ts`
- Modify: `package.json`

**Steps:**

1. Upsert selected chunks into `pubmed_evidence_chunk`.
2. Use stable IDs or stable dedupe keys based on PMID/source_type/section/label/content hash.
3. Store structured table/figure data in `structured_content`.
4. Add command: `pnpm seed:pubmed:fulltext:evidence`.

**Acceptance:**

- Re-running does not duplicate chunks.
- Evidence chunks are queryable by PMID and source type.

### Task 9: Add full-text candidate extractor

**Objective:** Extract interaction candidates from evidence chunks, including table and figure-derived evidence.

**Files:**

- Create: `supabase/seed/src/pubmed/extract-full-text.ts`
- Create: `supabase/seed/src/pubmed/extract-full-text-cli.ts`
- Modify: `packages/validation/src/index.ts`

**Steps:**

1. Define Zod schema for full-text extraction output.
2. Prompt model with selected evidence chunks and structured tables.
3. Require `evidenceChunkRefs` for every candidate.
4. Extract quantitative effects and applicability details.
5. Add command: `pnpm seed:pubmed:extract:fulltext`.

**Acceptance:**

- Extractor refuses unsupported candidates.
- Extracted candidates reference chunk IDs.
- Table-derived quantitative values are preserved.

### Task 10: Add extraction validation pass

**Objective:** Validate that each candidate is supported by its cited chunks.

**Files:**

- Create: `supabase/seed/src/pubmed/validate-full-text-candidates.ts`
- Create: `supabase/seed/src/pubmed/validate-full-text-candidates-cli.ts`

**Steps:**

1. Load candidate + referenced chunks.
2. Ask model to classify support strength and concerns.
3. Explicitly classify false-positive risk: coadministration-only, mechanism-only, background-only, adverse-effect-only, wrong comparator, wrong dose/route/population, animal/in-vitro-only, product-specific overgeneralization, contradicted/limited evidence, duplicate/stale evidence.
4. Assign or revise publishability tier: `publish_queue_candidate`, `needs_context`, or `likely_reject`.
5. Mark weak candidates as likely reject or skip staging.
6. Store validation notes in `ai_review` or `evidence_summary`.

**Acceptance:**

- Unsupported candidates are not silently staged as normal candidates.
- Mechanism-only or coadministration-only findings are routed to `likely_reject` unless direct interaction evidence exists.
- Animal/in-vitro/special-population/product-specific evidence is not generalized into broad checker warnings without explicit review.
- Contradictions and limitations appear in validation output.
- Validation output appears in reviewer queue.

### Task 11: Link evidence when staging candidates

**Objective:** Stage full-text candidates and link them to evidence chunks.

**Files:**

- Modify: `supabase/seed/src/pubmed/stage.ts`
- Modify: `supabase/seed/src/pubmed/stage-cli.ts`

**Steps:**

1. Extend staging input to accept evidence refs.
2. Upsert `pubmed_interaction_candidate` as today.
3. Insert `pubmed_candidate_evidence` rows after candidate upsert.
4. Update `full_text_processed` and `full_text_evidence_count`.

**Acceptance:**

- Full-text candidate shows linked evidence rows.
- Abstract-only staging still works.

### Task 12: Implement selective figure vision pipeline

**Objective:** Interpret relevant figures/graphs without processing every image.

**Files:**

- Create: `supabase/seed/src/pubmed/figure-relevance.ts`
- Create: `supabase/seed/src/pubmed/figure-vision.ts`
- Create: `supabase/seed/src/pubmed/figure-vision-cli.ts`

**Steps:**

1. Filter figures by caption/nearby text relevance.
2. Fetch figure assets from PMC OA package.
3. Run vision model only on relevant figures.
4. Store interpretation as `source_type = 'figure_interpretation'` evidence chunks.
5. Include explicit uncertainty and no invented numeric precision.

**Acceptance:**

- Relevant PK/PD figures produce evidence chunks.
- Irrelevant microscopy/flow diagrams are skipped.
- Vision errors do not fail article processing.

### Task 13: Update reviewer API mapping

**Objective:** Expose monograph and PubMed candidate evidence chunks to the review UI.

**Files:**

- Modify: `packages/api/src/pubmedCandidates.ts`
- Modify: `packages/types/src/index.ts`

**Steps:**

1. Add API method to fetch candidate evidence by candidate IDs.
2. Include CPS and Health Canada monograph evidence links/chunks in candidate detail or queue response.
3. Include PubMed evidence chunks in candidate detail or queue response.
4. Include monograph extracted facts and support status.
5. Include `interactionActionCategory` and `aiDecisionTrace`.
6. Preserve backward compatibility for candidates without full-text evidence or legacy AI reviews.

**Acceptance:**

- Reviewer queue can show candidate with zero or many monograph and PubMed evidence chunks.
- API response includes source type, quote/content, structured table/figure data.
- API response includes monograph source metadata, section, product/brand/generic context, and chunk id.
- API response includes action category and AI decision trace with legacy fallbacks.

### Task 14: Update pharmacist review UI

**Objective:** Display monograph and full-text evidence in an actionable, pharmacist-friendly way.

**Files:**

- Modify: `apps/mobile/app/review/interactions.tsx`
- Modify or create UI components under `apps/mobile/components/` if present

**Steps:**

1. Add evidence section to candidate detail cards.
2. Render CPS and Health Canada monograph `Drug Interactions` chunks first.
3. Show monograph extracted pathway facts and support status.
4. Render PubMed paragraph/quote chunks.
5. Render table evidence as readable rows/cells.
6. Render figure evidence as caption + AI interpretation + uncertainty.
7. Show applicability/quantitative effects.
8. Show source/license links.
9. Show all linked chunks, not just the first few, with chunk IDs and metadata.
10. Show AI action category using the fixed green/blue/yellow/orange/red categories.
11. Show the AI decision trace separately from the raw evidence list.

**Acceptance:**

- Pharmacist can see exactly why a candidate was extracted.
- Pharmacist can see which monograph and PubMed chunks the AI used to make its decision and what conclusion was drawn from each chunk.
- Pharmacist can assess whether the AI category is supported by the cited evidence.
- Table rows are readable on mobile/web.
- Missing full-text evidence does not break existing cards.

### Task 15: Add docs and runbook

**Objective:** Document the upgraded pipeline and operational workflow.

**Files:**

- Modify: `supabase/seed/README.md`
- Modify: `PUBMED_PIPELINE_BOOKMARK.md`
- Modify: `PHARMACIST_REVIEW_HANDOFF.md`

**Steps:**

1. Add commands in intended order.
2. Document environment variables and rate limits.
3. Document license behavior and storage policy.
4. Document how pharmacists should interpret full-text evidence.

**Acceptance:**

- New developer can run discovery -> fetch -> evidence -> extract -> stage.
- Pharmacist handoff accurately states that full-text evidence is available when present.

---

## Suggested Command Flow

Initial abstract triage:

```sh
NCBI_EMAIL=you@example.com \
NCBI_TOOL=clinrx \
PUBMED_MAX_RESULTS=1000 \
pnpm seed:pubmed:harvest:batch

PUBMED_EXTRACT_MAX_ARTICLES=1000 \
PUBMED_EXTRACT_TOKEN_BUDGET=250000 \
pnpm seed:pubmed:extract:batch

pnpm seed:pubmed:stage
```

New full-text enrichment:

```sh
pnpm seed:pubmed:fulltext:discover
pnpm seed:pubmed:fulltext:evidence
pnpm seed:pubmed:extract:fulltext
pnpm seed:pubmed:fulltext:validate
pnpm seed:pubmed:stage:fulltext
pnpm seed:pubmed:resolve
pnpm seed:pubmed:monograph:evidence
PUBMED_AI_REVIEW_STALE_ONLY=true pnpm seed:pubmed:review:ai
```

`seed:pubmed:extract:fulltext` should be run in deliberate batches because it makes one model call per evidence-bearing PMID. The extractor skips a PMID when the model returns malformed or schema-invalid structured output, appends that event to `out/pubmed-fulltext-extract-errors.jsonl`, checkpoints completed PMIDs in `out/pubmed-fulltext-extract.checkpoint.json`, writes the kept candidates to `out/pubmed-fulltext-candidates.json`, and the validation step rejects unsupported candidates before staging.

Optional figure pass:

```sh
PUBMED_FIGURE_VISION=true \
PUBMED_FIGURE_VISION_MAX=100 \
pnpm seed:pubmed:figures:vision
```

---

## Testing Strategy

Unit tests:

- PMID -> PMCID/OA response parsing.
- JATS section parser.
- JATS table parser.
- Evidence relevance selector.
- Evidence chunk dedupe key generation.
- Full-text extraction output schema validation.

Integration tests:

- Process one known PMC OA article fixture end-to-end.
- Verify evidence chunks are staged.
- Verify table evidence remains structured.
- Verify candidates link to evidence chunks.
- Verify abstract-only path still works.

Manual QA:

- Pick 5-10 known drug interaction full-text articles.
- Confirm tables/figures are captured when clinically relevant.
- Confirm irrelevant figures are skipped.
- Confirm pharmacist UI shows exact evidence.

---

## Safety and Quality Gates

Do not publish candidate edges unless:

- both subject/object entities are resolved to coherent graph nodes;
- at least one evidence chunk supports the claim;
- evidence source is visible to pharmacist;
- pharmacist explicitly publishes in the current MVP/manual-gate phase, or the candidate passes a future calibrated automation threshold with evidence trace and audit logging.

Automatically downgrade or flag candidates when:

- evidence is animal/in-vitro only;
- effect is purely theoretical;
- table value is ambiguous;
- figure interpretation is uncertain;
- source is old/stale;
- candidate is product-specific but resolved to a broad ingredient/class without review.

---

## Rollout Plan

Phase 1 — Metadata + PMC OA XML text:

- Add full-text metadata table.
- Discover PMC OA availability.
- Parse paragraphs and tables from XML.
- Store evidence chunks.

Phase 2 — Full-text extraction and evidence linking:

- Extract candidates from selected chunks.
- Link candidates to evidence.
- Add validation pass.

Phase 3 — Reviewer UI evidence display:

- Show paragraphs/tables/quantitative effects.
- Add applicability and source/license display.

Phase 4 — Selective figure/graph vision:

- Add relevance filter.
- Interpret only likely-useful figures.
- Store figure interpretations as evidence chunks.

Phase 5 — PDF/supplement fallback:

- Only after PMC OA XML path is stable.
- Add PDF/table extraction where license permits.
- Add supplement parsing for high-value article types.

---

## Open Questions

1. Should full-text extraction be mandatory before a candidate can become `likely_publishable`, or should abstract-only candidates remain publishable when evidence is strong?
2. Should we store evidence chunks in `kg_chunk` directly, or keep PubMed evidence in `pubmed_evidence_chunk` and only publish final interactions to `kg_edge`?
   - Recommendation: keep PubMed evidence separate for now, then mirror into `kg_chunk` later if GraphRAG needs it.
3. Which vision provider/model should be used for figure interpretation?
4. How much figure processing budget should be allowed per batch?
5. Should we ingest non-OA publisher full text if accessible but not reusable?
   - Recommendation: no persistent text storage unless terms explicitly allow it; extract transiently only if legally safe.
6. Should pharmacist UI allow marking evidence chunks as useful/not useful for future model feedback?
   - Recommendation: yes, eventually.

---

## Definition of Done

This project is done when:

- For PMIDs with PMC OA full text, the pipeline can discover, fetch, parse, and process full text.
- Relevant paragraphs, table rows/cells, and selected figure interpretations are stored as evidence chunks.
- Full-text-derived candidates cite exact evidence chunks.
- Pharmacists can review the evidence chunks before publish/reject decisions.
- Pharmacists can see the AI decision trace: chunks used, metadata, quotes, conclusions, limitations, retrieval notes, and uncertainty.
- Every interaction/candidate is categorized into one of: No known interaction, No action needed, Monitor therapy, Consider therapy modification, Avoid combination.
- Calibration metrics can measure whether AI retrieval, resolution, and categorization agree with pharmacist review.
- Existing abstract-only PubMed workflow still works.
- No entire article bodies are persisted by default.
- License/provenance metadata is stored for every full-text source.
