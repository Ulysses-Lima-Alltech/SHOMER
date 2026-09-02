import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
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

  /**
   * O cliente pediu pra validar as métricas usando só UMA câmera (Roupas 2 /
   * camera-03) como fonte da verdade, em vez de somar as 4 - câmeras com
   * campo de visão sobreposto geravam contagem duplicada. As 4 câmeras
   * continuam rodando e visíveis na Validação ao vivo; isso só afeta as
   * métricas agregadas (Agora, entradas/saídas, hoje, série histórica).
   * Setar STATS_SINGLE_CAMERA_ID vazio/ausente volta a somar todas as
   * câmeras.
   */
  private get singleCameraId(): string | undefined {
    return this.config.get<string>('STATS_SINGLE_CAMERA_ID') || undefined;
  }

  /** SQL adicional pra restringir a uma única câmera quando singleCameraId
   * está setado — string vazia (sem filtro) caso contrário. */
  private cameraScopeSql(cameraIdParam = 'singleCameraId'): string {
    return this.singleCameraId
      ? `AND JSONExtractString(payload, 'cameraId') = {${cameraIdParam}:String}`
      : '';
  }

  /** Data de "hoje" (YYYY-MM-DD) já no fuso da loja. */
  private async getLocalToday(): Promise<string> {
    const rows = await this.clickhouse.queryRows<{ today: string }>(
      `SELECT toString(toDate(now(), {tz:String})) AS today`,
      { tz: this.timezone },
    );
    return rows[0]?.today ?? new Date().toISOString().slice(0, 10);
  }

  /**
   * Grava uma correção manual da ocupação atual (ex: "tem 3 pessoas na loja
   * agora" contado por um funcionário) - existe porque o saldo
   * entradas-saídas parte de 0 sempre que o processo de tracking reinicia
   * (queda de energia, deploy, restart manual), e qualquer pessoa que já
   * estava dentro da loja nesse momento vira invisível pro saldo: quando
   * ela sair, sobra uma saída sem entrada correspondente, jogando o saldo
   * pro negativo (truncado em 0 pelo max() de getOverview) pelo resto do
   * dia. getOverview usa a calibração mais recente de hoje como piso e soma
   * só entradas/saídas DEPOIS dela, em vez de zerar o dia inteiro.
   */
  async calibrateOccupancy(tenantId: string, count: number): Promise<void> {
    const cameraId = this.singleCameraId;
    await this.clickhouse.getClient().insert({
      table: this.config.get<string>('CLICKHOUSE_EVENTS_TABLE', 'events'),
      values: [
        {
          event_id: randomUUID(),
          timestamp: new Date().toISOString().replace('T', ' ').replace('Z', ''),
          tenant_id: tenantId,
          store_id: null,
          type: 'person.occupancy_calibrated',
          event_version: 'v1',
          payload: JSON.stringify({ count, ...(cameraId ? { cameraId } : {}) }),
        },
      ],
      format: 'JSONEachRow',
    });
  }

  /** Agora = baseline da calibração manual mais recente de hoje (0 se nunca
   * calibrado) + entradas - saídas na câmera fonte da verdade (ver
   * singleCameraId acima) DESDE essa calibração - ver calibrateOccupancy
   * acima pro motivo de não ser só entradas-saídas do dia inteiro. Não é
   * detecção ao vivo - ver currentOccupancy mais abaixo. */
  async getOverview(tenantId: string): Promise<OverviewStats> {
    const today = await this.getLocalToday();
    const tz = this.timezone;

    const calibrationRows = await this.clickhouse.queryRows<{ count: string; calibratedAt: string }>(
      `SELECT JSONExtractInt(payload, 'count') AS count,
              formatDateTime(timestamp, '%Y-%m-%d %H:%i:%S.%f') AS calibratedAt
       FROM events
       WHERE tenant_id = {tenantId:String}
         AND type = 'person.occupancy_calibrated'
         AND toDate(timestamp, {tz:String}) = {today:Date}
         ${this.cameraScopeSql()}
       ORDER BY timestamp DESC
       LIMIT 1`,
      { tenantId, tz, today, ...(this.singleCameraId ? { singleCameraId: this.singleCameraId } : {}) },
    );
    const calibration = calibrationRows[0];
    const sinceSql = calibration
      ? 'AND timestamp > {calibratedAt:String}'
      : 'AND toDate(timestamp, {tz:String}) = {today:Date}';

    const [peakRows, directionRows, sinceCalibrationRows, lastEventRows] =
      await Promise.all([
        // Pico do dia = maior ocupação simultânea (saldo de entradas-saídas
        // ao longo do dia), não a hora com mais eventos "detected": raw
        // detection count multiplica pelo número de câmeras + troca de
        // track_id do tracker e chega a milhares para uma loja pequena de
        // verdade (mesmo motivo do visitorsToday acima).
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
               ${this.cameraScopeSql()}
           )`,
          { tenantId, tz, today, ...(this.singleCameraId ? { singleCameraId: this.singleCameraId } : {}) },
        ),
        // Totais do dia inteiro - usados em visitorsToday/entriesToday/
        // exitsToday, que são métricas de "hoje", não de ocupação atual.
        // Não usa sinceSql: uma calibração corrige só currentOccupancy
        // (ver abaixo), não o total de visitantes do dia.
        this.clickhouse.queryRows<{ direction: string; c: string }>(
          // O edge grava a direção como ENTER/EXIT (maiúsculo); normaliza
          // aqui para não depender da grafia exata do payload.
          `SELECT lower(JSONExtractString(payload, 'direction')) AS direction, count() AS c
           FROM events
           WHERE tenant_id = {tenantId:String}
             AND type = 'person.line_crossed'
             AND toDate(timestamp, {tz:String}) = {today:Date}
             ${this.cameraScopeSql()}
           GROUP BY direction`,
          { tenantId, tz, today, ...(this.singleCameraId ? { singleCameraId: this.singleCameraId } : {}) },
        ),
        // Entradas/saídas SÓ desde a última calibração (ou o dia inteiro, se
        // nunca calibrado) - a base do cálculo de currentOccupancy abaixo,
        // separado de entriesToday/exitsToday que são totais do dia inteiro.
        this.clickhouse.queryRows<{ direction: string; c: string }>(
          `SELECT lower(JSONExtractString(payload, 'direction')) AS direction, count() AS c
           FROM events
           WHERE tenant_id = {tenantId:String}
             AND type = 'person.line_crossed'
             ${sinceSql}
             ${this.cameraScopeSql()}
           GROUP BY direction`,
          {
            tenantId,
            tz,
            today,
            ...(calibration ? { calibratedAt: calibration.calibratedAt } : {}),
            ...(this.singleCameraId ? { singleCameraId: this.singleCameraId } : {}),
          },
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
    const entriesSinceCalibration = Number(
      sinceCalibrationRows.find((r) => r.direction === 'enter')?.c ?? 0,
    );
    const exitsSinceCalibration = Number(
      sinceCalibrationRows.find((r) => r.direction === 'exit')?.c ?? 0,
    );
    const lastEvent = lastEventRows[0]?.lastEvent;
    // Agora = baseline (última calibração manual de hoje, 0 se nunca
    // calibrado) + entradas - saídas DESDE essa calibração, não detecção ao
    // vivo de uma câmera: a detecção só reflete quem está no campo de visão
    // daquela câmera especificamente naquele instante, então alguém que
    // entrou e está em outra parte da loja (fora do ângulo da câmera da
    // linha) sumia do "Agora" mesmo continuando dentro. O saldo do
    // livro-razão é o dado real - e a calibração corrige o ponto de partida
    // desse livro-razão quando o tracking reinicia com gente já dentro.
    const calibrationBaseline = Number(calibration?.count ?? 0);
    const currentOccupancy = Math.max(
      0,
      calibrationBaseline + entriesSinceCalibration - exitsSinceCalibration,
    );

    return {
      // visitorsToday = entradas hoje, não count(person.detected): um
      // visitante gera dezenas de eventos "detected" (um a cada poucos
      // segundos enquanto está em quadro, multiplicado por troca de
      // track_id), então contar esses eventos brutos não é "quantidade de
      // visitantes".
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
    // Entradas (person.line_crossed), não count(person.detected): rastreio
    // bruto existe só para alimentar o mapa de calor (ver getHeatmap) - todo
    // gráfico de volume/movimento usa cruzamento de linha, a mesma fonte de
    // "Agora"/visitantes, para não misturar "identificar pessoa em quadro"
    // com contagem de entrada/saída.
    const rows = await this.clickhouse.queryRows<{ hour: string; count: string }>(
      `SELECT toHour(timestamp, {tz:String}) AS hour, count() AS count
       FROM events
       WHERE tenant_id = {tenantId:String}
         AND type = 'person.line_crossed'
         AND lower(JSONExtractString(payload, 'direction')) = 'enter'
         AND toDate(timestamp, {tz:String}) = {today:Date}
         ${this.cameraScopeSql()}
       GROUP BY hour
       ORDER BY hour`,
      { tenantId, tz: this.timezone, today, ...(this.singleCameraId ? { singleCameraId: this.singleCameraId } : {}) },
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
         ${this.cameraScopeSql()}
       GROUP BY bucket
       ORDER BY bucket`,
      { tenantId, ...(this.singleCameraId ? { singleCameraId: this.singleCameraId } : {}) },
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
         ${this.cameraScopeSql()}
       GROUP BY date
       ORDER BY date`,
      { tenantId, tz, from: fromDate, to: toDate, ...(this.singleCameraId ? { singleCameraId: this.singleCameraId } : {}) },
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
         AND type = 'person.line_crossed'
         AND lower(JSONExtractString(payload, 'direction')) = 'enter'
         AND toDate(timestamp, {tz:String}) >= {from:Date}
         AND toDate(timestamp, {tz:String}) <= {to:Date}
         ${this.cameraScopeSql()}
       GROUP BY date, hour
       ORDER BY date, hour`,
      { tenantId, tz, from: fromDate, to: toDate, ...(this.singleCameraId ? { singleCameraId: this.singleCameraId } : {}) },
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
           AND type = 'person.line_crossed'
           AND lower(JSONExtractString(payload, 'direction')) = 'enter'
           AND toDate(timestamp, {tz:String}) >= {from:Date}
           AND toDate(timestamp, {tz:String}) <= {to:Date}
           ${this.cameraScopeSql()}
         GROUP BY date, hour
       )
       GROUP BY hour
       ORDER BY hour`,
      { tenantId, tz, from: fromDate, to: toDate, ...(this.singleCameraId ? { singleCameraId: this.singleCameraId } : {}) },
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
