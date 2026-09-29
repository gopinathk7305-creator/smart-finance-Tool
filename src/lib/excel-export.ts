import type { ReportSpec } from "@/lib/report-doc";

const safeName = (value: string) => value.replace(/[\\/?*\[\]:]/g, " ").slice(0, 31) || "Report";

export async function downloadReportWorkbook(spec: ReportSpec) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  const summaryRows = [
    ["Finance IQ — Financial Summary"],
    ["Report", spec.reportName],
    ["Entity", spec.org],
    ["Financial year", spec.fy],
    ...(spec.vendor ? [["Vendor / client", spec.vendor]] : []),
    [],
    ["Key metric", "Value", "Context"],
    ...spec.kpis.map((kpi) => [kpi.label, kpi.value, kpi.delta ?? ""]),
  ];
  const summary = XLSX.utils.aoa_to_sheet(summaryRows);
  summary["!cols"] = [{ wch: 28 }, { wch: 24 }, { wch: 42 }];
  XLSX.utils.book_append_sheet(workbook, summary, "Summary");

  spec.tables.forEach((table, index) => {
    const sheet = XLSX.utils.aoa_to_sheet([table.columns, ...table.rows]);
    sheet["!cols"] = table.columns.map((heading, column) => ({
      wch: Math.min(42, Math.max(14, heading.length + 3, ...table.rows.slice(0, 100).map((row) => String(row[column] ?? "").length + 2))),
    }));
    XLSX.utils.book_append_sheet(workbook, sheet, safeName(table.title || `Detail ${index + 1}`));
  });

  const filename = `${spec.reportName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "financial-summary"}.xlsx`;
  XLSX.writeFile(workbook, filename, { compression: true });
}