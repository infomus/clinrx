import "../global.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";

import { PowerSyncProvider } from "@/lib/powersync/PowerSyncProvider";

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <PowerSyncProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "#f5f7f4" },
          }}
        />
        <StatusBar style="dark" />
      </PowerSyncProvider>
    </QueryClientProvider>
  );
}
