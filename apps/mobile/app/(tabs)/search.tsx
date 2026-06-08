import NetInfo from "@react-native-community/netinfo";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { searchCps } from "@clinrx/api";
import type { CpsSearchResult } from "@clinrx/types";

import { FeatureShell } from "@/components/FeatureShell";
import { useAuthSession } from "@/hooks/useAuthSession";
import { supabase } from "@/lib/supabase";

export default function CpsSearchScreen() {
  const { session } = useAuthSession();
  const [draftQuery, setDraftQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");

  const cpsQuery = useQuery({
    enabled: submittedQuery.length >= 2,
    networkMode: "online",
    queryFn: async () => {
      const networkState = await NetInfo.fetch();

      if (networkState.isConnected === false) {
        throw new OnlineConnectionRequiredError();
      }

      return searchCps(supabase, { limit: 8, query: submittedQuery });
    },
    queryKey: ["cps-search", submittedQuery],
  });

  const onlineRequired = cpsQuery.error instanceof OnlineConnectionRequiredError;
  const canSearch = draftQuery.trim().length >= 2 && Boolean(session);

  return (
    <FeatureShell
      description="Search licensed CPS content with cited monograph sections."
      eyebrow="CPS Search"
      session={session}
      title="CPS Search"
    >
      <View className="rounded-lg border border-ink/10 bg-white p-4">
        <TextInput
          autoCapitalize="none"
          className="min-h-12 rounded-lg border border-ink/15 px-4 text-base text-ink"
          onChangeText={setDraftQuery}
          onSubmitEditing={() => {
            if (canSearch) {
              setSubmittedQuery(draftQuery.trim());
            }
          }}
          placeholder="Drug, adverse effect, contraindication..."
          placeholderTextColor="rgba(23, 33, 31, 0.45)"
          returnKeyType="search"
          value={draftQuery}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSearch }}
          className={`mt-3 flex-row items-center justify-center gap-2 rounded-lg px-4 py-3 ${
            canSearch ? "bg-leaf" : "bg-ink/20"
          }`}
          disabled={!canSearch}
          onPress={() => setSubmittedQuery(draftQuery.trim())}
        >
          <Search color="#fff" size={18} />
          <Text className="font-semibold text-white">Search CPS</Text>
        </Pressable>
      </View>

      <View className="mt-5 rounded-lg border border-ink/10 bg-white p-4">
        <Text className="text-base font-semibold text-ink">Results</Text>
        {!session ? (
          <Text className="mt-3 leading-6 text-ink/70">
            Sign in to search licensed CPS content.
          </Text>
        ) : !submittedQuery ? (
          <Text className="mt-3 leading-6 text-ink/70">
            Enter a term to search CPS monographs and product listings.
          </Text>
        ) : cpsQuery.isLoading ? (
          <Text className="mt-3 leading-6 text-ink/70">Searching CPS...</Text>
        ) : onlineRequired ? (
          <Text className="mt-3 leading-6 text-coral">
            Online connection required. CPS search is server-only.
          </Text>
        ) : cpsQuery.isError ? (
          <Text className="mt-3 leading-6 text-coral">
            Could not search CPS. Confirm the search function is deployed.
          </Text>
        ) : cpsQuery.data?.length ? (
          <View className="mt-4 gap-3">
            {cpsQuery.data.map((result) => (
              <CpsResultCard key={result.chunkId} result={result} />
            ))}
          </View>
        ) : (
          <Text className="mt-3 leading-6 text-ink/70">
            No cited CPS result found for "{submittedQuery}".
          </Text>
        )}
      </View>
    </FeatureShell>
  );
}

class OnlineConnectionRequiredError extends Error {
  constructor() {
    super("Online connection required");
    this.name = "OnlineConnectionRequiredError";
  }
}

function CpsResultCard({ result }: { result: CpsSearchResult }) {
  return (
    <View className="rounded-lg border border-ink/10 bg-mist p-4">
      <Text className="text-base font-semibold text-ink">{result.nodeName}</Text>
      <Text className="mt-1 text-sm text-ink/60">
        {result.section ?? "CPS section"}
      </Text>
      <Text className="mt-3 leading-6 text-ink/75">{result.excerpt}</Text>
      <Text className="mt-3 text-xs uppercase text-ink/50">
        CPS cited chunk {result.chunkId.slice(0, 8)}
      </Text>
    </View>
  );
}
