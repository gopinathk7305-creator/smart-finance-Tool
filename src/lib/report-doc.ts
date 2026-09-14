// Executive-standard multi-page PDF document generator (jsPDF + html2canvas).

export interface ReportKpi {
  label: string;
  value: string;
  delta?: string;
}

export interface ReportTable {
  title: string;
  columns: string[];
  rows: (string | number)[][];
  /** columns rendered right-aligned (numeric) */
  numericFrom?: number;
}

export interface ReportSpec {
  /** page key used for AI templating */
  page: "dashboard" | "pnl" | "payroll" | "audit" | "forecast" | "reports";
  reportName: string;
  org: string;
  vendor?: string;
  gstin?: string;
  address?: string;
  fy: string;
  kpis: ReportKpi[];
  tables: ReportTable[];
  /** plain-text facts handed to the AI narrative */
  facts: string;
  /** chart container captured into Section 4 */
  chartEl?: HTMLElement | null;
}

export interface ReportNarrative {
  summary: string;
  takeaways: string[];
}

const NAVY = [15, 23, 42] as const;
const SKY = [2, 132, 199] as const;
const SLATE = [100, 116, 139] as const;
const ZEBRA = [241, 245, 249] as const;

export function docRefId(page: string) {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `FIQ/${page.toUpperCase()}/${stamp}/${rand}`;
}

export function istNow() {
  return new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: true });
}

export async function generateReportPdf(spec: ReportSpec, narrative: ReportNarrative) {
  const [{ jsPDF }, html2canvasMod] = await Promise.all([
    import("jspdf"),
    spec.chartEl ? import("html2canvas") : Promise.resolve(null),
  ]);

  const pdf = new jsPDF({ orientation: "p", unit: "pt", format: "a4" });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const M = 40;
  const BOTTOM = H - 56;
  const ref = docRefId(spec.page);
  let y = M;

  const ensure = (need: number) => {
    if (y + need <= BOTTOM) return;
    pdf.addPage();
    y = M;
  };

  const sectionTitle = (text: string) => {
    ensure(34);
    pdf.setFillColor(...SKY);
    pdf.rect(M, y, 3, 14, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.setTextColor(...NAVY);
    pdf.text(text.toUpperCase(), M + 10, y + 11);
    y += 24;
  };

  const body = (text: string, size = 9.5, color: readonly number[] = [40, 48, 62]) => {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(size);
    pdf.setTextColor(color[0]!, color[1]!, color[2]!);
    for (const line of pdf.splitTextToSize(text, W - M * 2) as string[]) {
      ensure(14);
      pdf.text(line, M, y);
      y += 13;
    }
  };

  // ---- Header & branding -------------------------------------------------
  pdf.setFillColor(...NAVY);
  pdf.rect(0, 0, W, 84, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text(spec.org, M, 32);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  const leftLines = [
    spec.vendor ? `Vendor / Entity: ${spec.vendor}` : "Vendor / Entity: All",
    `GSTIN: ${spec.gstin ?? "29AABCT1332L1ZQ"}`,
    spec.address ?? "Prestige Tech Park, Outer Ring Road, Bengaluru 560103, India",
  ];
  leftLines.forEach((l, i) => pdf.text(l, M, 48 + i * 11));

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text(spec.reportName, W - M, 30, { align: "right" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  [`Generated: ${istNow()} IST`, `Financial Year: ${spec.fy}`, `Doc Ref: ${ref}`].forEach((l, i) =>
    pdf.text(l, W - M, 46 + i * 11, { align: "right" }),
  );
  pdf.setDrawColor(...SKY);
  pdf.setLineWidth(1.5);
  pdf.line(0, 84, W, 84);
  y = 108;

  // ---- Section 1: AI executive summary ----------------------------------
  sectionTitle("Section 1 · AI Executive Summary & Key Insights");
  body(narrative.summary || "Narrative unavailable for this run.");
  y += 6;

  if (narrative.takeaways.length) {
    const boxTop = y;
    const lines = narrative.takeaways.flatMap(
      (t) => pdf.splitTextToSize(`•  ${t}`, W - M * 2 - 24) as string[],
    );
    const boxH = 26 + lines.length * 12;
    ensure(boxH + 10);
    pdf.setFillColor(240, 249, 255);
    pdf.setDrawColor(...SKY);
    pdf.setLineWidth(0.6);
    pdf.rect(M, boxTop, W - M * 2, boxH, "FD");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(...NAVY);
    pdf.text("KEY TAKEAWAYS", M + 12, boxTop + 16);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(30, 41, 59);
    lines.forEach((l, i) => pdf.text(l, M + 12, boxTop + 30 + i * 12));
    y = boxTop + boxH + 18;
  }

  // ---- Section 2: KPI grid ----------------------------------------------
  if (spec.kpis.length) {
    sectionTitle("Section 2 · Metrics & KPI Highlights");
    const perRow = 2;
    const gap = 12;
    const cardW = (W - M * 2 - gap * (perRow - 1)) / perRow;
    const cardH = 54;
    spec.kpis.forEach((k, i) => {
      const col = i % perRow;
      if (col === 0) ensure(cardH + gap);
      const x = M + col * (cardW + gap);
      pdf.setFillColor(248, 250, 252);
      pdf.setDrawColor(226, 232, 240);
      pdf.setLineWidth(0.6);
      pdf.rect(x, y, cardW, cardH, "FD");
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(...SLATE);
      pdf.text(k.label.toUpperCase(), x + 10, y + 17);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(14);
      pdf.setTextColor(...NAVY);
      pdf.text(k.value, x + 10, y + 38);
      if (k.delta) {
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.setTextColor(...SKY);
        pdf.text(k.delta, x + cardW - 10, y + 38, { align: "right" });
      }
      if (col === perRow - 1 || i === spec.kpis.length - 1) y += cardH + gap;
    });
    y += 6;
  }

  // ---- Section 3: data tables -------------------------------------------
  if (spec.tables.length) {
    sectionTitle("Section 3 · Structured Data Tables");
    for (const table of spec.tables) {
      ensure(60);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9.5);
      pdf.setTextColor(...NAVY);
      pdf.text(table.title, M, y);
      y += 12;

      const cols = table.columns.length;
      const colW = (W - M * 2) / cols;
      const rowH = 17;
      const numericFrom = table.numericFrom ?? cols;

      const drawHead = () => {
        pdf.setFillColor(...NAVY);
        pdf.rect(M, y, W - M * 2, rowH, "F");
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(8);
        pdf.setTextColor(255, 255, 255);
        table.columns.forEach((c, i) => {
          const right = i >= numericFrom;
          pdf.text(
            String(c),
            right ? M + (i + 1) * colW - 6 : M + i * colW + 6,
            y + 11.5,
            right ? { align: "right" } : undefined,
          );
        });
        y += rowH;
      };

      drawHead();
      table.rows.forEach((r, ri) => {
        if (y + rowH > BOTTOM) {
          pdf.addPage();
          y = M;
          drawHead();
        }
        if (ri % 2 === 1) {
          pdf.setFillColor(...ZEBRA);
          pdf.rect(M, y, W - M * 2, rowH, "F");
        }
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.setTextColor(30, 41, 59);
        r.forEach((cell, i) => {
          const right = i >= numericFrom;
          const text = String(cell ?? "");
          const clipped =
            (pdf.splitTextToSize(text, colW - 12) as string[])[0] ?? text;
          pdf.text(
            clipped,
            right ? M + (i + 1) * colW - 6 : M + i * colW + 6,
            y + 11.5,
            right ? { align: "right" } : undefined,
          );
        });
        y += rowH;
      });
      pdf.setDrawColor(226, 232, 240);
      pdf.line(M, y, W - M, y);
      y += 20;
    }
  }

  // ---- Section 4: charts -------------------------------------------------
  if (spec.chartEl && html2canvasMod) {
    try {
      const html2canvas = html2canvasMod.default;
      const canvas = await html2canvas(spec.chartEl, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
      });
      const img = canvas.toDataURL("image/jpeg", 0.92);
      const imgW = W - M * 2;
      const imgH = (canvas.height * imgW) / canvas.width;
      sectionTitle("Section 4 · Charts & Visual Analytics");
      const usable = BOTTOM - M;
      let drawn = 0;
      let first = true;
      while (drawn < imgH) {
        if (!first) {
          pdf.addPage();
          y = M;
        }
        const avail = BOTTOM - y;
        pdf.addImage(img, "JPEG", M, y - drawn, imgW, imgH, undefined, "FAST");
        // mask anything spilling above/below the drawable band
        pdf.setFillColor(255, 255, 255);
        pdf.rect(0, 0, W, y, "F");
        pdf.rect(0, BOTTOM, W, H - BOTTOM, "F");
        drawn += avail;
        y = BOTTOM;
        first = false;
        if (drawn > usable * 12) break;
      }
      y = BOTTOM;
    } catch {
      // chart capture is best-effort
    }
  }

  // ---- Section 5: footer & sign-off on every page -------------------------
  const pages = pdf.getNumberOfPages();
  for (let p = 1; p <= pages; p += 1) {
    pdf.setPage(p);
    pdf.setDrawColor(226, 232, 240);
    pdf.setLineWidth(0.6);
    pdf.line(M, H - 46, W - M, H - 46);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.setTextColor(...SLATE);
    pdf.text(
      "Confidential - For Internal Management Use Only | Generated via AI Finance Platform",
      M,
      H - 32,
    );
    pdf.text("Prepared by AI Engine | Reviewed by Authorized Signatory", M, H - 22);
    pdf.text(`Page ${p} of ${pages}`, W - M, H - 22, { align: "right" });
    pdf.text(ref, W - M, H - 32, { align: "right" });
  }

  const slug = spec.reportName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  pdf.save(`${slug}-${spec.fy.replace(/\s+/g, "-").toLowerCase()}.pdf`);
}

/** Deterministic fallback narrative when the AI gateway is unavailable (demo mode). */
export function fallbackNarrative(spec: ReportSpec): ReportNarrative {
  const kpiLine = spec.kpis.map((k) => `${k.label}: ${k.value}`).join("; ");
  return {
    summary: `${spec.reportName} for ${spec.org} covering ${spec.fy}. Headline metrics — ${kpiLine}. ${spec.facts}\n\nThis document was produced without the AI narrative engine (no signed-in session), so the commentary below is derived directly from the figures on the page rather than generated analysis. All amounts are in Indian rupees and follow the Indian numbering system.`,
    takeaways: spec.kpis.slice(0, 3).map((k) => `${k.label} stands at ${k.value}${k.delta ? ` (${k.delta})` : ""}.`),
  };
}
