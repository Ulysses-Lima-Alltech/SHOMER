import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CameraLineCrossing, OperatingHours, StoreBarrier, Tenant } from './entities/tenant.entity';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateOperatingHoursDto } from './dto/update-operating-hours.dto';
import { UpdateStoreLayoutDto } from './dto/update-store-layout.dto';
import { UpdateLineCrossingDto } from './dto/update-line-crossing.dto';

export interface TenantWithUserCount extends Tenant {
  userCount: number;
}

@Injectable()
export class TenantsService {
  constructor(@InjectRepository(Tenant) private readonly tenants: Repository<Tenant>) {}

  /** Código do cliente é gerado pelo sistema (sequência começando em 1001),
   * não escolhido pelo usuário — evita colisão e mantém consistência com o
   * TENANT_ID que vai para o edge.env do cliente. */
  async create(dto: CreateTenantDto): Promise<Tenant> {
    const [{ nextval }] = await this.tenants.manager.query<Array<{ nextval: string }>>(
      `SELECT nextval('tenant_code_seq')`,
    );
    return this.tenants.save(this.tenants.create({ id: nextval, name: dto.name }));
  }

  async findAll(): Promise<TenantWithUserCount[]> {
    return this.tenants.manager.query<TenantWithUserCount[]>(`
      SELECT t.id, t.name, t.active, t.created_at AS "createdAt", COUNT(u.id)::int AS "userCount"
      FROM tenants t
      LEFT JOIN users u ON u.tenant_id = t.id
      GROUP BY t.id, t.name, t.active, t.created_at
      ORDER BY t.name ASC
    `);
  }

  findById(id: string): Promise<Tenant | null> {
    return this.tenants.findOne({ where: { id } });
  }

  /** Inativa/reativa o cliente — usuários de um tenant inativo não
   * conseguem mais logar, mas nada é apagado. */
  async setActive(id: string, active: boolean): Promise<Tenant> {
    const tenant = await this.tenants.findOne({ where: { id } });
    if (!tenant) {
      throw new NotFoundException('Cliente não encontrado');
    }
    tenant.active = active;
    return this.tenants.save(tenant);
  }

  /** Remoção definitiva. O FK users.tenant_id tem ON DELETE CASCADE, então
   * todos os usuários desse cliente são removidos junto — o caller
   * (controller) exige confirmação explícita por causa disso. */
  async remove(id: string): Promise<void> {
    const result = await this.tenants.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException('Cliente não encontrado');
    }
  }

  async getHours(id: string): Promise<OperatingHours | null> {
    const tenant = await this.tenants.findOne({ where: { id } });
    if (!tenant) {
      throw new NotFoundException('Cliente não encontrado');
    }
    return tenant.operatingHours;
  }

  async setHours(id: string, hours: UpdateOperatingHoursDto): Promise<OperatingHours> {
    const tenant = await this.tenants.findOne({ where: { id } });
    if (!tenant) {
      throw new NotFoundException('Cliente não encontrado');
    }
    tenant.operatingHours = hours;
    await this.tenants.save(tenant);
    return hours;
  }

  async getStoreLayout(id: string): Promise<StoreBarrier[]> {
    const tenant = await this.tenants.findOne({ where: { id } });
    if (!tenant) {
      throw new NotFoundException('Cliente não encontrado');
    }
    return tenant.storeLayout ?? [];
  }

  async setStoreLayout(id: string, dto: UpdateStoreLayoutDto): Promise<StoreBarrier[]> {
    const tenant = await this.tenants.findOne({ where: { id } });
    if (!tenant) {
      throw new NotFoundException('Cliente não encontrado');
    }
    tenant.storeLayout = dto.barriers;
    await this.tenants.save(tenant);
    return dto.barriers;
  }

  async getLineCrossing(id: string, cameraId: string): Promise<CameraLineCrossing | null> {
    const tenant = await this.tenants.findOne({ where: { id } });
    if (!tenant) {
      throw new NotFoundException('Cliente não encontrado');
    }
    return tenant.lineCrossingByCamera?.[cameraId] ?? null;
  }

  async getAllLineCrossings(id: string): Promise<Record<string, CameraLineCrossing>> {
    const tenant = await this.tenants.findOne({ where: { id } });
    if (!tenant) {
      throw new NotFoundException('Cliente não encontrado');
    }
    return tenant.lineCrossingByCamera ?? {};
  }

  async setLineCrossing(
    id: string,
    cameraId: string,
    dto: UpdateLineCrossingDto,
  ): Promise<CameraLineCrossing> {
    const tenant = await this.tenants.findOne({ where: { id } });
    if (!tenant) {
      throw new NotFoundException('Cliente não encontrado');
    }
    const existing = tenant.lineCrossingByCamera ?? {};
    // Só uma câmera acompanha entrada/saída por vez - ativar esta desliga
    // qualquer outra que tenha ficado com enabled=true de uma configuração
    // anterior, senão a tela de visualização (que escolhe "a primeira
    // habilitada") fica presa na câmera antiga mesmo depois de trocar.
    const updated: Record<string, CameraLineCrossing> = { ...existing, [cameraId]: dto };
    if (dto.enabled) {
      for (const otherId of Object.keys(updated)) {
        if (otherId !== cameraId && updated[otherId]?.enabled) {
          updated[otherId] = { ...updated[otherId], enabled: false };
        }
      }
    }
    tenant.lineCrossingByCamera = updated;
    await this.tenants.save(tenant);
    return dto;
  }
}
