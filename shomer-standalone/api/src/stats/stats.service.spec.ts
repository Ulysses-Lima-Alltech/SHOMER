import { ConfigService } from '@nestjs/config';
import { StatsService } from './stats.service';
import { ClickhouseService } from '../clickhouse/clickhouse.service';

describe('StatsService', () => {
  const config = { get: (_key: string, fallback?: string) => fallback ?? 'demo-tenant-id' } as unknown as ConfigService;

  it('getHourly preenche as 24 horas, mesmo sem dados em algumas', async () => {
    const queryRows = jest.fn().mockResolvedValue([
      { hour: '9', count: '5' },
      { hour: '14', count: '20' },
    ]);
    const clickhouse = { queryRows } as unknown as ClickhouseService;
    const service = new StatsService(clickhouse, config);

    const hourly = await service.getHourly();

    expect(hourly).toHaveLength(24);
    expect(hourly.find((h) => h.hour === 9)?.count).toBe(5);
    expect(hourly.find((h) => h.hour === 14)?.count).toBe(20);
    expect(hourly.find((h) => h.hour === 0)?.count).toBe(0);
  });

  it('getMovement agrupa as horas nos períodos corretos e classifica o rótulo', async () => {
    const queryRows = jest.fn().mockResolvedValue([
      { hour: '10', count: '10' },
      { hour: '14', count: '100' },
      { hour: '20', count: '5' },
    ]);
    const clickhouse = { queryRows } as unknown as ClickhouseService;
    const service = new StatsService(clickhouse, config);

    const movement = await service.getMovement();

    expect(movement.map((m) => m.period)).toEqual([
      '09–11',
      '11–13',
      '13–16',
      '16–19',
      '19–21',
    ]);
    const alto = movement.find((m) => m.period === '13–16');
    expect(alto?.value).toBe(100);
    expect(alto?.label).toBe('Alto');
  });

  it('getOverview combina as métricas das cinco consultas', async () => {
    const queryRows = jest
      .fn()
      .mockResolvedValueOnce([{ visitors: '120' }])
      .mockResolvedValueOnce([{ current: '8' }])
      .mockResolvedValueOnce([{ hour: '14', c: '30' }])
      .mockResolvedValueOnce([
        { direction: 'enter', c: '60' },
        { direction: 'exit', c: '52' },
      ])
      .mockResolvedValueOnce([{ lastEvent: '2026-08-09T14:32:10.000Z' }]);
    const clickhouse = { queryRows } as unknown as ClickhouseService;
    const service = new StatsService(clickhouse, config);

    const overview = await service.getOverview();

    expect(overview).toEqual({
      visitorsToday: 120,
      currentOccupancy: 8,
      peakToday: 30,
      peakHour: 14,
      entriesToday: 60,
      exitsToday: 52,
      lastEventAt: '2026-08-09T14:32:10.000Z',
    });
  });

  it('getOverview retorna lastEventAt nulo quando não há nenhum evento ainda', async () => {
    const queryRows = jest
      .fn()
      .mockResolvedValueOnce([{ visitors: '0' }])
      .mockResolvedValueOnce([{ current: '0' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ lastEvent: '1970-01-01T00:00:00.000Z' }]);
    const clickhouse = { queryRows } as unknown as ClickhouseService;
    const service = new StatsService(clickhouse, config);

    const overview = await service.getOverview();

    expect(overview.lastEventAt).toBeNull();
  });

  it('getDaily preenche todos os dias do período, mesmo os sem dados', async () => {
    const queryRows = jest.fn().mockResolvedValue([{ date: '2026-08-09', count: '15' }]);
    const clickhouse = { queryRows } as unknown as ClickhouseService;
    const service = new StatsService(clickhouse, config);

    const daily = await service.getDaily(3);

    expect(daily.days).toHaveLength(3);
    expect(daily.days[daily.days.length - 1]).toEqual({ date: '2026-08-09', count: 15 });
    expect(daily.totalVisitors).toBe(15);
    expect(daily.averagePerDay).toBe(5);
    expect(daily.bestDay).toEqual({ date: '2026-08-09', count: 15 });
  });

  it('getDaily retorna bestDay nulo quando não há nenhum visitante no período', async () => {
    const queryRows = jest.fn().mockResolvedValue([]);
    const clickhouse = { queryRows } as unknown as ClickhouseService;
    const service = new StatsService(clickhouse, config);

    const daily = await service.getDaily(5);

    expect(daily.totalVisitors).toBe(0);
    expect(daily.bestDay).toBeNull();
  });

  it('getHourlyPattern preenche as 24 horas com a média calculada pelo ClickHouse', async () => {
    const queryRows = jest.fn().mockResolvedValue([
      { hour: '9', avgCount: '4' },
      { hour: '18', avgCount: '22' },
    ]);
    const clickhouse = { queryRows } as unknown as ClickhouseService;
    const service = new StatsService(clickhouse, config);

    const pattern = await service.getHourlyPattern(7);

    expect(pattern).toHaveLength(24);
    expect(pattern.find((p) => p.hour === 9)?.count).toBe(4);
    expect(pattern.find((p) => p.hour === 18)?.count).toBe(22);
    expect(pattern.find((p) => p.hour === 0)?.count).toBe(0);
  });
});
