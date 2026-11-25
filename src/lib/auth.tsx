import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  api,
  getAccessToken,
  getStoredUser,
  setAuthTokens,
  clearAuthTokens,
  type UserData,
} from "@/services/api";

const DEMO_KEY = "financeiq.demo-mode";

export interface AuthUser {
  id: string;
  email: string;
  username?: string;
  user_metadata?: {
    full_name?: string;
    org_name?: string;
    avatar_url?: string;
    [key: string]: unknown;
  };
  app_metadata?: {
    provider?: string;
    [key: string]: unknown;
  };
}

export interface AuthSession {
  access_token?: string;
  user: AuthUser;
}

export const GOOGLE_DEMO_USER: AuthUser = {
  id: "demo-google-user",
  email: "alex.chen@financeiq.io",
  user_metadata: {
    full_name: "Alex Chen",
    avatar_url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=face",
    org_name: "TechCorp Global",
  },
  app_metadata: { provider: "google" },
};

export function transformDjangoUser(u: UserData): AuthUser {
  return {
    id: String(u.id),
    email: u.email || u.username,
    username: u.username,
    user_metadata: {
      full_name: u.full_name || `${u.first_name} ${u.last_name}`.trim() || u.username,
      org_name: "TechCorp Global",
      role: u.profile?.role || "admin",
      department: u.profile?.department || "Finance",
    },
    app_metadata: {
      provider: "django_jwt",
    },
  };
}

interface AuthValue {
  session: AuthSession | null;
  user: AuthUser | null;
  loading: boolean;
  demoMode: boolean;
  enterDemoMode: (user?: AuthUser) => void;
  signInWithGoogleDemo: (customUser?: Partial<AuthUser>) => AuthUser;
  exitDemoMode: () => void;
  signOut: () => Promise<void>;
  setSessionUser: (user: AuthUser, access?: string) => void;
}

const AuthContext = createContext<AuthValue>({
  session: null,
  user: null,
  loading: true,
  demoMode: false,
  enterDemoMode: () => {},
  signInWithGoogleDemo: () => GOOGLE_DEMO_USER,
  exitDemoMode: () => {},
  signOut: async () => {},
  setSessionUser: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(false);

  useEffect(() => {
    const isDemo = window.localStorage.getItem(DEMO_KEY) === "1";
    setDemoMode(isDemo);

    const token = getAccessToken();
    const storedUser = getStoredUser();

    if (token) {
      if (storedUser) {
        setUser(transformDjangoUser(storedUser));
        setLoading(false);
      }
      // Re-validate against Django REST API in background
      api.auth
        .profile()
        .then((userData) => {
          setUser(transformDjangoUser(userData));
          setLoading(false);
        })
        .catch(() => {
          // Token expired or server unreachable
          if (!storedUser && !isDemo) {
            clearAuthTokens();
            setUser(null);
          }
          setLoading(false);
        });
    } else {
      if (isDemo) {
        setUser(GOOGLE_DEMO_USER);
      }
      setLoading(false);
    }
  }, []);

  const setSessionUser = useCallback((u: AuthUser, access?: string) => {
    setUser(u);
    setDemoMode(false);
    window.localStorage.removeItem(DEMO_KEY);
  }, []);

  const enterDemoMode = useCallback((demoUser?: AuthUser) => {
    window.localStorage.setItem(DEMO_KEY, "1");
    setDemoMode(true);
    setUser(demoUser || null);
  }, []);

  const signInWithGoogleDemo = useCallback((customUser?: Partial<AuthUser>) => {
    const u: AuthUser = {
      ...GOOGLE_DEMO_USER,
      ...customUser,
      user_metadata: {
        ...GOOGLE_DEMO_USER.user_metadata,
        ...customUser?.user_metadata,
      },
    };
    window.localStorage.setItem(DEMO_KEY, "1");
    setDemoMode(true);
    setUser(u);
    return u;
  }, []);

  const exitDemoMode = useCallback(() => {
    window.localStorage.removeItem(DEMO_KEY);
    setDemoMode(false);
    setUser(null);
  }, []);

  const signOut = useCallback(async () => {
    clearAuthTokens();
    window.localStorage.removeItem(DEMO_KEY);
    setDemoMode(false);
    setUser(null);
  }, []);

  const session = useMemo<AuthSession | null>(
    () => (user ? { user, access_token: getAccessToken() || undefined } : null),
    [user]
  );

  const value = useMemo<AuthValue>(
    () => ({
      session,
      user,
      loading,
      demoMode,
      enterDemoMode,
      signInWithGoogleDemo,
      exitDemoMode,
      signOut,
      setSessionUser,
    }),
    [session, user, loading, demoMode, enterDemoMode, signInWithGoogleDemo, exitDemoMode, signOut, setSessionUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

export async function logActivity(action: string, module: string) {
  try {
    await api.auth.logActivity(
      action,
      module,
      typeof navigator === "undefined" ? "Web" : navigator.userAgent.slice(0, 80)
    );
  } catch {
    // Non-blocking log
  }
}
