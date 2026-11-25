import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CircleDollarSign, Eye, EyeOff, Lock, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { logActivity, useAuth, transformDjangoUser } from "@/lib/auth";
import { api, setAuthTokens } from "@/services/api";

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string; error_description?: string }) => void;
            error_callback?: (error: { type?: string; message?: string }) => void;
          }) => {
            requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
          };
        };
      };
    };
  }
}

function loadGoogleGsiScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Browser only"));
  if (window.google?.accounts?.oauth2) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      if (window.google?.accounts?.oauth2) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Google Sign-In SDK.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Sign-In SDK."));
    document.head.appendChild(script);
  });
}

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — Finance IQ" },
      {
        name: "description",
        content: "Sign in or create an account to access the Finance IQ planning workspace.",
      },
      { property: "og:title", content: "Sign in — Finance IQ" },
      { property: "og:description", content: "Access your finance intelligence workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { session, enterDemoMode, setSessionUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [acceptTerms, setAcceptTerms] = useState(true);

  useEffect(() => {
    if (session) void navigate({ to: "/" });
  }, [session, navigate]);

  const signIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email")).trim();
    const password = String(form.get("password"));

    setLoading(true);
    setNotice(null);

    try {
      const res = await api.auth.login({ username: email, password });
      setAuthTokens(res.access, rememberMe ? res.refresh : undefined, res.user);
      setSessionUser(transformDjangoUser(res.user));
      await logActivity("Signed in", "Authentication");
      toast.success("Welcome back");
      setLoading(false);
      void navigate({ to: "/" });
    } catch (err: unknown) {
      setLoading(false);
      const msg = err instanceof Error ? err.message : "Invalid credentials";
      if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
        setNotice("Django backend server (127.0.0.1:8000) is unreachable. Use demo mode or start the Django backend.");
        toast.error("Backend unreachable. Please run python manage.py runserver.");
      } else {
        toast.error(msg);
      }
    }
  };

  const signUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name")).trim();
    const org = String(form.get("org") || "").trim();
    const email = String(form.get("email2")).trim();
    const password = String(form.get("password2"));
    const confirmPassword = String(form.get("confirmPassword"));

    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    if (!acceptTerms) {
      toast.error("Please accept the terms and conditions to continue.");
      return;
    }

    setLoading(true);
    setNotice(null);

    try {
      const res = await api.auth.register({ email, password, name, org });
      setAuthTokens(res.access, res.refresh, res.user);
      setSessionUser(transformDjangoUser(res.user));
      await logActivity("Created account", "Authentication");
      toast.success("Account created successfully");
      setLoading(false);
      void navigate({ to: "/" });
    } catch (err: unknown) {
      setLoading(false);
      const msg = err instanceof Error ? err.message : "Registration failed";
      if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
        setNotice("Django backend server (127.0.0.1:8000) is offline. Start the backend with python manage.py runserver.");
        toast.error("Backend server offline.");
      } else {
        toast.error(msg);
      }
    }
  };

  const googleSignIn = async () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      toast.error("Google Client ID is not configured in .env (VITE_GOOGLE_CLIENT_ID).");
      return;
    }

    setLoading(true);
    setNotice(null);

    try {
      await loadGoogleGsiScript();
      const oauth2 = window.google?.accounts?.oauth2;
      if (!oauth2) {
        throw new Error("Google OAuth SDK unavailable.");
      }

      const client = oauth2.initTokenClient({
        client_id: clientId,
        scope: "openid email profile",
        callback: async (tokenResponse) => {
          if (tokenResponse.error || !tokenResponse.access_token) {
            setLoading(false);
            toast.error(tokenResponse.error_description || tokenResponse.error || "Google sign-in was cancelled.");
            return;
          }
          try {
            const res = await api.auth.google({ access_token: tokenResponse.access_token });
            setAuthTokens(res.access, res.refresh, res.user);
            setSessionUser(transformDjangoUser(res.user));
            await logActivity("Signed in with Google", "Authentication");
            toast.success(`Signed in as ${res.user.email}`);
            setLoading(false);
            void navigate({ to: "/" });
          } catch (err: unknown) {
            setLoading(false);
            const msg = err instanceof Error ? err.message : "Google authentication failed on server";
            if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
              setNotice("Django backend server (127.0.0.1:8000) is offline. Start it with python manage.py runserver.");
              toast.error("Backend server offline.");
            } else {
              toast.error(msg);
            }
          }
        },
        error_callback: (err) => {
          setLoading(false);
          if (err.type !== "popup_closed") {
            toast.error(err.message || "Google popup failed to open. Please allow popups for localhost:5173.");
          }
        },
      });

      client.requestAccessToken({ prompt: "select_account" });
    } catch (err: unknown) {
      setLoading(false);
      toast.error(err instanceof Error ? err.message : "Could not initialize Google Sign-In.");
    }
  };

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-2">
      {/* Left Executive Branding Panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[#0B1120] p-12 text-white lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage: "radial-gradient(#3B82F6 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
        <div className="relative z-10 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15 backdrop-blur-md">
            <CircleDollarSign className="size-5 text-white" />
          </span>
          <div>
            <span className="block text-base font-bold tracking-tight">Finance IQ</span>
            <span className="block text-[11px] font-medium text-slate-400">Enterprise Planning</span>
          </div>
        </div>

        <div className="relative z-10 max-w-lg space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300">
            <Lock className="size-3 text-blue-400" />
            <span>SOC-aligned Financial Workspace</span>
          </div>
          <h1 className="text-4xl font-bold leading-[1.15] tracking-tight text-white">
            Every number your board asks for, already calculated.
          </h1>
          <p className="text-base leading-relaxed text-slate-300">
            Upload transactions, payroll, and budgets — get real-time P&amp;L, variance, aging
            schedules, and scenario forecasts with precision.
          </p>
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <ShieldCheck className="mb-2 size-5 text-blue-400" />
              <p className="text-sm font-semibold text-white">Role-based access</p>
              <p className="mt-0.5 text-xs text-slate-400">Tenant-isolated JWT sessions &amp; audit trail</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <Sparkles className="mb-2 size-5 text-emerald-400" />
              <p className="text-sm font-semibold text-white">AI-assisted audit</p>
              <p className="mt-0.5 text-xs text-slate-400">Automated anomaly &amp; compliance checks</p>
            </div>
          </div>
        </div>

        <p className="relative z-10 text-xs text-slate-500">
          FY2026 Intelligence Workspace · Powered by React &amp; Django REST
        </p>
      </div>

      {/* Right Authentication Form Panel */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[430px] animate-apple-enter">
          <div className="mb-6 flex items-center gap-2.5 lg:hidden">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <CircleDollarSign className="size-5" />
            </span>
            <span className="text-base font-bold tracking-tight">Finance IQ</span>
          </div>

          <Card className="border-border/80 shadow-card">
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-2xl font-bold tracking-tight">Welcome back</CardTitle>
              <CardDescription>Sign in to your financial intelligence workspace.</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="login">
                <TabsList className="grid w-full grid-cols-2 rounded-xl p-1">
                  <TabsTrigger value="login" className="rounded-lg text-xs font-semibold sm:text-sm">
                    Login
                  </TabsTrigger>
                  <TabsTrigger value="signup" className="rounded-lg text-xs font-semibold sm:text-sm">
                    Sign up
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="login">
                  <form className="space-y-4 pt-4" onSubmit={signIn}>
                    <div className="space-y-1.5">
                      <Label htmlFor="email">Work email</Label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        placeholder="admin@financeiq.io"
                        className="h-10 rounded-lg"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="password">Password</Label>
                        <button
                          type="button"
                          className="text-xs font-medium text-brand hover:underline"
                          onClick={() =>
                            setNotice(
                              "Need a password reset? Contact your workspace administrator or register a new account under Sign up.",
                            )
                          }
                        >
                          Forgot password?
                        </button>
                      </div>
                      <div className="relative">
                        <Input
                          id="password"
                          name="password"
                          type={showPassword ? "text" : "password"}
                          placeholder="••••••••"
                          className="h-10 rounded-lg pr-10"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                        >
                          {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="remember"
                        checked={rememberMe}
                        onCheckedChange={(checked) => setRememberMe(checked === true)}
                      />
                      <Label htmlFor="remember" className="cursor-pointer text-xs font-normal text-muted-foreground">
                        Keep me signed in on this device
                      </Label>
                    </div>

                    <Button type="submit" className="h-10 w-full rounded-xl font-semibold" disabled={loading}>
                      {loading ? "Signing in…" : "Sign in"}
                    </Button>
                  </form>
                </TabsContent>

                <TabsContent value="signup">
                  <form className="space-y-3.5 pt-4" onSubmit={signUp}>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="name">Full name</Label>
                        <Input id="name" name="name" placeholder="Aathi K" className="h-10 rounded-lg" required />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="org">Organization</Label>
                        <Input id="org" name="org" placeholder="TechCorp Global" className="h-10 rounded-lg" required />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="email2">Work email</Label>
                      <Input
                        id="email2"
                        name="email2"
                        type="email"
                        placeholder="you@company.com"
                        className="h-10 rounded-lg"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="password2">Password</Label>
                      <div className="relative">
                        <Input
                          id="password2"
                          name="password2"
                          type={showSignupPassword ? "text" : "password"}
                          placeholder="At least 6 characters"
                          minLength={6}
                          className="h-10 rounded-lg pr-10"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowSignupPassword((v) => !v)}
                          aria-label={showSignupPassword ? "Hide password" : "Show password"}
                          className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                        >
                          {showSignupPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="confirmPassword">Confirm password</Label>
                      <Input
                        id="confirmPassword"
                        name="confirmPassword"
                        type={showSignupPassword ? "text" : "password"}
                        placeholder="Repeat password"
                        minLength={6}
                        className="h-10 rounded-lg"
                        required
                      />
                    </div>
                    <div className="flex items-start gap-2 pt-0.5">
                      <Checkbox
                        id="terms"
                        checked={acceptTerms}
                        onCheckedChange={(checked) => setAcceptTerms(checked === true)}
                        className="mt-0.5"
                      />
                      <Label htmlFor="terms" className="cursor-pointer text-xs leading-snug font-normal text-muted-foreground">
                        I agree to the workspace Terms of Service and financial data privacy policy.
                      </Label>
                    </div>
                    <Button type="submit" className="h-10 w-full rounded-xl font-semibold" disabled={loading}>
                      {loading ? "Creating…" : "Create account"}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>

              {notice && (
                <div className="mt-4 rounded-xl border border-warning/40 bg-warning-soft/60 p-3 text-xs leading-relaxed text-foreground">
                  {notice}
                </div>
              )}

              <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                <span>or continue with</span>
                <span className="h-px flex-1 bg-border" />
              </div>

              <div className="space-y-2.5">
                <Button
                  variant="outline"
                  className="flex h-10 w-full items-center justify-center gap-2.5 rounded-xl font-medium"
                  onClick={googleSignIn}
                  disabled={loading}
                >
                  <svg className="size-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      fill="#EA4335"
                    />
                  </svg>
                  Continue with Google
                </Button>
                <Button
                  variant="ghost"
                  className="h-9 w-full rounded-xl text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    enterDemoMode();
                    toast.info("Demo mode — sample FY2026 data, nothing is saved.");
                    void navigate({ to: "/" });
                  }}
                >
                  Explore with sample demo data
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
