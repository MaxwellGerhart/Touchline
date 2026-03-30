import jsPDF from 'jspdf';

export interface PDFPlot {
  name: string;
  canvas: HTMLCanvasElement;
  originalWidth: number;
  originalHeight: number;
}

/**
 * Convert a canvas to a data URL image
 */
export function canvasToImage(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png');
}

/**
 * Calculate scaled dimensions to fit on a PDF page
 */
function calculateScaledDimensions(
  origWidth: number,
  origHeight: number,
  pageWidth: number,
  pageHeight: number,
  marginTop: number,
  marginBottom: number,
  marginLeft: number,
  marginRight: number,
): { width: number; height: number } {
  const availableWidth = pageWidth - marginLeft - marginRight;
  const availableHeight = pageHeight - marginTop - marginBottom;

  const aspect = origWidth / origHeight;
  let width = availableWidth;
  let height = width / aspect;

  if (height > availableHeight) {
    height = availableHeight;
    width = height * aspect;
  }

  return { width, height };
}

/**
 * Generate a PDF with match report and selected plots
 */
export function generateMatchReportPDF(
  matchReportCanvas: HTMLCanvasElement,
  plots: PDFPlot[],
  filename: string,
): void {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const marginLeft = 10;
  const marginRight = 10;
  const marginTop = 10;
  const marginBottom = 10;

  let pageNumber = 0;

  // ── Add Match Report as first page ───────────────────────────────────
  const mrImage = canvasToImage(matchReportCanvas);
  const mrScaled = calculateScaledDimensions(
    matchReportCanvas.width / (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 2),
    matchReportCanvas.height / (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 2),
    pageWidth,
    pageHeight,
    marginTop,
    marginBottom,
    marginLeft,
    marginRight,
  );

  pdf.addImage(
    mrImage,
    'PNG',
    marginLeft + (pageWidth - marginLeft - marginRight - mrScaled.width) / 2,
    marginTop,
    mrScaled.width,
    mrScaled.height,
  );

  // Add title at bottom
  pdf.setFontSize(12);
  pdf.text('Match Report', marginLeft, pageHeight - 8);
  pageNumber++;

  // ── Add each plot on separate pages ──────────────────────────────────
  for (const plot of plots) {
    pdf.addPage();

    const plotImage = canvasToImage(plot.canvas);
    const plotScaled = calculateScaledDimensions(
      plot.originalWidth,
      plot.originalHeight,
      pageWidth,
      pageHeight,
      marginTop + 10, // extra space for title
      marginBottom,
      marginLeft,
      marginRight,
    );

    // Add plot title
    pdf.setFontSize(14);
    pdf.text(plot.name, marginLeft, marginTop + 5);

    // Add plot image
    pdf.addImage(
      plotImage,
      'PNG',
      marginLeft + (pageWidth - marginLeft - marginRight - plotScaled.width) / 2,
      marginTop + 10,
      plotScaled.width,
      plotScaled.height,
    );

    // Add page number
    pdf.setFontSize(10);
    pdf.text(`Page ${pageNumber + 1}`, pageWidth - marginRight - 20, pageHeight - 8);
    pageNumber++;
  }

  // ── Download PDF ────────────────────────────────────────────────────
  const pdfFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  pdf.save(pdfFilename);
}
