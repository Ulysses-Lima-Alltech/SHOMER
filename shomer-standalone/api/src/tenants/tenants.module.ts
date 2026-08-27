import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from './entities/tenant.entity';
import { TenantsController } from './tenants.controller';
import { PublicHoursController } from './public-hours.controller';
import { PublicLineCrossingController } from './public-line-crossing.controller';
import { TenantsService } from './tenants.service';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant])],
  controllers: [TenantsController, PublicHoursController, PublicLineCrossingController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
