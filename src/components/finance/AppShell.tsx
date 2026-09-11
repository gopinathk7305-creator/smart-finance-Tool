import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  Calculator,
  ChevronLeft,
  FileText,
  LayoutDashboard,
  LineChart,
  PanelLeft,
  Building2,
  ShieldAlert,
  Target,
  TrendingUp,
  UploadCloud,
  Users,
  Wallet,
  CircleDollarSign,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";
import { alerts } from "@/lib/finance-data";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/users", label: "Users & Activity", icon: Users },
  { to: "/upload", label: "Data Upload", icon: UploadCloud },
  { to: "/payroll", label: "Payroll & Tax", icon: Calculator },
  { to: "/budget", label: "Budget vs Actual", icon: Target },
  { to: "/pnl", label: "Financial Analysis", icon: TrendingUp },
  { to: "/cashflow", label: "Cash Flow & AR/AP", icon: Wallet },
  { to: "/audit", label: "Internal Audit", icon: ShieldAlert },
  { to: "/forecast", label: "Forecasting", icon: LineChart },
  { to: "/reports", label: "Reports & PDF", icon: FileText },
] as const;

export function AppShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, demoMode, signOut, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!loading && !user && !demoMode) void navigate({ to: "/login", replace: true });
  }, [loading, user, demoMode, navigate]);

  const displayName =
    (user?.user_metadata?.["full_name"] as string | undefined) || user?.email?.split("@")[0] || "Demo user";
  const initials = displayName
    .split(/[\s.@]+/)
    .slice(0, 2)
    .map((w: string) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="flex min-h-screen bg-background">
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 md:flex",
          collapsed ? "w-[76px]" : "w-64",
        )}
      >
        <div className="flex h-16 items-center gap-2.5 border-b border-sidebar-border px-5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <CircleDollarSign className="size-5" />
          </span>
          {!collapsed && (
            <span className="text-sm leading-tight font-bold tracking-tight">
              Finance IQ
              <span className="block text-[11px] font-medium text-muted-foreground">
                Intelligence & Planning
              </span>
            </span>
          )}
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-3">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = pathname === to;
            return (
              <Link
                key={to}
                to={to}
                title={label}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground shadow-card"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
                )}
              >
                <Icon className="size-[18px] shrink-0" />
                {!collapsed && <span className="truncate">{label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-muted-foreground"
            onClick={() => setCollapsed((c) => !c)}
          >
            {collapsed ? <PanelLeft className="size-4" /> : <ChevronLeft className="size-4" />}
            {!collapsed && "Collapse"}
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-card/95 px-4 backdrop-blur md:px-6">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold tracking-tight">{title}</h1>
            {subtitle && (
              <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Select value={orgId} onValueChange={setOrgId}>
              <SelectTrigger className="w-[190px] bg-background">
                <Building2 className="size-4 text-muted-foreground" />
                <SelectValue placeholder="Select organization" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All organizations</SelectItem>
                {orgs.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={vendor} onValueChange={setVendor}>
              <SelectTrigger className="hidden w-[170px] bg-background lg:flex">
                <SelectValue placeholder="All vendors" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value={ALL}>All vendors</SelectItem>
                {vendors.map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select defaultValue="ytd">
              <SelectTrigger className="w-[132px] bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="q4">Q4 2026</SelectItem>
                <SelectItem value="ytd">YTD 2026</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="relative bg-background">
                  <Bell className="size-4" />
                  <span className="absolute -top-1.5 -right-1.5 flex size-4.5 items-center justify-center rounded-full bg-danger text-[10px] font-semibold text-danger-foreground">
                    {alerts.length}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel>Financial alerts</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {alerts.map((a) => (
                  <DropdownMenuItem key={a.title} className="flex-col items-start gap-0.5">
                    <span className="text-sm font-medium">{a.title}</span>
                    <span className="text-xs text-muted-foreground">{a.body}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {demoMode && !user && (
              <span className="hidden rounded-full bg-warning-soft px-2.5 py-1 text-[11px] font-semibold text-warning sm:inline">
                Demo mode
              </span>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 px-2">
                  <span className="flex size-8 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand">
                    {initials}
                  </span>
                  <span className="hidden text-left text-xs leading-tight sm:block">
                    {displayName}
                    <span className="block text-muted-foreground">
                      {user ? "Signed in" : "Demo data"}
                    </span>
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{user ? user.email : "Demo session"}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/users">Users &amp; activity</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/upload">Upload data</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={async () => {
                    await queryClient.cancelQueries();
                    queryClient.clear();
                    await signOut();
                    void navigate({ to: "/login", replace: true });
                  }}
                >
                  {user ? "Sign out" : "Exit demo mode"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
