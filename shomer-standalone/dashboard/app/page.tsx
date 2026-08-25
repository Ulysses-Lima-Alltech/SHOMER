"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  getHourly,
  getMovement,
  getOverview,
  HourlyPoint,
  MovementBucket,
  OverviewStats,
} from "../lib/api";
import Shell from "../components/Shell";
import {
  ArrowsIcon,
  ClockIcon,
  PulseIcon,
  TrendUpIcon,
  UsersIcon,
} from "../components/Icons";

// Capacidade máxima da loja para o cálculo de ocupação (%). Não existe
// ainda uma configuração de capacidade por loja no backend — é um valor
// fixo até que essa entidade exista no Postgres.
const STORE_CAPACITY = 88;
const REFRESH_INTERVAL_MS = 4_000;

interface DashboardData {
  overview: OverviewStats;
  hourly: HourlyPoint[];
  movement: MovementBucket[];
}

export default function Dashboard() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [overview, hourly, movement] = await Promise.all([
        getOverview(),
        getHourly(),
        getMovement(),
      ]);
      setData({ overview, hourly, movement });
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace("/login");
        return;
      }
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível carregar os dados da loja.",
      );
    }
  }, [router]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadData]);

  const hourlyCounts = useMemo(
    () => data?.hourly.map((point) => point.count) ?? [],
    [data],
  );

  const chartPoints = useMemo(() => {
    if (hourlyCounts.length === 0) return "";
    const max = Math.max(1, ...hourlyCounts);
    return hourlyCounts
      .map((value, index) => {
        const x = (index / (hourlyCounts.length - 1)) * 100;
        const y = 100 - (value / max) * 82 - 8;
        return `${x},${y}`;
      })
      .join(" ");
  }, [hourlyCounts]);

  if (error && !data) {
    return (
      <Shell>
        <div className="page-status is-error">
          {error} — verifique se a API está rodando em{" "}
          {process.env.NEXT_PUBLIC_API_URL}.
        </div>
      </Shell>
    );
  }

  if (!data) {
    return (
      <Shell>
        <div className="page-heading">
          <div>
            <span className="eyebrow skeleton" style={{ width: 140, height: 12 }} />
            <h1 className="skeleton" style={{ width: 340, height: 44, marginTop: 12 }} />
          </div>
        </div>
        <div className="kpi-grid">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="kpi-card skeleton" style={{ height: 158 }} />
          ))}
        </div>
      </Shell>
    );
  }

  const { overview, movement } = data;
  const occupancyPct = Math.min(
    100,
    Math.round((overview.currentOccupancy / STORE_CAPACITY) * 100),
  );
  const peakLabel =
    overview.peakHour !== null
      ? `${String(overview.peakHour).padStart(2, "0")}:00`
      : "—";

  return (
    <Shell>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            {new Date()
              .toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
              .toUpperCase()}{" "}
            · VISÃO GERAL
          </span>

          <h1>Como está a loja agora.</h1>

          <p>
            Uma leitura em tempo real do movimento da operação e da
            ocupação da loja.
          </p>
        </div>

        <button className="location-button">
          Unidade Centro
          <span>⌄</span>
        </button>
      </div>

      <section className="kpi-grid">
        <article className="kpi-card is-primary">
          <div className="kpi-top">
            <span className="kpi-icon">
              <UsersIcon />
            </span>
          </div>
          <span className="kpi-label">Visitantes hoje</span>
          <div className="kpi-value">
            {overview.visitorsToday.toLocaleString("pt-BR")}
          </div>
          <span className="kpi-context">entradas registradas hoje</span>
        </article>

        <article className="kpi-card">
          <div className="kpi-top">
            <span className="kpi-icon">
              <PulseIcon />
            </span>
            {occupancyPct >= 85 && <span className="kpi-badge warn">Lotado</span>}
          </div>
          <span className="kpi-label">Agora</span>
          <div className="kpi-value">{overview.currentOccupancy}</div>
          <span className="kpi-context">pessoas na loja (últimos 5 min)</span>
        </article>

        <article className="kpi-card">
          <div className="kpi-top">
            <span className="kpi-icon">
              <TrendUpIcon />
            </span>
          </div>
          <span className="kpi-label">Pico do dia</span>
          <div className="kpi-value">{overview.peakToday}</div>
          <span className="kpi-context">às {peakLabel}</span>
        </article>

        <article className="kpi-card">
          <div className="kpi-top">
            <span className="kpi-icon">
              <ArrowsIcon />
            </span>
          </div>
          <span className="kpi-label">Saídas hoje</span>
          <div className="kpi-value">{overview.exitsToday}</div>
          <span className="kpi-context">
            {overview.entriesToday} entradas hoje
          </span>
        </article>
      </section>

      <section className="main-grid">
        <article className="panel flow-panel">
          <div className="panel-header">
            <div>
              <span className="panel-kicker">FLUXO DA LOJA</span>
              <h2>Movimento ao longo do dia</h2>
            </div>

            <div className="segmented">
              <button className="selected">Hoje</button>
            </div>
          </div>

          <div className="chart-wrap">
            <div className="chart-number">{overview.peakToday}</div>
            <div className="chart-number-caption">
              maior número de pessoas na loja ao mesmo tempo, hoje
            </div>

            <svg
              className="flow-chart"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                </linearGradient>
              </defs>

              {chartPoints && (
                <>
                  <polygon
                    points={`0,100 ${chartPoints} 100,100`}
                    fill="url(#chartFill)"
                  />
                  <polyline
                    points={chartPoints}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="1.6"
                    vectorEffect="non-scaling-stroke"
                  />
                </>
              )}
            </svg>

            <div className="chart-axis">
              <span>00h</span>
              <span>06h</span>
              <span>12h</span>
              <span>18h</span>
              <span>24h</span>
            </div>
          </div>
        </article>

        <article className="panel occupancy-panel">
          <span className="panel-kicker">OCUPAÇÃO</span>
          <h2>Capacidade atual</h2>

          <div className="occupancy-value">
            <strong>{occupancyPct}</strong>
            <span>%</span>
          </div>

          <div className="occupancy-bar">
            <span style={{ width: `${occupancyPct}%` }} />
          </div>

          <div className="occupancy-footer">
            <span>{overview.currentOccupancy} pessoas</span>
            <span>{STORE_CAPACITY} capacidade</span>
          </div>

          <div className="occupancy-details">
            <div>
              <span>Pico hoje</span>
              <strong>{overview.peakToday}</strong>
            </div>
            <div>
              <span>Horário de pico</span>
              <strong>{peakLabel}</strong>
            </div>
          </div>

          <div className="quiet-status">
            <span className="status-dot" style={{ background: occupancyPct < 70 ? "var(--success)" : "var(--warning)" }} />
            {occupancyPct < 70
              ? "Fluxo confortável neste momento"
              : "Loja com bastante movimento"}
          </div>
        </article>
      </section>

      <section className="manager-grid">
        <article className="panel movement-panel">
          <div className="panel-header">
            <div>
              <span className="panel-kicker">MOVIMENTO POR HORÁRIO</span>
              <h2>Pressão operacional</h2>
            </div>
          </div>

          <div className="movement-list">
            {movement.map((item) => (
              <div className="movement-row" key={item.period}>
                <span className="movement-period">{item.period}</span>
                <div className="movement-track">
                  <span style={{ width: `${item.value}%` }} />
                </div>
                <strong>{item.label}</strong>
              </div>
            ))}
          </div>

          <p className="movement-note">
            {error
              ? `Última atualização falhou (${error}); mostrando os últimos dados carregados.`
              : "Atualiza automaticamente a cada 15 segundos."}
          </p>
        </article>

        <article className="panel performance-panel">
          <span className="panel-kicker">TENDÊNCIAS</span>
          <h2>Como a loja se compara ao longo do tempo</h2>

          <p style={{ marginTop: 16, color: "var(--text-soft)", fontSize: 13, lineHeight: 1.6 }}>
            Comparativos com dias e semanas anteriores, padrão médio por
            horário e exportação de dados ficam nos Relatórios — conforme
            mais dias forem registrados, essa análise fica mais completa.
          </p>

          <Link href="/reports" className="text-button" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 18 }}>
            <ClockIcon className="alert-banner-icon" style={{ width: 15, height: 15 }} />
            Ver relatórios completos →
          </Link>
        </article>
      </section>
    </Shell>
  );
}
