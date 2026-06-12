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

export const interactionActionCategorySchema = z.enum([
  "no_known_interaction",
  "no_action_needed",
  "monitor_therapy",
  "consider_therapy_modification",
  "avoid_combination",
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

export const pubMedAiDecisionSchema = z.enum([
  "publishable",
  "reject",
  "needs_context",
  "insufficient_evidence",
]);

export const pubMedAutomationTierSchema = z.enum([
  "auto_publish_ready",
  "sample_for_audit",
  "needs_context",
  "auto_reject",
  "quarantine",
  "benchmark",
]);

export const pubMedEvaluationSetPurposeSchema = z.enum([
  "calibration",
  "gold_set",
  "hard_negative",
  "regression_test",
  "benchmark",
  "random_sample",
  "active_learning",
  "disagreement_review",
]);

export const pubMedEvaluationSamplingReasonSchema = z.enum([
  "high_confidence_publishable",
  "high_confidence_reject",
  "model_disagreement",
  "low_confidence",
  "unresolved_entity",
  "new_source_type",
  "new_drug_class",
  "table_or_figure_evidence",
  "cross_source_conflict",
  "random_drift_sample",
  "full_text_candidate",
  "monograph_conflict",
  "regression_failure",
  "manual",
]);

export const pubMedHumanLabelSchema = z.union([
  pubMedAiDecisionSchema,
  z.literal("unclear"),
]);

export const pubMedCalibrationFailureModeSchema = z.enum([
  "wrong_entity_resolution",
  "wrong_ingredient_product_class_level",
  "evidence_does_not_support_interaction",
  "mechanism_only_inference",
  "table_or_figure_misread",
  "severity_unsupported",
  "management_unsupported",
  "narrow_applicability_overgeneralized",
  "duplicate_or_stale_evidence",
  "contradicted_evidence",
  "missing_source_coverage",
  "none",
]);

export const pubMedAiReviewSchema = z.object({
  actionCategory: interactionActionCategorySchema,
  concerns: z.array(z.string().min(1)),
  decisionTrace: z
    .object({
      chunkAssessments: z
        .array(
          z.object({
            chunkId: z.string().min(1).optional(),
            conclusion: z.string().min(1),
            limitation: z.string().min(1).nullable().optional(),
            quote: z.string().min(1).nullable().optional(),
            supportType: z
              .enum([
                "supports_interaction",
                "supports_mechanism",
                "supports_severity",
                "supports_management",
                "contradicts_or_limits",
                "source_silent",
              ])
              .optional(),
          }),
        )
        .optional(),
      finalRationale: z.string().min(1).optional(),
      retrievalNotes: z.string().min(1).optional(),
      uncertainty: z.array(z.string().min(1)).optional(),
    })
    .nullable()
    .optional(),
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
  actionCategory: interactionActionCategorySchema.optional(),
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
  actionCategory: interactionActionCategorySchema.optional(),
  mechanism: z.string().min(1).optional(),
  management: z.string().min(1).optional(),
  evidenceLevel: z.string().min(1).optional(),
  extractionConfidence: z.number().min(0).max(1),
  sourceQuote: z.string().min(1).optional(),
  citations: z.array(interactionCitationSchema).min(1),
  evidenceChunkRefs: z
    .array(
      z.object({
        chunkId: z.uuid(),
        confidence: z.number().min(0).max(1),
        quote: z.string().min(1).optional(),
        supportType: z.enum([
          "supports_interaction",
          "supports_mechanism",
          "supports_severity",
          "supports_management",
          "contradicts_or_limits",
        ]),
      }),
    )
    .optional(),
  quantitativeEffects: z
    .array(
      z.object({
        comparator: z.string().min(1).optional(),
        metric: z.string().min(1),
        sourceChunkId: z.uuid(),
        value: z.string().min(1),
      }),
    )
    .optional(),
  applicability: z
    .object({
      dose: z.string().min(1).optional(),
      evidenceContext: z
        .enum(["human", "animal", "in_vitro", "unknown"])
        .optional(),
      population: z.string().min(1).optional(),
      route: z.string().min(1).optional(),
      timing: z.string().min(1).optional(),
    })
    .optional(),
  evidenceSummary: z.record(z.string(), z.unknown()).optional(),
  aiDecisionTrace: z.record(z.string(), z.unknown()).optional(),
  fullTextProcessed: z.boolean().optional(),
});

export const extractedPubMedInteractionsSchema = z.object({
  candidates: z.array(extractedPubMedInteractionSchema),
});

export type PubMedArticleInput = z.infer<typeof pubMedArticleSchema>;
export type ExtractedPubMedInteraction = z.infer<
  typeof extractedPubMedInteractionSchema
>;
export type PubMedAiReview = z.infer<typeof pubMedAiReviewSchema>;
