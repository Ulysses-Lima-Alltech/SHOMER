import { ConfigService } from '@nestjs/config';
import { EventsService } from './events.service';
import { ClickhouseService } from '../clickhouse/clickhouse.service';

describe('EventsService', () => {
  it('grava o evento no ClickHouse com os campos mapeados corretamente', async () => {
    const insert = jest.fn().mockResolvedValue(undefined);
    const clickhouse = {
      getClient: () => ({ insert }),
    } as unknown as ClickhouseService;
    const config = { get: (_key: string, fallback?: string) => fallback ?? 'events' } as unknown as ConfigService;

    const service = new EventsService(clickhouse, config);

    await service.ingest({
      eventId: 'evt-1',
      timestamp: '2026-08-07T18:00:00.000Z',
      tenantId: 'demo-tenant-id',
      storeId: 'store-centro',
      type: 'person.detected',
      eventVersion: 'v1',
      payload: { trackId: 'track-1' },
    });

    expect(insert).toHaveBeenCalledTimes(1);
    const call = insert.mock.calls[0][0];
    expect(call.table).toBe('events');
    expect(call.format).toBe('JSONEachRow');
    expect(call.values[0]).toMatchObject({
      event_id: 'evt-1',
      tenant_id: 'demo-tenant-id',
      store_id: 'store-centro',
      type: 'person.detected',
      event_version: 'v1',
    });
    expect(call.values[0].payload).toBe(JSON.stringify({ trackId: 'track-1' }));
    expect(call.values[0].timestamp).toBe('2026-08-07 18:00:00.000');
  });

  it('rejeita timestamp inválido', async () => {
    const clickhouse = { getClient: () => ({ insert: jest.fn() }) } as unknown as ClickhouseService;
    const config = { get: (_key: string, fallback?: string) => fallback ?? 'events' } as unknown as ConfigService;
    const service = new EventsService(clickhouse, config);

    await expect(
      service.ingest({
        eventId: 'evt-1',
        timestamp: 'not-a-date',
        tenantId: 't',
        type: 'person.detected',
        eventVersion: 'v1',
        payload: {},
      }),
    ).rejects.toThrow('timestamp inválido');
  });
});
