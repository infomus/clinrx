import { Redirect } from "expo-router";

import { useAuthSession } from "@/hooks/useAuthSession";

export default function IndexRoute() {
  const { loading, session } = useAuthSession();

  if (loading) {
    return null;
  }

  return <Redirect href={session ? "/interactions" : "/sign-in"} />;
}
