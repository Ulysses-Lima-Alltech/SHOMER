"use client";

import { FormEvent, MouseEvent as ReactMouseEvent, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ApiError,
  CameraLineCrossing,
  CameraOption,
  createDevice,
  deleteDevice,
  EdgeHealthStatus,
  getAllLineCrossings,
  getCameras,
  getDevices,
  getEdgeHealth,
  getLineCrossing,
  getOperatingHours,
  getSnapshotBlobUrl,
  getStoreLayout,
  getStoredUser,
  LineCrossingPoint,
  ManagedDevice,
  OperatingHours,
  SessionUser,
  setLineCrossing,
  setOperatingHours,
  setStoreLayout,
  StoreBarrier,
  StoreLayoutPoint,
} from "../../lib/api";
import Shell from "../../components/Shell";
import { ACCENT_OPTIONS, Accent, useTheme } from "../../components/Shell";
import { AlertIcon, ClockIcon, PulseIcon, UsersIcon } from "../../components/Icons";

const REFRESH_INTERVAL_MS = 15_000;
const STALE_AFTER_MS = 90_000;
const EDGE_URL = process.env.NEXT_PUBLIC_EDGE_URL;

const WEEKDAYS: Array<{ key: keyof OperatingHours; label: string }> = [
  { key: "monday", label: "Segunda" },
  { key: "tuesday", label: "Terça" },
  { key: "wednesday", label: "Quarta" },
  { key: "thursday", label: "Quinta" },
  { key: "friday", label: "Sexta" },
  { key: "saturday", label: "Sábado" },
  { key: "sunday", label: "Domingo" },
];

const DEFAULT_HOURS: OperatingHours = {
  timezone: "America/Sao_Paulo",
  enabled: false,
  monday: { open: "08:00", close: "22:00", closed: false },
  tuesday: { open: "08:00", close: "22:00", closed: false },
  wednesday: { open: "08:00", close: "22:00", closed: false },
  thursday: { open: "08:00", close: "22:00", closed: false },
  friday: { open: "08:00", close: "22:00", closed: false },
  saturday: { open: "08:00", close: "22:00", closed: false },
  sunday: { open: "08:00", close: "18:00", closed: true },
};

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("pt-BR");
}

function AparenciaSection() {
  const { appearance, accent, setAppearance, setAccent } = useTheme();
  return (
    <section className="panel flow-panel" style={{ marginBottom: 18 }}>
      <div className="panel-header">
        <div>
          <span className="panel-kicker">APARÊNCIA</span>
          <h2>Tema do dashboard</h2>
        </div>
      </div>
      <div style={{ display: "flex", gap: 24, marginTop: 16, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ display: "flex", flexDirection: "column", fontSize: 12, gap: 6 }}>
          Modo
          <div className="segmented">
            <button className={appearance === "light" ? "selected" : ""} onClick={() => setAppearance("light")}>
              Claro
            </button>
            <button className={appearance === "dark" ? "selected" : ""} onClick={() => setAppearance("dark")}>
              Escuro
            </button>
          </div>
        </label>
        <label style={{ display: "flex", flexDirection: "column", fontSize: 12, gap: 6 }}>
          Cor de destaque
          <div className="accent-switcher">
            {ACCENT_OPTIONS.map((item: Accent) => (
              <button
                key={item}
                aria-label={`Tema ${item}`}
                className={`accent-dot accent-${item} ${accent === item ? "selected" : ""}`}
                onClick={() => setAccent(item)}
              />
            ))}
          </div>
        </label>
      </div>
    </section>
  );
}

function SaudeSection() {
  const router = useRouter();
  const [health, setHealth] = useState<EdgeHealthStatus | null>(null);

  const load = useCallback(async () => {
    try {
      setHealth(await getEdgeHealth());
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    load();
    const interval = setInterval(load, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  const stale =
    !health?.reportedAt || Date.now() - new Date(health.reportedAt).getTime() > STALE_AFTER_MS;

  return (
    <section className="panel flow-panel" style={{ marginBottom: 18 }}>
      <div className="panel-header">
        <div>
          <span className="panel-kicker">SAÚDE</span>
          <h2>Status do dispositivo edge</h2>
          <p style={{ color: "var(--text-soft)", fontSize: 13, marginTop: 4 }}>
            Reportado pelo próprio dispositivo — não depende de acesso direto à rede do cliente.
          </p>
        </div>
        {health?.reportedAt && (
          <span className={`status-pill ${!stale && health.status === "healthy" ? "live" : "offline"}`}>
            <span className="status-dot" />
            {stale ? "Sem sinal recente" : health.status === "healthy" ? "Saudável" : "Degradado"}
          </span>
        )}
      </div>

      {!health?.reportedAt ? (
        <div className="empty-state">
          <AlertIcon style={{ width: 28, height: 28, color: "var(--text-faint)" }} />
          <strong>Nenhum relatório de saúde recebido ainda</strong>
          <span>Confirme que EDGE_HEALTH_REPORT_ENABLED=true no edge.env e que o dispositivo está online.</span>
        </div>
      ) : (
        <>
          {health.lastError && (
            <div className="alert-banner warning" style={{ marginTop: 12 }}>
              <AlertIcon className="alert-banner-icon" />
              <div className="alert-banner-body">
                <strong>Erro reportado pelo dispositivo</strong>
                <span>{health.lastError}</span>
              </div>
            </div>
          )}
          <div className="kpi-grid" style={{ marginTop: 16 }}>
            <article className="kpi-card">
              <div className="kpi-top">
                <span className="kpi-icon">
                  <PulseIcon />
                </span>
              </div>
              <span className="kpi-label">Câmera</span>
              <div className="kpi-value" style={{ fontSize: 20 }}>
                {health.cameraConnected === null ? "—" : health.cameraConnected ? "Conectada" : "Desconectada"}
              </div>
              <span className="kpi-context">
                Modelo: {health.modelReady === null ? "—" : health.modelReady ? "pronto" : "carregando"}
              </span>
            </article>
            <article className="kpi-card">
              <div className="kpi-top">
                <span className="kpi-icon">
                  <UsersIcon />
                </span>
              </div>
              <span className="kpi-label">Pessoas agora</span>
              <div className="kpi-value">{health.personsCurrent ?? "—"}</div>
              <span className="kpi-context">no enquadramento da câmera</span>
            </article>
            <article className="kpi-card">
              <div className="kpi-top">
                <span className="kpi-icon">
                  <ClockIcon />
                </span>
              </div>
              <span className="kpi-label">Último frame</span>
              <div className="kpi-value" style={{ fontSize: 20 }}>
                {formatTime(health.lastFrameAt)}
              </div>
              <span className="kpi-context">{(health.framesProcessed ?? 0).toLocaleString("pt-BR")} frames</span>
            </article>
            <article className="kpi-card">
              <div className="kpi-top">
                <span className="kpi-icon">
                  <ClockIcon />
                </span>
              </div>
              <span className="kpi-label">Último relatório</span>
              <div className="kpi-value" style={{ fontSize: 20 }}>
                {formatTime(health.reportedAt)}
              </div>
              <span className="kpi-context">atualiza a cada poucos segundos</span>
            </article>
          </div>
        </>
      )}
    </section>
  );
}

function CamerasSection({ session, tenantId }: { session: SessionUser; tenantId: string }) {
  const [devices, setDevices] = useState<ManagedDevice[] | null>(null);
  const [name, setName] = useState("");
  const [cameraId, setCameraId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const canEdit = true; // cameras e horario sao configuracao operacional da loja, qualquer usuario logado do tenant edita

  const load = useCallback(async () => {
    try {
      setDevices(await getDevices(tenantId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar câmeras.");
    }
  }, [tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await createDevice({ name, cameraId: cameraId || undefined, tenantId });
      setName("");
      setCameraId("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao cadastrar câmera.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Remover esta câmera do cadastro?")) return;
    try {
      await deleteDevice(id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao remover câmera.");
    }
  }

  return (
    <section className="panel flow-panel" style={{ marginBottom: 18 }}>
      <div className="panel-header">
        <div>
          <span className="panel-kicker">CÂMERAS</span>
          <h2>Dispositivos cadastrados</h2>
          <p style={{ color: "var(--text-soft)", fontSize: 13, marginTop: 4 }}>
            Este cadastro é só uma referência (nome + identificador) — o link RTSP e a senha da
            câmera Intelbras são configurados direto no arquivo edge.env do dispositivo, nunca
            aqui, por segurança. O identificador abaixo precisa ser <em>igual</em> ao usado lá.
          </p>
        </div>
      </div>

      {canEdit && (
        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16, alignItems: "flex-end" }}
        >
          <label style={{ display: "flex", flexDirection: "column", fontSize: 12, gap: 4 }}>
            Nome
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Câmera entrada"
              required
              style={{ padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8 }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", fontSize: 12, gap: 4 }}>
            Identificador no edge.env (opcional, não é o link RTSP)
            <input
              value={cameraId}
              onChange={(e) => setCameraId(e.target.value)}
              placeholder="camera-01"
              style={{ padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8 }}
            />
          </label>
          <button type="submit" className="export-button" disabled={saving}>
            {saving ? "Cadastrando..." : "Cadastrar câmera"}
          </button>
        </form>
      )}

      {error && <div className="login-error" style={{ marginTop: 12 }}>{error}</div>}

      <div style={{ marginTop: 18, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--text-faint)" }}>
              <th style={{ padding: "8px 12px" }}>Nome</th>
              <th style={{ padding: "8px 12px" }}>Identificador (edge.env)</th>
              <th style={{ padding: "8px 12px" }}>Cadastrada em</th>
              {canEdit && <th style={{ padding: "8px 12px" }} />}
            </tr>
          </thead>
          <tbody>
            {(devices ?? []).map((d) => (
              <tr key={d.id} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={{ padding: "8px 12px" }}>{d.name}</td>
                <td style={{ padding: "8px 12px", color: "var(--text-soft)" }}>{d.cameraId ?? "—"}</td>
                <td style={{ padding: "8px 12px", color: "var(--text-soft)" }}>
                  {new Date(d.createdAt).toLocaleDateString("pt-BR")}
                </td>
                {canEdit && (
                  <td style={{ padding: "8px 12px", textAlign: "right" }}>
                    <button
                      type="button"
                      className="nav-item"
                      style={{ color: "var(--danger, #c0392b)" }}
                      onClick={() => handleDelete(d.id)}
                    >
                      Remover
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {devices && devices.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 4 : 3} style={{ padding: "16px 12px", color: "var(--text-faint)" }}>
                  Nenhuma câmera cadastrada ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function HorarioSection({ session, tenantId }: { session: SessionUser; tenantId: string }) {
  const [hours, setHours] = useState<OperatingHours>(DEFAULT_HOURS);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const canEdit = true; // cameras e horario sao configuracao operacional da loja, qualquer usuario logado do tenant edita

  useEffect(() => {
    getOperatingHours(tenantId)
      .then((result) => {
        if (result) setHours(result);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [tenantId]);

  function updateDay(key: keyof OperatingHours, field: keyof OperatingHours["monday"], value: string | boolean) {
    setHours((prev) => ({ ...prev, [key]: { ...(prev[key] as OperatingHours["monday"]), [field]: value } }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await setOperatingHours(tenantId, hours);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao salvar horário.");
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return null;

  return (
    <section className="panel flow-panel">
      <div className="panel-header">
        <div>
          <span className="panel-kicker">HORÁRIO DE FUNCIONAMENTO</span>
          <h2>Quando a loja funciona</h2>
          <p style={{ color: "var(--text-soft)", fontSize: 13, marginTop: 4 }}>
            Fora desse horário o edge pausa o processamento de vídeo pra economizar CPU/GPU — a câmera
            volta a ser processada automaticamente na próxima abertura.
          </p>
        </div>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, fontSize: 13 }}>
        <input
          type="checkbox"
          checked={hours.enabled}
          disabled={!canEdit}
          onChange={(e) => setHours((prev) => ({ ...prev, enabled: e.target.checked }))}
        />
        Ativar pausa automática fora do horário
      </label>

      <div style={{ marginTop: 16, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--text-faint)" }}>
              <th style={{ padding: "6px 12px" }}>Dia</th>
              <th style={{ padding: "6px 12px" }}>Abre</th>
              <th style={{ padding: "6px 12px" }}>Fecha</th>
              <th style={{ padding: "6px 12px" }}>Fechado</th>
            </tr>
          </thead>
          <tbody>
            {WEEKDAYS.map(({ key, label }) => {
              const day = hours[key] as OperatingHours["monday"];
              return (
                <tr key={key} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "6px 12px" }}>{label}</td>
                  <td style={{ padding: "6px 12px" }}>
                    <input
                      type="time"
                      value={day.open}
                      disabled={!canEdit || day.closed}
                      onChange={(e) => updateDay(key, "open", e.target.value)}
                      style={{ padding: "4px 6px", border: "1px solid var(--border)", borderRadius: 6 }}
                    />
                  </td>
                  <td style={{ padding: "6px 12px" }}>
                    <input
                      type="time"
                      value={day.close}
                      disabled={!canEdit || day.closed}
                      onChange={(e) => updateDay(key, "close", e.target.value)}
                      style={{ padding: "4px 6px", border: "1px solid var(--border)", borderRadius: 6 }}
                    />
                  </td>
                  <td style={{ padding: "6px 12px" }}>
                    <input
                      type="checkbox"
                      checked={day.closed}
                      disabled={!canEdit}
                      onChange={(e) => updateDay(key, "closed", e.target.checked)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {error && <div className="login-error" style={{ marginTop: 12 }}>{error}</div>}
      {saved && !error && (
        <div style={{ marginTop: 12, color: "var(--accent)", fontSize: 13 }}>Horário salvo.</div>
      )}

      {canEdit && (
        <button type="button" className="export-button" style={{ marginTop: 16 }} onClick={handleSave} disabled={saving}>
          {saving ? "Salvando..." : "Salvar horário"}
        </button>
      )}
    </section>
  );
}

const BARRIER_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#6366f1", "#ec4899"];

function polygonPoints(points: StoreLayoutPoint[]): string {
  return points.map((p) => `${(p.x * 100).toFixed(2)},${(p.y * 100).toFixed(2)}`).join(" ");
}

function DesenharLojaSection({ tenantId }: { tenantId: string }) {
  const [barriers, setBarriers] = useState<StoreBarrier[]>([]);
  const [draft, setDraft] = useState<StoreLayoutPoint[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [snapshotFailed, setSnapshotFailed] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    getStoreLayout(tenantId)
      .then((result) => {
        setBarriers(result);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [tenantId]);

  const refreshSnapshot = useCallback(() => {
    if (!EDGE_URL) return;
    setSnapshotFailed(false);
    setSnapshotUrl(`${EDGE_URL}/vision/snapshot?t=${Date.now()}`);
  }, []);

  useEffect(() => {
    refreshSnapshot();
  }, [refreshSnapshot]);

  function handleStageClick(event: ReactMouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    setDraft((prev) => [...prev, { x, y }]);
    setSaved(false);
  }

  function undoLastPoint() {
    setDraft((prev) => prev.slice(0, -1));
  }

  function cancelDraft() {
    setDraft([]);
  }

  function finishBarrier() {
    if (draft.length < 3) return;
    const nextIndex = barriers.length + 1;
    setBarriers((prev) => [
      ...prev,
      { id: `barrier-${Date.now()}`, label: `Barreira ${nextIndex}`, points: draft },
    ]);
    setDraft([]);
    setSaved(false);
  }

  function updateLabel(id: string, label: string) {
    setBarriers((prev) => prev.map((b) => (b.id === id ? { ...b, label } : b)));
    setSaved(false);
  }

  function removeBarrier(id: string) {
    setBarriers((prev) => prev.filter((b) => b.id !== id));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await setStoreLayout(tenantId, barriers);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao salvar o desenho da loja.");
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return null;

  return (
    <section className="panel flow-panel" style={{ marginBottom: 18 }}>
      <div className="panel-header">
        <div>
          <span className="panel-kicker">DESENHAR LOJA</span>
          <h2>Marque balcões, prateleiras e outras barreiras</h2>
          <p style={{ color: "var(--text-soft)", fontSize: 13, marginTop: 4 }}>
            Contorne sobre a imagem da câmera os móveis fixos da loja (balcão, prateleira, gôndola...).
            Esse contorno aparece como referência no mapa de calor, pra separar zonas realmente vazias
            de zonas que só estão &quot;frias&quot; porque tem um móvel no caminho — ninguém pisa em
            cima do balcão.
          </p>
        </div>
        <button type="button" className="export-button" onClick={refreshSnapshot}>
          Atualizar imagem
        </button>
      </div>

      {!EDGE_URL || (!snapshotUrl && !snapshotFailed) ? (
        <div className="empty-state" style={{ marginTop: 16 }}>
          <AlertIcon style={{ width: 28, height: 28, color: "var(--text-faint)" }} />
          <strong>Imagem da câmera indisponível</strong>
          <span>Confirme que o dispositivo edge está online e reportando snapshot.</span>
        </div>
      ) : (
        <>
          <div className="heatmap-stage" style={{ marginTop: 16, cursor: "crosshair" }}>
            {snapshotUrl && !snapshotFailed && (
              // eslint-disable-next-line @next/next/no-img-element -- snapshot vem de fora do domínio Next
              <img
                src={snapshotUrl}
                alt="Última imagem capturada pela câmera"
                className="heatmap-snapshot"
                onError={() => setSnapshotFailed(true)}
              />
            )}
            <svg
              ref={svgRef}
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="store-layout-svg"
              onClick={handleStageClick}
            >
              {barriers.map((barrier, i) => (
                <polygon
                  key={barrier.id}
                  points={polygonPoints(barrier.points)}
                  fill={`${BARRIER_COLORS[i % BARRIER_COLORS.length]}33`}
                  stroke={BARRIER_COLORS[i % BARRIER_COLORS.length]}
                  strokeWidth={0.4}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {draft.length > 0 && (
                <polyline
                  points={polygonPoints(draft)}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth={0.4}
                  strokeDasharray="1.5,1"
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {draft.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x * 100}
                  cy={p.y * 100}
                  r={0.8}
                  fill="#ffffff"
                  stroke="#111"
                  strokeWidth={0.2}
                />
              ))}
            </svg>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--text-faint)" }}>
              Clique na imagem pra marcar os cantos da barreira ({draft.length} ponto
              {draft.length === 1 ? "" : "s"}).
            </span>
            <button type="button" className="nav-item" onClick={undoLastPoint} disabled={draft.length === 0}>
              Desfazer último ponto
            </button>
            <button type="button" className="nav-item" onClick={cancelDraft} disabled={draft.length === 0}>
              Cancelar desenho
            </button>
            <button type="button" className="export-button" onClick={finishBarrier} disabled={draft.length < 3}>
              Concluir área
            </button>
          </div>
        </>
      )}

      <div style={{ marginTop: 18, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--text-faint)" }}>
              <th style={{ padding: "8px 12px" }} />
              <th style={{ padding: "8px 12px" }}>Nome</th>
              <th style={{ padding: "8px 12px" }}>Pontos</th>
              <th style={{ padding: "8px 12px" }} />
            </tr>
          </thead>
          <tbody>
            {barriers.map((barrier, i) => (
              <tr key={barrier.id} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={{ padding: "8px 12px" }}>
                  <span
                    style={{
                      display: "inline-block",
                      width: 10,
                      height: 10,
                      borderRadius: 3,
                      background: BARRIER_COLORS[i % BARRIER_COLORS.length],
                    }}
                  />
                </td>
                <td style={{ padding: "8px 12px" }}>
                  <input
                    value={barrier.label}
                    onChange={(e) => updateLabel(barrier.id, e.target.value)}
                    style={{ padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 6, width: "100%" }}
                  />
                </td>
                <td style={{ padding: "8px 12px", color: "var(--text-soft)" }}>{barrier.points.length}</td>
                <td style={{ padding: "8px 12px", textAlign: "right" }}>
                  <button
                    type="button"
                    className="nav-item"
                    style={{ color: "var(--danger, #c0392b)" }}
                    onClick={() => removeBarrier(barrier.id)}
                  >
                    Remover
                  </button>
                </td>
              </tr>
            ))}
            {barriers.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: "16px 12px", color: "var(--text-faint)" }}>
                  Nenhuma barreira desenhada ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {error && <div className="login-error" style={{ marginTop: 12 }}>{error}</div>}
      {saved && !error && <div style={{ marginTop: 12, color: "var(--accent)", fontSize: 13 }}>Desenho salvo.</div>}

      <button
        type="button"
        className="export-button"
        style={{ marginTop: 16 }}
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? "Salvando..." : "Salvar desenho"}
      </button>
    </section>
  );
}

const ARROW_LENGTH = 9; // no viewBox 0-100, comprimento da seta de sentido

function entryArrow(
  pointA: LineCrossingPoint,
  pointB: LineCrossingPoint,
  enterDirection: "A_TO_B" | "B_TO_A",
): { x1: number; y1: number; x2: number; y2: number } | null {
  const dx = pointB.x - pointA.x;
  const dy = pointB.y - pointA.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return null;
  // Normal apontando pro lado B (direita do vetor A->B); A_TO_B entra
  // "rumo ao lado B", B_TO_A entra "rumo ao lado A" (ver
  // edge/src/analytics/line_crossing.py side_for_point).
  const towardSideB = { x: dy / length, y: -dx / length };
  const normal = enterDirection === "A_TO_B" ? towardSideB : { x: -towardSideB.x, y: -towardSideB.y };
  const midX = ((pointA.x + pointB.x) / 2) * 100;
  const midY = ((pointA.y + pointB.y) / 2) * 100;
  return {
    x1: midX,
    y1: midY,
    x2: midX + normal.x * ARROW_LENGTH,
    y2: midY + normal.y * ARROW_LENGTH,
  };
}

function LinhaEntradaSection({ tenantId }: { tenantId: string }) {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [cameras, setCameras] = useState<CameraOption[] | null>(null);
  const [allLines, setAllLines] = useState<Record<string, CameraLineCrossing> | null>(null);
  const [loadingAll, setLoadingAll] = useState(true);
  const [loadAllError, setLoadAllError] = useState<string | null>(null);

  const [cameraId, setCameraId] = useState<string | undefined>(undefined);
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [snapshotFailed, setSnapshotFailed] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [pointA, setPointA] = useState<LineCrossingPoint | null>(null);
  const [pointB, setPointB] = useState<LineCrossingPoint | null>(null);
  const [enterDirection, setEnterDirection] = useState<"A_TO_B" | "B_TO_A">("A_TO_B");
  const [loadingLine, setLoadingLine] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const currentBlobUrlRef = useRef<string | null>(null);

  const loadOverview = useCallback(() => {
    setLoadingAll(true);
    setLoadAllError(null);
    Promise.all([getCameras(), getAllLineCrossings(tenantId)])
      .then(([cams, lines]) => {
        setCameras(cams);
        setAllLines(lines);
      })
      .catch(() => setLoadAllError("Não foi possível carregar a configuração de linha."))
      .finally(() => setLoadingAll(false));
  }, [tenantId]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  // Câmera atualmente responsável pela contagem de entrada/saída (a única
  // com a linha marcada como ativa) - é essa que aparece no modo visualização.
  const activeCameraId = allLines
    ? Object.keys(allLines).find((id) => allLines[id]?.enabled)
    : undefined;
  const activeCamera = cameras?.find((c) => c.id === activeCameraId);
  const activeLine = activeCameraId ? allLines?.[activeCameraId] ?? null : null;

  function startEditing() {
    setCameraId(activeCameraId ?? cameras?.[0]?.id);
    setSaved(false);
    setError(null);
    setMode("edit");
  }

  const applyLine = useCallback((line: CameraLineCrossing | null) => {
    setEnabled(line?.enabled ?? false);
    setPointA(line?.pointA ?? null);
    setPointB(line?.pointB ?? null);
    setEnterDirection(line?.enterDirection ?? "A_TO_B");
  }, []);

  useEffect(() => {
    if (mode !== "edit" || !cameraId) return;
    setLoadingLine(true);
    setSaved(false);
    getLineCrossing(tenantId, cameraId)
      .then((line) => applyLine(line))
      .catch(() => setError("Não foi possível carregar a linha salva desta câmera."))
      .finally(() => setLoadingLine(false));
  }, [mode, tenantId, cameraId, applyLine]);

  // No modo visualização mostra o snapshot da câmera ativa (a que tem a
  // linha ligada); no modo edição, da câmera selecionada no seletor.
  const displayCameraId = mode === "edit" ? cameraId : activeCameraId;

  const refreshSnapshot = useCallback(async () => {
    if (!displayCameraId) return;
    setSnapshotFailed(false);
    try {
      const blobUrl = await getSnapshotBlobUrl({ cameraId: displayCameraId });
      if (currentBlobUrlRef.current) URL.revokeObjectURL(currentBlobUrlRef.current);
      currentBlobUrlRef.current = blobUrl;
      setSnapshotUrl(blobUrl);
    } catch {
      setSnapshotFailed(true);
    }
  }, [displayCameraId]);

  useEffect(() => {
    refreshSnapshot();
  }, [refreshSnapshot]);

  useEffect(() => {
    return () => {
      if (currentBlobUrlRef.current) URL.revokeObjectURL(currentBlobUrlRef.current);
    };
  }, []);

  function handleStageClick(event: ReactMouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const point = {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
    setSaved(false);
    if (!pointA) {
      setPointA(point);
      return;
    }
    if (!pointB) {
      setPointB(point);
      // Terminou de desenhar uma linha nova - ativa por padrão, senão é
      // fácil desenhar, clicar em "Salvar" e continuar sem contar nada
      // porque o checkbox ficou desmarcado de uma câmera anterior.
      setEnabled(true);
      return;
    }
    // Já tinha uma linha completa - um novo clique começa a redesenhar.
    setPointA(point);
    setPointB(null);
  }

  function clearLine() {
    setPointA(null);
    setPointB(null);
    setSaved(false);
  }

  async function handleSave() {
    if (!cameraId || !pointA || !pointB) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await setLineCrossing(tenantId, cameraId, { enabled, pointA, pointB, enterDirection });
      setSaved(true);
      setMode("view");
      loadOverview();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao salvar a linha.");
    } finally {
      setSaving(false);
    }
  }

  const arrow = pointA && pointB ? entryArrow(pointA, pointB, enterDirection) : null;
  const viewArrow = activeLine ? entryArrow(activeLine.pointA, activeLine.pointB, activeLine.enterDirection) : null;

  if (loadingAll) {
    return (
      <section className="panel flow-panel" style={{ marginBottom: 18 }}>
        <div className="panel-header">
          <div>
            <span className="panel-kicker">LINHA DE ENTRADA/SAÍDA</span>
            <h2>Marque a porta da loja numa câmera</h2>
          </div>
        </div>
        <div className="empty-state" style={{ marginTop: 16 }}>
          <AlertIcon style={{ width: 28, height: 28, color: "var(--text-faint)" }} />
          <strong>Carregando...</strong>
        </div>
      </section>
    );
  }

  if (mode === "view") {
    return (
      <section className="panel flow-panel" style={{ marginBottom: 18 }}>
        <div className="panel-header">
          <div>
            <span className="panel-kicker">LINHA DE ENTRADA/SAÍDA</span>
            <h2>{activeCamera ? `Contando pela câmera "${activeCamera.label}"` : "Nenhuma câmera configurada"}</h2>
            <p style={{ color: "var(--text-soft)", fontSize: 13, marginTop: 4 }}>
              {activeCamera
                ? "É essa câmera que alimenta Visitantes hoje, Agora e Saídas hoje no painel. As demais câmeras servem só o mapa de calor."
                : "Escolha uma câmera e trace a linha da porta pra começar a contar entradas e saídas."}
            </p>
          </div>
          <button type="button" className="export-button" onClick={startEditing}>
            Editar
          </button>
        </div>

        {loadAllError && <div className="login-error" style={{ marginTop: 12 }}>{loadAllError}</div>}

        {activeCamera && activeLine ? (
          <div className="heatmap-stage" style={{ marginTop: 16 }}>
            {snapshotUrl && !snapshotFailed ? (
              // eslint-disable-next-line @next/next/no-img-element -- snapshot vem via blob URL, não é asset do Next
              <img src={snapshotUrl} alt={`Imagem da câmera ${activeCamera.label}`} className="heatmap-snapshot" />
            ) : (
              <div className="empty-state">
                <AlertIcon style={{ width: 28, height: 28, color: "var(--text-faint)" }} />
                <strong>Imagem da câmera indisponível</strong>
                <span>Confirme que o dispositivo edge dessa câmera está online.</span>
              </div>
            )}
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="store-layout-svg">
              <defs>
                <marker id="entry-arrow-head-view" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 Z" fill="#22c55e" />
                </marker>
              </defs>
              <line
                x1={activeLine.pointA.x * 100}
                y1={activeLine.pointA.y * 100}
                x2={activeLine.pointB.x * 100}
                y2={activeLine.pointB.y * 100}
                stroke="#ef4444"
                strokeWidth={0.8}
                vectorEffect="non-scaling-stroke"
              />
              {viewArrow && (
                <line
                  x1={viewArrow.x1}
                  y1={viewArrow.y1}
                  x2={viewArrow.x2}
                  y2={viewArrow.y2}
                  stroke="#22c55e"
                  strokeWidth={0.8}
                  vectorEffect="non-scaling-stroke"
                  markerEnd="url(#entry-arrow-head-view)"
                />
              )}
            </svg>
          </div>
        ) : (
          <div className="empty-state" style={{ marginTop: 16 }}>
            <AlertIcon style={{ width: 28, height: 28, color: "var(--text-faint)" }} />
            <strong>Sem linha ativa</strong>
            <span>Clique em "Editar" pra escolher a câmera da entrada e traçar a linha.</span>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="panel flow-panel" style={{ marginBottom: 18 }}>
      <div className="panel-header">
        <div>
          <span className="panel-kicker">LINHA DE ENTRADA/SAÍDA</span>
          <h2>Marque a porta da loja numa câmera</h2>
          <p style={{ color: "var(--text-soft)", fontSize: 13, marginTop: 4 }}>
            Escolha a câmera que enquadra a entrada e clique duas vezes na imagem pra traçar a
            linha — cruzar de um lado pro outro conta como entrada ou saída. As demais câmeras
            continuam servindo só o mapa de calor. A linha salva vale a partir do próximo
            reinício do processo daquela câmera, não em tempo real.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {cameras && cameras.length > 0 && (
            <select
              value={cameraId}
              onChange={(e) => setCameraId(e.target.value)}
              style={{ padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8 }}
            >
              {cameras.map((cam) => (
                <option key={cam.id} value={cam.id}>
                  {cam.label}
                </option>
              ))}
            </select>
          )}
          <button type="button" className="export-button" onClick={refreshSnapshot}>
            Atualizar imagem
          </button>
          <button
            type="button"
            className="nav-item"
            onClick={() => {
              setMode("view");
              setError(null);
            }}
          >
            Cancelar
          </button>
        </div>
      </div>

      {!cameraId || (!snapshotUrl && !snapshotFailed) ? (
        <div className="empty-state" style={{ marginTop: 16 }}>
          <AlertIcon style={{ width: 28, height: 28, color: "var(--text-faint)" }} />
          <strong>Carregando câmera...</strong>
        </div>
      ) : (
        <>
          <div className="heatmap-stage" style={{ marginTop: 16, cursor: "crosshair" }}>
            {snapshotUrl && !snapshotFailed ? (
              // eslint-disable-next-line @next/next/no-img-element -- snapshot vem via blob URL, não é asset do Next
              <img src={snapshotUrl} alt="Imagem da câmera selecionada" className="heatmap-snapshot" />
            ) : (
              <div className="empty-state">
                <AlertIcon style={{ width: 28, height: 28, color: "var(--text-faint)" }} />
                <strong>Imagem da câmera indisponível</strong>
                <span>Confirme que o dispositivo edge dessa câmera está online.</span>
              </div>
            )}
            <svg
              ref={svgRef}
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="store-layout-svg"
              onClick={handleStageClick}
            >
              <defs>
                <marker id="entry-arrow-head" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 Z" fill="#22c55e" />
                </marker>
              </defs>
              {pointA && pointB && (
                <line
                  x1={pointA.x * 100}
                  y1={pointA.y * 100}
                  x2={pointB.x * 100}
                  y2={pointB.y * 100}
                  stroke="#ef4444"
                  strokeWidth={0.8}
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {arrow && (
                <line
                  x1={arrow.x1}
                  y1={arrow.y1}
                  x2={arrow.x2}
                  y2={arrow.y2}
                  stroke="#22c55e"
                  strokeWidth={0.8}
                  vectorEffect="non-scaling-stroke"
                  markerEnd="url(#entry-arrow-head)"
                />
              )}
              {pointA && (
                <circle cx={pointA.x * 100} cy={pointA.y * 100} r={1.1} fill="#ffffff" stroke="#111" strokeWidth={0.3} />
              )}
              {pointB && (
                <circle cx={pointB.x * 100} cy={pointB.y * 100} r={1.1} fill="#ffffff" stroke="#111" strokeWidth={0.3} />
              )}
            </svg>
          </div>

          <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--text-faint)" }}>
              {!pointA
                ? "Clique na imagem pra marcar o primeiro ponto da linha."
                : !pointB
                  ? "Clique de novo pra marcar o segundo ponto."
                  : "Linha traçada — a seta verde mostra o sentido considerado entrada."}
            </span>
            <button type="button" className="nav-item" onClick={clearLine} disabled={!pointA}>
              Refazer linha
            </button>
            <button
              type="button"
              className="nav-item"
              onClick={() => {
                setEnterDirection((prev) => (prev === "A_TO_B" ? "B_TO_A" : "A_TO_B"));
                setSaved(false);
              }}
              disabled={!pointA || !pointB}
            >
              Inverter sentido de entrada
            </button>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => {
                  setEnabled(e.target.checked);
                  setSaved(false);
                }}
              />
              Ativar contagem nesta câmera
            </label>
          </div>
        </>
      )}

      {error && <div className="login-error" style={{ marginTop: 12 }}>{error}</div>}
      {saved && !error && <div style={{ marginTop: 12, color: "var(--accent)", fontSize: 13 }}>Linha salva.</div>}

      <button
        type="button"
        className="export-button"
        style={{ marginTop: 16 }}
        onClick={handleSave}
        disabled={saving || loadingLine || !pointA || !pointB}
      >
        {saving ? "Salvando..." : "Salvar linha"}
      </button>
    </section>
  );
}

function ConfiguracoesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [session, setSession] = useState<SessionUser | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);

  useEffect(() => {
    const user = getStoredUser();
    if (!user) {
      router.replace("/login");
      return;
    }
    setSession(user);
    setTenantId(user.tenantId ?? searchParams.get("tenantId"));
  }, [router, searchParams]);

  if (!session) {
    return (
      <Shell>
        <div className="page-status">Carregando...</div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="page-heading">
        <div>
          <span className="eyebrow">CONFIGURAÇÕES</span>
          <h1>Câmeras, saúde e horário de funcionamento.</h1>
        </div>
      </div>

      <AparenciaSection />
      <SaudeSection />

      {tenantId ? (
        <>
          <CamerasSection session={session} tenantId={tenantId} />
          <LinhaEntradaSection tenantId={tenantId} />
          <DesenharLojaSection tenantId={tenantId} />
          <HorarioSection session={session} tenantId={tenantId} />
        </>
      ) : (
        <div className="panel">
          <div className="empty-state">
            <strong>Selecione um cliente</strong>
            <span>
              Acesse pela tela de Administração e entre em "Gerenciar acessos" de um cliente, ou use
              ?tenantId= na URL.
            </span>
          </div>
        </div>
      )}
    </Shell>
  );
}

export default function ConfiguracoesPage() {
  return (
    <Suspense fallback={null}>
      <ConfiguracoesPageInner />
    </Suspense>
  );
}
