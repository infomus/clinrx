import { getPowerSyncDatabase, isPowerSyncSupported } from "@/lib/powersync/system";
import { createLocalId } from "@/lib/study/ids";
import { supabase } from "@/lib/supabase";

export interface QuizChoice {
  id: string;
  text: string;
}

export interface QuizItem {
  id: string;
  topic: string;
  prompt: string;
  choices: QuizChoice[];
  correctChoiceId: string;
  explanation: string;
  difficulty?: string | null;
  tags: string[];
  dueAt?: string | null;
  reviewCount: number;
}

interface QuizItemRow {
  id: string;
  topic: string;
  prompt: string;
  choices: unknown;
  correct_answer: unknown;
  explanation: string;
  difficulty?: string | null;
  tags: unknown;
  due_at?: string | null;
  review_count?: number | null;
}

export interface SubmitQuizAnswerInput {
  elapsedMs: number;
  quizItem: QuizItem;
  selectedChoiceId: string;
  userId: string;
}

export async function listDueQuizItems(userId: string): Promise<QuizItem[]> {
  const database = await getPowerSyncDatabase();

  if (database && database.currentStatus.hasSynced === true) {
    const rows = await database.getAll<QuizItemRow>(
      `
        select
          quiz_item.id,
          quiz_item.topic,
          quiz_item.prompt,
          quiz_item.choices,
          quiz_item.correct_answer,
          quiz_item.explanation,
          quiz_item.difficulty,
          quiz_item.tags,
          student_spaced_repetition_state.due_at,
          student_spaced_repetition_state.review_count
        from quiz_item
        left join student_spaced_repetition_state
          on student_spaced_repetition_state.quiz_item_id = quiz_item.id
         and student_spaced_repetition_state.user_id = ?
        where student_spaced_repetition_state.due_at is null
           or student_spaced_repetition_state.due_at <= ?
        order by
          case when student_spaced_repetition_state.due_at is null then 0 else 1 end,
          student_spaced_repetition_state.due_at asc,
          quiz_item.created_at asc
        limit 20
      `,
      [userId, new Date().toISOString()],
    );

    return rows.map(mapQuizItemRow);
  }

  if (isPowerSyncSupported()) {
    return [];
  }

  return listDueQuizItemsFromSupabase(supabase, userId);
}

export async function submitQuizAnswer(
  input: SubmitQuizAnswerInput,
): Promise<{ isCorrect: boolean; nextDueAt: string }> {
  const now = new Date();
  const isCorrect = input.selectedChoiceId === input.quizItem.correctChoiceId;
  const nextDueAt = calculateNextDueAt(now, isCorrect, input.quizItem.reviewCount);
  const resultId = createLocalId();
  const stateId = createLocalId();
  const selectedAnswer = JSON.stringify({ choiceId: input.selectedChoiceId });
  const fsrsState = JSON.stringify({
    algorithm: "starter",
    lastGrade: isCorrect ? "good" : "again",
  });

  const database = await getPowerSyncDatabase();

  if (database && database.currentStatus.hasSynced === true) {
    await database.execute(
      `
        insert into student_quiz_result (
          id,
          user_id,
          quiz_item_id,
          selected_answer,
          is_correct,
          elapsed_ms,
          answered_at,
          created_at
        )
        values (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        resultId,
        input.userId,
        input.quizItem.id,
        selectedAnswer,
        isCorrect ? 1 : 0,
        input.elapsedMs,
        now.toISOString(),
        now.toISOString(),
      ],
    );

    await database.execute(
      `
        insert into student_spaced_repetition_state (
          id,
          user_id,
          quiz_item_id,
          stability,
          difficulty,
          due_at,
          last_reviewed_at,
          review_count,
          lapse_count,
          state,
          updated_at
        )
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        on conflict (user_id, quiz_item_id) do update set
          stability = excluded.stability,
          difficulty = excluded.difficulty,
          due_at = excluded.due_at,
          last_reviewed_at = excluded.last_reviewed_at,
          review_count = student_spaced_repetition_state.review_count + 1,
          lapse_count = student_spaced_repetition_state.lapse_count + ?,
          state = excluded.state,
          updated_at = excluded.updated_at
      `,
      [
        stateId,
        input.userId,
        input.quizItem.id,
        isCorrect ? 2.5 : 0.5,
        isCorrect ? 3 : 7,
        nextDueAt,
        now.toISOString(),
        1,
        isCorrect ? 0 : 1,
        fsrsState,
        now.toISOString(),
        isCorrect ? 0 : 1,
      ],
    );

    return { isCorrect, nextDueAt };
  }

  if (isPowerSyncSupported()) {
    throw new Error("Offline quiz data is still syncing.");
  }

  await submitQuizAnswerToSupabase({
    ...input,
    fsrsState,
    isCorrect,
    nextDueAt,
    resultId,
    selectedAnswer,
    stateId,
    submittedAt: now.toISOString(),
  });

  return { isCorrect, nextDueAt };
}

async function listDueQuizItemsFromSupabase(
  client: typeof supabase,
  userId: string,
): Promise<QuizItem[]> {
  const { data, error } = await client
    .from("quiz_item")
    .select(
      `
        id,
        topic,
        prompt,
        choices,
        correct_answer,
        explanation,
        difficulty,
        tags,
        student_spaced_repetition_state!left(due_at, review_count)
      `,
    )
    .eq("student_spaced_repetition_state.user_id", userId)
    .or(
      `student_spaced_repetition_state.due_at.is.null,student_spaced_repetition_state.due_at.lte.${new Date().toISOString()}`,
    )
    .order("created_at", { ascending: true })
    .limit(20);

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown[]).map((row) => {
    const typedRow = row as QuizItemRow & {
      student_spaced_repetition_state?:
        | { due_at?: string | null; review_count?: number | null }
        | { due_at?: string | null; review_count?: number | null }[]
        | null;
    };
    const reviewState = Array.isArray(typedRow.student_spaced_repetition_state)
      ? typedRow.student_spaced_repetition_state[0]
      : typedRow.student_spaced_repetition_state;

    return mapQuizItemRow({
      ...typedRow,
      due_at: reviewState?.due_at,
      review_count: reviewState?.review_count,
    } as QuizItemRow);
  });
}

async function submitQuizAnswerToSupabase(input: SubmitQuizAnswerInput & {
  fsrsState: string;
  isCorrect: boolean;
  nextDueAt: string;
  resultId: string;
  selectedAnswer: string;
  stateId: string;
  submittedAt: string;
}): Promise<void> {
  const { error: resultError } = await supabase.from("student_quiz_result").insert({
    id: input.resultId,
    user_id: input.userId,
    quiz_item_id: input.quizItem.id,
    selected_answer: JSON.parse(input.selectedAnswer),
    is_correct: input.isCorrect,
    elapsed_ms: input.elapsedMs,
    answered_at: input.submittedAt,
    created_at: input.submittedAt,
  });

  if (resultError) {
    throw resultError;
  }

  const { error: stateError } = await supabase
    .from("student_spaced_repetition_state")
    .upsert(
      {
        id: input.stateId,
        user_id: input.userId,
        quiz_item_id: input.quizItem.id,
        stability: input.isCorrect ? 2.5 : 0.5,
        difficulty: input.isCorrect ? 3 : 7,
        due_at: input.nextDueAt,
        last_reviewed_at: input.submittedAt,
        review_count: input.quizItem.reviewCount + 1,
        lapse_count: input.isCorrect ? 0 : 1,
        state: JSON.parse(input.fsrsState),
        updated_at: input.submittedAt,
      },
      { onConflict: "user_id,quiz_item_id" },
    );

  if (stateError) {
    throw stateError;
  }
}

function calculateNextDueAt(
  now: Date,
  isCorrect: boolean,
  reviewCount: number,
): string {
  const minutes = isCorrect ? Math.max(60, (reviewCount + 1) * 24 * 60) : 10;
  return new Date(now.getTime() + minutes * 60_000).toISOString();
}

function mapQuizItemRow(row: QuizItemRow): QuizItem {
  const correctAnswer = parseJsonRecord(row.correct_answer);

  return {
    id: row.id,
    topic: row.topic,
    prompt: row.prompt,
    choices: parseChoices(row.choices),
    correctChoiceId:
      typeof correctAnswer.choiceId === "string"
        ? correctAnswer.choiceId
        : "",
    explanation: row.explanation,
    difficulty: row.difficulty,
    tags: parseStringArray(row.tags),
    dueAt: row.due_at,
    reviewCount: row.review_count ?? 0,
  };
}

function parseChoices(value: unknown): QuizChoice[] {
  const parsed = parseJsonValue(value);

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.flatMap((choice) => {
    if (
      choice &&
      typeof choice === "object" &&
      "id" in choice &&
      "text" in choice &&
      typeof choice.id === "string" &&
      typeof choice.text === "string"
    ) {
      return [{ id: choice.id, text: choice.text }];
    }

    return [];
  });
}

function parseStringArray(value: unknown): string[] {
  const parsed = parseJsonValue(value);
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === "string")
    : [];
}

function parseJsonRecord(value: unknown): Record<string, unknown> {
  const parsed = parseJsonValue(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
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
