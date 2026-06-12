# PubMed Interaction Pipeline Bookmark

Status as of 2026-06-12.

## What Exists

- Batch PubMed harvest with pagination, retry/backoff, checkpoint/resume, and NCBI request delays.
- Offline extraction/review defaults to Claude Code CLI, with token budget stops, request timeouts, checkpoint/resume, retries, and per-article logs. Direct Anthropic API mode remains available only when explicitly requested with `PUBMED_CLAUDE_PROVIDER=api`.
- Staging into `pubmed_interaction_candidate`.
- Auto-resolution against current graph nodes.
- AI pre-review using Claude Opus 4.8 by default.
- Offline PubMed seed extraction/review can route model calls through Claude Code CLI with `PUBMED_CLAUDE_PROVIDER=cli` (default for seed scripts after 2026-06-11). This is seed/offline-only; app/runtime/deployed paths continue to use their normal Anthropic API integration.
- AI review supports `PUBMED_AI_REVIEW_STALE_ONLY=true` so candidates are re-reviewed only when linked monograph/full-text evidence is newer than their last AI review, or when they have never been reviewed.
- Human reviewer queue showing AI verdict, score, concerns, evidence assessment, severity assessment, and recommended rejection reason.
- Runtime interaction evaluation pipeline is now the target pharmacist workflow: review cards are drug-pair checker requests with resolved entities, retrieved monograph/PubMed evidence, AI answer category, evidence trace, and pharmacist labels for retrieval/entity/interpretation/final-category quality.
- New runtime evaluation tables are defined in `supabase/migrations/20260611120000_interaction_runtime_evaluation.sql`, and `pnpm seed:pubmed:evaluation:runtime-sample` projects current PubMed candidate evidence into request-time calibration cards without model calls.
- The deployed `check-interactions` edge function now captures live request-time checker calls into the same runtime evaluation schema when called with `captureEvaluation: true`. It writes one evaluation request per input node pair, appends a new run for each checker call, and stores the returned published KG edge or source-silent result as evidence.
- Runtime evidence retrieval is now implemented without LLM calls. During evaluation capture, the checker retrieves bounded indexed evidence for each pair: CPS Drug Interactions/fallback safety chunks, Health Canada product-monograph Drug Interactions/fallback safety chunks, and already-staged PubMed candidate/full-text evidence for matching resolved graph scopes. These chunks are written to `interaction_evaluation_evidence` with source metadata and deterministic extracted pathway/management facts.
- Runtime capture is no longer on the critical path by default: app calls use `evaluationCaptureMode: "async"`, and the edge function schedules evaluation writes behind the response. Synchronous capture remains available for smoke tests with `evaluationCaptureMode: "sync"`.
- The current checker has a versioned pair-result cache in `interaction_checker_result_cache`. Published-KG cache entries are keyed by sorted node-pair fingerprint, graph version, and retrieval strategy; the graph version is bumped automatically on `kg_edge` mutations.
- Online AI-powered runtime answers are implemented in the deployed `check-interactions` edge function behind `useAiInference: true`. The default app mode is `aiInferenceMode: "on_miss_or_uncertain"`: deterministic published-KG hits skip the model, while missing deterministic answers can call the Anthropic API over already-indexed CPS/Health Canada/PubMed evidence.
- Runtime AI answers use `engine = 'ai_evidence_inference'` in `interaction_checker_result_cache`, keyed by pair fingerprint, graph version, evidence version, retrieval strategy, prompt version, and model. The evidence version is bumped when indexed monograph/PubMed evidence tables change, so request-time AI answers can be cached without live PubMed fetching.
- Runtime AI decision traces store the model, prompt version, retrieval strategy version, final rationale, confidence, used evidence IDs, and the exact prompt evidence rows the model saw. Evaluation capture writes those prompt evidence rows to `interaction_evaluation_evidence` and marks `used_in_answer` from the AI trace.
- Runtime/deployed AI uses the Anthropic API. Offline PubMed seed extraction/review remains routed through Claude Code CLI by default. Do not move app/runtime inference to the CLI.
- Claude Opus 4.8 rejects non-default sampling parameters; the runtime Anthropic request intentionally omits `temperature` and relies on prompt constraints plus structured validation.
- Calibration can now run a five-model RuntimeAI panel for the same request evidence: Opus 4.8 (`claude-opus-4-8`), Sonnet 4.6 (`claude-sonnet-4-6`), Haiku 4.5 (`claude-haiku-4-5-20251001`), GPT-5.5 (`gpt-5.5`), and GPT-5.4 mini (`gpt-5.4-mini`). The normal checker remains single-answer; the model panel is opt-in through `calibrationModelPanel: true` or `pnpm calibration:model-panel`. OpenAI runs require `OPENAI_API_KEY`.
- Model-panel calibration stores each model answer as a separate `interaction_evaluation_run` for the same request, with per-run evidence rows and per-run pharmacist labels.
- Runtime AI traces now include per-model `latencyMs`. Model-panel failures or malformed structured output are captured as `failed` evaluation runs with `runtimeStatus: "failed"`, `runtimeError`, preserved prompt evidence, and latency, instead of disappearing from model comparison. RuntimeAI uses forced structured output when available, accepts JSON/fenced-JSON fallback, and uses short prompt evidence IDs (`E1`, `E2`, etc.) while preserving original source/chunk IDs in metadata. It does not synchronously retry invalid structured output by default, so calibration latency reflects first-pass runtime behavior.
- The local app checker sends live captures to `interaction-runtime-live-calibration`; the first seeded pharmacist calibration set remains `interaction-runtime-calibration-2026-06-11` with 80 request cards and 339 evidence rows.
- Reviewer queue shows Health Canada product monograph coverage for resolved nodes through `get_health_canada_monograph_coverage`: direct product coverage for product nodes, and linked monograph-backed DPD products for ingredient/class nodes.
- Reviewer rejections feed back into suppression and future extraction prompts.
- Remote processed-PMID ledger in `pubmed_processed_article`, so already processed PubMed articles are skipped even if local checkpoints are reset.
- Extraction repairs missing citation arrays before validation; malformed AI-review JSON is marked `needs_human_review` instead of stopping the run. Full-text extraction skips a PMID when the model returns malformed/schema-invalid output instead of aborting the whole batch, checkpoints completed PMIDs in `out/pubmed-fulltext-extract.checkpoint.json`, and appends malformed-output records to `out/pubmed-fulltext-extract-errors.jsonl`.
- Rejection taxonomy includes `stale_outdated_data`; review UI shows article publication year.

## Current Run Results

Current larger run:

- 968 PubMed PMIDs fetched
- 962 abstract-bearing articles harvested
- 491 articles processed through extraction
- 907 interaction candidates staged in Supabase
- 887 candidates AI-reviewed; 20 full-text candidates remain unreviewed because both Claude Code CLI and Anthropic API review calls currently report insufficient credit balance
- 491 PMIDs recorded in the remote processed-article ledger
- 962 PMIDs checked for full-text availability
- 397 PMC OA articles processed for full-text evidence chunks
- 3,523 full-text evidence chunks staged across 396 PMIDs
- 535 candidates currently have linked full-text evidence, with 1,307 `pubmed_candidate_evidence` links
- Full-text extraction checkpoint: 365 of 396 evidence-bearing PMIDs completed, 31 pending, 30 malformed/schema-invalid model outputs logged and skipped in `supabase/seed/out/pubmed-fulltext-extract-errors.jsonl`

AI review split:

- 64 likely publishable
- 553 needs human review
- 270 likely reject
- 20 unreviewed due Claude/API credit exhaustion

AI review model split:

- 134 reviewed via `claude-cli:opus`
- 751 reviewed via `claude-opus-4-8`
- 2 reviewed via `claude-opus-4-7`
- 20 unreviewed

Processed article split:

- 240 with extracted candidates
- 250 no candidates
- 1 failed

CPS/CaaS and monograph context:

- CPS monographs are ingested server-side: 794 records, 11,987 chunks, 305 synonyms.
- DPD product listings are fully ingested: 10,926 of 10,926 DPD keyrefs.
- The final throttled retry/continuation from offset `9700` completed without `401` failures. The earlier partial `9700-9800` file with 16 records and 84 HTTP `401` failures was not ingested.
- DPD `0-3100` has been backfilled/re-ingested so products have derived ingredient nodes, `has_ingredient` edges, aliases, and complete product metadata under the corrected model.
- Health Canada DPD API ingest is complete for core fields, and CPS ↔ Health Canada DPD crosswalk is populated: 8,649 matched, 1,817 possible matches, 414 source-conflict rows.
- Health Canada NOC/NOCc, Summary Reports, and product monograph context are ingested. Product monographs currently contribute `150,822` chunks under `HEALTH_CANADA_PRODUCT_MONOGRAPH` from 4,375 accepted monograph records in the processed DPD snapshot range, with seven quarantined validation failures.
- Keep CaaS retries serialized and throttled: `CPS_EXPORT_CONCURRENCY=1`, `CPS_REQUEST_DELAY_MS=1500` or slower.
- Candidate monograph evidence currently has 163 links across 64 candidates: 116 CPS monograph links and 47 Health Canada product monograph links.
- Full-text availability split: 513 not available, 397 PMC OA available and processed, 31 PMC non-OA, 21 failed.

Earlier pilot reference:

- 100 PubMed PMIDs fetched
- 99 abstracts harvested
- 65 articles extracted before the 50k estimated input-token budget stopped the run
- 52 interaction candidates produced
- 52 candidates staged and AI pre-reviewed

## Important Caveat

Current graph resolution is improving but still not ready for production review volume. The latest normalization and resolver-quality pass added reviewed ingredient/class aliases, exact cross-source ingredient equivalence, salt/base ingredient equivalence, safer multi-ingredient product handling, ingredient-like Health Canada ATC class cleanup, and report categories for combination/NHP/investigational mentions. 150 candidate rows currently have both sides resolved in the database, 255 have one side resolved, and 502 are fully unresolved. Remaining unresolved/needs-review sides are dominated by investigational/non-Canadian entities, NHP-like substances, combination mentions, and generic/code-name unmatched entities.

Candidate counts are inflated by duplicate-like rows from full-text staging: the latest strict audit before the current full-text batch found 64 duplicate-like `PMID + normalized_pair_key` groups covering 75 extra rows. Staging now dedupes future input rows by `PMID + normalized_pair_key` and reuses an existing row for that article/pair when present, but existing duplicates still need a deliberate cleanup pass before treating total candidate count as a precise unique-interaction count.

Latest top-250 resolution audit:

- side statuses after clinical normalization and unresolved-entity flagging: 182 already resolved, 33 auto-ready, 109 need review, 176 unmatched
- unresolved review flags in the top-250 report: 44 possible investigational/non-Canadian/code-name sides, 132 unmatched entity sides, and 14 ingredient-like class-match sides
- frequent unmatched/new entities include aficamten, tolfenpyrad, D-1553/garsorasib, olorofim, cedirogant, leritrelvir, and other new/investigational products
- frequent needs-review entities include paroxetine, ritonavir, alcohol, and remaining salt/form/source-coverage ambiguities
- Health Canada ATC therapeutic-class rows can look like specific ingredients. The DPD ingest now suppresses class nodes when the ATC label exactly matches a known active ingredient, attaches ATC codes to ingredient metadata, and the stale pseudo-class nodes were removed. Ingredient-like ATC labels with no matching active-ingredient row remain review-only rather than auto-resolved.
- The `CLINRX_NORMALIZATION` seed adds reviewed aliases/classes for high-frequency mentions including rifampicin/rifampin/RIF, irinotecan/CPT-11, DOACs, immunosuppressants, azoles, SSRIs, NSAIDs, CYP3A/P-gp inhibitors and inducers, and selected ingredient-like ATC labels.

Use the runtime interaction evaluation page now for precision assessment and pharmacist workflow calibration. The PubMed candidate queue is still useful for evidence discovery and debugging, but the primary review unit is now: drug-pair request -> resolved entities -> retrieved evidence -> AI answer -> pharmacist label. Publishing edges should wait until both sides of a request resolve reliably to coherent Canadian graph nodes, including CPS-covered nodes and Health Canada-sourced gap-filling nodes where CPS has no record.

The live runtime answer is now two-tiered: deterministic published-KG lookup first, then optional online AI inference over indexed evidence for missing/uncertain answers. Runtime captures show whether the answer source was deterministic KG or RuntimeAI, and RuntimeAI captures include the exact prompt evidence rows used for the answer.

Latency contract:

- Deterministic published-KG hits should return before evaluation capture finishes and should not call the LLM in the default `on_miss_or_uncertain` mode.
- Current deterministic cache hits avoid the recursive published-KG lookup entirely for repeated pairs until the graph version changes or the cache TTL expires.
- Runtime AI should run deterministic KG lookup first, use the already-implemented indexed CPS/Health Canada/PubMed retrieval layer, call the online LLM only for missing/conflicting/low-confidence answers, and cache final AI answers by pair + evidence version + prompt/model version.
- Runtime must not fetch/process broad PubMed live. PubMed fetching/extraction remains an offline ingestion job.

Resolution target rule: publish PubMed interaction edges to the most general clinically correct node. Prefer `ingredient` nodes, use `drug_class` nodes for class-wide interactions, and use DPD product nodes only when the evidence is product-specific. Product nodes inherit ingredient/class interactions through `has_ingredient` and `subclass_of` expansion.

Production pharmacist review should wait until the reviewer UI includes the remaining enrichment context from MedEffect/safety alerts, NHP data, route/form/salt normalization, source coverage/conflict warnings, and resolution confidence. Health Canada DPD, NOC/NOCc, Summary Reports, and product-monograph coverage are now ingested; product-monograph coverage is visible for resolved review nodes. Before the remaining context is visible, pharmacist sessions are calibration only.

## Resume Commands

Continue current harvest:

```sh
PUBMED_EXTRACT_DRY_RUN=true PUBMED_EXTRACT_START_INDEX=500 PUBMED_EXTRACT_MAX_ARTICLES=250 pnpm seed:pubmed:extract:batch
PUBMED_EXTRACT_START_INDEX=500 PUBMED_EXTRACT_MAX_ARTICLES=250 PUBMED_EXTRACT_TOKEN_BUDGET=600000 PUBMED_EXTRACT_ERROR_LIMIT=20 pnpm seed:pubmed:extract:batch
pnpm seed:pubmed:stage
PUBMED_AI_REVIEW_LIMIT=120 pnpm seed:pubmed:review:ai
```

Refresh monograph/full-text evidence and review only affected candidates:

```sh
pnpm seed:pubmed:resolve
PUBMED_MONOGRAPH_EVIDENCE_LIMIT=500 pnpm seed:pubmed:monograph:evidence
PUBMED_AI_REVIEW_STALE_ONLY=true PUBMED_AI_REVIEW_LIMIT=100 pnpm seed:pubmed:review:ai
```

Continue full-text enrichment:

```sh
pnpm seed:pubmed:fulltext:discover
PUBMED_FULLTEXT_EVIDENCE_LIMIT=500 pnpm seed:pubmed:fulltext:evidence
PUBMED_CLAUDE_PROVIDER=cli PUBMED_FULLTEXT_EXTRACT_LIMIT=25 pnpm seed:pubmed:extract:fulltext
pnpm seed:pubmed:fulltext:validate
pnpm seed:pubmed:stage:fulltext
PUBMED_CLAUDE_PROVIDER=cli PUBMED_AI_REVIEW_STALE_ONLY=true PUBMED_AI_REVIEW_LIMIT=100 pnpm seed:pubmed:review:ai
```

The full-text extraction checkpoint is active at 365 completed evidence-bearing PMIDs. The next `seed:pubmed:extract:fulltext` run starts after PMID `42092736` unless new evidence chunks are added before then. Stale-only AI review is paused with 20 unreviewed candidates until Claude/API credit is replenished.

Useful follow-ups:

- Review a small sample of the likely publishable and sample-for-audit candidates for precision and workflow calibration.
- Run `pnpm seed:pubmed:evaluation:runtime-sample` when a refreshed request-time calibration sample should be generated from the current PubMed candidate/evidence tables.
- Invoke the app checker with `useAiInference: true` to populate `interaction-runtime-live-calibration` with actual request-time checker runs, including RuntimeAI traces for missing deterministic answers.
- Populate model-comparison calibration runs deliberately, in small batches, with `INTERACTION_EVALUATION_SET_ID=<set id> INTERACTION_MODEL_PANEL_LIMIT=<n> pnpm calibration:model-panel`. This makes up to three model calls per request unless cache entries already exist.
- CPS DPD ingestion is complete; rerun downstream crosswalk/resolution after future importer or data-model changes.
- After additional CPS product vocabulary is ingested, rerun `pnpm seed:pubmed:resolve`.
- After DPD completion or DPD backfill, verify likely-publishable candidates resolve to ingredients/classes rather than manufacturer product variants.
- Add MedEffect/safety alerts, NHP data, route/form/salt normalization, and stronger resolution-confidence UI before relying on review volume for production coverage.
- Use Health Canada DPD both to validate CPS/CaaS DPD and to fill Canadian drug/product gaps absent from CPS, while normalizing both sources into the same product/ingredient/class graph contract.
- Add review UI warnings/filters for safety alert present, stale evidence, NHP involved, route/form mismatch, conditional approval/NOCc context, CPS-covered vs Health Canada-only source coverage, source conflicts, product-level match, and low-confidence resolution before pharmacist production review.
- Build reviewer metrics: publish rate, reject reasons, auto-resolution rate, AI verdict precision.

## Files To Remember

- `supabase/seed/src/pubmed/harvest-batch-cli.ts`
- `supabase/seed/src/pubmed/extract-batch-cli.ts`
- `supabase/seed/src/pubmed/stage.ts`
- `supabase/seed/src/pubmed/ai-review.ts`
- `apps/mobile/app/review/interactions.tsx`
- `supabase/seed/out/` contains ignored local run outputs.
