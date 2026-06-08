import { Platform } from "react-native";

import type {
  AbstractPowerSyncDatabase,
  PowerSyncBackendConnector,
  PowerSyncCredentials,
} from "@powersync/react-native";

import { supabase } from "@/lib/supabase";

const powerSyncEndpoint = process.env.EXPO_PUBLIC_POWERSYNC_URL;

let databasePromise: Promise<AbstractPowerSyncDatabase | null> | null = null;
let connectPromise: Promise<AbstractPowerSyncDatabase | null> | null = null;

export function getPowerSyncEndpoint(): string | null {
  return powerSyncEndpoint ?? null;
}

export function isPowerSyncSupported(): boolean {
  return Platform.OS !== "web" && Boolean(powerSyncEndpoint);
}

export async function getPowerSyncDatabase(): Promise<AbstractPowerSyncDatabase | null> {
  if (!isPowerSyncSupported()) {
    return null;
  }

  databasePromise ??= createPowerSyncDatabase();
  return databasePromise;
}

export async function connectPowerSync(): Promise<AbstractPowerSyncDatabase | null> {
  if (!isPowerSyncSupported()) {
    return null;
  }

  connectPromise ??= (async () => {
    const database = await getPowerSyncDatabase();

    if (!database) {
      return null;
    }

    if (!database.connected && !database.connecting) {
      await database.connect(new SupabasePowerSyncConnector());
    }

    return database;
  })();

  return connectPromise;
}

export async function disconnectAndClearPowerSync(): Promise<void> {
  const database = databasePromise ? await databasePromise : null;

  connectPromise = null;

  if (database) {
    await database.disconnectAndClear({ clearLocal: true });
  }
}

async function createPowerSyncDatabase(): Promise<AbstractPowerSyncDatabase> {
  const [{ PowerSyncDatabase, Schema, Table, column }, { OPSqliteOpenFactory }] =
    await Promise.all([
      import("@powersync/react-native"),
      import("@powersync/op-sqlite"),
    ]);

  const quizItem = new Table(
    {
      topic: column.text,
      prompt: column.text,
      choices: column.text,
      correct_answer: column.text,
      explanation: column.text,
      difficulty: column.text,
      tags: column.text,
      source: column.text,
      created_at: column.text,
      updated_at: column.text,
    },
    { indexes: { topic: ["topic"] } },
  );

  const lesson = new Table(
    {
      title: column.text,
      description: column.text,
      lesson_type: column.text,
      duration_seconds: column.integer,
      tags: column.text,
      source: column.text,
      created_at: column.text,
      updated_at: column.text,
    },
    { indexes: { lessonType: ["lesson_type"] } },
  );

  const lessonAudioAsset = new Table(
    {
      lesson_id: column.text,
      title: column.text,
      audio_url: column.text,
      transcript_summary: column.text,
      duration_seconds: column.integer,
      sort_order: column.integer,
      source: column.text,
      created_at: column.text,
      updated_at: column.text,
    },
    { indexes: { lesson: ["lesson_id", "sort_order"] } },
  );

  const learningSubject = new Table(
    {
      node_id: column.text,
      subject_type: column.text,
      title: column.text,
      description: column.text,
      tags: column.text,
      source: column.text,
      created_at: column.text,
      updated_at: column.text,
    },
    { indexes: { subjectType: ["subject_type"], title: ["title"] } },
  );

  const lessonSubject = new Table(
    {
      lesson_id: column.text,
      subject_id: column.text,
    },
    { indexes: { lesson: ["lesson_id"], subject: ["subject_id"] } },
  );

  const osceScenario = new Table(
    {
      subject_id: column.text,
      title: column.text,
      description: column.text,
      station_prompt: column.text,
      patient_profile: column.text,
      hidden_concerns: column.text,
      expected_counseling_points: column.text,
      tags: column.text,
      source: column.text,
      created_at: column.text,
      updated_at: column.text,
    },
    { indexes: { subject: ["subject_id"], title: ["title"] } },
  );

  const osceRubricItem = new Table(
    {
      scenario_id: column.text,
      label: column.text,
      required_evidence: column.text,
      max_score: column.integer,
      sort_order: column.integer,
      created_at: column.text,
      updated_at: column.text,
    },
    { indexes: { scenario: ["scenario_id", "sort_order"] } },
  );

  const studentQuizResult = new Table(
    {
      user_id: column.text,
      quiz_item_id: column.text,
      selected_answer: column.text,
      is_correct: column.integer,
      elapsed_ms: column.integer,
      answered_at: column.text,
      created_at: column.text,
    },
    { indexes: { userAnsweredAt: ["user_id", "answered_at"] } },
  );

  const studentSpacedRepetitionState = new Table(
    {
      user_id: column.text,
      quiz_item_id: column.text,
      stability: column.real,
      difficulty: column.real,
      due_at: column.text,
      last_reviewed_at: column.text,
      review_count: column.integer,
      lapse_count: column.integer,
      state: column.text,
      updated_at: column.text,
    },
    { indexes: { userDueAt: ["user_id", "due_at"] } },
  );

  const studentLessonProgress = new Table(
    {
      user_id: column.text,
      lesson_id: column.text,
      completed: column.integer,
      position_seconds: column.integer,
      last_opened_at: column.text,
      completed_at: column.text,
      updated_at: column.text,
    },
    { indexes: { userUpdatedAt: ["user_id", "updated_at"] } },
  );

  const studentSettings = new Table(
    {
      user_id: column.text,
      settings: column.text,
      updated_at: column.text,
    },
    { indexes: { user: ["user_id"] } },
  );

  const studentLearningProgress = new Table(
    {
      user_id: column.text,
      subject_id: column.text,
      lesson_id: column.text,
      exposure_count: column.integer,
      practice_count: column.integer,
      last_session_id: column.text,
      last_seen_at: column.text,
      objective_progress: column.text,
      weak_areas: column.text,
      updated_at: column.text,
    },
    { indexes: { userUpdatedAt: ["user_id", "updated_at"] } },
  );

  const studentOsceAttempt = new Table(
    {
      user_id: column.text,
      scenario_id: column.text,
      learning_session_id: column.text,
      status: column.text,
      score: column.real,
      max_score: column.real,
      feedback: column.text,
      rubric_scores: column.text,
      started_at: column.text,
      completed_at: column.text,
      updated_at: column.text,
    },
    { indexes: { userUpdatedAt: ["user_id", "updated_at"] } },
  );

  const profile = new Table({
    display_handle: column.text,
    created_at: column.text,
    updated_at: column.text,
  });

  const schema = new Schema({
    quiz_item: quizItem,
    lesson,
    lesson_audio_asset: lessonAudioAsset,
    learning_subject: learningSubject,
    lesson_subject: lessonSubject,
    osce_scenario: osceScenario,
    osce_rubric_item: osceRubricItem,
    student_quiz_result: studentQuizResult,
    student_spaced_repetition_state: studentSpacedRepetitionState,
    student_lesson_progress: studentLessonProgress,
    student_settings: studentSettings,
    student_learning_progress: studentLearningProgress,
    student_osce_attempt: studentOsceAttempt,
    profile,
  });

  const openFactory = new OPSqliteOpenFactory({
    dbFilename: "clinrx-powersync.db",
  });

  const database = new PowerSyncDatabase({
    schema,
    database: openFactory,
  });

  await database.init();

  return database;
}

class SupabasePowerSyncConnector implements PowerSyncBackendConnector {
  async fetchCredentials(): Promise<PowerSyncCredentials | null> {
    const endpoint = getPowerSyncEndpoint();

    if (!endpoint) {
      return null;
    }

    const { data, error } = await supabase.auth.getSession();

    if (error) {
      throw error;
    }

    const session = data.session;

    if (!session) {
      return null;
    }

    return {
      endpoint,
      token: session.access_token,
      expiresAt: session.expires_at
        ? new Date(session.expires_at * 1000)
        : undefined,
    };
  }

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const batch = await database.getCrudBatch();

    if (!batch) {
      return;
    }

    for (const operation of batch.crud) {
      await uploadOperation(operation.table, operation.id, operation.op, {
        ...(operation.opData ?? {}),
      });
    }

    await batch.complete();
  }
}

async function uploadOperation(
  table: string,
  id: string,
  operation: string,
  values: Record<string, unknown>,
): Promise<void> {
  switch (table) {
    case "profile":
      if (operation === "DELETE") {
        throw new Error("Profile deletion is not supported from the client");
      }

      await upsertProfile(id, values);
      break;
    case "student_quiz_result":
    case "student_spaced_repetition_state":
    case "student_lesson_progress":
    case "student_settings":
    case "student_learning_progress":
    case "student_osce_attempt":
      await uploadStudentOwnedRow(table, id, operation, values);
      break;
    default:
      throw new Error(`PowerSync upload is not implemented for ${table}`);
  }
}

async function upsertProfile(
  id: string,
  values: Record<string, unknown>,
): Promise<void> {
  const displayHandle = values.display_handle;

  if (typeof displayHandle !== "string" || !displayHandle.trim()) {
    return;
  }

  const { error } = await supabase
    .from("profile")
    .upsert(
      {
        id,
        display_handle: displayHandle,
      },
      { onConflict: "id" },
    );

  if (error) {
    throw error;
  }
}

async function uploadStudentOwnedRow(
  table:
    | "student_quiz_result"
    | "student_spaced_repetition_state"
    | "student_lesson_progress"
    | "student_settings"
    | "student_learning_progress"
    | "student_osce_attempt",
  id: string,
  operation: string,
  values: Record<string, unknown>,
): Promise<void> {
  if (operation === "DELETE") {
    const { error } = await supabase.from(table).delete().eq("id", id);

    if (error) {
      throw error;
    }

    return;
  }

  const { error } = await supabase.from(table).upsert(
    {
      id,
      ...values,
    },
    { onConflict: "id" },
  );

  if (error) {
    throw error;
  }
}
