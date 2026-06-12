import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  getInteractionEvaluationSetRequests,
  listInteractionEvaluationSets,
  upsertInteractionEvaluationLabel,
} from "@clinrx/api";
import type {
  InteractionActionCategory,
  InteractionEvaluationCategory,
  InteractionEvaluationLabel,
  InteractionEvaluationLabelInput,
  InteractionEvaluationPurpose,
  InteractionEvaluationRequestWithRun,
  PubMedAiInterpretationAssessment,
  PubMedAutomationSafetyAssessment,
  PubMedCalibrationFailureMode,
  PubMedCalibrationMissingContext,
  PubMedCalibrationResolutionAssessment,
  PubMedCalibrationSeverityManagementAssessment,
  PubMedEvidenceRetrievalAssessment,
  PubMedGeneralizationAssessment,
} from "@clinrx/types";

import { ReviewPasswordGate } from "@/components/ReviewPasswordGate";
import { supabase } from "@/lib/supabase";

type DraftInteractionLabel = Omit<
  InteractionEvaluationLabelInput,
  "requestId" | "reviewerId" | "reviewerKey" | "setId"
>;

const reviewerKey = "shared-password-reviewer";

export default function CalibrationReviewScreen() {
  return (
    <ReviewPasswordGate>
      <RuntimeEvaluationContent />
    </ReviewPasswordGate>
  );
}

function RuntimeEvaluationContent() {
  const queryClient = useQueryClient();
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const [draftsByLabelKey, setDraftsByLabelKey] = useState<
    Record<string, DraftInteractionLabel>
  >({});
  const setsQuery = useQuery({
    queryKey: ["interaction-evaluation-sets", "calibration"],
    queryFn: () =>
      listInteractionEvaluationSets(supabase, {
        limit: 10,
        purpose: "calibration",
      }),
  });
  const activeSetId = selectedSetId ?? setsQuery.data?.[0]?.id ?? null;
  const bundleQuery = useQuery({
    enabled: Boolean(activeSetId),
    queryKey: ["interaction-evaluation-set", activeSetId],
    queryFn: () =>
      activeSetId
        ? getInteractionEvaluationSetRequests(supabase, activeSetId)
        : Promise.resolve(null),
  });
  const saveLabelMutation = useMutation({
    mutationFn: (label: InteractionEvaluationLabelInput) =>
      upsertInteractionEvaluationLabel(supabase, label),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["interaction-evaluation-set", activeSetId],
      });
    },
  });
  const sets = setsQuery.data ?? [];
  const bundle = bundleQuery.data;
  const requests = bundle?.requests ?? [];
  const ownLabelsByKey = useMemo(() => {
    const labels = new Map<string, InteractionEvaluationLabel>();

    for (const item of requests) {
      for (const label of item.labels) {
        if (label.reviewerKey === reviewerKey) {
          labels.set(getLabelKey(item.request.id, label.runId ?? null), label);
        }
      }
    }

    return labels;
  }, [requests]);
  const metrics = useMemo(
    () => calculateMetrics(requests, draftsByLabelKey, ownLabelsByKey),
    [draftsByLabelKey, ownLabelsByKey, requests],
  );

  useEffect(() => {
    if (selectedSetId || !sets.length) {
      return;
    }

    setSelectedSetId(sets[0]?.id ?? null);
  }, [selectedSetId, sets]);

  useEffect(() => {
    setDraftsByLabelKey(
      Object.fromEntries(
        [...ownLabelsByKey.entries()].map(([labelKey, label]) => [
          labelKey,
          toDraftLabel(label),
        ]),
      ),
    );
  }, [ownLabelsByKey]);

  const updateLabel = (
    item: InteractionEvaluationRequestWithRun,
    runId: string | null,
    nextDraft: DraftInteractionLabel,
  ) => {
    if (!activeSetId) {
      return;
    }

    setDraftsByLabelKey((current) => ({
      ...current,
      [getLabelKey(item.request.id, runId)]: nextDraft,
    }));
    saveLabelMutation.mutate({
      ...nextDraft,
      requestId: item.request.id,
      reviewerKey,
      runId,
      setId: activeSetId,
    });
  };

  return (
    <ScrollView className="flex-1 bg-mist">
      <View className="min-h-screen px-5 pb-10 pt-16">
        <View className="mb-7">
          <Text className="text-sm font-semibold uppercase text-leaf">
            Runtime calibration
          </Text>
          <Text className="mt-3 text-4xl font-bold text-ink">
            Interaction Checker Evaluation
          </Text>
          <Text className="mt-3 max-w-4xl text-base leading-6 text-ink/70">
            Pharmacists review simulated checker requests: the input pair,
            resolved entities, retrieved evidence, AI answer, and evidence
            trace. These labels measure the runtime system, not individual
            PubMed articles.
          </Text>
        </View>

        <EvaluationSetSelector
          selectedSetId={activeSetId}
          sets={sets}
          onSelect={setSelectedSetId}
        />
        <MetricsPanel metrics={metrics} />
        <View className="mt-3 rounded-lg border border-ink/10 bg-white px-4 py-3">
          <Text className="text-sm leading-5 text-ink/70">
            {saveLabelMutation.isPending
              ? "Saving evaluation label..."
              : saveLabelMutation.isError
                ? "Could not save the last label. Try changing the answer again."
                : "Responses autosave as runtime evaluation labels and do not publish or reject interactions."}
          </Text>
        </View>

        {setsQuery.isLoading || bundleQuery.isLoading ? (
          <Text className="mt-4 text-ink/70">
            Loading interaction evaluation set...
          </Text>
        ) : setsQuery.isError || bundleQuery.isError ? (
          <Text className="mt-4 text-coral">
            Could not load interaction evaluation requests.
          </Text>
        ) : !activeSetId || !bundle ? (
          <EmptyState
            title="No runtime evaluation set available"
            body="Generate an interaction runtime evaluation set before starting pharmacist calibration."
          />
        ) : requests.length ? (
          <View className="mt-5 gap-4">
            {requests.map((item, index) => (
              <RuntimeEvaluationCard
                index={index}
                item={item}
                key={item.request.id}
                labelsByKey={ownLabelsByKey}
                draftsByLabelKey={draftsByLabelKey}
                setLabel={(runId, label) => updateLabel(item, runId, label)}
              />
            ))}
          </View>
        ) : (
          <EmptyState
            title="Empty evaluation set"
            body="This set exists but has no request-time evaluation rows yet."
          />
        )}
      </View>
    </ScrollView>
  );
}

function EvaluationSetSelector({
  onSelect,
  selectedSetId,
  sets,
}: {
  onSelect: (setId: string) => void;
  selectedSetId: string | null;
  sets: Array<{
    id: string;
    name: string;
    purpose: InteractionEvaluationPurpose;
    version: number;
  }>;
}) {
  if (!sets.length) {
    return null;
  }

  return (
    <View className="mb-3 rounded-lg border border-ink/10 bg-white p-4">
      <Text className="text-sm font-semibold text-ink">Evaluation set</Text>
      <View className="mt-2 flex-row flex-wrap gap-2">
        {sets.map((set) => {
          const selected = selectedSetId === set.id;

          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected }}
              className={`rounded-lg border px-3 py-2 ${
                selected ? "border-leaf bg-leaf" : "border-ink/10 bg-mist"
              }`}
              key={set.id}
              onPress={() => onSelect(set.id)}
            >
              <Text
                className={`text-sm font-semibold ${
                  selected ? "text-white" : "text-ink"
                }`}
              >
                {set.name}
              </Text>
              <Text
                className={`mt-1 text-xs uppercase ${
                  selected ? "text-white/80" : "text-ink/50"
                }`}
              >
                {set.purpose} v{set.version}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function RuntimeEvaluationCard({
  draftsByLabelKey,
  index,
  item,
  labelsByKey,
  setLabel,
}: {
  draftsByLabelKey: Record<string, DraftInteractionLabel>;
  index: number;
  item: InteractionEvaluationRequestWithRun;
  labelsByKey: Map<string, InteractionEvaluationLabel>;
  setLabel: (runId: string | null, label: DraftInteractionLabel) => void;
}) {
  const { request } = item;
  const runItems = item.runs.length
    ? item.runs
    : item.run
      ? [{ evidence: item.evidence, labels: item.labels, run: item.run }]
      : [];

  return (
    <View className="rounded-lg border border-ink/10 bg-white p-4">
      <View className="flex-row flex-wrap items-center gap-2">
        <Text className="text-sm font-semibold uppercase text-leaf">
          #{index + 1}
        </Text>
        <Text className="rounded-md bg-mist px-2 py-1 text-xs font-semibold uppercase text-ink/60">
          {formatLabel(request.samplingReason)}
        </Text>
        {request.expectedCategory ? (
          <Text className="rounded-md bg-mist px-2 py-1 text-xs font-semibold uppercase text-ink/60">
            Expected: {formatLabel(request.expectedCategory)}
          </Text>
        ) : null}
      </View>

      <Text className="mt-3 text-xl font-bold text-ink">
        {request.inputSourceText} + {request.inputTargetText}
      </Text>
      <Text className="mt-1 text-sm leading-5 text-ink/60">
        Request ID {request.id.slice(0, 8)}
        {request.sourceCandidateId
          ? ` • Source candidate ${request.sourceCandidateId.slice(0, 8)}`
          : ""}
      </Text>

      {runItems.length ? (
        <View className="mt-4 gap-4">
          {runItems.map((runItem) => {
            const labelKey = getLabelKey(request.id, runItem.run.id);
            const label =
              draftsByLabelKey[labelKey] ??
              (labelsByKey.get(labelKey)
                ? toDraftLabel(labelsByKey.get(labelKey)!)
                : createEmptyLabel(runItem.run.answerCategory ?? null));

            return (
              <ModelRunEvaluation
                item={runItem}
                key={runItem.run.id}
                label={label}
                setLabel={(nextLabel) => setLabel(runItem.run.id, nextLabel)}
              />
            );
          })}
        </View>
      ) : (
        <Text className="mt-4 rounded-lg border border-coral/20 bg-coral/10 p-3 text-sm leading-5 text-coral">
          This request has not been run through the checker yet.
        </Text>
      )}
    </View>
  );
}

function ModelRunEvaluation({
  item,
  label,
  setLabel,
}: {
  item: InteractionEvaluationRequestWithRun["runs"][number];
  label: DraftInteractionLabel;
  setLabel: (label: DraftInteractionLabel) => void;
}) {
  const { evidence, run } = item;
  const latencyMs = getTraceNumber(
    run.decisionTrace as Record<string, unknown>,
    "latencyMs",
  );
  const usedEvidence = evidence.filter((row) => row.usedInAnswer);
  const otherEvidence = evidence.filter((row) => !row.usedInAnswer);

  return (
    <View className="rounded-lg border border-ink/10 bg-mist p-3">
      <View className="rounded-lg border border-ink/10 bg-white p-3">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="text-sm font-semibold text-ink">
            {formatModelName(run.model)}
          </Text>
          {run.status !== "completed" ? (
            <Text className="rounded-md bg-coral/10 px-2 py-1 text-xs font-semibold uppercase text-coral">
              {formatLabel(run.status)}
            </Text>
          ) : null}
          <CategoryPill category={run.answerCategory ?? "unclear"} />
          {run.confidence !== null && run.confidence !== undefined ? (
            <Text className="rounded-md bg-mist px-2 py-1 text-xs font-semibold uppercase text-ink/60">
              {Math.round(run.confidence * 100)}% confidence
            </Text>
          ) : null}
          {latencyMs !== null ? (
            <Text className="rounded-md bg-mist px-2 py-1 text-xs font-semibold uppercase text-ink/60">
              {formatLatency(latencyMs)}
            </Text>
          ) : null}
          <Text className="rounded-md bg-mist px-2 py-1 text-xs font-semibold uppercase text-ink/60">
            Run v{run.runVersion}
          </Text>
        </View>
        {run.answerSummary ? (
          <Text className="mt-2 text-sm leading-6 text-ink/70">
            {run.answerSummary}
          </Text>
        ) : null}
        {run.management ? (
          <Text className="mt-2 text-sm leading-6 text-ink/70">
            Management: {run.management}
          </Text>
        ) : null}
      </View>

      <View className="mt-3 gap-3">
        <ResolvedNode label="Source" node={run.resolvedSourceNode ?? null} />
        <ResolvedNode label="Target" node={run.resolvedTargetNode ?? null} />
      </View>

      {run.decisionTrace ? (
        <TracePanel trace={run.decisionTrace as Record<string, unknown>} />
      ) : null}

      <EvidencePanel
        otherEvidence={otherEvidence}
        usedEvidence={usedEvidence}
      />

      <View className="mt-4 gap-3 rounded-lg border border-ink/10 bg-white p-3">
        <SegmentedControl
          label={`Final interaction category for ${formatModelName(run.model)}`}
          options={categoryOptions}
          selected={label.finalCategory ?? undefined}
          onSelect={(finalCategory) => setLabel({ ...label, finalCategory })}
        />
        <SegmentedControl
          label="Were the right entities selected?"
          options={entityResolutionOptions}
          selected={label.entityResolutionAssessment ?? undefined}
          onSelect={(entityResolutionAssessment) =>
            setLabel({ ...label, entityResolutionAssessment })
          }
        />
        <SegmentedControl
          label="Did retrieval find the right evidence?"
          options={evidenceRetrievalOptions}
          selected={label.evidenceRetrievalAssessment ?? undefined}
          onSelect={(evidenceRetrievalAssessment) =>
            setLabel({ ...label, evidenceRetrievalAssessment })
          }
        />
        <SegmentedControl
          label="Did AI interpret the evidence correctly?"
          options={aiInterpretationOptions}
          selected={label.aiInterpretationAssessment ?? undefined}
          onSelect={(aiInterpretationAssessment) =>
            setLabel({ ...label, aiInterpretationAssessment })
          }
        />
        <SegmentedControl
          label="Is the management/action wording acceptable?"
          options={managementOptions}
          selected={label.managementAssessment ?? undefined}
          onSelect={(managementAssessment) =>
            setLabel({ ...label, managementAssessment })
          }
        />
        <SegmentedControl
          label="Did the system generalize appropriately?"
          options={generalizationOptions}
          selected={label.generalizationAssessment ?? undefined}
          onSelect={(generalizationAssessment) =>
            setLabel({ ...label, generalizationAssessment })
          }
        />
        <SegmentedControl
          label="Would this be safe to automate?"
          options={automationOptions}
          selected={label.automationSafetyAssessment ?? undefined}
          onSelect={(automationSafetyAssessment) =>
            setLabel({ ...label, automationSafetyAssessment })
          }
        />
        <MultiSelectControl
          label="Failure modes"
          options={failureModeOptions}
          selected={label.failureModes ?? []}
          onChange={(failureModes) => setLabel({ ...label, failureModes })}
        />
        <MissingContextControl
          selected={label.missingContext ?? []}
          onChange={(missingContext) => setLabel({ ...label, missingContext })}
        />
        <TextInputBlock
          label="What rule, prompt, or source would have prevented an issue?"
          maxLength={1500}
          placeholder="Leave blank if there is no issue to prevent."
          value={label.suggestedPrevention ?? ""}
          onChangeText={(suggestedPrevention) =>
            setLabel({ ...label, suggestedPrevention })
          }
        />
        <TextInputBlock
          label="Reviewer note"
          maxLength={3000}
          placeholder="What should we fix, trust, reject, or show next time?"
          value={label.notes}
          onChangeText={(notes) => setLabel({ ...label, notes })}
        />
      </View>
    </View>
  );
}

function ResolvedNode({
  label,
  node,
}: {
  label: string;
  node: InteractionEvaluationRequestWithRun["run"] extends infer Run
    ? Run extends { resolvedSourceNode?: infer Node }
      ? Node
      : never
    : never;
}) {
  return (
    <View className="rounded-lg border border-ink/10 bg-white p-3">
      <Text className="text-xs font-semibold uppercase text-ink/50">
        {label}
      </Text>
      {node ? (
        <>
          <Text className="mt-2 text-base font-semibold text-ink">
            {node.canonicalName}
          </Text>
          <View className="mt-2 flex-row flex-wrap gap-2">
            <Text className="rounded-md bg-mist px-2 py-1 text-xs font-semibold uppercase text-ink/60">
              {node.type}
            </Text>
            <Text className="rounded-md bg-mist px-2 py-1 text-xs font-semibold uppercase text-ink/60">
              {node.source}
            </Text>
          </View>
        </>
      ) : (
        <Text className="mt-2 text-sm leading-5 text-coral">
          Unresolved
        </Text>
      )}
    </View>
  );
}

function TracePanel({ trace }: { trace: Record<string, unknown> }) {
  const finalRationale =
    typeof trace.finalRationale === "string" ? trace.finalRationale : null;
  const retrievalNotes =
    typeof trace.retrievalNotes === "string" ? trace.retrievalNotes : null;
  const runtimeError =
    typeof trace.runtimeError === "string" ? trace.runtimeError : null;
  const uncertainty = Array.isArray(trace.uncertainty)
    ? trace.uncertainty.filter((item): item is string => typeof item === "string")
    : [];

  if (!finalRationale && !retrievalNotes && !runtimeError && !uncertainty.length) {
    return null;
  }

  return (
    <View className="mt-3 rounded-lg border border-ink/10 bg-white p-3">
      <Text className="text-sm font-semibold text-ink">AI trace</Text>
      {finalRationale ? (
        <Text className="mt-2 text-sm leading-6 text-ink/70">
          {finalRationale}
        </Text>
      ) : null}
      {retrievalNotes ? (
        <Text className="mt-2 text-sm leading-6 text-ink/60">
          Retrieval: {retrievalNotes}
        </Text>
      ) : null}
      {runtimeError ? (
        <Text className="mt-2 text-sm leading-6 text-coral">
          Error: {truncate(runtimeError, 700)}
        </Text>
      ) : null}
      {uncertainty.length ? (
        <View className="mt-2 gap-1">
          {uncertainty.map((item) => (
            <Text className="text-sm leading-5 text-ink/60" key={item}>
              - {item}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function EvidencePanel({
  otherEvidence,
  usedEvidence,
}: {
  otherEvidence: InteractionEvaluationRequestWithRun["evidence"];
  usedEvidence: InteractionEvaluationRequestWithRun["evidence"];
}) {
  const rows = [...usedEvidence, ...otherEvidence];

  return (
    <View className="mt-3 rounded-lg border border-ink/10 bg-white p-3">
      <Text className="text-sm font-semibold text-ink">
        Retrieved evidence
      </Text>
      {rows.length ? (
        <View className="mt-3 gap-3">
          {rows.map((row) => (
            <EvidenceRow evidence={row} key={row.id} />
          ))}
        </View>
      ) : (
        <Text className="mt-2 text-sm leading-5 text-coral">
          No evidence rows were attached to this run.
        </Text>
      )}
    </View>
  );
}

function EvidenceRow({
  evidence,
}: {
  evidence: InteractionEvaluationRequestWithRun["evidence"][number];
}) {
  const pmid = getMetadataString(evidence.metadata, "pmid");
  const sourceUrl = getMetadataString(evidence.metadata, "sourceUrl");

  return (
    <View className="rounded-lg border border-ink/10 bg-mist p-3">
      <View className="flex-row flex-wrap items-center gap-2">
        <Text className="rounded-md bg-white px-2 py-1 text-xs font-semibold uppercase text-ink/60">
          {formatLabel(evidence.sourceKind)}
        </Text>
        <Text className="rounded-md bg-white px-2 py-1 text-xs font-semibold uppercase text-ink/60">
          {formatLabel(evidence.supportType)}
        </Text>
        {evidence.usedInAnswer ? (
          <Text className="rounded-md bg-leaf/15 px-2 py-1 text-xs font-semibold uppercase text-leaf">
            Used
          </Text>
        ) : null}
      </View>
      {evidence.quote ? (
        <Text className="mt-2 text-sm leading-5 text-ink/70">
          "{evidence.quote}"
        </Text>
      ) : null}
      <Text className="mt-2 text-sm leading-5 text-ink/60">
        {truncate(evidence.content, 700)}
      </Text>
      <View className="mt-2 flex-row flex-wrap gap-3">
        {pmid ? (
          <Pressable
            accessibilityRole="link"
            onPress={() =>
              void Linking.openURL(`https://pubmed.ncbi.nlm.nih.gov/${pmid}/`)
            }
          >
            <Text className="text-sm font-semibold text-leaf">
              Open PubMed
            </Text>
          </Pressable>
        ) : null}
        {sourceUrl ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => void Linking.openURL(sourceUrl)}
          >
            <Text className="text-sm font-semibold text-leaf">
              Open source
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function MetricsPanel({ metrics }: { metrics: RuntimeMetrics }) {
  return (
    <View className="rounded-lg border border-ink/10 bg-white p-4">
      <View className="flex-row flex-wrap gap-2">
        <MetricPill label="Reviewed" value={`${metrics.reviewed}/${metrics.total}`} />
        <MetricPill label="Category correct" value={formatRate(metrics.categoryAccuracy)} />
        <MetricPill label="Entities correct" value={formatRate(metrics.entityAccuracy)} />
        <MetricPill label="Retrieval correct" value={formatRate(metrics.retrievalAccuracy)} />
        <MetricPill label="AI understood" value={formatRate(metrics.aiAccuracy)} />
        <MetricPill label="Safe to automate" value={metrics.safeToAutomate} />
        <MetricPill label="Quarantine" value={metrics.quarantine} />
      </View>
    </View>
  );
}

function MetricPill({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <View className="rounded-lg border border-ink/10 bg-mist px-3 py-2">
      <Text className="text-xs font-semibold uppercase text-ink/50">
        {label}
      </Text>
      <Text className="mt-1 text-lg font-bold text-ink">{value}</Text>
    </View>
  );
}

function CategoryPill({
  category,
}: {
  category: InteractionEvaluationCategory;
}) {
  return (
    <Text
      className={`rounded-md border px-2 py-1 text-xs font-semibold uppercase ${
        categoryStyles[category] ?? "border-ink/10 bg-white text-ink/60"
      }`}
    >
      {formatLabel(category)}
    </Text>
  );
}

function SegmentedControl<T extends string>({
  label,
  onSelect,
  options,
  selected,
}: {
  label: string;
  onSelect: (value: T) => void;
  options: Array<{ label: string; value: T }>;
  selected?: T;
}) {
  return (
    <View>
      <Text className="text-sm font-semibold text-ink">{label}</Text>
      <View className="mt-2 flex-row flex-wrap gap-2">
        {options.map((option) => {
          const isSelected = selected === option.value;

          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              className={`rounded-lg border px-3 py-2 ${
                isSelected ? "border-leaf bg-leaf" : "border-ink/10 bg-white"
              }`}
              key={option.value}
              onPress={() => onSelect(option.value)}
            >
              <Text
                className={`text-sm font-semibold ${
                  isSelected ? "text-white" : "text-ink"
                }`}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function MultiSelectControl<T extends string>({
  label,
  onChange,
  options,
  selected,
}: {
  label: string;
  onChange: (value: T[]) => void;
  options: Array<{ label: string; value: T }>;
  selected: T[];
}) {
  return (
    <View>
      <Text className="text-sm font-semibold text-ink">{label}</Text>
      <View className="mt-2 flex-row flex-wrap gap-2">
        {options.map((option) => {
          const isSelected = selected.includes(option.value);

          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              className={`rounded-lg border px-3 py-2 ${
                isSelected ? "border-leaf bg-leaf" : "border-ink/10 bg-white"
              }`}
              key={option.value}
              onPress={() => {
                if (option.value === ("none" as T)) {
                  onChange(isSelected ? [] : [option.value]);
                  return;
                }

                const withoutNone = selected.filter(
                  (value) => value !== ("none" as T),
                );
                onChange(
                  isSelected
                    ? withoutNone.filter((value) => value !== option.value)
                    : [...withoutNone, option.value],
                );
              }}
            >
              <Text
                className={`text-sm font-semibold ${
                  isSelected ? "text-white" : "text-ink"
                }`}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function MissingContextControl({
  onChange,
  selected,
}: {
  onChange: (value: PubMedCalibrationMissingContext[]) => void;
  selected: PubMedCalibrationMissingContext[];
}) {
  return (
    <View>
      <Text className="text-sm font-semibold text-ink">
        Missing context, if any
      </Text>
      <View className="mt-2 flex-row flex-wrap gap-2">
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: !selected.length }}
          className={`rounded-lg border px-3 py-2 ${
            !selected.length ? "border-leaf bg-leaf" : "border-ink/10 bg-white"
          }`}
          onPress={() => onChange([])}
        >
          <Text
            className={`text-sm font-semibold ${
              !selected.length ? "text-white" : "text-ink"
            }`}
          >
            None
          </Text>
        </Pressable>
        {missingContextOptions.map((option) => {
          const isSelected = selected.includes(option.value);

          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              className={`rounded-lg border px-3 py-2 ${
                isSelected ? "border-leaf bg-leaf" : "border-ink/10 bg-white"
              }`}
              key={option.value}
              onPress={() =>
                onChange(
                  isSelected
                    ? selected.filter((value) => value !== option.value)
                    : [...selected, option.value],
                )
              }
            >
              <Text
                className={`text-sm font-semibold ${
                  isSelected ? "text-white" : "text-ink"
                }`}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function TextInputBlock({
  label,
  maxLength,
  onChangeText,
  placeholder,
  value,
}: {
  label: string;
  maxLength: number;
  onChangeText: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <View>
      <Text className="text-sm font-semibold text-ink">{label}</Text>
      <TextInput
        className="mt-2 min-h-20 rounded-lg border border-ink/15 bg-white px-3 py-3 text-base leading-6 text-ink"
        maxLength={maxLength}
        multiline
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#7b8580"
        textAlignVertical="top"
        value={value}
      />
    </View>
  );
}

function EmptyState({ body, title }: { body: string; title: string }) {
  return (
    <View className="mt-5 rounded-lg border border-ink/10 bg-white p-4">
      <Text className="text-base font-semibold text-ink">{title}</Text>
      <Text className="mt-2 text-sm leading-5 text-ink/60">{body}</Text>
    </View>
  );
}

function calculateMetrics(
  items: InteractionEvaluationRequestWithRun[],
  draftsByLabelKey: Record<string, DraftInteractionLabel>,
  savedLabelsByKey: Map<string, InteractionEvaluationLabel>,
): RuntimeMetrics {
  const runItems = items.flatMap((item) =>
    item.runs.map((runItem) => ({
      requestId: item.request.id,
      runItem,
    }))
  );
  const labels = runItems.flatMap(({ requestId, runItem }) => {
    const labelKey = getLabelKey(requestId, runItem.run.id);
    const draft = draftsByLabelKey[labelKey];
    const saved = savedLabelsByKey.get(labelKey);

    return draft ? [draft] : saved ? [toDraftLabel(saved)] : [];
  });
  const reviewed = labels.filter((label) => label.finalCategory).length;

  return {
    aiAccuracy: rate(
      labels,
      (label) => label.aiInterpretationAssessment === "correct",
    ),
    categoryAccuracy: rate(
      runItems,
      ({ requestId, runItem }) => {
        const labelKey = getLabelKey(requestId, runItem.run.id);
        const label = draftsByLabelKey[labelKey] ??
          (savedLabelsByKey.get(labelKey)
            ? toDraftLabel(savedLabelsByKey.get(labelKey)!)
            : null);

        return Boolean(
          label?.finalCategory &&
            runItem.run.answerCategory &&
            label.finalCategory === runItem.run.answerCategory,
        );
      },
    ),
    entityAccuracy: rate(
      labels,
      (label) => label.entityResolutionAssessment === "correct",
    ),
    quarantine: labels.filter(
      (label) => label.automationSafetyAssessment === "quarantine",
    ).length,
    retrievalAccuracy: rate(
      labels,
      (label) => label.evidenceRetrievalAssessment === "correct",
    ),
    reviewed,
    safeToAutomate: labels.filter(
      (label) => label.automationSafetyAssessment === "safe_to_automate",
    ).length,
    total: runItems.length,
  };
}

function rate<T>(items: T[], predicate: (item: T) => boolean): number {
  if (!items.length) {
    return 0;
  }

  return items.filter(predicate).length / items.length;
}

function createEmptyLabel(
  answerCategory: InteractionActionCategory | null,
): DraftInteractionLabel {
  return {
    aiInterpretationAssessment: "not_assessed",
    automationSafetyAssessment: "not_assessed",
    entityResolutionAssessment: undefined,
    evidenceRetrievalAssessment: "not_assessed",
    failureModes: [],
    finalCategory: answerCategory ?? undefined,
    generalizationAssessment: "not_assessed",
    managementAssessment: "not_assessed",
    missingContext: [],
    notes: "",
    runId: null,
    suggestedPrevention: "",
  };
}

function toDraftLabel(label: InteractionEvaluationLabel): DraftInteractionLabel {
  return {
    aiInterpretationAssessment: label.aiInterpretationAssessment ?? undefined,
    automationSafetyAssessment: label.automationSafetyAssessment ?? undefined,
    entityResolutionAssessment: label.entityResolutionAssessment ?? undefined,
    evidenceRetrievalAssessment: label.evidenceRetrievalAssessment ?? undefined,
    failureModes: label.failureModes,
    finalCategory: label.finalCategory ?? undefined,
    generalizationAssessment: label.generalizationAssessment ?? undefined,
    managementAssessment: label.managementAssessment ?? undefined,
    missingContext: label.missingContext,
    notes: label.notes,
    runId: label.runId ?? null,
    suggestedPrevention: label.suggestedPrevention ?? "",
  };
}

function formatRate(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatLabel(value: string): string {
  return value.replace(/_/g, " ");
}

function formatModelName(model?: string | null): string {
  switch (model) {
    case "claude-opus-4-8":
      return "Opus 4.8";
    case "claude-sonnet-4-6":
      return "Sonnet 4.6";
    case "claude-haiku-4-5-20251001":
    case "claude-haiku-4-5":
      return "Haiku 4.5";
    case "gpt-5.5":
      return "GPT-5.5";
    case "gpt-5.4-mini":
      return "GPT-5.4 mini";
    case "deterministic-published-kg-lookup":
      return "Deterministic KG";
    default:
      return model ?? "Unknown model";
  }
}

function getLabelKey(requestId: string, runId: string | null): string {
  return `${requestId}:${runId ?? "no-run"}`;
}

function getTraceNumber(
  trace: Record<string, unknown>,
  key: string,
): number | null {
  const value = trace[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatLatency(latencyMs: number): string {
  return latencyMs < 1000
    ? `${Math.round(latencyMs)}ms`
    : `${(latencyMs / 1000).toFixed(1)}s`;
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength
    ? `${value.slice(0, maxLength).trim()}...`
    : value;
}

function getMetadataString(
  metadata: Record<string, unknown>,
  key: string,
): string | null {
  const value = metadata[key];

  return typeof value === "string" && value.trim() ? value : null;
}

interface RuntimeMetrics {
  aiAccuracy: number;
  categoryAccuracy: number;
  entityAccuracy: number;
  quarantine: number;
  retrievalAccuracy: number;
  reviewed: number;
  safeToAutomate: number;
  total: number;
}

const categoryOptions: Array<{
  label: string;
  value: InteractionEvaluationCategory;
}> = [
  { label: "No known interaction", value: "no_known_interaction" },
  { label: "No action needed", value: "no_action_needed" },
  { label: "Monitor therapy", value: "monitor_therapy" },
  {
    label: "Consider therapy modification",
    value: "consider_therapy_modification",
  },
  { label: "Avoid combination", value: "avoid_combination" },
  { label: "Unclear", value: "unclear" },
];

const categoryStyles: Record<InteractionEvaluationCategory, string> = {
  avoid_combination: "border-red-200 bg-red-50 text-red-700",
  consider_therapy_modification:
    "border-orange-200 bg-orange-50 text-orange-700",
  monitor_therapy: "border-yellow-200 bg-yellow-50 text-yellow-700",
  no_action_needed: "border-blue-200 bg-blue-50 text-blue-700",
  no_known_interaction: "border-green-200 bg-green-50 text-green-700",
  unclear: "border-ink/10 bg-white text-ink/60",
};

const entityResolutionOptions: Array<{
  label: string;
  value: PubMedCalibrationResolutionAssessment;
}> = [
  { label: "Correct", value: "correct" },
  { label: "Wrong level", value: "wrong_level" },
  { label: "Wrong node", value: "wrong_node" },
  { label: "Unresolved/unclear", value: "unresolved_unclear" },
];

const evidenceRetrievalOptions: Array<{
  label: string;
  value: PubMedEvidenceRetrievalAssessment;
}> = [
  { label: "Correct", value: "correct" },
  { label: "Incomplete", value: "incomplete" },
  { label: "Wrong", value: "wrong" },
  { label: "Not assessed", value: "not_assessed" },
];

const aiInterpretationOptions: Array<{
  label: string;
  value: PubMedAiInterpretationAssessment;
}> = [
  { label: "Correct", value: "correct" },
  { label: "Partially correct", value: "partially_correct" },
  { label: "Wrong", value: "wrong" },
  { label: "Not assessed", value: "not_assessed" },
];

const managementOptions: Array<{
  label: string;
  value: PubMedCalibrationSeverityManagementAssessment;
}> = [
  { label: "Acceptable", value: "acceptable" },
  { label: "Needs revision", value: "needs_revision" },
  { label: "Wrong", value: "wrong" },
  { label: "Not assessed", value: "not_assessed" },
];

const generalizationOptions: Array<{
  label: string;
  value: PubMedGeneralizationAssessment;
}> = [
  { label: "Appropriate", value: "appropriate" },
  { label: "Too broad", value: "too_broad" },
  { label: "Too narrow", value: "too_narrow" },
  { label: "Unclear", value: "unclear" },
  { label: "Not assessed", value: "not_assessed" },
];

const automationOptions: Array<{
  label: string;
  value: PubMedAutomationSafetyAssessment;
}> = [
  { label: "Safe to automate", value: "safe_to_automate" },
  { label: "Sample only", value: "sample_only" },
  { label: "Quarantine", value: "quarantine" },
  { label: "Not assessed", value: "not_assessed" },
];

const failureModeOptions: Array<{
  label: string;
  value: PubMedCalibrationFailureMode;
}> = [
  { label: "None", value: "none" },
  { label: "Wrong entity", value: "wrong_entity_resolution" },
  { label: "Wrong ingredient/product/class level", value: "wrong_ingredient_product_class_level" },
  { label: "Evidence unsupported", value: "evidence_does_not_support_interaction" },
  { label: "Mechanism-only inference", value: "mechanism_only_inference" },
  { label: "Table/figure misread", value: "table_or_figure_misread" },
  { label: "Severity unsupported", value: "severity_unsupported" },
  { label: "Management unsupported", value: "management_unsupported" },
  { label: "Overgeneralized", value: "narrow_applicability_overgeneralized" },
  { label: "Duplicate/stale", value: "duplicate_or_stale_evidence" },
  { label: "Contradicted evidence", value: "contradicted_evidence" },
  { label: "Missing source coverage", value: "missing_source_coverage" },
];

const missingContextOptions: Array<{
  label: string;
  value: PubMedCalibrationMissingContext;
}> = [
  { label: "CPS comparison", value: "cps_comparison" },
  { label: "Full article", value: "full_article" },
  { label: "MedEffect/safety", value: "medeffect_safety" },
  { label: "NHP data", value: "nhp_data" },
  { label: "NOC context", value: "noc_context" },
  { label: "Route/form", value: "route_form" },
  { label: "Severity/management", value: "severity_management" },
];
