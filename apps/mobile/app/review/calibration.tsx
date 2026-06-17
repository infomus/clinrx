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
type RuntimeRunItem = InteractionEvaluationRequestWithRun["runs"][number];

const reviewerKey = "shared-password-reviewer";
// Pass 2 shortlist: 2 models x 2 retrieval strategies = 4 graded answers per
// request (200 across the 50-request set). Narrowed from the full 5x4 matrix
// after pass-1 verdicts and the calibration findings.
const activeMatrixModels = new Set([
  "claude-sonnet-4-6",
  "gpt-5.4-mini",
]);
const activeMatrixRetrievalStrategies = new Set([
  "monograph_direct_plus_pubmed_top10",
  "ingredient_product_class_guarded_top12",
]);

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

  // Request-level ground-truth verdict (runId null) carried over from pass 1.
  // It anchors the per-model grading below: judge each model answer against
  // your own clinical call, not against the other models.
  const verdictKey = getLabelKey(request.id, null);
  const verdictLabel = draftsByLabelKey[verdictKey] ??
    (labelsByKey.get(verdictKey)
      ? toDraftLabel(labelsByKey.get(verdictKey)!)
      : createEmptyLabel(null));

  // Pass 2: grade every active-matrix model x strategy answer (4 per request).
  const runItems = [...selectActiveMatrixRunItems(item.runs)].sort(
    compareRunItemsForPriority,
  );

  const labelForRun = (runId: string): DraftInteractionLabel => {
    const key = getLabelKey(request.id, runId);
    return draftsByLabelKey[key] ??
      (labelsByKey.get(key)
        ? toDraftLabel(labelsByKey.get(key)!)
        : createEmptyLabel(null));
  };

  return (
    <View className="rounded-lg border border-ink/10 bg-white p-4">
      <Text className="text-sm font-semibold uppercase text-leaf">
        #{index + 1}
      </Text>

      <Text className="mt-3 text-xl font-bold text-ink">
        {request.inputSourceText} + {request.inputTargetText}
      </Text>
      <Text className="mt-1 text-sm leading-5 text-ink/60">
        Request ID {request.id.slice(0, 8)}
      </Text>

      <View className="mt-4 rounded-lg border border-leaf/40 bg-leaf/5 p-3">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="text-sm font-semibold text-ink">
            Your verdict (ground truth)
          </Text>
          {verdictLabel.finalCategory ? (
            <CategoryPill category={verdictLabel.finalCategory} />
          ) : (
            <Text className="rounded-md bg-mist px-2 py-1 text-xs font-semibold uppercase text-ink/50">
              Not set
            </Text>
          )}
        </View>
        <Text className="mt-1 text-xs leading-5 text-ink/60">
          Your own clinical call for this pair. It anchors the grading below —
          judge each model against this, not against the other models. Adjust it
          here if you've changed your mind.
        </Text>
        <View className="mt-3">
          <SegmentedControl
            label="Correct interaction category"
            options={categoryOptions}
            selected={verdictLabel.finalCategory ?? undefined}
            onSelect={(finalCategory) =>
              setLabel(null, { ...verdictLabel, finalCategory })
            }
          />
        </View>
      </View>

      <View className="mt-4">
        <RunMatrixPanel items={runItems} />
      </View>

      {runItems.length ? (
        <View className="mt-4 gap-4">
          <Text className="text-sm font-semibold text-ink">
            Grade each model answer ({runItems.length})
          </Text>
          {runItems.map((runItem) => (
            <ModelRunEvaluation
              key={runItem.run.id}
              item={runItem}
              groundTruthCategory={verdictLabel.finalCategory ?? null}
              label={labelForRun(runItem.run.id)}
              setLabel={(label) => setLabel(runItem.run.id, label)}
            />
          ))}
        </View>
      ) : (
        <Text className="mt-4 text-sm leading-5 text-coral">
          No runs available for the shortlisted models on this pair.
        </Text>
      )}
    </View>
  );
}

function RunMatrixPanel({ items }: { items: RuntimeRunItem[] }) {
  const strategies = groupRunItemsByStrategy(items);

  return (
    <View className="rounded-lg border border-ink/10 bg-white p-3">
      <Text className="text-sm font-semibold text-ink">
        Retrieval x model matrix
      </Text>
      <View className="mt-3 gap-3">
        {strategies.map(([strategy, strategyItems]) => (
          <View key={strategy}>
            <Text className="text-xs font-semibold uppercase text-ink/50">
              {formatStrategyName(strategy)}
            </Text>
            <View className="mt-2 flex-row flex-wrap gap-2">
              {strategyItems.map(({ run }) => (
                <RunMatrixChip key={run.id} run={run} />
              ))}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function RunMatrixChip({ run }: { run: RuntimeRunItem["run"] }) {
  const latencyMs = getTraceNumber(
    run.decisionTrace as Record<string, unknown>,
    "latencyMs",
  );
  const category = run.answerCategory ?? "unclear";
  const styles = matrixCategoryStyles[category] ?? matrixCategoryStyles.unclear;

  return (
    <View className={`min-w-36 rounded-lg border px-3 py-2 ${styles.container}`}>
      <Text className={`text-xs font-bold uppercase ${styles.text}`}>
        {formatModelName(run.model)}
      </Text>
      <Text className={`mt-1 text-xs font-semibold uppercase ${styles.text}`}>
        {run.status === "completed" ? formatLabel(category) : formatLabel(run.status)}
      </Text>
      <Text className={`mt-1 text-xs ${styles.text}`}>
        {run.confidence !== null && run.confidence !== undefined
          ? `${Math.round(run.confidence * 100)}%`
          : "No confidence"}
        {latencyMs !== null ? ` • ${formatLatency(latencyMs)}` : ""}
      </Text>
    </View>
  );
}

function ModelRunEvaluation({
  groundTruthCategory,
  item,
  label,
  setLabel,
}: {
  groundTruthCategory?: InteractionEvaluationCategory | null;
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
  // When the model's category disagrees with the pharmacist's ground-truth
  // verdict, a failure mode is required: she must say what went wrong.
  const categoryMismatch = Boolean(
    groundTruthCategory &&
      groundTruthCategory !== "unclear" &&
      run.answerCategory &&
      run.answerCategory !== groundTruthCategory,
  );

  return (
    <View className="rounded-lg border border-ink/10 bg-mist p-3">
      <View className="rounded-lg border border-ink/10 bg-white p-3">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="text-sm font-semibold text-ink">
            {formatModelName(run.model)}
          </Text>
          <Text className="rounded-md bg-mist px-2 py-1 text-xs font-semibold uppercase text-ink/60">
            {formatStrategyName(run.retrievalStrategyVersion)}
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
        sourceName={run.resolvedSourceNode?.canonicalName ?? null}
        targetName={run.resolvedTargetNode?.canonicalName ?? null}
      />

      <ModelVsGroundTruth
        modelName={formatModelName(run.model)}
        modelCategory={run.answerCategory ?? null}
        groundTruthCategory={groundTruthCategory ?? null}
      />

      <View className="mt-4 gap-3 rounded-lg border border-ink/10 bg-white p-3">
        <MultiSelectControl
          label="Failure modes"
          infoText="What specifically went wrong with this answer. Pick None if it's clean. Tap the i next to any option for its meaning."
          descriptions={failureModeDescriptions}
          options={failureModeOptions}
          selected={label.failureModes ?? []}
          onChange={(failureModes) => setLabel({ ...label, failureModes })}
          required={categoryMismatch}
          hideNone={categoryMismatch}
          requiredMessage="This answer didn't match your ground-truth verdict — pick at least one failure mode to say what went wrong."
        />
        <MissingContextControl
          selected={label.missingContext ?? []}
          onChange={(missingContext) => setLabel({ ...label, missingContext })}
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

function ModelVsGroundTruth({
  groundTruthCategory,
  modelCategory,
  modelName,
}: {
  groundTruthCategory: InteractionEvaluationCategory | null;
  modelCategory: InteractionEvaluationCategory | null;
  modelName: string;
}) {
  const distance = categoryDistance(modelCategory, groundTruthCategory);
  const matches = distance === 0;

  return (
    <View className="mt-4 gap-2 rounded-lg border border-leaf/30 bg-leaf/5 p-3">
      <Text className="text-xs font-semibold uppercase text-ink/60">
        This model's answer vs your ground truth
      </Text>
      <View className="flex-row flex-wrap items-center gap-2">
        <Text className="text-xs text-ink/60">{modelName} said</Text>
        <CategoryPill category={modelCategory ?? "unclear"} />
        <Text className="text-xs text-ink/60">· you said</Text>
        {groundTruthCategory ? (
          <CategoryPill category={groundTruthCategory} />
        ) : (
          <Text className="text-xs font-semibold uppercase text-coral">
            verdict not set — set it above
          </Text>
        )}
        {distance !== null ? (
          <Text
            className={`rounded-md px-2 py-1 text-xs font-semibold uppercase ${
              matches
                ? "bg-green-100 text-green-700"
                : "bg-amber-100 text-amber-700"
            }`}
          >
            {matches ? "Match" : `Off by ${distance}`}
          </Text>
        ) : null}
      </View>
      <Text className="text-xs leading-5 text-ink/50">
        This comparison is automatic. Below, judge how the model got
        here — evidence, interpretation, management, and whether it's safe to
        automate.
      </Text>
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
  sourceName,
  targetName,
  usedEvidence,
}: {
  otherEvidence: InteractionEvaluationRequestWithRun["evidence"];
  sourceName: string | null;
  targetName: string | null;
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
            <EvidenceRow
              evidence={row}
              key={row.id}
              sourceName={sourceName}
              targetName={targetName}
            />
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

function EvidenceLink({ label, url }: { label: string; url: string }) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => void Linking.openURL(url)}
    >
      <Text className="text-sm font-semibold text-leaf underline">{label}</Text>
    </Pressable>
  );
}

function EvidenceRow({
  evidence,
  sourceName,
  targetName,
}: {
  evidence: InteractionEvaluationRequestWithRun["evidence"][number];
  sourceName: string | null;
  targetName: string | null;
}) {
  const pmid = getMetadataString(evidence.metadata, "pmid");
  const pmcid = getMetadataString(evidence.metadata, "pmcid");
  const sourceUrl = getMetadataString(evidence.metadata, "sourceUrl");
  const side = getMetadataString(evidence.metadata, "side");
  const isMonograph = evidence.sourceKind === "cps_monograph" ||
    evidence.sourceKind === "health_canada_product_monograph";
  // Monographs aren't URL-addressable in our index, so offer a name-scoped
  // search the pharmacist can use to pull the real monograph and cross-check.
  const monographName = side === "source"
    ? sourceName
    : side === "target"
      ? targetName
      : (sourceName ?? targetName);
  const monographSearchUrl = isMonograph && monographName
    ? `https://www.google.com/search?q=${
      encodeURIComponent(`${monographName} product monograph drug interactions`)
    }`
    : null;
  const hasLink = Boolean(pmid || pmcid || sourceUrl || monographSearchUrl);

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
      <View className="mt-2 flex-row flex-wrap items-center gap-3">
        {pmid ? (
          <EvidenceLink
            label="Open PubMed"
            url={`https://pubmed.ncbi.nlm.nih.gov/${pmid}/`}
          />
        ) : null}
        {pmcid ? (
          <EvidenceLink
            label="Open full text (PMC)"
            url={`https://www.ncbi.nlm.nih.gov/pmc/articles/${pmcid}/`}
          />
        ) : null}
        {sourceUrl ? <EvidenceLink label="Open source" url={sourceUrl} /> : null}
        {monographSearchUrl ? (
          <EvidenceLink label="Find monograph" url={monographSearchUrl} />
        ) : null}
        {!hasLink ? (
          <Text className="text-xs text-ink/40">
            {evidence.sourceKind === "kg_edge"
              ? "Published interaction (internal reference)"
              : "No external source link available"}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function MetricsPanel({ metrics }: { metrics: RuntimeMetrics }) {
  return (
    <View className="rounded-lg border border-ink/10 bg-white p-4">
      {/* Pass 2: per-model grading across the 2x2 shortlist (4 answers/request). */}
      <View className="flex-row flex-wrap gap-2">
        <MetricPill
          label="Verdicts entered"
          value={`${metrics.verdicts}/${metrics.totalRequests}`}
        />
        <MetricPill
          label="Model reviews"
          value={`${metrics.reviewed}/${metrics.total}`}
        />
        <MetricPill
          label="Category correct"
          value={formatRate(metrics.categoryAccuracy)}
        />
        <MetricPill label="Flagged" value={metrics.flagged} />
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

function InfoDot({
  active,
  onPress,
}: {
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="More information"
      hitSlop={8}
      onPress={onPress}
      className={`h-4 w-4 items-center justify-center rounded-full border ${
        active ? "border-leaf bg-leaf" : "border-ink/40 bg-white"
      }`}
    >
      <Text
        className={`text-[10px] font-bold ${
          active ? "text-white" : "text-ink/50"
        }`}
      >
        i
      </Text>
    </Pressable>
  );
}

function MultiSelectControl<T extends string>({
  descriptions,
  hideNone,
  infoText,
  label,
  onChange,
  options,
  required,
  requiredMessage,
  selected,
}: {
  descriptions?: Partial<Record<T, string>>;
  hideNone?: boolean;
  infoText?: string;
  label: string;
  onChange: (value: T[]) => void;
  options: Array<{ label: string; value: T }>;
  required?: boolean;
  requiredMessage?: string;
  selected: T[];
}) {
  const [activeInfo, setActiveInfo] = useState<string | null>(null);
  const shownOptions = hideNone
    ? options.filter((option) => option.value !== ("none" as T))
    : options;
  const hasRealSelection = selected.some((value) => value !== ("none" as T));
  const unmet = Boolean(required) && !hasRealSelection;
  const activeText = activeInfo === "__question"
    ? infoText
    : activeInfo
      ? descriptions?.[activeInfo as T]
      : null;

  return (
    <View>
      <View className="flex-row flex-wrap items-center gap-2">
        <Text className="text-sm font-semibold text-ink">{label}</Text>
        {infoText ? (
          <InfoDot
            active={activeInfo === "__question"}
            onPress={() =>
              setActiveInfo((prev) =>
                prev === "__question" ? null : "__question"
              )
            }
          />
        ) : null}
        {required ? (
          <Text className="text-xs font-semibold uppercase text-coral">
            Required
          </Text>
        ) : null}
      </View>
      {activeText ? (
        <View className="mt-2 rounded-md border border-ink/15 bg-mist p-2">
          <Text className="text-xs leading-4 text-ink/70">{activeText}</Text>
        </View>
      ) : null}
      <View className="mt-2 flex-row flex-wrap gap-2">
        {shownOptions.map((option) => {
          const isSelected = selected.includes(option.value);
          const desc = descriptions?.[option.value];

          return (
            <View
              className="flex-row items-center gap-1"
              key={option.value}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                className={`rounded-lg border px-3 py-2 ${
                  isSelected ? "border-leaf bg-leaf" : "border-ink/10 bg-white"
                }`}
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
              {desc ? (
                <InfoDot
                  active={activeInfo === option.value}
                  onPress={() =>
                    setActiveInfo((prev) =>
                      prev === option.value ? null : option.value
                    )
                  }
                />
              ) : null}
            </View>
          );
        })}
      </View>
      {unmet ? (
        <Text className="mt-2 text-xs font-semibold text-coral">
          {requiredMessage ??
            "Required — pick at least one failure mode."}
        </Text>
      ) : null}
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
  const [activeInfo, setActiveInfo] = useState<
    PubMedCalibrationMissingContext | "__question" | null
  >(null);
  const activeText = activeInfo === "__question"
    ? "What you'd have needed to judge this answer confidently. Leave on None if nothing was missing."
    : activeInfo
      ? missingContextDescriptions[activeInfo]
      : null;

  return (
    <View>
      <View className="flex-row flex-wrap items-center gap-2">
        <Text className="text-sm font-semibold text-ink">
          Missing context, if any
        </Text>
        <InfoDot
          active={activeInfo === "__question"}
          onPress={() =>
            setActiveInfo((prev) => (prev === "__question" ? null : "__question"))
          }
        />
      </View>
      {activeText ? (
        <View className="mt-2 rounded-md border border-ink/15 bg-mist p-2">
          <Text className="text-xs leading-4 text-ink/70">{activeText}</Text>
        </View>
      ) : null}
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
          const desc = missingContextDescriptions[option.value];

          return (
            <View className="flex-row items-center gap-1" key={option.value}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                className={`rounded-lg border px-3 py-2 ${
                  isSelected ? "border-leaf bg-leaf" : "border-ink/10 bg-white"
                }`}
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
              {desc ? (
                <InfoDot
                  active={activeInfo === option.value}
                  onPress={() =>
                    setActiveInfo((prev) =>
                      prev === option.value ? null : option.value
                    )
                  }
                />
              ) : null}
            </View>
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
    selectActiveMatrixRunItems(item.runs).map((runItem) => ({
      requestId: item.request.id,
      runItem,
    }))
  );
  // Per-request ground-truth verdict (runId null) — the pharmacist no longer
  // re-picks a category on each model card, so model correctness is derived by
  // comparing the model's answer to this verdict.
  const verdictByRequest = new Map<string, InteractionEvaluationCategory>();
  for (const item of items) {
    const key = getLabelKey(item.request.id, null);
    const draft = draftsByLabelKey[key];
    const saved = savedLabelsByKey.get(key);
    const verdict = (draft ?? (saved ? toDraftLabel(saved) : null))?.finalCategory;
    if (verdict) verdictByRequest.set(item.request.id, verdict);
  }
  const verdicts = verdictByRequest.size;

  // A model card counts as reviewed once she's recorded anything on it:
  // a failure mode (including "None"), a missing-context tag, or a note.
  const labelFor = (requestId: string, runId: string) => {
    const labelKey = getLabelKey(requestId, runId);
    return draftsByLabelKey[labelKey] ??
      (savedLabelsByKey.get(labelKey)
        ? toDraftLabel(savedLabelsByKey.get(labelKey)!)
        : null);
  };
  const isTouched = (label: DraftInteractionLabel | null) =>
    Boolean(
      (label?.failureModes && label.failureModes.length > 0) ||
        (label?.missingContext && label.missingContext.length > 0) ||
        (label?.notes && label.notes.trim().length > 0),
    );
  const hasRealFailure = (label: DraftInteractionLabel | null) =>
    Boolean(label?.failureModes?.some((mode) => mode !== "none"));
  // A card is reviewed once she's recorded anything on it; but when the model's
  // category disagreed with her verdict, it isn't complete until she's named a
  // real failure mode (mirrors the required-on-mismatch rule in the form).
  const reviewed = runItems.filter(({ requestId, runItem }) => {
    const label = labelFor(requestId, runItem.run.id);
    const verdict = verdictByRequest.get(requestId);
    const mismatch = Boolean(
      verdict &&
        verdict !== "unclear" &&
        runItem.run.answerCategory &&
        runItem.run.answerCategory !== verdict,
    );
    return mismatch ? hasRealFailure(label) : isTouched(label);
  }).length;
  // Cards she flagged with at least one real failure mode (beyond "None").
  const flagged = runItems.filter(({ requestId, runItem }) =>
    hasRealFailure(labelFor(requestId, runItem.run.id))
  ).length;

  const categoryScorable = runItems.filter(({ requestId, runItem }) => {
    const verdict = verdictByRequest.get(requestId);
    return Boolean(verdict && verdict !== "unclear" && runItem.run.answerCategory);
  });
  const categoryAccuracyValue = categoryScorable.length
    ? categoryScorable.filter(
      ({ requestId, runItem }) =>
        verdictByRequest.get(requestId) === runItem.run.answerCategory,
    ).length / categoryScorable.length
    : 0;

  return {
    totalRequests: items.length,
    verdicts,
    categoryAccuracy: categoryAccuracyValue,
    flagged,
    reviewed,
    total: runItems.length,
  };
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

function formatStrategyName(strategy?: string | null): string {
  switch (strategy) {
    case "monograph_direct_top8":
      return "Monograph direct top 8";
    case "monograph_direct_plus_pubmed_top10":
    case "indexed-monograph-pubmed-runtime-v1":
      return "Monograph + PubMed top 10";
    case "monograph_plus_safety_top12":
      return "Monograph + safety top 12";
    case "ingredient_product_class_guarded_top12":
      return "Ingredient/product/class guarded top 12";
    case "published-kg-runtime-v1":
      return "Published KG";
    default:
      return strategy ? formatLabel(strategy) : "Unknown retrieval";
  }
}

function groupRunItemsByStrategy(
  items: RuntimeRunItem[],
): Array<[string, RuntimeRunItem[]]> {
  const groups = new Map<string, RuntimeRunItem[]>();

  for (const item of items) {
    const strategy = item.run.retrievalStrategyVersion ?? "unknown";
    groups.set(strategy, [...(groups.get(strategy) ?? []), item]);
  }

  return [...groups.entries()].sort(
    ([left], [right]) => strategySortRank(left) - strategySortRank(right),
  );
}

function selectActiveMatrixRunItems(items: RuntimeRunItem[]): RuntimeRunItem[] {
  const matrixItems = items.filter(isActiveMatrixRunItem);
  return matrixItems.length ? matrixItems : items;
}

function isActiveMatrixRunItem(item: RuntimeRunItem): boolean {
  return activeMatrixRetrievalStrategies.has(
      item.run.retrievalStrategyVersion,
    ) &&
    activeMatrixModels.has(item.run.model ?? "");
}

function selectPriorityRunItems(items: RuntimeRunItem[]): RuntimeRunItem[] {
  if (items.length <= 4) {
    return items;
  }

  const selected = new Map<string, RuntimeRunItem>();
  const addFirst = (
    predicate: (item: RuntimeRunItem) => boolean,
  ) => {
    const item = items.find(predicate);

    if (item) {
      selected.set(item.run.id, item);
    }
  };

  addFirst((item) => item.run.status !== "completed");
  addFirst((item) =>
    item.run.model === "claude-opus-4-8" &&
    item.run.retrievalStrategyVersion === "monograph_direct_plus_pubmed_top10"
  );
  addFirst((item) =>
    item.run.model === "gpt-5.5" &&
    item.run.retrievalStrategyVersion === "monograph_direct_plus_pubmed_top10"
  );
  addFirst((item) =>
    item.run.model === "gpt-5.4-mini" &&
    item.run.retrievalStrategyVersion === "monograph_direct_top8"
  );
  addFirst((item) =>
    item.run.model === "claude-haiku-4-5-20251001" &&
    item.run.retrievalStrategyVersion ===
      "ingredient_product_class_guarded_top12"
  );

  for (const item of [...items].sort(compareRunItemsForPriority)) {
    if (selected.size >= 4) {
      break;
    }

    selected.set(item.run.id, item);
  }

  return [...selected.values()].slice(0, 4);
}

function compareRunItemsForPriority(
  left: RuntimeRunItem,
  right: RuntimeRunItem,
): number {
  return Number(left.run.status === "completed") -
      Number(right.run.status === "completed") ||
    strategySortRank(left.run.retrievalStrategyVersion) -
      strategySortRank(right.run.retrievalStrategyVersion) ||
    modelSortRank(left.run.model) - modelSortRank(right.run.model);
}

function strategySortRank(strategy?: string | null): number {
  switch (strategy) {
    case "monograph_direct_top8":
      return 0;
    case "monograph_direct_plus_pubmed_top10":
    case "indexed-monograph-pubmed-runtime-v1":
      return 1;
    case "monograph_plus_safety_top12":
      return 2;
    case "ingredient_product_class_guarded_top12":
      return 3;
    case "published-kg-runtime-v1":
      return 4;
    default:
      return 5;
  }
}

function modelSortRank(model?: string | null): number {
  switch (model) {
    case "claude-opus-4-8":
      return 0;
    case "claude-sonnet-4-6":
      return 1;
    case "claude-haiku-4-5-20251001":
    case "claude-haiku-4-5":
      return 2;
    case "gpt-5.5":
      return 3;
    case "gpt-5.4-mini":
      return 4;
    case "deterministic-published-kg-lookup":
      return 5;
    default:
      return 6;
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
  categoryAccuracy: number;
  flagged: number;
  reviewed: number;
  total: number;
  totalRequests: number;
  verdicts: number;
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

// Ordered severity scale used to compare a model's answer to the ground-truth
// verdict (distance = how many categories apart). "unclear" is off-scale.
const categorySeverityScale: InteractionEvaluationCategory[] = [
  "no_known_interaction",
  "no_action_needed",
  "monitor_therapy",
  "consider_therapy_modification",
  "avoid_combination",
];

function categoryDistance(
  a?: InteractionEvaluationCategory | null,
  b?: InteractionEvaluationCategory | null,
): number | null {
  if (!a || !b) return null;
  const ai = categorySeverityScale.indexOf(a);
  const bi = categorySeverityScale.indexOf(b);
  if (ai < 0 || bi < 0) return null;
  return Math.abs(ai - bi);
}

const categoryStyles: Record<InteractionEvaluationCategory, string> = {
  avoid_combination: "border-red-200 bg-red-50 text-red-700",
  consider_therapy_modification:
    "border-orange-200 bg-orange-50 text-orange-700",
  monitor_therapy: "border-yellow-200 bg-yellow-50 text-yellow-700",
  no_action_needed: "border-blue-200 bg-blue-50 text-blue-700",
  no_known_interaction: "border-green-200 bg-green-50 text-green-700",
  unclear: "border-ink/10 bg-white text-ink/60",
};

const matrixCategoryStyles: Record<
  InteractionEvaluationCategory,
  { container: string; text: string }
> = {
  avoid_combination: {
    container: "border-red-200 bg-red-50",
    text: "text-red-700",
  },
  consider_therapy_modification: {
    container: "border-orange-200 bg-orange-50",
    text: "text-orange-700",
  },
  monitor_therapy: {
    container: "border-yellow-200 bg-yellow-50",
    text: "text-yellow-700",
  },
  no_action_needed: {
    container: "border-blue-200 bg-blue-50",
    text: "text-blue-700",
  },
  no_known_interaction: {
    container: "border-green-200 bg-green-50",
    text: "text-green-700",
  },
  unclear: {
    container: "border-ink/10 bg-mist",
    text: "text-ink/60",
  },
};

const failureModeOptions: Array<{
  label: string;
  value: PubMedCalibrationFailureMode;
}> = [
  { label: "None", value: "none" },
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

const failureModeDescriptions: Partial<
  Record<PubMedCalibrationFailureMode, string>
> = {
  none: "The answer is acceptable; nothing went wrong. Pick this to positively mark a clean answer.",
  evidence_does_not_support_interaction:
    "It claims an interaction the retrieved evidence doesn't actually support (no source names both drugs / no real interaction shown).",
  mechanism_only_inference:
    "It inferred an interaction purely from a shared mechanism (\"both affect CYP3A4\") with no evidence the pair actually interacts. The classic over-warning trap.",
  table_or_figure_misread:
    "It pulled a number or conclusion from a table or figure and read it wrong (wrong row, wrong units, wrong study arm).",
  severity_unsupported:
    "The direction may be right but the severity rating (monitor vs avoid, etc.) isn't backed by the evidence — over- or under-stated.",
  management_unsupported:
    "The monitoring/management advice it gives isn't supported by the sources (made-up dose change, wrong monitoring parameter).",
  narrow_applicability_overgeneralized:
    "It stretched narrow evidence (one case report, an animal study, a single population) into a broad clinical warning. Includes applying systemic evidence to a topical/local product.",
  duplicate_or_stale_evidence:
    "It leaned on duplicated or outdated evidence (superseded label, old/retracted data, the same chunk counted twice).",
  contradicted_evidence:
    "It ignored or contradicted a retrieved source that limits or argues against the interaction.",
  missing_source_coverage:
    "The answer needed a source that simply wasn't retrieved; it answered with a known gap in the evidence set.",
};

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

const missingContextDescriptions: Partial<
  Record<PubMedCalibrationMissingContext, string>
> = {
  cps_comparison: "You'd want to compare against the CPS monograph to judge confidently.",
  full_article: "You'd need the full article (not just the abstract) to verify.",
  medeffect_safety: "You'd need MedEffect / safety-signal data to judge.",
  nhp_data: "You'd need natural-health-product data to judge.",
  noc_context: "You'd need Notice of Compliance / approval context to judge.",
  route_form:
    "The answer ignores that the interaction depends on formulation/route (e.g. systemic vs topical).",
  severity_management: "You'd need clearer severity/management guidance to judge.",
};
