import type { InteractionRecord, InteractionResult } from "@clinrx/types";

export interface InteractionGraphRepository {
  getInteractionLookupScope(nodeId: string): Promise<readonly string[]>;
  findPublishedInteractionsBetweenScopes(
    leftScope: readonly string[],
    rightScope: readonly string[],
  ): Promise<readonly InteractionScopeMatch[]>;
}

export interface InteractionScopeMatch {
  leftNodeId: string;
  rightNodeId: string;
  interaction: InteractionRecord;
}

export async function checkInteractions(
  nodeIds: readonly string[],
  repository: InteractionGraphRepository,
): Promise<InteractionResult[]> {
  const uniqueNodeIds = Array.from(new Set(nodeIds));

  if (uniqueNodeIds.length < 2) {
    return [];
  }

  const scopes = new Map<string, readonly string[]>();

  await Promise.all(
    uniqueNodeIds.map(async (nodeId) => {
      const scope = await repository.getInteractionLookupScope(nodeId);
      scopes.set(nodeId, uniqueScope([nodeId, ...scope]));
    }),
  );

  const results: InteractionResult[] = [];
  const seenInteractionIds = new Set<string>();

  for (let i = 0; i < uniqueNodeIds.length; i += 1) {
    for (let j = i + 1; j < uniqueNodeIds.length; j += 1) {
      const leftInputId = uniqueNodeIds[i];
      const rightInputId = uniqueNodeIds[j];

      if (!leftInputId || !rightInputId) {
        continue;
      }

      const matches = await repository.findPublishedInteractionsBetweenScopes(
        scopes.get(leftInputId) ?? [leftInputId],
        scopes.get(rightInputId) ?? [rightInputId],
      );

      for (const match of matches) {
        const resultKey = `${leftInputId}:${rightInputId}:${match.interaction.id}`;

        if (seenInteractionIds.has(resultKey)) {
          continue;
        }

        seenInteractionIds.add(resultKey);
        results.push({
          inputPair: [leftInputId, rightInputId],
          matchedVia: {
            leftNodeId: match.leftNodeId,
            rightNodeId: match.rightNodeId,
          },
          interaction: match.interaction,
        });
      }
    }
  }

  return sortBySeverity(results);
}

function uniqueScope(nodeIds: readonly string[]): readonly string[] {
  return Array.from(new Set(nodeIds));
}

const severityRank = {
  contraindicated: 0,
  major: 1,
  moderate: 2,
  minor: 3,
  unknown: 4,
} as const;

const actionCategoryRank = {
  avoid_combination: 0,
  consider_therapy_modification: 1,
  monitor_therapy: 2,
  no_action_needed: 3,
  no_known_interaction: 4,
} as const;

function sortBySeverity(results: InteractionResult[]): InteractionResult[] {
  return [...results].sort(
    (left, right) => getInteractionRank(left) - getInteractionRank(right),
  );
}

function getInteractionRank(result: InteractionResult): number {
  const actionCategory = result.interaction.actionCategory;

  if (actionCategory) {
    return actionCategoryRank[actionCategory];
  }

  return severityRank[result.interaction.severity];
}
