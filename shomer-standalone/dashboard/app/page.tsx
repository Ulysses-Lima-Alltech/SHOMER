"use client";

import { useEffect, useMemo, useState } from "react";

type Appearance = "light" | "dark";
type Accent = "aurora" | "copper" | "lime" | "orchid";

const hourly = [
  18, 24, 20, 31, 45, 62, 71, 88, 101, 126, 118, 147,
  165, 151, 178, 160, 142, 129, 114, 93, 72, 54, 39, 25,
];

const movement = [
  { period: "09–11", label: "Baixo", value: 32 },
  { period: "11–13", label: "Médio", value: 58 },
  { period: "13–16", label: "Alto", value: 92 },
  { period: "16–19", label: "Médio", value: 64 },
  { period: "19–21", label: "Baixo", value: 37 },
];

export default function Dashboard() {
  const [appearance, setAppearance] = useState<Appearance>("light");
  const [accent, setAccent] = useState<Accent>("aurora");

  useEffect(() => {
    const savedAppearance = localStorage.getItem(
      "shomer-appearance"
    ) as Appearance | null;

    const savedAccent = localStorage.getItem(
      "shomer-accent"
    ) as Accent | null;

    if (savedAppearance === "light" || savedAppearance === "dark") {
      setAppearance(savedAppearance);
    } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      setAppearance("dark");
    }

    if (
      savedAccent === "aurora" ||
      savedAccent === "copper" ||
      savedAccent === "lime" ||
      savedAccent === "orchid"
    ) {
      setAccent(savedAccent);
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = appearance;
    document.documentElement.dataset.accent = accent;

    localStorage.setItem("shomer-appearance", appearance);
    localStorage.setItem("shomer-accent", accent);
  }, [appearance, accent]);

  const chartPoints = useMemo(() => {
    const max = Math.max(...hourly);

    return hourly
      .map((value, index) => {
        const x = (index / (hourly.length - 1)) * 100;
        const y = 100 - (value / max) * 82 - 8;

        return `${x},${y}`;
      })
      .join(" ");
  }, []);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">S</span>
          <span>SHOMER</span>
        </div>

        <nav className="nav">
          <button className="nav-item active">Visão geral</button>
          <button className="nav-item">Monitoramento</button>
          <button className="nav-item">Eventos</button>
          <button className="nav-item">Relatórios</button>
          <button className="nav-item">Dispositivos</button>
        </nav>

        <div className="top-actions">
          <div className="accent-switcher">
            {(["aurora", "copper", "lime", "orchid"] as Accent[]).map(
              (item) => (
                <button
                  key={item}
                  aria-label={`Tema ${item}`}
                  className={`accent-dot accent-${item} ${
                    accent === item ? "selected" : ""
                  }`}
                  onClick={() => setAccent(item)}
                />
              )
            )}
          </div>

          <button
            className="theme-toggle"
            onClick={() =>
              setAppearance(appearance === "light" ? "dark" : "light")
            }
            aria-label="Alternar tema"
          >
            {appearance === "light" ? "☾" : "☼"}
          </button>

          <button className="avatar">UL</button>
        </div>
      </header>

      <section className="content">
        <div className="page-heading">
          <div>
            <span className="eyebrow">07 AGO · VISÃO GERAL</span>

            <h1>Como está a loja hoje.</h1>

            <p>
              Uma leitura simples do movimento da operação, ocupação e
              desempenho do dia.
            </p>
          </div>

          <button className="location-button">
            Unidade Centro
            <span>⌄</span>
          </button>
        </div>

        <section className="hero-grid">
          <article className="metric-primary">
            <span className="metric-label">Visitantes hoje</span>

            <div className="metric-value-row">
              <strong>1.284</strong>
              <span className="trend positive">↑ 12,8%</span>
            </div>

            <span className="metric-context">comparado com ontem</span>
          </article>

          <article className="metric-quiet">
            <span className="metric-label">Agora</span>
            <strong>37</strong>
            <span className="metric-context">pessoas na loja</span>
          </article>

          <article className="metric-quiet">
            <span className="metric-label">Pico do dia</span>
            <strong>178</strong>
            <span className="metric-context">às 14:20</span>
          </article>

          <article className="metric-quiet">
            <span className="metric-label">Fluxo</span>
            <strong>684</strong>
            <span className="metric-context">entradas · 600 saídas</span>
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
                <button>7 dias</button>
                <button>30 dias</button>
              </div>
            </div>

            <div className="chart-wrap">
              <div className="chart-number">178</div>

              <div className="chart-number-caption">
                maior movimento registrado hoje
              </div>

              <svg
                className="flow-chart"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient
                    id="chartFill"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor="var(--accent)"
                      stopOpacity="0.22"
                    />

                    <stop
                      offset="100%"
                      stopColor="var(--accent)"
                      stopOpacity="0"
                    />
                  </linearGradient>
                </defs>

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
              <strong>42</strong>
              <span>%</span>
            </div>

            <div className="occupancy-bar">
              <span />
            </div>

            <div className="occupancy-footer">
              <span>37 pessoas</span>
              <span>88 capacidade</span>
            </div>

            <div className="occupancy-details">
              <div>
                <span>Pico hoje</span>
                <strong>178</strong>
              </div>

              <div>
                <span>Horário de pico</span>
                <strong>14:20</strong>
              </div>
            </div>

            <div className="quiet-status">
              <span className="status-dot" />
              Fluxo confortável neste momento
            </div>
          </article>
        </section>

        <section className="manager-grid">
          <article className="panel performance-panel">
            <div className="panel-header">
              <div>
                <span className="panel-kicker">DESEMPENHO</span>
                <h2>Comparativo da loja</h2>
              </div>

              <span className="performance-positive">Acima da média</span>
            </div>

            <div className="comparison-list">
              <div className="comparison-row current">
                <div>
                  <span>Hoje</span>
                  <small>até este horário</small>
                </div>

                <strong>1.284</strong>
              </div>

              <div className="comparison-row">
                <div>
                  <span>Ontem</span>
                  <small>mesmo período</small>
                </div>

                <strong>1.138</strong>
              </div>

              <div className="comparison-row">
                <div>
                  <span>Média 7 dias</span>
                  <small>mesmo período</small>
                </div>

                <strong>1.176</strong>
              </div>
            </div>

            <div className="comparison-summary">
              <div>
                <span>vs. ontem</span>
                <strong>+12,8%</strong>
              </div>

              <div>
                <span>vs. média</span>
                <strong>+9,2%</strong>
              </div>
            </div>
          </article>

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
              O maior movimento ocorre entre 13h e 16h. Esse período tende a
              exigir maior atenção da operação.
            </p>
          </article>
        </section>
      </section>
    </main>
  );
}
