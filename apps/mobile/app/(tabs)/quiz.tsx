import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { FeatureShell } from "@/components/FeatureShell";
import { useAuthSession } from "@/hooks/useAuthSession";
import { usePowerSyncStatus } from "@/lib/powersync/PowerSyncProvider";
import {
  listDueQuizItems,
  submitQuizAnswer,
  type QuizItem,
} from "@/lib/study/quiz";

export default function QuizScreen() {
  const { session } = useAuthSession();

  return (
    <FeatureShell
      description="Flash cards and spaced repetition over ClinRx-authored study content that can work offline after sync."
      eyebrow="Quizzing"
      session={session}
      title="Quizzing"
    >
      {session ? <QuizPanel userId={session.user.id} /> : null}
    </FeatureShell>
  );
}

function QuizPanel({ userId }: { userId: string }) {
  const powerSync = usePowerSyncStatus();
  const queryClient = useQueryClient();
  const [startedAt, setStartedAt] = useState(Date.now());
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{
    isCorrect: boolean;
    item: QuizItem;
    selectedChoiceId: string;
  } | null>(null);

  const quizQuery = useQuery({
    queryKey: ["due-quiz-items", userId],
    queryFn: () => listDueQuizItems(userId),
  });

  const currentItem = quizQuery.data?.[0] ?? null;

  useEffect(() => {
    setStartedAt(Date.now());
    setSelectedChoiceId(null);
    setLastResult(null);
  }, [currentItem?.id]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!currentItem || !selectedChoiceId) {
        throw new Error("Select an answer first.");
      }

      return submitQuizAnswer({
        elapsedMs: Date.now() - startedAt,
        quizItem: currentItem,
        selectedChoiceId,
        userId,
      });
    },
    onSuccess: (result) => {
      if (currentItem && selectedChoiceId) {
        setLastResult({
          isCorrect: result.isCorrect,
          item: currentItem,
          selectedChoiceId,
        });
      }

      void queryClient.invalidateQueries({ queryKey: ["due-quiz-items", userId] });
    },
  });

  const syncLabel = useMemo(() => {
    if (!powerSync.supported) {
      return "Web preview uses Supabase; native builds use offline sync.";
    }

    if (powerSync.hasSynced) {
      return "Offline quiz content synced.";
    }

    return "Waiting for offline quiz sync.";
  }, [powerSync.hasSynced, powerSync.supported]);

  return (
    <View className="gap-4">
      <View className="rounded-lg border border-ink/10 bg-white p-4">
        <Text className="text-base font-semibold text-ink">Offline study</Text>
        <Text className="mt-2 leading-6 text-ink/70">{syncLabel}</Text>
      </View>

      {quizQuery.isLoading ? (
        <StudyCard>
          <Text className="text-base text-ink/70">Loading due cards...</Text>
        </StudyCard>
      ) : quizQuery.isError ? (
        <StudyCard>
          <Text className="text-base font-semibold text-coral">
            Could not load quiz items.
          </Text>
          <Text className="mt-2 leading-6 text-ink/70">
            {quizQuery.error instanceof Error
              ? quizQuery.error.message
              : "Try again after sync completes."}
          </Text>
        </StudyCard>
      ) : currentItem ? (
        <StudyCard>
          <Text className="text-sm font-semibold uppercase text-leaf">
            {currentItem.topic}
          </Text>
          <Text className="mt-3 text-xl font-bold leading-7 text-ink">
            {currentItem.prompt}
          </Text>

          <View className="mt-5 gap-3">
            {currentItem.choices.map((choice) => {
              const selected = selectedChoiceId === choice.id;

              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  className={`rounded-lg border p-4 ${
                    selected ? "border-leaf bg-leaf" : "border-ink/10 bg-mist"
                  }`}
                  key={choice.id}
                  onPress={() => setSelectedChoiceId(choice.id)}
                >
                  <Text
                    className={`leading-6 ${
                      selected ? "font-semibold text-white" : "text-ink"
                    }`}
                  >
                    {choice.text}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            accessibilityRole="button"
            className={`mt-5 rounded-lg px-4 py-3 ${
              selectedChoiceId ? "bg-ink" : "bg-ink/25"
            }`}
            disabled={!selectedChoiceId || submitMutation.isPending}
            onPress={() => submitMutation.mutate()}
          >
            <Text className="text-center font-semibold text-white">
              {submitMutation.isPending ? "Saving..." : "Submit answer"}
            </Text>
          </Pressable>
        </StudyCard>
      ) : (
        <StudyCard>
          <Text className="text-lg font-semibold text-ink">No cards due</Text>
          <Text className="mt-2 leading-6 text-ink/70">
            You are caught up for now. New authored cards will appear here after
            sync.
          </Text>
        </StudyCard>
      )}

      {lastResult ? (
        <StudyCard tone={lastResult.isCorrect ? "success" : "warning"}>
          <Text
            className={`text-base font-semibold ${
              lastResult.isCorrect ? "text-leaf" : "text-coral"
            }`}
          >
            {lastResult.isCorrect ? "Correct" : "Review again"}
          </Text>
          <Text className="mt-2 leading-6 text-ink/75">
            {lastResult.item.explanation}
          </Text>
        </StudyCard>
      ) : null}
    </View>
  );
}

function StudyCard({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "success" | "warning";
}) {
  const className =
    tone === "success"
      ? "rounded-lg border border-leaf/30 bg-leaf/10 p-4"
      : tone === "warning"
        ? "rounded-lg border border-coral/30 bg-coral/10 p-4"
        : "rounded-lg border border-ink/10 bg-white p-4";

  return <View className={className}>{children}</View>;
}
