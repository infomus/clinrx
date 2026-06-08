import { InteractionChecker } from "@/components/InteractionChecker";
import { FeatureShell } from "@/components/FeatureShell";
import { useAuthSession } from "@/hooks/useAuthSession";

export default function InteractionsScreen() {
  const { session } = useAuthSession();

  return (
    <FeatureShell
      description="Deterministic lookup over published graph edges. The app never asks an LLM to decide whether an interaction exists."
      session={session}
      title="Interaction Checker"
    >
      <InteractionChecker />
    </FeatureShell>
  );
}
