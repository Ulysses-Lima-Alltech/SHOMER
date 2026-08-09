import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClickhouseService } from '../clickhouse/clickhouse.service';

export interface HourlyPoint {
  hour: number;
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

const MOVEMENT_PERIODS: Array<{ period: string; startHour: number; endHour: number }> = [
  { period: '09–11', startHour: 9, endHour: 11 },
  { period: '11–13', startHour: 11, endHour: 13 },
  { period: '13–16', startHour: 13, endHour: 16 },
  { period: '16–19', startHour: 16, endHour: 19 },
  { period: '19–21', startHour: 19, endHour: 21 },
];

@Injectable()
export class StatsService {
  constructor(
    private readonly clickhouse: ClickhouseService,
    private readonly config: ConfigService,
  ) {}

  /**
   * MVP single-tenant: todas as consultas filtram por este tenant fixo.
   * Um deployment multi-loja precisaria receber o tenantId da sessão do
   * usuário logado (ligado a uma tabela stores/users no Postgres, que
   * ainda não existe neste repositório).
   */
  private get tenantId(): string {
    return this.config.get<string>('STATS_TENANT_ID', 'demo-tenant-id');
  }

  async getOverview(): Promise<OverviewStats> {
    const [visitorsRows, currentRows, peakRows, directionRows, lastEventRows] =
      await Promise.all([
        this.clickhouse.queryRows<{ visitors: string }>(
          `SELECT count() AS visitors
           FROM events
           WHERE tenant_id = {tenantId:String}
             AND type = 'person.detected'
             AND toDate(timestamp) = today()`,
          { tenantId: this.tenantId },
        ),
        this.clickhouse.queryRows<{ current: string }>(
          `SELECT uniqExact(JSONExtractString(payload, 'trackId')) AS current
           FROM events
           WHERE tenant_id = {tenantId:String}
             AND type = 'person.detected'
             AND timestamp >= now() - INTERVAL 5 MINUTE`,
          { tenantId: this.tenantId },
        ),
        this.clickhouse.queryRows<{ hour: string; c: string }>(
          `SELECT toHour(timestamp) AS hour, count() AS c
           FROM events
           WHERE tenant_id = {tenantId:String}
             AND type = 'person.detected'
             AND toDate(timestamp) = today()
           GROUP BY hour
           ORDER BY c DESC
           LIMIT 1`,
          { tenantId: this.tenantId },
        ),
        this.clickhouse.queryRows<{ direction: string; c: string }>(
          `SELECT JSONExtractString(payload, 'direction') AS direction, count() AS c
           FROM events
           WHERE tenant_id = {tenantId:String}
             AND type = 'person.line_crossed'
             AND toDate(timestamp) = today()
           GROUP BY direction`,
          { tenantId: this.tenantId },
        ),
        // Qualquer tipo de evento conta para "sistema ativo" — inclui
        // edge.health.reported, não só detecções de pessoas.
        this.clickhouse.queryRows<{ lastEvent: string }>(
          `SELECT formatDateTime(max(timestamp), '%Y-%m-%dT%H:%i:%S.000Z') AS lastEvent
           FROM events
           WHERE tenant_id = {tenantId:String}`,
          { tenantId: this.tenantId },
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
      visitorsToday: Number(visitorsRows[0]?.visitors ?? 0),
      currentOccupancy: Number(currentRows[0]?.current ?? 0),
      peakToday: Number(peakRows[0]?.c ?? 0),
      peakHour: peakRows[0] ? Number(peakRows[0].hour) : null,
      entriesToday,
      exitsToday,
      lastEventAt: lastEvent && lastEvent !== '1970-01-01T00:00:00.000Z' ? lastEvent : null,
    };
  }

  async getHourly(): Promise<HourlyPoint[]> {
    const rows = await this.clickhouse.queryRows<{ hour: string; count: string }>(
      `SELECT toHour(timestamp) AS hour, count() AS count
       FROM events
       WHERE tenant_id = {tenantId:String}
         AND type = 'person.detected'
         AND toDate(timestamp) = today()
       GROUP BY hour
       ORDER BY hour`,
      { tenantId: this.tenantId },
    );

    const byHour = new Map(rows.map((r) => [Number(r.hour), Number(r.count)]));
    return Array.from({ length: 24 }, (_, hour) => ({
      hour,
      count: byHour.get(hour) ?? 0,
    }));
  }

  async getMovement(): Promise<MovementBucket[]> {
    const hourly = await this.getHourly();
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

  /** Série diária de visitantes para os últimos `days` dias (inclui hoje). */
  async getDaily(days: number): Promise<DailySummary> {
    const clampedDays = Math.min(90, Math.max(1, Math.trunc(days) || 7));

    const rows = await this.clickhouse.queryRows<{ date: string; count: string }>(
      `SELECT toString(toDate(timestamp)) AS date, count() AS count
       FROM events
       WHERE tenant_id = {tenantId:String}
         AND type = 'person.detected'
         AND timestamp >= today() - {days:UInt16} + 1
       GROUP BY date
       ORDER BY date`,
      { tenantId: this.tenantId, days: clampedDays },
    );

    const byDate = new Map(rows.map((r) => [r.date, Number(r.count)]));
    const daysList: DailyPoint[] = [];
    for (let i = clampedDays - 1; i >= 0; i -= 1) {
      const date = new Date();
      date.setUTCDate(date.getUTCDate() - i);
      const key = date.toISOString().slice(0, 10);
      daysList.push({ date: key, count: byDate.get(key) ?? 0 });
    }

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

  /** Padrão médio de movimento por hora do dia, ao longo dos últimos `days` dias. */
  async getHourlyPattern(days: number): Promise<HourlyPoint[]> {
    const clampedDays = Math.min(90, Math.max(1, Math.trunc(days) || 7));

    const rows = await this.clickhouse.queryRows<{ hour: string; avgCount: string }>(
      `SELECT hour, round(avg(c)) AS avgCount FROM (
         SELECT toDate(timestamp) AS date, toHour(timestamp) AS hour, count() AS c
         FROM events
         WHERE tenant_id = {tenantId:String}
           AND type = 'person.detected'
           AND timestamp >= today() - {days:UInt16} + 1
         GROUP BY date, hour
       )
       GROUP BY hour
       ORDER BY hour`,
      { tenantId: this.tenantId, days: clampedDays },
    );

    const byHour = new Map(rows.map((r) => [Number(r.hour), Number(r.avgCount)]));
    return Array.from({ length: 24 }, (_, hour) => ({
      hour,
      count: byHour.get(hour) ?? 0,
    }));
  }
}
