"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  DailySummary,
  getDaily,
  getHourlyPattern,
  HourlyPoint,
} from "../../lib/api";
import Shell from "../../components/Shell";
import { CalendarIcon, DownloadIcon } from "../../components/Icons";

type RangeOption = 7 | 14 | 30;

const RANGE_OPTIONS: Array<{ value: RangeOption; label: string }> = [
  { value: 7, label: "7 dias" },
  { value: 14, label: "14 dias" },
  { value: 30, label: "30 dias" },
];

const WEEKDAY_LABELS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function formatShortDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  const day = date.getDate().toString().padStart(2, "0");
  return `${WEEKDAY_LABELS[date.getDay()]} ${day}`;
}

function downloadCsv(summary: DailySummary) {
  const header = "data,visitantes\n";
  const rows = summary.days.map((d) => `${d.date},${d.count}`).join("\n");
  const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `shomer-visitantes-${summary.days[0]?.date ?? "relatorio"}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const router = useRouter();
  const [range, setRange] = useState<RangeOption>(7);
  const [daily, setDaily] = useState<DailySummary | null>(null);
  const [pattern, setPattern] = useState<HourlyPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (days: RangeOption) => {
      try {
        const [dailySummary, hourlyPattern] = await Promise.all([
          getDaily(days),
          getHourlyPattern(days),
        ]);
        setDaily(dailySummary);
        setPattern(hourlyPattern);
        setError(null);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login");
          return;
        }
        setError(
          err instanceof Error
            ? err.message
            : "Não foi possível carregar os relatórios.",
        );
      }
    },
    [router],
  );

  useEffect(() => {
    load(range);
  }, [range, load]);

  const maxDaily = useMemo(
    () => Math.max(1, ...(daily?.days.map((d) => d.count) ?? [0])),
    [daily],
  );

  const maxPattern = useMemo(
    () => Math.max(1, ...(pattern?.map((p) => p.count) ?? [0])),
    [pattern],
  );

  const todayKey = new Date().toISOString().slice(0, 10);

  if (error && !daily) {
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
          <span className="eyebrow">RELATÓRIOS</span>
          <h1>Tendências da loja.</h1>
          <p>
            Volume de visitantes e padrão de movimento ao longo do tempo,
            para planejar escala e identificar horários críticos.
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
          disabled={!daily || daily.totalVisitors === 0}
          onClick={() => daily && downloadCsv(daily)}
        >
          <DownloadIcon />
          Exportar CSV
        </button>
      </div>

      {!daily || !pattern ? (
        <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="kpi-card skeleton" style={{ height: 130 }} />
          ))}
        </div>
      ) : daily.totalVisitors === 0 ? (
        <div className="panel">
          <div className="empty-state">
            <CalendarIcon style={{ width: 32, height: 32, color: "var(--text-faint)" }} />
            <strong>Ainda não há dados nesse período</strong>
            <span>
              Assim que o dispositivo edge começar a enviar eventos, os
              relatórios aparecem aqui automaticamente.
            </span>
          </div>
        </div>
      ) : (
        <>
          <section className="summary-cards">
            <article className="kpi-card">
              <span className="kpi-label">Total de visitantes</span>
              <div className="kpi-value">
                {daily.totalVisitors.toLocaleString("pt-BR")}
              </div>
              <span className="kpi-context">nos últimos {range} dias</span>
            </article>

            <article className="kpi-card">
              <span className="kpi-label">Média diária</span>
              <div className="kpi-value">
                {daily.averagePerDay.toLocaleString("pt-BR")}
              </div>
              <span className="kpi-context">visitantes por dia</span>
            </article>

            <article className="kpi-card">
              <span className="kpi-label">Melhor dia</span>
              <div className="kpi-value">
                {daily.bestDay ? daily.bestDay.count.toLocaleString("pt-BR") : "—"}
              </div>
              <span className="kpi-context">
                {daily.bestDay ? formatShortDate(daily.bestDay.date) : "sem dados"}
              </span>
            </article>
          </section>

          <section className="panel flow-panel">
            <div className="panel-header">
              <div>
                <span className="panel-kicker">VISITANTES POR DIA</span>
                <h2>
                  Últimos {range} dias
                </h2>
              </div>
            </div>

            <div className="daily-chart">
              {daily.days.map((d) => (
                <div
                  key={d.date}
                  className={`daily-bar-col ${d.date === todayKey ? "is-today" : ""}`}
                >
                  <span className="daily-bar-tooltip">{d.count}</span>
                  <div
                    className="daily-bar"
                    style={{
                      height: `${Math.max(2, (d.count / maxDaily) * 100)}%`,
                    }}
                  />
                  {(range <= 14 || d.date === todayKey) && (
                    <span className="daily-bar-label">{formatShortDate(d.date)}</span>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="panel flow-panel" style={{ marginTop: 18 }}>
            <div className="panel-header">
              <div>
                <span className="panel-kicker">PADRÃO MÉDIO</span>
                <h2>Movimento típico por horário</h2>
              </div>
            </div>

            <p style={{ color: "var(--text-soft)", fontSize: 13, marginTop: 4 }}>
              Média de visitantes por hora, calculada sobre os últimos{" "}
              {range} dias — ajuda a planejar escala de equipe.
            </p>

            <div className="pattern-chart">
              {pattern.map((p) => (
                <div key={p.hour} className="pattern-bar-col" title={`${p.hour}h — ${p.count}`}>
                  <div
                    className={`pattern-bar ${p.count === maxPattern && maxPattern > 0 ? "is-peak" : ""}`}
                    style={{ height: `${Math.max(2, (p.count / maxPattern) * 100)}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="chart-axis" style={{ marginTop: 8, position: "static" }}>
              <span>00h</span>
              <span>06h</span>
              <span>12h</span>
              <span>18h</span>
              <span>24h</span>
            </div>
          </section>
        </>
      )}
    </Shell>
  );
}
