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
  reviewerId: string;
  interactionAssessment?: PubMedCalibrationInteractionAssessment | null;
  drugPairAssessment?: PubMedCalibrationDrugPairAssessment | null;
  resolutionAssessment?: PubMedCalibrationResolutionAssessment | null;
  severityManagementAssessment?: PubMedCalibrationSeverityManagementAssessment | null;
  decision?: PubMedCalibrationDecision | null;
  missingContext: PubMedCalibrationMissingContext[];
  timeBucket?: PubMedCalibrationTimeBucket | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type PubMedCalibrationReviewInput = Omit<
  PubMedCalibrationReview,
  "createdAt" | "id" | "updatedAt"
>;

export interface PubMedAiReview {
  concerns: string[];
  entityResolutionNotes?: string | null;
  evidenceAssessment: string;
  recommendedRejectionReason?: PubMedRejectionReason | null;
  score: number;
  severityAssessment: string;
  summary: string;
  verdict: PubMedAiReviewVerdict;
}

export interface KgNode {
  id: string;
  type: KgNodeType;
  canonicalName: string;
  identifiers: Record<string, unknown>;
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

export interface InteractionCitation {
  pmid: string;
  title?: string;
  year?: number;
  quote?: string;
}

export interface InteractionEdgeProperties {
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
