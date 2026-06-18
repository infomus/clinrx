import { useEffect, useRef } from "react";
import { Platform, Text, View } from "react-native";

import type { KgEdge } from "@clinrx/api";
import type { KgNodeType } from "@clinrx/types";

const CONTAINER_ID = "kg-cy-canvas";

const nodeColor: Record<string, string> = {
  drug: "#2f855a",
  ingredient: "#2b6cb0",
  drug_class: "#6b46c1",
  condition: "#dd6b20",
  symptom: "#dd6b20",
  adverse_effect: "#a0aec0",
  population: "#a0aec0",
};
const severityColor: Record<string, string> = {
  contraindicated: "#e53e3e",
  major: "#dd6b20",
  moderate: "#d69e2e",
  minor: "#ecc94b",
  unknown: "#cbd5e0",
};

export function KgGraphCanvas({
  center,
  edges,
  onSelectNode,
}: {
  center: { id: string; name: string; type: KgNodeType };
  edges: KgEdge[];
  onSelectNode: (id: string) => void;
}) {
  // Keep the latest callback without re-running the build effect on every render.
  const onSelect = useRef(onSelectNode);
  onSelect.current = onSelectNode;

  useEffect(() => {
    if (Platform.OS !== "web") return;

    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let cy: any;

    void (async () => {
      const cytoscape = (await import("cytoscape")).default;
      const el =
        typeof document !== "undefined"
          ? document.getElementById(CONTAINER_ID)
          : null;
      if (cancelled || !el) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nodes = new Map<string, any>();
      nodes.set(center.id, {
        data: { id: center.id, label: center.name, ntype: center.type, center: 1 },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cyEdges: any[] = [];
      for (const e of edges) {
        if (!nodes.has(e.neighborId)) {
          nodes.set(e.neighborId, {
            data: { id: e.neighborId, label: e.neighborName, ntype: e.neighborType },
          });
        }
        const source = e.direction === "out" ? center.id : e.neighborId;
        const target = e.direction === "out" ? e.neighborId : center.id;
        cyEdges.push({
          data: {
            id: e.id,
            source,
            target,
            sev: e.severity ?? "unknown",
            published: e.reviewStatus === "published" ? 1 : 0,
            conf: e.extractionConfidence ?? 0.3,
          },
        });
      }

      cy = cytoscape({
        container: el,
        elements: [...nodes.values(), ...cyEdges],
        style: [
          {
            selector: "node",
            style: {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              "background-color": (ele: any) =>
                nodeColor[ele.data("ntype")] ?? "#718096",
              label: "data(label)",
              "font-size": "10px",
              color: "#1a202c",
              "text-valign": "center",
              "text-halign": "center",
              "text-wrap": "wrap",
              "text-max-width": "90px",
              width: 26,
              height: 26,
            },
          },
          {
            selector: "node[center=1]",
            style: {
              width: 46,
              height: 46,
              "border-width": 3,
              "border-color": "#2f855a",
              "font-size": "12px",
              "font-weight": "bold",
            },
          },
          {
            selector: "edge",
            style: {
              "curve-style": "bezier",
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              "line-color": (ele: any) =>
                severityColor[ele.data("sev")] ?? "#cbd5e0",
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              "target-arrow-color": (ele: any) =>
                severityColor[ele.data("sev")] ?? "#cbd5e0",
              "target-arrow-shape": "triangle",
              "arrow-scale": 0.8,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              width: (ele: any) => 1 + (ele.data("conf") || 0) * 4,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              "line-style": (ele: any) =>
                ele.data("published") ? "solid" : "dashed",
              opacity: 0.85,
            },
          },
        ],
        layout: {
          name: "cose",
          animate: false,
          padding: 24,
          nodeRepulsion: () => 9000,
          idealEdgeLength: () => 90,
          fit: true,
        },
        wheelSensitivity: 0.2,
        minZoom: 0.2,
        maxZoom: 3,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cy.on("tap", "node", (evt: any) => {
        const id = evt.target.id();
        if (id !== center.id) onSelect.current(id);
      });
    })();

    return () => {
      cancelled = true;
      try {
        cy?.destroy?.();
      } catch {
        // ignore teardown errors
      }
    };
  }, [center.id, center.name, center.type, edges]);

  if (Platform.OS !== "web") {
    return (
      <View className="rounded-lg border border-ink/10 bg-white p-4">
        <Text className="text-sm text-ink/60">
          The graph view is available in the web app.
        </Text>
      </View>
    );
  }

  return (
    <View>
      <View
        nativeID={CONTAINER_ID}
        className="rounded-lg border border-ink/10 bg-white"
        style={{ height: 480, width: "100%" }}
      />
      <Text className="mt-2 text-xs leading-5 text-ink/50">
        Tap a node to recenter on it. Node color = type; edge color = severity;
        dashed = not yet published; thicker = higher extraction confidence. Shows
        the currently loaded/filtered edges.
      </Text>
    </View>
  );
}
