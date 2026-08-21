import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Device } from './entities/device.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';

@Module({
  imports: [TypeOrmModule.forFeature([Device, Tenant])],
  controllers: [DevicesController],
  providers: [DevicesService],
})
export class DevicesModule {}
