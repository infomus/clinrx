import type {
  LearningDepth,
  LearningSessionMode,
  LearningSubject,
  ScopeDecision,
  TeachingContext,
  TeachingFact,
} from "@clinrx/types";

export interface SubjectSearchOptions {
  limit?: number;
  subjectTypes?: LearningSubject["subjectType"][];
}

export interface TeachingContextRequest {
  depth: LearningDepth;
  maxDepth: number;
  mode: "lesson" | "osce" | "quiz_review";
  subjectNodeIds: string[];
}

export interface NodeMention {
  nodeId?: string | null;
  text: string;
  type: LearningSubject["subjectType"];
}

export interface LearningKnowledgeProvider {
  checkScope(text: string): Promise<ScopeDecision>;
  getTeachingContext(input: TeachingContextRequest): Promise<TeachingContext>;
  resolveMentions(text: string): Promise<NodeMention[]>;
  searchSubjects(
    query: string,
    options?: SubjectSearchOptions,
  ): Promise<LearningSubject[]>;
}

export type LearnerSignal =
  | "answered_correctly"
  | "answered_partially"
  | "asked_repeat"
  | "asked_deeper"
  | "off_track"
  | "inactive";

export interface LessonRuntimeState {
  completedObjectiveIds: string[];
  currentObjectiveIndex: number;
  depth: LearningDepth;
  mode: LearningSessionMode;
  subjectIds: string[];
}

export interface LessonRuntimeTurn {
  choices: string[];
  objectiveId?: string;
  speaker: "lesson_guide" | "system";
  text: string;
  turnKind: "message" | "probe" | "check_in" | "summary";
}

export const defaultVoiceOptions = [
  { id: "hpp4J3VqNfWAUOO0d1Us", label: "Bella" },
  { id: "Xb7hH8MSUJpSbSDYk0k2", label: "Alice" },
  { id: "XrExE9yKIg1WjnnlVkGX", label: "Matilda" },
  { id: "cjVigY5qzO86Huf0OWal", label: "Eric" },
  { id: "CwhRBWXzGAHq8TQ4Fs17", label: "Roger" },
  { id: "onwK4e9ZLuTAKqWW03F9", label: "Daniel" },
] as const;

export function createSyntheticTeachingContext(
  subjects: readonly LearningSubject[],
  depth: LearningDepth,
): TeachingContext {
  const primary = subjects[0];
  const factDepth = depth === "deep" ? "advanced" : depth === "quick" ? "intro" : "standard";
  const fallbackTitle = primary?.title ?? "Canadian pharmacy study";
  const keyFacts: TeachingFact[] = [
    {
      id: "purpose",
      nodeIds: subjects.map((subject) => subject.nodeId ?? subject.id),
      label: "Purpose",
      explanation: `${fallbackTitle} should be approached by identifying what the patient is using, why it matters, and what safety or counseling decision the pharmacist must make.`,
      detailLevel: factDepth,
      source: "authored",
    },
    {
      id: "safety",
      nodeIds: subjects.map((subject) => subject.nodeId ?? subject.id),
      label: "Safety check",
      explanation:
        "A pharmacy learner should look for red flags, interaction risk, adherence barriers, monitoring needs, and when to escalate instead of reassuring.",
      detailLevel: factDepth,
      source: "authored",
    },
    {
      id: "teach_back",
      nodeIds: subjects.map((subject) => subject.nodeId ?? subject.id),
      label: "Teach-back",
      explanation:
        "The session should close by checking what the patient understood and inviting questions in plain language.",
      detailLevel: factDepth,
      source: "authored",
    },
  ];

  return {
    subjectNodes: [...subjects],
    prerequisiteNodes: [],
    relatedNodes: [],
    learningObjectives: [
      `Explain the core purpose of ${fallbackTitle}.`,
      "Identify safety checks and escalation points.",
      "Practice a concise teach-back or self-check.",
    ],
    keyFacts,
    commonMisconceptions: [
      "Do not treat a lack of obvious symptoms as proof that medication risk is absent.",
      "Do not skip patient understanding checks during counseling.",
    ],
    practicePrompts: [
      {
        prompt: `In one sentence, what is the most important pharmacist action for ${fallbackTitle}?`,
        choices: ["Check safety first", "Repeat that", "Keep going"],
      },
      {
        prompt: "What would make you escalate this situation instead of simply reassuring the patient?",
        choices: ["Interaction risk", "Adherence concern", "Patient confusion"],
      },
    ],
    safetyBoundaries: [
      "Educational support only; not patient-specific medical advice.",
      "Stay within Canadian pharmacy study and OSCE preparation.",
    ],
    citations: [{ label: "ClinRx authored pre-CPS teaching seed", source: "clinrx_authored" }],
  };
}

export function checkCanadianPharmacyStudyScope(text: string): ScopeDecision {
  const normalized = text.toLowerCase();
  const studyTerms = [
    "drug",
    "medication",
    "pharmacy",
    "patient",
    "osce",
    "counsel",
    "side effect",
    "interaction",
    "condition",
    "class",
    "dose",
    "repeat",
    "explain",
    "quiz",
    "keep going",
  ];
  const offTopicTerms = [
    "movie",
    "celebrity",
    "sports",
    "stock",
    "crypto",
    "dating",
    "politics",
  ];

  if (offTopicTerms.some((term) => normalized.includes(term))) {
    return {
      allowed: false,
      reason: "off_topic",
      redirectMessage:
        "I can help with Canadian pharmacy study, OSCE practice, or medication counseling. Let us return to the lesson.",
    };
  }

  if (
    normalized.includes("should i take") ||
    normalized.includes("should my patient take")
  ) {
    return {
      allowed: false,
      reason: "medical_advice",
      redirectMessage:
        "I cannot provide patient-specific medical advice. For study purposes, we can discuss the general counseling or escalation framework.",
    };
  }

  return {
    allowed: studyTerms.some((term) => normalized.includes(term)) || text.trim().length < 80,
    redirectMessage:
      "Let us keep this focused on Canadian pharmacy study and the current lesson.",
    reason: "not_canadian_pharmacy",
  };
}

export function createGuideTurn(
  context: TeachingContext,
  state: LessonRuntimeState,
): LessonRuntimeTurn {
  const objective = context.learningObjectives[state.currentObjectiveIndex];
  const fact =
    context.keyFacts[state.currentObjectiveIndex % context.keyFacts.length] ??
    context.keyFacts[0];
  const subjectTitle = context.subjectNodes.map((subject) => subject.title).join(", ");

  if (!objective || !fact) {
    return {
      choices: ["Review summary", "End lesson"],
      speaker: "lesson_guide",
      text: "We have covered the planned concepts for this lesson. Review the summary or end the session when you are ready.",
      turnKind: "summary",
    };
  }

  if (state.mode === "non_interactive_audio") {
    return {
      choices: ["Continue", "Slow down", "End lesson"],
      objectiveId: objective,
      speaker: "lesson_guide",
      text: `${subjectTitle}. ${objective} ${fact.explanation} Next, listen for the safety check and how you would explain it to a patient.`,
      turnKind: "message",
    };
  }

  return {
    choices: ["Check safety first", "Repeat that", "Go deeper", "Keep going"],
    objectiveId: objective,
    speaker: "lesson_guide",
    text: `${objective} ${fact.explanation} Quick check: what is the most important thing you would verify before moving on?`,
    turnKind: "probe",
  };
}

export function createStillThereTurn(): LessonRuntimeTurn {
  return {
    choices: ["I'm here", "Repeat last part", "Keep going"],
    speaker: "system",
    text: "Are you still there?",
    turnKind: "check_in",
  };
}

export function advanceLessonState(state: LessonRuntimeState): LessonRuntimeState {
  const completedObjectiveIds = Array.from(
    new Set([
      ...state.completedObjectiveIds,
      String(state.currentObjectiveIndex),
    ]),
  );

  return {
    ...state,
    completedObjectiveIds,
    currentObjectiveIndex: state.currentObjectiveIndex + 1,
  };
}
