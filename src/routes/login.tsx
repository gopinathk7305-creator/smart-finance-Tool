import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CircleDollarSign, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const submit = (kind: string) => (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    toast.info(`${kind} is a demo — accounts arrive with the backend.`);
    setTimeout(() => {
      setLoading(false);
      navigate({ to: "/" });
    }, 700);
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
          <h2 className="text-3xl font-bold tracking-tight">
            Every number your board asks for, already calculated.
          </h2>
          <p className="max-w-md text-sm text-primary-foreground/70">
            Upload transactions, payroll and budgets — get P&L, variance, aging and scenario
            forecasts in seconds.
          </p>
          <div className="flex gap-6 text-xs text-primary-foreground/70">
            <span className="flex items-center gap-2">
              <ShieldCheck className="size-4" /> Role-based access
            </span>
            <span className="flex items-center gap-2">
              <Sparkles className="size-4" /> Automated validation
            </span>
          </div>
        </div>
        <p className="text-xs text-primary-foreground/50">FY2026 demo workspace</p>
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
                <form className="space-y-4 pt-4" onSubmit={submit("Login")}>
                  <div className="space-y-2">
                    <Label htmlFor="email">Work email</Label>
                    <Input id="email" type="email" placeholder="you@company.com" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input id="password" type="password" placeholder="••••••••" required />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Signing in…" : "Sign in"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form className="space-y-4 pt-4" onSubmit={submit("Sign up")}>
                  <div className="space-y-2">
                    <Label htmlFor="name">Full name</Label>
                    <Input id="name" placeholder="Aathi K" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email2">Work email</Label>
                    <Input id="email2" type="email" placeholder="you@company.com" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password2">Password</Label>
                    <Input id="password2" type="password" placeholder="••••••••" required />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    Create account
                  </Button>
                </form>
              </TabsContent>
            </Tabs>

            <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => navigate({ to: "/" })}
            >
              Continue with demo data
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
