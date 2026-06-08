import { describe, expect, it } from "vitest";

import {
  checkInteractions,
  type InteractionGraphRepository,
} from "./index.js";

const repository: InteractionGraphRepository = {
  async getInteractionLookupScope(nodeId) {
    const scopes: Record<string, string[]> = {
      warfarin: ["anticoagulants"],
      ibuprofen: ["nsaids"],
      amoxicillin: ["penicillins"],
    };

    return scopes[nodeId] ?? [];
  },
  async findPublishedInteractionsBetweenScopes(leftScope, rightScope) {
    const hasWarfarinNsaid =
      leftScope.includes("anticoagulants") && rightScope.includes("nsaids");
    const hasNsaidWarfarin =
      leftScope.includes("nsaids") && rightScope.includes("anticoagulants");

    if (!hasWarfarinNsaid && !hasNsaidWarfarin) {
      return [];
    }

    return [
      {
        leftNodeId: "anticoagulants",
        rightNodeId: "nsaids",
        interaction: {
          id: "edge-1",
          sourceId: "anticoagulants",
          targetId: "nsaids",
          severity: "major",
          mechanism: "Increased bleeding risk.",
          management: "Monitor closely and consider alternatives.",
          evidenceLevel: "label",
          citations: [{ pmid: "example", title: "Seed citation" }],
          source: "manual",
        },
      },
    ];
  },
};

describe("checkInteractions", () => {
  it("finds class-level interactions for a drug pair", async () => {
    await expect(
      checkInteractions(["warfarin", "ibuprofen"], repository),
    ).resolves.toEqual([
      expect.objectContaining({
        inputPair: ["warfarin", "ibuprofen"],
        matchedVia: {
          leftNodeId: "anticoagulants",
          rightNodeId: "nsaids",
        },
      }),
    ]);
  });

  it("does not produce a false safe claim when no edge is found", async () => {
    await expect(
      checkInteractions(["warfarin", "amoxicillin"], repository),
    ).resolves.toEqual([]);
  });
});
