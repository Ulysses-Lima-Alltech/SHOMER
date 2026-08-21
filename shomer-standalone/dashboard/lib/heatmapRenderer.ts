// Renderizador de mapa de calor em canvas: pontos borrados (radial +
// shadowBlur) acumulados por densidade, depois colorizados verde → amarelo
// → laranja → vermelho — o visual "de calor" de verdade, não uma grade de
// quadrados sólidos.

export interface HeatPoint {
  /** 0..1, normalizado pela largura do canvas */
  x: number;
  /** 0..1, normalizado pela altura do canvas */
  y: number;
  /** 0..1, intensidade relativa ao ponto mais quente */
  value: number;
}

interface DrawOptions {
  /** Raio de cada ponto em pixels CSS (não multiplicado pelo devicePixelRatio). */
  radius: number;
  /** Quanto o ponto borra além do raio, em pixels CSS. */
  blur: number;
  minOpacity?: number;
}

let cachedPalette: Uint8ClampedArray | null = null;

function getPalette(): Uint8ClampedArray {
  if (cachedPalette) return cachedPalette;
  const paletteCanvas = document.createElement("canvas");
  paletteCanvas.width = 256;
  paletteCanvas.height = 1;
  const ctx = paletteCanvas.getContext("2d");
  if (!ctx) throw new Error("2d context indisponível");

  const gradient = ctx.createLinearGradient(0, 0, 256, 0);
  gradient.addColorStop(0.0, "rgba(34,197,94,0)");
  gradient.addColorStop(0.2, "rgba(34,197,94,0.55)"); // verde
  gradient.addColorStop(0.45, "rgba(163,230,53,0.7)"); // verde-limão
  gradient.addColorStop(0.65, "rgba(234,179,8,0.85)"); // amarelo
  gradient.addColorStop(0.82, "rgba(249,115,22,0.92)"); // laranja
  gradient.addColorStop(1.0, "rgba(239,68,68,0.98)"); // vermelho
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 1);

  cachedPalette = ctx.getImageData(0, 0, 256, 1).data;
  return cachedPalette;
}

function createBlobTemplate(radius: number, blur: number): HTMLCanvasElement {
  const size = (radius + blur) * 2;
  const tpl = document.createElement("canvas");
  tpl.width = tpl.height = size;
  const ctx = tpl.getContext("2d");
  if (!ctx) return tpl;

  // Desenha o círculo fora da área visível — só a sombra borrada (que cai
  // dentro do canvas) fica visível, dando o blob suave.
  const offset = size;
  ctx.shadowOffsetX = offset;
  ctx.shadowOffsetY = offset;
  ctx.shadowBlur = blur;
  ctx.shadowColor = "black";
  ctx.beginPath();
  ctx.arc(-offset + size / 2, -offset + size / 2, radius, 0, Math.PI * 2, true);
  ctx.closePath();
  ctx.fill();
  return tpl;
}

function colorize(pixels: Uint8ClampedArray, palette: Uint8ClampedArray) {
  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3];
    if (alpha === 0) continue;
    const offset = alpha * 4;
    pixels[i] = palette[offset];
    pixels[i + 1] = palette[offset + 1];
    pixels[i + 2] = palette[offset + 2];
    pixels[i + 3] = palette[offset + 3];
  }
}

/** Redimensiona o canvas pro tamanho CSS atual do elemento (responsivo,
 * nítido em qualquer resolução via devicePixelRatio) e desenha os pontos. */
export function drawHeatmap(canvas: HTMLCanvasElement, points: HeatPoint[], options: DrawOptions) {
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth;
  const cssHeight = canvas.clientHeight;
  if (cssWidth === 0 || cssHeight === 0) return;

  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (points.length === 0) return;

  const radius = options.radius * dpr;
  const blur = options.blur * dpr;
  const minOpacity = options.minOpacity ?? 0.15;
  const template = createBlobTemplate(radius, blur);
  const templateHalf = template.width / 2;

  const density = document.createElement("canvas");
  density.width = canvas.width;
  density.height = canvas.height;
  const dctx = density.getContext("2d");
  if (!dctx) return;

  for (const point of points) {
    dctx.globalAlpha = Math.max(minOpacity, Math.min(1, point.value));
    dctx.drawImage(
      template,
      point.x * canvas.width - templateHalf,
      point.y * canvas.height - templateHalf,
    );
  }

  const imageData = dctx.getImageData(0, 0, density.width, density.height);
  colorize(imageData.data, getPalette());
  ctx.putImageData(imageData, 0, 0);
}
