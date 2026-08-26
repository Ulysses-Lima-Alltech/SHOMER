"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  CameraOption,
  getCameraStatus,
  getCameras,
  getSnapshotBlobUrl,
} from "../../lib/api";
import Shell from "../../components/Shell";
import { PulseIcon } from "../../components/Icons";

const REFRESH_INTERVAL_MS = 3_000;

function formatBool(value: unknown): string {
  return value ? "sim" : "não";
}

/** Rótulos amigáveis pros campos do VisionStats do edge - a ideia dessa
 * aba é justamente deixar visível o que alimenta cada métrica do
 * dashboard, então mostra os nomes técnicos que aparecem na API. */
const STATUS_FIELDS: Array<{ key: string; label: string; format?: (v: unknown) => string }> = [
  { key: "camera_connected", label: "Câmera conectada", format: formatBool },
  { key: "model_ready", label: "Modelo carregado", format: formatBool },
  { key: "persons_current", label: "persons_current (pessoas contadas agora)" },
  { key: "entries", label: "Entradas (desde que o processo subiu)" },
  { key: "exits", label: "Saídas (desde que o processo subiu)" },
  { key: "last_crossing_direction", label: "Última direção de cruzamento" },
  { key: "frames_processed", label: "Frames processados" },
  { key: "last_error", label: "Último erro" },
];

export default function AoVivoPage() {
  const router = useRouter();
  const [cameras, setCameras] = useState<CameraOption[] | null>(null);
  const [cameraId, setCameraId] = useState<string | undefined>(undefined);
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [snapshotFailed, setSnapshotFailed] = useState(false);
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const currentBlobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    getCameras()
      .then((result) => {
        setCameras(result);
        if (result.length > 0) setCameraId(result[0].id);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login");
          return;
        }
        setError("Não foi possível carregar a lista de câmeras.");
      });
  }, [router]);

  const load = useCallback(async () => {
    try {
      const [blobUrl, statusResult] = await Promise.all([
        getSnapshotBlobUrl({ cameraId, debug: true }),
        getCameraStatus(cameraId),
      ]);
      if (currentBlobUrlRef.current) URL.revokeObjectURL(currentBlobUrlRef.current);
      currentBlobUrlRef.current = blobUrl;
      setSnapshotUrl(blobUrl);
      setSnapshotFailed(false);
      setStatus(statusResult);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace("/login");
        return;
      }
      setSnapshotFailed(true);
    }
  }, [cameraId, router]);

  useEffect(() => {
    if (!cameraId) return;
    load();
    const interval = setInterval(load, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [cameraId, load]);

  useEffect(() => {
    return () => {
      if (currentBlobUrlRef.current) URL.revokeObjectURL(currentBlobUrlRef.current);
    };
  }, []);

  const statusError = status && typeof status.error === "string" ? status.error : null;

  return (
    <Shell>
      <div className="page-heading">
        <div>
          <span className="eyebrow">VALIDAÇÃO AO VIVO</span>
          <h1>O que a câmera está vendo agora.</h1>
          <p>
            Imagem ao vivo com as caixas de detecção do modelo, atualizada a
            cada {REFRESH_INTERVAL_MS / 1000}s — para conferir exatamente o
            que está sendo contado (e o que está sendo filtrado) em cada
            câmera.
          </p>
        </div>
      </div>

      {cameras && cameras.length > 1 && (
        <div className="reports-toolbar">
          <div className="segmented">
            {cameras.map((cam) => (
              <button
                key={cam.id}
                className={cameraId === cam.id ? "selected" : ""}
                onClick={() => setCameraId(cam.id)}
              >
                {cam.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {error ? (
        <div className="page-status is-error">{error}</div>
      ) : (
        <section className="panel flow-panel">
          <div className="panel-header">
            <div>
              <span className="panel-kicker">DETECÇÃO EM TEMPO REAL</span>
              <h2>{cameras?.find((c) => c.id === cameraId)?.label ?? "Câmera"}</h2>
              <div className="live-legend" style={{ marginTop: 8 }}>
                <span>
                  <span className="live-legend-dot" style={{ background: "#22c55e" }} />
                  Contado como pessoa
                </span>
                <span>
                  <span className="live-legend-dot" style={{ background: "#ef4444" }} />
                  Filtrado (objeto estático)
                </span>
              </div>
            </div>
          </div>

          <div className="heatmap-layout">
            <div className="heatmap-main">
              <div className="live-stage">
                {snapshotUrl && !snapshotFailed ? (
                  // eslint-disable-next-line @next/next/no-img-element -- blob: URL, não é um asset do Next
                  <img src={snapshotUrl} alt="Câmera ao vivo com detecções" className="live-snapshot" />
                ) : (
                  <div className="empty-state">
                    <PulseIcon style={{ width: 32, height: 32, color: "var(--text-faint)" }} />
                    <strong>Sem imagem no momento</strong>
                    <span>A câmera pode estar reconectando ou o edge está fora do ar.</span>
                  </div>
                )}
              </div>
            </div>

            <aside className="heatmap-sidebar">
              {statusError && (
                <div className="heatmap-sidebar-card">
                  <span className="heatmap-sidebar-label">Status</span>
                  <strong className="heatmap-sidebar-value">{statusError}</strong>
                </div>
              )}
              {status &&
                !statusError &&
                STATUS_FIELDS.map(({ key, label, format }) => {
                  const raw = status[key];
                  if (raw === undefined) return null;
                  const value = format ? format(raw) : raw === null ? "—" : String(raw);
                  return (
                    <div className="heatmap-sidebar-card" key={key}>
                      <span className="heatmap-sidebar-label">{label}</span>
                      <strong className="heatmap-sidebar-value" style={{ fontSize: 16 }}>
                        {value || "—"}
                      </strong>
                    </div>
                  );
                })}
              {status && Array.isArray(status.track_ids) && (
                <div className="heatmap-sidebar-card">
                  <span className="heatmap-sidebar-label">track_ids ativos</span>
                  <strong className="heatmap-sidebar-value" style={{ fontSize: 16 }}>
                    {(status.track_ids as unknown[]).length > 0
                      ? (status.track_ids as unknown[]).join(", ")
                      : "nenhum"}
                  </strong>
                </div>
              )}
            </aside>
          </div>
        </section>
      )}
    </Shell>
  );
}
