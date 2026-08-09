import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { typeOrmConfig } from './config/database.config';
import { AuthModule } from './auth/auth.module';
import { StatsModule } from './stats/stats.module';
import { ClickhouseModule } from './clickhouse/clickhouse.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    TypeOrmModule.forRoot(typeOrmConfig),
    ClickhouseModule,
    AuthModule,
    StatsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
