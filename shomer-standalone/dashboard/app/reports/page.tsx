"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import {
  ApiError,
  DailyHourlyRow,
  DailySummary,
  getDaily,
  getDailyHourlyMatrix,
  getHourlyPattern,
  getOverview,
  getStoredUser,
  getTenantSummaries,
  HourlyPoint,
  OverviewStats,
  periodLabel,
  ReportPeriod,
  SessionUser,
  TenantSummary,
} from "../../lib/api";
import Shell from "../../components/Shell";
import ExportPeriodDialog from "../../components/ExportPeriodDialog";
import { CalendarIcon, DownloadIcon } from "../../components/Icons";

type RangeOption = 7 | 14 | 30;

const RANGE_OPTIONS: Array<{ value: RangeOption; label: string }> = [
  { value: 7, label: "7 dias" },
  { value: 14, label: "14 dias" },
  { value: 30, label: "30 dias" },
];

const WEEKDAY_LABELS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const HOUR_LABELS = Array.from({ length: 24 }, (_, h) => `${h.toString().padStart(2, "0")}h`);

function formatShortDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  const day = date.getDate().toString().padStart(2, "0");
  return `${WEEKDAY_LABELS[date.getDay()]} ${day}`;
}

function formatFullDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  return date.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Exporta um workbook .xlsx (não CSV) com várias abas — o cliente pediu o
 * relatório "completo", com datas nas linhas e horários/itens nas colunas,
 * trazendo tudo que o sistema consegue captar, não só uma tabela solta.
 */
function downloadWorkbook(
  period: ReportPeriod,
  daily: DailySummary,
  pattern: HourlyPoint[],
  matrix: DailyHourlyRow[],
  overview: OverviewStats,
) {
  const wb = XLSX.utils.book_new();

  const resumoRows = [
    ["Relatório SHOMER — resumo da loja"],
    [`Gerado em ${new Date().toLocaleString("pt-BR")}`],
    [`Período analisado: ${periodLabel(period)}`],
    [],
    ["Métrica", "Valor"],
    ["Total de visitantes no período", daily.totalVisitors],
    ["Média diária de visitantes", daily.averagePerDay],
    ["Melhor dia (data)", daily.bestDay ? formatFullDate(daily.bestDay.date) : "sem dados"],
    ["Melhor dia (visitantes)", daily.bestDay?.count ?? 0],
    [],
    ["Instantâneo de hoje", ""],
    ["Visitantes hoje", overview.visitorsToday],
    ["Pessoas na loja agora", overview.currentOccupancy],
    ["Pico do dia (pessoas)", overview.peakToday],
    ["Horário de pico", overview.peakHour !== null ? `${overview.peakHour}h` : "—"],
    ["Entradas hoje", overview.entriesToday],
    ["Saídas hoje", overview.exitsToday],
  ];
  const resumoSheet = XLSX.utils.aoa_to_sheet(resumoRows);
  resumoSheet["!cols"] = [{ wch: 34 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, resumoSheet, "Resumo");

  const diaRows = [
    ["Data", "Dia da semana", "Visitantes"],
    ...daily.days.map((d) => [d.date, formatShortDate(d.date), d.count]),
  ];
  const diaSheet = XLSX.utils.aoa_to_sheet(diaRows);
  diaSheet["!cols"] = [{ wch: 12 }, { wch: 14 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, diaSheet, "Visitantes por dia");

  const matrixRows = [
    ["Data", ...HOUR_LABELS],
    ...matrix.map((row) => [row.date, ...row.hours]),
  ];
  const matrixSheet = XLSX.utils.aoa_to_sheet(matrixRows);
  matrixSheet["!cols"] = [{ wch: 12 }, ...HOUR_LABELS.map(() => ({ wch: 6 }))];
  XLSX.utils.book_append_sheet(wb, matrixSheet, "Movimento por dia e hora");

  const patternRows = [
    ["Hora", "Média de visitantes"],
    ...pattern.map((p) => [`${p.hour}h`, p.count]),
  ];
  const patternSheet = XLSX.utils.aoa_to_sheet(patternRows);
  patternSheet["!cols"] = [{ wch: 8 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, patternSheet, "Padrão médio por horário");

  XLSX.writeFile(wb, `shomer-relatorio-${daily.days[0]?.date ?? "completo"}.xlsx`);
}

function ClientReportsView() {
  const router = useRouter();
  const [range, setRange] = useState<RangeOption>(7);
  const [daily, setDaily] = useState<DailySummary | null>(null);
  const [pattern, setPattern] = useState<HourlyPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);

  const load = useCallback(
    async (days: RangeOption) => {
      try {
        const [dailySummary, hourlyPattern] = await Promise.all([
          getDaily({ days }),
          getHourlyPattern({ days }),
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

  async function handleExport(period: ReportPeriod) {
    setExporting(true);
    try {
      const [dailySummary, hourlyPattern, matrix, overview] = await Promise.all([
        getDaily(period),
        getHourlyPattern(period),
        getDailyHourlyMatrix(period),
        getOverview(),
      ]);
      downloadWorkbook(period, dailySummary, hourlyPattern, matrix, overview);
      setShowExportDialog(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao gerar o relatório.");
    } finally {
      setExporting(false);
    }
  }

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
    return <div className="page-status is-error">{error}</div>;
  }

  return (
    <>
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
          onClick={() => setShowExportDialog(true)}
        >
          <DownloadIcon />
          Exportar relatório completo (.xlsx)
        </button>
      </div>

      {showExportDialog && (
        <ExportPeriodDialog
          title="Exportar relatório"
          description="Escolha o período que deve entrar no arquivo — pode ser diferente do que está sendo exibido na tela."
          confirmLabel="Exportar .xlsx"
          busy={exporting}
          onConfirm={handleExport}
          onClose={() => setShowExportDialog(false)}
        />
      )}

      {error && <div className="login-error" style={{ marginTop: 12 }}>{error}</div>}

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
    </>
  );
}

/**
 * Exporta um comparativo entre os clientes selecionados: uma aba "Resumo"
 * com um cliente por linha, e uma aba "Visitantes por dia" em formato de
 * matriz (datas nas linhas, um cliente por coluna) pra comparar visual e
 * rapidamente quem está em alta ou em queda.
 */
function downloadTenantsWorkbook(
  period: ReportPeriod,
  selected: TenantSummary[],
  dailyByTenant: Map<string, DailySummary>,
) {
  const wb = XLSX.utils.book_new();

  const resumoRows = [
    ["Relatório SHOMER — clientes selecionados"],
    [`Gerado em ${new Date().toLocaleString("pt-BR")}`],
    [`Período analisado: ${periodLabel(period)}`],
    [],
    ["Cliente", "Código", "Status", "Usuários", "Visitantes no período", "Média diária", "Melhor dia", "Último evento"],
    ...selected.map((t) => {
      const daily = dailyByTenant.get(t.tenantId);
      return [
        t.tenantName,
        t.tenantId,
        t.active ? "Ativo" : "Inativo",
        t.userCount,
        daily?.totalVisitors ?? 0,
        daily?.averagePerDay ?? 0,
        daily?.bestDay ? `${daily.bestDay.date} (${daily.bestDay.count})` : "sem dados",
        t.lastEventAt ? new Date(t.lastEventAt).toLocaleString("pt-BR") : "sem eventos",
      ];
    }),
  ];
  const resumoSheet = XLSX.utils.aoa_to_sheet(resumoRows);
  resumoSheet["!cols"] = [
    { wch: 22 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 20 },
    { wch: 14 },
    { wch: 20 },
    { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, resumoSheet, "Resumo");

  const allDates = Array.from(
    new Set(selected.flatMap((t) => (dailyByTenant.get(t.tenantId)?.days ?? []).map((d) => d.date))),
  ).sort();
  const matrixRows = [
    ["Data", ...selected.map((t) => t.tenantName)],
    ...allDates.map((date) => [
      date,
      ...selected.map((t) => {
        const daily = dailyByTenant.get(t.tenantId);
        return daily?.days.find((d) => d.date === date)?.count ?? 0;
      }),
    ]),
  ];
  const matrixSheet = XLSX.utils.aoa_to_sheet(matrixRows);
  matrixSheet["!cols"] = [{ wch: 12 }, ...selected.map(() => ({ wch: 16 }))];
  XLSX.utils.book_append_sheet(wb, matrixSheet, "Visitantes por dia");

  XLSX.writeFile(wb, `shomer-clientes-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/**
 * Admin global não tem loja própria — um relatório "de uma loja" não faz
 * sentido pra ele. Aqui ele vê os clientes em geral: quem está ativo, quem
 * sumiu, volume de visitantes por cliente no período — com a opção de
 * selecionar um ou mais clientes e exportar um comparativo.
 */
function AdminReportsView() {
  const router = useRouter();
  const [summaries, setSummaries] = useState<TenantSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    getTenantSummaries()
      .then(setSummaries)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login");
          return;
        }
        setError(err instanceof Error ? err.message : "Não foi possível carregar os clientes.");
      });
  }, [router]);

  const totalVisitors = useMemo(
    () => (summaries ?? []).reduce((sum, t) => sum + t.visitorsInPeriod, 0),
    [summaries],
  );
  const activeCount = useMemo(() => (summaries ?? []).filter((t) => t.active).length, [summaries]);

  function toggleSelected(tenantId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(tenantId)) next.delete(tenantId);
      else next.add(tenantId);
      return next;
    });
  }

  function toggleSelectAll() {
    if (!summaries) return;
    setSelectedIds((prev) => (prev.size === summaries.length ? new Set() : new Set(summaries.map((t) => t.tenantId))));
  }

  async function handleExport(period: ReportPeriod) {
    if (!summaries) return;
    const selected = summaries.filter((t) => selectedIds.has(t.tenantId));
    setExporting(true);
    try {
      const dailyResults = await Promise.all(selected.map((t) => getDaily(period, t.tenantId)));
      const dailyByTenant = new Map(selected.map((t, i) => [t.tenantId, dailyResults[i]]));
      downloadTenantsWorkbook(period, selected, dailyByTenant);
      setShowExportDialog(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao gerar o comparativo.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">RELATÓRIOS</span>
          <h1>Clientes em geral.</h1>
          <p>Visão consolidada de todos os clientes — não de uma loja específica.</p>
        </div>
      </div>

      {error && <div className="login-error" style={{ marginBottom: 12 }}>{error}</div>}

      {!summaries ? (
        <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="kpi-card skeleton" style={{ height: 130 }} />
          ))}
        </div>
      ) : (
        <>
          <section className="summary-cards">
            <article className="kpi-card">
              <span className="kpi-label">Clientes ativos</span>
              <div className="kpi-value">{activeCount}</div>
              <span className="kpi-context">de {summaries.length} cadastrados</span>
            </article>
            <article className="kpi-card">
              <span className="kpi-label">Visitantes (todos os clientes)</span>
              <div className="kpi-value">{totalVisitors.toLocaleString("pt-BR")}</div>
              <span className="kpi-context">últimos 30 dias</span>
            </article>
          </section>

          <section className="panel flow-panel">
            <div className="panel-header">
              <div>
                <span className="panel-kicker">CLIENTES</span>
                <h2>Atividade por cliente</h2>
                <p style={{ color: "var(--text-soft)", fontSize: 13, marginTop: 4 }}>
                  Selecione um ou mais clientes pra exportar um comparativo em Excel.
                </p>
              </div>
              <button
                className="export-button"
                disabled={selectedIds.size === 0}
                onClick={() => setShowExportDialog(true)}
              >
                <DownloadIcon />
                Exportar selecionados ({selectedIds.size})
              </button>
            </div>

            <div style={{ marginTop: 16, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--text-faint)" }}>
                    <th style={{ padding: "8px 12px" }}>
                      <input
                        type="checkbox"
                        checked={summaries.length > 0 && selectedIds.size === summaries.length}
                        onChange={toggleSelectAll}
                        aria-label="Selecionar todos"
                      />
                    </th>
                    <th style={{ padding: "8px 12px" }}>Cliente</th>
                    <th style={{ padding: "8px 12px" }}>Status</th>
                    <th style={{ padding: "8px 12px" }}>Usuários</th>
                    <th style={{ padding: "8px 12px" }}>Visitantes (30d)</th>
                    <th style={{ padding: "8px 12px" }}>Último evento</th>
                    <th style={{ padding: "8px 12px" }} />
                  </tr>
                </thead>
                <tbody>
                  {summaries.map((t) => (
                    <tr key={t.tenantId} style={{ borderTop: "1px solid var(--border)", opacity: t.active ? 1 : 0.6 }}>
                      <td style={{ padding: "8px 12px" }}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(t.tenantId)}
                          onChange={() => toggleSelected(t.tenantId)}
                          aria-label={`Selecionar ${t.tenantName}`}
                        />
                      </td>
                      <td style={{ padding: "8px 12px" }}>{t.tenantName}</td>
                      <td style={{ padding: "8px 12px" }}>
                        <span className={`status-pill ${t.active ? "live" : "offline"}`}>
                          <span className="status-dot" />
                          {t.active ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td style={{ padding: "8px 12px", color: "var(--text-soft)" }}>{t.userCount}</td>
                      <td style={{ padding: "8px 12px", color: "var(--text-soft)" }}>
                        {t.visitorsInPeriod.toLocaleString("pt-BR")}
                      </td>
                      <td style={{ padding: "8px 12px", color: "var(--text-soft)" }}>
                        {t.lastEventAt ? new Date(t.lastEventAt).toLocaleString("pt-BR") : "sem eventos"}
                      </td>
                      <td style={{ padding: "8px 12px", textAlign: "right", whiteSpace: "nowrap" }}>
                        <a href={`/admin/${t.tenantId}`} className="nav-item">
                          Ver cliente →
                        </a>
                      </td>
                    </tr>
                  ))}
                  {summaries.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ padding: "16px 12px", color: "var(--text-faint)" }}>
                        Nenhum cliente cadastrado ainda.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {showExportDialog && (
        <ExportPeriodDialog
          title={`Exportar ${selectedIds.size} cliente(s)`}
          description="Escolha o período do comparativo. Cada cliente selecionado vira uma linha no resumo e uma coluna na tabela de visitantes por dia."
          confirmLabel="Exportar .xlsx"
          busy={exporting}
          onConfirm={handleExport}
          onClose={() => setShowExportDialog(false)}
        />
      )}
    </>
  );
}

export default function ReportsPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionUser | null>(null);

  useEffect(() => {
    const user = getStoredUser();
    if (!user) {
      router.replace("/login");
      return;
    }
    setSession(user);
  }, [router]);

  if (!session) {
    return (
      <Shell>
        <div className="page-status">Carregando...</div>
      </Shell>
    );
  }

  return <Shell>{session.role === "super_admin" ? <AdminReportsView /> : <ClientReportsView />}</Shell>;
}
