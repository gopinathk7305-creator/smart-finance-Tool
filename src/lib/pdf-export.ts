// Browser-side HTML → multi-page PDF using html2canvas + jsPDF.

export async function exportElementToPdf(el: HTMLElement, filename: string, title: string) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const canvas = await html2canvas(el, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
    logging: false,
  });

  const pdf = new jsPDF({ orientation: "p", unit: "pt", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 32;
  const headerH = 64;

  const imgW = pageW - margin * 2;
  const imgH = (canvas.height * imgW) / canvas.width;
  const usableH = pageH - headerH - margin;
  const img = canvas.toDataURL("image/jpeg", 0.95);

  let rendered = 0;
  let page = 0;
  while (rendered < imgH) {
    if (page > 0) pdf.addPage();
    pdf.setFillColor(15, 23, 42);
    pdf.rect(0, 0, pageW, 46, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(13);
    pdf.text("Finance IQ", margin, 28);
    pdf.setFontSize(9);
    pdf.text(title, pageW - margin, 20, { align: "right" });
    pdf.text(new Date().toLocaleString("en-IN"), pageW - margin, 34, { align: "right" });

    pdf.setTextColor(0, 0, 0);
    pdf.addImage(img, "JPEG", margin, headerH - rendered, imgW, imgH, undefined, "FAST");

    // mask overflow above the content area
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 46, pageW, headerH - 46, "F");

    pdf.setFontSize(8);
    pdf.setTextColor(120, 120, 120);
    pdf.text(`Page ${page + 1}`, pageW / 2, pageH - 16, { align: "center" });

    rendered += usableH;
    page += 1;
    if (page > 20) break;
  }

  pdf.save(filename);
}
