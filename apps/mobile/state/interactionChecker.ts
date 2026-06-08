import { create } from "zustand";

interface InteractionCheckerState {
  selectedNodeIds: string[];
  toggleNodeId: (nodeId: string) => void;
}

export const useInteractionCheckerStore = create<InteractionCheckerState>(
  (set) => ({
    selectedNodeIds: [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ],
    toggleNodeId: (nodeId) =>
      set((state) => ({
        selectedNodeIds: state.selectedNodeIds.includes(nodeId)
          ? state.selectedNodeIds.filter((selected) => selected !== nodeId)
          : [...state.selectedNodeIds, nodeId],
      })),
  }),
);
