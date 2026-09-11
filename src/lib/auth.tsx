import type { Session, User } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { supabase } from "@/integrations/supabase/client";

const DEMO_KEY = "financeiq.demo-mode";

interface AuthValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  demoMode: boolean;
  enterDemoMode: () => void;
  exitDemoMode: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue>({
  session: null,
  user: null,
  loading: true,
  demoMode: false,
  enterDemoMode: () => {},
  exitDemoMode: () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(false);

  useEffect(() => {
    setDemoMode(window.localStorage.getItem(DEMO_KEY) === "1");

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const enterDemoMode = useCallback(() => {
    window.localStorage.setItem(DEMO_KEY, "1");
    setDemoMode(true);
  }, []);

  const exitDemoMode = useCallback(() => {
    window.localStorage.removeItem(DEMO_KEY);
    setDemoMode(false);
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    window.localStorage.removeItem(DEMO_KEY);
    setDemoMode(false);
    setSession(null);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      demoMode,
      enterDemoMode,
      exitDemoMode,
      signOut,
    }),
    [session, loading, demoMode, enterDemoMode, exitDemoMode, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

export async function logActivity(action: string, module: string) {
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return;
  await supabase.from("activity_logs").insert({
    user_id: user.id,
    email: user.email ?? "",
    action,
    module,
    device: typeof navigator === "undefined" ? "Web" : navigator.userAgent.slice(0, 80),
  });
}
