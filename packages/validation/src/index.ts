import { z } from "zod";

export const kgNodeTypeSchema = z.enum([
  "drug",
  "ingredient",
  "drug_class",
  "condition",
  "symptom",
  "adverse_effect",
  "population",
]);

export const interactionSeveritySchema = z.enum([
  "contraindicated",
  "major",
  "moderate",
  "minor",
  "unknown",
]);

export const edgeReviewStatusSchema = z.enum([
  "candidate",
  "under_review",
  "published",
  "rejected",
]);

export const pubMedRejectionReasonSchema = z.enum([
  "not_interaction",
  "wrong_drug_pair",
  "unsupported_by_quote",
  "severity_wrong",
  "duplicate",
  "bad_entity_resolution",
  "stale_outdated_data",
  "other",
]);

export const pubMedAiReviewVerdictSchema = z.enum([
  "likely_publishable",
  "needs_human_review",
  "likely_reject",
]);

export const pubMedAiReviewSchema = z.object({
  concerns: z.array(z.string().min(1)),
  entityResolutionNotes: z.string().min(1).nullable().optional(),
  evidenceAssessment: z.string().min(1),
  recommendedRejectionReason: pubMedRejectionReasonSchema.nullable().optional(),
  score: z.number().min(0).max(1),
  severityAssessment: z.string().min(1),
  summary: z.string().min(1),
  verdict: pubMedAiReviewVerdictSchema,
});

export const checkInteractionsInputSchema = z.object({
  nodeIds: z.array(z.uuid()).min(2).max(20),
});

export const cpsSearchInputSchema = z.object({
  limit: z.number().int().min(1).max(20).optional(),
  query: z.string().trim().min(2).max(200),
});

export const interactionCitationSchema = z.object({
  pmid: z.string().min(1),
  title: z.string().optional(),
  year: z.number().int().min(1800).max(3000).optional(),
  quote: z.string().optional(),
});

export const interactionCandidateSchema = z.object({
  sourceNodeId: z.uuid(),
  targetNodeId: z.uuid(),
  severity: interactionSeveritySchema,
  mechanism: z.string().min(1).optional(),
  management: z.string().min(1).optional(),
  evidenceLevel: z.string().min(1).optional(),
  extractionConfidence: z.number().min(0).max(1),
  citations: z.array(interactionCitationSchema).min(1),
});

export type CheckInteractionsInput = z.infer<
  typeof checkInteractionsInputSchema
>;
export type CpsSearchInput = z.infer<typeof cpsSearchInputSchema>;
export type InteractionCandidate = z.infer<
  typeof interactionCandidateSchema
>;

export const pubMedArticleSchema = z.object({
  pmid: z.string().min(1),
  title: z.string().min(1),
  abstractText: z.string().min(1),
  year: z.number().int().min(1800).max(3000).optional(),
  journal: z.string().optional(),
});

export const extractedPubMedInteractionSchema = z.object({
  pmid: z.string().min(1),
  articleTitle: z.string().min(1).optional(),
  articleYear: z.number().int().min(1800).max(3000).optional(),
  subjectText: z.string().min(1),
  objectText: z.string().min(1),
  severity: interactionSeveritySchema,
  mechanism: z.string().min(1).optional(),
  management: z.string().min(1).optional(),
  evidenceLevel: z.string().min(1).optional(),
  extractionConfidence: z.number().min(0).max(1),
  sourceQuote: z.string().min(1).optional(),
  citations: z.array(interactionCitationSchema).min(1),
});

export const extractedPubMedInteractionsSchema = z.object({
  candidates: z.array(extractedPubMedInteractionSchema),
});

export type PubMedArticleInput = z.infer<typeof pubMedArticleSchema>;
export type ExtractedPubMedInteraction = z.infer<
  typeof extractedPubMedInteractionSchema
>;
export type PubMedAiReview = z.infer<typeof pubMedAiReviewSchema>;
