import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  getKgDuplicationOverview,
  getKgExplorerNode,
  getKgExplorerEdges,
  getKgNodeChunks,
  getKgNodeChunkStats,
  type KgMoietyGroup,
  searchKgExplorerNodes,
  searchKgGroupedNodes,
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

const chunkKindLabel: Record<string, string> = {
  CPS: "CPS",
  HEALTH_CANADA_PRODUCT_MONOGRAPH: "HC monograph",
  HEALTH_CANADA_DPD: "DPD",
  HEALTH_CANADA_NOC: "NOC",
  HEALTH_CANADA_SUMMARY_REPORT: "HC summary",
  pubmed: "PubMed",
  safety: "Safety",
};
const chunkKindStyle: Record<string, string> = {
  pubmed: "bg-blue-100 text-blue-700",
  CPS: "bg-purple-100 text-purple-700",
  HEALTH_CANADA_PRODUCT_MONOGRAPH: "bg-green-100 text-green-700",
  HEALTH_CANADA_DPD: "bg-amber-100 text-amber-700",
  HEALTH_CANADA_NOC: "bg-teal-100 text-teal-700",
  HEALTH_CANADA_SUMMARY_REPORT: "bg-mist text-ink/60",
  safety: "bg-red-100 text-red-700",
};

function ChunkBadges({ chunks }: { chunks: Record<string, number> }) {
  const entries = Object.entries(chunks)
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1]);
  if (!entries.length) {
    return (
      <Text className="rounded-md bg-mist px-2 py-0.5 text-xs font-semibold text-ink/40">
        no chunks
      </Text>
    );
  }
  return (
    <>
      {entries.map(([kind, count]) => (
        <Text
          className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
            chunkKindStyle[kind] ?? "bg-mist text-ink/60"
          }`}
          key={kind}
        >
          {chunkKindLabel[kind] ?? label(kind)} {count}
        </Text>
      ))}
    </>
  );
}

const sourceShortLabel: Record<string, string> = {
  CPS: "CPS",
  HEALTH_CANADA_DPD: "DPD",
  HEALTH_CANADA_NOC: "NOC",
  HEALTH_CANADA_SUMMARY_REPORT: "HC summary",
  manual_seed: "manual",
};
function shortSource(s: string): string {
  return sourceShortLabel[s] ?? s;
}

function formatIdValue(value: unknown): string {
  if (Array.isArray(value)) return value.map((v) => String(v)).join(", ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function IdentifierList({
  identifiers,
}: {
  identifiers: Record<string, unknown>;
}) {
  const entries = Object.entries(identifiers).filter(([, v]) => {
    if (v == null) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "string") return v.trim().length > 0;
    return true;
  });
  if (!entries.length) {
    return <Text className="text-xs text-ink/50">None</Text>;
  }
  return (
    <View className="flex-row flex-wrap gap-2">
      {entries.map(([k, v]) => (
        <View
          className="rounded-md border border-ink/10 bg-mist px-2 py-1"
          key={k}
        >
          <Text className="text-[10px] font-semibold uppercase text-ink/40">
            {k.replace(/_/g, " ")}
          </Text>
          <Text className="text-xs text-ink/70">{formatIdValue(v)}</Text>
        </View>
      ))}
    </View>
  );
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
  // Ego-center navigation history (browser-style back/forward).
  const [nav, setNav] = useState<{ stack: string[]; index: number }>({
    stack: [],
    index: -1,
  });
  const selectedNodeId = nav.index >= 0 ? nav.stack[nav.index] : null;
  const [drawerOpen, setDrawerOpen] = useState(true);
  const navigateToNode = useCallback((id: string) => {
    setDrawerOpen(true);
    setNav((n) => {
      const current = n.index >= 0 ? n.stack[n.index] : null;
      if (id === current) return n;
      const stack = n.stack.slice(0, n.index + 1);
      stack.push(id);
      return { stack, index: stack.length - 1 };
    });
  }, []);
  const goBack = useCallback(
    () => setNav((n) => (n.index > 0 ? { ...n, index: n.index - 1 } : n)),
    [],
  );
  const goForward = useCallback(
    () =>
      setNav((n) =>
        n.index < n.stack.length - 1 ? { ...n, index: n.index + 1 } : n
      ),
    [],
  );
  const canGoBack = nav.index > 0;
  const canGoForward = nav.index < nav.stack.length - 1;
  const [searchView, setSearchView] = useState<"grouped" | "nodes">("grouped");
  const [showOverview, setShowOverview] = useState(false);

  // Edge filters.
  const [relation, setRelation] = useState<KgRelation | null>(null);
  const [statuses, setStatuses] = useState<EdgeReviewStatus[]>([]);
  const [severities, setSeverities] = useState<InteractionSeverity[]>([]);
  const [neighborQuery, setNeighborQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [edgeView, setEdgeView] = useState<"graph" | "table">("graph");
  const [filtersOpen, setFiltersOpen] = useState(true);

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
    enabled: searchTerm.length >= 2 && searchView === "nodes",
    queryKey: ["kg-search", searchTerm],
    queryFn: () => searchKgExplorerNodes(supabase, reviewPassword, searchTerm, 25),
  });
  const groupedQuery = useQuery({
    enabled: searchTerm.length >= 2 && searchView === "grouped",
    queryKey: ["kg-search-grouped", searchTerm],
    queryFn: () => searchKgGroupedNodes(supabase, reviewPassword, searchTerm, 60),
  });
  const overviewQuery = useQuery({
    enabled: showOverview,
    queryKey: ["kg-duplication-overview"],
    queryFn: () => getKgDuplicationOverview(supabase, reviewPassword, 60),
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
    <>
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

        {/* Graph-health: duplication overview */}
        <View className="mt-6 rounded-lg border border-ink/10 bg-white p-4">
          <View className="flex-row flex-wrap items-center justify-between gap-2">
            <Text className="text-sm font-semibold text-ink">
              Graph health — node duplication
            </Text>
            <Pressable
              className="rounded-md border border-ink/15 px-2 py-1"
              onPress={() => setShowOverview((v) => !v)}
            >
              <Text className="text-xs font-semibold uppercase text-leaf">
                {showOverview ? "Hide" : "Show"}
              </Text>
            </Pressable>
          </View>
          {showOverview ? (
            overviewQuery.isLoading ? (
              <ActivityIndicator className="mt-3" />
            ) : overviewQuery.data ? (
              <View className="mt-3">
                <View className="flex-row flex-wrap gap-2">
                  <Stat
                    label="Spine nodes"
                    value={overviewQuery.data.summary.spineNodes}
                  />
                  <Stat
                    label="Real moieties"
                    value={overviewQuery.data.summary.moieties}
                  />
                  <Stat
                    label="Duplicated moieties"
                    value={overviewQuery.data.summary.duplicateMoieties}
                  />
                  <Stat
                    label="Eliminable nodes"
                    value={overviewQuery.data.summary.eliminableNodes}
                  />
                </View>
                <Text className="mt-3 text-xs font-semibold uppercase text-ink/50">
                  Most-duplicated moieties (ingredient + class). Tap to inspect.
                </Text>
                <View className="mt-2 gap-1">
                  {overviewQuery.data.top.map((t) => (
                    <Pressable
                      className="flex-row flex-wrap items-center gap-2 rounded-lg border border-ink/10 bg-mist px-3 py-2"
                      key={t.moiety}
                      onPress={() => {
                        setSearchView("grouped");
                        setQuery(t.moiety);
                      }}
                    >
                      <Text className="text-sm font-semibold text-ink">
                        {t.moiety}
                      </Text>
                      <Text className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                        ×{t.total}
                      </Text>
                      <Tag>{t.nIngredient} ing</Tag>
                      {t.nClass ? <Tag>{t.nClass} class</Tag> : null}
                      <Tag>{t.nSources} sources</Tag>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null
          ) : (
            <Text className="mt-2 text-xs leading-5 text-ink/60">
              How fragmented the interaction-bearing spine is right now — the
              same drug split into many per-source nodes.
            </Text>
          )}
        </View>

        {/* Search */}
        <View className="mt-4 rounded-lg border border-ink/10 bg-white p-4">
          <View className="flex-row flex-wrap items-center justify-between gap-2">
            <Text className="text-sm font-semibold text-ink">Search nodes</Text>
            <View className="flex-row gap-1">
              <Chip
                active={searchView === "grouped"}
                onPress={() => setSearchView("grouped")}
                text="Grouped by moiety"
              />
              <Chip
                active={searchView === "nodes"}
                onPress={() => setSearchView("nodes")}
                text="All nodes"
              />
            </View>
          </View>
          <TextInput
            className="mt-2 rounded-lg border border-ink/15 bg-white px-3 py-3 text-base text-ink"
            onChangeText={setQuery}
            placeholder="e.g. warfarin, amiodarone, CYP3A4, statins"
            placeholderTextColor="#7b8580"
            value={query}
          />
          {searchTerm.length < 2 ? null : searchView === "grouped" ? (
            groupedQuery.isLoading ? (
              <ActivityIndicator className="mt-3" />
            ) : groupedQuery.data?.length ? (
              <View className="mt-3 gap-2">
                {groupedQuery.data.map((group) => (
                  <MoietyGroupCard
                    group={group}
                    key={group.moiety || "unnamed"}
                    onSelectNode={navigateToNode}
                    selectedNodeId={selectedNodeId}
                  />
                ))}
              </View>
            ) : (
              <Text className="mt-3 text-sm text-ink/60">No matches.</Text>
            )
          ) : searchQuery.isLoading ? (
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
                    onPress={() => navigateToNode(result.id)}
                  >
                    <View className="flex-row flex-wrap items-center gap-2">
                      <Text className="text-base font-semibold text-ink">
                        {result.canonicalName}
                      </Text>
                      <Tag>{label(result.type)}</Tag>
                      <Tag>{result.source}</Tag>
                      <Tag>{result.degree} edges</Tag>
                      <ChunkBadges chunks={result.chunks} />
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Text className="mt-3 text-sm text-ink/60">No matches.</Text>
          )}
        </View>

        {nav.stack.length > 0 ? (
          <View className="mt-4 flex-row flex-wrap items-center gap-2">
            <Pressable
              accessibilityRole="button"
              className="rounded-md border border-ink/15 px-3 py-2"
              disabled={!canGoBack}
              onPress={goBack}
            >
              <Text
                className={`text-sm font-semibold ${
                  canGoBack ? "text-leaf" : "text-ink/30"
                }`}
              >
                ← Back
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              className="rounded-md border border-ink/15 px-3 py-2"
              disabled={!canGoForward}
              onPress={goForward}
            >
              <Text
                className={`text-sm font-semibold ${
                  canGoForward ? "text-leaf" : "text-ink/30"
                }`}
              >
                Forward →
              </Text>
            </Pressable>
            <Text className="text-xs text-ink/50">
              {nav.index + 1} of {nav.stack.length} visited
            </Text>
          </View>
        ) : null}

        {!selectedNodeId ? (
          <Text className="mt-6 text-sm text-ink/50">
            Select a node to inspect it.
          </Text>
        ) : nodeQuery.isLoading ? (
          <ActivityIndicator className="mt-6" />
        ) : node ? (
          <>
            <View className="mt-4 flex-row flex-wrap items-center justify-between gap-2 rounded-lg border border-leaf/40 bg-white p-3">
              <View className="flex-row flex-wrap items-center gap-2">
                <Text className="text-lg font-bold text-ink">
                  {node.canonicalName}
                </Text>
                <Tag>{label(node.type)}</Tag>
                <Tag>{node.source}</Tag>
                <Tag>{node.degree} edges</Tag>
                <Tag>{node.chunkCount} chunks</Tag>
              </View>
              {!drawerOpen ? (
                <Pressable
                  accessibilityRole="button"
                  className="rounded-md border border-leaf bg-leaf px-3 py-2"
                  onPress={() => setDrawerOpen(true)}
                >
                  <Text className="text-sm font-semibold text-white">
                    Node details ▸
                  </Text>
                </Pressable>
              ) : null}
            </View>

            {/* Edge filters */}
            <View className="mt-4 rounded-lg border border-ink/10 bg-white p-4">
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: filtersOpen }}
                className="flex-row items-center justify-between"
                onPress={() => setFiltersOpen((v) => !v)}
              >
                <Text className="text-sm font-semibold text-ink">
                  Filter edges
                </Text>
                <Text className="text-base font-semibold text-leaf">
                  {filtersOpen ? "▾" : "▸"}
                </Text>
              </Pressable>
              {!filtersOpen ? null : (
                <>
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
                </>
              )}
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
                    onSelectNode={navigateToNode}
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
                          onPress={() => navigateToNode(edge.neighborId)}
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
    {node && drawerOpen ? (
      <KgNodeDrawer
        key={node.id}
        node={node}
        onClose={() => setDrawerOpen(false)}
        onSelectNode={navigateToNode}
      />
    ) : null}
    </>
  );
}

const CHUNK_PAGE = 15;

function KgNodeDrawer({
  node,
  onClose,
}: {
  node: NonNullable<Awaited<ReturnType<typeof getKgExplorerNode>>>;
  onClose: () => void;
  onSelectNode: (id: string) => void;
}) {
  const [chunkQuery, setChunkQuery] = useState("");
  const [chunkSearch, setChunkSearch] = useState("");
  const [chunkKind, setChunkKind] = useState<string | null>(null);
  const [chunkOffset, setChunkOffset] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setChunkSearch(chunkQuery.trim()), 250);
    return () => clearTimeout(t);
  }, [chunkQuery]);
  useEffect(() => {
    setChunkOffset(0);
  }, [chunkSearch, chunkKind]);

  const statsQuery = useQuery({
    queryKey: ["kg-chunk-stats", node.id],
    queryFn: () => getKgNodeChunkStats(supabase, reviewPassword, node.id),
  });
  const chunksQuery = useQuery({
    queryKey: ["kg-chunks", node.id, chunkSearch, chunkKind, chunkOffset],
    queryFn: () =>
      getKgNodeChunks(supabase, reviewPassword, node.id, {
        query: chunkSearch || null,
        kind: chunkKind,
        limit: CHUNK_PAGE,
        offset: chunkOffset,
      }),
  });

  const stats = statsQuery.data ?? [];
  // "safety" is a section overlay on monograph chunks, so exclude it from the
  // total to avoid double-counting.
  const totalChunks = stats
    .filter((x) => x.kind !== "safety")
    .reduce((s, x) => s + x.count, 0);
  const chunkPage = chunksQuery.data;
  const total = chunkPage?.total ?? 0;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close details"
        onPress={onClose}
        style={{
          position: "fixed" as "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 40,
          backgroundColor: "rgba(15,23,42,0.25)",
        }}
      />
      <View
        className="border-l border-ink/10 bg-mist"
        style={{
          position: "fixed" as "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: 480,
          maxWidth: "94%",
          zIndex: 50,
        }}
      >
        <View className="flex-row items-center justify-between border-b border-ink/10 bg-white px-4 py-3">
          <Text className="text-sm font-semibold uppercase text-leaf">
            Node details
          </Text>
          <Pressable
            accessibilityRole="button"
            className="rounded-md border border-ink/15 px-3 py-1"
            onPress={onClose}
          >
            <Text className="text-sm font-semibold text-ink">✕ Close</Text>
          </Pressable>
        </View>

        <ScrollView className="flex-1 px-4 py-3">
          <NodeInspector node={node} />

          <View className="mt-4 rounded-lg border border-ink/10 bg-white p-3">
            <Text className="text-sm font-semibold text-ink">
              Evidence chunks ({totalChunks})
            </Text>
            <Text className="mt-1 text-xs leading-5 text-ink/60">
              Monograph chunks live on this node; PubMed chunks are linked by
              article. Tap a source to filter, or search within the text.
            </Text>
            <View className="mt-2 flex-row flex-wrap gap-2">
              <Chip
                active={chunkKind === null}
                onPress={() => setChunkKind(null)}
                text={`All (${totalChunks})`}
              />
              {stats.map((s) => (
                <Chip
                  active={chunkKind === s.kind}
                  key={s.kind}
                  onPress={() =>
                    setChunkKind(chunkKind === s.kind ? null : s.kind)
                  }
                  text={`${chunkKindLabel[s.kind] ?? label(s.kind)} (${s.count})`}
                />
              ))}
            </View>
            <TextInput
              className="mt-3 rounded-lg border border-ink/15 bg-white px-3 py-2 text-base text-ink"
              onChangeText={setChunkQuery}
              placeholder="Search within chunk text…"
              placeholderTextColor="#7b8580"
              value={chunkQuery}
            />

            <View className="mt-2 flex-row items-center justify-between">
              <Text className="text-xs text-ink/60">
                {total
                  ? `${chunkOffset + 1}–${Math.min(chunkOffset + CHUNK_PAGE, total)} of ${total}`
                  : "0 results"}
              </Text>
              {total > CHUNK_PAGE ? (
                <View className="flex-row gap-2">
                  <Pressable
                    className="rounded-md border border-ink/15 px-2 py-1"
                    disabled={chunkOffset === 0}
                    onPress={() =>
                      setChunkOffset(Math.max(chunkOffset - CHUNK_PAGE, 0))
                    }
                  >
                    <Text
                      className={`text-xs font-semibold ${
                        chunkOffset === 0 ? "text-ink/30" : "text-leaf"
                      }`}
                    >
                      Prev
                    </Text>
                  </Pressable>
                  <Pressable
                    className="rounded-md border border-ink/15 px-2 py-1"
                    disabled={chunkOffset + CHUNK_PAGE >= total}
                    onPress={() => setChunkOffset(chunkOffset + CHUNK_PAGE)}
                  >
                    <Text
                      className={`text-xs font-semibold ${
                        chunkOffset + CHUNK_PAGE >= total
                          ? "text-ink/30"
                          : "text-leaf"
                      }`}
                    >
                      Next
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>

            {chunksQuery.isLoading ? (
              <ActivityIndicator className="mt-3" />
            ) : chunkPage?.chunks.length ? (
              <View className="mt-2 gap-2">
                {chunkPage.chunks.map((c, i) => (
                  <View
                    className="rounded-lg border border-ink/10 bg-mist p-3"
                    key={`${c.pmid ?? "mono"}-${i}`}
                  >
                    <View className="flex-row flex-wrap items-center gap-2">
                      <Text className="rounded-md bg-white px-2 py-1 text-xs font-semibold uppercase text-ink/60">
                        {label(c.kind)}
                        {c.sourceType ? ` · ${label(c.sourceType)}` : ""}
                      </Text>
                      {c.section ? (
                        <Text className="text-xs font-semibold text-ink/50">
                          {c.section}
                        </Text>
                      ) : null}
                      {c.pmid ? (
                        <Pressable
                          onPress={() =>
                            void Linking.openURL(
                              `https://pubmed.ncbi.nlm.nih.gov/${c.pmid}/`,
                            )
                          }
                        >
                          <Text className="text-xs font-semibold text-leaf underline">
                            PMID {c.pmid}
                          </Text>
                        </Pressable>
                      ) : null}
                      {c.url ? (
                        <Pressable onPress={() => void Linking.openURL(c.url!)}>
                          <Text className="text-xs font-semibold text-leaf underline">
                            source
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                    <Text className="mt-2 text-sm leading-5 text-ink/70">
                      {c.content}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text className="mt-3 text-sm text-ink/60">
                No chunks{chunkSearch ? " match this search" : ""}.
              </Text>
            )}
          </View>
        </ScrollView>
      </View>
    </>
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
        <IdentifierList identifiers={node.identifiers} />
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

function Stat({ label: statLabel, value }: { label: string; value: number }) {
  return (
    <View className="rounded-lg border border-ink/10 bg-mist px-3 py-2">
      <Text className="text-xs font-semibold uppercase text-ink/50">
        {statLabel}
      </Text>
      <Text className="mt-1 text-lg font-bold text-ink">
        {value.toLocaleString()}
      </Text>
    </View>
  );
}

function MoietyGroupCard({
  group,
  onSelectNode,
  selectedNodeId,
}: {
  group: KgMoietyGroup;
  onSelectNode: (id: string) => void;
  selectedNodeId: string | null;
}) {
  const [open, setOpen] = useState(group.total <= 4);

  return (
    <View className="rounded-lg border border-ink/10 bg-white p-3">
      <Pressable
        accessibilityRole="button"
        className="flex-row flex-wrap items-center gap-2"
        onPress={() => setOpen((o) => !o)}
      >
        <Text className="text-base font-semibold text-ink">
          {group.moiety || "(unnamed)"}
        </Text>
        <Text
          className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
            group.total > 1
              ? "bg-amber-100 text-amber-700"
              : "bg-mist text-ink/60"
          }`}
        >
          {group.total} nodes
        </Text>
        {group.nIngredient ? <Tag>{group.nIngredient} ing</Tag> : null}
        {group.nClass ? <Tag>{group.nClass} class</Tag> : null}
        {group.nProduct ? <Tag>{group.nProduct} product</Tag> : null}
        <Tag>{group.sources.map(shortSource).join(" · ")}</Tag>
        <Text className="text-xs font-semibold uppercase text-leaf">
          {open ? "Hide" : "Show"}
        </Text>
      </Pressable>
      {open ? (
        <View className="mt-2 gap-1">
          {group.members.map((m) => {
            const selected = m.id === selectedNodeId;
            return (
              <Pressable
                accessibilityRole="button"
                className={`flex-row flex-wrap items-center gap-2 rounded-md border px-2 py-1.5 ${
                  selected ? "border-leaf bg-leaf/10" : "border-ink/10 bg-mist"
                }`}
                key={m.id}
                onPress={() => onSelectNode(m.id)}
              >
                <Text className="text-sm text-ink">{m.name}</Text>
                <Tag>{label(m.type)}</Tag>
                <Tag>{m.source}</Tag>
                <Tag>{m.degree} edges</Tag>
                <ChunkBadges chunks={m.chunks} />
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
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
