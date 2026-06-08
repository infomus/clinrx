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
  listPubMedCalibrationReviews,
  listPubMedInteractionCandidatesByIds,
  upsertPubMedCalibrationReview,
} from "@clinrx/api";
import type {
  PubMedCalibrationDecision,
  PubMedCalibrationDrugPairAssessment,
  PubMedCalibrationInteractionAssessment,
  PubMedCalibrationMissingContext,
  PubMedCalibrationResolutionAssessment,
  PubMedCalibrationReview,
  PubMedCalibrationReviewInput,
  PubMedCalibrationSeverityManagementAssessment,
  PubMedCalibrationTimeBucket,
  PubMedInteractionCandidate,
} from "@clinrx/types";

import { ReviewPasswordGate } from "@/components/ReviewPasswordGate";
import { supabase } from "@/lib/supabase";

type DraftCalibrationReview = Omit<
  PubMedCalibrationReviewInput,
  "candidateId" | "reviewerId" | "reviewerKey" | "setId"
>;

export default function CalibrationReviewScreen() {
  return (
    <ReviewPasswordGate>
      <CalibrationReviewContent />
    </ReviewPasswordGate>
  );
}

function CalibrationReviewContent() {
  const queryClient = useQueryClient();
  const [reviewsByCandidateId, setReviewsByCandidateId] = useState<
    Record<string, DraftCalibrationReview>
  >({});
  const candidatesQuery = useQuery({
    queryKey: ["pubmed-calibration-set", calibrationCandidateIds],
    queryFn: () =>
      listPubMedInteractionCandidatesByIds(supabase, calibrationCandidateIds),
  });
  const calibrationReviewsQuery = useQuery({
    queryKey: ["pubmed-calibration-reviews", calibrationSetId],
    queryFn: () => listPubMedCalibrationReviews(supabase, calibrationSetId),
  });
  const saveReviewMutation = useMutation({
    mutationFn: (review: PubMedCalibrationReviewInput) =>
      upsertPubMedCalibrationReview(supabase, review),
    onSuccess: (savedReview) => {
      queryClient.setQueryData<PubMedCalibrationReview[]>(
        ["pubmed-calibration-reviews", calibrationSetId],
        (current = []) => [
          savedReview,
          ...current.filter((review) => review.id !== savedReview.id),
        ],
      );
    },
  });
  const candidates = candidatesQuery.data ?? [];
  const savedReviews = calibrationReviewsQuery.data ?? [];
  const mergedReviews = useMemo(
    () => mergeCalibrationReviews(savedReviews, reviewsByCandidateId),
    [reviewsByCandidateId, savedReviews],
  );
  const metricReviews = useMemo(
    () =>
      mergedReviews.filter((review) => review.reviewerKey === reviewerKey),
    [mergedReviews],
  );
  const metrics = useMemo(
    () => calculateMetrics(candidates, metricReviews, savedReviews.length),
    [candidates, metricReviews, savedReviews.length],
  );

  useEffect(() => {
    if (!calibrationReviewsQuery.data) {
      return;
    }

    const ownReviews = calibrationReviewsQuery.data.filter(
      (review) => review.reviewerKey === reviewerKey,
    );
    setReviewsByCandidateId(Object.fromEntries(
      ownReviews.map((review) => [review.candidateId, toDraftReview(review)]),
    ));
  }, [calibrationReviewsQuery.data]);

  const updateReview = (
    candidateId: string,
    review: DraftCalibrationReview,
  ) => {
    setReviewsByCandidateId((current) => ({
      ...current,
      [candidateId]: review,
    }));
    saveReviewMutation.mutate({
      ...review,
      candidateId,
      reviewerKey,
      setId: calibrationSetId,
    });
  };

  return (
    <ScrollView className="flex-1 bg-mist">
      <View className="min-h-screen px-5 pb-10 pt-16">
        <View className="mb-7">
          <Text className="text-sm font-semibold uppercase text-leaf">
            Calibration set
          </Text>
          <Text className="mt-3 text-4xl font-bold text-ink">
            Pharmacist Review Calibration
          </Text>
          <Text className="mt-3 max-w-4xl text-base leading-6 text-ink/70">
            Fixed 50-candidate set: 20 likely-publishable resolved, 10
            needs-review resolved, and 20 flagged or unresolved examples.
            Decisions here track calibration metrics only.
          </Text>
        </View>

        <MetricsPanel metrics={metrics} />
        <View className="mt-3 rounded-lg border border-ink/10 bg-white px-4 py-3">
          <Text className="text-sm leading-5 text-ink/70">
            {saveReviewMutation.isPending
              ? "Saving calibration response..."
              : saveReviewMutation.isError
                ? "Could not save the last calibration response. Try changing the answer again."
                : "Responses autosave to the calibration table and do not publish or reject candidates."}
          </Text>
        </View>

        {candidatesQuery.isLoading || calibrationReviewsQuery.isLoading ? (
          <Text className="mt-4 text-ink/70">Loading calibration set...</Text>
        ) : candidatesQuery.isError || calibrationReviewsQuery.isError ? (
          <Text className="mt-4 text-coral">
            Could not load calibration candidates.
          </Text>
        ) : (
          <View className="mt-5 gap-4">
            {candidates.map((candidate, index) => (
              <CalibrationCandidateCard
                candidate={candidate}
                index={index}
                key={candidate.id}
                review={reviewsByCandidateId[candidate.id] ?? emptyReview}
                setReview={(review) => updateReview(candidate.id, review)}
              />
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function MetricsPanel({ metrics }: { metrics: CalibrationMetrics }) {
  return (
    <View className="rounded-lg border border-ink/10 bg-white p-4">
      <View className="flex-row flex-wrap gap-2">
        <MetricPill label="Reviewed" value={`${metrics.reviewed}/50`} />
        <MetricPill label="Saved rows" value={metrics.reviewerRows} />
        <MetricPill label="Publishable" value={metrics.publishable} />
        <MetricPill label="Rejected" value={metrics.rejected} />
        <MetricPill label="Follow-up" value={metrics.followUp} />
        <MetricPill
          label="Real interaction"
          value={`${Math.round(metrics.interactionRealRate * 100)}%`}
        />
        <MetricPill
          label="Pair correct"
          value={`${Math.round(metrics.drugPairAccuracy * 100)}%`}
        />
        <MetricPill
          label="AI precision"
          value={`${Math.round(metrics.likelyPublishablePrecision * 100)}%`}
        />
        <MetricPill
          label="Resolution correct"
          value={`${Math.round(metrics.resolutionAccuracy * 100)}%`}
        />
        <MetricPill
          label="Severity ok"
          value={`${Math.round(metrics.severityManagementAcceptableRate * 100)}%`}
        />
        <MetricPill label="Over 3 min" value={metrics.slowReviews} />
      </View>
      <View className="mt-4 flex-row flex-wrap gap-2">
        {missingContextOptions.map((option) => (
          <MetricPill
            key={option.value}
            label={option.shortLabel}
            value={metrics.missingContextCounts[option.value] ?? 0}
          />
        ))}
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

function ResolutionNodeDetails({
  coverage,
  label,
  node,
}: {
  coverage?: PubMedInteractionCandidate["sourceMonographCoverage"];
  label: string;
  node?: PubMedInteractionCandidate["resolvedSourceNode"];
}) {
  if (!node) {
    return (
      <View className="rounded-lg border border-coral/20 bg-white p-3">
        <Text className="text-sm font-semibold text-ink">{label}</Text>
        <Text className="mt-1 text-sm leading-5 text-coral">Unresolved</Text>
      </View>
    );
  }

  const metadata = getNodeMetadataRows(node);
  const sourceLinks = getNodeSourceLinks(node);
  const productExamples = coverage?.productExamples ?? [];

  return (
    <View className="rounded-lg border border-ink/10 bg-white p-3">
      <View className="flex-row flex-wrap items-center gap-2">
        <Text className="text-sm font-semibold text-ink">{label}</Text>
        <Text className="rounded-md bg-mist px-2 py-1 text-xs font-semibold uppercase text-ink/60">
          {node.source}
        </Text>
        <Text className="rounded-md bg-mist px-2 py-1 text-xs font-semibold uppercase text-ink/60">
          {node.type}
        </Text>
        {node.sourceCoverage ? (
          <Text className="rounded-md bg-leaf/15 px-2 py-1 text-xs font-semibold uppercase text-leaf">
            {sourceCoverageLabels[node.sourceCoverage] ?? node.sourceCoverage}
          </Text>
        ) : null}
      </View>
      <Text className="mt-2 text-base font-semibold text-ink">
        {node.canonicalName}
      </Text>
      {metadata.length ? (
        <View className="mt-2 flex-row flex-wrap gap-2">
          {metadata.map((item) => (
            <Text
              className="rounded-md bg-mist px-2 py-1 text-xs font-semibold text-ink/70"
              key={`${item.label}:${item.value}`}
            >
              {item.label}: {item.value}
            </Text>
          ))}
        </View>
      ) : null}
      {sourceLinks.length ? (
        <View className="mt-3 flex-row flex-wrap gap-2">
          {sourceLinks.map((link) => (
            <Pressable
              accessibilityRole="link"
              className="rounded-lg border border-leaf/25 bg-leaf/10 px-3 py-2"
              key={link.url}
              onPress={() => void Linking.openURL(link.url)}
            >
              <Text className="text-sm font-semibold text-leaf">
                {link.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <Text className="mt-2 text-sm leading-5 text-ink/60">
          No direct source page identifier is stored for this node.
        </Text>
      )}
      {productExamples.length ? (
        <View className="mt-3 border-t border-ink/10 pt-3">
          <Text className="text-xs font-semibold uppercase text-ink/50">
            Monograph-backed linked products
          </Text>
          <View className="mt-2 gap-2">
            {productExamples.slice(0, 3).map((product) => {
              const productUrl = product.drugCode
                ? getHealthCanadaDpdUrl(product.drugCode)
                : null;

              return (
                <View key={product.nodeId}>
                  <Text className="text-sm leading-5 text-ink/70">
                    {product.name}
                    {product.din?.length
                      ? ` • DIN ${product.din.join(", ")}`
                      : ""}
                    {product.status?.length
                      ? ` • ${product.status.join(", ")}`
                      : ""}
                  </Text>
                  {productUrl ? (
                    <Pressable
                      accessibilityRole="link"
                      className="mt-1 self-start"
                      onPress={() => void Linking.openURL(productUrl)}
                    >
                      <Text className="text-sm font-semibold text-leaf">
                        Open Health Canada DPD product
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function CalibrationCandidateCard({
  candidate,
  index,
  review,
  setReview,
}: {
  candidate: PubMedInteractionCandidate;
  index: number;
  review: DraftCalibrationReview;
  setReview: (review: DraftCalibrationReview) => void;
}) {
  const bucket = getCalibrationBucket(index);

  return (
    <View className="rounded-lg border border-ink/10 bg-white p-4">
      <View className="flex-row flex-wrap items-center gap-2">
        <Text className="text-sm font-semibold uppercase text-leaf">
          #{index + 1}
        </Text>
        <Text className="rounded-md bg-mist px-2 py-1 text-xs font-semibold uppercase text-ink/60">
          {bucket.label}
        </Text>
        <Text className="rounded-md bg-ink/10 px-2 py-1 text-xs font-semibold uppercase text-ink/60">
          {candidate.aiReviewVerdict ?? "No AI verdict"}
        </Text>
      </View>

      <Text className="mt-3 text-lg font-semibold text-ink">
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
        {candidate.aiReviewScore
          ? ` • AI score ${Math.round(candidate.aiReviewScore * 100)}%`
          : ""}
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

      <View className="mt-3 rounded-lg border border-ink/10 bg-mist p-3">
        <Text className="text-sm font-semibold text-ink">Resolution</Text>
        <View className="mt-2 gap-3">
          <ResolutionNodeDetails
            coverage={candidate.sourceMonographCoverage}
            label="Source"
            node={candidate.resolvedSourceNode}
          />
          <ResolutionNodeDetails
            coverage={candidate.targetMonographCoverage}
            label="Target"
            node={candidate.resolvedTargetNode}
          />
        </View>
      </View>

      {candidate.sourceQuote ? (
        <Text className="mt-3 leading-6 text-ink/60">
          "{candidate.sourceQuote}"
        </Text>
      ) : null}
      {candidate.aiReview ? (
        <View className="mt-3 rounded-lg border border-ink/10 bg-white p-3">
          <Text className="text-sm font-semibold text-ink">AI review</Text>
          <Text className="mt-1 leading-6 text-ink/70">
            {candidate.aiReview.summary}
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
        </View>
      ) : null}

      <View className="mt-4 gap-3 rounded-lg border border-ink/10 bg-mist p-3">
        <SegmentedControl
          label="1. Is this a real clinically meaningful interaction?"
          options={interactionAssessmentOptions}
          selected={review.interactionAssessment ?? undefined}
          onSelect={(interactionAssessment) =>
            setReview({ ...review, interactionAssessment })
          }
        />
        <SegmentedControl
          label="2. Is the extracted drug pair correct?"
          options={drugPairAssessmentOptions}
          selected={review.drugPairAssessment ?? undefined}
          onSelect={(drugPairAssessment) =>
            setReview({ ...review, drugPairAssessment })
          }
        />
        <SegmentedControl
          label="3. Are the resolved Canadian graph nodes correct?"
          options={resolutionAssessmentOptions}
          selected={review.resolutionAssessment ?? undefined}
          onSelect={(resolutionAssessment) =>
            setReview({ ...review, resolutionAssessment })
          }
        />
        <SegmentedControl
          label="4. Is severity/management acceptable?"
          options={severityManagementAssessmentOptions}
          selected={review.severityManagementAssessment ?? undefined}
          onSelect={(severityManagementAssessment) =>
            setReview({ ...review, severityManagementAssessment })
          }
        />
        <SegmentedControl
          label="5. Calibration decision"
          options={decisionOptions}
          selected={review.decision ?? undefined}
          onSelect={(decision) => setReview({ ...review, decision })}
        />
        <SegmentedControl
          label="6. Review time"
          options={timeBucketOptions}
          selected={review.timeBucket ?? undefined}
          onSelect={(timeBucket) => setReview({ ...review, timeBucket })}
        />
        <View>
          <Text className="text-sm font-semibold text-ink">
            7. Missing context, if any
          </Text>
          <Text className="mt-1 text-sm leading-5 text-ink/60">
            Select none when the displayed context is enough to decide.
          </Text>
          <View className="mt-2 flex-row flex-wrap gap-2">
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: !review.missingContext.length }}
              className={`rounded-lg border px-3 py-2 ${
                !review.missingContext.length
                  ? "border-leaf bg-leaf"
                  : "border-ink/10 bg-white"
              }`}
              onPress={() => setReview({ ...review, missingContext: [] })}
            >
              <Text
                className={`text-sm font-semibold ${
                  !review.missingContext.length ? "text-white" : "text-ink"
                }`}
              >
                None
              </Text>
            </Pressable>
            {missingContextOptions.map((option) => {
              const selected = review.missingContext.includes(option.value);

              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  className={`rounded-lg border px-3 py-2 ${
                    selected
                      ? "border-leaf bg-leaf"
                      : "border-ink/10 bg-white"
                  }`}
                  key={option.value}
                  onPress={() =>
                    setReview({
                      ...review,
                      missingContext: selected
                        ? review.missingContext.filter(
                            (value) => value !== option.value,
                          )
                        : [...review.missingContext, option.value],
                    })
                  }
                >
                  <Text
                    className={`text-sm font-semibold ${
                      selected ? "text-white" : "text-ink"
                    }`}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <View>
          <Text className="text-sm font-semibold text-ink">
            Reviewer note
          </Text>
          <TextInput
            className="mt-2 min-h-20 rounded-lg border border-ink/15 bg-white px-3 py-3 text-base leading-6 text-ink"
            maxLength={600}
            multiline
            onChangeText={(notes) => setReview({ ...review, notes })}
            placeholder="What should we fix, trust, reject, or show next time?"
            placeholderTextColor="#7b8580"
            textAlignVertical="top"
            value={review.notes}
          />
        </View>
      </View>
    </View>
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
  options: { label: string; value: T }[];
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

interface CalibrationMetrics {
  drugPairAccuracy: number;
  followUp: number;
  interactionRealRate: number;
  likelyPublishablePrecision: number;
  missingContextCounts: Record<PubMedCalibrationMissingContext, number>;
  publishable: number;
  rejected: number;
  resolutionAccuracy: number;
  reviewed: number;
  reviewerRows: number;
  severityManagementAcceptableRate: number;
  slowReviews: number;
}

function calculateMetrics(
  candidates: PubMedInteractionCandidate[],
  reviews: PubMedCalibrationReview[],
  savedReviewRows: number,
): CalibrationMetrics {
  const candidateById = new Map(
    candidates.map((candidate) => [candidate.id, candidate]),
  );
  const decisionReviews = reviews.flatMap((review) => {
    const candidate = candidateById.get(review.candidateId);

    return candidate && review.decision ? [{ candidate, review }] : [];
  });
  const likelyPublishableReviews = reviews.filter(
    (review) =>
      candidateById.get(review.candidateId)?.aiReviewVerdict ===
      "likely_publishable",
  );
  const resolutionAssessments = reviews.filter(
    (review) => review.resolutionAssessment,
  );
  const interactionAssessments = reviews.filter(
    (review) => review.interactionAssessment,
  );
  const drugPairAssessments = reviews.filter(
    (review) => review.drugPairAssessment,
  );
  const severityManagementAssessments = reviews.filter(
    (review) => review.severityManagementAssessment,
  );
  const missingContextCounts = Object.fromEntries(
    missingContextOptions.map((option) => [option.value, 0]),
  ) as Record<PubMedCalibrationMissingContext, number>;

  for (const review of reviews) {
    for (const missingContext of review.missingContext) {
      missingContextCounts[missingContext] += 1;
    }
  }

  return {
    drugPairAccuracy: drugPairAssessments.length
      ? drugPairAssessments.filter(
          (review) => review.drugPairAssessment === "correct",
        ).length / drugPairAssessments.length
      : 0,
    followUp: decisionReviews.filter(
      ({ review }) => review.decision === "follow_up",
    ).length,
    interactionRealRate: interactionAssessments.length
      ? interactionAssessments.filter(
          (review) => review.interactionAssessment === "real",
        ).length / interactionAssessments.length
      : 0,
    likelyPublishablePrecision: likelyPublishableReviews.length
      ? likelyPublishableReviews.filter(
          (review) => review.decision === "publishable",
        ).length / likelyPublishableReviews.length
      : 0,
    missingContextCounts,
    publishable: decisionReviews.filter(
      ({ review }) => review.decision === "publishable",
    ).length,
    rejected: decisionReviews.filter(({ review }) => review.decision === "reject")
      .length,
    resolutionAccuracy: resolutionAssessments.length
      ? resolutionAssessments.filter(
          (review) => review.resolutionAssessment === "correct",
        ).length / resolutionAssessments.length
      : 0,
    reviewed: decisionReviews.length,
    reviewerRows: savedReviewRows,
    severityManagementAcceptableRate: severityManagementAssessments.length
      ? severityManagementAssessments.filter(
          (review) => review.severityManagementAssessment === "acceptable",
        ).length / severityManagementAssessments.length
      : 0,
    slowReviews: reviews.filter((review) => review.timeBucket === "slow")
      .length,
  };
}

function formatNode(node: PubMedInteractionCandidate["resolvedSourceNode"]) {
  if (!node) {
    return "Unresolved";
  }

  return `${node.canonicalName} (${node.type}, ${node.source})`;
}

function getNodeSourceLinks(
  node: NonNullable<PubMedInteractionCandidate["resolvedSourceNode"]>,
): Array<{ label: string; url: string }> {
  const drugCode = readIdentifierString(node.identifiers, "drug_code");
  const cpsId =
    readIdentifierString(node.identifiers, "cps_id") ??
    readIdentifierString(node.identifiers, "dpd_keyref");

  return [
    drugCode
      ? {
          label: "Open Health Canada DPD",
          url: getHealthCanadaDpdUrl(drugCode),
        }
      : null,
    cpsId || node.source === "CPS"
      ? {
          label: "Search CPS/e-CPS",
          url: `https://www.e-therapeutics.ca/search?query=${encodeURIComponent(
            node.canonicalName,
          )}`,
        }
      : null,
    node.source === "HEALTH_CANADA_NOC"
      ? {
          label: "Open Health Canada NOC search",
          url: `https://health-products.canada.ca/noc-ac/index-eng.jsp?query=${encodeURIComponent(
            node.canonicalName,
          )}`,
        }
      : null,
    node.source === "HEALTH_CANADA_SUMMARY_REPORT"
      ? {
          label: "Open Health Canada drug decisions search",
          url: `https://dhpp.hpfb-dgpsa.ca/review-documents/search?query=${encodeURIComponent(
            node.canonicalName,
          )}`,
        }
      : null,
  ].filter((link): link is { label: string; url: string } => Boolean(link));
}

function getHealthCanadaDpdUrl(drugCode: string) {
  return `https://health-products.canada.ca/dpd-bdpp/info.do?code=${encodeURIComponent(
    drugCode,
  )}&lang=en`;
}

function getNodeMetadataRows(
  node: NonNullable<PubMedInteractionCandidate["resolvedSourceNode"]>,
): Array<{ label: string; value: string }> {
  const identifiers = node.identifiers;
  const rows = [
    ["CPS ID", readIdentifierString(identifiers, "cps_id")],
    ["CPS DPD", readIdentifierString(identifiers, "dpd_keyref")],
    ["DIN", readIdentifierValue(identifiers, "din")],
    ["Drug code", readIdentifierString(identifiers, "drug_code")],
    ["ATC", readIdentifierValue(identifiers, "atc")],
    ["Ingredient", readFirstIdentifierValue(identifiers, [
      "cps_ingredient_name",
      "health_canada_ingredient_name",
      "ingredient_name",
      "generic_name",
    ])],
    ["Status", readIdentifierValue(identifiers, "status")],
    ["Route", readIdentifierValue(identifiers, "route")],
    ["Form", readIdentifierValue(identifiers, "dosage_form")],
    ["Company", readIdentifierValue(identifiers, "company_name")],
    ["Manufacturer", readIdentifierValue(identifiers, "manufacturer")],
    ["Schedule", readIdentifierValue(identifiers, "schedule")],
    ["Therapeutic class", readIdentifierValue(identifiers, "therapeutic_class")],
  ] as const;

  return rows.flatMap(([label, value]) =>
    value ? [{ label, value: truncateMetadataValue(value) }] : [],
  );
}

function readFirstIdentifierValue(
  identifiers: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = readIdentifierValue(identifiers, key);

    if (value) {
      return value;
    }
  }

  return null;
}

function readIdentifierString(
  identifiers: Record<string, unknown>,
  key: string,
): string | null {
  const value = identifiers[key];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readIdentifierValue(
  identifiers: Record<string, unknown>,
  key: string,
): string | null {
  const value = identifiers[key];

  if (typeof value === "string") {
    return value.trim() || null;
  }

  if (Array.isArray(value)) {
    const values = value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);

    return values.length ? values.join(", ") : null;
  }

  return null;
}

function truncateMetadataValue(value: string) {
  return value.length > 90 ? `${value.slice(0, 87)}...` : value;
}

function mergeCalibrationReviews(
  savedReviews: PubMedCalibrationReview[],
  draftReviewsByCandidateId: Record<string, DraftCalibrationReview>,
): PubMedCalibrationReview[] {
  const draftReviews = Object.entries(draftReviewsByCandidateId).map(
    ([candidateId, review]) =>
      ({
        ...review,
        candidateId,
        createdAt: new Date().toISOString(),
        id: `draft-${candidateId}`,
        reviewerId: null,
        reviewerKey,
        setId: calibrationSetId,
        updatedAt: new Date().toISOString(),
      }) satisfies PubMedCalibrationReview,
  );

  return [
    ...draftReviews,
    ...savedReviews.filter(
      (review) =>
        review.reviewerKey !== reviewerKey ||
        !draftReviewsByCandidateId[review.candidateId],
    ),
  ];
}

function toDraftReview(
  review: PubMedCalibrationReview,
): DraftCalibrationReview {
  return {
    decision: review.decision,
    drugPairAssessment: review.drugPairAssessment,
    interactionAssessment: review.interactionAssessment,
    missingContext: review.missingContext,
    notes: review.notes,
    resolutionAssessment: review.resolutionAssessment,
    severityManagementAssessment: review.severityManagementAssessment,
    timeBucket: review.timeBucket,
  };
}

function getCalibrationBucket(index: number) {
  if (index < 20) {
    return { label: "Likely publishable" };
  }

  if (index < 30) {
    return { label: "Needs review" };
  }

  return { label: "Flagged/unresolved" };
}

const emptyReview: DraftCalibrationReview = {
  missingContext: [],
  notes: "",
};

const calibrationSetId = "pubmed-interaction-calibration-2026-06-08";
const reviewerKey = "shared-password-reviewer";

const sourceCoverageLabels = {
  cps_covered: "CPS-covered",
  cps_only: "CPS only",
  health_canada_only: "Health Canada-only",
  possible_source_match: "Possible source match",
  source_conflict: "Source conflict",
} as const;

const interactionAssessmentOptions: {
  label: string;
  value: PubMedCalibrationInteractionAssessment;
}[] = [
  { label: "Real", value: "real" },
  { label: "Not interaction", value: "not_interaction" },
  { label: "Unclear", value: "unclear" },
];

const drugPairAssessmentOptions: {
  label: string;
  value: PubMedCalibrationDrugPairAssessment;
}[] = [
  { label: "Correct", value: "correct" },
  { label: "Partly correct", value: "partially_correct" },
  { label: "Wrong pair", value: "wrong_pair" },
  { label: "Unclear", value: "unclear" },
];

const decisionOptions: {
  label: string;
  value: PubMedCalibrationDecision;
}[] = [
  { label: "Publishable", value: "publishable" },
  { label: "Follow-up", value: "follow_up" },
  { label: "Reject", value: "reject" },
];

const resolutionAssessmentOptions: {
  label: string;
  value: PubMedCalibrationResolutionAssessment;
}[] = [
  { label: "Correct", value: "correct" },
  { label: "Wrong level", value: "wrong_level" },
  { label: "Wrong node", value: "wrong_node" },
  { label: "Unresolved/unclear", value: "unresolved_unclear" },
];

const severityManagementAssessmentOptions: {
  label: string;
  value: PubMedCalibrationSeverityManagementAssessment;
}[] = [
  { label: "Acceptable", value: "acceptable" },
  { label: "Needs revision", value: "needs_revision" },
  { label: "Wrong", value: "wrong" },
  { label: "Not assessed", value: "not_assessed" },
];

const timeBucketOptions: {
  label: string;
  value: PubMedCalibrationTimeBucket;
}[] = [
  { label: "Under 1 min", value: "fast" },
  { label: "1-3 min", value: "medium" },
  { label: "Over 3 min", value: "slow" },
];

const missingContextOptions: {
  label: string;
  shortLabel: string;
  value: PubMedCalibrationMissingContext;
}[] = [
  { label: "CPS comparison", shortLabel: "CPS", value: "cps_comparison" },
  { label: "Full article", shortLabel: "Article", value: "full_article" },
  { label: "MedEffect/safety", shortLabel: "Safety", value: "medeffect_safety" },
  { label: "NHP data", shortLabel: "NHP", value: "nhp_data" },
  { label: "NOC/NOCc", shortLabel: "NOC", value: "noc_context" },
  { label: "Route/form", shortLabel: "Route", value: "route_form" },
  {
    label: "Severity/management",
    shortLabel: "Severity",
    value: "severity_management",
  },
];

const calibrationCandidateIds = [
  "49258098-3567-4b2b-878d-9ccf3255da1c",
  "152178b4-b53e-4bdd-97f9-fb2ce3f5bfd3",
  "26e72662-e025-4184-bffe-0ea75bb9da7e",
  "c6a6f740-c042-46e2-8e42-9ebec49ca504",
  "e0a0dda1-11d7-4e7f-88d9-b5161c977adc",
  "34662e98-b8c2-486b-aea4-51394bcb4cda",
  "6f71a5cf-71c5-4af0-a57a-2f65b3eaec3c",
  "beb77213-9d9a-4e0d-bccb-850b404f828e",
  "f8e33e12-02b1-47c9-8167-a1fa0ab7dc08",
  "2b1e99aa-c3e7-4887-ab0d-38c0dbf98037",
  "d9580888-fc05-4b7b-8d65-4013d2d737b7",
  "9e546bea-b494-4efb-b3d5-e16d33bcab40",
  "8d10a8cd-bfa9-4508-9c5b-637b304febdf",
  "f6b5b9da-141a-4065-8799-93da525863e2",
  "b569b2f1-2afb-4b57-acab-ae559c4f69d7",
  "a3924f4f-47ba-470a-b6fa-d00e4fefaf63",
  "3e40e166-e12b-4093-a67e-9ffed3ec1050",
  "5a97ca57-57c8-4840-98ac-9589ca91b8be",
  "c5a4d145-40a1-4a96-aa27-5d7243dcf9be",
  "e7536c03-ecf5-4f28-a96a-45cb40aa15b4",
  "fa90d8c6-eb92-45c8-b3b0-19025a5d2578",
  "9b57f5ce-4752-49fb-8e5f-6f62fe4aa4e5",
  "4783e188-26cc-420b-8c74-7bc5a41be642",
  "600a764b-fdb2-47de-9b75-ee50f81a976a",
  "de8bbf6f-c836-4b04-9671-4ca06616558c",
  "63639532-4e2f-4595-8e5c-e0b515c48abe",
  "729d7191-6b82-4442-a8f0-29f340a6a746",
  "d3af6a6f-173e-4870-a1c8-6f9196adedec",
  "feb731df-bdca-476e-8b9b-8cfd4de2d8ae",
  "c364d699-3a9e-4ece-8b08-84f0e6fbc450",
  "acc18c9c-2dda-4e4f-9a83-5c5c35446069",
  "c4ce9ebb-78f2-4b64-a028-52d306edc271",
  "b2d74b2b-6817-4bb7-8e02-a6e4149e8ebd",
  "dcbc2c6b-c47c-4bec-a6a4-11ce46478b0e",
  "acaeac2b-45e7-4ce3-9d80-badb5f945efc",
  "648c61db-8027-413f-849a-4c38f1a4296f",
  "ee66f530-a27e-4396-8297-abcedfc40d01",
  "a6dc63a7-612e-46e0-aaf5-c7ba3e045ad2",
  "13095dc9-6188-4fc3-bd1a-10dba5dfe033",
  "81bf672d-f491-464f-865e-266e2d66842c",
  "50330854-ebcd-4924-8bd7-76a876fe06c6",
  "0c67c6ee-b5de-4827-9757-270f7a9d49f1",
  "e4d306bb-c245-4a8c-bfa1-535115d9214e",
  "d5631342-78f1-49c5-9354-12c39050a35d",
  "321cbbef-e323-4a10-af80-608ca15f544b",
  "510e7b38-9129-4c3c-aae6-22750e7c2d85",
  "cb03ca44-7312-47a3-a2f5-730a8de50cf3",
  "8f367ca2-0bba-463d-b8b2-053cc651431e",
  "e978d19d-9439-4788-8c0c-ca890e317215",
  "965bfdc9-5480-49b0-8247-905f34e2a2be",
];
