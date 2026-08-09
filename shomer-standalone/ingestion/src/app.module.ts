import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClickhouseModule } from './clickhouse/clickhouse.module';
import { EventsModule } from './events/events.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    ClickhouseModule,
    EventsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
