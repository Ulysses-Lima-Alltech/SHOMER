"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  getHeatmap,
  getHourlyPattern,
  getSnapshotBlobUrl,
  getStoreLayout,
  getStoredUser,
  getTenant,
  HeatmapResult,
  HourlyPoint,
  StoreBarrier,
} from "../../lib/api";
import Shell from "../../components/Shell";
import { PulseIcon } from "../../components/Icons";
import { drawHeatmap, HeatPoint } from "../../lib/heatmapRenderer";
import { exportHeatmapPdf } from "../../lib/heatmapPdf";

type RangeOption = "today" | "24h" | "7d";

const RANGE_OPTIONS: Array<{ value: RangeOption; label: string }> = [
  { value: "today", label: "Hoje" },
  { value: "24h", label: "Últimas 24h" },
  { value: "7d", label: "Últimos 7 dias" },
];

/** Descreve a posição da célula mais quente em termos de zona da imagem,
 * já que não existe uma planta baixa real da loja — só o enquadramento da
 * câmera (ver heatmap-caption: topo = fundo da loja, base = entrada). */
function describeHotZone(x: number, y: number, gridSize: number): string {
  const fx = (x + 0.5) / gridSize;
  const fy = (y + 0.5) / gridSize;
  const horizontal = fx < 0.33 ? "à esquerda" : fx > 0.66 ? "à direita" : "no centro";
  const vertical = fy < 0.33 ? "no fundo da loja" : fy > 0.66 ? "perto da entrada" : "na região central";
  const text = fy < 0.33 || fy > 0.66 ? `${vertical}, ${horizontal}` : `${vertical} ${horizontal}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Dias equivalentes ao range selecionado, pro endpoint /stats/hourly-pattern
 * (que sempre trabalha em janelas de N dias inteiros). */
function rangeToDays(range: RangeOption): number {
  return range === "7d" ? 7 : 1;
}

function formatHour(hour: number): string {
  return `${hour.toString().padStart(2, "0")}h`;
}

// TEMPORARIO: mesmo motivo do STATS_SINGLE_CAMERA_ID na API (ver
// stats.service.ts) - câmeras com campo de visão sobreposto ainda não têm
// fusão multi-câmera confiável, e floorPoint é por câmera (não faz sentido
// sobrepor pontos de câmeras diferentes na imagem de uma só). Roupas 2 foi
// escolhida como fonte única enquanto isso não é resolvido.
const HEATMAP_CAMERA_ID = "camera-03";

function rangeToWindow(range: RangeOption): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  if (range === "today") {
    from.setHours(0, 0, 0, 0);
  } else if (range === "24h") {
    from.setTime(to.getTime() - 24 * 60 * 60 * 1000);
  } else {
    from.setTime(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
  return { from: from.toISOString(), to: to.toISOString() };
}

export default function HeatmapPage() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const snapshotImgRef = useRef<HTMLImageElement | null>(null);
  const [range, setRange] = useState<RangeOption>("today");
  const [heatmap, setHeatmap] = useState<HeatmapResult | null>(null);
  const [hourlyPattern, setHourlyPattern] = useState<HourlyPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [snapshotFailed, setSnapshotFailed] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [storeLayout, setStoreLayout] = useState<StoreBarrier[]>([]);

  const load = useCallback(
    async (r: RangeOption) => {
      try {
        const { from, to } = rangeToWindow(r);
        const [result, pattern] = await Promise.all([
          getHeatmap({ from, to, gridSize: 24, cameraId: HEATMAP_CAMERA_ID }),
          getHourlyPattern({ days: rangeToDays(r) }),
        ]);
        setHeatmap(result);
        setHourlyPattern(pattern);
        setError(null);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login");
          return;
        }
        setError(
          err instanceof Error ? err.message : "Não foi possível carregar o mapa de calor.",
        );
      }
    },
    [router],
  );

  useEffect(() => {
    load(range);
    const interval = setInterval(() => load(range), 30_000);
    return () => clearInterval(interval);
  }, [range, load]);

  useEffect(() => {
    const tenantId = getStoredUser()?.tenantId;
    if (!tenantId) return;
    getTenant(tenantId)
      .then((t) => setTenantName(t.name))
      .catch(() => setTenantName(null));
    getStoreLayout(tenantId)
      .then(setStoreLayout)
      .catch(() => setStoreLayout([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    let currentBlobUrl: string | null = null;

    const refreshSnapshot = async () => {
      try {
        const blobUrl = await getSnapshotBlobUrl({ cameraId: HEATMAP_CAMERA_ID });
        if (cancelled) {
          URL.revokeObjectURL(blobUrl);
          return;
        }
        if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
        currentBlobUrl = blobUrl;
        setSnapshotUrl(blobUrl);
        setSnapshotFailed(false);
      } catch {
        if (!cancelled) setSnapshotFailed(true);
      }
    };

    refreshSnapshot();
    const interval = setInterval(refreshSnapshot, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
    };
  }, []);

  // Desenha (e redesenha ao redimensionar) o canvas de calor — responsivo
  // ao tamanho real do container, não a um grid fixo de divs.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !heatmap) return;

    const gridSize = heatmap.gridSize;
    const maxCount = heatmap.maxCount;
    const points: HeatPoint[] = heatmap.cells
      .filter((cell) => cell.count > 0)
      .map((cell) => ({
        x: (cell.x + 0.5) / gridSize,
        y: (cell.y + 0.5) / gridSize,
        value: maxCount > 0 ? cell.count / maxCount : 0,
      }));

    const render = () => {
      const cellPx = canvas.clientWidth / gridSize;
      drawHeatmap(canvas, points, {
        radius: cellPx * 1.3,
        blur: cellPx * 1.1,
        minOpacity: 0.18,
      });
    };

    render();

    const observer = new ResizeObserver(render);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [heatmap]);

  if (error && !heatmap) {
    return (
      <Shell>
        <div className="page-status is-error">{error}</div>
      </Shell>
    );
  }

  // Derivados usados tanto nos cartões da barra lateral quanto na
  // exportação em PDF, calculados uma única vez por render.
  let hotZoneText = "—";
  let peakConcentrationPct = 0;
  let movementAreaPct = 0;
  let topHours: HourlyPoint[] = [];
  if (heatmap && heatmap.cells.length > 0) {
    const hottest = heatmap.cells.reduce((best, c) => (c.count > best.count ? c : best), heatmap.cells[0]);
    hotZoneText = describeHotZone(hottest.x, hottest.y, heatmap.gridSize);
    peakConcentrationPct =
      heatmap.totalPoints > 0 ? Math.round((heatmap.maxCount / heatmap.totalPoints) * 100) : 0;
    movementAreaPct = Math.round(
      (heatmap.cells.filter((c) => c.count > 0).length / (heatmap.gridSize * heatmap.gridSize)) * 100,
    );
  }
  if (hourlyPattern) {
    topHours = [...hourlyPattern].filter((p) => p.count > 0).sort((a, b) => b.count - a.count).slice(0, 3);
  }
  const peakHourLabel = topHours.length > 0 ? formatHour(topHours[0].hour) : null;

  async function handleExport() {
    const canvas = canvasRef.current;
    if (!canvas || !heatmap) return;
    setExporting(true);
    try {
      await exportHeatmapPdf({
        heatCanvas: canvas,
        snapshotImg: snapshotUrl && !snapshotFailed ? snapshotImgRef.current : null,
        rangeLabel: RANGE_OPTIONS.find((r) => r.value === range)?.label ?? "",
        totalPoints: heatmap.totalPoints,
        hotZone: hotZoneText,
        peakConcentrationPct,
        movementAreaPct,
        peakHourLabel,
        tenantLabel: tenantName,
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <Shell>
      <div className="page-heading">
        <div>
          <span className="eyebrow">MAPA DE CALOR</span>
          <h1>Onde os clientes circulam.</h1>
          <p>
            Densidade de posição das pessoas dentro do enquadramento da
            câmera — ajuda a identificar zonas de maior e menor fluxo na
            loja.
          </p>
        </div>
      </div>

      <div className="reports-toolbar">
        <div className="segmented">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={range === opt.value ? "selected" : ""}
              onClick={() => setRange(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <button
          className="export-button"
          disabled={!heatmap || heatmap.totalPoints === 0 || exporting}
          onClick={handleExport}
        >
          {exporting ? "Gerando PDF..." : "Exportar PDF"}
        </button>
      </div>

      {!heatmap ? (
        <div className="panel" style={{ height: 320 }} />
      ) : heatmap.totalPoints === 0 ? (
        <div className="panel">
          <div className="empty-state">
            <PulseIcon style={{ width: 32, height: 32, color: "var(--text-faint)" }} />
            <strong>Ainda não há dados de posição nesse período</strong>
            <span>
              O mapa de calor usa a posição (floorPoint) dos eventos
              person.detected. Confirme que DETECTION_EVENTS_ENABLED=true no
              edge e que já passou tempo suficiente coletando dados.
            </span>
          </div>
        </div>
      ) : (
        <section className="panel flow-panel">
          <div className="panel-header">
            <div>
              <span className="panel-kicker">DENSIDADE DE POSIÇÃO</span>
              <h2>{heatmap.totalPoints.toLocaleString("pt-BR")} pontos registrados</h2>
              <p style={{ color: "var(--text-soft)", fontSize: 13, marginTop: 4 }}>
                {snapshotUrl && !snapshotFailed
                  ? "Sobreposto à última imagem capturada pela câmera."
                  : "Posição das pessoas dentro do enquadramento da câmera."}
              </p>
            </div>
          </div>

          <div className="heatmap-layout">
            <div className="heatmap-main">
              <div className="heatmap-stage">
                {snapshotUrl && !snapshotFailed && (
                  // eslint-disable-next-line @next/next/no-img-element -- snapshot vem de fora do domínio Next
                  <img
                    ref={snapshotImgRef}
                    src={snapshotUrl}
                    alt="Última imagem capturada pela câmera"
                    className="heatmap-snapshot"
                    crossOrigin="anonymous"
                    onError={() => setSnapshotFailed(true)}
                  />
                )}
                <canvas ref={canvasRef} className="heatmap-canvas" />
                {storeLayout.length > 0 && (
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="store-layout-overlay-svg">
                    {storeLayout.map((barrier) => {
                      const points = barrier.points
                        .map((p) => `${(p.x * 100).toFixed(2)},${(p.y * 100).toFixed(2)}`)
                        .join(" ");
                      const cx = barrier.points.reduce((sum, p) => sum + p.x, 0) / barrier.points.length;
                      const cy = barrier.points.reduce((sum, p) => sum + p.y, 0) / barrier.points.length;
                      return (
                        <g key={barrier.id}>
                          <polygon
                            points={points}
                            fill="rgba(15,15,15,0.35)"
                            stroke="rgba(255,255,255,0.85)"
                            strokeWidth={0.4}
                            strokeDasharray="1.2,0.8"
                            vectorEffect="non-scaling-stroke"
                          />
                          <text
                            x={cx * 100}
                            y={cy * 100}
                            fontSize={2.6}
                            fill="#fff"
                            textAnchor="middle"
                            dominantBaseline="middle"
                            style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.6)", strokeWidth: 0.6 }}
                          >
                            {barrier.label}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                )}
              </div>

              <div className="heatmap-caption">
                <span>Câmera: topo da imagem = fundo da loja</span>
                <span>Câmera: base da imagem = frente / entrada</span>
              </div>
            </div>

            <aside className="heatmap-sidebar">
              <div className="heatmap-sidebar-card">
                <span className="heatmap-sidebar-label">Intensidade</span>
                <div className="heatmap-legend-vertical">
                  <span className="heatmap-legend-bar-v" />
                  <div className="heatmap-legend-labels">
                    <span>Quente</span>
                    <span>Frio</span>
                  </div>
                </div>
              </div>

              <div className="heatmap-sidebar-card">
                <span className="heatmap-sidebar-label">Zona mais quente</span>
                <strong className="heatmap-sidebar-value">{hotZoneText}</strong>
              </div>

              <div className="heatmap-sidebar-card">
                <span className="heatmap-sidebar-label">Concentração no pico</span>
                <strong className="heatmap-sidebar-value">{peakConcentrationPct}%</strong>
                <span className="heatmap-sidebar-hint">dos pontos nessa única célula</span>
              </div>

              <div className="heatmap-sidebar-card">
                <span className="heatmap-sidebar-label">Área com movimento</span>
                <strong className="heatmap-sidebar-value">{movementAreaPct}%</strong>
                <span className="heatmap-sidebar-hint">do enquadramento da câmera</span>
              </div>

              {topHours.length > 0 && (
                <div className="heatmap-sidebar-card">
                  <span className="heatmap-sidebar-label">Horários de pico</span>
                  <strong className="heatmap-sidebar-value">{peakHourLabel}</strong>
                  <span className="heatmap-sidebar-hint">
                    horário mais movimentado
                    {topHours.length > 1 && (
                      <> — também forte às {topHours.slice(1).map((p) => formatHour(p.hour)).join(" e ")}</>
                    )}
                  </span>
                </div>
              )}
            </aside>
          </div>
        </section>
      )}
    </Shell>
  );
}
