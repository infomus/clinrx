# ClinRx App Plan

This is an early planning artifact. The active implementation is now in `apps/mobile`, shared packages are in `packages/*`, and the current technical direction is documented in `ARCHITECTURE.md`. Use this file for product framing only, not current implementation status.

## Product Direction

ClinRx is a care-first workflow application for Canadian pharmacy teams. The initial product should help pharmacists see clearer clinical signals, manage work calmly, and document judgment without adding busywork.

## Initial Users

- Pharmacists and pharmacy managers in tech-forward Canadian pharmacies
- Pharmacy students and preceptors
- Researchers or academic partners evaluating pharmacy workflow and care quality

## MVP Focus

The first app version should prove one high-value workflow end to end:

- Intake: capture a patient, medication, or care task quickly
- Signal: surface the clinically relevant issue or opportunity
- Action: guide the pharmacist through the next step
- Documentation: produce a clean note, rationale, or follow-up record
- Review: make pending, completed, and escalated work easy to scan

## Candidate Modules

- Work queue for active pharmacy care tasks
- Patient profile with medication and interaction context
- Clinical signal cards for issues, opportunities, and follow-ups
- Pharmacist documentation builder
- Collaboration and handoff notes
- Analytics for workflow, interventions, and outcomes

## Planning Questions

- What is the first workflow ClinRx should own: medication review, minor ailment prescribing, refill assessment, interaction triage, adherence follow-up, or something else?
- Who is the first daily user: pharmacist, pharmacy manager, student, researcher, or patient-facing staff?
- What systems must the app integrate with eventually, and what can be manual in the MVP?
- What data must never leave the pharmacy or user-controlled environment?
- What evidence or outcome would prove the MVP is worth expanding?

## Technical Starting Point

These were initial planning questions. Current implementation choices are tracked in `ARCHITECTURE.md` and the repo-level `README.md`.

- Frontend framework and app hosting target
- Backend/runtime choice
- Database and audit logging approach
- Authentication and role model
- PHI/privacy boundary for the MVP
- Seed data strategy for demos without real patient data
