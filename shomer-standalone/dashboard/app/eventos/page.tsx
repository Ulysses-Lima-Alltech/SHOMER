"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, EventLogEntry, getEvents } from "../../lib/api";
import Shell from "../../components/Shell";
import { PulseIcon } from "../../components/Icons";

const REFRESH_INTERVAL_MS = 15_000;

/** Só cruzamento de linha - não rastreio bruto de pessoa em quadro (esse
 * existe só para alimentar o mapa de calor, ver app/heatmap). */
function describeCrossing(payload: Record<string, unknown>): string {
  const direction = String(payload.direction ?? "").toUpperCase();
  return direction === "ENTER" ? "Pessoa entrou" : direction === "EXIT" ? "Pessoa saiu" : "Cruzamento de linha";
}

export default function EventosPage() {
  const router = useRouter();
  const [events, setEvents] = useState<EventLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await getEvents({ type: "person.line_crossed", limit: 100 });
      setEvents(result);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace("/login");
        return;
      }
      setError(err instanceof Error ? err.message : "Não foi possível carregar os eventos.");
    }
  }, [router]);

  useEffect(() => {
    load();
    const interval = setInterval(load, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

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
          <h1>Entradas e saídas em tempo real.</h1>
          <p>Cada linha é uma pessoa cruzando a linha de entrada/saída de uma câmera.</p>
        </div>
      </div>

      {!events ? (
        <div className="panel" style={{ height: 420 }} />
      ) : events.length === 0 ? (
        <div className="panel">
          <div className="empty-state">
            <PulseIcon style={{ width: 32, height: 32, color: "var(--text-faint)" }} />
            <strong>Nenhuma entrada ou saída registrada ainda</strong>
            <span>Assim que alguém cruzar a linha de uma câmera, aparece aqui.</span>
          </div>
        </div>
      ) : (
        <section className="panel flow-panel">
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--text-faint)" }}>
                  <th style={{ padding: "8px 12px" }}>Horário</th>
                  <th style={{ padding: "8px 12px" }}>Evento</th>
                  <th style={{ padding: "8px 12px" }}>Câmera</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.eventId} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                      {new Date(event.timestamp).toLocaleTimeString("pt-BR")}
                    </td>
                    <td style={{ padding: "8px 12px", fontWeight: 500 }}>
                      {describeCrossing(event.payload)}
                    </td>
                    <td style={{ padding: "8px 12px", color: "var(--text-soft)" }}>
                      {String(event.payload.cameraId ?? "—")}
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
