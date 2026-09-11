import { createFileRoute } from "@tanstack/react-router";
import { Activity, ShieldCheck, UserCheck, Users as UsersIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/finance/AppShell";
import { KpiCard } from "@/components/finance/KpiCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { activityLogs, systemUsers, type SystemUser, type UserRole } from "@/lib/enterprise-data";

const DB_ROLE_LABEL: Record<string, UserRole> = {
  admin: "Admin",
  finance_manager: "Finance Manager",
  analyst: "Auditor",
  viewer: "Viewer",
};

export const Route = createFileRoute("/users")({
  head: () => ({
    meta: [
      { title: "User Directory & Activity Logs — Finance IQ" },
      {
        name: "description",
        content:
          "Admin directory of finance users, roles, last login timestamps and a real-time activity audit log.",
      },
      { property: "og:title", content: "User Directory & Activity Logs — Finance IQ" },
      {
        property: "og:description",
        content: "Manage roles, access status and monitor every action taken in the workspace.",
      },
    ],
  }),
  component: UsersPage,
});

const ROLES: UserRole[] = ["Admin", "Finance Manager", "Auditor", "Viewer"];

function UsersPage() {
  const { user } = useAuth();

  const { data: liveUsers } = useQuery({
    queryKey: ["directory", user?.id ?? "anon"],
    enabled: !!user,
    queryFn: async () => {
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      const roleOf = new Map((roles ?? []).map((r) => [r.user_id, r.role as string]));
      return (profiles ?? []).map<SystemUser>((p) => ({
        id: p.id.slice(0, 8),
        name: p.full_name || p.email.split("@")[0] || "Unnamed",
        email: p.email,
        role: DB_ROLE_LABEL[roleOf.get(p.id) ?? "viewer"] ?? "Viewer",
        status: p.status === "suspended" ? "suspended" : "active",
        created_at: p.created_at.slice(0, 10),
        last_login: p.last_login ? p.last_login.slice(0, 16).replace("T", " ") : "—",
        department: p.department || "—",
      }));
    },
  });

  const { data: liveLogs } = useQuery({
    queryKey: ["activity", user?.id ?? "anon"],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("activity_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      return (data ?? []).map((l) => ({
        id: l.id,
        timestamp: l.created_at.slice(0, 16).replace("T", " "),
        email: l.email,
        action: l.action,
        module: l.module,
        device: l.device || "Web",
      }));
    },
  });

  const [rows, setRows] = useState<SystemUser[]>(systemUsers);

  const directory = liveUsers?.length ? liveUsers : rows;
  const logs = liveLogs?.length ? liveLogs : activityLogs;
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<SystemUser | null>(null);
  const [draftRole, setDraftRole] = useState<UserRole>("Viewer");

  const filtered = useMemo(
    () =>
      directory.filter((u) =>
        `${u.name} ${u.email} ${u.role}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [directory, query],
  );

  const save = () => {
    if (!editing) return;
    setRows((r) => r.map((u) => (u.id === editing.id ? { ...u, role: draftRole } : u)));
    toast.success(`${editing.name} is now ${draftRole}`);
    setEditing(null);
  };

  const toggleStatus = (u: SystemUser) => {
    setRows((r) =>
      r.map((x) =>
        x.id === u.id ? { ...x, status: x.status === "active" ? "suspended" : "active" } : x,
      ),
    );
    toast.info(`${u.name} access ${u.status === "active" ? "suspended" : "restored"}`);
  };

  return (
    <AppShell title="User Directory & Activity Logs" subtitle={liveUsers?.length ? "Live accounts from your workspace" : "Sample directory — sign in to see real accounts"}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Registered Users" value={String(directory.length)} icon={UsersIcon} />
        <KpiCard
          label="Active Accounts"
          value={String(directory.filter((u) => u.status === "active").length)}
          icon={UserCheck}
          tone="success"
        />
        <KpiCard
          label="Admins & Auditors"
          value={String(directory.filter((u) => u.role === "Admin" || u.role === "Auditor").length)}
          icon={ShieldCheck}
          tone="warning"
        />
        <KpiCard label="Logged Actions (7d)" value={String(logs.length)} icon={Activity} tone="neutral" />
      </div>

      <Card className="mt-4 border-border shadow-card">
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">All Registered Users</CardTitle>
            <CardDescription>{filtered.length} accounts</CardDescription>
          </div>
          <Input
            placeholder="Search name, email or role"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-64 bg-background"
          />
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User ID</TableHead>
                  <TableHead>Full Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.id}</TableCell>
                    <TableCell>{u.name}</TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{u.role}</Badge>
                    </TableCell>
                    <TableCell>
                      <span
                        className={
                          u.status === "active"
                            ? "text-xs font-semibold text-success"
                            : "text-xs font-semibold text-danger"
                        }
                      >
                        {u.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{u.created_at}</TableCell>
                    <TableCell className="tabular text-muted-foreground">{u.last_login}</TableCell>
                    <TableCell className="space-x-2 text-right whitespace-nowrap">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditing(u);
                          setDraftRole(u.role);
                        }}
                      >
                        Edit role
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => toggleStatus(u)}>
                        {u.status === "active" ? "Suspend" : "Restore"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4 border-border shadow-card">
        <CardHeader>
          <CardTitle className="text-base">Real-time Activity Log</CardTitle>
          <CardDescription>Immutable record of every action performed</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-[420px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Module</TableHead>
                  <TableHead>IP / Device</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="tabular whitespace-nowrap">{l.timestamp}</TableCell>
                    <TableCell className="text-muted-foreground">{l.email}</TableCell>
                    <TableCell>{l.action}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{l.module}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{l.device}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit access</DialogTitle>
            <DialogDescription>{editing?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Assigned role</Label>
            <Select value={draftRole} onValueChange={(v) => setDraftRole(v as UserRole)}>
              <SelectTrigger className="bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={save}>Save changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
