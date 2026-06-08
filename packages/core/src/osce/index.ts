import type { VoiceTranscriptTurn } from "../voice/index.js";

export interface OsceRubricItem {
  id: string;
  label: string;
  maxScore: number;
  requiredEvidence: string;
}

export interface OsceRubric {
  id: string;
  title: string;
  items: OsceRubricItem[];
}

export interface OsceScoreItem {
  evidence: string;
  itemId: string;
  score: number;
}

export interface OsceScoreResult {
  feedback: string;
  items: OsceScoreItem[];
  rubricId: string;
  totalScore: number;
}

export function buildOsceScoringPayload(
  rubric: OsceRubric,
  transcript: readonly VoiceTranscriptTurn[],
): {
  rubric: OsceRubric;
  transcript: readonly VoiceTranscriptTurn[];
} {
  return {
    rubric,
    transcript,
  };
}

export function calculateOsceTotalScore(
  items: readonly OsceScoreItem[],
): number {
  return items.reduce((total, item) => total + item.score, 0);
}
