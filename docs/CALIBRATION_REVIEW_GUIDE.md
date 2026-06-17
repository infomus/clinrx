# Calibration Review — Navigation Guide

A practical, screen-by-screen guide to the ClinRx interaction-checker **calibration review** for the pharmacist reviewer. This explains what every part of the screen means and how to label each answer.

> **What this is for.** You are *grading the system*, not publishing drug interactions. For each drug-pair request, the system retrieves evidence and has several AI models each produce an interaction answer. Your job is to judge whether the system found the right evidence and gave the right answer. Nothing you do here is shown to end users — your labels are calibration data that tell us which models and retrieval methods to trust.

---

## 1. Getting in

- **URL:** `https://clinrx.ca/review/calibration/`
- **Password:** `Ilovelayla123!` (enter once; it's remembered on that browser)

You'll land directly on the calibration set. If a page ever shows "Could not load…", just refresh.

---

## 2. The screen, top to bottom

```
┌─────────────────────────────────────────────────────────────┐
│ Interaction Checker Evaluation        (title + short blurb)  │
├─────────────────────────────────────────────────────────────┤
│ Evaluation set:  [ Runtime model and retrieval strategy … ] │  ← which set you're reviewing
├─────────────────────────────────────────────────────────────┤
│ Metrics:  Reviewed 3/50 · Category correct 67% · … pills …  │  ← live tally of YOUR labels
├─────────────────────────────────────────────────────────────┤
│ "Responses autosave…"                                        │  ← save status (autosaves)
├─────────────────────────────────────────────────────────────┤
│  #1   high risk pair   Expected: avoid_combination           │  ← a request CARD
│  WARFARIN + AMIODARONE                                        │
│  ┌ Retrieval × model matrix ─────────────────────────────┐   │  ← compact overview of all runs
│  │  Sonnet 4.6   GPT‑5.4 mini      (× 2 strategy rows)    │   │
│  └────────────────────────────────────────────────────────┘  │
│  [ 4 detailed model cards — evidence, trace, label form ]    │  ← where you actually grade
│                                                              │
│  #2  …next request…                                          │
└─────────────────────────────────────────────────────────────┘
```

### Evaluation set
A single card naming the set you're reviewing. There's only one (the 50‑request calibration set); it's selected automatically. (Older/debug sets are intentionally hidden.)

### Metrics pills
A running summary of **your own labels** so far — they update as you go:
- **Reviewed** — how many model answers you've given a final category.
- **Category correct** — of those, the share where your final category matched the AI's answer.
- **Entities correct / Retrieval correct / AI understood** — share you marked "correct" on those questions.
- **Safe to automate / Quarantine** — counts of answers you flagged each way.

### Autosave
There is **no Save button.** Every choice you make is saved instantly. The status line confirms it ("Saving…" / saved). You can close the tab and come back; your labels persist.

---

## 3. Anatomy of a request card

Each card is one **drug-pair request**, the way the checker would receive it.

- **`#N`** — the card's number in the set.
- **Sampling-reason chip** (e.g. `high risk pair`, `pubmed emerging`, `negative control`) — why this pair was included.
- **`Expected: …`** — the category we expected, when one was pre-specified. Treat it as a hint, not the answer.
- **The pair** — e.g. **`WARFARIN + AMIODARONE`** — the two drugs being checked.

---

## 4. The "Retrieval × model matrix"

A compact grid summarizing **every run** for this pair. In this second pass each request is run across the shortlist — **2 models × 2 retrieval strategies = 4 runs.** The matrix shows them all as small chips, grouped by retrieval strategy, one chip per model.

Each chip shows:
- **Model** (Sonnet 4.6, GPT‑5.4 mini)
- **Answer category** (colored — see §7) or a status like `failed`
- **Confidence** (%) and **latency** (response time)

The two retrieval strategies (how the system gathered evidence):
- **Monograph + PubMed top 10** — monographs plus supporting PubMed.
- **Ingredient/product/class guarded top 12** — broader knowledge-graph expansion with guardrails.

Use the matrix to spot disagreement at a glance — e.g. if three of the four say "monitor" and one says "avoid," that's worth a closer look.

---

## 5. Grading every answer (all 4 shown)

All **4 detail cards** (evidence + trace + a label form) are shown for every pair — there's no toggle to expand. Labels are **per run** (per model × strategy), so each pair has **4 gradable answers** and the whole set is **50 × 4 = 200 reviews**. Scroll through all four under each pair and grade each one.

---

## 6. Reading one model's answer (a detail card)

Each detailed card is one model's answer under one retrieval strategy.

**Header row:** model name · retrieval strategy · status (if it `failed`) · **category pill** · confidence % · latency · `Run vN`.

**Below the header:**
- **Answer summary** and **Management** — the model's plain-language conclusion and what to do.
- **Source / Target** — the resolved drug nodes (name, type like *drug*/*ingredient*, and source like *CPS*). If you ever see **"Unresolved"**, the system couldn't tie that side to a known entity — flag it under entity resolution.
- **AI trace** — the model's reasoning:
  - *Rationale* — why it landed on this answer.
  - *Retrieval notes* — notes about what evidence it had.
  - *Uncertainty* — caveats the model raised.
  - *Error* — shown only when the run failed (e.g. malformed output).
- **Retrieved evidence** — the chunks the system pulled, each with badges (next section).

---

## 7. Action categories and their colors

Every answer is one of five categories, color-coded consistently across the UI:

| Color | Category | Meaning |
|---|---|---|
| 🟢 Green | **No known interaction** | Nothing meaningful in the current evidence |
| 🔵 Blue | **No action needed** | An interaction exists but needs no action |
| 🟡 Yellow | **Monitor therapy** | Watch/caution warranted |
| 🟠 Orange | **Consider therapy modification** | Dose change, alternative, or active step |
| 🔴 Red | **Avoid combination** | Avoid / contraindicated |

(Grey = **Unclear**, used in your labels when you can't decide.)

---

## 8. Evidence badges — what they mean

Each retrieved-evidence row carries up to three badges.

**(a) Source kind — where it came from:**
`cps_monograph` · `health_canada_product_monograph` · `pubmed` · `kg_edge` (a published interaction) · `safety` · `nhp` · `other`.

**(b) Support type — what role it plays:**
- **supports_interaction** — directly supports that the interaction exists (ideally names *both* drugs). *Strongest.*
- **supports_mechanism** — explains a mechanism (e.g. "CYP3A4 inhibitor") but not necessarily this exact pair. *Mechanism alone is not proof of a clinical interaction.*
- **supports_severity** — backs the severity rating.
- **supports_management** — backs the monitoring/management advice.
- **contradicts_or_limits** — argues against, narrows, or limits the interaction.
- **source_silent** — the source doesn't mention this pair.
- **retrieved** — generic context, not classified.

**(c) Used (green badge) — did the AI actually cite it?**
- **Used** = the model grounded its answer on this chunk. Used evidence is sorted to the top.
- No "Used" badge = retrieved and shown to the model, but it didn't cite it.

Each row also shows the quote/excerpt and, when available, **Open PubMed** / **Open source** links.

### What the badge *combinations* tell you
- **Used + supports_interaction** from **cps_monograph** → the gold case: the model leaned on a direct, authoritative source.
- **Used + supports_mechanism only** (no `supports_interaction` anywhere) → **red flag**: the model may be inferring an interaction from mechanism alone — the classic over‑warning failure mode this calibration is meant to catch.
- **contradicts_or_limits** that the model did *not* mark Used → check whether it ignored a real limitation.

---

## 9. How to label an answer

Below the evidence, the white box is the **label form for that one model's answer.** Everything autosaves. The questions:

1. **Final interaction category** — what *you* judge the correct category to be (the five categories above, or **Unclear**). The metrics compare this to the AI's answer.
2. **Were the right entities selected?** — *Correct · Wrong level · Wrong node · Unresolved/unclear.* "Wrong level" = it resolved to a product when it should be the ingredient/class (or vice versa).
3. **Did retrieval find the right evidence?** — *Correct · Incomplete · Wrong · Not assessed.*
4. **Did AI interpret the evidence correctly?** — *Correct · Partially correct · Wrong · Not assessed.*
5. **Is the management/action wording acceptable?** — *Acceptable · Needs revision · Wrong · Not assessed.*
6. **Did the system generalize appropriately?** — *Appropriate · Too broad · Too narrow · Unclear · Not assessed.* ("Too broad" = it generalized narrow evidence — e.g. one animal study — into a broad warning.)
7. **Would this be safe to automate?** — *Safe to automate · Sample only · Quarantine · Not assessed.* This is the bottom-line trust question: would you let the system serve this answer without a human?
8. **Failure modes** (pick all that apply) — *None · Wrong entity · Wrong ingredient/product/class level · Evidence unsupported · Mechanism‑only inference · Table/figure misread · Severity unsupported · Management unsupported · Overgeneralized · Duplicate/stale · Contradicted evidence · Missing source coverage.*
9. **Missing context** (pick all that apply) — *None · CPS comparison · Full article · MedEffect/safety · NHP data · NOC context · Route/form · Severity/management.* What you'd have needed to judge confidently.
10. **What rule, prompt, or source would have prevented an issue?** — free text; your fix suggestion.
11. **Reviewer note** — free text; anything else.

You don't have to answer every field — at minimum set the **final category** and the **safe-to-automate** call; the rest sharpens the diagnosis.

---

## 10. A good review rhythm

1. Read the pair and the **Expected** hint.
2. Skim the **matrix** — do the models agree? Note outliers.
3. For each detailed answer: glance at the **category + confidence**, then the **Used evidence** — is it real, direct, and authoritative, or mechanism-only/thin?
4. Set your **final category** and **safe-to-automate** call. Add failure modes / missing context when something's off.
5. Grade all **4** answers under each pair before moving on.

**Watch especially for:** mechanism-only "interactions," narrow evidence generalized into broad warnings, "Unresolved" entities, ignored `contradicts_or_limits` evidence, and confident answers with thin or no **Used** evidence.

---

## 11. Things to remember

- **Calibration, not production.** Your labels do not publish or block anything for end users.
- **Autosaves; no Save button.** Edit freely; come back anytime.
- **One label per model answer.** Each pair has 4 gradable answers (2 models × 2 strategies); 200 across the set.
- **Failed runs are data too.** A model that returned a malformed/empty answer shows as `failed` with its error and the evidence it was given — that's a reliability signal worth noting, not a bug to ignore.
