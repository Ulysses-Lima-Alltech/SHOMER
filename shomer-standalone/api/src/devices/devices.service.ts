import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Device } from './entities/device.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { CreateDeviceDto } from './dto/create-device.dto';
import { UserRole } from '../auth/entities/user.entity';

export interface RequesterContext {
  role: UserRole;
  tenantId: string | null;
}

@Injectable()
export class DevicesService {
  constructor(
    @InjectRepository(Device) private readonly devices: Repository<Device>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
  ) {}

  async create(dto: CreateDeviceDto, requester: RequesterContext): Promise<Device> {
    const tenantId = requester.role === 'super_admin' ? dto.tenantId : requester.tenantId ?? undefined;
    if (!tenantId) {
      throw new BadRequestException('tenantId é obrigatório');
    }
    if (requester.role !== 'super_admin' && dto.tenantId && dto.tenantId !== requester.tenantId) {
      throw new ForbiddenException('Sem permissão para cadastrar dispositivo em outro tenant');
    }
    const tenant = await this.tenants.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new BadRequestException(`Tenant "${tenantId}" não existe`);
    }

    return this.devices.save(
      this.devices.create({
        tenantId,
        name: dto.name,
        edgeDeviceId: dto.edgeDeviceId ?? null,
        cameraId: dto.cameraId ?? null,
      }),
    );
  }

  async findAll(requester: RequesterContext, filterTenantId?: string): Promise<Device[]> {
    const tenantId = requester.role === 'super_admin' ? filterTenantId : requester.tenantId ?? undefined;
    return this.devices.find({
      where: tenantId ? { tenantId } : {},
      order: { createdAt: 'DESC' },
    });
  }

  async remove(id: number, requester: RequesterContext): Promise<void> {
    const device = await this.devices.findOne({ where: { id } });
    if (!device) {
      throw new NotFoundException('Dispositivo não encontrado');
    }
    if (requester.role !== 'super_admin' && device.tenantId !== requester.tenantId) {
      throw new ForbiddenException('Sem permissão para remover dispositivo de outro tenant');
    }
    await this.devices.delete(id);
  }
}
