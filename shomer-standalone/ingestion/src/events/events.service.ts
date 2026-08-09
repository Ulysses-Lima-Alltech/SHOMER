import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClickhouseService } from '../clickhouse/clickhouse.service';
import { EventEnvelopeDto } from './dto/event-envelope.dto';

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly clickhouse: ClickhouseService,
    private readonly config: ConfigService,
  ) {}

  async ingest(event: EventEnvelopeDto): Promise<void> {
    const table = this.config.get<string>('CLICKHOUSE_EVENTS_TABLE', 'events');

    await this.clickhouse.getClient().insert({
      table,
      values: [
        {
          event_id: event.eventId,
          timestamp: this.toClickhouseDateTime(event.timestamp),
          tenant_id: event.tenantId,
          store_id: event.storeId ?? null,
          type: event.type,
          event_version: event.eventVersion,
          payload: JSON.stringify(event.payload ?? {}),
        },
      ],
      format: 'JSONEachRow',
    });

    this.logger.log(`Evento gravado: ${event.type} (${event.eventId})`);
  }

  /** ClickHouse DateTime64 espera "YYYY-MM-DD HH:MM:SS.mmm" em vez de ISO 8601. */
  private toClickhouseDateTime(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      throw new Error(`timestamp inválido: ${iso}`);
    }
    return date.toISOString().replace('T', ' ').replace('Z', '');
  }
}
