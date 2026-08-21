"use client";

import { useState } from "react";
import { ReportPeriod } from "../lib/api";

const QUICK_OPTIONS: Array<{ days: number; label: string }> = [
  { days: 7, label: "7 dias" },
  { days: 15, label: "15 dias" },
  { days: 30, label: "30 dias" },
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

interface ExportPeriodDialogProps {
  title: string;
  description?: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: (period: ReportPeriod) => void;
  onClose: () => void;
}

export default function ExportPeriodDialog({
  title,
  description,
  confirmLabel = "Exportar",
  busy = false,
  onConfirm,
  onClose,
}: ExportPeriodDialogProps) {
  const [mode, setMode] = useState<"quick" | "custom">("quick");
  const [days, setDays] = useState(7);
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);

  function handleConfirm() {
    if (mode === "custom") {
      if (!from || !to) {
        setError("Selecione as duas datas.");
        return;
      }
      if (from > to) {
        setError("A data inicial precisa ser antes da final.");
        return;
      }
      onConfirm({ from, to });
      return;
    }
    onConfirm({ days });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: 18, marginBottom: 4 }}>{title}</h2>
        {description && (
          <p style={{ color: "var(--text-soft)", fontSize: 13, marginBottom: 16 }}>{description}</p>
        )}

        <div className="segmented" style={{ marginBottom: 16 }}>
          <button className={mode === "quick" ? "selected" : ""} onClick={() => setMode("quick")}>
            Período rápido
          </button>
          <button className={mode === "custom" ? "selected" : ""} onClick={() => setMode("custom")}>
            Datas personalizadas
          </button>
        </div>

        {mode === "quick" ? (
          <div style={{ display: "flex", gap: 8 }}>
            {QUICK_OPTIONS.map((opt) => (
              <button
                key={opt.days}
                type="button"
                className={`nav-item ${days === opt.days ? "active" : ""}`}
                onClick={() => setDays(opt.days)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", gap: 10 }}>
            <label style={{ display: "flex", flexDirection: "column", fontSize: 12, gap: 4, flex: 1 }}>
              De
              <input
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
                style={{ padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8 }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", fontSize: 12, gap: 4, flex: 1 }}>
              Até
              <input
                type="date"
                value={to}
                min={from}
                max={todayIso()}
                onChange={(e) => setTo(e.target.value)}
                style={{ padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8 }}
              />
            </label>
          </div>
        )}

        {error && <div className="login-error" style={{ marginTop: 12 }}>{error}</div>}

        <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
          <button type="button" className="nav-item" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className="export-button" onClick={handleConfirm} disabled={busy}>
            {busy ? "Gerando..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
