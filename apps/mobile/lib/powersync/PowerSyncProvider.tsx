import { createContext, useContext, useEffect, useMemo, useState } from "react";

import {
  connectPowerSync,
  disconnectAndClearPowerSync,
  getPowerSyncDatabase,
  getPowerSyncEndpoint,
  isPowerSyncSupported,
} from "@/lib/powersync/system";
import { supabase } from "@/lib/supabase";

export type PowerSyncConnectionState =
  | "unsupported"
  | "signed_out"
  | "connecting"
  | "connected"
  | "error";

interface PowerSyncStatus {
  endpoint: string | null;
  errorMessage?: string;
  hasSynced: boolean;
  lastSyncedAt?: string;
  state: PowerSyncConnectionState;
  supported: boolean;
}

const initialStatus: PowerSyncStatus = {
  endpoint: getPowerSyncEndpoint(),
  hasSynced: false,
  state: isPowerSyncSupported() ? "signed_out" : "unsupported",
  supported: isPowerSyncSupported(),
};

const PowerSyncContext = createContext<PowerSyncStatus>(initialStatus);

export function PowerSyncProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [status, setStatus] = useState<PowerSyncStatus>(initialStatus);

  useEffect(() => {
    if (!isPowerSyncSupported()) {
      setStatus(initialStatus);
      return;
    }

    let active = true;
    let unregisterStatusListener: (() => void) | undefined;

    const markError = (error: unknown) => {
      if (!active) {
        return;
      }

      setStatus((current) => ({
        ...current,
        errorMessage:
          error instanceof Error ? error.message : "PowerSync failed",
        state: "error",
      }));
    };

    const start = async () => {
      try {
        const database = await getPowerSyncDatabase();

        if (!active || !database) {
          return;
        }

        unregisterStatusListener = database.registerListener({
          statusChanged: (nextStatus) => {
            if (!active) {
              return;
            }

            setStatus((current) => ({
              ...current,
              errorMessage:
                nextStatus.dataFlowStatus.downloadError?.message ??
                nextStatus.dataFlowStatus.uploadError?.message,
              hasSynced: nextStatus.hasSynced === true,
              lastSyncedAt: nextStatus.lastSyncedAt?.toISOString(),
              state: nextStatus.connected ? "connected" : current.state,
            }));
          },
        });

        const { data, error } = await supabase.auth.getSession();

        if (error) {
          throw error;
        }

        if (data.session) {
          setStatus((current) => ({ ...current, state: "connecting" }));
          await connectPowerSync();
        } else {
          setStatus((current) => ({ ...current, state: "signed_out" }));
        }
      } catch (error) {
        markError(error);
      }
    };

    void start();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setStatus((current) => ({ ...current, state: "connecting" }));
        void connectPowerSync().catch(markError);
      } else {
        void disconnectAndClearPowerSync()
          .then(() => {
            if (active) {
              setStatus((current) => ({
                ...current,
                errorMessage: undefined,
                hasSynced: false,
                lastSyncedAt: undefined,
                state: "signed_out",
              }));
            }
          })
          .catch(markError);
      }
    });

    return () => {
      active = false;
      unregisterStatusListener?.();
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(() => status, [status]);

  return (
    <PowerSyncContext.Provider value={value}>
      {children}
    </PowerSyncContext.Provider>
  );
}

export function usePowerSyncStatus(): PowerSyncStatus {
  return useContext(PowerSyncContext);
}
