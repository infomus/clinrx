import { useEffect, useState } from "react";

import {
  getCurrentSession,
  onAuthSessionChange,
  type Session,
} from "@clinrx/api";

import { supabase } from "@/lib/supabase";

export function useAuthSession(): {
  loading: boolean;
  session: Session | null;
} {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let active = true;

    getCurrentSession(supabase)
      .then((currentSession) => {
        if (active) {
          setSession(currentSession);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    const unsubscribe = onAuthSessionChange(supabase, (_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return { loading, session };
}
