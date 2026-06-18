import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  getKgExplorerNode,
  getKgExplorerEdges,
  searchKgExplorerNodes,
} from "@clinrx/api";
import type {
  EdgeReviewStatus,
  InteractionSeverity,
  KgRelation,
} from "@clinrx/types";

import { KgGraphCanvas } from "@/components/KgGraphCanvas";
import { ReviewPasswordGate, reviewPassword } from "@/components/ReviewPasswordGate";
import { supabase } from "@/lib/supabase";

const PAGE_SIZE = 50;

const RELATIONS: KgRelation[] = [
  "interacts_with",
  "has_ingredient",
  "subclass_of",
  "contraindicated_in",
  "treats",
  "causes",
  "comorbid_with",
];
const SEVERITIES: InteractionSeverity[] = [
  "contraindicated",
  "major",
  "moderate",
  "minor",
  "unknown",
];
const STATUSES: EdgeReviewStatus[] = [
  "candidate",
  "under_review",
  "published",
  "rejected",
];

const severityStyles: Record<string, string> = {
  contraindicated: "bg-red-100 text-red-700",
  major: "bg-orange-100 text-orange-700",
  moderate: "bg-amber-100 text-amber-700",
  minor: "bg-yellow-100 text-yellow-700",
  unknown: "bg-mist text-ink/60",
};
const statusStyles: Record<string, string> = {
  published: "bg-green-100 text-green-700",
  under_review: "bg-amber-100 text-amber-700",
  candidate: "bg-mist text-ink/60",
  rejected: "bg-red-100 text-red-700",
};

function label(value: string | null | undefined): string {
  return (value ?? "—").replace(/_/g, " ");
}

export default function KgExplorerScreen() {
  return (
    <ReviewPasswordGate>
      <KgExplorerContent />
    </ReviewPasswordGate>
  );
}

function KgExplorerContent() {
  const [query, setQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Edge filters.
  const [relation, setRelation] = useState<KgRelation | null>(null);
  const [statuses, setStatuses] = useState<EdgeReviewStatus[]>([]);
  const [severities, setSeverities] = useState<InteractionSeverity[]>([]);
  const [neighborQuery, setNeighborQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [edgeView, setEdgeView] = useState<"graph" | "table">("graph");

  // Debounce the search box.
  useEffect(() => {
    const id = setTimeout(() => setSearchTerm(query.trim()), 250);
    return () => clearTimeout(id);
  }, [query]);

  // Reset paging whenever the node or filters change.
  useEffect(() => {
    setOffset(0);
  }, [selectedNodeId, relation, statuses, severities, neighborQuery]);

  const searchQuery = useQuery({
    enabled: searchTerm.length >= 2,
    queryKey: ["kg-search", searchTerm],
    queryFn: () => searchKgExplorerNodes(supabase, reviewPassword, searchTerm, 25),
  });

  const nodeQuery = useQuery({
    enabled: Boolean(selectedNodeId),
    queryKey: ["kg-node", selectedNodeId],
    queryFn: () => getKgExplorerNode(supabase, reviewPassword, selectedNodeId!),
  });

  const edgesQuery = useQuery({
    enabled: Boolean(selectedNodeId),
    queryKey: [
      "kg-edges",
      selectedNodeId,
      relation,
      statuses,
      severities,
      neighborQuery,
      offset,
    ],
    queryFn: () =>
      getKgExplorerEdges(supabase, reviewPassword, selectedNodeId!, {
        relation,
        statuses: statuses.length ? statuses : null,
        severities: severities.length ? severities : null,
        neighborQuery: neighborQuery.trim() || null,
        limit: PAGE_SIZE,
        offset,
      }),
  });

  const node = nodeQuery.data;
  const edgePage = edgesQuery.data;
  const total = edgePage?.total ?? 0;

  const toggle = <T,>(value: T, list: T[], set: (next: T[]) => void) => {
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  };

  return (
    <ScrollView className="flex-1 bg-mist">
      <View className="min-h-screen px-5 pb-10 pt-16">
        <Text className="text-sm font-semibold uppercase text-leaf">
          Internal tool
        </Text>
        <Text className="mt-3 text-4xl font-bold text-ink">
          Knowledge Graph Explorer
        </Text>
        <Text className="mt-3 max-w-3xl text-base leading-6 text-ink/70">
          Search a drug, ingredient, or class, then inspect its node and the
          interaction edges around it. Use the filters to find e.g. unreviewed or
          low-confidence edges as the graph grows.
        </Text>

        {/* Search */}
        <View className="mt-6 rounded-lg border border-ink/10 bg-white p-4">
          <Text className="text-sm font-semibold text-ink">Search nodes</Text>
          <TextInput
            className="mt-2 rounded-lg border border-ink/15 bg-white px-3 py-3 text-base text-ink"
            onChangeText={setQuery}
            placeholder="e.g. warfarin, amiodarone, CYP3A4, statins"
            placeholderTextColor="#7b8580"
            value={query}
          />
          {searchTerm.length >= 2 ? (
            searchQuery.isLoading ? (
              <ActivityIndicator className="mt-3" />
            ) : searchQuery.data?.length ? (
              <View className="mt-3 gap-2">
                {searchQuery.data.map((result) => {
                  const selected = result.id === selectedNodeId;
                  return (
                    <Pressable
                      accessibilityRole="button"
                      className={`rounded-lg border px-3 py-2 ${
                        selected
                          ? "border-leaf bg-leaf/10"
                          : "border-ink/10 bg-white"
                      }`}
                      key={result.id}
                      onPress={() => setSelectedNodeId(result.id)}
                    >
                      <View className="flex-row flex-wrap items-center gap-2">
                        <Text className="text-base font-semibold text-ink">
                          {result.canonicalName}
                        </Text>
                        <Tag>{label(result.type)}</Tag>
                        <Tag>{result.source}</Tag>
                        <Tag>{result.degree} edges</Tag>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Text className="mt-3 text-sm text-ink/60">No matches.</Text>
            )
          ) : null}
        </View>

        {!selectedNodeId ? (
          <Text className="mt-6 text-sm text-ink/50">
            Select a node to inspect it.
          </Text>
        ) : nodeQuery.isLoading ? (
          <ActivityIndicator className="mt-6" />
        ) : node ? (
          <>
            <NodeInspector node={node} />

            {/* Edge filters */}
            <View className="mt-4 rounded-lg border border-ink/10 bg-white p-4">
              <Text className="text-sm font-semibold text-ink">
                Filter edges
              </Text>
              <FilterRow title="Relation">
                <Chip
                  active={relation === null}
                  onPress={() => setRelation(null)}
                  text="any"
                />
                {RELATIONS.map((r) => (
                  <Chip
                    active={relation === r}
                    key={r}
                    onPress={() => setRelation(relation === r ? null : r)}
                    text={label(r)}
                  />
                ))}
              </FilterRow>
              <FilterRow title="Review status">
                {STATUSES.map((s) => (
                  <Chip
                    active={statuses.includes(s)}
                    key={s}
                    onPress={() => toggle(s, statuses, setStatuses)}
                    text={label(s)}
                  />
                ))}
              </FilterRow>
              <FilterRow title="Severity">
                {SEVERITIES.map((s) => (
                  <Chip
                    active={severities.includes(s)}
                    key={s}
                    onPress={() => toggle(s, severities, setSeverities)}
                    text={s}
                  />
                ))}
              </FilterRow>
              <View className="mt-3">
                <Text className="text-xs font-semibold uppercase text-ink/50">
                  Neighbor name contains
                </Text>
                <TextInput
                  className="mt-2 rounded-lg border border-ink/15 bg-white px-3 py-2 text-base text-ink"
                  onChangeText={setNeighborQuery}
                  placeholder="filter neighbours by name"
                  placeholderTextColor="#7b8580"
                  value={neighborQuery}
                />
              </View>
            </View>

            {/* Edges: graph or table */}
            <View className="mt-4 rounded-lg border border-ink/10 bg-white p-4">
              <View className="flex-row flex-wrap items-center justify-between gap-2">
                <View className="flex-row flex-wrap items-center gap-2">
                  <Text className="text-sm font-semibold text-ink">
                    Edges {total ? `(${total})` : ""}
                  </Text>
                  <View className="flex-row gap-1">
                    <Chip
                      active={edgeView === "graph"}
                      onPress={() => setEdgeView("graph")}
                      text="Graph"
                    />
                    <Chip
                      active={edgeView === "table"}
                      onPress={() => setEdgeView("table")}
                      text="Table"
                    />
                  </View>
                </View>
                {total > PAGE_SIZE ? (
                  <View className="flex-row items-center gap-2">
                    <Text className="text-xs text-ink/60">
                      {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
                    </Text>
                    <Pressable
                      className="rounded-md border border-ink/15 px-2 py-1"
                      disabled={offset === 0}
                      onPress={() => setOffset(Math.max(offset - PAGE_SIZE, 0))}
                    >
                      <Text
                        className={`text-xs font-semibold ${
                          offset === 0 ? "text-ink/30" : "text-leaf"
                        }`}
                      >
                        Prev
                      </Text>
                    </Pressable>
                    <Pressable
                      className="rounded-md border border-ink/15 px-2 py-1"
                      disabled={offset + PAGE_SIZE >= total}
                      onPress={() => setOffset(offset + PAGE_SIZE)}
                    >
                      <Text
                        className={`text-xs font-semibold ${
                          offset + PAGE_SIZE >= total ? "text-ink/30" : "text-leaf"
                        }`}
                      >
                        Next
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>

              {edgesQuery.isLoading ? (
                <ActivityIndicator className="mt-3" />
              ) : !edgePage?.edges.length ? (
                <Text className="mt-3 text-sm text-ink/60">
                  No edges match these filters.
                </Text>
              ) : edgeView === "graph" ? (
                <View className="mt-3">
                  <KgGraphCanvas
                    center={{ id: node.id, name: node.canonicalName, type: node.type }}
                    edges={edgePage.edges}
                    onSelectNode={setSelectedNodeId}
                  />
                </View>
              ) : (
                <View className="mt-3 gap-2">
                  {edgePage.edges.map((edge) => (
                    <View
                      className="rounded-lg border border-ink/10 bg-mist p-3"
                      key={edge.id}
                    >
                      <View className="flex-row flex-wrap items-center gap-2">
                        <Text className="text-xs uppercase text-ink/40">
                          {edge.direction === "out" ? "→" : "←"}
                        </Text>
                        <Pressable
                          onPress={() => setSelectedNodeId(edge.neighborId)}
                        >
                          <Text className="text-base font-semibold text-leaf underline">
                            {edge.neighborName}
                          </Text>
                        </Pressable>
                        <Tag>{label(edge.neighborType)}</Tag>
                        <Tag>{edge.neighborSource}</Tag>
                      </View>
                      <View className="mt-2 flex-row flex-wrap items-center gap-2">
                        <Tag>{label(edge.relation)}</Tag>
                        {edge.severity ? (
                          <Pill
                            style={
                              severityStyles[edge.severity] ??
                              "bg-mist text-ink/60"
                            }
                            text={edge.severity}
                          />
                        ) : null}
                        <Pill
                          style={
                            statusStyles[edge.reviewStatus] ?? "bg-mist text-ink/60"
                          }
                          text={label(edge.reviewStatus)}
                        />
                        {edge.evidenceLevel ? (
                          <Tag>evidence: {edge.evidenceLevel}</Tag>
                        ) : null}
                        {edge.extractionConfidence !== null ? (
                          <Tag>
                            conf {Math.round(edge.extractionConfidence * 100)}%
                          </Tag>
                        ) : null}
                        {Array.isArray(edge.citations) &&
                        edge.citations.length ? (
                          <Tag>{edge.citations.length} citations</Tag>
                        ) : null}
                        <Tag>{edge.source}</Tag>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </>
        ) : (
          <Text className="mt-6 text-sm text-coral">Node not found.</Text>
        )}
      </View>
    </ScrollView>
  );
}

function NodeInspector({
  node,
}: {
  node: NonNullable<Awaited<ReturnType<typeof getKgExplorerNode>>>;
}) {
  return (
    <View className="mt-4 rounded-lg border border-leaf/40 bg-white p-4">
      <View className="flex-row flex-wrap items-center gap-2">
        <Text className="text-2xl font-bold text-ink">{node.canonicalName}</Text>
        <Tag>{label(node.type)}</Tag>
        <Tag>{node.source}</Tag>
        <Tag>{node.degree} edges</Tag>
        <Tag>{node.chunkCount} chunks</Tag>
      </View>
      {node.summary ? (
        <Text className="mt-2 text-sm leading-6 text-ink/70">{node.summary}</Text>
      ) : null}

      <Detail title="Identifiers">
        <Text className="text-xs leading-5 text-ink/60">
          {JSON.stringify(node.identifiers)}
        </Text>
      </Detail>

      {node.synonyms.length ? (
        <Detail title={`Synonyms (${node.synonyms.length})`}>
          <View className="flex-row flex-wrap gap-2">
            {node.synonyms.map((s) => (
              <Tag key={`${s.synonym}-${s.source}`}>
                {s.synonym} · {s.source}
              </Tag>
            ))}
          </View>
        </Detail>
      ) : null}

      {node.crosswalk.length ? (
        <Detail title={`Source crosswalk (${node.crosswalk.length})`}>
          <View className="gap-1">
            {node.crosswalk.map((c, i) => (
              <Text className="text-xs leading-5 text-ink/60" key={i}>
                {c.sourceA} ↔ {c.sourceB} · {label(c.matchStatus)} ·{" "}
                {Math.round(c.confidence * 100)}%
              </Text>
            ))}
          </View>
        </Detail>
      ) : null}

      <Text className="mt-3 text-[10px] text-ink/30">{node.id}</Text>
    </View>
  );
}

function Detail({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <View className="mt-3">
      <Text className="text-xs font-semibold uppercase text-ink/50">{title}</Text>
      <View className="mt-1">{children}</View>
    </View>
  );
}

function FilterRow({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <View className="mt-3">
      <Text className="text-xs font-semibold uppercase text-ink/50">{title}</Text>
      <View className="mt-2 flex-row flex-wrap gap-2">{children}</View>
    </View>
  );
}

function Chip({
  active,
  onPress,
  text,
}: {
  active: boolean;
  onPress: () => void;
  text: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className={`rounded-lg border px-3 py-1.5 ${
        active ? "border-leaf bg-leaf" : "border-ink/10 bg-white"
      }`}
      onPress={onPress}
    >
      <Text
        className={`text-xs font-semibold ${active ? "text-white" : "text-ink"}`}
      >
        {text}
      </Text>
    </Pressable>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <Text className="rounded-md bg-mist px-2 py-1 text-xs font-semibold uppercase text-ink/60">
      {children}
    </Text>
  );
}

function Pill({ style, text }: { style: string; text: string }) {
  return (
    <Text
      className={`rounded-md px-2 py-1 text-xs font-semibold uppercase ${style}`}
    >
      {text}
    </Text>
  );
}
