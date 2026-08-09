import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, ClickHouseClient } from '@clickhouse/client';

@Injectable()
export class ClickhouseService implements OnModuleDestroy {
  private readonly logger = new Logger(ClickhouseService.name);
  private readonly client: ClickHouseClient;

  constructor(private readonly config: ConfigService) {
    this.client = createClient({
      host: this.config.get<string>('CLICKHOUSE_URL', 'http://localhost:8123'),
      username: this.config.get<string>('CLICKHOUSE_USER', 'shomer'),
      password: this.config.get<string>('CLICKHOUSE_PASSWORD', 'shomer_dev'),
      database: this.config.get<string>('CLICKHOUSE_DATABASE', 'shomer'),
    });
  }

  getClient(): ClickHouseClient {
    return this.client;
  }

  /** Executa uma query e retorna as linhas já parseadas (formato JSONEachRow). */
  async queryRows<T = Record<string, unknown>>(
    query: string,
    query_params?: Record<string, unknown>,
  ): Promise<T[]> {
    const resultSet = await this.client.query({
      query,
      query_params,
      format: 'JSONEachRow',
    });
    return resultSet.json<T[]>();
  }

  async ping(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result.success;
    } catch (error) {
      this.logger.error(`ClickHouse ping falhou: ${(error as Error).message}`);
      return false;
    }
  }

  async onModuleDestroy() {
    await this.client.close();
  }
}
