# Route-/formulation-sensitive pairs — calibration set `interaction-runtime-kg-node-calibration-2026-06-14`

**Why this exists.** The pharmacist flagged (on #16, voriconazole + tacrolimus) that
some interactions depend on **formulation/route**: the same ingredient is dangerous
systemically but inert locally. Today the checker resolves to **route-agnostic
ingredient nodes**, so it cannot tell oral tacrolimus from tacrolimus ointment — it
defaults to the systemic reading. This file flags every pair in the 50-request set
where route would change the answer, so we watch for it in pass 2 and prioritize it
for the route/form/salt-normalization work.

Scope note: tiers are judged in **Canadian (CPS) context** — e.g. topical ibuprofen
and topical naproxen are not prominent Canadian products, so they rank lower than the
ingredient alone would suggest. "Systemic default" means the answer the models and the
pharmacist gave is correct *for the systemic form*; the flag is that a **local-form**
query should get a different (usually downgraded) answer.

## HIGH — clear systemic-vs-local product split, clinically important

| # | Pair | Route-sensitive drug | Systemic form (interacts) | Local form (should NOT interact) | Mechanism that vanishes topically |
|---|------|----------------------|---------------------------|----------------------------------|-----------------------------------|
| 16 | VORICONAZOLE + **TACROLIMUS** | tacrolimus | oral (Prograf/Advagraf) | ointment (Protopic) | negligible systemic absorption → no CYP3A4 substrate exposure |
| 24 | **KETOCONAZOLE** + CARIPRAZINE | ketoconazole | oral (rarely used now) | shampoo/cream (Nizoral) | topical azole → no systemic CYP3A4 inhibition |
| 40 | **KETOCONAZOLE** + ERLOTINIB | ketoconazole | oral | shampoo/cream | same — no systemic CYP3A4 inhibition |
| 44 | ATORVASTATIN + **CYCLOSPORINE** | cyclosporine | oral (Neoral/Sandimmune) | ophthalmic (Restasis/Cequa) | ocular emulsion → blood levels ~undetectable → no OATP1B1/CYP3A effect |
| 48 | ETOPOSIDE + **cyclosporin** | cyclosporine | oral/IV | ophthalmic | same — no systemic exposure |
| 50 | **CHLORHEXIDINE SOLUTION** + **KETOCONAZOLE** | both | (neither systemic here) | chlorhexidine rinse/skin + topical ketoconazole | route-driven true negative: two local antiseptics/antifungals, no systemic overlap |
| 26 | NAPROXEN + **KETOROLAC** | ketorolac | oral/IM (Toradol) | ophthalmic (Acular) | ocular NSAID → no additive systemic GI/renal/bleeding risk |

## MODERATE — oral vs topical exists, interaction is oral-only

| # | Pair | Drug | Note |
|---|------|------|------|
| 17 | **CANNABIDIOL** + CLOBAZAM | cannabidiol | oral CBD inhibits CYP2C19 (raises N-desmethylclobazam); topical CBD ≈ no systemic exposure |
| 19 | **CANNABIDIOL** + CITALOPRAM | cannabidiol | same — oral-only interaction |
| 28 | **CANNABIDIOL** + SODIUM VALPROATE | cannabidiol | same (plus the oral CBD + valproate hepatotoxicity signal) |
| 42 | **CANNABIDIOL** + EVEROLIMUS | cannabidiol | same — oral-only CYP3A4/2C interaction |

## LOW — route-sensitive ingredient, but already disambiguated or niche in Canada

| # | Pair | Note |
|---|------|------|
| 2 | WARFARIN + **CIPRO I.V. MINIBAGS** | ciprofloxacin has ophthalmic/otic drops (no warfarin interaction), but this request is **already pinned to IV** — route-disambiguated, no action |
| 5 | LITHIUM + **IBUPROFEN** | topical ibuprofen has low systemic absorption, but topical ibuprofen is not a prominent Canadian product; oral assumption is reasonable |
| 23 | ENZALUTAMIDE + **MORPHINE SULFATE** | topical/compounded morphine for wounds is niche; oral/systemic assumption stands |
| 36 | DOXYCYCLINE + FLUCONAZOLE | periodontal doxycycline (Atridox) is local but niche; oral assumption stands |

## Pairs NOT route-sensitive
All remaining pairs are systemic-only on both sides (warfarin, amiodarone, digoxin,
simvastatin, the SSRIs/MAOIs, the kinase inhibitors, the azole antifungals used
systemically, etc.) — route does not change the answer.

## What to do with this
1. **Pass 2:** when reviewing the HIGH rows, expect the models' systemic-default answer
   to be *correct for the oral form*; mark the **"Route/form"** missing-context tag and,
   where the topical form would be inert, note it under "narrow applicability /
   overgeneralized." This captures the concern qualitatively.
2. **Next set / runtime work:** to actually *test* route, add route-specific product
   requests (e.g. "tacrolimus ointment + voriconazole", "cyclosporine ophthalmic +
   atorvastatin") as their own cards, and have resolution scope evidence to the
   systemic-exposure-relevant level. This is the route/form/salt-normalization roadmap
   item — "prevent false positives for topical/local products when evidence applies only
   to systemic exposure."
