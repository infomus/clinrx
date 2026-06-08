import {
  advanceLessonState,
  checkCanadianPharmacyStudyScope,
  createGuideTurn,
  createStillThereTurn,
  createSyntheticTeachingContext,
  defaultVoiceOptions,
  type LessonRuntimeState,
} from "@clinrx/core/learning";
import type {
  ElevenLabsSessionConfig,
  LearningAnalyticsSummary,
  LearningDepth,
  LearningPreferences,
  LearningSessionMode,
  LearningSessionRecord,
  LearningSessionTurn,
  LearningSubject,
  OsceRubricItemRecord,
  OsceScenario,
} from "@clinrx/types";

import { createLocalId } from "@/lib/study/ids";
import { supabase } from "@/lib/supabase";

export { defaultVoiceOptions };

export interface StartLearningSessionInput {
  depth: LearningDepth;
  mode: LearningSessionMode;
  osceScenarioId?: string | null;
  subjectIds: string[];
  userId: string;
  voiceId: string;
  speechRate: number;
}

interface LearningSubjectRow {
  id: string;
  node_id?: string | null;
  subject_type: LearningSubject["subjectType"];
  title: string;
  description?: string | null;
  tags: unknown;
  source: string;
}

interface OsceScenarioRow {
  id: string;
  subject_id?: string | null;
  title: string;
  description?: string | null;
  station_prompt: string;
  patient_profile: Record<string, unknown>;
  hidden_concerns: unknown;
  expected_counseling_points: unknown;
  tags: unknown;
  source: string;
}

interface OsceRubricItemRow {
  id: string;
  scenario_id: string;
  label: string;
  required_evidence: string;
  max_score: number;
  sort_order: number;
}

interface LearningSessionRow {
  id: string;
  user_id: string;
  lesson_id?: string | null;
  mode: LearningSessionMode;
  depth: LearningDepth;
  status: LearningSessionRecord["status"];
  subject_ids: unknown;
  covered_node_ids: unknown;
  voice_id: string;
  speech_rate: number;
  objective_progress: unknown;
  weak_areas: unknown;
  summary?: string | null;
  started_at: string;
  ended_at?: string | null;
  duration_seconds: number;
}

interface LearningTurnRow {
  id: string;
  session_id: string;
  user_id: string;
  speaker: LearningSessionTurn["speaker"];
  text: string;
  turn_kind: LearningSessionTurn["turnKind"];
  choices: unknown;
  mentioned_node_ids: unknown;
  created_at: string;
}

export async function listLearningSubjects(): Promise<LearningSubject[]> {
  const { data, error } = await supabase
    .from("learning_subject")
    .select("id,node_id,subject_type,title,description,tags,source")
    .order("title", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as LearningSubjectRow[]).map(mapSubjectRow);
}

export async function listOsceScenarios(): Promise<OsceScenario[]> {
  const { data, error } = await supabase
    .from("osce_scenario")
    .select(
      "id,subject_id,title,description,station_prompt,patient_profile,hidden_concerns,expected_counseling_points,tags,source",
    )
    .order("title", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as OsceScenarioRow[]).map(mapOsceScenarioRow);
}

export async function listOsceRubricItems(
  scenarioId: string,
): Promise<OsceRubricItemRecord[]> {
  const { data, error } = await supabase
    .from("osce_rubric_item")
    .select("id,scenario_id,label,required_evidence,max_score,sort_order")
    .eq("scenario_id", scenarioId)
    .order("sort_order", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as OsceRubricItemRow[]).map(mapOsceRubricRow);
}

export async function startLearningSession(
  input: StartLearningSessionInput,
): Promise<{
  session: LearningSessionRecord;
  turns: LearningSessionTurn[];
}> {
  const sessionId = createLocalId();
  const now = new Date().toISOString();
  const subjects = await getSubjectsById(input.subjectIds);
  const osceScenario = input.osceScenarioId
    ? await getOsceScenarioById(input.osceScenarioId)
    : null;
  const context = createSyntheticTeachingContext(subjects, input.depth);
  const openingTurn =
    input.mode === "osce_simulation" && osceScenario
      ? {
          choices: ["Start counseling", "Ask an opening question", "Review rubric"],
          speaker: "examiner" as const,
          text: `${osceScenario.stationPrompt}\n\nPatient profile: ${formatPatientProfile(
            osceScenario.patientProfile,
          )}`,
          turnKind: "message" as const,
        }
      : createGuideTurn(context, {
          completedObjectiveIds: [],
          currentObjectiveIndex: 0,
          depth: input.depth,
          mode: input.mode,
          subjectIds: input.subjectIds,
        });

  const { data: sessionData, error: sessionError } = await supabase
    .from("learning_session")
    .insert({
      id: sessionId,
      user_id: input.userId,
      mode: input.mode,
      depth: input.depth,
      subject_ids: input.subjectIds,
      voice_id: input.voiceId,
      speech_rate: input.speechRate,
      objective_progress: {
        "0": "introduced",
      },
      metadata: {
        osceScenarioId: input.osceScenarioId ?? null,
        provider: "pre_cps_simulator",
        source: "clinrx_authored",
      },
      started_at: now,
    })
    .select("*")
    .single();

  if (sessionError) {
    throw sessionError;
  }

  const turn = await insertLearningTurn({
    choices: openingTurn.choices,
    mentionedNodeIds: subjects.map((subject) => subject.nodeId ?? subject.id),
    sessionId,
    speaker: openingTurn.speaker,
    text: openingTurn.text,
    turnKind: openingTurn.turnKind,
    userId: input.userId,
  });

  if (input.mode === "osce_simulation" && input.osceScenarioId) {
    await createOsceAttempt({
      learningSessionId: sessionId,
      scenarioId: input.osceScenarioId,
      userId: input.userId,
    });
  }

  await upsertLearningProgress({
    lessonId: null,
    sessionId,
    subjectIds: input.subjectIds,
    userId: input.userId,
  });

  return {
    session: mapSessionRow(sessionData as LearningSessionRow),
    turns: [turn],
  };
}

export async function startElevenLabsVoiceSession(input: {
  agentId?: string;
  learningSessionId: string;
  speechRate?: number;
  voiceId?: string;
}): Promise<ElevenLabsSessionConfig> {
  const { data, error } = await supabase.functions.invoke(
    "start-elevenlabs-session",
    {
      body: {
        agentId: input.agentId,
        learningSessionId: input.learningSessionId,
        speechRate: input.speechRate,
        voiceId: input.voiceId,
      },
    },
  );

  if (error) {
    throw error;
  }

  return data as ElevenLabsSessionConfig;
}

export async function getLearningPreferences(
  userId: string,
): Promise<LearningPreferences> {
  const { data, error } = await supabase
    .from("student_settings")
    .select("settings")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const settings =
    typeof data?.settings === "object" && data.settings ? data.settings : {};
  const learning =
    "learning" in settings &&
    typeof settings.learning === "object" &&
    settings.learning
      ? (settings.learning as Partial<LearningPreferences>)
      : {};

  return {
    depth: learning.depth ?? "normal",
    speechRate: learning.speechRate ?? 1,
    voiceId: learning.voiceId ?? defaultVoiceOptions[0].id,
  };
}

export async function saveLearningPreferences(
  userId: string,
  preferences: LearningPreferences,
): Promise<void> {
  const now = new Date().toISOString();
  const { data, error: readError } = await supabase
    .from("student_settings")
    .select("id,settings")
    .eq("user_id", userId)
    .maybeSingle();

  if (readError) {
    throw readError;
  }

  const current =
    typeof data?.settings === "object" && data.settings ? data.settings : {};
  const { error } = await supabase.from("student_settings").upsert(
    {
      id: typeof data?.id === "string" ? data.id : createLocalId(),
      user_id: userId,
      settings: {
        ...current,
        learning: preferences,
      },
      updated_at: now,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    throw error;
  }
}

export async function getLearningAnalytics(
  userId: string,
): Promise<LearningAnalyticsSummary> {
  const [{ data: progressData, error: progressError }, { data: sessionData, error: sessionError }] =
    await Promise.all([
      supabase
        .from("student_learning_progress")
        .select("exposure_count,practice_count,last_seen_at,weak_areas")
        .eq("user_id", userId),
      supabase
        .from("learning_session")
        .select("id")
        .eq("user_id", userId)
        .eq("status", "completed"),
    ]);

  if (progressError) {
    throw progressError;
  }
  if (sessionError) {
    throw sessionError;
  }

  const weakAreas = new Set<string>();

  for (const row of progressData ?? []) {
    for (const weakArea of parseStringArray(row.weak_areas)) {
      weakAreas.add(weakArea);
    }
  }

  return {
    completedSessions: sessionData?.length ?? 0,
    exposureCount: (progressData ?? []).reduce(
      (sum, row) => sum + (row.exposure_count ?? 0),
      0,
    ),
    lastSeenAt:
      (progressData ?? [])
        .map((row) => row.last_seen_at)
        .filter((value): value is string => typeof value === "string")
        .sort()
        .at(-1) ?? null,
    practiceCount: (progressData ?? []).reduce(
      (sum, row) => sum + (row.practice_count ?? 0),
      0,
    ),
    weakAreas: [...weakAreas],
  };
}

export async function listRecentLearningSessions(
  userId: string,
): Promise<LearningSessionRecord[]> {
  const { data, error } = await supabase
    .from("learning_session")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(5);

  if (error) {
    throw error;
  }

  return ((data ?? []) as LearningSessionRow[]).map(mapSessionRow);
}

export async function listLearningTurns(
  sessionId: string,
): Promise<LearningSessionTurn[]> {
  const { data, error } = await supabase
    .from("learning_session_turn")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as LearningTurnRow[]).map(mapTurnRow);
}

export async function sendLearningResponse({
  session,
  text,
  turns,
  userId,
}: {
  session: LearningSessionRecord;
  text: string;
  turns: LearningSessionTurn[];
  userId: string;
}): Promise<LearningSessionTurn[]> {
  const scope = checkCanadianPharmacyStudyScope(text);
  const studentTurn = await insertLearningTurn({
    choices: [],
    mentionedNodeIds: [],
    sessionId: session.id,
    speaker: "student",
    text,
    turnKind: "message",
    userId,
  });

  if (!scope.allowed) {
    const redirect = await insertLearningTurn({
      choices: ["Return to lesson", "Repeat last part"],
      mentionedNodeIds: [],
      sessionId: session.id,
      speaker: "system",
      text:
        scope.redirectMessage ??
        "Let us keep this focused on Canadian pharmacy study.",
      turnKind: "message",
      userId,
    });

    return [...turns, studentTurn, redirect];
  }

  const adaptiveTurn = await createAdaptiveTurn(session.id, text);
  const subjects = await getSubjectsById(session.subjectIds);
  const context = createSyntheticTeachingContext(subjects, session.depth);
  const completedCount = turns.filter(
    (turn) => turn.speaker === "lesson_guide",
  ).length;
  const lowerText = text.toLowerCase();
  const nextState: LessonRuntimeState = lowerText.includes("repeat")
    ? {
        completedObjectiveIds: [],
        currentObjectiveIndex: Math.max(0, completedCount - 1),
        depth: session.depth,
        mode: session.mode,
        subjectIds: session.subjectIds,
      }
    : advanceLessonState({
        completedObjectiveIds: [],
        currentObjectiveIndex: completedCount,
        depth: session.depth,
        mode: session.mode,
        subjectIds: session.subjectIds,
      });
  const guideTurn = adaptiveTurn ?? createGuideTurn(
    context,
    lowerText.includes("deeper") ? { ...nextState, depth: "deep" } : nextState,
  );

  const insertedGuideTurn = await insertLearningTurn({
    choices: guideTurn.choices,
    mentionedNodeIds: subjects.map((subject) => subject.nodeId ?? subject.id),
    sessionId: session.id,
    speaker: guideTurn.speaker,
    text: guideTurn.text,
    turnKind: guideTurn.turnKind,
    userId,
  });

  await supabase
    .from("learning_session")
    .update({
      covered_node_ids: subjects.map((subject) => subject.nodeId ?? subject.id),
      duration_seconds: Math.max(
        1,
        Math.round((Date.now() - Date.parse(session.startedAt)) / 1000),
      ),
      objective_progress: {
        ...(adaptiveTurn?.objectiveProgress ?? {}),
        [String(nextState.currentObjectiveIndex)]: "introduced",
      },
      weak_areas: adaptiveTurn?.weakAreas ?? [],
    })
    .eq("id", session.id)
    .eq("user_id", userId);

  return [...turns, studentTurn, insertedGuideTurn];
}

async function createAdaptiveTurn(
  learningSessionId: string,
  learnerText: string,
): Promise<
  | {
      choices: string[];
      objectiveProgress?: Record<string, string>;
      speaker: LearningSessionTurn["speaker"];
      text: string;
      turnKind: LearningSessionTurn["turnKind"];
      weakAreas?: string[];
    }
  | null
> {
  const { data, error } = await supabase.functions.invoke("learning-next-turn", {
    body: {
      learnerText,
      learningSessionId,
    },
  });

  if (error || !data || typeof data !== "object") {
    return null;
  }

  const payload = data as {
    choices?: unknown;
    objectiveProgress?: Record<string, string>;
    speaker?: unknown;
    text?: unknown;
    turnKind?: unknown;
    weakAreas?: unknown;
  };

  if (typeof payload.text !== "string" || !payload.text.trim()) {
    return null;
  }

  return {
    choices: parseStringArray(payload.choices),
    objectiveProgress: payload.objectiveProgress ?? {},
    speaker:
      payload.speaker === "patient" ||
      payload.speaker === "examiner" ||
      payload.speaker === "system" ||
      payload.speaker === "lesson_guide"
        ? payload.speaker
        : "lesson_guide",
    text: payload.text,
    turnKind:
      payload.turnKind === "message" ||
      payload.turnKind === "probe" ||
      payload.turnKind === "check_in" ||
      payload.turnKind === "summary"
        ? payload.turnKind
        : "message",
    weakAreas: parseStringArray(payload.weakAreas),
  };
}

export async function addStillThereCheckIn({
  sessionId,
  turns,
  userId,
}: {
  sessionId: string;
  turns: LearningSessionTurn[];
  userId: string;
}): Promise<LearningSessionTurn[]> {
  const checkIn = createStillThereTurn();
  const inserted = await insertLearningTurn({
    choices: checkIn.choices,
    mentionedNodeIds: [],
    sessionId,
    speaker: checkIn.speaker,
    text: checkIn.text,
    turnKind: checkIn.turnKind,
    userId,
  });

  return [...turns, inserted];
}

export async function completeLearningSession({
  session,
  turns,
  userId,
}: {
  session: LearningSessionRecord;
  turns: LearningSessionTurn[];
  userId: string;
}): Promise<void> {
  const now = new Date().toISOString();
  const summary = `Covered ${session.subjectIds.length} subject${session.subjectIds.length === 1 ? "" : "s"} across ${turns.length} transcript turns.`;

  const { error } = await supabase
    .from("learning_session")
    .update({
      status: "completed",
      ended_at: now,
      duration_seconds: Math.max(
        1,
        Math.round((Date.now() - Date.parse(session.startedAt)) / 1000),
      ),
      summary,
      transcript: turns.map((turn) => ({
        speaker: turn.speaker,
        text: turn.text,
        createdAt: turn.createdAt,
      })),
    })
    .eq("id", session.id)
    .eq("user_id", userId);

  if (error) {
    throw error;
  }

  if (session.mode === "osce_simulation") {
    await supabase
      .from("student_osce_attempt")
      .update({
        completed_at: now,
        status: "completed",
        updated_at: now,
      })
      .eq("learning_session_id", session.id)
      .eq("user_id", userId);
  }
}

async function getSubjectsById(ids: readonly string[]): Promise<LearningSubject[]> {
  if (ids.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("learning_subject")
    .select("id,node_id,subject_type,title,description,tags,source")
    .in("id", [...ids]);

  if (error) {
    throw error;
  }

  return ((data ?? []) as LearningSubjectRow[]).map(mapSubjectRow);
}

async function getOsceScenarioById(
  scenarioId: string,
): Promise<OsceScenario | null> {
  const { data, error } = await supabase
    .from("osce_scenario")
    .select(
      "id,subject_id,title,description,station_prompt,patient_profile,hidden_concerns,expected_counseling_points,tags,source",
    )
    .eq("id", scenarioId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapOsceScenarioRow(data as OsceScenarioRow) : null;
}

async function createOsceAttempt(input: {
  learningSessionId: string;
  scenarioId: string;
  userId: string;
}): Promise<void> {
  const { error } = await supabase.from("student_osce_attempt").insert({
    id: createLocalId(),
    learning_session_id: input.learningSessionId,
    scenario_id: input.scenarioId,
    status: "active",
    user_id: input.userId,
  });

  if (error) {
    throw error;
  }
}

async function insertLearningTurn(input: {
  choices: string[];
  mentionedNodeIds: string[];
  sessionId: string;
  speaker: LearningSessionTurn["speaker"];
  text: string;
  turnKind: LearningSessionTurn["turnKind"];
  userId: string;
}): Promise<LearningSessionTurn> {
  const { data, error } = await supabase
    .from("learning_session_turn")
    .insert({
      id: createLocalId(),
      session_id: input.sessionId,
      user_id: input.userId,
      speaker: input.speaker,
      text: input.text,
      turn_kind: input.turnKind,
      choices: input.choices,
      mentioned_node_ids: input.mentionedNodeIds,
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return mapTurnRow(data as LearningTurnRow);
}

async function upsertLearningProgress(input: {
  lessonId: string | null;
  sessionId: string;
  subjectIds: readonly string[];
  userId: string;
}): Promise<void> {
  const now = new Date().toISOString();

  for (const subjectId of input.subjectIds) {
    await supabase.from("student_learning_progress").upsert(
      {
        id: createLocalId(),
        user_id: input.userId,
        subject_id: subjectId,
        lesson_id: input.lessonId,
        exposure_count: 1,
        last_session_id: input.sessionId,
        last_seen_at: now,
      },
      { onConflict: "user_id,subject_id,lesson_id" },
    );
  }
}

function mapSubjectRow(row: LearningSubjectRow): LearningSubject {
  return {
    id: row.id,
    nodeId: row.node_id,
    subjectType: row.subject_type,
    title: row.title,
    description: row.description,
    tags: parseStringArray(row.tags),
    source: row.source,
  };
}

function mapOsceScenarioRow(row: OsceScenarioRow): OsceScenario {
  return {
    id: row.id,
    subjectId: row.subject_id,
    title: row.title,
    description: row.description,
    stationPrompt: row.station_prompt,
    patientProfile: row.patient_profile ?? {},
    hiddenConcerns: parseStringArray(row.hidden_concerns),
    expectedCounselingPoints: parseStringArray(row.expected_counseling_points),
    tags: parseStringArray(row.tags),
    source: row.source,
  };
}

function mapOsceRubricRow(row: OsceRubricItemRow): OsceRubricItemRecord {
  return {
    id: row.id,
    scenarioId: row.scenario_id,
    label: row.label,
    requiredEvidence: row.required_evidence,
    maxScore: row.max_score,
    sortOrder: row.sort_order,
  };
}

function mapSessionRow(row: LearningSessionRow): LearningSessionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    lessonId: row.lesson_id,
    mode: row.mode,
    depth: row.depth,
    status: row.status,
    subjectIds: parseStringArray(row.subject_ids),
    coveredNodeIds: parseStringArray(row.covered_node_ids),
    voiceId: row.voice_id,
    speechRate: row.speech_rate,
    objectiveProgress:
      typeof row.objective_progress === "object" && row.objective_progress
        ? (row.objective_progress as LearningSessionRecord["objectiveProgress"])
        : {},
    weakAreas: parseStringArray(row.weak_areas),
    summary: row.summary,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationSeconds: row.duration_seconds,
  };
}

function mapTurnRow(row: LearningTurnRow): LearningSessionTurn {
  return {
    id: row.id,
    sessionId: row.session_id,
    userId: row.user_id,
    speaker: row.speaker,
    text: row.text,
    turnKind: row.turn_kind,
    choices: parseStringArray(row.choices),
    mentionedNodeIds: parseStringArray(row.mentioned_node_ids),
    createdAt: row.created_at,
  };
}

function parseStringArray(value: unknown): string[] {
  const parsed = parseJsonValue(value);
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === "string")
    : [];
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function formatPatientProfile(profile: Record<string, unknown>): string {
  const entries = Object.entries(profile)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => `${key}: ${String(value)}`);

  return entries.length > 0 ? entries.join("; ") : "standardized patient";
}
