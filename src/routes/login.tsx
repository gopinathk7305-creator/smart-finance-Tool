import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CircleDollarSign, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { logActivity, useAuth } from "@/lib/auth";

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
  const { session, enterDemoMode } = useAuth();
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (session) void navigate({ to: "/" });
  }, [session, navigate]);

  const signIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await logActivity("Signed in", "Authentication");
    await supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        void supabase.from("profiles").update({ last_login: new Date().toISOString() }).eq("id", data.user.id);
      }
    });
    toast.success("Welcome back");
    void navigate({ to: "/" });
  };

  const signUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: String(form.get("email")),
      password: String(form.get("password")),
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          full_name: String(form.get("name")),
          org_name: String(form.get("org") || "").trim(),
        },
      },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!data.session) {
      setNotice("Account created — check your email and confirm it to sign in.");
      toast.success("Confirmation email sent");
      return;
    }
    toast.success("Account created");
    void navigate({ to: "/" });
  };

  const googleSignIn = async () => {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Google sign-in failed. Try email instead.");
      return;
    }
    if (result.redirected) return;
    void navigate({ to: "/" });
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-primary p-12 text-primary-foreground lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary-foreground/10">
            <CircleDollarSign className="size-5" />
          </span>
          <span className="font-bold tracking-tight">Finance IQ</span>
        </div>
        <div className="space-y-5">
          <h1 className="text-3xl font-bold tracking-tight">
            Every number your board asks for, already calculated.
          </h1>
          <p className="max-w-md text-sm text-primary-foreground/70">
            Upload transactions, payroll and budgets — get P&amp;L, variance, aging and scenario
            forecasts in seconds.
          </p>
          <div className="flex gap-6 text-xs text-primary-foreground/70">
            <span className="flex items-center gap-2">
              <ShieldCheck className="size-4" /> Role-based access
            </span>
            <span className="flex items-center gap-2">
              <Sparkles className="size-4" /> AI-assisted audit
            </span>
          </div>
        </div>
        <p className="text-xs text-primary-foreground/50">FY2026 workspace</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md border-border shadow-card">
          <CardHeader>
            <CardTitle>Welcome back</CardTitle>
            <CardDescription>Sign in to your finance workspace.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login">
              <TabsList className="w-full">
                <TabsTrigger value="login" className="flex-1">
                  Login
                </TabsTrigger>
                <TabsTrigger value="signup" className="flex-1">
                  Sign up
                </TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form className="space-y-4 pt-4" onSubmit={signIn}>
                  <div className="space-y-2">
                    <Label htmlFor="email">Work email</Label>
                    <Input id="email" name="email" type="email" placeholder="you@company.com" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input id="password" name="password" type="password" placeholder="••••••••" required />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Signing in…" : "Sign in"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form className="space-y-4 pt-4" onSubmit={signUp}>
                  <div className="space-y-2">
                    <Label htmlFor="name">Full name</Label>
                    <Input id="name" name="name" placeholder="Aathi K" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="org">Organization name</Label>
                    <Input id="org" name="org" placeholder="TechCorp Global" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email2">Work email</Label>
                    <Input id="email2" name="email" type="email" placeholder="you@company.com" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password2">Password</Label>
                    <Input
                      id="password2"
                      name="password"
                      type="password"
                      placeholder="At least 6 characters"
                      minLength={6}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Creating…" : "Create account"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>

            {notice && <p className="mt-4 text-sm text-muted-foreground">{notice}</p>}

            <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
            </div>

            <div className="space-y-2">
              <Button variant="outline" className="w-full" onClick={googleSignIn}>
                Continue with Google
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  enterDemoMode();
                  toast.info("Demo mode — sample FY2026 data, nothing is saved.");
                  void navigate({ to: "/" });
                }}
              >
                Continue with demo data
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
