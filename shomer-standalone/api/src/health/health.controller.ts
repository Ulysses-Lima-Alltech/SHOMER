import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ClickhouseService } from '../clickhouse/clickhouse.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly clickhouse: ClickhouseService,
  ) {}

  @Get()
  async check() {
    const [postgres, clickhouse] = await Promise.all([
      this.dataSource
        .query('SELECT 1')
        .then(() => true)
        .catch(() => false),
      this.clickhouse.ping(),
    ]);

    return {
      status: postgres && clickhouse ? 'ok' : 'degraded',
      service: 'shomer-api',
      timestamp: new Date().toISOString(),
      dependencies: { postgres, clickhouse },
    };
  }
}
