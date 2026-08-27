import { ConfigService } from '@nestjs/config';
import { StatsService, countDistinctPeople, cosineSimilarity } from './stats.service';
import { ClickhouseService } from '../clickhouse/clickhouse.service';
import { TenantsService } from '../tenants/tenants.service';

describe('StatsService', () => {
  const config = { get: (_key: string, fallback?: string) => fallback ?? 'demo-tenant-id' } as unknown as ConfigService;
  const tenants = { findAll: jest.fn().mockResolvedValue([]) } as unknown as TenantsService;

  it('getHourly preenche as 24 horas, mesmo sem dados em algumas', async () => {
    const queryRows = jest.fn().mockResolvedValue([
      { hour: '9', count: '5' },
      { hour: '14', count: '20' },
    ]);
    const clickhouse = { queryRows } as unknown as ClickhouseService;
    const service = new StatsService(clickhouse, config, tenants);

    const hourly = await service.getHourly('tenant-1');

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
    const service = new StatsService(clickhouse, config, tenants);

    const movement = await service.getMovement('tenant-1');

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

  it('getOverview combina as métricas das três consultas (pico, direção, último evento) e deriva a ocupação atual de entradas - saídas', async () => {
    const queryRows = jest
      .fn()
      .mockResolvedValueOnce([{ today: '2026-08-09' }])
      .mockResolvedValueOnce([{ peak: '9', peakHour: '14' }])
      .mockResolvedValueOnce([
        { direction: 'enter', c: '60' },
        { direction: 'exit', c: '52' },
      ])
      .mockResolvedValueOnce([{ lastEvent: '2026-08-09T14:32:10.000Z' }]);
    const clickhouse = { queryRows } as unknown as ClickhouseService;
    const service = new StatsService(clickhouse, config, tenants);

    const overview = await service.getOverview('tenant-1');

    expect(overview).toEqual({
      visitorsToday: 60,
      currentOccupancy: 8,
      peakToday: 9,
      peakHour: 14,
      entriesToday: 60,
      exitsToday: 52,
      lastEventAt: '2026-08-09T14:32:10.000Z',
    });
  });

  it('getOverview nunca deixa a ocupação atual negativa quando ha mais saidas que entradas', async () => {
    const queryRows = jest
      .fn()
      .mockResolvedValueOnce([{ today: '2026-08-09' }])
      .mockResolvedValueOnce([{ peak: '9', peakHour: '14' }])
      .mockResolvedValueOnce([
        { direction: 'enter', c: '5' },
        { direction: 'exit', c: '7' },
      ])
      .mockResolvedValueOnce([{ lastEvent: '2026-08-09T14:32:10.000Z' }]);
    const clickhouse = { queryRows } as unknown as ClickhouseService;
    const service = new StatsService(clickhouse, config, tenants);

    const overview = await service.getOverview('tenant-1');

    expect(overview.currentOccupancy).toBe(0);
  });

  it('getOverview retorna lastEventAt nulo quando não há nenhum evento ainda', async () => {
    const queryRows = jest
      .fn()
      .mockResolvedValueOnce([{ today: '2026-08-09' }])
      .mockResolvedValueOnce([{ peak: '0', peakHour: null }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ lastEvent: '1970-01-01T00:00:00.000Z' }]);
    const clickhouse = { queryRows } as unknown as ClickhouseService;
    const service = new StatsService(clickhouse, config, tenants);

    const overview = await service.getOverview('tenant-1');

    expect(overview.currentOccupancy).toBe(0);
    expect(overview.lastEventAt).toBeNull();
  });

  it('getDaily preenche todos os dias do período, mesmo os sem dados', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const queryRows = jest
      .fn()
      .mockResolvedValueOnce([{ today }])
      .mockResolvedValueOnce([{ date: today, count: '15' }]);
    const clickhouse = { queryRows } as unknown as ClickhouseService;
    const service = new StatsService(clickhouse, config, tenants);

    const daily = await service.getDaily('tenant-1', 3);

    expect(daily.days).toHaveLength(3);
    expect(daily.days[daily.days.length - 1]).toEqual({ date: today, count: 15 });
    expect(daily.totalVisitors).toBe(15);
    expect(daily.averagePerDay).toBe(5);
    expect(daily.bestDay).toEqual({ date: today, count: 15 });
  });

  it('getDaily retorna bestDay nulo quando não há nenhum visitante no período', async () => {
    const queryRows = jest.fn().mockResolvedValue([]);
    const clickhouse = { queryRows } as unknown as ClickhouseService;
    const service = new StatsService(clickhouse, config, tenants);

    const daily = await service.getDaily('tenant-1', 5);

    expect(daily.totalVisitors).toBe(0);
    expect(daily.bestDay).toBeNull();
  });

  it('getHourlyPattern preenche as 24 horas com a média calculada pelo ClickHouse', async () => {
    const queryRows = jest.fn().mockResolvedValue([
      { hour: '9', avgCount: '4' },
      { hour: '18', avgCount: '22' },
    ]);
    const clickhouse = { queryRows } as unknown as ClickhouseService;
    const service = new StatsService(clickhouse, config, tenants);

    const pattern = await service.getHourlyPattern('tenant-1', 7);

    expect(pattern).toHaveLength(24);
    expect(pattern.find((p) => p.hour === 9)?.count).toBe(4);
    expect(pattern.find((p) => p.hour === 18)?.count).toBe(22);
    expect(pattern.find((p) => p.hour === 0)?.count).toBe(0);
  });

  it('getHeatmap agrega as células retornadas e calcula maxCount/totalPoints', async () => {
    const queryRows = jest.fn().mockResolvedValue([
      { cellX: '2', cellY: '3', c: '10' },
      { cellX: '5', cellY: '5', c: '25' },
      { cellX: '0', cellY: '0', c: '5' },
    ]);
    const clickhouse = { queryRows } as unknown as ClickhouseService;
    const service = new StatsService(clickhouse, config, tenants);

    const heatmap = await service.getHeatmap('tenant-1', { gridSize: 20 });

    expect(heatmap.gridSize).toBe(20);
    expect(heatmap.cells).toEqual([
      { x: 2, y: 3, count: 10 },
      { x: 5, y: 5, count: 25 },
      { x: 0, y: 0, count: 5 },
    ]);
    expect(heatmap.maxCount).toBe(25);
    expect(heatmap.totalPoints).toBe(40);
  });

  it('getHeatmap limita gridSize entre 5 e 50', async () => {
    const queryRows = jest.fn().mockResolvedValue([]);
    const clickhouse = { queryRows } as unknown as ClickhouseService;
    const service = new StatsService(clickhouse, config, tenants);

    expect((await service.getHeatmap('tenant-1', { gridSize: 200 })).gridSize).toBe(50);
    expect((await service.getHeatmap('tenant-1', { gridSize: 1 })).gridSize).toBe(5);
  });

  it('getHeatmap usa janela padrão de 24h quando from/to não são informados', async () => {
    const queryRows = jest.fn().mockResolvedValue([]);
    const clickhouse = { queryRows } as unknown as ClickhouseService;
    const service = new StatsService(clickhouse, config, tenants);

    const heatmap = await service.getHeatmap('tenant-1', {});

    const fromMs = new Date(heatmap.from).getTime();
    const toMs = new Date(heatmap.to).getTime();
    expect(toMs - fromMs).toBeCloseTo(24 * 60 * 60 * 1000, -2);
  });

  it('getEdgeHealth retorna tudo nulo quando não há nenhum health report ainda', async () => {
    const queryRows = jest.fn().mockResolvedValue([]);
    const clickhouse = { queryRows } as unknown as ClickhouseService;
    const service = new StatsService(clickhouse, config, tenants);

    const health = await service.getEdgeHealth('tenant-1');

    expect(health).toEqual({
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
    });
  });

  it('getEdgeHealth faz parse do payload mais recente', async () => {
    const queryRows = jest.fn().mockResolvedValue([
      {
        timestamp: '2026-08-20T12:00:00.000Z',
        payload: JSON.stringify({
          edgeDeviceId: 'edge-1',
          cameraId: 'camera-1',
          status: 'healthy',
          cameraConnected: true,
          modelReady: true,
          framesProcessed: 500,
          personsCurrent: 3,
          lastFrameAt: '2026-08-20T11:59:59.000Z',
          lastError: null,
        }),
      },
    ]);
    const clickhouse = { queryRows } as unknown as ClickhouseService;
    const service = new StatsService(clickhouse, config, tenants);

    const health = await service.getEdgeHealth('tenant-1');

    expect(health.status).toBe('healthy');
    expect(health.cameraConnected).toBe(true);
    expect(health.framesProcessed).toBe(500);
    expect(health.reportedAt).toBe('2026-08-20T12:00:00.000Z');
  });

  it('getRecentEvents faz parse do payload e limita entre 1 e 200', async () => {
    const queryRows = jest.fn().mockResolvedValue([
      {
        event_id: 'evt-1',
        timestamp: '2026-08-20T12:00:00.000Z',
        type: 'person.detected',
        payload: JSON.stringify({ trackId: '7' }),
      },
    ]);
    const clickhouse = { queryRows } as unknown as ClickhouseService;
    const service = new StatsService(clickhouse, config, tenants);

    const events = await service.getRecentEvents('tenant-1', { limit: 500 });

    expect(events).toEqual([
      {
        eventId: 'evt-1',
        timestamp: '2026-08-20T12:00:00.000Z',
        type: 'person.detected',
        payload: { trackId: '7' },
      },
    ]);
  });
});

describe('cosineSimilarity', () => {
  it('retorna 1 para vetores unitarios identicos', () => {
    // [0.6, 0.8] tem norma 1 (0.6^2 + 0.8^2 = 1) - como os embeddings do
    // OSNet, que ja vem L2-normalizados do edge.
    expect(cosineSimilarity([0.6, 0.8], [0.6, 0.8])).toBeCloseTo(1);
  });

  it('retorna 0 para vetores ortogonais (nenhuma semelhanca)', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });

  it('retorna um valor intermediario para vetores parecidos mas nao identicos', () => {
    const value = cosineSimilarity([0.6, 0.8], [0.8, 0.6]);
    expect(value).toBeCloseTo(0.96);
  });
});

describe('countDistinctPeople', () => {
  it('conta cada (camera, track) separadamente quando nao ha aparencia', () => {
    const count = countDistinctPeople([
      { cameraId: 'cam-1', trackId: '1', appearance: null, timestampMs: 1000 },
      { cameraId: 'cam-2', trackId: '1', appearance: null, timestampMs: 1000 },
    ]);
    expect(count).toBe(2);
  });

  it('funde duas cameras diferentes vendo a mesma pessoa no mesmo instante', () => {
    const sameColor = [0.9, 0.1];
    const count = countDistinctPeople([
      { cameraId: 'cam-1', trackId: '1', appearance: sameColor, timestampMs: 1000 },
      { cameraId: 'cam-2', trackId: '5', appearance: sameColor, timestampMs: 1500 },
    ]);
    expect(count).toBe(1);
  });

  it('nao funde detecoes distantes no tempo mesmo com aparencia identica', () => {
    const sameColor = [0.9, 0.1];
    const count = countDistinctPeople([
      { cameraId: 'cam-1', trackId: '1', appearance: sameColor, timestampMs: 1000 },
      { cameraId: 'cam-2', trackId: '5', appearance: sameColor, timestampMs: 10000 },
    ]);
    expect(count).toBe(2);
  });

  it('nao funde cores muito diferentes mesmo no mesmo instante', () => {
    const count = countDistinctPeople([
      { cameraId: 'cam-1', trackId: '1', appearance: [1, 0], timestampMs: 1000 },
      { cameraId: 'cam-2', trackId: '5', appearance: [0, 1], timestampMs: 1000 },
    ]);
    expect(count).toBe(2);
  });

  it('nao funde duas pessoas diferentes na MESMA camera, mesmo com aparencia parecida', () => {
    const sameColor = [0.9, 0.1];
    const count = countDistinctPeople([
      { cameraId: 'cam-1', trackId: '1', appearance: sameColor, timestampMs: 1000 },
      { cameraId: 'cam-1', trackId: '2', appearance: sameColor, timestampMs: 1000 },
    ]);
    expect(count).toBe(2);
  });

  it('funde tres cameras por transitividade mesmo quando a primeira e a ultima estao fora da janela direta', () => {
    const sameColor = [0.9, 0.1];
    // cam-1↔cam-2 e cam-2↔cam-3 estao dentro da janela de 2s, mas
    // cam-1↔cam-3 sozinhos (diferenca de 3s) nao estariam - o union-find
    // ainda assim funde os tres num unico grupo via cam-2.
    const count = countDistinctPeople([
      { cameraId: 'cam-1', trackId: '1', appearance: sameColor, timestampMs: 0 },
      { cameraId: 'cam-2', trackId: '2', appearance: sameColor, timestampMs: 1500 },
      { cameraId: 'cam-3', trackId: '3', appearance: sameColor, timestampMs: 3000 },
    ]);
    expect(count).toBe(1);
  });
});
