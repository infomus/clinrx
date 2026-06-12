import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  getPubMedCandidateCount,
  getPubMedCandidateReviewMetrics,
  listPubMedInteractionCandidates,
  markPubMedCandidateNeedsFollowUp,
  publishPubMedCandidate,
  rejectPubMedCandidate,
  searchKgNodes,
  updatePubMedCandidateResolution,
} from "@clinrx/api";
import type {
  EdgeReviewStatus,
  HealthCanadaMonographCoverage,
  InteractionActionCategory,
  KgNode,
  PubMedAiDecision,
  PubMedAiReviewVerdict,
  PubMedAutomationTier,
  PubMedInteractionCandidate,
  PubMedRejectionReason,
} from "@clinrx/types";

import { ProtectedRoute } from "@/components/ProtectedRoute";
import { supabase } from "@/lib/supabase";

export default function InteractionReviewScreen() {
  return (
    <ProtectedRoute>
      <InteractionReviewContent />
    </ProtectedRoute>
  );
}

function InteractionReviewContent() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [reviewStatus, setReviewStatus] =
    useState<EdgeReviewStatus>("candidate");
  const [aiReviewVerdict, setAiReviewVerdict] = useState<
    PubMedAiReviewVerdict | "all"
  >("all");
  const [aiDecision, setAiDecision] = useState<PubMedAiDecision | "all">(
    "all",
  );
  const [automationTier, setAutomationTier] = useState<
    PubMedAutomationTier | "all"
  >("all");
  const [resolutionFilter, setResolutionFilter] = useState<
    "all" | "resolved" | "unresolved"
  >("all");
  const [resolutionFlagFilter, setResolutionFlagFilter] =
    useState<ResolutionFlagFilter>("all");

  const candidatesQuery = useQuery({
    queryKey: [
      "pubmed-interaction-candidates",
      reviewStatus,
      aiReviewVerdict,
      aiDecision,
      automationTier,
      resolutionFilter,
      resolutionFlagFilter,
      page,
    ],
    queryFn: () =>
      listPubMedInteractionCandidates(supabase, {
        aiDecision,
        aiReviewVerdict,
        automationTier,
        limit:
          resolutionFlagFilter === "all"
            ? reviewPageSize
            : flaggedReviewFetchLimit,
        offset: resolutionFlagFilter === "all" ? page * reviewPageSize : 0,
        resolution: resolutionFilter,
        reviewStatus,
      }),
  });
  const metricsQuery = useQuery({
    queryKey: ["pubmed-interaction-candidate-metrics"],
    queryFn: () => getPubMedCandidateReviewMetrics(supabase),
  });
  const countQuery = useQuery({
    queryKey: [
      "pubmed-interaction-candidate-count",
      reviewStatus,
      aiReviewVerdict,
      aiDecision,
      automationTier,
      resolutionFilter,
    ],
    queryFn: () =>
      getPubMedCandidateCount(supabase, {
        aiDecision,
        aiReviewVerdict,
        automationTier,
        resolution: resolutionFilter,
        reviewStatus,
      }),
  });

  const publishMutation = useMutation({
    mutationFn: (candidateId: string) =>
      publishPubMedCandidate(supabase, candidateId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["pubmed-interaction-candidates"],
      });
      queryClient.invalidateQueries({
        queryKey: ["pubmed-interaction-candidate-metrics"],
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({
      candidateId,
      notes,
      reason,
    }: {
      candidateId: string;
      notes?: string;
      reason: PubMedRejectionReason;
    }) => rejectPubMedCandidate(supabase, candidateId, reason, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["pubmed-interaction-candidates"],
      });
      queryClient.invalidateQueries({
        queryKey: ["pubmed-interaction-candidate-metrics"],
      });
    },
  });

  const followUpMutation = useMutation({
    mutationFn: ({
      candidateId,
      notes,
    }: {
      candidateId: string;
      notes?: string;
    }) => markPubMedCandidateNeedsFollowUp(supabase, candidateId, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["pubmed-interaction-candidates"],
      });
      queryClient.invalidateQueries({
        queryKey: ["pubmed-interaction-candidate-metrics"],
      });
    },
  });

  const resolutionMutation = useMutation({
    mutationFn: ({
      candidate,
      resolvedSourceId,
      resolvedTargetId,
      reviewerNotes,
    }: {
      candidate: PubMedInteractionCandidate;
      resolvedSourceId: string | null;
      resolvedTargetId: string | null;
      reviewerNotes?: string;
    }) =>
      updatePubMedCandidateResolution(supabase, candidate.id, {
        resolvedSourceId,
        resolvedTargetId,
        reviewerNotes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["pubmed-interaction-candidates"],
      });
      queryClient.invalidateQueries({
        queryKey: ["pubmed-interaction-candidate-metrics"],
      });
    },
  });

  const filteredCandidates =
    resolutionFlagFilter === "all"
      ? (candidatesQuery.data ?? [])
      : (candidatesQuery.data ?? []).filter((candidate) =>
          candidateHasFlag(candidate, resolutionFlagFilter),
        );
  const visibleCandidates =
    resolutionFlagFilter === "all"
      ? filteredCandidates
      : filteredCandidates.slice(page * reviewPageSize, (page + 1) * reviewPageSize);

  useEffect(() => {
    setPage(0);
  }, [
    aiDecision,
    aiReviewVerdict,
    automationTier,
    resolutionFilter,
    resolutionFlagFilter,
    reviewStatus,
  ]);

  const activeResultCount =
    resolutionFlagFilter === "all"
      ? (countQuery.data ?? 0)
      : filteredCandidates.length;
  const totalPages = Math.max(1, Math.ceil(activeResultCount / reviewPageSize));
  const hasPreviousPage = page > 0;
  const hasNextPage = page + 1 < totalPages;

  return (
    <ScrollView className="flex-1 bg-mist">
      <View className="min-h-screen px-5 pb-10 pt-16">
        <View className="mb-7">
          <Text className="text-sm font-semibold uppercase text-leaf">
            Reviewer gate
          </Text>
          <Text className="mt-3 text-4xl font-bold text-ink">
            PubMed Candidates
          </Text>
          <Text className="mt-3 text-base leading-6 text-ink/70">
            Extracted interaction candidates are staged for diagnostics,
            calibration, and graph resolution. Automation tiers decide what can
            be sampled, quarantined, or considered publish-ready.
          </Text>
        </View>

        <View className="mb-4 gap-3 rounded-lg border border-ink/10 bg-white p-4">
          {metricsQuery.data ? (
            <View className="flex-row flex-wrap gap-2">
              <MetricPill label="Total" value={metricsQuery.data.total} />
              <MetricPill
                label="Candidates"
                value={metricsQuery.data.candidate}
              />
              <MetricPill
                label="Follow-up"
                value={metricsQuery.data.followUp}
              />
              <MetricPill label="Rejected" value={metricsQuery.data.rejected} />
              <MetricPill
                label="Published"
                value={metricsQuery.data.published}
              />
              <MetricPill
                label="Likely publishable"
                value={metricsQuery.data.likelyPublishable}
              />
              <MetricPill
                label="Resolved"
                value={metricsQuery.data.resolvedCandidates}
              />
            </View>
          ) : null}
          <FilterGroup
            label="Status"
            options={reviewStatusOptions}
            selected={reviewStatus}
            onSelect={setReviewStatus}
          />
          <FilterGroup
            label="AI verdict"
            options={aiVerdictFilterOptions}
            selected={aiReviewVerdict}
            onSelect={setAiReviewVerdict}
          />
          <FilterGroup
            label="AI decision"
            options={aiDecisionFilterOptions}
            selected={aiDecision}
            onSelect={setAiDecision}
          />
          <FilterGroup
            label="Automation tier"
            options={automationTierFilterOptions}
            selected={automationTier}
            onSelect={setAutomationTier}
          />
          <FilterGroup
            label="Resolution"
            options={resolutionFilterOptions}
            selected={resolutionFilter}
            onSelect={setResolutionFilter}
          />
          <FilterGroup
            label="Resolution flags"
            options={resolutionFlagFilterOptions}
            selected={resolutionFlagFilter}
            onSelect={setResolutionFlagFilter}
          />
          <PaginationControls
            currentPage={page}
            hasNextPage={hasNextPage}
            hasPreviousPage={hasPreviousPage}
            isLoading={candidatesQuery.isFetching}
            pageSize={reviewPageSize}
            totalItems={activeResultCount}
            totalPages={totalPages}
            onNext={() => setPage((currentPage) => currentPage + 1)}
            onPrevious={() =>
              setPage((currentPage) => Math.max(0, currentPage - 1))
            }
          />
        </View>

        {candidatesQuery.isLoading ? (
          <Text className="text-ink/70">Loading candidates...</Text>
        ) : candidatesQuery.isError ? (
          <Text className="text-coral">Could not load candidates.</Text>
        ) : visibleCandidates.length ? (
          <View className="gap-4">
            {visibleCandidates.map((candidate) => (
              <CandidateCard
                candidate={candidate}
                key={candidate.id}
                onPublish={() => publishMutation.mutate(candidate.id)}
                onResolve={(resolvedSourceId, resolvedTargetId, notes) =>
                  resolutionMutation.mutate({
                    candidate,
                    resolvedSourceId,
                    resolvedTargetId,
                    reviewerNotes: notes,
                  })
                }
                onFollowUp={(notes) =>
                  followUpMutation.mutate({
                    candidateId: candidate.id,
                    notes,
                  })
                }
                onReject={(reason, notes) =>
                  rejectMutation.mutate({
                    candidateId: candidate.id,
                    notes,
                    reason,
                  })
                }
              />
            ))}
          </View>
        ) : (
          <View className="rounded-lg border border-ink/10 bg-white p-4">
            <Text className="text-base font-semibold text-ink">
              No candidates staged
            </Text>
            <Text className="mt-2 leading-6 text-ink/70">
              Run the PubMed harvest, extract, and stage scripts to populate
              this queue.
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function CandidateCard({
  candidate,
  onFollowUp,
  onPublish,
  onResolve,
  onReject,
}: {
  candidate: PubMedInteractionCandidate;
  onFollowUp: (notes?: string) => void;
  onPublish: () => void;
  onResolve: (
    resolvedSourceId: string | null,
    resolvedTargetId: string | null,
    notes?: string,
  ) => void;
  onReject: (reason: PubMedRejectionReason, notes?: string) => void;
}) {
  const [selectedReason, setSelectedReason] = useState<PubMedRejectionReason>(
    candidate.aiReviewRecommendedRejectionReason ?? "unsupported_by_quote",
  );
  const [reviewerNote, setReviewerNote] = useState("");
  const canPublish = Boolean(
    candidate.resolvedSourceId && candidate.resolvedTargetId,
  );
  const actionCategory = getCandidateActionCategory(candidate);
  const actionCategoryStyle = actionCategoryStyles[actionCategory];
  const trimmedReviewerNote = reviewerNote.trim();
  const aiReviewParseFailed =
    candidate.aiReview?.summary
      .toLowerCase()
      .includes("ai review parse failed") ?? false;
  const subjectFlag = candidate.resolvedSourceId
    ? null
    : classifyUnresolvedMention(candidate.subjectText);
  const objectFlag = candidate.resolvedTargetId
    ? null
    : classifyUnresolvedMention(candidate.objectText);
  const resolutionFlags = buildCandidateResolutionFlags(candidate);

  return (
    <View className="rounded-lg border border-ink/10 bg-white p-4">
      <View className="flex-row flex-wrap items-center gap-2">
        <Text
          className={`rounded-md border px-2 py-1 text-xs font-semibold uppercase ${actionCategoryStyle.badge}`}
        >
          {actionCategoryLabels[actionCategory]}
        </Text>
        <Text className="text-xs font-semibold uppercase text-ink/50">
          Severity: {severityLabels[candidate.severity]}
        </Text>
      </View>
      <Text className="mt-2 text-lg font-semibold text-ink">
        {candidate.subjectText} + {candidate.objectText}
      </Text>
      {candidate.articleTitle ? (
        <Text className="mt-2 text-base font-semibold leading-6 text-ink">
          {candidate.articleTitle}
        </Text>
      ) : null}
      <Text className="mt-2 text-sm text-ink/60">
        PMID {candidate.pmid}
        {candidate.articleYear ? ` • Published ${candidate.articleYear}` : ""}
      </Text>
      <Pressable
        accessibilityRole="link"
        className="mt-2 self-start"
        onPress={() =>
          void Linking.openURL(
            `https://pubmed.ncbi.nlm.nih.gov/${candidate.pmid}/`,
          )
        }
      >
        <Text className="text-sm font-semibold text-leaf">Open PubMed</Text>
      </Pressable>
      {candidate.mechanism ? (
        <Text className="mt-3 leading-6 text-ink/70">
          {candidate.mechanism}
        </Text>
      ) : null}
      {candidate.sourceQuote ? (
        <Text className="mt-3 leading-6 text-ink/60">
          "{candidate.sourceQuote}"
        </Text>
      ) : null}
      <Text className="mt-3 text-sm text-ink/60">
        Confidence: {Math.round(candidate.extractionConfidence * 100)}%
      </Text>
      <Text className="mt-1 text-sm text-ink/60">
        Resolution: {canPublish ? "ready" : "waiting for graph node matches"}
      </Text>
      <AutomationDiagnosticsPanel candidate={candidate} />
      <MonographEvidencePanel candidate={candidate} />
      <FullTextEvidencePanel candidate={candidate} />
      {resolutionFlags.length ? (
        <ResolutionFlagPanel flags={resolutionFlags} />
      ) : null}
      {subjectFlag || objectFlag ? (
        <View className="mt-3 gap-2">
          {subjectFlag ? (
            <UnresolvedMentionFlag label="Source" flag={subjectFlag} />
          ) : null}
          {objectFlag ? (
            <UnresolvedMentionFlag label="Target" flag={objectFlag} />
          ) : null}
        </View>
      ) : null}
      {candidate.aiReview ? (
        <View className="mt-4 rounded-lg border border-ink/10 bg-white p-3">
          <View className="flex-row flex-wrap items-center gap-2">
            <Text className="text-sm font-semibold text-ink">AI review</Text>
            <Text
              className={`rounded-md border px-2 py-1 text-xs font-semibold uppercase ${actionCategoryStyle.badge}`}
            >
              {actionCategoryLabels[actionCategory]}
            </Text>
            <Text
              className={`rounded-md px-2 py-1 text-xs font-semibold ${
                candidate.aiReview.verdict === "likely_publishable"
                  ? "bg-leaf/15 text-leaf"
                  : candidate.aiReview.verdict === "likely_reject"
                    ? "bg-coral/15 text-coral"
                    : "bg-ink/10 text-ink"
              }`}
            >
              {aiVerdictLabels[candidate.aiReview.verdict]}
            </Text>
            <Text className="text-xs font-semibold text-ink/60">
              {Math.round(candidate.aiReview.score * 100)}%
            </Text>
          </View>
          {aiReviewParseFailed ? (
            <View className="mt-2 rounded-lg border border-coral/20 bg-coral/10 p-3">
              <Text className="text-sm font-semibold text-coral">
                AI review needs human review
              </Text>
              <Text className="mt-1 text-sm leading-5 text-ink/70">
                The automated reviewer returned malformed structured output.
                Treat this candidate as unreviewed by AI.
              </Text>
            </View>
          ) : (
            <Text className="mt-2 leading-6 text-ink/70">
              {candidate.aiReview.summary}
            </Text>
          )}
          <Text className="mt-2 text-sm font-semibold text-ink/70">
            Evidence
          </Text>
          <Text className="mt-1 leading-6 text-ink/60">
            {candidate.aiReview.evidenceAssessment}
          </Text>
          <Text className="mt-2 text-sm font-semibold text-ink/70">
            Severity
          </Text>
          <Text className="mt-1 leading-6 text-ink/60">
            {candidate.aiReview.severityAssessment}
          </Text>
          {candidate.aiReview.concerns.length ? (
            <View className="mt-2 gap-1">
              {candidate.aiReview.concerns.map((concern) => (
                <Text className="text-sm leading-5 text-ink/60" key={concern}>
                  - {concern}
                </Text>
              ))}
            </View>
          ) : null}
          <DecisionTracePanel candidate={candidate} />
        </View>
      ) : (
        <View className="mt-4 rounded-lg border border-ink/10 bg-white p-3">
          <Text className="text-sm font-semibold text-ink">
            AI review pending
          </Text>
          <Text className="mt-1 text-sm leading-5 text-ink/60">
            Run the AI pre-review job to add a second-pass critique before human
            review.
          </Text>
        </View>
      )}
      {candidate.reviewerNotes ? (
        <Text className="mt-3 leading-6 text-ink/60">
          {candidate.reviewerNotes}
        </Text>
      ) : null}

      <MonographCoveragePanel candidate={candidate} />

      <ResolutionEditor
        candidate={candidate}
        reviewerNote={trimmedReviewerNote || undefined}
        onResolve={onResolve}
      />

      <View className="mt-4 rounded-lg border border-ink/10 bg-mist p-3">
        <Text className="text-sm font-semibold text-ink">Rejection reason</Text>
        <View className="mt-3 flex-row flex-wrap gap-2">
          {rejectionReasons.map((reason) => {
            const selected = selectedReason === reason;

            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }}
                className={`rounded-lg border px-3 py-2 ${
                  selected ? "border-coral bg-coral" : "border-ink/10 bg-white"
                }`}
                key={reason}
                onPress={() => setSelectedReason(reason)}
              >
                <Text
                  className={`text-sm font-semibold ${
                    selected ? "text-white" : "text-ink"
                  }`}
                >
                  {reasonLabels[reason]}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text className="mt-4 text-sm font-semibold text-ink">
          Reviewer note
        </Text>
        <TextInput
          className="mt-2 min-h-20 rounded-lg border border-ink/15 bg-white px-3 py-3 text-base leading-6 text-ink"
          maxLength={2500}
          multiline
          onChangeText={setReviewerNote}
          placeholder="What did the AI get wrong?"
          placeholderTextColor="#7b8580"
          textAlignVertical="top"
          value={reviewerNote}
        />
        <Text className="mt-2 text-xs leading-5 text-ink/60">
          Optional, but useful. One sentence is enough to improve future
          extraction.
        </Text>
      </View>

      <View className="mt-4 flex-row gap-3">
        <Pressable
          accessibilityRole="button"
          className={`flex-1 rounded-lg px-4 py-3 ${
            canPublish ? "bg-leaf" : "bg-ink/20"
          }`}
          disabled={!canPublish}
          onPress={onPublish}
        >
          <Text className="text-center font-semibold text-white">Publish</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          className="flex-1 rounded-lg border border-ink/20 px-4 py-3"
          onPress={() => onFollowUp(trimmedReviewerNote || undefined)}
        >
          <Text className="text-center font-semibold text-ink">Follow up</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          className="flex-1 rounded-lg border border-coral/40 px-4 py-3"
          onPress={() =>
            onReject(selectedReason, trimmedReviewerNote || undefined)
          }
        >
          <Text className="text-center font-semibold text-coral">Reject</Text>
        </Pressable>
      </View>
    </View>
  );
}

function AutomationDiagnosticsPanel({
  candidate,
}: {
  candidate: PubMedInteractionCandidate;
}) {
  const tier = candidate.automationTier ?? null;
  const decision = candidate.aiDecision ?? null;
  const versionRows = getDiagnosticRows(candidate.pipelineVersions, 8);
  const uncertaintyRows = getDiagnosticRows(candidate.kgUncertainty, 10);
  const metadataRows = getDiagnosticRows(candidate.automationMetadata, 6);

  return (
    <View className="mt-3 rounded-lg border border-ink/10 bg-mist p-3">
      <View className="flex-row flex-wrap items-center gap-2">
        <Text className="text-sm font-semibold text-ink">
          Automation diagnostics
        </Text>
        <Text
          className={`rounded-md border px-2 py-1 text-xs font-semibold uppercase ${
            tier ? automationTierStyles[tier] : "border-ink/10 bg-white text-ink/60"
          }`}
        >
          {tier ? automationTierLabels[tier] : "No tier"}
        </Text>
        <Text className="rounded-md bg-white px-2 py-1 text-xs font-semibold uppercase text-ink/60">
          {decision ? aiDecisionLabels[decision] : "No AI decision"}
        </Text>
      </View>
      {candidate.automationReason ? (
        <Text className="mt-2 text-sm leading-5 text-ink/70">
          {candidate.automationReason}
        </Text>
      ) : null}
      {metadataRows.length ? (
        <DiagnosticRows title="Automation metadata" rows={metadataRows} />
      ) : null}
      {uncertaintyRows.length ? (
        <DiagnosticRows title="KG uncertainty" rows={uncertaintyRows} />
      ) : null}
      {versionRows.length ? (
        <DiagnosticRows title="Pipeline versions" rows={versionRows} />
      ) : null}
    </View>
  );
}

function DiagnosticRows({
  rows,
  title,
}: {
  rows: Array<{ label: string; value: string }>;
  title: string;
}) {
  return (
    <View className="mt-3 border-t border-ink/10 pt-3">
      <Text className="text-xs font-semibold uppercase text-ink/50">
        {title}
      </Text>
      <View className="mt-2 flex-row flex-wrap gap-2">
        {rows.map((row) => (
          <Text
            className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-ink/70"
            key={`${title}:${row.label}:${row.value}`}
          >
            {row.label}: {row.value}
          </Text>
        ))}
      </View>
    </View>
  );
}

function MonographEvidencePanel({
  candidate,
}: {
  candidate: PubMedInteractionCandidate;
}) {
  const evidence = candidate.monographEvidence ?? [];
  const hasResolvedNode = Boolean(
    candidate.resolvedSourceId || candidate.resolvedTargetId,
  );

  if (!hasResolvedNode && !evidence.length) {
    return null;
  }

  return (
    <View className="mt-3 rounded-lg border border-ink/10 bg-mist p-3">
      <View className="flex-row flex-wrap items-center gap-2">
        <Text className="text-sm font-semibold text-ink">
          Monograph interaction evidence
        </Text>
        <Text className="rounded-md bg-white px-2 py-1 text-xs font-semibold uppercase text-ink/60">
          {evidence.length} chunks
        </Text>
      </View>
      {evidence.length ? (
        <View className="mt-3 gap-3">
          {evidence.map((item) => {
            const factRows = getMonographFactRows(item.extractedFacts);
            const sourceUrl = getMonographEvidenceUrl(item);

            return (
              <View
                className="rounded-lg border border-ink/10 bg-white p-3"
                key={`${item.chunkId}:${item.supportType}:${item.side}`}
              >
                <View className="flex-row flex-wrap items-center gap-2">
                  <Text className="rounded-md bg-leaf/10 px-2 py-1 text-xs font-semibold uppercase text-leaf">
                    {monographSourceKindLabels[item.sourceKind] ??
                      item.sourceKind}
                  </Text>
                  <Text className="rounded-md bg-ink/10 px-2 py-1 text-xs font-semibold uppercase text-ink/60">
                    {sideLabels[item.side] ?? item.side}
                  </Text>
                  <Text className="rounded-md bg-ink/10 px-2 py-1 text-xs font-semibold uppercase text-ink/60">
                    {supportTypeLabels[item.supportType] ?? item.supportType}
                  </Text>
                </View>
                <Text className="mt-2 text-sm font-semibold text-ink/70">
                  {item.nodeName ?? "Unknown monograph"}
                </Text>
                {item.section ? (
                  <Text className="mt-1 text-xs font-semibold uppercase text-ink/50">
                    {monographSectionLabels[item.section] ?? item.section}
                  </Text>
                ) : null}
                {item.quote ? (
                  <Text className="mt-2 text-sm leading-5 text-ink/70">
                    "{item.quote}"
                  </Text>
                ) : (
                  <Text className="mt-2 text-sm leading-5 text-ink/70">
                    {truncateEvidenceText(item.content)}
                  </Text>
                )}
                {factRows.length ? (
                  <View className="mt-2 flex-row flex-wrap gap-2">
                    {factRows.map((row) => (
                      <Text
                        className="rounded-md bg-mist px-2 py-1 text-xs font-semibold text-ink/70"
                        key={`${item.chunkId}:${row.label}`}
                      >
                        {row.label}: {row.value}
                      </Text>
                    ))}
                  </View>
                ) : null}
                <View className="mt-2 flex-row flex-wrap gap-3">
                  <Text className="text-xs text-ink/50">
                    Chunk {formatChunkId(item.chunkId)}
                  </Text>
                  {item.confidence !== null && item.confidence !== undefined ? (
                    <Text className="text-xs text-ink/50">
                      Support {Math.round(item.confidence * 100)}%
                    </Text>
                  ) : null}
                  {item.nodeSource ? (
                    <Text className="text-xs text-ink/50">
                      Node source {item.nodeSource}
                    </Text>
                  ) : null}
                </View>
                {sourceUrl ? (
                  <Pressable
                    accessibilityRole="link"
                    className="mt-2 self-start"
                    onPress={() => void Linking.openURL(sourceUrl)}
                  >
                    <Text className="text-sm font-semibold text-leaf">
                      Open source
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : (
        <Text className="mt-2 text-sm leading-5 text-ink/60">
          No linked CPS or Health Canada Drug Interactions chunks are attached
          to this candidate yet.
        </Text>
      )}
    </View>
  );
}

function FullTextEvidencePanel({
  candidate,
}: {
  candidate: PubMedInteractionCandidate;
}) {
  const evidence = candidate.candidateEvidence ?? [];
  const applicabilityRows = getApplicabilityRows(candidate.applicability);

  if (!candidate.fullTextProcessed && !evidence.length && !applicabilityRows.length) {
    return null;
  }

  return (
    <View className="mt-3 rounded-lg border border-ink/10 bg-mist p-3">
      <View className="flex-row flex-wrap items-center gap-2">
        <Text className="text-sm font-semibold text-ink">
          Full-text evidence
        </Text>
        <Text className="rounded-md bg-white px-2 py-1 text-xs font-semibold uppercase text-ink/60">
          {candidate.fullTextEvidenceCount || evidence.length} chunks
        </Text>
      </View>
      {applicabilityRows.length ? (
        <View className="mt-2 flex-row flex-wrap gap-2">
          {applicabilityRows.map((row) => (
            <Text
              className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-ink/70"
              key={`${row.label}:${row.value}`}
            >
              {row.label}: {row.value}
            </Text>
          ))}
        </View>
      ) : null}
      {evidence.length ? (
        <View className="mt-3 gap-3">
          {evidence.map((item) => (
            <View
              className="rounded-lg border border-ink/10 bg-white p-3"
              key={`${item.chunk.id}:${item.supportType}`}
            >
              <View className="flex-row flex-wrap items-center gap-2">
                <Text className="rounded-md bg-leaf/10 px-2 py-1 text-xs font-semibold uppercase text-leaf">
                  {evidenceSourceLabels[item.chunk.sourceType] ??
                    item.chunk.sourceType}
                </Text>
                <Text className="rounded-md bg-ink/10 px-2 py-1 text-xs font-semibold uppercase text-ink/60">
                  {supportTypeLabels[item.supportType] ?? item.supportType}
                </Text>
                {item.chunk.label ? (
                  <Text className="text-xs font-semibold text-ink/60">
                    {item.chunk.label}
                  </Text>
                ) : null}
              </View>
              {item.quote ? (
                <Text className="mt-2 text-sm leading-5 text-ink/70">
                  "{item.quote}"
                </Text>
              ) : (
                <Text className="mt-2 text-sm leading-5 text-ink/70">
                  {truncateEvidenceText(item.chunk.content)}
                </Text>
              )}
              {item.quote ? (
                <Text className="mt-2 text-xs leading-5 text-ink/50">
                  Chunk text: {truncateEvidenceText(item.chunk.content)}
                </Text>
              ) : null}
              {item.chunk.sourceType === "table" ? (
                <StructuredTablePreview
                  structuredContent={item.chunk.structuredContent}
                />
              ) : null}
              <View className="mt-2 flex-row flex-wrap gap-3">
                <Text className="text-xs text-ink/50">
                  Chunk {formatChunkId(item.chunk.id)}
                </Text>
                {item.chunk.sectionTitle ? (
                  <Text className="text-xs text-ink/50">
                    {item.chunk.sectionTitle}
                  </Text>
                ) : null}
                {item.chunk.sectionPath.length ? (
                  <Text className="text-xs text-ink/50">
                    Path: {item.chunk.sectionPath.join(" / ")}
                  </Text>
                ) : null}
                {item.chunk.relevanceScore !== null &&
                item.chunk.relevanceScore !== undefined ? (
                  <Text className="text-xs text-ink/50">
                    Relevance {Math.round(item.chunk.relevanceScore * 100)}%
                  </Text>
                ) : null}
                {item.chunk.extractionConfidence !== null &&
                item.chunk.extractionConfidence !== undefined ? (
                  <Text className="text-xs text-ink/50">
                    Extraction{" "}
                    {Math.round(item.chunk.extractionConfidence * 100)}%
                  </Text>
                ) : null}
                {item.confidence !== null && item.confidence !== undefined ? (
                  <Text className="text-xs text-ink/50">
                    Support {Math.round(item.confidence * 100)}%
                  </Text>
                ) : null}
                {item.chunk.license ? (
                  <Text className="text-xs text-ink/50">
                    {item.chunk.license}
                  </Text>
                ) : null}
              </View>
              {item.chunk.sourceUrl ? (
                <Pressable
                  accessibilityRole="link"
                  className="mt-2 self-start"
                  onPress={() => void Linking.openURL(item.chunk.sourceUrl!)}
                >
                  <Text className="text-sm font-semibold text-leaf">
                    Open source
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      ) : (
        <Text className="mt-2 text-sm leading-5 text-ink/60">
          Full text was processed, but no linked evidence chunks are attached to
          this candidate.
        </Text>
      )}
    </View>
  );
}

function DecisionTracePanel({
  candidate,
}: {
  candidate: PubMedInteractionCandidate;
}) {
  const trace = getCandidateDecisionTrace(candidate);

  if (!trace) {
    return null;
  }

  return (
    <View className="mt-3 rounded-lg border border-ink/10 bg-mist p-3">
      <Text className="text-sm font-semibold text-ink">Decision trace</Text>
      {trace.retrievalNotes ? (
        <Text className="mt-2 text-sm leading-5 text-ink/60">
          Retrieval: {trace.retrievalNotes}
        </Text>
      ) : null}
      {trace.chunkAssessments.length ? (
        <View className="mt-3 gap-2">
          {trace.chunkAssessments.map((assessment, index) => (
            <View
              className="rounded-lg border border-ink/10 bg-white p-3"
              key={`${assessment.chunkId ?? "trace"}:${index}`}
            >
              <View className="flex-row flex-wrap items-center gap-2">
                {assessment.chunkId ? (
                  <Text className="rounded-md bg-ink/10 px-2 py-1 text-xs font-semibold uppercase text-ink/60">
                    Chunk {formatChunkId(assessment.chunkId)}
                  </Text>
                ) : null}
                {assessment.supportType ? (
                  <Text className="rounded-md bg-leaf/10 px-2 py-1 text-xs font-semibold uppercase text-leaf">
                    {supportTypeLabels[
                      assessment.supportType as keyof typeof supportTypeLabels
                    ] ??
                      assessment.supportType}
                  </Text>
                ) : null}
              </View>
              {assessment.quote ? (
                <Text className="mt-2 text-sm leading-5 text-ink/70">
                  "{assessment.quote}"
                </Text>
              ) : null}
              <Text className="mt-2 text-sm leading-5 text-ink/70">
                {assessment.conclusion}
              </Text>
              {assessment.limitation ? (
                <Text className="mt-1 text-xs leading-5 text-ink/50">
                  Limitation: {assessment.limitation}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
      {trace.finalRationale ? (
        <Text className="mt-3 text-sm leading-5 text-ink/70">
          Final rationale: {trace.finalRationale}
        </Text>
      ) : null}
      {trace.uncertainty.length ? (
        <View className="mt-3 flex-row flex-wrap gap-2">
          {trace.uncertainty.map((item) => (
            <Text
              className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-ink/60"
              key={item}
            >
              {item}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function StructuredTablePreview({
  structuredContent,
}: {
  structuredContent: Record<string, unknown>;
}) {
  const rows = Array.isArray(structuredContent.rows)
    ? structuredContent.rows.slice(0, 3)
    : [];

  if (!rows.length) {
    return null;
  }

  return (
    <View className="mt-2 gap-2">
      {rows.map((row, index) => {
        const cells =
          row && typeof row === "object" && "cells" in row
            ? (row.cells as Record<string, unknown>)
            : {};

        return (
          <View className="rounded-md bg-mist p-2" key={index}>
            {Object.entries(cells)
              .slice(0, 4)
              .map(([label, value]) => (
                <Text className="text-xs leading-5 text-ink/70" key={label}>
                  {label}: {String(value)}
                </Text>
              ))}
          </View>
        );
      })}
    </View>
  );
}

function ResolutionFlagPanel({
  flags,
}: {
  flags: Array<{ detail: string; tone: "caution" | "info" | "success"; title: string }>;
}) {
  return (
    <View className="mt-3 flex-row flex-wrap gap-2">
      {flags.map((flag) => (
        <View
          className={`rounded-lg border px-3 py-2 ${
            flag.tone === "caution"
              ? "border-coral/30 bg-coral/10"
              : flag.tone === "success"
                ? "border-leaf/30 bg-leaf/10"
                : "border-ink/10 bg-mist"
          }`}
          key={`${flag.title}:${flag.detail}`}
        >
          <Text
            className={`text-xs font-semibold uppercase ${
              flag.tone === "caution"
                ? "text-coral"
                : flag.tone === "success"
                  ? "text-leaf"
                  : "text-ink/60"
            }`}
          >
            {flag.title}
          </Text>
          <Text className="mt-1 max-w-xs text-sm leading-5 text-ink/70">
            {flag.detail}
          </Text>
        </View>
      ))}
    </View>
  );
}

function getApplicabilityRows(
  applicability: PubMedInteractionCandidate["applicability"],
): Array<{ label: string; value: string }> {
  if (!applicability || typeof applicability !== "object") {
    return [];
  }

  const record = applicability as Record<string, unknown>;
  const rows = [
    ["Context", record.evidenceContext],
    ["Route", record.route],
    ["Dose", record.dose],
    ["Population", record.population],
    ["Timing", record.timing],
  ] as const;

  return rows.flatMap(([label, value]) =>
    typeof value === "string" && value.trim()
      ? [{ label, value: value.trim() }]
      : [],
  );
}

function getDiagnosticRows(
  value: Record<string, unknown> | undefined,
  limit: number,
): Array<{ label: string; value: string }> {
  if (!value || typeof value !== "object") {
    return [];
  }

  return Object.entries(value)
    .flatMap(([label, item]) => {
      const formattedValue = formatDiagnosticValue(item);

      return formattedValue ? [{ label, value: formattedValue }] : [];
    })
    .slice(0, limit);
}

function formatDiagnosticValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "boolean") {
    return value ? "yes" : "no";
  }

  if (typeof value === "number") {
    return Number.isInteger(value) ? `${value}` : value.toFixed(2);
  }

  if (typeof value === "string") {
    return truncateDiagnosticValue(value);
  }

  if (Array.isArray(value)) {
    const text = value
      .map((item) => formatDiagnosticValue(item))
      .filter((item): item is string => Boolean(item))
      .join(", ");

    return text ? truncateDiagnosticValue(text) : null;
  }

  if (typeof value === "object") {
    return truncateDiagnosticValue(JSON.stringify(value));
  }

  return null;
}

function truncateDiagnosticValue(value: string): string {
  return value.length > 110 ? `${value.slice(0, 107)}...` : value;
}

function getCandidateActionCategory(
  candidate: PubMedInteractionCandidate,
): InteractionActionCategory {
  return (
    candidate.interactionActionCategory ??
    candidate.aiReview?.actionCategory ??
    inferActionCategoryFromSeverity(candidate.severity)
  );
}

function inferActionCategoryFromSeverity(
  severity: PubMedInteractionCandidate["severity"],
): InteractionActionCategory {
  switch (severity) {
    case "contraindicated":
      return "avoid_combination";
    case "major":
      return "consider_therapy_modification";
    case "moderate":
      return "monitor_therapy";
    case "minor":
      return "no_action_needed";
    default:
      return "monitor_therapy";
  }
}

function getCandidateDecisionTrace(candidate: PubMedInteractionCandidate) {
  const trace = candidate.aiDecisionTrace ?? candidate.aiReview?.decisionTrace;

  if (!trace || typeof trace !== "object") {
    return null;
  }

  const record = trace as Record<string, unknown>;
  const chunkAssessments = Array.isArray(record.chunkAssessments)
    ? record.chunkAssessments.flatMap((item) => {
        if (!item || typeof item !== "object") {
          return [];
        }

        const assessment = item as Record<string, unknown>;
        const conclusion =
          typeof assessment.conclusion === "string"
            ? assessment.conclusion.trim()
            : "";

        if (!conclusion) {
          return [];
        }

        return [
          {
            chunkId:
              typeof assessment.chunkId === "string"
                ? assessment.chunkId
                : undefined,
            conclusion,
            limitation:
              typeof assessment.limitation === "string"
                ? assessment.limitation
                : null,
            quote:
              typeof assessment.quote === "string" ? assessment.quote : null,
            supportType:
              typeof assessment.supportType === "string"
                ? assessment.supportType
                : undefined,
          },
        ];
      })
    : [];

  return {
    chunkAssessments,
    finalRationale:
      typeof record.finalRationale === "string"
        ? record.finalRationale
        : undefined,
    retrievalNotes:
      typeof record.retrievalNotes === "string"
        ? record.retrievalNotes
        : undefined,
    uncertainty: Array.isArray(record.uncertainty)
      ? record.uncertainty.filter((item): item is string => typeof item === "string")
      : [],
  };
}

function formatChunkId(chunkId: string): string {
  return chunkId.length > 8 ? chunkId.slice(0, 8) : chunkId;
}

function truncateEvidenceText(value: string): string {
  return value.length > 700 ? `${value.slice(0, 697)}...` : value;
}

function getMonographFactRows(
  facts: NonNullable<
    PubMedInteractionCandidate["monographEvidence"]
  >[number]["extractedFacts"],
): Array<{ label: string; value: string }> {
  const rows: Array<{ key: keyof typeof monographFactLabels; label: string }> = [
    { key: "roles", label: monographFactLabels.roles },
    { key: "enzymes", label: monographFactLabels.enzymes },
    { key: "transporters", label: monographFactLabels.transporters },
    { key: "receptors", label: monographFactLabels.receptors },
    { key: "management", label: monographFactLabels.management },
  ];

  return rows.flatMap((row) => {
    const value = facts[row.key];

    if (!Array.isArray(value) || !value.length) {
      return [];
    }

    return [
      {
        label: row.label,
        value: value.slice(0, 4).join(", "),
      },
    ];
  });
}

function getMonographEvidenceUrl(
  item: NonNullable<
    PubMedInteractionCandidate["monographEvidence"]
  >[number],
): string | null {
  const cpsId = readStringIdentifier(item.nodeIdentifiers, "cps_id");
  const drugCode = readStringIdentifier(item.nodeIdentifiers, "drug_code");

  if (item.sourceKind === "cps_monograph" && cpsId) {
    return getCpsMonographUrl(cpsId);
  }

  if (item.sourceKind === "health_canada_product_monograph" && drugCode) {
    return getHealthCanadaDpdUrl(drugCode);
  }

  return null;
}

function readStringIdentifier(
  identifiers: Record<string, unknown>,
  key: string,
): string | null {
  const value = identifiers[key];

  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (Array.isArray(value) && typeof value[0] === "string" && value[0].trim()) {
    return value[0].trim();
  }

  return null;
}

function getHealthCanadaDpdUrl(drugCode: string) {
  return `https://health-products.canada.ca/dpd-bdpp/info.do?code=${encodeURIComponent(
    drugCode,
  )}&lang=en`;
}

function getCpsMonographUrl(cpsId: string) {
  return `https://cps2.pharmacists.ca/document/monograph/${encodeURIComponent(
    cpsId,
  )}`;
}

function MonographCoveragePanel({
  candidate,
}: {
  candidate: PubMedInteractionCandidate;
}) {
  const hasResolvedNode = Boolean(
    candidate.resolvedSourceId || candidate.resolvedTargetId,
  );

  if (!hasResolvedNode) {
    return null;
  }

  return (
    <View className="mt-4 rounded-lg border border-ink/10 bg-mist p-3">
      <Text className="text-sm font-semibold text-ink">
        Health Canada monograph context
      </Text>
      <Text className="mt-1 text-sm leading-5 text-ink/60">
        Product monographs are product-level evidence. Ingredient and class
        matches show linked DPD products with monographs.
      </Text>
      <View className="mt-3 gap-3">
        <MonographCoverageSide
          coverage={candidate.sourceMonographCoverage}
          isResolved={Boolean(candidate.resolvedSourceId)}
          label="Source"
        />
        <MonographCoverageSide
          coverage={candidate.targetMonographCoverage}
          isResolved={Boolean(candidate.resolvedTargetId)}
          label="Target"
        />
      </View>
    </View>
  );
}

function MonographCoverageSide({
  coverage,
  isResolved,
  label,
}: {
  coverage?: HealthCanadaMonographCoverage | null;
  isResolved: boolean;
  label: string;
}) {
  if (!isResolved) {
    return (
      <View className="rounded-lg border border-ink/10 bg-white p-3">
        <Text className="text-sm font-semibold text-ink">{label}</Text>
        <Text className="mt-1 text-sm text-ink/60">
          Resolve this node to check monograph coverage.
        </Text>
      </View>
    );
  }

  if (!coverage?.totalProductCount) {
    return (
      <View className="rounded-lg border border-coral/20 bg-white p-3">
        <Text className="text-sm font-semibold text-ink">{label}</Text>
        <Text className="mt-1 text-sm leading-5 text-coral">
          No Health Canada product monograph coverage found for this resolved
          node yet.
        </Text>
      </View>
    );
  }

  const prominentSections = getProminentSections(coverage.sectionCounts);
  const productLabel =
    coverage.totalProductCount === 1 ? "product" : "products";

  return (
    <View className="rounded-lg border border-leaf/20 bg-white p-3">
      <View className="flex-row flex-wrap items-center gap-2">
        <Text className="text-sm font-semibold text-ink">{label}</Text>
        <Text className="rounded-md bg-leaf/15 px-2 py-1 text-xs font-semibold text-leaf">
          {coverage.totalProductCount} monograph-backed {productLabel}
        </Text>
      </View>
      <Text className="mt-2 text-sm leading-5 text-ink/60">
        {coverage.directProductCount} direct product match
        {coverage.directProductCount === 1 ? "" : "es"};{" "}
        {coverage.linkedProductCount} linked product match
        {coverage.linkedProductCount === 1 ? "" : "es"};{" "}
        {coverage.totalChunkCount} text chunks.
      </Text>
      {prominentSections.length ? (
        <Text className="mt-2 text-xs font-semibold uppercase text-ink/50">
          Sections: {prominentSections.join(", ")}
        </Text>
      ) : null}
      {coverage.productExamples.length ? (
        <View className="mt-2 gap-1">
          {coverage.productExamples.slice(0, 3).map((product) => (
            <Text className="text-sm leading-5 text-ink/70" key={product.nodeId}>
              {product.name}
              {product.din?.length ? ` • DIN ${product.din.join(", ")}` : ""}
              {product.status?.length ? ` • ${product.status.join(", ")}` : ""}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function UnresolvedMentionFlag({
  flag,
  label,
}: {
  flag: { message: string; title: string };
  label: string;
}) {
  return (
    <View className="rounded-lg border border-coral/20 bg-coral/10 p-3">
      <Text className="text-sm font-semibold text-coral">
        {label}: {flag.title}
      </Text>
      <Text className="mt-1 text-sm leading-5 text-ink/70">{flag.message}</Text>
    </View>
  );
}

function MetricPill({ label, value }: { label: string; value: number }) {
  return (
    <View className="rounded-lg border border-ink/10 bg-mist px-3 py-2">
      <Text className="text-xs font-semibold uppercase text-ink/50">
        {label}
      </Text>
      <Text className="mt-1 text-lg font-bold text-ink">{value}</Text>
    </View>
  );
}

function PaginationControls({
  currentPage,
  hasNextPage,
  hasPreviousPage,
  isLoading,
  onNext,
  onPrevious,
  pageSize,
  totalItems,
  totalPages,
}: {
  currentPage: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  isLoading: boolean;
  onNext: () => void;
  onPrevious: () => void;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}) {
  const startItem = totalItems === 0 ? 0 : currentPage * pageSize + 1;
  const endItem = Math.min(totalItems, (currentPage + 1) * pageSize);

  return (
    <View className="border-t border-ink/10 pt-3">
      <Text className="text-sm text-ink/60">
        Showing {startItem}-{endItem} of {totalItems} • Page {currentPage + 1}{" "}
        of {totalPages}
      </Text>
      <View className="mt-3 flex-row gap-3">
        <Pressable
          accessibilityRole="button"
          className={`flex-1 rounded-lg border px-4 py-3 ${
            hasPreviousPage && !isLoading
              ? "border-ink/20 bg-white"
              : "border-ink/10 bg-ink/10"
          }`}
          disabled={!hasPreviousPage || isLoading}
          onPress={onPrevious}
        >
          <Text className="text-center font-semibold text-ink">Previous</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          className={`flex-1 rounded-lg px-4 py-3 ${
            hasNextPage && !isLoading ? "bg-leaf" : "bg-ink/20"
          }`}
          disabled={!hasNextPage || isLoading}
          onPress={onNext}
        >
          <Text className="text-center font-semibold text-white">Next</Text>
        </Pressable>
      </View>
    </View>
  );
}

function FilterGroup<T extends string>({
  label,
  onSelect,
  options,
  selected,
}: {
  label: string;
  onSelect: (value: T) => void;
  options: { label: string; value: T }[];
  selected: T;
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

function ResolutionEditor({
  candidate,
  onResolve,
  reviewerNote,
}: {
  candidate: PubMedInteractionCandidate;
  onResolve: (
    resolvedSourceId: string | null,
    resolvedTargetId: string | null,
    notes?: string,
  ) => void;
  reviewerNote?: string;
}) {
  const [sourceSearch, setSourceSearch] = useState(candidate.subjectText);
  const [targetSearch, setTargetSearch] = useState(candidate.objectText);

  const sourceResultsQuery = useQuery({
    queryKey: ["kg-node-search", sourceSearch],
    queryFn: () => searchKgNodes(supabase, sourceSearch),
    enabled: sourceSearch.trim().length >= 2,
  });
  const targetResultsQuery = useQuery({
    queryKey: ["kg-node-search", targetSearch],
    queryFn: () => searchKgNodes(supabase, targetSearch),
    enabled: targetSearch.trim().length >= 2,
  });

  return (
    <View className="mt-4 rounded-lg border border-ink/10 bg-white p-3">
      <Text className="text-sm font-semibold text-ink">
        CPS node resolution
      </Text>
      <Text className="mt-1 text-sm leading-5 text-ink/60">
        Prefer ingredient or class nodes. Use a product node only when the
        evidence is product-specific.
      </Text>

      <NodeResolver
        currentNodeId={candidate.resolvedSourceId}
        label="Source"
        onClear={() =>
          onResolve(null, candidate.resolvedTargetId ?? null, reviewerNote)
        }
        onSelect={(node) =>
          onResolve(node.id, candidate.resolvedTargetId ?? null, reviewerNote)
        }
        query={sourceSearch}
        results={sourceResultsQuery.data ?? []}
        setQuery={setSourceSearch}
      />
      <NodeResolver
        currentNodeId={candidate.resolvedTargetId}
        label="Target"
        onClear={() =>
          onResolve(candidate.resolvedSourceId ?? null, null, reviewerNote)
        }
        onSelect={(node) =>
          onResolve(candidate.resolvedSourceId ?? null, node.id, reviewerNote)
        }
        query={targetSearch}
        results={targetResultsQuery.data ?? []}
        setQuery={setTargetSearch}
      />
    </View>
  );
}

function NodeResolver({
  currentNodeId,
  label,
  onClear,
  onSelect,
  query,
  results,
  setQuery,
}: {
  currentNodeId?: string | null;
  label: string;
  onClear: () => void;
  onSelect: (node: KgNode) => void;
  query: string;
  results: KgNode[];
  setQuery: (query: string) => void;
}) {
  const unresolvedFlag = currentNodeId
    ? null
    : classifyUnresolvedMention(query);

  return (
    <View className="mt-3">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-sm font-semibold text-ink/70">{label}</Text>
        <Text className="text-xs font-semibold text-ink/50">
          {currentNodeId ? "Resolved" : "Unresolved"}
        </Text>
      </View>
      {unresolvedFlag ? (
        <View className="mt-2 rounded-lg border border-coral/20 bg-coral/10 p-3">
          <Text className="text-sm font-semibold text-coral">
            {unresolvedFlag.title}
          </Text>
          <Text className="mt-1 text-sm leading-5 text-ink/70">
            {unresolvedFlag.message}
          </Text>
        </View>
      ) : null}
      <TextInput
        className="mt-2 rounded-lg border border-ink/15 bg-white px-3 py-3 text-base text-ink"
        onChangeText={setQuery}
        placeholder={`${label} drug or class`}
        placeholderTextColor="#7b8580"
        value={query}
      />
      {currentNodeId ? (
        <Pressable
          accessibilityRole="button"
          className="mt-2 self-start rounded-lg border border-ink/15 px-3 py-2"
          onPress={onClear}
        >
          <Text className="text-sm font-semibold text-ink">Clear match</Text>
        </Pressable>
      ) : null}
      {results.length ? (
        <View className="mt-2 gap-2">
          {results.map((node) => (
            <Pressable
              accessibilityRole="button"
              className={`rounded-lg border px-3 py-2 ${
                currentNodeId === node.id
                  ? "border-leaf bg-leaf/10"
                  : "border-ink/10 bg-mist"
              }`}
              key={node.id}
              onPress={() => onSelect(node)}
            >
              <Text className="text-sm font-semibold text-ink">
                {node.canonicalName}
              </Text>
              <Text className="mt-1 text-xs uppercase text-ink/50">
                {node.type} • {node.source}
              </Text>
              {node.sourceCoverage ? (
                <Text
                  className={`mt-1 text-xs font-semibold ${
                    node.sourceCoverage === "source_conflict"
                      ? "text-coral"
                      : node.sourceCoverage === "health_canada_only"
                        ? "text-ink/60"
                        : "text-leaf"
                  }`}
                >
                  {sourceCoverageLabels[node.sourceCoverage]}
                </Text>
              ) : null}
              {node.sourceConflicts?.length ? (
                <Text className="mt-1 text-xs text-coral">
                  Conflict: {node.sourceConflicts.join(", ")}
                </Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : query.trim().length >= 2 ? (
        <Text className="mt-2 text-sm text-ink/50">No node matches.</Text>
      ) : null}
    </View>
  );
}

function buildCandidateResolutionFlags(candidate: PubMedInteractionCandidate) {
  const flags: Array<{
    detail: string;
    tone: "caution" | "info" | "success";
    title: string;
  }> = [];

  flags.push(
    ...buildMentionFlags("Source", candidate.subjectText),
    ...buildMentionFlags("Target", candidate.objectText),
  );

  if (candidate.resolvedSourceNode) {
    flags.push(
      ...buildResolvedNodeFlags(
        "Source",
        candidate.subjectText,
        candidate.resolvedSourceNode,
      ),
    );
  }

  if (candidate.resolvedTargetNode) {
    flags.push(
      ...buildResolvedNodeFlags(
        "Target",
        candidate.objectText,
        candidate.resolvedTargetNode,
      ),
    );
  }

  return dedupeFlags(flags);
}

function buildMentionFlags(label: string, mentionText: string) {
  const normalizedMention = normalizeMention(mentionText);
  const flags: Array<{
    detail: string;
    tone: "caution" | "info" | "success";
    title: string;
  }> = [];

  if (isCombinationMention(mentionText)) {
    flags.push({
      detail: `${label} mention may contain multiple ingredients or a fixed-dose product.`,
      title: "Combination mention",
      tone: "caution",
    });
  }

  if (isNaturalProductLikeMention(normalizedMention)) {
    flags.push({
      detail: `${label} mention looks like an NHP, botanical, supplement, or non-drug compound.`,
      title: "NHP/supplement-like",
      tone: "caution",
    });
  }

  if (isPossibleInvestigationalMention(normalizedMention, mentionText)) {
    flags.push({
      detail: `${label} mention may be investigational, non-Canadian, code-name, or not yet mapped.`,
      title: "Investigational/non-Canadian",
      tone: "caution",
    });
  }

  return flags;
}

function buildResolvedNodeFlags(
  label: string,
  mentionText: string,
  node: KgNode,
) {
  const flags: Array<{
    detail: string;
    tone: "caution" | "info" | "success";
    title: string;
  }> = [];
  const coverageLabel = node.sourceCoverage
    ? sourceCoverageLabels[node.sourceCoverage]
    : null;

  if (coverageLabel) {
    flags.push({
      detail: `${label} resolved to ${node.canonicalName}.`,
      title: coverageLabel,
      tone:
        node.sourceCoverage === "source_conflict"
          ? "caution"
          : node.sourceCoverage === "health_canada_only"
            ? "info"
            : "success",
    });
  }

  if (node.sourceConflicts?.length) {
    flags.push({
      detail: node.sourceConflicts.join(", "),
      title: "Source conflict",
      tone: "caution",
    });
  }

  if (
    node.type === "drug_class" &&
    normalizeIngredientBaseName(node.canonicalName) ===
      normalizeIngredientBaseName(mentionText)
  ) {
    flags.push({
      detail: `${label} resolved to a class node with an ingredient-like label.`,
      title: "Ingredient-like class",
      tone: "caution",
    });
  }

  if (
    node.type === "ingredient" &&
    normalizeMention(node.canonicalName) !== normalizeMention(mentionText) &&
    normalizeIngredientBaseName(node.canonicalName) ===
      normalizeIngredientBaseName(mentionText)
  ) {
    flags.push({
      detail: `${label} normalized to ${node.canonicalName}.`,
      title: "Salt/base normalized",
      tone: "info",
    });
  }

  if (node.source !== "CPS" && node.sourceCoverage === "health_canada_only") {
    flags.push({
      detail: `${label} node is not currently matched to CPS coverage.`,
      title: "Health Canada-only",
      tone: "info",
    });
  }

  return flags;
}

function dedupeFlags<T extends { detail: string; title: string }>(
  flags: T[],
): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const flag of flags) {
    const key = `${flag.title}:${flag.detail}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(flag);
  }

  return deduped;
}

function classifyUnresolvedMention(mentionText: string) {
  const normalizedMention = normalizeMention(mentionText);

  if (!normalizedMention) {
    return null;
  }

  if (isCombinationMention(mentionText)) {
    return {
      message:
        "Resolve components separately or send to pharmacist follow-up before publishing.",
      title: "Combination mention",
    };
  }

  if (isNaturalProductLikeMention(normalizedMention)) {
    return {
      message:
        "Do not force this into the drug graph before NHP/NPN coverage is available.",
      title: "NHP/supplement-like entity",
    };
  }

  if (isPossibleInvestigationalMention(normalizedMention, mentionText)) {
    return {
      message:
        "No Canadian graph match is expected yet. Treat this as possible investigational, non-Canadian, code-name, or not-yet-mapped before publishing.",
      title: "Possible investigational/non-Canadian entity",
    };
  }

  return null;
}

function isPossibleInvestigationalMention(
  normalizedMention: string,
  mentionText: string,
): boolean {
  return (
    possibleInvestigationalMentions.has(normalizedMention) ||
    /\bd\s*\d{3,}\b/.test(normalizedMention) ||
    /[a-z]+-\d{2,}/i.test(mentionText)
  );
}

function isCombinationMention(value: string): boolean {
  if (/\b(?:plus|and|with)\b/i.test(value)) {
    return true;
  }

  if (
    /[a-z0-9]\s*\/\s*[a-z0-9]/i.test(value) &&
    !/^\d+\s*\/\s*\d+$/.test(value.trim())
  ) {
    return true;
  }

  return /\b\w+\s*\+\s*\w+\b/.test(value);
}

function isNaturalProductLikeMention(normalizedMention: string): boolean {
  const tokens = normalizedMention.split(" ").filter(Boolean);

  return tokens.some((token) => naturalProductTerms.has(token));
}

function normalizeIngredientBaseName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((token) => token && !ingredientSaltTerms.has(token))
    .join(" ")
    .trim();
}

function normalizeMention(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const reviewStatusOptions: { label: string; value: EdgeReviewStatus }[] = [
  { label: "Candidate", value: "candidate" },
  { label: "Follow-up", value: "under_review" },
  { label: "Published", value: "published" },
  { label: "Rejected", value: "rejected" },
];

const aiVerdictFilterOptions: {
  label: string;
  value: PubMedAiReviewVerdict | "all";
}[] = [
  { label: "All", value: "all" },
  { label: "Likely publishable", value: "likely_publishable" },
  { label: "Needs review", value: "needs_human_review" },
  { label: "Likely reject", value: "likely_reject" },
];

const aiDecisionFilterOptions: {
  label: string;
  value: PubMedAiDecision | "all";
}[] = [
  { label: "All", value: "all" },
  { label: "Publishable", value: "publishable" },
  { label: "Needs context", value: "needs_context" },
  { label: "Insufficient evidence", value: "insufficient_evidence" },
  { label: "Reject", value: "reject" },
];

const automationTierFilterOptions: {
  label: string;
  value: PubMedAutomationTier | "all";
}[] = [
  { label: "All", value: "all" },
  { label: "Auto publish ready", value: "auto_publish_ready" },
  { label: "Sample for audit", value: "sample_for_audit" },
  { label: "Needs context", value: "needs_context" },
  { label: "Auto reject", value: "auto_reject" },
  { label: "Quarantine", value: "quarantine" },
  { label: "Benchmark", value: "benchmark" },
];

const resolutionFilterOptions: {
  label: string;
  value: "all" | "resolved" | "unresolved";
}[] = [
  { label: "All", value: "all" },
  { label: "Resolved", value: "resolved" },
  { label: "Unresolved", value: "unresolved" },
];

type ResolutionFlagFilter =
  | "all"
  | "combination"
  | "health_canada_only"
  | "ingredient_like_class"
  | "investigational"
  | "natural_product"
  | "salt_base"
  | "source_conflict";

const resolutionFlagFilterOptions: {
  label: string;
  value: ResolutionFlagFilter;
}[] = [
  { label: "All", value: "all" },
  { label: "Combination", value: "combination" },
  { label: "NHP/supplement", value: "natural_product" },
  { label: "Investigational", value: "investigational" },
  { label: "Salt/base", value: "salt_base" },
  { label: "Health Canada-only", value: "health_canada_only" },
  { label: "Source conflict", value: "source_conflict" },
  { label: "Ingredient-like class", value: "ingredient_like_class" },
];

const reviewPageSize = 25;
const flaggedReviewFetchLimit = 500;

const possibleInvestigationalMentions = new Set([
  "aficamten",
  "cedirogant",
  "d 1553 garsorasib",
  "dihydroartemisinin",
  "fenbufen",
  "flumatinib",
  "garsorasib",
  "glasmacinal",
  "leritrelvir",
  "limnetrelvir",
  "lotiglipron",
  "nicorandil",
  "olorofim",
  "tolfenpyrad",
]);

const naturalProductTerms = new Set([
  "atractylodin",
  "bupleuri",
  "curcumin",
  "dmt",
  "ethyl",
  "ferulate",
  "harmine",
  "liquiritigenin",
  "mitragynine",
  "quercetin",
  "radix",
  "salvia",
  "tree",
]);

const ingredientSaltTerms = new Set([
  "anhydrous",
  "base",
  "calcium",
  "disodium",
  "etexilate",
  "fumarate",
  "hbr",
  "hcl",
  "hydrobromide",
  "hydrochloride",
  "maleate",
  "mesylate",
  "phosphate",
  "potassium",
  "sodium",
  "succinate",
  "sulfate",
  "tartrate",
]);

const rejectionReasons: PubMedRejectionReason[] = [
  "unsupported_by_quote",
  "not_interaction",
  "wrong_drug_pair",
  "bad_entity_resolution",
  "stale_outdated_data",
  "severity_wrong",
  "duplicate",
  "other",
];

const reasonLabels: Record<PubMedRejectionReason, string> = {
  bad_entity_resolution: "Bad resolution",
  duplicate: "Duplicate",
  not_interaction: "Not interaction",
  other: "Other",
  severity_wrong: "Severity wrong",
  stale_outdated_data: "Outdated",
  unsupported_by_quote: "Unsupported",
  wrong_drug_pair: "Wrong pair",
};

const severityLabels = {
  contraindicated: "Contraindicated",
  major: "Major",
  moderate: "Moderate",
  minor: "Minor",
  unknown: "Unknown",
};

const actionCategoryLabels: Record<InteractionActionCategory, string> = {
  avoid_combination: "Avoid combination",
  consider_therapy_modification: "Consider therapy modification",
  monitor_therapy: "Monitor therapy",
  no_action_needed: "No action needed",
  no_known_interaction: "No known interaction",
};

const actionCategoryStyles: Record<
  InteractionActionCategory,
  { badge: string }
> = {
  avoid_combination: {
    badge: "border-red-200 bg-red-50 text-red-700",
  },
  consider_therapy_modification: {
    badge: "border-orange-200 bg-orange-50 text-orange-700",
  },
  monitor_therapy: {
    badge: "border-yellow-200 bg-yellow-50 text-yellow-700",
  },
  no_action_needed: {
    badge: "border-blue-200 bg-blue-50 text-blue-700",
  },
  no_known_interaction: {
    badge: "border-green-200 bg-green-50 text-green-700",
  },
};

const aiVerdictLabels = {
  likely_publishable: "Likely publishable",
  likely_reject: "Likely reject",
  needs_human_review: "Needs review",
};

const aiDecisionLabels: Record<PubMedAiDecision, string> = {
  insufficient_evidence: "Insufficient evidence",
  needs_context: "Needs context",
  publishable: "Publishable",
  reject: "Reject",
};

const automationTierLabels: Record<PubMedAutomationTier, string> = {
  auto_publish_ready: "Auto publish ready",
  auto_reject: "Auto reject",
  benchmark: "Benchmark",
  needs_context: "Needs context",
  quarantine: "Quarantine",
  sample_for_audit: "Sample for audit",
};

const automationTierStyles: Record<PubMedAutomationTier, string> = {
  auto_publish_ready: "border-green-200 bg-green-50 text-green-700",
  auto_reject: "border-coral/30 bg-coral/10 text-coral",
  benchmark: "border-blue-200 bg-blue-50 text-blue-700",
  needs_context: "border-yellow-200 bg-yellow-50 text-yellow-700",
  quarantine: "border-orange-200 bg-orange-50 text-orange-700",
  sample_for_audit: "border-leaf/30 bg-leaf/10 text-leaf",
};

const sourceCoverageLabels = {
  cps_covered: "CPS-covered",
  cps_only: "CPS only",
  health_canada_only: "Health Canada-only",
  possible_source_match: "Possible CPS/Health Canada match",
  source_conflict: "Source conflict",
};

const evidenceSourceLabels = {
  abstract: "Abstract",
  figure_caption: "Figure caption",
  figure_interpretation: "Figure interpretation",
  paragraph: "Paragraph",
  supplement: "Supplement",
  table: "Table",
};

const supportTypeLabels = {
  contradicts_or_limits: "Limits",
  source_silent: "Silent",
  supports_interaction: "Interaction",
  supports_management: "Management",
  supports_mechanism: "Mechanism",
  supports_severity: "Severity",
};

const monographSourceKindLabels = {
  cps_monograph: "CPS",
  health_canada_product_monograph: "Health Canada",
};

const sideLabels = {
  shared: "Shared",
  source: "Source",
  target: "Target",
};

const monographFactLabels = {
  enzymes: "Enzymes",
  management: "Management",
  receptors: "Receptors",
  roles: "Roles",
  transporters: "Transporters",
};

function candidateHasFlag(
  candidate: PubMedInteractionCandidate,
  filter: Exclude<ResolutionFlagFilter, "all">,
): boolean {
  const flags = buildCandidateResolutionFlags(candidate);

  return flags.some((flag) => flagFilterTitles[filter].has(flag.title));
}

const flagFilterTitles: Record<
  Exclude<ResolutionFlagFilter, "all">,
  Set<string>
> = {
  combination: new Set(["Combination mention"]),
  health_canada_only: new Set(["Health Canada-only"]),
  ingredient_like_class: new Set(["Ingredient-like class"]),
  investigational: new Set(["Investigational/non-Canadian"]),
  natural_product: new Set(["NHP/supplement-like"]),
  salt_base: new Set(["Salt/base normalized"]),
  source_conflict: new Set(["Source conflict"]),
};

function getProminentSections(sectionCounts: Record<string, number>): string[] {
  return Object.entries(sectionCounts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([section]) => monographSectionLabels[section] ?? section);
}

const monographSectionLabels: Record<string, string> = {
  health_canada_product_monograph_adverse_reactions: "adverse reactions",
  health_canada_product_monograph_contraindications: "contraindications",
  health_canada_product_monograph_drug_interactions: "drug interactions",
  health_canada_product_monograph_patient_medication_information:
    "patient info",
  health_canada_product_monograph_summary: "summary",
  health_canada_product_monograph_text: "monograph text",
  health_canada_product_monograph_warnings_and_precautions:
    "warnings/precautions",
};
