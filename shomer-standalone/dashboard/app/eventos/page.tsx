"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, EventLogEntry, getEvents } from "../../lib/api";
import Shell from "../../components/Shell";
import { PulseIcon } from "../../components/Icons";

const REFRESH_INTERVAL_MS = 15_000;

const EVENT_TYPES: Array<{ value: string; label: string }> = [
  { value: "", label: "Todos os tipos" },
  { value: "person.detected", label: "Pessoa detectada" },
  { value: "person.line_crossed", label: "Cruzamento de linha" },
  { value: "edge.health.reported", label: "Saúde do dispositivo" },
  { value: "demographics.estimated", label: "Demografia estimada" },
];

function summarizePayload(type: string, payload: Record<string, unknown>): string {
  switch (type) {
    case "person.detected": {
      const floorPoint = payload.floorPoint as { x: number; y: number } | undefined;
      return `track ${payload.trackId ?? "?"}${
        floorPoint ? ` · posição (${floorPoint.x}, ${floorPoint.y})` : ""
      }`;
    }
    case "person.line_crossed":
      return `track ${payload.trackId ?? "?"} · ${payload.direction ?? "?"} · linha ${payload.lineId ?? "?"}`;
    case "edge.health.reported":
      return `${payload.status ?? "?"} · câmera ${payload.cameraConnected ? "conectada" : "desconectada"}`;
    case "demographics.estimated":
      return `idade ~${payload.estimatedAge ?? "?"} · gênero ${payload.estimatedGender ?? "?"}`;
    default:
      return JSON.stringify(payload).slice(0, 80);
  }
}

export default function EventosPage() {
  const router = useRouter();
  const [type, setType] = useState("");
  const [events, setEvents] = useState<EventLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (t: string) => {
      try {
        const result = await getEvents({ type: t || undefined, limit: 100 });
        setEvents(result);
        setError(null);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login");
          return;
        }
        setError(err instanceof Error ? err.message : "Não foi possível carregar os eventos.");
      }
    },
    [router],
  );

  useEffect(() => {
    load(type);
    const interval = setInterval(() => load(type), REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [type, load]);

  if (error && !events) {
    return (
      <Shell>
        <div className="page-status is-error">{error}</div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="page-heading">
        <div>
          <span className="eyebrow">EVENTOS</span>
          <h1>Log de eventos em tempo real.</h1>
          <p>Fluxo bruto de eventos recebidos pelo sistema, para depuração e auditoria.</p>
        </div>
      </div>

      <div className="reports-toolbar">
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="segmented"
          style={{ padding: "8px 12px", border: "1px solid var(--border)" }}
        >
          {EVENT_TYPES.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {!events ? (
        <div className="panel" style={{ height: 420 }} />
      ) : events.length === 0 ? (
        <div className="panel">
          <div className="empty-state">
            <PulseIcon style={{ width: 32, height: 32, color: "var(--text-faint)" }} />
            <strong>Nenhum evento encontrado</strong>
            <span>Assim que o edge começar a enviar eventos, eles aparecem aqui.</span>
          </div>
        </div>
      ) : (
        <section className="panel flow-panel">
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--text-faint)" }}>
                  <th style={{ padding: "8px 12px" }}>Horário</th>
                  <th style={{ padding: "8px 12px" }}>Tipo</th>
                  <th style={{ padding: "8px 12px" }}>Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.eventId} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                      {new Date(event.timestamp).toLocaleTimeString("pt-BR")}
                    </td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>{event.type}</td>
                    <td style={{ padding: "8px 12px", color: "var(--text-soft)" }}>
                      {summarizePayload(event.type, event.payload)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </Shell>
  );
}
