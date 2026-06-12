# ClinRx

Monorepo for the ClinRx landing page and student pharmacy app.

## Structure

- `landing/` - static GitHub Pages landing page
- `apps/mobile/` - Expo app for iOS, Android, web, and PWA
- `packages/types/` - shared TypeScript domain types
- `packages/validation/` - shared Zod schemas
- `packages/api/` - Supabase client and data-access functions
- `packages/core/` - platform-agnostic business logic
- `supabase/` - migrations, functions, and ingest jobs
- `powersync/` - PowerSync Cloud config for Development and Production

Voice features use ElevenLabs Conversational AI in v1 behind provider-neutral contracts in `packages/core/voice`.

## Current Data Status

As of 2026-06-10:

- CPS/CaaS API access is confirmed via server-side `CPS_API_EMAIL` and `CPS_API_KEY`.
- CPS monographs are ingested server-side: 794 records, 11,987 chunks, and 305 synonyms.
- CPS/CaaS DPD product listings are fully ingested: `10926` of `10926` DPD keyrefs.
- CPS Therapeutic Choices condition guidance is ingested from CaaS `CONDITION_TC`: 136 topics, 5,405 chunks, and 34 synonyms. Four manifest keyrefs currently return CaaS `404` and were skipped.
- CPS Minor Ailments condition guidance is ingested from CaaS `CONDITION_MA`: 74 topics, 2,832 chunks, and 40 synonyms. Five manifest keyrefs currently return CaaS `404` and were skipped.
- CPS patient medication information is captured inside monograph chunks when monographs contain patient-information sections. It is not yet a separately exported CPS patient-information corpus.
- The final throttled retry/continuation from offset `9700` completed without `401` failures. The earlier partial `9700-9800` file with 16 records and 84 HTTP `401` failures was not ingested.
- The already-ingested DPD `0-3100` batches were backfilled/re-ingested so product nodes get derived ingredient nodes, `has_ingredient` edges, aliases, and product metadata under the corrected DPD model.
- Health Canada DPD API ingest completed for core product fields: 58,043 products, 66,523 nodes, 241,023 synonyms, 167,753 edges, and 58,043 chunks under source `HEALTH_CANADA_DPD`. Snapshot: `supabase/seed/out/health-canada-dpd-latest.json`.
- CPS ↔ Health Canada DPD crosswalk is populated for the complete CPS DPD vocabulary: 8,649 matched, 1,817 possible matches, and 414 source-conflict rows.
- Health Canada NOC/NOCc production ingest completed under source `HEALTH_CANADA_NOC`: 37,336 NOC records, 76,403 product rows/chunks, 79,189 nodes, 39,065 synonyms, and 93,572 edges.
- Health Canada Summary Reports production ingest completed under source `HEALTH_CANADA_SUMMARY_REPORT`: 712 Summary Basis of Decision records, 8,066 Regulatory Decision Summary records, 269 Summary Safety Review records, 9,972 nodes, 3,858 synonyms, 1,695 explicit ingredient links, and 27,041 regulatory/safety chunks.
- Health Canada product monograph importer is implemented and validated through the DPD snapshot end under source `HEALTH_CANADA_PRODUCT_MONOGRAPH`: DPD page discovery by exact `drug_code`, DIN validation, human/veterinary filtering, PDF URL/date extraction, SHA-256 checksums, `pdftotext` extraction, and chunk upsert. Current contiguous processed range is DPD snapshot offsets `51291-58043`, with `150,822` product-monograph chunks in the database after batch QA. Aggregate QA deduped overlaps/retries to 6,752 unique DPD products: 4,375 accepted, 2,377 rejected, and zero accepted validation failures. Seven records were quarantined (`98126`, `99804-99807`, `100105`, `102782`): one wrong-linked PDF signal and six missing-marker extractions.
- Ontario ODB Formulary/CDI importer is implemented and unit-tested under source `ONTARIO_ODB_FORMULARY`, but ODB is deferred for now and is not a blocker for the interaction-evidence pipeline.
- Health Canada DPD must be used both to reinforce CPS/CaaS DPD records and to fill Canadian drug/product gaps where CPS has no matching record. It writes into the same graph contract, not a parallel Health Canada-only shape.
- CPS-derived content remains server-only. Do not add CPS chunks, monographs, product listings, embeddings, or graph edges to PowerSync/client sync.
- PubMed interaction candidates are staged and AI pre-reviewed. Resolution quality pass status: 109 candidates currently have both sides resolved in the database, 336 have at least one side resolved, and likely-publishable fully resolved coverage is 29 of 72. The resolver now treats exact cross-source ingredient matches and salt/base ingredient forms as equivalent, prefers official Canadian sources over normalization bridge nodes, avoids pulling unrelated ingredients from multi-ingredient product matches, and skips broad searches for high-risk investigational/combination/NHP-like mentions after exact lookup.
- The resolution report and reviewer UI flag known unmatched/new entities as possible investigational, non-Canadian, code-name, or not-yet-mapped so they are not forced into unsafe graph matches.
- Health Canada DPD ATC cleanup is applied: ATC rows whose class label exactly matches a known ingredient no longer create `drug_class` nodes, stale pseudo-class nodes were removed, and ATC codes are attached to ingredient metadata instead. Remaining ingredient-like ATC labels without matching active-ingredient rows stay as `needs_review` rather than auto-resolving.
- The deployed interaction checker is now two-tiered: deterministic published-KG lookup first, then optional RuntimeAI inference over already-indexed CPS, Health Canada, and PubMed evidence for missing/uncertain deterministic answers. RuntimeAI uses the online Anthropic API, caches answers by graph/evidence/prompt/model version, and writes the exact prompt evidence rows into runtime evaluation captures.
- Calibration can optionally precompute and compare RuntimeAI answers from Opus 4.8, Sonnet 4.6, Haiku 4.5, GPT-5.5, and GPT-5.4 mini for the same request/evidence. Use `pnpm calibration:model-panel` with `INTERACTION_EVALUATION_SET_ID` and `INTERACTION_MODEL_PANEL_LIMIT` to run controlled batches. OpenAI runs require `OPENAI_API_KEY`. Each run records model latency; failed or malformed outputs are preserved as failed evaluation runs with the error trace and prompt evidence.
- Production pharmacist review/publishing should not start until the review UI supports the monograph-first evidence workflow: active-ingredient resolution, CPS and Health Canada monograph coverage, Drug Interactions section evidence, pathway/mechanism extraction, MedEffect/safety alerts, NHP flags, route/form/salt applicability, and stronger resolution confidence. DPD source coverage and Health Canada product-monograph coverage are now visible for resolved reviewer nodes; NOC/NOCc and Summary Reports are ingested and still need fuller review UI surfacing.

## Data Robustness Roadmap

ASAP data layers for a robust Canadian interaction checker and CPS knowledge graph:

- Maintain CPS/CaaS DPD, Therapeutic Choices, and Minor Ailments ingestion. Retry skipped CaaS `404` keyrefs only after CaaS makes those documents available.
- Health Canada DPD API ingest is in place for DINs, active ingredients, companies, forms, routes, schedules, product status, ATC/therapeutic class, CPS record validation, and gap-filling for Canadian drugs/products absent from CPS. Add the flat extract or an additional endpoint pass for biosimilar flags if the API does not expose them.
- Health Canada NOC/NOCc importer is in place and production-ingested for NOC date/status, NOC/c condition flag, submission/product context, ingredients, route, form, DIN, and manufacturer.
- Health Canada product monograph importer is in place for DPD Online PDF discovery, DIN-validated PDF provenance, checksum tracking, and extracted text chunks. The reviewer UI can now surface direct and linked product-monograph coverage for resolved nodes. Continue any future monograph coverage expansion in throttled, resumable batches, with QA after each manifest before advancing the offset.
- Health Canada Summary Reports importer is in place and production-ingested for Summary Basis of Decision, Regulatory Decision Summary, and Summary Safety Review context. Add MedEffect recalls/advisories and Canada Vigilance adverse-reaction data next for current safety signals.
- Defer Ontario ODB Formulary/CDI for now. The importer is available later for reimbursement/formulary context, but it should not block monograph-first interaction review.
- Use ingested NOC/NOCc metadata for approval status, conditional authorization, manufacturer, submission class, therapeutic class, and dates.
- Add Natural Health Product data for NPN products/ingredients and supplement interaction coverage.
- Strengthen ATC ingredient-to-class mapping plus route/form/salt normalization.

All drug/product sources should normalize into one coherent graph model: product or monograph `drug` nodes, active `ingredient` nodes, `drug_class` nodes, source identifiers such as DIN/NPN/CPS keyrefs, aliases, company/manufacturer, route, dosage form, strength, status/schedule, and source provenance/revision metadata. When CPS and Health Canada describe the same product, merge identifiers and provenance onto one node; when Health Canada contains a valid Canadian product absent from CPS, create a Health Canada-sourced node with the same fields and mark monograph/source coverage clearly.

Official public Health Canada sources are tracked in `supabase/seed/src/health-canada/sources.ts` and can be printed with `npx pnpm@10.33.0 --filter @clinrx/supabase-seed health-canada:sources`. DPD, NOC, Summary Reports, Canada Vigilance, and LNHPD have official API docs; product monographs currently need a source-specific DPD/DHPR page/link parser rather than a simple monograph-only API.

DrugBank/licensed commercial vocabulary is deferred pending license and budget review.

## Commands

```sh
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm mobile:web
pnpm powersync:dev:validate
```

## Environment

Copy `.env.example` into the local environment used by Expo/Supabase and fill in the non-secret public values first:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Server-side API keys must not be exposed with the `EXPO_PUBLIC_` prefix.

PowerSync automation reads `POWERSYNC_PERSONAL_TOKEN` and `POWERSYNC_DATABASE_PASSWORD` from `~/.hermes/.env`.
