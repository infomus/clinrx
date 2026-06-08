export interface LessonConcept {
  id: string;
  title: string;
  required: boolean;
}

export interface InteractiveLessonState {
  completedConceptIds: string[];
  currentConceptId: string;
  detourStack: LessonDetour[];
  lessonId: string;
  plannedConcepts: LessonConcept[];
}

export interface LessonDetour {
  conceptId: string;
  reason: "student_question" | "repeat" | "go_deeper";
  returnToConceptId: string;
}

export type LessonAction =
  | { type: "mark_concept_covered"; conceptId: string }
  | { type: "repeat_current" }
  | { type: "go_deeper"; conceptId?: string }
  | { type: "resume_plan" };

export function applyLessonAction(
  state: InteractiveLessonState,
  action: LessonAction,
): InteractiveLessonState {
  switch (action.type) {
    case "mark_concept_covered":
      return advanceAfterCoverage(state, action.conceptId);
    case "repeat_current":
      return addDetour(state, "repeat", state.currentConceptId);
    case "go_deeper":
      return addDetour(
        state,
        "go_deeper",
        action.conceptId ?? state.currentConceptId,
      );
    case "resume_plan":
      return resumePlan(state);
  }
}

function advanceAfterCoverage(
  state: InteractiveLessonState,
  conceptId: string,
): InteractiveLessonState {
  const completedConceptIds = Array.from(
    new Set([...state.completedConceptIds, conceptId]),
  );
  const currentIndex = state.plannedConcepts.findIndex(
    (concept) => concept.id === conceptId,
  );
  const nextConcept = state.plannedConcepts
    .slice(Math.max(currentIndex + 1, 0))
    .find((concept) => !completedConceptIds.includes(concept.id));

  return {
    ...state,
    completedConceptIds,
    currentConceptId: nextConcept?.id ?? state.currentConceptId,
  };
}

function addDetour(
  state: InteractiveLessonState,
  reason: LessonDetour["reason"],
  conceptId: string,
): InteractiveLessonState {
  return {
    ...state,
    currentConceptId: conceptId,
    detourStack: [
      ...state.detourStack,
      {
        conceptId,
        reason,
        returnToConceptId: state.currentConceptId,
      },
    ],
  };
}

function resumePlan(state: InteractiveLessonState): InteractiveLessonState {
  const [detour, ...remainingDetours] = [...state.detourStack].reverse();

  if (!detour) {
    return state;
  }

  return {
    ...state,
    currentConceptId: detour.returnToConceptId,
    detourStack: remainingDetours.reverse(),
  };
}
