export type KgNodeType =
  | "drug"
  | "ingredient"
  | "drug_class"
  | "condition"
  | "symptom"
  | "adverse_effect"
  | "population";

export type KgRelation =
  | "treats"
  | "interacts_with"
  | "subclass_of"
  | "has_ingredient"
  | "contraindicated_in"
  | "causes"
  | "comorbid_with";

export type InteractionSeverity =
  | "contraindicated"
  | "major"
  | "moderate"
  | "minor"
  | "unknown";

export type InteractionActionCategory =
  | "no_known_interaction"
  | "no_action_needed"
  | "monitor_therapy"
  | "consider_therapy_modification"
  | "avoid_combination";

export type EdgeReviewStatus =
  | "candidate"
  | "under_review"
  | "published"
  | "rejected";

export type PubMedRejectionReason =
  | "not_interaction"
  | "wrong_drug_pair"
  | "unsupported_by_quote"
  | "severity_wrong"
  | "duplicate"
  | "bad_entity_resolution"
  | "stale_outdated_data"
  | "other";

export type PubMedAiReviewVerdict =
  | "likely_publishable"
  | "needs_human_review"
  | "likely_reject";

export type PubMedAiDecision =
  | "publishable"
  | "reject"
  | "needs_context"
  | "insufficient_evidence";

export type PubMedAutomationTier =
  | "auto_publish_ready"
  | "sample_for_audit"
  | "needs_context"
  | "auto_reject"
  | "quarantine"
  | "benchmark";

export type PubMedEvaluationSetPurpose =
  | "calibration"
  | "gold_set"
  | "hard_negative"
  | "regression_test"
  | "benchmark"
  | "random_sample"
  | "active_learning"
  | "disagreement_review";

export type PubMedEvaluationSamplingReason =
  | "high_confidence_publishable"
  | "high_confidence_reject"
  | "model_disagreement"
  | "low_confidence"
  | "unresolved_entity"
  | "new_source_type"
  | "new_drug_class"
  | "table_or_figure_evidence"
  | "cross_source_conflict"
  | "random_drift_sample"
  | "full_text_candidate"
  | "monograph_conflict"
  | "regression_failure"
  | "manual";

export type PubMedHumanLabel = PubMedAiDecision | "unclear";

export type PubMedCalibrationFailureMode =
  | "wrong_entity_resolution"
  | "wrong_ingredient_product_class_level"
  | "evidence_does_not_support_interaction"
  | "mechanism_only_inference"
  | "table_or_figure_misread"
  | "severity_unsupported"
  | "management_unsupported"
  | "narrow_applicability_overgeneralized"
  | "duplicate_or_stale_evidence"
  | "contradicted_evidence"
  | "missing_source_coverage"
  | "none";

export type PubMedEvidenceRetrievalAssessment =
  | "correct"
  | "incomplete"
  | "wrong"
  | "not_assessed";

export type PubMedAiInterpretationAssessment =
  | "correct"
  | "partially_correct"
  | "wrong"
  | "not_assessed";

export type PubMedGeneralizationAssessment =
  | "appropriate"
  | "too_broad"
  | "too_narrow"
  | "unclear"
  | "not_assessed";

export type PubMedAutomationSafetyAssessment =
  | "safe_to_automate"
  | "sample_only"
  | "quarantine"
  | "not_assessed";

export type PubMedCalibrationInteractionAssessment =
  | "real"
  | "not_interaction"
  | "unclear";

export type PubMedCalibrationDrugPairAssessment =
  | "correct"
  | "partially_correct"
  | "wrong_pair"
  | "unclear";

export type PubMedCalibrationResolutionAssessment =
  | "correct"
  | "wrong_level"
  | "wrong_node"
  | "unresolved_unclear";

export type PubMedCalibrationSeverityManagementAssessment =
  | "acceptable"
  | "needs_revision"
  | "wrong"
  | "not_assessed";

export type PubMedCalibrationDecision =
  | "follow_up"
  | "publishable"
  | "reject";

export type PubMedCalibrationTimeBucket = "fast" | "medium" | "slow";

export type PubMedCalibrationMissingContext =
  | "cps_comparison"
  | "full_article"
  | "medeffect_safety"
  | "nhp_data"
  | "noc_context"
  | "route_form"
  | "severity_management";

export interface PubMedCalibrationReview {
  id: string;
  setId: string;
  candidateId: string;
  reviewerId?: string | null;
  reviewerKey: string;
  interactionAssessment?: PubMedCalibrationInteractionAssessment | null;
  drugPairAssessment?: PubMedCalibrationDrugPairAssessment | null;
  resolutionAssessment?: PubMedCalibrationResolutionAssessment | null;
  severityManagementAssessment?: PubMedCalibrationSeverityManagementAssessment | null;
  decision?: PubMedCalibrationDecision | null;
  humanLabel?: PubMedHumanLabel | null;
  labelPurpose?: PubMedEvaluationSetPurpose | null;
  failureModes: PubMedCalibrationFailureMode[];
  evidenceRetrievalAssessment?: PubMedEvidenceRetrievalAssessment | null;
  aiInterpretationAssessment?: PubMedAiInterpretationAssessment | null;
  generalizationAssessment?: PubMedGeneralizationAssessment | null;
  automationSafetyAssessment?: PubMedAutomationSafetyAssessment | null;
  suggestedPrevention?: string | null;
  missingContext: PubMedCalibrationMissingContext[];
  timeBucket?: PubMedCalibrationTimeBucket | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type PubMedCalibrationReviewInput = Omit<
  PubMedCalibrationReview,
  "createdAt" | "failureModes" | "id" | "updatedAt"
> & {
  failureModes?: PubMedCalibrationFailureMode[];
};

export interface PubMedEvaluationSet {
  id: string;
  name: string;
  purpose: PubMedEvaluationSetPurpose;
  description: string;
  criteria: Record<string, unknown>;
  version: number;
  isLocked: boolean;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PubMedEvaluationSetCandidate {
  setId: string;
  candidateId: string;
  samplingReason: PubMedEvaluationSamplingReason;
  labelPurpose: PubMedEvaluationSetPurpose;
  expectedLabel: Record<string, unknown>;
  metadata: Record<string, unknown>;
  addedBy?: string | null;
  createdAt: string;
}

export interface PubMedEvaluationSetCandidateWithCandidate {
  evaluationSetCandidate: PubMedEvaluationSetCandidate;
  candidate: PubMedInteractionCandidate;
}

export interface PubMedEvaluationSetBundle {
  set: PubMedEvaluationSet;
  candidates: PubMedEvaluationSetCandidateWithCandidate[];
}

export interface PubMedCandidateAutomationMetric {
  aiDecision: PubMedAiDecision | "unassigned";
  aiReviewVerdict: PubMedAiReviewVerdict | "unreviewed";
  automationTier: PubMedAutomationTier | "unassigned";
  averageAiReviewScore?: number | null;
  candidateCount: number;
  fullTextEvidenceCount: number;
  fullyResolvedCount: number;
  monographEvidenceCount: number;
  unresolvedCount: number;
}

export interface PubMedCalibrationLabelMetric {
  aiDecision: PubMedAiDecision | "unassigned";
  automationTier: PubMedAutomationTier | "unassigned";
  averageAiReviewScore?: number | null;
  exactLabelMatchCount: number;
  humanLabel: PubMedHumanLabel | "unlabeled";
  labelDisagreementCount: number;
  labelPurpose: PubMedEvaluationSetPurpose;
  reviewCount: number;
}

export interface PubMedCalibrationFailureModeMetric {
  failureMode: PubMedCalibrationFailureMode;
  labelPurpose: PubMedEvaluationSetPurpose;
  reviewCount: number;
}

export interface PubMedEvaluationMetricsReport {
  automationMetrics: PubMedCandidateAutomationMetric[];
  calibrationLabelMetrics: PubMedCalibrationLabelMetric[];
  failureModeMetrics: PubMedCalibrationFailureModeMetric[];
}

export type InteractionEvaluationPurpose = PubMedEvaluationSetPurpose;

export type InteractionEvaluationSamplingReason =
  | "known_interaction"
  | "known_no_interaction"
  | "high_risk_pair"
  | "common_pair"
  | "class_interaction"
  | "product_specific"
  | "cps_supported"
  | "health_canada_only"
  | "pubmed_emerging"
  | "nhp_or_supplement"
  | "negative_control"
  | "prior_failure"
  | "random_drift_sample"
  | "manual";

export type InteractionEvaluationCategory =
  | InteractionActionCategory
  | "unclear";

export type InteractionEvaluationEvidenceSourceKind =
  | "cps_monograph"
  | "health_canada_product_monograph"
  | "pubmed"
  | "kg_edge"
  | "safety"
  | "nhp"
  | "other";

export type InteractionEvaluationEvidenceSupportType =
  | PubMedEvidenceSupportType
  | "source_silent"
  | "retrieved";

export interface InteractionEvaluationSet {
  id: string;
  name: string;
  purpose: InteractionEvaluationPurpose;
  description: string;
  criteria: Record<string, unknown>;
  version: number;
  isLocked: boolean;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InteractionEvaluationRequest {
  id: string;
  setId: string;
  inputSourceText: string;
  inputTargetText: string;
  requestFingerprint?: string | null;
  sourceCandidateId?: string | null;
  samplingReason: InteractionEvaluationSamplingReason;
  expectedCategory?: InteractionEvaluationCategory | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface InteractionEvaluationRun {
  id: string;
  requestId: string;
  runVersion: number;
  status: "completed" | "failed" | "not_run";
  resolvedSourceId?: string | null;
  resolvedTargetId?: string | null;
  resolvedSourceNode?: KgNode | null;
  resolvedTargetNode?: KgNode | null;
  resolvedEntities: Record<string, unknown>;
  answerCategory?: InteractionActionCategory | null;
  answerSummary?: string | null;
  severity?: InteractionSeverity | null;
  management?: string | null;
  confidence?: number | null;
  retrievalStrategyVersion: string;
  promptVersion?: string | null;
  model?: string | null;
  decisionTrace: PubMedAiDecisionTrace | Record<string, unknown>;
  automationTier?: PubMedAutomationTier | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface InteractionEvaluationEvidence {
  id: string;
  runId: string;
  sourceKind: InteractionEvaluationEvidenceSourceKind;
  sourceTable?: string | null;
  sourceId?: string | null;
  chunkId?: string | null;
  rank: number;
  supportType: InteractionEvaluationEvidenceSupportType;
  usedInAnswer: boolean;
  quote?: string | null;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface InteractionEvaluationLabel {
  id: string;
  setId: string;
  requestId: string;
  runId?: string | null;
  reviewerId?: string | null;
  reviewerKey: string;
  finalCategory?: InteractionEvaluationCategory | null;
  entityResolutionAssessment?: PubMedCalibrationResolutionAssessment | null;
  evidenceRetrievalAssessment?: PubMedEvidenceRetrievalAssessment | null;
  aiInterpretationAssessment?: PubMedAiInterpretationAssessment | null;
  managementAssessment?: PubMedCalibrationSeverityManagementAssessment | null;
  generalizationAssessment?: PubMedGeneralizationAssessment | null;
  automationSafetyAssessment?: PubMedAutomationSafetyAssessment | null;
  failureModes: PubMedCalibrationFailureMode[];
  missingContext: PubMedCalibrationMissingContext[];
  suggestedPrevention?: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type InteractionEvaluationLabelInput = Omit<
  InteractionEvaluationLabel,
  "createdAt" | "failureModes" | "id" | "updatedAt"
> & {
  failureModes?: PubMedCalibrationFailureMode[];
};

export interface InteractionEvaluationRunWithEvidence {
  evidence: InteractionEvaluationEvidence[];
  labels: InteractionEvaluationLabel[];
  run: InteractionEvaluationRun;
}

export interface InteractionEvaluationRequestWithRun {
  evidence: InteractionEvaluationEvidence[];
  labels: InteractionEvaluationLabel[];
  request: InteractionEvaluationRequest;
  run: InteractionEvaluationRun | null;
  runs: InteractionEvaluationRunWithEvidence[];
}

export interface InteractionEvaluationSetBundle {
  requests: InteractionEvaluationRequestWithRun[];
  set: InteractionEvaluationSet;
}

export interface PubMedAiReview {
  actionCategory: InteractionActionCategory;
  concerns: string[];
  decisionTrace?: PubMedAiDecisionTrace | null;
  entityResolutionNotes?: string | null;
  evidenceAssessment: string;
  recommendedRejectionReason?: PubMedRejectionReason | null;
  score: number;
  severityAssessment: string;
  summary: string;
  verdict: PubMedAiReviewVerdict;
}

export interface PubMedAiDecisionTrace {
  chunkAssessments?: Array<{
    chunkId?: string;
    conclusion: string;
    limitation?: string | null;
    quote?: string | null;
    supportType?: PubMedEvidenceSupportType | MonographEvidenceSupportType;
  }>;
  finalRationale?: string;
  retrievalNotes?: string;
  uncertainty?: string[];
}

export type PubMedEvidenceSourceType =
  | "abstract"
  | "paragraph"
  | "table"
  | "figure_caption"
  | "figure_interpretation"
  | "supplement";

export type PubMedEvidenceSupportType =
  | "supports_interaction"
  | "supports_mechanism"
  | "supports_severity"
  | "supports_management"
  | "contradicts_or_limits";

export type MonographEvidenceSupportType =
  | PubMedEvidenceSupportType
  | "source_silent";

export type MonographEvidenceSourceKind =
  | "cps_monograph"
  | "health_canada_product_monograph";

export type MonographEvidenceSide = "source" | "target" | "shared";

export interface PubMedEvidenceChunk {
  id: string;
  pmid: string;
  pmcid?: string | null;
  sourceType: PubMedEvidenceSourceType;
  sectionTitle?: string | null;
  sectionPath: string[];
  label?: string | null;
  content: string;
  structuredContent: Record<string, unknown>;
  relevanceScore?: number | null;
  extractionConfidence?: number | null;
  license?: string | null;
  sourceUrl?: string | null;
  createdAt: string;
}

export interface PubMedCandidateEvidence {
  chunk: PubMedEvidenceChunk;
  confidence?: number | null;
  quote?: string | null;
  supportType: PubMedEvidenceSupportType;
}

export interface MonographEvidenceFacts {
  counterpartMentioned?: boolean;
  enzymes?: string[];
  management?: string[];
  receptors?: string[];
  roles?: string[];
  transporters?: string[];
  [key: string]: unknown;
}

export interface PubMedCandidateMonographEvidence {
  chunkId: string;
  confidence?: number | null;
  content: string;
  extractedFacts: MonographEvidenceFacts;
  nodeId: string;
  nodeIdentifiers: Record<string, unknown>;
  nodeName?: string | null;
  nodeSource?: string | null;
  quote?: string | null;
  section?: string | null;
  side: MonographEvidenceSide;
  sourceKind: MonographEvidenceSourceKind;
  supportType: MonographEvidenceSupportType;
}

export interface PubMedApplicability {
  dose?: string;
  evidenceContext?: "human" | "animal" | "in_vitro" | "unknown";
  population?: string;
  route?: string;
  timing?: string;
}

export interface KgNode {
  id: string;
  type: KgNodeType;
  canonicalName: string;
  identifiers: Record<string, unknown>;
  uncertainty?: Record<string, unknown>;
  summary?: string | null;
  source: string;
  sourceConflicts?: string[];
  sourceCoverage?:
    | "cps_covered"
    | "cps_only"
    | "health_canada_only"
    | "possible_source_match"
    | "source_conflict";
  createdAt: string;
}

export interface HealthCanadaMonographProductExample {
  chunkCount: number;
  din?: string[] | null;
  drugCode?: string | null;
  name: string;
  nodeId: string;
  status?: string[] | null;
}

export interface HealthCanadaMonographCoverage {
  directProductCount: number;
  healthCanadaNodeCount: number;
  linkedProductCount: number;
  productExamples: HealthCanadaMonographProductExample[];
  sectionCounts: Record<string, number>;
  totalChunkCount: number;
  totalProductCount: number;
}

export interface CpsMonographExample {
  chunkCount: number;
  cpsId: string;
  matchKind: "direct" | "linked";
  name: string;
  nodeId: string;
  productNames: string[];
}

export interface CpsMonographCoverage {
  directMonographCount: number;
  linkedMonographCount: number;
  monographExamples: CpsMonographExample[];
  productListingCount: number;
  totalChunkCount: number;
}

export interface InteractionCitation {
  pmid: string;
  title?: string;
  year?: number;
  quote?: string;
}

export interface InteractionEdgeProperties {
  actionCategory?: InteractionActionCategory;
  aiDecisionTrace?: PubMedAiDecisionTrace | Record<string, unknown>;
  severity?: InteractionSeverity;
  mechanism?: string;
  management?: string;
  onset?: string;
  evidenceLevel?: string;
}

export interface InteractionRecord {
  id: string;
  sourceId: string;
  targetId: string;
  actionCategory?: InteractionActionCategory | null;
  aiDecisionTrace?: PubMedAiDecisionTrace | Record<string, unknown> | null;
  severity: InteractionSeverity;
  mechanism?: string | null;
  management?: string | null;
  evidenceLevel?: string | null;
  citations: InteractionCitation[];
  source: string;
}

export interface InteractionResult {
  inputPair: readonly [string, string];
  matchedVia: {
    leftNodeId: string;
    rightNodeId: string;
  };
  interaction: InteractionRecord;
}

export interface CpsSearchResult {
  chunkId: string;
  nodeId: string;
  nodeName: string;
  nodeType: KgNodeType;
  section?: string | null;
  excerpt: string;
  rank: number;
}

export interface PubMedInteractionCandidate {
  id: string;
  pmid: string;
  articleTitle?: string | null;
  articleYear?: number | null;
  subjectText: string;
  objectText: string;
  resolvedSourceId?: string | null;
  resolvedTargetId?: string | null;
  resolvedSourceNode?: KgNode | null;
  resolvedTargetNode?: KgNode | null;
  severity: InteractionSeverity;
  mechanism?: string | null;
  management?: string | null;
  evidenceLevel?: string | null;
  extractionConfidence: number;
  sourceQuote?: string | null;
  citations: InteractionCitation[];
  reviewStatus: EdgeReviewStatus;
  aiReview?: PubMedAiReview | null;
  aiReviewModel?: string | null;
  aiReviewRecommendedRejectionReason?: PubMedRejectionReason | null;
  aiReviewScore?: number | null;
  aiReviewVerdict?: PubMedAiReviewVerdict | null;
  aiReviewedAt?: string | null;
  aiDecision?: PubMedAiDecision | null;
  aiDecisionTrace?: PubMedAiDecisionTrace | Record<string, unknown> | null;
  automationTier?: PubMedAutomationTier | null;
  automationReason?: string | null;
  automationMetadata?: Record<string, unknown>;
  pipelineVersions?: Record<string, unknown>;
  kgUncertainty?: Record<string, unknown>;
  applicability?: PubMedApplicability | Record<string, unknown>;
  candidateEvidence?: PubMedCandidateEvidence[];
  evidenceSummary?: Record<string, unknown>;
  fullTextEvidenceCount: number;
  fullTextProcessed: boolean;
  interactionActionCategory?: InteractionActionCategory | null;
  monographEvidence?: PubMedCandidateMonographEvidence[];
  sourceCpsMonographCoverage?: CpsMonographCoverage | null;
  targetCpsMonographCoverage?: CpsMonographCoverage | null;
  sourceMonographCoverage?: HealthCanadaMonographCoverage | null;
  targetMonographCoverage?: HealthCanadaMonographCoverage | null;
  rejectionReason?: PubMedRejectionReason | null;
  rejectionFeedback?: Record<string, unknown> | null;
  reviewerNotes?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PubMedArticle {
  pmid: string;
  title: string;
  abstractText: string;
  year?: number;
  journal?: string;
}

export type LearningSubjectType =
  | "drug"
  | "drug_class"
  | "condition"
  | "skill"
  | "osce_station"
  | "therapeutic_area";

export type LearningSessionMode =
  | "non_interactive_audio"
  | "interactive_audio"
  | "interactive_app"
  | "osce_simulation";

export type LearningDepth = "quick" | "normal" | "deep";

export type LearningSessionStatus = "active" | "completed" | "abandoned";

export type LearningTurnSpeaker =
  | "student"
  | "lesson_guide"
  | "patient"
  | "examiner"
  | "system";

export interface LearningSubject {
  id: string;
  nodeId?: string | null;
  subjectType: LearningSubjectType;
  title: string;
  description?: string | null;
  tags: string[];
  source: string;
}

export interface LearningObjectiveProgress {
  [objectiveId: string]:
    | "not_started"
    | "introduced"
    | "practiced"
    | "mastered";
}

export interface LearningSessionRecord {
  id: string;
  userId: string;
  lessonId?: string | null;
  mode: LearningSessionMode;
  depth: LearningDepth;
  status: LearningSessionStatus;
  subjectIds: string[];
  coveredNodeIds: string[];
  voiceId: string;
  speechRate: number;
  objectiveProgress: LearningObjectiveProgress;
  weakAreas: string[];
  summary?: string | null;
  startedAt: string;
  endedAt?: string | null;
  durationSeconds: number;
}

export interface LearningSessionTurn {
  id: string;
  sessionId: string;
  userId: string;
  speaker: LearningTurnSpeaker;
  text: string;
  turnKind: "message" | "probe" | "choice" | "check_in" | "summary";
  choices: string[];
  mentionedNodeIds: string[];
  createdAt: string;
}

export interface TeachingFact {
  id: string;
  nodeIds: string[];
  label: string;
  explanation: string;
  detailLevel: "intro" | "standard" | "advanced";
  source: "authored" | "ATC" | "CPS" | "PubMed" | "manual_seed";
}

export interface TeachingContext {
  subjectNodes: LearningSubject[];
  prerequisiteNodes: LearningSubject[];
  relatedNodes: LearningSubject[];
  learningObjectives: string[];
  keyFacts: TeachingFact[];
  commonMisconceptions: string[];
  practicePrompts: Array<{
    answer?: string;
    choices?: string[];
    prompt: string;
  }>;
  safetyBoundaries: string[];
  citations: Array<{
    label: string;
    source: string;
  }>;
}

export interface ScopeDecision {
  allowed: boolean;
  reason?: "off_topic" | "medical_advice" | "unsafe" | "not_canadian_pharmacy";
  redirectMessage?: string;
}

export interface OsceScenario {
  id: string;
  subjectId?: string | null;
  title: string;
  description?: string | null;
  stationPrompt: string;
  patientProfile: Record<string, unknown>;
  hiddenConcerns: string[];
  expectedCounselingPoints: string[];
  tags: string[];
  source: string;
}

export interface OsceRubricItemRecord {
  id: string;
  scenarioId: string;
  label: string;
  requiredEvidence: string;
  maxScore: number;
  sortOrder: number;
}

export type OsceAttemptStatus = "active" | "completed" | "abandoned";

export interface StudentOsceAttempt {
  id: string;
  userId: string;
  scenarioId?: string | null;
  learningSessionId?: string | null;
  status: OsceAttemptStatus;
  score?: number | null;
  maxScore?: number | null;
  feedback?: string | null;
  rubricScores: Array<{
    evidence: string;
    itemId: string;
    score: number;
  }>;
  startedAt: string;
  completedAt?: string | null;
}

export interface LearningPreferences {
  depth: LearningDepth;
  speechRate: number;
  voiceId: string;
}

export interface LearningAnalyticsSummary {
  completedSessions: number;
  exposureCount: number;
  lastSeenAt?: string | null;
  practiceCount: number;
  weakAreas: string[];
}

export interface ElevenLabsSessionConfig {
  agentId: string;
  conversationConfigOverride?: {
    tts?: {
      similarity_boost?: number;
      speed?: number;
      stability?: number;
      voice_id?: string;
    };
  };
  conversationId?: string | null;
  expiresInSeconds: number;
  learningSessionId: string;
  signedUrl: string;
}
