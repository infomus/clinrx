# Pharmacist Review Role for ClinRx

We are building a Canadian pharmacy study app with CPS-backed smart search and a drug interaction checker. CPS monographs are loaded server-side, CPS DPD product listings are fully loaded, Health Canada DPD/NOC/Summary Reports/product monograph context is ingested, and the interaction review workflow is being calibrated around a monograph-first evidence standard.

This document is the session guide for a pharmacist/co-founder review walkthrough.

## Session Goal

The first pharmacist session is not about reviewing hundreds of PubMed records. It is about calibration of the eventual request-time interaction checker:

- confirm whether the system retrieved the right evidence for a drug-pair request;
- confirm whether the system resolved the right ingredient/product/class entities;
- confirm whether the final interaction category is correct;
- identify which evidence-trace fields make clinical review fast or slow;
- agree on rejection reasons and follow-up categories;
- decide what a safe-to-automate checker answer should look like;
- document any missing safety language, filters, or workflow controls.

## What We Need From You

Your main role is to help calibrate how ClinRx should answer real interaction-checker requests before those answers are trusted.

The intended workflow is monograph-first:

1. Resolve each drug to the relevant active ingredient.
2. Search CPS and Health Canada monograph sources by active ingredient.
3. Retrieve related generic and brand/product monographs.
4. Inspect the monograph `Drug Interactions` sections for enzymes, transporters, receptors, inducer/inhibitor/substrate/agonist/antagonist roles, interacting examples/classes, and management/monitoring language.
5. Use PubMed afterward to show real-world examples, outcome detail, PK/PD magnitude, contradictions, or limitations.

The AI pipeline will use monograph evidence and PubMed evidence to produce an interaction-checker answer:

- `No known interaction`
- `No action needed`
- `Monitor therapy`
- `Consider therapy modification`
- `Avoid combination`

These are not final production decisions during calibration. They are system answers that you evaluate.

The pharmacist is currently evaluating the system, not approving every edge forever. AI can retrieve, summarize, score, and recommend, but automation should wait until the evidence trace and calibration metrics support it.

## What You Will Review

Each runtime evaluation card will show:

- The drug-pair request, for example `omeprazole + clopidogrel`
- The system's final action category
- Resolved active ingredients and linked product/brand/generic monographs
- CPS monograph `Drug Interactions` chunks used by AI review
- Health Canada product monograph `Drug Interactions` chunks used by AI review
- Extracted pathway facts: enzyme/transporter/receptor, inducer/inhibitor/substrate/agonist/antagonist role, examples/classes, management, monitoring, and route/form/population caveats
- Whether monographs directly support, class/pathway-support, contradict/limit, or are silent on the candidate
- Source quote or abstract evidence
- Proposed severity, if available
- Proposed mechanism and management, if available
- AI confidence score, answer summary, and concerns
- Whether each drug mention resolved to a CPS drug/class node
- Whether each resolved node has Health Canada product-monograph-backed products, including direct product matches and linked ingredient/class products
- Whether resolution landed at the correct level: ingredient/class by default, product only when product-specific

Useful questions to ask during the walkthrough:

- Can you tell quickly whether this is a real interaction or a weak association?
- Is the source quote enough, or do you need the abstract/full article context?
- Is the proposed severity clinically appropriate for pharmacy learners?
- Is the proposed management actionable and not overconfident?
- Are the drug names resolved to the right Canadian CPS entities?
- Are the relevant active ingredients and monographs identified?
- Do the monograph `Drug Interactions` sections support the proposed mechanism, severity, and management?
- Are the extracted enzyme/receptor/pathway roles accurate?
- If the UI shows multiple brand/manufacturer products for the same generic, should this be published at the generic ingredient instead?
- Does Health Canada monograph coverage support the selected node level, or suggest the reviewer should resolve to a different ingredient/class/product?
- What would make this candidate faster to approve, reject, or park?

## Your Decisions

For each request-time checker answer, you will label:

1. **Final interaction category**
   - No known interaction
   - No action needed
   - Monitor therapy
   - Consider therapy modification
   - Avoid combination
   - Unclear

2. **System quality**
   - Were the right entities selected?
   - Did retrieval find the right evidence?
   - Did AI interpret that evidence correctly?
   - Did it generalize appropriately?
   - Is the management/action wording acceptable?
   - Would this be safe to automate?

3. **Failure modes and missing context**
   - Wrong entity resolution
   - Evidence does not support answer
   - Mechanism-only inference
   - Severity or management unsupported
   - Overgeneralized narrow evidence
   - Missing CPS/Health Canada/PubMed/safety/NHP context

## What Matters Most

We do not need you to review everything equally.

Highest priority:

- Common Canadian pharmacy drugs
- High-risk interactions
- Interactions involving anticoagulants, antiepileptics, antimicrobials, psych meds, cardiovascular drugs, immunosuppressants, diabetes drugs, oncology meds
- Candidates marked `likely_publishable`
- Candidates with clear evidence and good CPS entity matches
- Candidates supported by recent or still-current evidence

Lower priority:

- In-vitro synergy papers
- Experimental compounds
- Non-Canadian or obscure products
- Vague “combination therapy” claims
- Candidates without clear interaction evidence
- Older publications that are likely superseded by newer evidence or CPS updates

## Review Standard

Be conservative.

A candidate should only become part of the interaction checker if it is useful, defensible, current, and safely phrased for pharmacy learners.

If the evidence is weak, ambiguous, outdated, or not clinically actionable, reject it or mark it for follow-up.

Publishing bar:

- Relevant CPS and/or Health Canada monographs must be checked first when available.
- The `Drug Interactions` chunks used by AI review must be visible and support, narrow, contradict, or explicitly be silent on the candidate.
- Both entities must resolve to the intended CPS drug, ingredient, product, or class.
- The publish target should usually be the ingredient or class. A product-specific node should be used only when the evidence is product-specific.
- PubMed evidence must support an interaction or clinically relevant co-use risk, not merely combination therapy, and should be interpreted against current monograph context.
- The severity must be explainable from the evidence and current practice.
- Management language must be practical and appropriately hedged.
- The candidate must not duplicate an already published interaction unless it adds materially useful evidence.
- Older evidence should be checked against current CPS/current practice before publication.

## Why Your Feedback Matters

Your review decisions feed back into the system.

When you reject a candidate and choose a reason, the pipeline stores that as a negative example. Future AI extraction uses those examples to avoid repeating the same mistakes.

Common rejection reasons:

- `not_interaction`
- `wrong_drug_pair`
- `unsupported_by_quote`
- `severity_wrong`
- `duplicate`
- `bad_entity_resolution`
- `stale_outdated_data`
- `other`

This means your reviews improve both the knowledge graph and the extraction pipeline over time.

## Current Status

Current status as of 2026-06-11:

- 962 abstract-bearing PubMed articles harvested
- 491 articles processed through extraction
- 409 interaction candidates staged
- 409 candidates AI pre-reviewed
- 72 candidates marked `likely_publishable`
- 317 candidates marked `needs_human_review`
- 20 candidates marked `likely_reject`
- CPS monographs ingested: 794 records, 11,987 chunks, 305 synonyms
- DPD product listings ingested: all `10,926` DPD keyrefs complete, `0` records remaining
- CPS Therapeutic Choices ingested: 136 topics and 5,405 chunks
- CPS Minor Ailments ingested: 74 topics and 2,832 chunks
- DPD `0-3100` was backfilled/re-ingested so product nodes have derived ingredient nodes, `has_ingredient` links, aliases, and product metadata under the corrected product/ingredient model
- Health Canada DPD core API ingest is complete and CPS ↔ Health Canada crosswalk is populated: 8,649 matched, 1,817 possible matches, 414 source-conflict rows
- Health Canada NOC/NOCc and Summary Reports are production-ingested.
- Health Canada product monograph ingestion is validated through DPD snapshot offset `58043`; the database currently has `150,822` chunks under `HEALTH_CANADA_PRODUCT_MONOGRAPH` from 4,375 accepted monograph records, with seven quarantined validation failures.
- Health Canada ATC ingredient-like pseudo-classes were cleaned up across exact cross-source ingredient duplicates; remaining ingredient-like labels without matching active-ingredient rows are intentionally left for review rather than auto-resolution.
- Latest resolution quality pass added exact cross-source ingredient equivalence, salt/base ingredient equivalence, safer multi-ingredient product handling, score-prioritized resolver batches, and explicit report queues for combination/NHP/investigational mentions.
- 109 candidate rows currently have both sides resolved in the database, 336 have at least one side resolved, and 29 of 72 likely-publishable candidates are fully resolved.
- The reviewer UI and resolution report now flag known unmatched/new entities as possible investigational/non-Canadian/code-name/not-yet-mapped instead of leaving them as generic unmatched text. The latest top-250 report has 44 such unresolved sides.
- The reviewer UI now shows Health Canada product monograph coverage for resolved candidate nodes. Product nodes show direct monograph coverage; ingredient/class nodes show linked DPD products with monographs.
- The runtime evaluation schema is live, and the calibration UI now reviews drug-pair checker requests rather than PubMed candidate rows. The seeded calibration set `interaction-runtime-calibration-2026-06-11` contains 80 request cards and 339 evidence rows.
- The deployed interaction checker now writes live request-time evaluation captures when invoked from the app. These live captures record the selected pair, resolved graph nodes, answer source, evidence rows, and decision trace.
- The live checker is now two-tiered. It first checks the deterministic published knowledge graph with ingredient/class expansion. In the default app mode, deterministic hits skip the model; missing deterministic answers can run RuntimeAI over indexed CPS, Health Canada, and PubMed evidence.
- RuntimeAI captures record the model, prompt version, retrieval strategy, final category, confidence, rationale, used evidence IDs, and the exact prompt evidence rows the AI saw.
- For calibration, the same request can now show a model-comparison panel: Opus 4.8, Sonnet 4.6, Haiku 4.5, GPT-5.5, and GPT-5.4 mini. Each model answer appears as its own run with the same evidence trace structure, latency, and separate pharmacist labels. If a model fails or returns malformed structured output, that failed attempt is visible with the prompt evidence and error trace.
- Additional robustness layers are planned ASAP before production reliance: MedEffect safety alerts/recalls/reviews, Natural Health Product data, route/form/salt normalization, and stronger resolution-confidence surfacing. DrugBank is deferred.
- Health Canada DPD is not only a CPS validation layer. It must also fill Canadian drug/product gaps where CPS has no matching record, using the same product/ingredient/class graph model and clear source provenance.

The current blocker is not the pharmacist review standard. It is still evidence trace quality: candidates need reliable matching to official CPS or Health Canada-sourced graph nodes, exact monograph `Drug Interactions` chunks, pathway facts, PubMed support when useful, plus current Canadian safety, route/form, and NHP context before publication decisions can be safely applied at scale.

Until the remaining enrichment layers are loaded and visible in the review UI, pharmacist sessions are calibration only. Do not ask the pharmacist to perform production review volume yet.

The workflow is now:

1. Start from a drug-pair request, as the runtime interaction checker would receive it.
2. Resolve the pair to active ingredients/classes/products using CPS and Health Canada graph nodes.
3. Retrieve related CPS and Health Canada monographs by active ingredient, generic, and brand/product names.
4. Surface exact `Drug Interactions` chunks, source metadata, and extracted pathway facts.
5. Retrieve PubMed evidence chunks as supporting literature, contradictions, or limitations.
6. Generate an AI answer with an action category and evidence trace.
7. Pharmacist labels the system answer and where the pipeline succeeded or failed.
8. Calibration metrics decide when a class of answers is safe to automate.

During the current calibration session, distinguish between two evidence modes:

- Seeded runtime cards show the planned review shape using current PubMed/monograph candidate evidence projected into request-style cards.
- Live runtime captures show exactly what the deployed checker returned for a real app request today. Deterministic captures validate graph lookup behavior; RuntimeAI captures additionally validate retrieved evidence, prompt evidence trace, and AI category/rationale quality.
- Model-comparison captures are for calibration only. They help answer whether a faster model can match the strongest models on action category, evidence interpretation, management wording, and automation safety. We should also compare retrieval/KG strategies during calibration: ingredient-only, ingredient+product, ingredient+class, monograph-first, PubMed fallback, and source-conflict quarantine.

## What We Need From You First

During the first review session:

1. Look at a small sample of `likely_publishable`, `needs_human_review`, and `likely_reject` candidates.
2. Reject obvious false positives quickly and verify the rejection reason taxonomy is sufficient.
3. Identify candidates that would be publishable if entity resolution were correct.
4. Flag candidates where the publication is old or may be superseded by newer CPS/current practice.
5. Flag any candidates where the drug pair is real but severity/management needs correction.
6. Tell us which filters or fields would make review faster.

The goal is not volume at first. The goal is calibration: we want to learn what the AI is getting right, what it is getting wrong, and how to make your review workflow efficient.

## First Review Target

Start with the `likely_publishable` queue only after resolution produces candidates with both sides matched to coherent Canadian graph nodes and the UI can show monograph interaction context. Those may be CPS-covered nodes or Health Canada-sourced gap-fill nodes when CPS has no matching record. Until then, use the queue for precision assessment and workflow feedback, not publication.

Production review should also wait until the remaining monograph `Drug Interactions` chunks, MedEffect/safety, NHP, route/form/salt, and resolution-confidence context is visible in the reviewer workflow. The reviewer should be able to see whether a resolved node is CPS-covered, Health Canada-only, has Health Canada monograph-backed products, or has source conflicts such as ingredient/status/route mismatch.

Do not publish candidates only because the AI marked them likely publishable. A candidate should only be published when both sides are correctly resolved to coherent Canadian graph nodes, source coverage/conflicts are understood, monograph interaction context is visible, and the evidence is current, clinically useful, and safely phrased for pharmacy learners.

## Suggested Meeting Flow

1. Show the product direction: CPS-backed search plus a conservative interaction checker for Canadian pharmacy learners.
2. Explain the safety boundary: the checker only serves pharmacist-published edges and never says a medication pair is absolutely safe.
3. Show the pipeline: active ingredient resolution -> CPS/Health Canada monograph Drug Interactions sections -> pathway/mechanism extraction -> PubMed support/examples -> AI pre-review -> pharmacist calibration -> published graph edge when criteria are met.
4. Review 5-10 sample candidates across verdict types.
5. Ask the pharmacist to verbalize the decision process for each sample.
6. Record missing fields, confusing labels, desired filters, and any rejection reasons that do not fit.
7. End by agreeing on the first publish criteria and the smallest useful review batch.

## Decisions To Capture

- Minimum evidence bar for `published`.
- Severity labels and when to use each one.
- Required management wording for high-risk interactions.
- Whether older articles need a hard cutoff or case-by-case review.
- Which drug classes should be prioritized first.
- Which rejection reasons are missing or unclear.
- Whether a `needs monograph comparison` follow-up bucket is enough, or whether more specific follow-up states are needed.
- Whether candidate resolution is at the right clinical level: ingredient, class, or product.
