import { jsPDF } from "jspdf";

export interface HeatmapPdfParams {
  /** Canvas já desenhado com o mapa de calor (cores). */
  heatCanvas: HTMLCanvasElement;
  /** Imagem de fundo da câmera, se estiver disponível e carregada. */
  snapshotImg?: HTMLImageElement | null;
  rangeLabel: string;
  totalPoints: number;
  hotZone: string;
  peakConcentrationPct: number;
  movementAreaPct: number;
  peakHourLabel?: string | null;
  /** Nome do cliente (não o código) — null se desconhecido/indisponível. */
  tenantLabel?: string | null;
}

const LOGO_URL = "/shomer-logo-preto.png";
const LOGO_ASPECT = 900 / 304; // dimensões reais do PNG cortado em public/ (sem padding)

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function buildGradientBarDataUrl(vertical: boolean): string {
  const canvas = document.createElement("canvas");
  canvas.width = vertical ? 24 : 256;
  canvas.height = vertical ? 256 : 24;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const gradient = vertical
    ? ctx.createLinearGradient(0, canvas.height, 0, 0)
    : ctx.createLinearGradient(0, 0, canvas.width, 0);
  gradient.addColorStop(0.0, "rgba(34,197,94,0.9)"); // verde
  gradient.addColorStop(0.35, "rgba(163,230,53,0.9)"); // verde-limão
  gradient.addColorStop(0.6, "rgba(234,179,8,0.9)"); // amarelo
  gradient.addColorStop(0.8, "rgba(249,115,22,0.92)"); // laranja
  gradient.addColorStop(1.0, "rgba(239,68,68,0.98)"); // vermelho
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

/** Compõe o snapshot (se houver) + o canvas de calor + a marca d'água da
 * logo (baixa opacidade, canto inferior direito) num único PNG — a marca
 * d'água fica DENTRO da imagem do mapa, não solta na página. */
function buildCompositeImage(
  heatCanvas: HTMLCanvasElement,
  snapshotImg: HTMLImageElement | null | undefined,
  logoImg: HTMLImageElement | null,
): string {
  const composite = document.createElement("canvas");
  composite.width = heatCanvas.width;
  composite.height = heatCanvas.height;
  const ctx = composite.getContext("2d");
  if (!ctx) return heatCanvas.toDataURL("image/png");

  ctx.fillStyle = "#f4f3ef";
  ctx.fillRect(0, 0, composite.width, composite.height);

  if (snapshotImg && snapshotImg.complete && snapshotImg.naturalWidth > 0) {
    ctx.globalAlpha = 0.8;
    ctx.drawImage(snapshotImg, 0, 0, composite.width, composite.height);
    ctx.globalAlpha = 1;
  }

  ctx.drawImage(heatCanvas, 0, 0, composite.width, composite.height);

  if (logoImg) {
    const logoWidth = composite.width * 0.22;
    const logoHeight = logoWidth / LOGO_ASPECT;
    const padding = composite.width * 0.02;
    ctx.globalAlpha = 0.18;
    ctx.drawImage(
      logoImg,
      composite.width - logoWidth - padding,
      composite.height - logoHeight - padding,
      logoWidth,
      logoHeight,
    );
    ctx.globalAlpha = 1;
  }

  return composite.toDataURL("image/png");
}

/** Cartão de estatística — rótulo em caixa alta + valor em destaque,
 * quebrando em até 2 linhas. Mesma linguagem visual dos cartões da barra
 * lateral no dashboard, só que impressa. */
function drawStatChip(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  value: string,
) {
  doc.setFillColor(246, 245, 241);
  doc.setDrawColor(225, 223, 216);
  doc.roundedRect(x, y, width, height, 2, 2, "FD");

  const pad = 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(140, 138, 130);
  doc.text(label.toUpperCase(), x + pad, y + pad + 1.5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(30, 30, 30);
  const valueLines: string[] = doc.splitTextToSize(value, width - pad * 2);
  doc.text(valueLines.slice(0, 2), x + pad, y + pad + 7);
}

export async function exportHeatmapPdf(params: HeatmapPdfParams): Promise<void> {
  const { heatCanvas, snapshotImg, rangeLabel, totalPoints, hotZone, peakHourLabel, tenantLabel } = params;

  const logoImg = await loadImage(LOGO_URL);

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 11;
  const now = new Date();
  const exportedAt = now.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });

  // --- Cabeçalho: logo grande à esquerda; datas/contexto à direita ---
  const headerLogoHeight = 16;
  const headerLogoWidth = headerLogoHeight * LOGO_ASPECT;
  if (logoImg) {
    doc.addImage(logoImg, "PNG", margin, margin - 2, headerLogoWidth, headerLogoHeight);
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(20, 20, 20);
    doc.text("SHOMER", margin, margin + 8);
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 110);
  doc.text(`Exportado em ${exportedAt}`, pageWidth - margin, margin + 2, { align: "right" });

  doc.setFont("helvetica", "italic");
  doc.setFontSize(8.5);
  doc.setTextColor(90, 90, 90);
  const subtitleParts = [
    rangeLabel,
    tenantLabel ? `Cliente: ${tenantLabel}` : null,
    `${totalPoints.toLocaleString("pt-BR")} pontos registrados`,
  ].filter(Boolean);
  doc.text(subtitleParts.join("   ·   "), pageWidth - margin, margin + 7, { align: "right" });

  // Largura sempre preenche as laterais (margem a margem) — a altura
  // decorre da proporção real do canvas capturado. Trava de segurança:
  // se isso empurrar o rodapé pra fora da página (canvas muito "alto"),
  // limita pela altura em vez de distorcer o layout.
  const imgAreaTop = margin + headerLogoHeight + 4;
  const footerReserve = 27;
  const maxImgHeight = pageHeight - margin - footerReserve - imgAreaTop;
  const sourceAspect = heatCanvas.width / heatCanvas.height;
  let imgWidth = pageWidth - margin * 2;
  let imgHeight = imgWidth / sourceAspect;
  if (imgHeight > maxImgHeight) {
    imgHeight = maxImgHeight;
    imgWidth = imgHeight * sourceAspect;
  }
  const imgX = margin + (pageWidth - margin * 2 - imgWidth) / 2;
  const imgY = imgAreaTop;

  // --- Imagem principal (composição snapshot + calor + marca d'água) ---
  const compositeDataUrl = buildCompositeImage(heatCanvas, snapshotImg, logoImg);
  doc.setDrawColor(210, 208, 200);
  doc.roundedRect(imgX - 1, imgY - 1, imgWidth + 2, imgHeight + 2, 2, 2, "S");
  doc.addImage(compositeDataUrl, "PNG", imgX, imgY, imgWidth, imgHeight);

  // --- Aviso legal — linha inteira, logo abaixo da imagem ---
  const disclaimerY = imgY + imgHeight + 7;
  const disclaimer =
    `Os dados representados nesta imagem sao uma leitura do cenario gerado em ${exportedAt}. ` +
    "As informacoes podem sofrer alteracoes de acordo com o comportamento dos consumidores ao " +
    "longo do tempo e nao constituem garantia de comportamento futuro.";
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7);
  doc.setTextColor(140, 140, 140);
  const disclaimerLines: string[] = doc.splitTextToSize(disclaimer, pageWidth - margin * 2);
  doc.text(disclaimerLines, margin, disclaimerY);

  // --- Legenda: linha de cartões compactos, em vez de texto corrido ---
  const chipsY = disclaimerY + disclaimerLines.length * 3.4 + 4;
  const chipHeight = 16;
  const chipGap = 4;
  const chips: Array<{ label: string; value: string }> = [{ label: "Zona mais quente", value: hotZone }];
  if (peakHourLabel) {
    chips.push({ label: "Horário de pico", value: peakHourLabel });
  }
  // Largura fixa (não esticada) — com poucos cartões, esticar até a borda
  // deixaria caixas enormes e vazias.
  const chipWidth = 62;

  // Cartão 1: intensidade (barra de gradiente horizontal).
  doc.setFillColor(246, 245, 241);
  doc.setDrawColor(225, 223, 216);
  doc.roundedRect(margin, chipsY, chipWidth, chipHeight, 2, 2, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(140, 138, 130);
  doc.text("INTENSIDADE", margin + 4, chipsY + 5.5);
  const gradientBar = buildGradientBarDataUrl(false);
  const barWidth = chipWidth - 8;
  doc.addImage(gradientBar, "PNG", margin + 4, chipsY + 8, barWidth, 3);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(110, 110, 110);
  doc.text("Frio", margin + 4, chipsY + 14.2);
  doc.text("Quente", margin + 4 + barWidth, chipsY + 14.2, { align: "right" });

  chips.forEach((chip, i) => {
    const x = margin + (chipWidth + chipGap) * (i + 1);
    drawStatChip(doc, x, chipsY, chipWidth, chipHeight, chip.label, chip.value);
  });

  const fileDate = now.toISOString().slice(0, 10);
  doc.save(`shomer-mapa-de-calor-${fileDate}.pdf`);
}
