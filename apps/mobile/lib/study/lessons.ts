import { getPowerSyncDatabase, isPowerSyncSupported } from "@/lib/powersync/system";
import { createLocalId } from "@/lib/study/ids";
import { supabase } from "@/lib/supabase";

export interface StudyLesson {
  id: string;
  title: string;
  description?: string | null;
  lessonType: string;
  durationSeconds?: number | null;
  audioCount: number;
  completed: boolean;
  positionSeconds: number;
  tags: string[];
}

interface LessonRow {
  id: string;
  title: string;
  description?: string | null;
  lesson_type: string;
  duration_seconds?: number | null;
  tags: unknown;
  audio_count?: number | null;
  completed?: number | boolean | null;
  position_seconds?: number | null;
}

export async function listStudyLessons(userId: string): Promise<StudyLesson[]> {
  const database = await getPowerSyncDatabase();

  if (database && database.currentStatus.hasSynced === true) {
    const rows = await database.getAll<LessonRow>(
      `
        select
          lesson.id,
          lesson.title,
          lesson.description,
          lesson.lesson_type,
          lesson.duration_seconds,
          lesson.tags,
          coalesce(progress.completed, 0) as completed,
          coalesce(progress.position_seconds, 0) as position_seconds,
          count(asset.id) as audio_count
        from lesson
        left join student_lesson_progress progress
          on progress.lesson_id = lesson.id
         and progress.user_id = ?
        left join lesson_audio_asset asset
          on asset.lesson_id = lesson.id
        group by
          lesson.id,
          lesson.title,
          lesson.description,
          lesson.lesson_type,
          lesson.duration_seconds,
          lesson.tags,
          progress.completed,
          progress.position_seconds
        order by lesson.created_at asc
      `,
      [userId],
    );

    return rows.map(mapLessonRow);
  }

  if (isPowerSyncSupported()) {
    return [];
  }

  return listStudyLessonsFromSupabase(userId);
}

export async function markLessonComplete(
  lessonId: string,
  userId: string,
): Promise<void> {
  const now = new Date().toISOString();
  const database = await getPowerSyncDatabase();

  if (database && database.currentStatus.hasSynced === true) {
    await database.execute(
      `
        insert into student_lesson_progress (
          id,
          user_id,
          lesson_id,
          completed,
          position_seconds,
          last_opened_at,
          completed_at,
          updated_at
        )
        values (?, ?, ?, 1, 0, ?, ?, ?)
        on conflict (user_id, lesson_id) do update set
          completed = 1,
          last_opened_at = excluded.last_opened_at,
          completed_at = excluded.completed_at,
          updated_at = excluded.updated_at
      `,
      [createLocalId(), userId, lessonId, now, now, now],
    );
    return;
  }

  if (isPowerSyncSupported()) {
    throw new Error("Offline lesson data is still syncing.");
  }

  const { error } = await supabase.from("student_lesson_progress").upsert(
    {
      id: createLocalId(),
      user_id: userId,
      lesson_id: lessonId,
      completed: true,
      position_seconds: 0,
      last_opened_at: now,
      completed_at: now,
      updated_at: now,
    },
    { onConflict: "user_id,lesson_id" },
  );

  if (error) {
    throw error;
  }
}

async function listStudyLessonsFromSupabase(
  userId: string,
): Promise<StudyLesson[]> {
  const { data, error } = await supabase
    .from("lesson")
    .select(
      `
        id,
        title,
        description,
        lesson_type,
        duration_seconds,
        tags,
        lesson_audio_asset(id),
        student_lesson_progress!left(completed, position_seconds)
      `,
    )
    .eq("student_lesson_progress.user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => {
    const progress = Array.isArray(row.student_lesson_progress)
      ? row.student_lesson_progress[0]
      : row.student_lesson_progress;
    const assets = Array.isArray(row.lesson_audio_asset)
      ? row.lesson_audio_asset
      : [];

    return mapLessonRow({
      ...row,
      audio_count: assets.length,
      completed: progress?.completed,
      position_seconds: progress?.position_seconds,
    } as LessonRow);
  });
}

function mapLessonRow(row: LessonRow): StudyLesson {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    lessonType: row.lesson_type,
    durationSeconds: row.duration_seconds,
    audioCount: row.audio_count ?? 0,
    completed: row.completed === true || row.completed === 1,
    positionSeconds: row.position_seconds ?? 0,
    tags: parseStringArray(row.tags),
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
