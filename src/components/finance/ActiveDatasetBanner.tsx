import { RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useActiveDataset } from "@/lib/active-dataset";

const fmt = new Intl.NumberFormat("en-IN");

/**
 * Workspace banner: names the dataset currently driving every module and lets
 * the user switch it without leaving the page.
 */
export function ActiveDatasetBanner() {
  const { datasets, active, activeId, setActiveId, syncing } = useActiveDataset();

  const label = active?.file_name ?? "All datasets combined";
  const rows = active?.row_count ?? datasets.reduce((s, d) => s + (d.row_count ?? 0), 0);
  const cols = active?.column_names?.length ?? 0;
  const uploaded = active
    ? new Date(active.created_at).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <Card className="mb-4 border-border shadow-card">
      <CardContent className="flex flex-wrap items-center gap-3 py-4">
        <span className="relative flex size-2.5 shrink-0">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-70" />
          <span className="relative inline-flex size-2.5 rounded-full bg-success" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            Active workspace: <span className="text-brand">{label}</span>
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="font-mono text-[11px]">
              {fmt.format(rows)} rows
            </Badge>
            {cols > 0 && (
              <Badge variant="secondary" className="font-mono text-[11px]">
                {cols} columns
              </Badge>
            )}
            {uploaded && (
              <Badge variant="secondary" className="text-[11px]">
                Uploaded: {uploaded}
              </Badge>
            )}
            {syncing && (
              <Badge className="text-[11px]">
                <RefreshCw className="mr-1 size-3 animate-spin" /> Syncing modules
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <RefreshCw className="size-4 text-muted-foreground" />
          <Select
            value={activeId ?? "__all"}
            onValueChange={(v) => setActiveId(v === "__all" ? null : v)}
          >
            <SelectTrigger className="w-[200px] sm:w-[280px]" aria-label="Switch dataset">
              <SelectValue placeholder="Switch dataset" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All datasets combined</SelectItem>
              {datasets.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.file_name} ({fmt.format(d.row_count ?? 0)} rows)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
