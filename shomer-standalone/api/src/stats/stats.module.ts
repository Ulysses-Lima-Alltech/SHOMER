import { Module } from '@nestjs/common';
import { TenantsModule } from '../tenants/tenants.module';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

@Module({
  imports: [TenantsModule],
  controllers: [StatsController],
  providers: [StatsService],
})
export class StatsModule {}
