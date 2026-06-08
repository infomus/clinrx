import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  CirclePlay,
  Headphones,
  Mic,
  MessageSquareText,
  ClipboardCheck,
  SlidersHorizontal,
} from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import type {
  LearningDepth,
  LearningSessionMode,
  LearningSessionRecord,
  LearningSessionTurn,
  OsceScenario,
} from "@clinrx/types";

import { FeatureShell } from "@/components/FeatureShell";
import { useAuthSession } from "@/hooks/useAuthSession";
import { usePowerSyncStatus } from "@/lib/powersync/PowerSyncProvider";
import {
  addStillThereCheckIn,
  completeLearningSession,
  defaultVoiceOptions,
  getLearningAnalytics,
  getLearningPreferences,
  listLearningSubjects,
  listOsceRubricItems,
  listOsceScenarios,
  listRecentLearningSessions,
  saveLearningPreferences,
  sendLearningResponse,
  startElevenLabsVoiceSession,
  startLearningSession,
} from "@/lib/study/learningSessions";
import {
  listStudyLessons,
  markLessonComplete,
  type StudyLesson,
} from "@/lib/study/lessons";

export default function PrepScreen() {
  const { session } = useAuthSession();

  return (
    <FeatureShell
      description="Build interactive lessons and OSCE practice against authored pre-CPS teaching packets now; swap in CPS-backed context when the licensed dataset arrives."
      eyebrow="Audio lessons / OSCE prep"
      session={session}
      title="Audio & OSCE Prep"
    >
      {session ? <PrepWorkbench userId={session.user.id} /> : null}
    </FeatureShell>
  );
}

function PrepWorkbench({ userId }: { userId: string }) {
  const [activeSession, setActiveSession] =
    useState<LearningSessionRecord | null>(null);
  const [activeScenario, setActiveScenario] = useState<OsceScenario | null>(
    null,
  );
  const [turns, setTurns] = useState<LearningSessionTurn[]>([]);

  return (
    <View className="gap-5">
      <SessionBuilder
        activeSession={activeSession}
        setActiveScenario={setActiveScenario}
        setActiveSession={setActiveSession}
        setTurns={setTurns}
        userId={userId}
      />
      {activeSession ? (
        <TranscriptPanel
          scenario={activeScenario}
          session={activeSession}
          setActiveSession={setActiveSession}
          setTurns={setTurns}
          turns={turns}
          userId={userId}
        />
      ) : null}
      <LearningAnalytics userId={userId} />
      <LessonsPanel userId={userId} />
      <RecentSessions userId={userId} />
    </View>
  );
}

function SessionBuilder({
  activeSession,
  setActiveScenario,
  setActiveSession,
  setTurns,
  userId,
}: {
  activeSession: LearningSessionRecord | null;
  setActiveScenario: (scenario: OsceScenario | null) => void;
  setActiveSession: (session: LearningSessionRecord | null) => void;
  setTurns: (turns: LearningSessionTurn[]) => void;
  userId: string;
}) {
  const queryClient = useQueryClient();
  const subjectsQuery = useQuery({
    queryKey: ["learning-subjects"],
    queryFn: listLearningSubjects,
  });
  const scenariosQuery = useQuery({
    queryKey: ["osce-scenarios"],
    queryFn: listOsceScenarios,
  });
  const preferencesQuery = useQuery({
    queryKey: ["learning-preferences", userId],
    queryFn: () => getLearningPreferences(userId),
  });
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(
    null,
  );
  const [mode, setMode] = useState<LearningSessionMode>("interactive_app");
  const [depth, setDepth] = useState<LearningDepth>("normal");
  const [voiceId, setVoiceId] = useState<string>(defaultVoiceOptions[0].id);
  const [speechRate, setSpeechRate] = useState(1);

  useEffect(() => {
    if (!preferencesQuery.data) {
      return;
    }

    setDepth(preferencesQuery.data.depth);
    setSpeechRate(preferencesQuery.data.speechRate);
    setVoiceId(preferencesQuery.data.voiceId);
  }, [preferencesQuery.data]);

  const startMutation = useMutation({
    mutationFn: async () => {
      const selectedScenario =
        mode === "osce_simulation"
          ? scenariosQuery.data?.find(
              (scenario) => scenario.id === selectedScenarioId,
            ) ?? scenariosQuery.data?.[0]
          : null;
      const subjectIds =
        selectedSubjectIds.length > 0
          ? selectedSubjectIds
          : selectedScenario?.subjectId
            ? [selectedScenario.subjectId]
            : subjectsQuery.data?.[0]
              ? [subjectsQuery.data[0].id]
              : [];

      await saveLearningPreferences(userId, {
        depth,
        speechRate,
        voiceId,
      });

      return startLearningSession({
        depth,
        mode,
        osceScenarioId: selectedScenario?.id ?? null,
        subjectIds,
        userId,
        voiceId,
        speechRate,
      });
    },
    onSuccess: ({ session, turns }) => {
      const selectedScenario =
        session.mode === "osce_simulation"
          ? scenariosQuery.data?.find(
              (scenario) => scenario.id === selectedScenarioId,
            ) ?? scenariosQuery.data?.[0] ?? null
          : null;
      setActiveScenario(selectedScenario);
      setActiveSession(session);
      setTurns(turns);
      void queryClient.invalidateQueries({
        queryKey: ["recent-learning-sessions", userId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["learning-analytics", userId],
      });
    },
  });

  const subjects = subjectsQuery.data ?? [];
  const scenarios = scenariosQuery.data ?? [];

  return (
    <View className="rounded-lg border border-ink/10 bg-white p-4">
      <View className="flex-row items-center gap-2">
        <SlidersHorizontal color="#17211f" size={20} />
        <Text className="text-lg font-semibold text-ink">Session setup</Text>
      </View>
      <Text className="mt-2 leading-6 text-ink/70">
        Pick a subject, lesson mode, depth, voice, and speed. This uses the
        pre-CPS knowledge provider abstraction and records a real session
        transcript.
      </Text>

      <Text className="mt-5 text-sm font-semibold uppercase text-ink/60">
        Subject
      </Text>
      <ScrollView
        className="mt-3"
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        <View className="flex-row gap-2">
          {subjects.map((subject) => {
            const selected = selectedSubjectIds.includes(subject.id);
            return (
              <Chip
                key={subject.id}
                label={subject.title}
                selected={selected}
                onPress={() =>
                  setSelectedSubjectIds((current) =>
                    selected
                      ? current.filter((id) => id !== subject.id)
                      : [...current, subject.id],
                  )
                }
              />
            );
          })}
        </View>
      </ScrollView>

      <Text className="mt-5 text-sm font-semibold uppercase text-ink/60">
        Mode
      </Text>
      <View className="mt-3 gap-2">
        <ModeOption
          description="One-way guided narration for walking, running, or when input is not possible."
          icon={<Headphones color="#17211f" size={20} />}
          label="Non-interactive audio"
          selected={mode === "non_interactive_audio"}
          onPress={() => setMode("non_interactive_audio")}
        />
        <ModeOption
          description="Conversational lesson flow with understanding checks and detours."
          icon={<Mic color="#17211f" size={20} />}
          label="Interactive audio"
          selected={mode === "interactive_audio"}
          onPress={() => setMode("interactive_audio")}
        />
        <ModeOption
          description="Transcript chat with suggested replies and optional typed responses."
          icon={<MessageSquareText color="#17211f" size={20} />}
          label="Interactive app"
          selected={mode === "interactive_app"}
          onPress={() => setMode("interactive_app")}
        />
        <ModeOption
          description="Standardized patient station with rubric-linked attempt tracking."
          icon={<ClipboardCheck color="#17211f" size={20} />}
          label="OSCE simulation"
          selected={mode === "osce_simulation"}
          onPress={() => setMode("osce_simulation")}
        />
      </View>

      {mode === "osce_simulation" ? (
        <>
          <Text className="mt-5 text-sm font-semibold uppercase text-ink/60">
            OSCE station
          </Text>
          <View className="mt-3 gap-2">
            {scenarios.map((scenario) => (
              <ModeOption
                description={
                  scenario.description ?? "Practice this authored OSCE station."
                }
                icon={<ClipboardCheck color="#17211f" size={20} />}
                key={scenario.id}
                label={scenario.title}
                selected={
                  selectedScenarioId
                    ? selectedScenarioId === scenario.id
                    : scenarios[0]?.id === scenario.id
                }
                onPress={() => {
                  setSelectedScenarioId(scenario.id);
                  if (scenario.subjectId) {
                    setSelectedSubjectIds([scenario.subjectId]);
                  }
                }}
              />
            ))}
          </View>
        </>
      ) : null}

      <View className="mt-5 flex-row flex-wrap gap-2">
        {(["quick", "normal", "deep"] satisfies LearningDepth[]).map((value) => (
          <Chip
            key={value}
            label={depthLabels[value]}
            selected={depth === value}
            onPress={() => setDepth(value)}
          />
        ))}
      </View>

      <Text className="mt-5 text-sm font-semibold uppercase text-ink/60">
        Voice
      </Text>
      <View className="mt-3 flex-row flex-wrap gap-2">
        {defaultVoiceOptions.map((voice) => (
          <Chip
            key={voice.id}
            label={voice.label}
            selected={voiceId === voice.id}
            onPress={() => setVoiceId(voice.id)}
          />
        ))}
      </View>

      <Text className="mt-5 text-sm font-semibold uppercase text-ink/60">
        Speed
      </Text>
      <View className="mt-3 flex-row flex-wrap gap-2">
        {[0.8, 1, 1.1, 1.2].map((rate) => (
          <Chip
            key={rate}
            label={`${rate}x`}
            selected={speechRate === rate}
            onPress={() => setSpeechRate(rate)}
          />
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        className={`mt-5 rounded-lg px-4 py-3 ${
          activeSession ? "bg-leaf" : "bg-ink"
        }`}
        disabled={
          startMutation.isPending ||
          subjects.length === 0 ||
          (mode === "osce_simulation" && scenarios.length === 0)
        }
        onPress={() => startMutation.mutate()}
      >
        <Text className="text-center font-semibold text-white">
          {startMutation.isPending
            ? "Starting..."
            : activeSession
              ? "Start new session"
              : "Start session"}
        </Text>
      </Pressable>
    </View>
  );
}

function TranscriptPanel({
  scenario,
  session,
  setActiveSession,
  setTurns,
  turns,
  userId,
}: {
  scenario: OsceScenario | null;
  session: LearningSessionRecord;
  setActiveSession: (session: LearningSessionRecord | null) => void;
  setTurns: (turns: LearningSessionTurn[]) => void;
  turns: LearningSessionTurn[];
  userId: string;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [voiceReady, setVoiceReady] = useState<string | null>(null);
  const visibleChoices = useMemo(
    () => [...(turns.at(-1)?.choices ?? []), "Are you still there?"],
    [turns],
  );
  const rubricQuery = useQuery({
    enabled: Boolean(scenario),
    queryKey: ["osce-rubric", scenario?.id],
    queryFn: () => listOsceRubricItems(scenario?.id ?? ""),
  });

  const sendMutation = useMutation({
    mutationFn: (text: string) =>
      sendLearningResponse({
        session,
        text,
        turns,
        userId,
      }),
    onSuccess: (nextTurns) => {
      setTurns(nextTurns);
      setDraft("");
    },
  });

  const checkInMutation = useMutation({
    mutationFn: () =>
      addStillThereCheckIn({
        sessionId: session.id,
        turns,
        userId,
      }),
    onSuccess: setTurns,
  });

  const completeMutation = useMutation({
    mutationFn: () =>
      completeLearningSession({
        session,
        turns,
        userId,
      }),
    onSuccess: () => {
      setActiveSession(null);
      setTurns([]);
      void queryClient.invalidateQueries({
        queryKey: ["recent-learning-sessions", userId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["learning-analytics", userId],
      });
    },
  });
  const voiceMutation = useMutation({
    mutationFn: () =>
      startElevenLabsVoiceSession({
        learningSessionId: session.id,
        speechRate: session.speechRate,
        voiceId: session.voiceId,
      }),
    onSuccess: (config) => {
      setVoiceReady(config.conversationId ?? "ready");
    },
  });

  return (
    <View className="rounded-lg border border-ink/10 bg-white p-4">
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1">
          <Text className="text-lg font-semibold text-ink">
            Live lesson transcript
          </Text>
          <Text className="mt-1 text-sm text-ink/60">
            {modeLabels[session.mode]} · {depthLabels[session.depth]} ·{" "}
            {session.speechRate}x
          </Text>
        </View>
        {session.mode === "interactive_audio" ||
        session.mode === "non_interactive_audio" ||
        session.mode === "osce_simulation" ? (
          <Pressable
            accessibilityRole="button"
            className="rounded-lg border border-leaf/40 px-3 py-2"
            disabled={voiceMutation.isPending}
            onPress={() => voiceMutation.mutate()}
          >
            <Text className="font-semibold text-leaf">
              {voiceMutation.isPending
                ? "Connecting..."
                : voiceReady
                  ? "Voice ready"
                  : "Start voice"}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          className="rounded-lg border border-ink/10 px-3 py-2"
          disabled={completeMutation.isPending}
          onPress={() => completeMutation.mutate()}
        >
          <Text className="font-semibold text-ink">End</Text>
        </Pressable>
      </View>

      {voiceMutation.isError ? (
        <Text className="mt-3 rounded-lg border border-coral/20 bg-coral/5 p-3 text-sm text-coral">
          {voiceMutation.error instanceof Error
            ? voiceMutation.error.message
            : "Could not start ElevenLabs voice session."}
        </Text>
      ) : null}

      {scenario ? (
        <View className="mt-4 rounded-lg border border-ink/10 bg-mist p-3">
          <Text className="font-semibold text-ink">{scenario.title}</Text>
          <Text className="mt-2 text-sm leading-5 text-ink/70">
            {scenario.stationPrompt}
          </Text>
          {rubricQuery.data?.length ? (
            <View className="mt-3 gap-2">
              {rubricQuery.data.map((item) => (
                <Text className="text-sm text-ink/70" key={item.id}>
                  {item.sortOrder}. {item.label} ({item.maxScore})
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      <View className="mt-4 gap-3">
        {turns.map((turn) => (
          <TranscriptTurnBubble key={turn.id} turn={turn} />
        ))}
      </View>

      <View className="mt-4 flex-row flex-wrap gap-2">
        {visibleChoices.map((choice) => (
          <Pressable
            accessibilityRole="button"
            className="rounded-lg border border-ink/10 bg-mist px-3 py-2"
            disabled={sendMutation.isPending || checkInMutation.isPending}
            key={choice}
            onPress={() =>
              choice === "Are you still there?"
                ? checkInMutation.mutate()
                : sendMutation.mutate(choice)
            }
          >
            <Text className="text-sm font-semibold text-ink">{choice}</Text>
          </Pressable>
        ))}
      </View>

      {session.mode !== "non_interactive_audio" ? (
        <View className="mt-4 gap-2">
          <TextInput
            className="min-h-12 rounded-lg border border-ink/10 bg-white px-3 py-2 text-ink"
            multiline
            onChangeText={setDraft}
            placeholder="Type a response, or ask to repeat/go deeper"
            placeholderTextColor="#6f7a75"
            value={draft}
          />
          <Pressable
            accessibilityRole="button"
            className="rounded-lg bg-ink px-4 py-3"
            disabled={!draft.trim() || sendMutation.isPending}
            onPress={() => sendMutation.mutate(draft.trim())}
          >
            <Text className="text-center font-semibold text-white">
              Send response
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function TranscriptTurnBubble({ turn }: { turn: LearningSessionTurn }) {
  const student = turn.speaker === "student";

  return (
    <View
      className={`max-w-full rounded-lg px-3 py-2 ${
        student ? "ml-8 bg-leaf" : "mr-8 bg-mist"
      }`}
    >
      <Text
        className={`text-xs font-semibold uppercase ${
          student ? "text-white/70" : "text-ink/50"
        }`}
      >
        {speakerLabels[turn.speaker]}
      </Text>
      <Text className={`mt-1 leading-6 ${student ? "text-white" : "text-ink"}`}>
        {turn.text}
      </Text>
    </View>
  );
}

function LearningAnalytics({ userId }: { userId: string }) {
  const analyticsQuery = useQuery({
    queryKey: ["learning-analytics", userId],
    queryFn: () => getLearningAnalytics(userId),
  });

  if (!analyticsQuery.data) {
    return null;
  }

  const analytics = analyticsQuery.data;

  return (
    <View className="rounded-lg border border-ink/10 bg-white p-4">
      <Text className="text-base font-semibold text-ink">Progress signals</Text>
      <View className="mt-3 flex-row flex-wrap gap-2">
        <Metric label="Sessions" value={analytics.completedSessions} />
        <Metric label="Exposures" value={analytics.exposureCount} />
        <Metric label="Practice" value={analytics.practiceCount} />
      </View>
      {analytics.weakAreas.length ? (
        <Text className="mt-3 text-sm leading-5 text-ink/70">
          Focus areas: {analytics.weakAreas.join(", ")}
        </Text>
      ) : null}
    </View>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <View className="min-w-24 rounded-lg bg-mist px-3 py-2">
      <Text className="text-xs font-semibold uppercase text-ink/50">
        {label}
      </Text>
      <Text className="mt-1 text-lg font-semibold text-ink">{value}</Text>
    </View>
  );
}

function LessonsPanel({ userId }: { userId: string }) {
  const powerSync = usePowerSyncStatus();
  const queryClient = useQueryClient();

  const lessonsQuery = useQuery({
    queryKey: ["study-lessons", userId],
    queryFn: () => listStudyLessons(userId),
  });

  const completeMutation = useMutation({
    mutationFn: (lessonId: string) => markLessonComplete(lessonId, userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["study-lessons", userId] });
    },
  });

  return (
    <View className="gap-4">
      <View className="rounded-lg border border-ink/10 bg-white p-4">
        <Text className="text-base font-semibold text-ink">Lesson library</Text>
        <Text className="mt-2 leading-6 text-ink/70">
          {powerSync.supported
            ? powerSync.hasSynced
              ? "Offline lesson metadata and progress are synced."
              : "Waiting for offline lesson sync."
            : "Web preview uses Supabase; native builds use offline sync."}
        </Text>
      </View>

      {lessonsQuery.isLoading ? (
        <Text className="rounded-lg border border-ink/10 bg-white p-4 text-base text-ink/70">
          Loading lessons...
        </Text>
      ) : lessonsQuery.isError ? (
        <View className="rounded-lg border border-coral/20 bg-white p-4">
          <Text className="text-base font-semibold text-coral">
            Could not load lessons.
          </Text>
          <Text className="mt-2 leading-6 text-ink/70">
            {lessonsQuery.error instanceof Error
              ? lessonsQuery.error.message
              : "Try again after sync completes."}
          </Text>
        </View>
      ) : lessonsQuery.data?.length ? (
        <View className="gap-3">
          {lessonsQuery.data.map((lesson) => (
            <LessonCard
              completing={completeMutation.isPending}
              key={lesson.id}
              lesson={lesson}
              onComplete={() => completeMutation.mutate(lesson.id)}
            />
          ))}
        </View>
      ) : (
        <View className="rounded-lg border border-ink/10 bg-white p-4">
          <Text className="text-lg font-semibold text-ink">
            No lessons synced yet
          </Text>
          <Text className="mt-2 leading-6 text-ink/70">
            Authored lessons will appear here after the first content sync.
          </Text>
        </View>
      )}
    </View>
  );
}

function LessonCard({
  completing,
  lesson,
  onComplete,
}: {
  completing: boolean;
  lesson: StudyLesson;
  onComplete: () => void;
}) {
  return (
    <View className="rounded-lg border border-ink/10 bg-white p-4">
      <View className="flex-row items-start gap-3">
        <View className="mt-1">
          {lesson.completed ? (
            <CheckCircle2 color="#1d6b57" size={22} />
          ) : (
            <CirclePlay color="#17211f" size={22} />
          )}
        </View>
        <View className="flex-1">
          <Text className="text-lg font-semibold text-ink">{lesson.title}</Text>
          {lesson.description ? (
            <Text className="mt-2 leading-6 text-ink/70">
              {lesson.description}
            </Text>
          ) : null}
          <Text className="mt-3 text-sm text-ink/60">
            {formatDuration(lesson.durationSeconds)} · {lesson.audioCount} audio
            segment{lesson.audioCount === 1 ? "" : "s"}
          </Text>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        className={`mt-4 rounded-lg px-4 py-3 ${
          lesson.completed ? "border border-leaf/40 bg-white" : "bg-ink"
        }`}
        disabled={lesson.completed || completing}
        onPress={onComplete}
      >
        <Text
          className={`text-center font-semibold ${
            lesson.completed ? "text-leaf" : "text-white"
          }`}
        >
          {lesson.completed
            ? "Completed"
            : completing
              ? "Saving..."
              : "Mark complete"}
        </Text>
      </Pressable>
    </View>
  );
}

function RecentSessions({ userId }: { userId: string }) {
  const sessionsQuery = useQuery({
    queryKey: ["recent-learning-sessions", userId],
    queryFn: () => listRecentLearningSessions(userId),
  });

  if (!sessionsQuery.data?.length) {
    return null;
  }

  return (
    <View className="rounded-lg border border-ink/10 bg-white p-4">
      <Text className="text-base font-semibold text-ink">Recent sessions</Text>
      <View className="mt-3 gap-2">
        {sessionsQuery.data.map((session) => (
          <View
            className="flex-row items-center justify-between border-t border-ink/10 pt-2"
            key={session.id}
          >
            <Text className="flex-1 text-sm text-ink/70">
              {modeLabels[session.mode]} · {session.status}
            </Text>
            <Text className="text-sm font-semibold text-ink">
              {formatDuration(session.durationSeconds)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function ModeOption({
  description,
  icon,
  label,
  onPress,
  selected,
}: {
  description: string;
  icon: ReactNode;
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`rounded-lg border p-3 ${
        selected ? "border-leaf bg-leaf/10" : "border-ink/10 bg-white"
      }`}
      onPress={onPress}
    >
      <View className="flex-row items-start gap-3">
        {icon}
        <View className="flex-1">
          <Text className="font-semibold text-ink">{label}</Text>
          <Text className="mt-1 text-sm leading-5 text-ink/60">
            {description}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function Chip({
  label,
  onPress,
  selected,
}: {
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`rounded-lg border px-3 py-2 ${
        selected ? "border-ink bg-ink" : "border-ink/10 bg-white"
      }`}
      onPress={onPress}
    >
      <Text
        className={`text-sm font-semibold ${
          selected ? "text-white" : "text-ink"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function formatDuration(durationSeconds?: number | null): string {
  if (!durationSeconds) {
    return "Short lesson";
  }

  return `${Math.max(1, Math.round(durationSeconds / 60))} min`;
}

const modeLabels: Record<LearningSessionMode, string> = {
  interactive_app: "Interactive app",
  interactive_audio: "Interactive audio",
  non_interactive_audio: "Non-interactive audio",
  osce_simulation: "OSCE simulation",
};

const depthLabels: Record<LearningDepth, string> = {
  deep: "Deep",
  normal: "Normal",
  quick: "Quick",
};

const speakerLabels: Record<LearningSessionTurn["speaker"], string> = {
  examiner: "Examiner",
  lesson_guide: "Guide",
  patient: "Patient",
  student: "You",
  system: "System",
};
