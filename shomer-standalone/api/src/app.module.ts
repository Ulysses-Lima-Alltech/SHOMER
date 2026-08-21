import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { typeOrmConfig } from './config/database.config';
import { AuthModule } from './auth/auth.module';
import { StatsModule } from './stats/stats.module';
import { ClickhouseModule } from './clickhouse/clickhouse.module';
import { HealthController } from './health/health.controller';
import { TenantsModule } from './tenants/tenants.module';
import { UsersModule } from './users/users.module';
import { DevicesModule } from './devices/devices.module';

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
    TenantsModule,
    UsersModule,
    DevicesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
