import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClickhouseService } from '../clickhouse/clickhouse.service';
import { TenantsService } from '../tenants/tenants.service';

export interface HourlyPoint {
  hour: number;
  count: number;
}

export interface Last24HourPoint {
  /** Início do balde de 1h, em UTC (ISO 8601) — o dashboard converte para
   * o horário local do navegador na hora de exibir. */
  bucketStart: string;
  count: number;
}

export interface MovementBucket {
  period: string;
  label: 'Baixo' | 'Médio' | 'Alto';
  value: number;
}

interface DetectionSample {
  cameraId: string;
  trackId: string;
  appearance: number[] | null;
  timestampMs: number;
}

const CROSS_CAMERA_TIME_WINDOW_MS = 2000;
// Embeddings do OSNet (edge/src/vision/reid.py) sao vetores unitarios
// (L2-normalizados), entao similaridade de cosseno = produto escalar direto,
// no intervalo [-1, 1]. 0.6 e um ponto de partida razoavel pra "mesma
// pessoa" nesse modelo/resolucao de camera - precisa validar com dados reais
// assim que as cameras da loja voltarem (rede caiu durante a implementacao
// desta feature) e ajustar se houver falsos positivos/negativos.
const CROSS_CAMERA_SIMILARITY_THRESHOLD = 0.6;

/** Similaridade de cosseno entre dois embeddings de re-identificacao. Os
 * vetores ja vem L2-normalizados do edge (ver AppearanceEmbedder em
 * src/vision/reid.py), entao isso e so o produto escalar. */
export function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < len; i++) dot += a[i] * b[i];
  return dot;
}

/**
 * Deduplica detecções da MESMA pessoa física vista por câmeras DIFERENTES
 * com campo de visão sobreposto, no mesmo instante - achado na aba de
 * validação ao vivo: "Caixa" e "Roupas" compartilham boa parte da cena, e
 * cada câmera roda seu próprio ByteTrack sem noção da outra. Dentro de uma
 * mesma câmera o track_id do ByteTrack já é a fonte da verdade de
 * identidade - essa função só une clusters entre câmeras diferentes,
 * comparando proximidade de tempo + similaridade do embedding de
 * re-identificação (OSNet, calculado no edge). Não é um sistema completo de
 * rastreio multi-câmera com calibração geométrica - cobre bem o caso de
 * câmeras que compartilham o mesmo espaço e capturam o mesmo instante.
 * Retorna a contagem de pessoas físicas distintas.
 */
export function countDistinctPeople(samples: DetectionSample[]): number {
  const parent = samples.map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  for (let i = 0; i < samples.length; i++) {
    for (let j = i + 1; j < samples.length; j++) {
      const a = samples[i];
      const b = samples[j];
      if (a.cameraId === b.cameraId) continue;
      if (!a.appearance || !b.appearance) continue;
      if (Math.abs(a.timestampMs - b.timestampMs) > CROSS_CAMERA_TIME_WINDOW_MS) continue;
      if (cosineSimilarity(a.appearance, b.appearance) >= CROSS_CAMERA_SIMILARITY_THRESHOLD) {
        union(i, j);
      }
    }
  }

  return new Set(samples.map((_, i) => find(i))).size;
}

export interface OverviewStats {
  visitorsToday: number;
  currentOccupancy: number;
  peakToday: number;
  peakHour: number | null;
  entriesToday: number;
  exitsToday: number;
  /** ISO 8601, ou null se nenhum evento chegou ainda para este tenant. */
  lastEventAt: string | null;
}

export interface DailyPoint {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface DailySummary {
  days: DailyPoint[];
  totalVisitors: number;
  averagePerDay: number;
  bestDay: DailyPoint | null;
}

export interface EdgeHealthStatus {
  edgeDeviceId: string | null;
  cameraId: string | null;
  status: string | null;
  cameraConnected: boolean | null;
  modelReady: boolean | null;
  framesProcessed: number | null;
  personsCurrent: number | null;
  lastFrameAt: string | null;
  lastError: string | null;
  reportedAt: string | null;
}

export interface DailyHourlyRow {
  date: string;
  /** 24 posições, índice = hora local (0-23). */
  hours: number[];
}

export interface TenantSummary {
  tenantId: string;
  tenantName: string;
  active: boolean;
  userCount: number;
  createdAt: string;
  visitorsInPeriod: number;
  lastEventAt: string | null;
}

export interface EventLogEntry {
  eventId: string;
  timestamp: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface HeatmapCell {
  x: number;
  y: number;
  count: number;
}

export interface HeatmapResult {
  gridSize: number;
  cells: HeatmapCell[];
  maxCount: number;
  totalPoints: number;
  from: string;
  to: string;
}

const MOVEMENT_PERIODS: Array<{ period: string; startHour: number; endHour: number }> = [
  { period: '09–11', startHour: 9, endHour: 11 },
  { period: '11–13', startHour: 11, endHour: 13 },
  { period: '13–16', startHour: 13, endHour: 16 },
  { period: '16–19', startHour: 16, endHour: 19 },
  { period: '19–21', startHour: 19, endHour: 21 },
];

/**
 * Todas as consultas recebem `tenantId` explicitamente (resolvido pelo
 * controller a partir do usuário logado — ver stats.controller.ts) em vez de
 * um tenant fixo de config. Isso é o que torna o dashboard multi-tenant:
 * cada usuário só vê os dados do seu próprio tenant.
 */
@Injectable()
export class StatsService {
  constructor(
    private readonly clickhouse: ClickhouseService,
    private readonly config: ConfigService,
    private readonly tenants: TenantsService,
  ) {}

  /**
   * Fuso horário da loja. O ClickHouse (e o servidor) rodam em UTC — sem
   * converter explicitamente, "hoje"/"hora" batiam com o relógio UTC, não
   * com o horário local da loja (ex: 20h UTC virava "20h" no gráfico às
   * 17h no Brasil). Todas as consultas abaixo convertem para este fuso
   * antes de extrair data/hora.
   */
  private get timezone(): string {
    return this.config.get<string>('STATS_TIMEZONE', 'America/Sao_Paulo');
  }

  /** Data de "hoje" (YYYY-MM-DD) já no fuso da loja. */
  private async getLocalToday(): Promise<string> {
    const rows = await this.clickhouse.queryRows<{ today: string }>(
      `SELECT toString(toDate(now(), {tz:String})) AS today`,
      { tz: this.timezone },
    );
    return rows[0]?.today ?? new Date().toISOString().slice(0, 10);
  }

  /** Agora = pessoas distintas detectadas nos ultimos 5s, nao
   * entradas-saidas de hoje: se o tracking cair e voltar (rede, reinicio)
   * com gente ja dentro da loja, o saldo de cruzamentos fica zerado mesmo
   * com gente visivel em quadro - o cliente ve "Agora: 0" com pessoas na
   * tela ao vivo. O edge reemite person.detected por track a cada
   * DETECTION_EVENTS_MIN_INTERVAL_SECONDS (2s por padrao) enquanto a
   * pessoa estiver em quadro.
   *
   * A janela era 10s antes, mas isso causava SUPERCONTAGEM: pegamos so a
   * deteccao mais recente por (camera, track) e so fundimos entre CAMERAS
   * DIFERENTES (dentro da mesma camera confiamos no track_id do
   * ByteTrack). Se o ByteTrack troca o id de uma pessoa (perde e reganha o
   * rastreamento - ainda acontece as vezes mesmo com o tracker ajustado),
   * o id antigo fica "recente o suficiente" pra continuar contando junto
   * com o id novo por ate 10s inteiros, dobrando essa pessoa. Uma janela
   * mais curta (~2.5x o intervalo de publicacao) deixa o id antigo
   * "envelhecer" e sair da contagem rapido, sem cobrir tantas reemissoes
   * a ponto do id trocado persistir como dois.
   *
   * JSONExtractBool(payload,'isStatic') com chave ausente (eventos
   * antigos) retorna false por padrao no ClickHouse, entao eventos
   * gravados antes desse campo existir continuam contando - aceitavel, o
   * objetivo aqui e so parar de contar manequins daqui pra frente.
   * countDistinctPeople funde detecções de câmeras diferentes que são a
   * mesma pessoa física (câmeras com campo de visão sobreposto). */
  private async getCurrentOccupancy(tenantId: string): Promise<number> {
    const rows = await this.clickhouse.queryRows<{
      cameraId: string;
      trackId: string;
      appearance: string | null;
      ts: string;
    }>(
      `SELECT
         JSONExtractString(payload, 'cameraId') AS cameraId,
         JSONExtractString(payload, 'trackId') AS trackId,
         JSONExtractRaw(payload, 'appearance') AS appearance,
         toUnixTimestamp64Milli(timestamp) AS ts
       FROM events
       WHERE tenant_id = {tenantId:String}
         AND type = 'person.detected'
         AND NOT JSONExtractBool(payload, 'isStatic')
         AND timestamp >= now() - INTERVAL 5 SECOND
       ORDER BY timestamp DESC`,
      { tenantId },
    );

    // So a deteccao mais recente por (camera, track) - o ByteTrack ja e a
    // fonte da verdade de identidade dentro da mesma camera; veio ordenado
    // DESC, entao a primeira ocorrencia de cada chave ja e a mais recente.
    const latestByTrack = new Map<string, DetectionSample>();
    for (const row of rows) {
      const key = `${row.cameraId}:${row.trackId}`;
      if (latestByTrack.has(key)) continue;
      let appearance: number[] | null = null;
      if (row.appearance) {
        try {
          appearance = JSON.parse(row.appearance) as number[];
        } catch {
          appearance = null;
        }
      }
      latestByTrack.set(key, {
        cameraId: row.cameraId,
        trackId: row.trackId,
        appearance,
        timestampMs: Number(row.ts),
      });
    }

    return countDistinctPeople([...latestByTrack.values()]);
  }

  async getOverview(tenantId: string): Promise<OverviewStats> {
    const today = await this.getLocalToday();
    const tz = this.timezone;

    const [currentOccupancy, peakRows, directionRows, lastEventRows] =
      await Promise.all([
        this.getCurrentOccupancy(tenantId),
        // Pico do dia = maior ocupação simultânea (saldo de entradas-saídas
        // ao longo do dia), não a hora com mais eventos "detected": raw
        // detection count multiplica pelo número de câmeras + troca de
        // track_id do tracker e chega a milhares para uma loja pequena de
        // verdade (mesmo motivo do currentOccupancy/visitorsToday acima).
        this.clickhouse.queryRows<{ peak: string; peakHour: string | null }>(
          `SELECT greatest(0, max(running)) AS peak,
                  toHour(argMax(ts, running), {tz:String}) AS peakHour
           FROM (
             SELECT
               timestamp AS ts,
               sum(multiIf(lower(JSONExtractString(payload, 'direction')) = 'enter', 1, -1))
                 OVER (ORDER BY timestamp ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running
             FROM events
             WHERE tenant_id = {tenantId:String}
               AND type = 'person.line_crossed'
               AND toDate(timestamp, {tz:String}) = {today:Date}
           )`,
          { tenantId, tz, today },
        ),
        this.clickhouse.queryRows<{ direction: string; c: string }>(
          // O edge grava a direção como ENTER/EXIT (maiúsculo); normaliza
          // aqui para não depender da grafia exata do payload.
          `SELECT lower(JSONExtractString(payload, 'direction')) AS direction, count() AS c
           FROM events
           WHERE tenant_id = {tenantId:String}
             AND type = 'person.line_crossed'
             AND toDate(timestamp, {tz:String}) = {today:Date}
           GROUP BY direction`,
          { tenantId, tz, today },
        ),
        // Qualquer tipo de evento conta para "sistema ativo" — inclui
        // edge.health.reported, não só detecções de pessoas.
        this.clickhouse.queryRows<{ lastEvent: string }>(
          `SELECT formatDateTime(max(timestamp), '%Y-%m-%dT%H:%i:%S.000Z') AS lastEvent
           FROM events
           WHERE tenant_id = {tenantId:String}`,
          { tenantId },
        ),
      ]);

    const entriesToday = Number(
      directionRows.find((r) => r.direction === 'enter')?.c ?? 0,
    );
    const exitsToday = Number(
      directionRows.find((r) => r.direction === 'exit')?.c ?? 0,
    );
    const lastEvent = lastEventRows[0]?.lastEvent;

    return {
      // visitorsToday = entradas hoje, não count(person.detected): o mesmo
      // motivo do currentOccupancy acima — um visitante gera dezenas de
      // eventos "detected" (um a cada poucos segundos enquanto está em
      // quadro, multiplicado por troca de track_id), então contar esses
      // eventos brutos não é "quantidade de visitantes".
      visitorsToday: entriesToday,
      currentOccupancy,
      peakToday: Number(peakRows[0]?.peak ?? 0),
      peakHour: entriesToday + exitsToday > 0 ? Number(peakRows[0]?.peakHour) : null,
      entriesToday,
      exitsToday,
      lastEventAt: lastEvent && lastEvent !== '1970-01-01T00:00:00.000Z' ? lastEvent : null,
    };
  }

  async getHourly(tenantId: string): Promise<HourlyPoint[]> {
    const today = await this.getLocalToday();
    const rows = await this.clickhouse.queryRows<{ hour: string; count: string }>(
      `SELECT toHour(timestamp, {tz:String}) AS hour, count() AS count
       FROM events
       WHERE tenant_id = {tenantId:String}
         AND type = 'person.detected'
         AND toDate(timestamp, {tz:String}) = {today:Date}
       GROUP BY hour
       ORDER BY hour`,
      { tenantId, tz: this.timezone, today },
    );

    const byHour = new Map(rows.map((r) => [Number(r.hour), Number(r.count)]));
    return Array.from({ length: 24 }, (_, hour) => ({
      hour,
      count: byHour.get(hour) ?? 0,
    }));
  }

  /**
   * Volume por hora numa janela deslizante das últimas 24 horas (ao
   * contrário de getHourly, que é "hoje" no fuso da loja e reseta à
   * meia-noite). Cada balde é uma hora cheia em UTC — o timestamp gravado
   * já é UTC, então não precisa converter fuso aqui; o dashboard formata
   * cada bucketStart no horário local do navegador na hora de exibir.
   */
  async getLast24Hours(tenantId: string): Promise<Last24HourPoint[]> {
    // Visitantes = entradas, mesmo raciocínio de getDaily/getOverview.
    const rows = await this.clickhouse.queryRows<{ bucket: string; count: string }>(
      `SELECT formatDateTime(toStartOfHour(timestamp), '%Y-%m-%dT%H:%i:%S.000Z') AS bucket, count() AS count
       FROM events
       WHERE tenant_id = {tenantId:String}
         AND type = 'person.line_crossed'
         AND lower(JSONExtractString(payload, 'direction')) = 'enter'
         AND timestamp >= now() - INTERVAL 24 HOUR
       GROUP BY bucket
       ORDER BY bucket`,
      { tenantId },
    );

    const byBucket = new Map(rows.map((r) => [r.bucket, Number(r.count)]));

    // Gera os 24 baldes horários — da hora cheia atual até 23h atrás —
    // preenchendo com zero onde não há eventos, pra sempre ter 24 pontos
    // mesmo em janelas sem nenhum evento.
    const currentHourStart = new Date();
    currentHourStart.setUTCMinutes(0, 0, 0);

    const points: Last24HourPoint[] = [];
    for (let i = 23; i >= 0; i--) {
      const bucketDate = new Date(currentHourStart.getTime() - i * 60 * 60 * 1000);
      const bucketStart = bucketDate.toISOString().replace(/\.\d{3}Z$/, '.000Z');
      points.push({ bucketStart, count: byBucket.get(bucketStart) ?? 0 });
    }
    return points;
  }

  async getMovement(tenantId: string): Promise<MovementBucket[]> {
    const hourly = await this.getHourly(tenantId);
    const totals = MOVEMENT_PERIODS.map(({ period, startHour, endHour }) => {
      const value = hourly
        .filter((p) => p.hour >= startHour && p.hour < endHour)
        .reduce((sum, p) => sum + p.count, 0);
      return { period, value };
    });

    const max = Math.max(1, ...totals.map((t) => t.value));

    return totals.map(({ period, value }) => {
      const ratio = value / max;
      const label: MovementBucket['label'] =
        ratio >= 0.66 ? 'Alto' : ratio >= 0.33 ? 'Médio' : 'Baixo';
      return { period, label, value: Math.round(ratio * 100) };
    });
  }

  /**
   * Resolve a janela de datas (fuso da loja) usada por getDaily/getHourlyPattern/
   * getDailyHourlyMatrix/getTenantSummaries. Se `from`/`to` explícitos forem
   * passados (exportação com período customizado no dashboard), usa-os
   * diretamente; senão cai no comportamento antigo de "últimos `days` dias
   * terminando hoje".
   */
  private async resolveDateWindow(
    days: number,
    from?: string,
    to?: string,
  ): Promise<{ fromDate: string; toDate: string }> {
    if (from && to && !Number.isNaN(Date.parse(from)) && !Number.isNaN(Date.parse(to))) {
      return from <= to ? { fromDate: from, toDate: to } : { fromDate: to, toDate: from };
    }
    const today = await this.getLocalToday();
    const clampedDays = Math.min(90, Math.max(1, Math.trunc(days) || 7));
    const [y, m, d] = today.split('-').map(Number);
    const fromDateObj = new Date(Date.UTC(y, m - 1, d));
    fromDateObj.setUTCDate(fromDateObj.getUTCDate() - clampedDays + 1);
    return { fromDate: fromDateObj.toISOString().slice(0, 10), toDate: today };
  }

  private static listDates(fromDate: string, toDate: string): string[] {
    const [fy, fm, fd] = fromDate.split('-').map(Number);
    const [ty, tm, td] = toDate.split('-').map(Number);
    const cursor = new Date(Date.UTC(fy, fm - 1, fd));
    const end = new Date(Date.UTC(ty, tm - 1, td));
    const dates: string[] = [];
    while (cursor <= end) {
      dates.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return dates;
  }

  /** Série diária de visitantes no período (últimos `days` dias, ou `from`/`to` explícitos). */
  async getDaily(tenantId: string, days: number, from?: string, to?: string): Promise<DailySummary> {
    const { fromDate, toDate } = await this.resolveDateWindow(days, from, to);
    const tz = this.timezone;

    // Visitantes = entradas (person.line_crossed, direction=enter), não
    // count(person.detected): um visitante gera muitos eventos "detected"
    // enquanto está em quadro (a cada poucos segundos, multiplicado por
    // troca de track_id do tracker), então isso nunca foi "quantidade de
    // visitantes" — ver mesmo raciocínio em getOverview.currentOccupancy.
    const rows = await this.clickhouse.queryRows<{ date: string; count: string }>(
      `SELECT toString(toDate(timestamp, {tz:String})) AS date, count() AS count
       FROM events
       WHERE tenant_id = {tenantId:String}
         AND type = 'person.line_crossed'
         AND lower(JSONExtractString(payload, 'direction')) = 'enter'
         AND toDate(timestamp, {tz:String}) >= {from:Date}
         AND toDate(timestamp, {tz:String}) <= {to:Date}
       GROUP BY date
       ORDER BY date`,
      { tenantId, tz, from: fromDate, to: toDate },
    );

    const byDate = new Map(rows.map((r) => [r.date, Number(r.count)]));
    const daysList: DailyPoint[] = StatsService.listDates(fromDate, toDate).map((key) => ({
      date: key,
      count: byDate.get(key) ?? 0,
    }));

    const totalVisitors = daysList.reduce((sum, d) => sum + d.count, 0);
    const bestDay = daysList.reduce<DailyPoint | null>((best, d) => {
      if (!best || d.count > best.count) return d;
      return best;
    }, null);

    return {
      days: daysList,
      totalVisitors,
      averagePerDay: daysList.length ? Math.round(totalVisitors / daysList.length) : 0,
      bestDay: bestDay && bestDay.count > 0 ? bestDay : null,
    };
  }

  /**
   * Matriz dia x hora (sem média) para o período — usada na exportação
   * completa do relatório, onde o cliente quer ver cada dia separado por
   * hora numa tabela só, não só o padrão médio agregado.
   */
  async getDailyHourlyMatrix(
    tenantId: string,
    days: number,
    from?: string,
    to?: string,
  ): Promise<DailyHourlyRow[]> {
    const { fromDate, toDate } = await this.resolveDateWindow(days, from, to);
    const tz = this.timezone;

    const rows = await this.clickhouse.queryRows<{ date: string; hour: string; count: string }>(
      `SELECT toString(toDate(timestamp, {tz:String})) AS date, toHour(timestamp, {tz:String}) AS hour, count() AS count
       FROM events
       WHERE tenant_id = {tenantId:String}
         AND type = 'person.detected'
         AND toDate(timestamp, {tz:String}) >= {from:Date}
         AND toDate(timestamp, {tz:String}) <= {to:Date}
       GROUP BY date, hour
       ORDER BY date, hour`,
      { tenantId, tz, from: fromDate, to: toDate },
    );

    const byDate = new Map<string, number[]>();
    for (const r of rows) {
      const hours = byDate.get(r.date) ?? new Array(24).fill(0);
      hours[Number(r.hour)] = Number(r.count);
      byDate.set(r.date, hours);
    }

    return StatsService.listDates(fromDate, toDate).map((key) => ({
      date: key,
      hours: byDate.get(key) ?? new Array(24).fill(0),
    }));
  }

  /** Padrão médio de movimento por hora do dia, ao longo do período (fuso da loja). */
  async getHourlyPattern(tenantId: string, days: number, from?: string, to?: string): Promise<HourlyPoint[]> {
    const { fromDate, toDate } = await this.resolveDateWindow(days, from, to);
    const tz = this.timezone;

    const rows = await this.clickhouse.queryRows<{ hour: string; avgCount: string }>(
      `SELECT hour, round(avg(c)) AS avgCount FROM (
         SELECT toDate(timestamp, {tz:String}) AS date, toHour(timestamp, {tz:String}) AS hour, count() AS c
         FROM events
         WHERE tenant_id = {tenantId:String}
           AND type = 'person.detected'
           AND toDate(timestamp, {tz:String}) >= {from:Date}
           AND toDate(timestamp, {tz:String}) <= {to:Date}
         GROUP BY date, hour
       )
       GROUP BY hour
       ORDER BY hour`,
      { tenantId, tz, from: fromDate, to: toDate },
    );

    const byHour = new Map(rows.map((r) => [Number(r.hour), Number(r.avgCount)]));
    return Array.from({ length: 24 }, (_, hour) => ({
      hour,
      count: byHour.get(hour) ?? 0,
    }));
  }

  /**
   * Mapa de calor de posição no chão da loja, a partir de payload.floorPoint
   * (centro-base do bbox, normalizado 0..1 pela resolução do frame) dos
   * eventos person.detected. Agrega em uma grade gridSize x gridSize —
   * eventos antigos sem floorPoint (gravados antes dessa mudança) são
   * ignorados via JSONHas.
   */
  async getHeatmap(
    tenantId: string,
    params: {
      from?: string;
      to?: string;
      cameraId?: string;
      gridSize?: number;
    },
  ): Promise<HeatmapResult> {
    const gridSize = Math.min(50, Math.max(5, Math.trunc(params.gridSize ?? 20) || 20));
    const to = params.to && !Number.isNaN(Date.parse(params.to)) ? new Date(params.to) : new Date();
    const from =
      params.from && !Number.isNaN(Date.parse(params.from))
        ? new Date(params.from)
        : new Date(to.getTime() - 24 * 60 * 60 * 1000);

    const cameraFilter = params.cameraId
      ? `AND JSONExtractString(payload, 'cameraId') = {cameraId:String}`
      : '';

    const rows = await this.clickhouse.queryRows<{ cellX: string; cellY: string; c: string }>(
      `SELECT
         least(${gridSize} - 1, toUInt32(JSONExtractFloat(payload, 'floorPoint', 'x') * ${gridSize})) AS cellX,
         least(${gridSize} - 1, toUInt32(JSONExtractFloat(payload, 'floorPoint', 'y') * ${gridSize})) AS cellY,
         count() AS c
       FROM events
       WHERE tenant_id = {tenantId:String}
         AND type = 'person.detected'
         AND NOT JSONExtractBool(payload, 'isStatic')
         AND JSONHas(payload, 'floorPoint')
         AND timestamp >= parseDateTime64BestEffort({from:String})
         AND timestamp < parseDateTime64BestEffort({to:String})
         ${cameraFilter}
       GROUP BY cellX, cellY`,
      {
        tenantId,
        from: from.toISOString(),
        to: to.toISOString(),
        ...(params.cameraId ? { cameraId: params.cameraId } : {}),
      },
    );

    const cells: HeatmapCell[] = rows.map((r) => ({
      x: Number(r.cellX),
      y: Number(r.cellY),
      count: Number(r.c),
    }));
    const maxCount = cells.reduce((max, cell) => Math.max(max, cell.count), 0);
    const totalPoints = cells.reduce((sum, cell) => sum + cell.count, 0);

    return {
      gridSize,
      cells,
      maxCount,
      totalPoints,
      from: from.toISOString(),
      to: to.toISOString(),
    };
  }

  /**
   * Última leitura de edge.health.reported para o tenant — alimenta a tela
   * Monitoramento. Retorna todos os campos nulos se o edge ainda não
   * publicou nenhum health report (ex: EDGE_HEALTH_REPORT_ENABLED=false).
   */
  async getEdgeHealth(tenantId: string): Promise<EdgeHealthStatus> {
    const rows = await this.clickhouse.queryRows<{ timestamp: string; payload: string }>(
      `SELECT formatDateTime(timestamp, '%Y-%m-%dT%H:%i:%S.000Z') AS timestamp, payload
       FROM events
       WHERE tenant_id = {tenantId:String}
         AND type = 'edge.health.reported'
       ORDER BY timestamp DESC
       LIMIT 1`,
      { tenantId },
    );

    if (rows.length === 0) {
      return {
        edgeDeviceId: null,
        cameraId: null,
        status: null,
        cameraConnected: null,
        modelReady: null,
        framesProcessed: null,
        personsCurrent: null,
        lastFrameAt: null,
        lastError: null,
        reportedAt: null,
      };
    }

    const payload = JSON.parse(rows[0].payload) as Record<string, unknown>;
    return {
      edgeDeviceId: typeof payload.edgeDeviceId === 'string' ? payload.edgeDeviceId : null,
      cameraId: typeof payload.cameraId === 'string' ? payload.cameraId : null,
      status: typeof payload.status === 'string' ? payload.status : null,
      cameraConnected:
        typeof payload.cameraConnected === 'boolean' ? payload.cameraConnected : null,
      modelReady: typeof payload.modelReady === 'boolean' ? payload.modelReady : null,
      framesProcessed:
        typeof payload.framesProcessed === 'number' ? payload.framesProcessed : null,
      personsCurrent:
        typeof payload.personsCurrent === 'number' ? payload.personsCurrent : null,
      lastFrameAt: typeof payload.lastFrameAt === 'string' ? payload.lastFrameAt : null,
      lastError: typeof payload.lastError === 'string' ? payload.lastError : null,
      reportedAt: rows[0].timestamp,
    };
  }

  /**
   * Visão "por cliente" pro admin global — que não tem loja própria, então
   * um relatório de movimento de "uma loja" não faz sentido pra ele. Aqui
   * cada linha é um cliente (tenant), com um resumo de atividade pra
   * priorizar follow-up (quem sumiu, quem está ativo).
   */
  async getTenantSummaries(days = 30, from?: string, to?: string): Promise<TenantSummary[]> {
    const tenants = await this.tenants.findAll();
    if (tenants.length === 0) return [];

    const { fromDate, toDate } = await this.resolveDateWindow(days, from, to);
    const tz = this.timezone;

    const rows = await this.clickhouse.queryRows<{
      tenant_id: string;
      visitors: string;
      lastEvent: string;
    }>(
      `SELECT tenant_id,
              countIf(
                type = 'person.line_crossed'
                AND lower(JSONExtractString(payload, 'direction')) = 'enter'
                AND toDate(timestamp, {tz:String}) >= {from:Date}
                AND toDate(timestamp, {tz:String}) <= {to:Date}
              ) AS visitors,
              formatDateTime(max(timestamp), '%Y-%m-%dT%H:%i:%S.000Z') AS lastEvent
       FROM events
       WHERE tenant_id IN ({tenantIds:Array(String)})
       GROUP BY tenant_id`,
      { tenantIds: tenants.map((t) => t.id), tz, from: fromDate, to: toDate },
    );

    const byTenant = new Map(rows.map((r) => [r.tenant_id, r]));

    return tenants.map((t) => {
      const row = byTenant.get(t.id);
      const lastEvent = row?.lastEvent;
      return {
        tenantId: t.id,
        tenantName: t.name,
        active: t.active,
        userCount: t.userCount,
        createdAt: new Date(t.createdAt).toISOString(),
        visitorsInPeriod: Number(row?.visitors ?? 0),
        lastEventAt: lastEvent && lastEvent !== '1970-01-01T00:00:00.000Z' ? lastEvent : null,
      };
    });
  }

  /** Log de eventos recentes (todos os tipos), mais novo primeiro. */
  async getRecentEvents(
    tenantId: string,
    params: { type?: string; limit?: number },
  ): Promise<EventLogEntry[]> {
    const limit = Math.min(200, Math.max(1, Math.trunc(params.limit ?? 50) || 50));
    const typeFilter = params.type ? `AND type = {type:String}` : '';

    const rows = await this.clickhouse.queryRows<{
      event_id: string;
      timestamp: string;
      type: string;
      payload: string;
    }>(
      `SELECT event_id, formatDateTime(timestamp, '%Y-%m-%dT%H:%i:%S.000Z') AS timestamp, type, payload
       FROM events
       WHERE tenant_id = {tenantId:String}
         ${typeFilter}
       ORDER BY timestamp DESC
       LIMIT ${limit}`,
      {
        tenantId,
        ...(params.type ? { type: params.type } : {}),
      },
    );

    return rows.map((row) => ({
      eventId: row.event_id,
      timestamp: row.timestamp,
      type: row.type,
      payload: JSON.parse(row.payload) as Record<string, unknown>,
    }));
  }
}
