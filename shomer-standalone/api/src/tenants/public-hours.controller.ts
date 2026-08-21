import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';

/**
 * Endpoint sem autenticação — o edge não tem login de usuário, só as
 * credenciais de dispositivo do ingestion (mecanismo diferente). Horário
 * de funcionamento não é dado sensível, então em vez de duplicar um
 * guard de dispositivo aqui, o endpoint fica público, só de leitura, e
 * só devolve os horários (nada de dados de outros clientes).
 */
@ApiTags('public')
@Controller('public/tenants')
export class PublicHoursController {
  constructor(private readonly tenants: TenantsService) {}

  @Get(':id/hours')
  async getHours(@Param('id') id: string) {
    const tenant = await this.tenants.findById(id);
    if (!tenant) {
      throw new NotFoundException('Cliente não encontrado');
    }
    return { operatingHours: tenant.operatingHours };
  }
}
