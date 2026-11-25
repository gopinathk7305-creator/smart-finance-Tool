// Threshold editor for the Live Financial Alerts panel.

import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAlertSettings, type AlertSettings } from "@/lib/alert-settings";

const NUMERIC_FIELDS: { key: keyof AlertSettings; label: string; hint: string; suffix: string }[] = [
  {
    key: "expenseSpikePct",
    label: "Unusual expense jump",
    hint: "Alert when a month's expenses rise by this much versus the previous month.",
    suffix: "%",
  },
  {
    key: "concentrationPct",
    label: "Single-category spend share",
    hint: "Alert when one category takes this share of total spend.",
    suffix: "%",
  },
  {
    key: "revenueDropPct",
    label: "Revenue drop",
    hint: "Alert when a month's revenue falls by this much.",
    suffix: "%",
  },
  {
    key: "minMarginPct",
    label: "Minimum net margin",
    hint: "Alert when net margin falls below this figure.",
    suffix: "%",
  },
  {
    key: "healthyMarginPct",
    label: "Healthy net margin",
    hint: "Show a positive alert at or above this margin.",
    suffix: "%",
  },
  {
    key: "cashFloor",
    label: "Cash balance floor",
    hint: "Alert for any month whose closing cash balance falls below this amount.",
    suffix: "₹",
  },
  {
    key: "riskFlagLimit",
    label: "Risk flag tolerance",
    hint: "Alert when the dataset's flagged rows exceed this count.",
    suffix: "rows",
  },
];

export function AlertSettingsDialog() {
  const { settings, update, reset } = useAlertSettings();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <SlidersHorizontal className="size-3.5" />
          Configure
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Alert thresholds</DialogTitle>
          <DialogDescription>
            Set the limits that trigger each alert. Changes apply immediately and are remembered on this device.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {NUMERIC_FIELDS.map((f) => (
            <div key={f.key} className="grid gap-1.5">
              <Label htmlFor={f.key} className="text-sm">
                {f.label} <span className="text-muted-foreground">({f.suffix})</span>
              </Label>
              <Input
                id={f.key}
                type="number"
                value={String(settings[f.key])}
                onChange={(e) => update({ [f.key]: Number(e.target.value) || 0 } as Partial<AlertSettings>)}
              />
              <p className="text-xs text-muted-foreground">{f.hint}</p>
            </div>
          ))}

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">Overdue / unpaid records</p>
              <p className="text-xs text-muted-foreground">Flag rows marked overdue, unpaid or outstanding.</p>
            </div>
            <Switch
              checked={settings.overdueEnabled}
              onCheckedChange={(v) => update({ overdueEnabled: v })}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">Duplicate entries</p>
              <p className="text-xs text-muted-foreground">Flag repeated amounts for the same party.</p>
            </div>
            <Switch
              checked={settings.duplicatesEnabled}
              onCheckedChange={(v) => update({ duplicatesEnabled: v })}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" size="sm" onClick={reset}>
            Restore defaults
          </Button>
          <Button size="sm" onClick={() => setOpen(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
