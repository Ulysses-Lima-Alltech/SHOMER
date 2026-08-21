"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ApiError,
  createDevice,
  deleteDevice,
  EdgeHealthStatus,
  getDevices,
  getEdgeHealth,
  getOperatingHours,
  getStoredUser,
  ManagedDevice,
  OperatingHours,
  SessionUser,
  setOperatingHours,
} from "../../lib/api";
import Shell from "../../components/Shell";
import { ACCENT_OPTIONS, Accent, useTheme } from "../../components/Shell";
import { AlertIcon, ClockIcon, PulseIcon, UsersIcon } from "../../components/Icons";

const REFRESH_INTERVAL_MS = 15_000;
const STALE_AFTER_MS = 90_000;

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

export default function ConfiguracoesPage() {
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
