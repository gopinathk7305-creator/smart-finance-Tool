import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ArrowRightLeft,
  Bell,
  CalendarRange,
  Calculator,
  ChevronLeft,
  FileText,
  LayoutDashboard,
  LineChart,
  Menu,
  PanelLeft,
  Scale,
  Search,
  ShieldAlert,
  ShieldCheck,
  Target,
  RefreshCw,
  TrendingUp,
  UploadCloud,
  Users,
  Wallet,
  CircleDollarSign,
  FolderOpen,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useActiveDataset } from "@/lib/active-dataset";

import { AiInsightsDock } from "@/components/finance/AiInsightsDock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { fiscalYearStart, fyLabel, useWorkspace, type RangePreset } from "@/lib/workspace";
import { useDatasetPeek } from "@/lib/dataset";
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
import { ALL } from "@/lib/orgs";
import { alerts } from "@/lib/finance-data";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, group: "Overview" },
  { to: "/pnl", label: "Financial Analysis", icon: TrendingUp, group: "Core Finance" },
  { to: "/cashflow", label: "Cash Flow & AR/AP", icon: Wallet, group: "Core Finance" },
  { to: "/budget", label: "Budget vs Actual", icon: Target, group: "Core Finance" },
  { to: "/balance-sheet", label: "Balance Sheet", icon: Scale, group: "Core Finance" },
  { to: "/payroll", label: "Payroll & Tax", icon: Calculator, group: "Operations" },
  { to: "/forecast", label: "Forecasting", icon: LineChart, group: "Planning" },
  { to: "/compare", label: "Compare Datasets", icon: ArrowRightLeft, group: "Planning" },
  { to: "/audit", label: "Internal Audit", icon: ShieldAlert, group: "Governance" },
  { to: "/compliance", label: "Compliance & Filings", icon: ShieldCheck, group: "Governance" },
  { to: "/reports", label: "Reports & PDF", icon: FileText, group: "Governance" },
  { to: "/upload", label: "Data Upload", icon: UploadCloud, group: "Workspace" },
  { to: "/users", label: "Users & Activity", icon: Users, group: "Workspace" },
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, demoMode, signOut, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { datasets, activeId, setActiveId, active } = useActiveDataset();
  const { preset, custom, range, setPreset, setCustom, resetRange } = useWorkspace();
  const { outOfRange } = useDatasetPeek();
  const [refreshing, setRefreshing] = useState(false);
  const fy = fiscalYearStart();

  const handleRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries();
    toast.success("Dashboard refreshed with latest dataset metrics.");
    window.setTimeout(() => setRefreshing(false), 800);
  };

  useEffect(() => {
    if (!loading && !user && !demoMode) void navigate({ to: "/login", replace: true });
  }, [loading, user, demoMode, navigate]);

  // Global Cmd+K / Ctrl+K quick jump
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const displayName =
    (user?.user_metadata?.["full_name"] as string | undefined) || user?.email?.split("@")[0] || "Demo user";
  const initials = displayName
    .split(/[\s.@]+/)
    .slice(0, 2)
    .map((w: string) => w[0]?.toUpperCase() ?? "")
    .join("");

  const renderNavLinks = (isCollapsed: boolean, onSelect?: () => void) => (
    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-3" aria-label="Primary navigation">
      {NAV.map(({ to, label, icon: Icon }) => {
        const isActive = pathname === to;
        return (
          <Link
            key={to}
            to={to}
            preload="intent"
            title={label}
            onClick={onSelect}
            className={cn(
              "group flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] font-medium transition-all duration-150 ease-out",
              isActive
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
            )}
          >
            <Icon
              className={cn(
                "size-[17px] shrink-0 transition-transform duration-150",
                !isActive && "group-hover:scale-105",
              )}
              strokeWidth={isActive ? 2.1 : 1.75}
            />
            {!isCollapsed && <span className="truncate">{label}</span>}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop Collapsible Sidebar */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] md:flex",
          collapsed ? "w-[74px]" : "w-64",
        )}
      >
        <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xs">
            <CircleDollarSign className="size-5" />
          </span>
          {!collapsed && (
            <span className="min-w-0 text-sm leading-tight font-bold tracking-tight">
              Finance IQ
              <span className="block truncate text-[11px] font-medium text-muted-foreground">
                Intelligence &amp; Planning
              </span>
            </span>
          )}
        </div>

        {renderNavLinks(collapsed)}

        <div className="shrink-0 border-t border-sidebar-border p-3">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "w-full gap-2 rounded-xl text-muted-foreground hover:text-foreground",
              collapsed ? "justify-center px-0" : "justify-start",
            )}
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeft className="size-4" /> : <ChevronLeft className="size-4" />}
            {!collapsed && <span className="text-xs font-medium">Collapse sidebar</span>}
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Frosted Apple-Style Header */}
        <header className="glass sticky top-0 z-20 flex h-16 items-center gap-2.5 border-b border-border/80 px-4 md:px-6">
          {/* Mobile Navigation Drawer Trigger */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 md:hidden"
                aria-label="Open navigation menu"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex w-72 flex-col p-0">
              <SheetHeader className="flex h-16 flex-row items-center gap-2.5 border-b border-border px-5 py-0 text-left">
                <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                  <CircleDollarSign className="size-5" />
                </span>
                <div className="min-w-0">
                  <SheetTitle className="text-sm font-bold tracking-tight">Finance IQ</SheetTitle>
                  <p className="text-[11px] font-medium text-muted-foreground">
                    Intelligence &amp; Planning
                  </p>
                </div>
              </SheetHeader>
              {renderNavLinks(false, () => setMobileOpen(false))}
            </SheetContent>
          </Sheet>

          <div className="min-w-0 flex-1 md:flex-initial">
            <h1 className="truncate text-[15px] font-semibold tracking-tight text-foreground sm:text-base">
              {title}
            </h1>
            {subtitle && (
              <p className="hidden truncate text-xs text-muted-foreground sm:block">{subtitle}</p>
            )}
          </div>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            {/* Global Search / Command Palette */}
            <Button
              variant="outline"
              size="sm"
              className="hidden h-9 gap-2 border-border/80 bg-card/80 px-3 text-muted-foreground hover:text-foreground xl:flex"
              onClick={() => setSearchOpen(true)}
            >
              <Search className="size-3.5" />
              <span className="text-xs font-normal">Quick jump…</span>
              <kbd className="pointer-events-none ml-2 inline-flex h-5 items-center rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                ⌘K
              </kbd>
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 border-border/80 bg-card/80 xl:hidden"
              onClick={() => setSearchOpen(true)}
              aria-label="Quick search"
            >
              <Search className="size-4 text-muted-foreground" />
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-2 border-border/80 bg-card/80 font-medium"
              disabled={refreshing}
              title="Refresh Page & Recalculate Metrics"
              onClick={handleRefresh}
            >
              <RefreshCw className={cn("size-3.5 text-brand", refreshing && "animate-spin")} />
              <span className="hidden lg:inline">Refresh</span>
            </Button>

            <Select value={preset} onValueChange={(v) => setPreset(v as RangePreset)}>
              <SelectTrigger className="h-9 w-[124px] rounded-lg border-border/80 bg-card/80 text-xs font-medium sm:w-[165px] sm:text-sm">
                <CalendarRange className="size-3.5 shrink-0 text-brand" />
                <SelectValue placeholder="Date range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="fy-current">{fyLabel(fy)}</SelectItem>
                <SelectItem value="fy-previous">{fyLabel(fy - 1)}</SelectItem>
                <SelectItem value="ytd">YTD {fyLabel(fy)}</SelectItem>
                <SelectItem value="q1">Q1 (Apr–Jun)</SelectItem>
                <SelectItem value="q2">Q2 (Jul–Sep)</SelectItem>
                <SelectItem value="q3">Q3 (Oct–Dec)</SelectItem>
                <SelectItem value="q4">Q4 (Jan–Mar)</SelectItem>
                <SelectItem value="custom">Custom date range</SelectItem>
              </SelectContent>
            </Select>

            {preset === "custom" && (
              <div className="hidden items-center gap-1 2xl:flex">
                <Input
                  type="date"
                  value={custom.start}
                  onChange={(e) => setCustom({ ...custom, start: e.target.value })}
                  className="h-9 w-[132px] rounded-lg"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <Input
                  type="date"
                  value={custom.end}
                  onChange={(e) => setCustom({ ...custom, end: e.target.value })}
                  className="h-9 w-[132px] rounded-lg"
                />
              </div>
            )}

            <Select
              value={activeId ?? ALL}
              onValueChange={(v) => {
                const id = v === ALL ? null : v;
                setActiveId(id);
                const name = datasets.find((d) => d.id === id)?.file_name;
                toast.success("Dataset switched successfully. Modules will sync on view.", {
                  description: id ? name : "Using every stored dataset",
                });
              }}
            >
              <SelectTrigger className="hidden h-9 w-[170px] rounded-lg border-brand/25 bg-brand-soft/50 text-xs font-medium sm:flex sm:text-sm lg:w-[230px]">
                <FolderOpen className="size-3.5 shrink-0 text-brand" />
                <SelectValue placeholder="Active dataset" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value={ALL}>All datasets combined</SelectItem>
                {datasets.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.file_name} ({d.row_count.toLocaleString("en-IN")} rows)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="relative h-9 w-9 border-border/80 bg-card/80"
                  aria-label="Financial notifications"
                >
                  <Bell className="size-4" />
                  <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-danger text-[10px] font-semibold text-danger-foreground ring-2 ring-card">
                    {alerts.length}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 rounded-xl">
                <DropdownMenuLabel>Financial alerts</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {alerts.map((a) => (
                  <DropdownMenuItem key={a.title} className="flex-col items-start gap-0.5 py-2.5">
                    <span className="text-sm font-medium">{a.title}</span>
                    <span className="text-xs text-muted-foreground">{a.body}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {demoMode && !user && (
              <span className="hidden rounded-full bg-warning-soft px-2.5 py-1 text-[11px] font-semibold text-warning xl:inline">
                Demo mode
              </span>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-9 gap-2 rounded-full px-1.5 sm:px-2.5">
                  <span className="flex size-7 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand ring-1 ring-brand/15">
                    {initials}
                  </span>
                  <span className="hidden text-left text-xs leading-tight sm:block">
                    <span className="font-medium text-foreground">{displayName}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {user ? "Signed in" : "Demo data"}
                    </span>
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-xl">
                <DropdownMenuLabel className="font-normal">
                  <p className="text-xs font-semibold text-foreground">{displayName}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {user ? user.email : "Demo session"}
                  </p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/users">Users &amp; activity</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/upload">Upload data</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-danger focus:text-danger"
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

        <main data-page-capture className="mx-auto w-full max-w-[1600px] flex-1 p-4 md:p-6 lg:p-8">
          {outOfRange && (
            <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-warning/40 bg-warning-soft/70 px-4 py-3">
              <CalendarRange className="size-4 text-warning" />
              <p className="text-sm font-medium text-foreground">
                No records found for {range.label}
                {active ? ` in ${active.file_name}` : ""}.
              </p>
              <Button size="sm" variant="outline" className="ml-auto" onClick={resetRange}>
                Reset date filter
              </Button>
            </div>
          )}
          <div key={pathname} className="animate-apple-enter">
            {children}
          </div>
        </main>
        <AiInsightsDock />
      </div>

      {/* Global Command Palette (⌘K) */}
      <CommandDialog open={searchOpen} onOpenChange={setSearchOpen}>
        <CommandInput placeholder="Jump to any page or dataset…" />
        <CommandList>
          <CommandEmpty>No matching page or dataset found.</CommandEmpty>
          <CommandGroup heading="Workspace Modules">
            {NAV.map(({ to, label, icon: Icon }) => (
              <CommandItem
                key={to}
                value={label}
                onSelect={() => {
                  setSearchOpen(false);
                  void navigate({ to });
                }}
              >
                <Icon className="mr-2 size-4 text-muted-foreground" />
                <span>{label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          {datasets.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Switch Active Dataset">
                <CommandItem
                  value="All datasets combined"
                  onSelect={() => {
                    setActiveId(null);
                    setSearchOpen(false);
                    toast.success("Switched to all datasets combined");
                  }}
                >
                  <FolderOpen className="mr-2 size-4 text-brand" />
                  <span>All datasets combined</span>
                </CommandItem>
                {datasets.map((d) => (
                  <CommandItem
                    key={d.id}
                    value={d.file_name}
                    onSelect={() => {
                      setActiveId(d.id);
                      setSearchOpen(false);
                      toast.success(`Switched to ${d.file_name}`);
                    }}
                  >
                    <FolderOpen className="mr-2 size-4 text-muted-foreground" />
                    <span className="truncate">{d.file_name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </div>
  );
}
