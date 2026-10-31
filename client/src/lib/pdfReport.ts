/**
 * pdfReport.ts — Generates a branded, multi-page PDF report
 * from the GeoMine Analytics dashboard state.
 *
 * Uses jsPDF for PDF creation and html2canvas for capturing
 * the map and chart elements as images.
 */
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import type { AnalysisResponse, MannKendallResult } from '@/services/api';
import type { RegressionResult } from '@/lib/regression';

// Brand colors
const COLORS = {
  bg: [15, 23, 42] as [number, number, number],
  bgCard: [30, 41, 59] as [number, number, number],
  accent: [16, 185, 129] as [number, number, number],
  accentDim: [6, 78, 59] as [number, number, number],
  text: [226, 232, 240] as [number, number, number],
  textMuted: [148, 163, 184] as [number, number, number],
  danger: [239, 68, 68] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

interface ReportData {
  analysisData: AnalysisResponse;
  regression: RegressionResult | null;
  siteName?: string;
  yearRange: [number, number];
}

async function captureElement(selector: string): Promise<HTMLCanvasElement | null> {
  const el = document.querySelector(selector) as HTMLElement;
  if (!el) return null;
  try {
    return await html2canvas(el, {
      backgroundColor: '#0f172a',
      scale: 2,
      useCORS: true,
      logging: false,
      allowTaint: true,
    });
  } catch (_e) {
    return null;
  }
}

function roundedRect(
  doc: jsPDF, x: number, y: number, w: number, h: number,
  r: number, fill: [number, number, number]
) {
  doc.setFillColor(...fill);
  doc.roundedRect(x, y, w, h, r, r, 'F');
}

function divider(doc: jsPDF, y: number, margin: number, pw: number) {
  doc.setDrawColor(51, 65, 85);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pw - margin, y);
}

export async function generatePdfReport(data: ReportData): Promise<void> {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const m = 16;
  const cw = pw - m * 2;
  let y = 0;

  // ─── PAGE 1: COVER ────────────────────────────────────────────
  doc.setFillColor(...COLORS.bg);
  doc.rect(0, 0, pw, ph, 'F');
  doc.setFillColor(...COLORS.accent);
  doc.rect(0, 0, pw, 3, 'F');

  y = 50;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  doc.setTextColor(...COLORS.white);
  doc.text('GeoMine Analytics', m, y);

  y += 10;
  doc.setFontSize(14);
  doc.setTextColor(...COLORS.accent);
  doc.text('Mining Degradation Analysis Report', m, y);

  y += 16;
  divider(doc, y, m, pw);

  y += 12;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');

  const meta = [
    ['Study Area', data.siteName || 'Custom ROI'],
    ['Analysis Period', `${data.yearRange[0]} \u2014 ${data.yearRange[1]}`],
    ['Generated', new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })],
    ['Data Source', 'Landsat 5/7/8/9 (harmonised), Sentinel-5P, Dynamic World'],
    ['Composites', data.analysisData.seasonLabel || ''],
    ['Time Series', `${data.analysisData.timeSeries?.length || 0} years`],
  ];

  for (const [label, value] of meta) {
    doc.setTextColor(...COLORS.textMuted);
    doc.text(label + ':', m, y);
    doc.setTextColor(...COLORS.text);
    doc.text(value, m + 45, y);
    y += 7;
  }

  // Summary cards
  y += 10;
  const summary = data.analysisData.summary;
  const cards: { label: string; value: string; color: [number, number, number] }[] = [
    { label: 'Vegetation Loss', value: `${summary.vegetationLoss} ha`, color: COLORS.danger },
    { label: 'Average NDVI', value: `${summary.averageNdvi}`, color: COLORS.accent },
    { label: 'NO2 (area + 10 km)', value: summary.no2Level != null ? `${summary.no2Level} umol/m2` : 'n/a', color: [168, 85, 247] },
    { label: 'Water Index (NDWI)', value: summary.waterIndex != null ? `${summary.waterIndex}` : 'n/a', color: [59, 130, 246] },
  ];

  const cardW = (cw - 6) / 2;
  const cardH = 28;

  for (let i = 0; i < cards.length; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cx = m + col * (cardW + 6);
    const cy = y + row * (cardH + 6);

    roundedRect(doc, cx, cy, cardW, cardH, 3, COLORS.bgCard);
    doc.setFillColor(...cards[i].color);
    doc.rect(cx, cy, 2, cardH, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.textMuted);
    doc.text(cards[i].label.toUpperCase(), cx + 8, cy + 10);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...cards[i].color);
    doc.text(cards[i].value, cx + 8, cy + 22);
  }

  y += (cardH + 6) * 2 + 10;

  // Mann-Kendall trends (study area, control ring, difference) and change point
  const a = data.analysisData;
  const fmt = (t?: MannKendallResult | null) => t
    ? `Sen's slope ${(t.sens_slope * 10 >= 0 ? '+' : '')}${(t.sens_slope * 10).toFixed(3)}/decade, p = ${t.p_value < 0.001 ? '<0.001' : t.p_value.toFixed(3)}`
    : 'n/a';
  const trendLines = [
    `Study area:      ${fmt(a.mannKendall)}`,
    `Control ring:    ${fmt(a.controlTrend)}`,
    `Area - control:  ${fmt(a.differenceTrend)}`,
    a.changePoint?.change_year ? `Pettitt change point (area - control): ${a.changePoint.change_year}, p = ${a.changePoint.p_value.toFixed(3)}` : '',
  ].filter(Boolean);
  roundedRect(doc, m, y, cw, 8 + trendLines.length * 6, 3, COLORS.bgCard);
  doc.setFont('courier', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.text);
  trendLines.forEach((t, i) => doc.text(t, m + 6, y + 8 + i * 6));
  y += 14 + trendLines.length * 6;

  // Regression summary
  if (data.regression) {
    roundedRect(doc, m, y, cw, 24, 3, COLORS.bgCard);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.accent);
    doc.text('NDVI TREND ANALYSIS', m + 8, y + 9);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.text);
    const dir = data.regression.slope > 0 ? 'increasing' : 'declining';
    const slopeStr = data.regression.slope > 0 ? '+' : '';
    doc.text(
      `Slope: ${slopeStr}${data.regression.slope.toFixed(4)}/yr  |  R2 = ${data.regression.r2.toFixed(3)}  |  Vegetation is ${dir}`,
      m + 8, y + 18
    );
    y += 32;
  }

  // ─── PAGE 2: MAP + CHART ──────────────────────────────────────
  doc.addPage();
  doc.setFillColor(...COLORS.bg);
  doc.rect(0, 0, pw, ph, 'F');
  doc.setFillColor(...COLORS.accent);
  doc.rect(0, 0, pw, 3, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...COLORS.white);
  doc.text('Study Area \u2014 Satellite View', m, 18);
  divider(doc, 22, m, pw);

  // Capture map using MapLibre native API
  let mapAdded = false;
  y = 28;
  try {
    const canvas = document.querySelector('.maplibregl-canvas') as HTMLCanvasElement;
    if (canvas) {
      const imgData = canvas.toDataURL('image/png');
      const aspect = canvas.height / canvas.width;
      const imgH = Math.min(cw * aspect, 130);
      doc.addImage(imgData, 'PNG', m, y, cw, imgH);
      y += imgH + 10;
      mapAdded = true;
    }
  } catch (_e) {
    // WebGL capture failed
  }
  if (!mapAdded) {
    roundedRect(doc, m, y, cw, 50, 4, COLORS.bgCard);
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.textMuted);
    doc.text('Map capture unavailable.', m + 8, y + 28);
    y = 90;
  }

  // Chart capture
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...COLORS.white);
  doc.text('NDVI Time Series & Trendline', m, y);
  y += 6;

  let chartAdded = false;
  try {
    const chartCanvas = await captureElement('.bottom-panel-content');
    if (chartCanvas) {
      const imgData = chartCanvas.toDataURL('image/png');
      const imgH = Math.min((chartCanvas.height / chartCanvas.width) * cw, 90);
      if (y + imgH > ph - 20) {
        doc.addPage();
        doc.setFillColor(...COLORS.bg);
        doc.rect(0, 0, pw, ph, 'F');
        doc.setFillColor(...COLORS.accent);
        doc.rect(0, 0, pw, 3, 'F');
        y = 18;
      }
      doc.addImage(imgData, 'PNG', m, y, cw, imgH);
      y += imgH + 10;
      chartAdded = true;
    }
  } catch (_e) {
    // tainted canvas
  }
  if (!chartAdded) {
    roundedRect(doc, m, y, cw, 30, 4, COLORS.bgCard);
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.textMuted);
    doc.text('Chart capture unavailable \u2014 see data tables on next page.', m + 8, y + 18);
  }

  // ─── PAGE 3: LAND COVER & DATA TABLE ──────────────────────────
  doc.addPage();
  doc.setFillColor(...COLORS.bg);
  doc.rect(0, 0, pw, ph, 'F');
  doc.setFillColor(...COLORS.accent);
  doc.rect(0, 0, pw, 3, 'F');

  y = 18;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...COLORS.white);
  doc.text('Land Cover Distribution', m, y);
  y += 8;

  if (data.analysisData.landCover && data.analysisData.landCover.length > 0) {
    roundedRect(doc, m, y, cw, 8, 2, COLORS.accentDim);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.white);
    doc.text('CLASS', m + 4, y + 6);
    doc.text('COVERAGE (%)', m + cw - 40, y + 6);
    y += 10;

    for (const item of data.analysisData.landCover) {
      roundedRect(doc, m, y, cw, 7, 1, COLORS.bgCard);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...COLORS.text);
      doc.text(item.class, m + 4, y + 5.5);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...COLORS.accent);
      doc.text(`${item.value.toFixed(1)}%`, m + cw - 40, y + 5.5);

      const barX = m + 60;
      const barW = cw - 110;
      doc.setFillColor(51, 65, 85);
      doc.rect(barX, y + 2.5, barW, 2.5, 'F');
      doc.setFillColor(...COLORS.accent);
      doc.rect(barX, y + 2.5, barW * (item.value / 100), 2.5, 'F');
      y += 8;
    }
  }

  // NDVI time series data table
  y += 12;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...COLORS.white);
  doc.text('NDVI Time Series Data', m, y);
  y += 8;

  if (data.analysisData.timeSeries && data.analysisData.timeSeries.length > 0) {
    roundedRect(doc, m, y, cw, 8, 2, COLORS.accentDim);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.white);
    doc.text('YEAR', m + 4, y + 6);
    doc.text('NDVI', m + 40, y + 6);
    doc.text('CHANGE', m + 80, y + 6);
    doc.text('STATUS', m + 120, y + 6);
    y += 10;

    for (let i = 0; i < data.analysisData.timeSeries.length; i++) {
      const row = data.analysisData.timeSeries[i];
      const prev = i > 0 ? data.analysisData.timeSeries[i - 1] : null;
      const change = prev ? row.ndvi - prev.ndvi : 0;

      roundedRect(doc, m, y, cw, 7, 1, i % 2 === 0 ? COLORS.bgCard : COLORS.bg);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...COLORS.text);
      doc.text(String(row.year), m + 4, y + 5.5);
      doc.text(row.ndvi.toFixed(4), m + 40, y + 5.5);

      if (i > 0) {
        const changeColor = change >= 0 ? COLORS.accent : COLORS.danger;
        doc.setTextColor(...changeColor);
        doc.text(`${change >= 0 ? '+' : ''}${change.toFixed(4)}`, m + 80, y + 5.5);
        doc.text(change >= 0 ? 'Gain' : 'Loss', m + 120, y + 5.5);
      } else {
        doc.setTextColor(...COLORS.textMuted);
        doc.text('\u2014', m + 80, y + 5.5);
        doc.text('Baseline', m + 120, y + 5.5);
      }

      y += 8;
    }
  }

  // Footer
  y = ph - 12;
  divider(doc, y - 4, m, pw);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.textMuted);
  doc.text(
    `GeoMine Analytics Report \u2022 Generated ${new Date().toISOString().slice(0, 10)} \u2022 Powered by Google Earth Engine`,
    pw / 2, y, { align: 'center' }
  );

  // Save
  const safeName = (data.siteName || 'analysis').toLowerCase().replace(/\s+/g, '-');
  const filename = `geomine-report-${safeName}-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}
