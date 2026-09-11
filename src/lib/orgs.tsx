import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  arApRecords,
  budgets,
  payroll,
  transactions,
  type ArApRecord,
  type BudgetTarget,
  type PayrollRecord,
  type Transaction,
} from "@/lib/finance-data";

export const ALL = "all";
const ORG_KEY = "financeiq.org";
const VENDOR_KEY = "financeiq.vendor";

export interface Org {
  id: string;
  name: string;
}

export interface DemoOrg extends Org {
  scale: number;
  vendors: string[];
  clients: string[];
}

export const DEMO_ORGS: DemoOrg[] = [
  {
    id: "demo-techcorp",
    name: "TechCorp Global",
    scale: 1,
    vendors: ["Atlassian", "AWS", "Figma", "Brightline Agency", "Kapoor & Associates"],
    clients: ["Helios Retail", "Orbit Health", "Lumen Media", "Cobalt Labs", "Nimbus Cloud"],
  },
  {
    id: "demo-vertex",
    name: "Vertex Logistics",
    scale: 0.68,
    vendors: ["Northwind Supplies", "Vertex Components", "Airtel Business", "City Power Board", "Prestige Estates"],
    clients: ["Vanta Logistics", "Ferrous Steel Co", "Trident Motors", "Kestrel Tools", "Solstice Travel"],
  },
  {
    id: "demo-apex",
    name: "Apex Retail",
    scale: 0.44,
    vendors: ["Meta Ads", "Google Ads", "Prestige Estates", "Northwind Supplies", "Atlassian"],
    clients: ["Zenith Foods", "Arcadia Realty", "Aurora Textiles", "Pinecrest Edu", "Sable Finance"],
  },
];

export interface DemoDataset {
  txns: Transaction[];
  pays: PayrollRecord[];
  buds: BudgetTarget[];
  araps: ArApRecord[];
}

function scaleAmount(amount: number, scale: number, seed: number) {
  const jitter = 0.9 + ((Math.sin(seed * 12.9898) * 43758.5453) % 1) * 0.2;
  return Math.max(1000, Math.round((amount * scale * Math.abs(jitter)) / 100) * 100);
}

function buildDemoFor(org: DemoOrg): DemoDataset {
  const txns = transactions.map((t, i) => ({
    ...t,
    id: `${org.id}-${t.id}`,
    amount: scaleAmount(t.amount, org.scale, i + 1),
    vendor_client:
      t.type === "income" ? org.clients[i % org.clients.length]! : org.vendors[i % org.vendors.length]!,
  }));

  const headcount = Math.max(6, Math.round(payroll.length * org.scale));
  const pays = payroll.slice(0, headcount).map((p, i) => ({
    ...p,
    id: `${org.id}-${p.id}`,
    basic_pay: scaleAmount(p.basic_pay, 0.6 + org.scale * 0.4, i + 7),
    allowances: scaleAmount(p.allowances, 0.6 + org.scale * 0.4, i + 21),
  }));

  const buds = budgets.map((b, i) => ({
    ...b,
    id: `${org.id}-${b.id}`,
    budgeted_amount: scaleAmount(b.budgeted_amount, org.scale, i + 33),
  }));

  const araps = arApRecords.map((a, i) => ({
    ...a,
    id: `${org.id}-${a.id}`,
    amount: scaleAmount(a.amount, org.scale, i + 55),
    party_name:
      a.type === "AR" ? org.clients[i % org.clients.length]! : org.vendors[i % org.vendors.length]!,
  }));

  return { txns, pays, buds, araps };
}

const DEMO_CACHE = new Map<string, DemoDataset>();

export function demoDatasetFor(orgId: string): DemoDataset {
  if (orgId === ALL) {
    const all = DEMO_ORGS.map((o) => demoDatasetFor(o.id));
    return {
      txns: all.flatMap((d) => d.txns),
      pays: all.flatMap((d) => d.pays),
      buds: all.flatMap((d) => d.buds),
      araps: all.flatMap((d) => d.araps),
    };
  }
  const org = DEMO_ORGS.find((o) => o.id === orgId) ?? DEMO_ORGS[0]!;
  let cached = DEMO_CACHE.get(org.id);
  if (!cached) {
    cached = buildDemoFor(org);
    DEMO_CACHE.set(org.id, cached);
  }
  return cached;
}

interface OrgValue {
  orgs: Org[];
  orgId: string;
  orgName: string;
  vendor: string;
  liveOrgs: boolean;
  setOrgId: (id: string) => void;
  setVendor: (v: string) => void;
  createOrg: (name: string) => Promise<void>;
}

const OrgContext = createContext<OrgValue>({
  orgs: DEMO_ORGS,
  orgId: ALL,
  orgName: "All organizations",
  vendor: ALL,
  liveOrgs: false,
  setOrgId: () => {},
  setVendor: () => {},
  createOrg: async () => {},
});

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [orgId, setOrgIdState] = useState<string>(ALL);
  const [vendor, setVendorState] = useState<string>(ALL);

  useEffect(() => {
    const savedOrg = window.localStorage.getItem(ORG_KEY);
    const savedVendor = window.localStorage.getItem(VENDOR_KEY);
    if (savedOrg) setOrgIdState(savedOrg);
    if (savedVendor) setVendorState(savedVendor);
  }, []);

  const { data: liveOrgRows } = useQuery({
    queryKey: ["organizations", user?.id ?? "anon"],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("organizations").select("id,name").order("name");
      return (data ?? []) as Org[];
    },
  });

  // First sign-in: create the organization captured at signup.
  useEffect(() => {
    if (!user || !liveOrgRows || liveOrgRows.length > 0) return;
    const name =
      (user.user_metadata?.["org_name"] as string | undefined)?.trim() ||
      (user.email?.split("@")[1]?.split(".")[0] ?? "My organization");
    void supabase
      .from("organizations")
      .insert({ user_id: user.id, name })
      .then(() => queryClient.invalidateQueries({ queryKey: ["organizations"] }));
  }, [user, liveOrgRows, queryClient]);

  const liveOrgs = !!liveOrgRows && liveOrgRows.length > 0;
  const orgs = liveOrgs ? liveOrgRows! : DEMO_ORGS.map(({ id, name }) => ({ id, name }));

  const setOrgId = useCallback((id: string) => {
    window.localStorage.setItem(ORG_KEY, id);
    window.localStorage.setItem(VENDOR_KEY, ALL);
    setOrgIdState(id);
    setVendorState(ALL);
  }, []);

  const setVendor = useCallback((v: string) => {
    window.localStorage.setItem(VENDOR_KEY, v);
    setVendorState(v);
  }, []);

  const createOrg = useCallback(
    async (name: string) => {
      if (!user) return;
      const { data } = await supabase
        .from("organizations")
        .insert({ user_id: user.id, name })
        .select("id,name")
        .single();
      await queryClient.invalidateQueries({ queryKey: ["organizations"] });
      if (data) setOrgId(data.id);
    },
    [user, queryClient, setOrgId],
  );

  const value = useMemo<OrgValue>(() => {
    const known = orgs.some((o) => o.id === orgId);
    const effective = known ? orgId : ALL;
    return {
      orgs,
      orgId: effective,
      orgName: orgs.find((o) => o.id === effective)?.name ?? "All organizations",
      vendor,
      liveOrgs,
      setOrgId,
      setVendor,
      createOrg,
    };
  }, [orgs, orgId, vendor, liveOrgs, setOrgId, setVendor, createOrg]);

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export const useOrg = () => useContext(OrgContext);
