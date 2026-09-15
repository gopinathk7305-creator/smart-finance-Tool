// Executive-standard PDF document generators (jsPDF + html2canvas).
// Two modes:
//   1. generateReportPdf()      -> formal, word-processor style multi-page document
//   2. generateSnapshotPdf()    -> high-res visual snapshot of the live page

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
  /** chart container captured into the visual snapshot */
  chartEl?: HTMLElement | null;
}

export interface ReportNarrative {
  summary: string;
  takeaways: string[];
}

const NAVY = [15, 23, 42] as const;
const INDIGO = [79, 70, 229] as const;
const SLATE = [100, 116, 139] as const;
const ZEBRA = [248, 250, 252] as const;
const HAIRLINE = [226, 232, 240] as const;

/**
 * jsPDF's built-in Helvetica is WinAnsi encoded and has no glyph for the rupee
 * sign or typographic punctuation — those render as broken, letter-spaced
 * garbage ("¹ 3 . 7 C r"). Normalise every string before it is drawn.
 */
export function pdfSafe(input: unknown): string {
  return String(input ?? "")
    .replace(/\u20B9\s?/g, "INR ")
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/[\u2022\u00B7\u25CF]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/[^\x20-\x7E\n]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function docRefId(page: string) {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `FIQ/${page.toUpperCase()}/${stamp}/${rand}`;
}

export function istNow() {
  return new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: true });
}

function fileSlug(spec: ReportSpec, suffix: string) {
  const slug = spec.reportName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug}-${spec.fy.replace(/\s+/g, "-").toLowerCase()}-${suffix}.pdf`;
}

const GSTIN_DEFAULT = "29AABCT1332L1ZQ";
const ADDRESS_DEFAULT = "Prestige Tech Park, Outer Ring Road, Bengaluru 560103, India";

// ---------------------------------------------------------------------------
// 1. FORMAL EXECUTIVE DOCUMENT
// ---------------------------------------------------------------------------

export async function generateReportPdf(spec: ReportSpec, narrative: ReportNarrative) {
  const { jsPDF } = await import("jspdf");

  const pdf = new jsPDF({ orientation: "p", unit: "pt", format: "a4" });
  pdf.setCharSpace(0);
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const M = 56;
  const BOTTOM = H - 84;
  const ref = docRefId(spec.page);
  let y = M;

  const T = (
    text: unknown,
    x: number,
    ty: number,
    opts?: { align?: "left" | "center" | "right" },
  ) => pdf.text(pdfSafe(text), x, ty, opts);

  const ensure = (need: number) => {
    if (y + need <= BOTTOM) return;
    pdf.addPage();
    y = M;
  };

  const heading = (text: string) => {
    ensure(40);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10.5);
    pdf.setTextColor(...NAVY);
    T(text.toUpperCase(), M, y);
    y += 8;
    pdf.setDrawColor(...HAIRLINE);
    pdf.setLineWidth(0.6);
    pdf.line(M, y, W - M, y);
    y += 18;
  };

  const paragraph = (text: string, size = 10) => {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(size);
    pdf.setTextColor(38, 46, 60);
    const lines = pdf.splitTextToSize(pdfSafe(text), W - M * 2) as string[];
    for (const line of lines) {
      ensure(16);
      T(line, M, y);
      y += 15;
    }
    y += 8;
  };

  // ---- Corporate letterhead ---------------------------------------------
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(17);
  pdf.setTextColor(...NAVY);
  T(spec.org, M, y + 6);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.setTextColor(...SLATE);
  T(`GSTIN: ${spec.gstin ?? GSTIN_DEFAULT}`, M, y + 22);
  T(spec.address ?? ADDRESS_DEFAULT, M, y + 34);
  if (spec.vendor) T(`Entity / Vendor scope: ${spec.vendor}`, M, y + 46);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  T(`Doc Ref: ${ref}`, W - M, y + 6, { align: "right" });
  T(`Date: ${istNow()} IST`, W - M, y + 18, { align: "right" });
  T(`Financial Year: ${spec.fy}`, W - M, y + 30, { align: "right" });

  y += spec.vendor ? 62 : 52;
  pdf.setDrawColor(...NAVY);
  pdf.setLineWidth(1.2);
  pdf.line(M, y, W - M, y);
  y += 30;

  // ---- Title block -------------------------------------------------------
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(15);
  pdf.setTextColor(...NAVY);
  T(spec.reportName, W / 2, y, { align: "center" });
  y += 16;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(...SLATE);
  T("Formal Executive Document - Management Reporting Pack", W / 2, y, { align: "center" });
  y += 30;

  // ---- Narrative summary -------------------------------------------------
  heading("1. Executive Narrative Summary");
  const paras = (narrative.summary || "Narrative unavailable for this run.")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  for (const p of paras) paragraph(p);

  // ---- Takeaways callout -------------------------------------------------
  if (narrative.takeaways.length) {
    const lines = narrative.takeaways.flatMap(
      (t) => pdf.splitTextToSize(pdfSafe(`-  ${t}`), W - M * 2 - 40) as string[],
    );
    const boxH = 34 + lines.length * 13;
    ensure(boxH + 16);
    const top = y;
    pdf.setFillColor(249, 250, 255);
    pdf.rect(M, top, W - M * 2, boxH, "F");
    pdf.setFillColor(...INDIGO);
    pdf.rect(M, top, 3.5, boxH, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(...NAVY);
    T("EXECUTIVE TAKEAWAYS", M + 18, top + 20);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9.5);
    pdf.setTextColor(30, 41, 59);
    lines.forEach((l, i) => T(l, M + 18, top + 36 + i * 13));
    y = top + boxH + 26;
  }

  // ---- Structured tables -------------------------------------------------
  if (spec.tables.length) {
    heading("2. Structured Financial Data");
    for (const table of spec.tables) {
      ensure(70);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.setTextColor(...NAVY);
      T(table.title, M, y);
      y += 14;

      const cols = table.columns.length;
      const tableW = W - M * 2;
      const numericFrom = table.numericFrom ?? cols;
      const labelCols = Math.max(numericFrom, 1);
      const rowH = 19;
      const PAD = 8;
      const BODY_FS = 8.5;

      // measure the widest content in each column so numbers never get clipped
      const need = table.columns.map((c, i) => {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(8);
        let w = pdf.getTextWidth(pdfSafe(c));
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(BODY_FS);
        for (const r of table.rows) w = Math.max(w, pdf.getTextWidth(pdfSafe(r[i])));
        return w + PAD * 2;
      });
      const needed = need.reduce((a, b) => a + b, 0);
      const widths =
        needed <= tableW
          ? need.map((w, i) => (i < labelCols ? w + (tableW - needed) / labelCols : w))
          : need.map((w) => (w / needed) * tableW);
      const xAt = (i: number) => M + widths.slice(0, i).reduce((a, b) => a + b, 0);
      const wAt = (i: number) => widths[i] ?? 0;

      const drawHead = () => {
        pdf.setFillColor(...NAVY);
        pdf.rect(M, y, tableW, rowH, "F");
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(8);
        pdf.setTextColor(255, 255, 255);
        table.columns.forEach((c, i) => {
          const right = i >= labelCols;
          T(c, right ? xAt(i) + wAt(i) - PAD : xAt(i) + PAD, y + 12.5, right ? { align: "right" } : undefined);
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
          pdf.rect(M, y, tableW, rowH, "F");
        }
        pdf.setDrawColor(...HAIRLINE);
        pdf.setLineWidth(0.4);
        pdf.line(M, y + rowH, W - M, y + rowH);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8.5);
        pdf.setTextColor(30, 41, 59);
        r.forEach((cell, i) => {
          const right = i >= labelCols;
          const text = pdfSafe(cell);
          // numeric cells are never truncated (columns are measured to fit)
          const out = right
            ? text
            : ((pdf.splitTextToSize(text, wAt(i) - PAD * 2) as string[])[0] ?? text);
          T(out, right ? xAt(i) + wAt(i) - PAD : xAt(i) + PAD, y + 12.5, right ? { align: "right" } : undefined);
        });
        y += rowH;
      });
      y += 24;
    }
  }

  // ---- Sign-off ----------------------------------------------------------
  ensure(110);
  heading("3. Approval & Sign-off");
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(...SLATE);
  T("Prepared by: AI Finance Engine (Finance IQ)", M, y);
  T("Approved by: Finance Head", W / 2 + 20, y);
  y += 42;
  pdf.setDrawColor(...HAIRLINE);
  pdf.setLineWidth(0.8);
  pdf.line(M, y, M + 170, y);
  pdf.line(W / 2 + 20, y, W / 2 + 190, y);
  y += 13;
  pdf.setFontSize(8);
  T("Authorised Signatory", M, y);
  T("Approved by Finance Head", W / 2 + 20, y);

  // ---- Footer on every page ---------------------------------------------
  const pages = pdf.getNumberOfPages();
  for (let p = 1; p <= pages; p += 1) {
    pdf.setPage(p);
    pdf.setDrawColor(...HAIRLINE);
    pdf.setLineWidth(0.6);
    pdf.line(M, H - 56, W - M, H - 56);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.setTextColor(...SLATE);
    T("Confidential - For internal management use only. Not for external circulation.", M, H - 40);
    T(ref, M, H - 28);
    T(`Page ${p} of ${pages}`, W - M, H - 28, { align: "right" });
  }

  pdf.save(fileSlug(spec, "executive"));
}

// ---------------------------------------------------------------------------
// 2. VISUAL DASHBOARD SNAPSHOT
// ---------------------------------------------------------------------------

/** Crops uniform blank space off the bottom of a captured canvas. */
function trimBottomWhitespace(src: HTMLCanvasElement): HTMLCanvasElement {
  try {
    const ctx = src.getContext("2d", { willReadFrequently: true });
    if (!ctx) return src;
    const { width, height } = src;
    let lastContent = height - 1;
    const step = 2;
    for (let y = height - 1; y >= 0; y -= step) {
      const row = ctx.getImageData(0, y, width, 1).data;
      let dirty = false;
      for (let x = 0; x < row.length; x += 4 * 6) {
        const r = row[x]!;
        const g = row[x + 1]!;
        const b = row[x + 2]!;
        if (r < 246 || g < 246 || b < 246) {
          dirty = true;
          break;
        }
      }
      if (dirty) {
        lastContent = y;
        break;
      }
    }
    const keep = Math.min(height, lastContent + 24);
    if (keep >= height - 4) return src;
    const out = document.createElement("canvas");
    out.width = width;
    out.height = keep;
    const octx = out.getContext("2d");
    if (!octx) return src;
    octx.fillStyle = "#ffffff";
    octx.fillRect(0, 0, width, keep);
    octx.drawImage(src, 0, 0);
    return out;
  } catch {
    return src;
  }
}

export async function generateSnapshotPdf(spec: ReportSpec, el: HTMLElement) {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("html2canvas-pro"),
  ]);

  const canvas = await html2canvas(el, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
    logging: false,
    ignoreElements: (node) => node instanceof HTMLElement && node.dataset["exportHide"] !== undefined,
  });

  // trim trailing blank space so the snapshot doesn't produce an empty last page
  const trimmed = trimBottomWhitespace(canvas);

  const pdf = new jsPDF({ orientation: "p", unit: "pt", format: "a4" });
  pdf.setCharSpace(0);
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const M = 28;
  const HEAD = 74;
  const FOOT = 34;
  const ref = docRefId(spec.page);

  const imgW = W - M * 2;
  const imgH = (trimmed.height * imgW) / trimmed.width;
  const band = H - HEAD - FOOT;
  const img = trimmed.toDataURL("image/jpeg", 0.94);

  const T = (t: unknown, x: number, y: number, opts?: { align?: "left" | "center" | "right" }) =>
    pdf.text(pdfSafe(t), x, y, opts);

  let drawn = 0;
  let page = 0;
  while (drawn < imgH && page < 12) {
    if (page > 0) pdf.addPage();

    pdf.addImage(img, "JPEG", M, HEAD - drawn, imgW, imgH, undefined, "FAST");
    // mask spill outside the drawable band
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, W, HEAD, "F");
    pdf.rect(0, H - FOOT, W, FOOT, "F");

    pdf.setFillColor(...NAVY);
    pdf.rect(0, 0, W, 52, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    T(spec.org, M, 24);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    T(`${spec.reportName} - Visual Dashboard Snapshot`, M, 38);
    T(`${spec.fy}  |  ${istNow()} IST`, W - M, 24, { align: "right" });
    T(`Doc Ref: ${ref}`, W - M, 38, { align: "right" });

    pdf.setDrawColor(...INDIGO);
    pdf.setLineWidth(1.5);
    pdf.line(0, 52, W, 52);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.setTextColor(...SLATE);
    T("Confidential - For internal management use only.", M, H - 14);

    drawn += band;
    page += 1;
    // skip a near-empty trailing page
    if (imgH - drawn < 24) break;
  }

  const pages = pdf.getNumberOfPages();
  for (let p = 1; p <= pages; p += 1) {
    pdf.setPage(p);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.setTextColor(...SLATE);
    T(`Page ${p} of ${pages}`, W - M, H - 14, { align: "right" });
  }

  pdf.save(fileSlug(spec, "snapshot"));
}

/** Deterministic fallback narrative when the AI gateway is unavailable (demo mode). */
export function fallbackNarrative(spec: ReportSpec): ReportNarrative {
  const kpiLine = spec.kpis.map((k) => `${k.label}: ${k.value}`).join("; ");
  return {
    summary: `${spec.reportName} for ${spec.org} covering ${spec.fy}. Headline metrics — ${kpiLine}.\n\n${spec.facts}\n\nThis document was produced without the AI narrative engine (no signed-in session), so the commentary is derived directly from the figures on the page rather than generated analysis. All amounts are in Indian rupees and follow the Indian numbering system.`,
    takeaways: spec.kpis
      .slice(0, 3)
      .map((k) => `${k.label} stands at ${k.value}${k.delta ? ` (${k.delta})` : ""}.`),
  };
}
