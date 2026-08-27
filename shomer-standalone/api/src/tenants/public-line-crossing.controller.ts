import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';

/**
 * Endpoint sem autenticação — mesma justificativa do PublicHoursController:
 * o edge não tem login de usuário, e as coordenadas de uma linha na tela não
 * são dado sensível (só geometria, sem imagem nem identidade). Cada processo
 * de edge busca isso uma vez, na inicialização, usando seu próprio
 * CAMERA_ID — uma linha salva no dashboard só passa a valer no próximo
 * restart daquele processo específico, não em tempo real (ver
 * edge/src/schedule/remote_line_crossing.py).
 */
@ApiTags('public')
@Controller('public/tenants')
export class PublicLineCrossingController {
  constructor(private readonly tenants: TenantsService) {}

  @Get(':id/line-crossing/:cameraId')
  async getLineCrossing(@Param('id') id: string, @Param('cameraId') cameraId: string) {
    const tenant = await this.tenants.findById(id);
    if (!tenant) {
      throw new NotFoundException('Cliente não encontrado');
    }
    return { lineCrossing: tenant.lineCrossingByCamera?.[cameraId] ?? null };
  }
}
