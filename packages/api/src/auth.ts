import type {
  AuthChangeEvent,
  Session,
  SupabaseClient,
  User,
} from "@supabase/supabase-js";

export type { AuthChangeEvent, Session, User };

export async function sendMagicLink(
  client: SupabaseClient,
  email: string,
  redirectTo: string,
): Promise<void> {
  const { error } = await client.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo,
      shouldCreateUser: true,
    },
  });

  if (error) {
    throw error;
  }
}

export async function getCurrentSession(
  client: SupabaseClient,
): Promise<Session | null> {
  const {
    data: { session },
    error,
  } = await client.auth.getSession();

  if (error) {
    throw error;
  }

  return session;
}

export function onAuthSessionChange(
  client: SupabaseClient,
  callback: (event: AuthChangeEvent, session: Session | null) => void,
): () => void {
  const {
    data: { subscription },
  } = client.auth.onAuthStateChange(callback);

  return () => subscription.unsubscribe();
}

export async function signOut(client: SupabaseClient): Promise<void> {
  const { error } = await client.auth.signOut();

  if (error) {
    throw error;
  }
}

export async function completeAuthRedirect(
  client: SupabaseClient,
  url: string,
): Promise<Session | null> {
  const parsed = parseAuthRedirectUrl(url);

  if (parsed.errorDescription) {
    throw new Error(parsed.errorDescription);
  }

  if (parsed.code) {
    const {
      data: { session },
      error,
    } = await client.auth.exchangeCodeForSession(parsed.code);

    if (error) {
      throw error;
    }

    return session;
  }

  if (parsed.accessToken && parsed.refreshToken) {
    const {
      data: { session },
      error,
    } = await client.auth.setSession({
      access_token: parsed.accessToken,
      refresh_token: parsed.refreshToken,
    });

    if (error) {
      throw error;
    }

    return session;
  }

  return getCurrentSession(client);
}

function parseAuthRedirectUrl(url: string): {
  accessToken?: string;
  code?: string;
  errorDescription?: string;
  refreshToken?: string;
} {
  const [urlWithoutHash = url, hash = ""] = url.split("#");
  const queryParams = new URL(urlWithoutHash).searchParams;
  const hashParams = new URLSearchParams(hash);
  const result: {
    accessToken?: string;
    code?: string;
    errorDescription?: string;
    refreshToken?: string;
  } = {};

  const accessToken =
    queryParams.get("access_token") ?? hashParams.get("access_token");
  const code = queryParams.get("code") ?? hashParams.get("code");
  const errorDescription =
    queryParams.get("error_description") ??
    hashParams.get("error_description");
  const refreshToken =
    queryParams.get("refresh_token") ?? hashParams.get("refresh_token");

  if (accessToken) {
    result.accessToken = accessToken;
  }
  if (code) {
    result.code = code;
  }
  if (errorDescription) {
    result.errorDescription = errorDescription;
  }
  if (refreshToken) {
    result.refreshToken = refreshToken;
  }

  return result;
}
