import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../auth/entities/user.entity';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantStatusDto } from './dto/update-tenant-status.dto';
import { UpdateOperatingHoursDto } from './dto/update-operating-hours.dto';
import { UpdateStoreLayoutDto } from './dto/update-store-layout.dto';
import { UpdateLineCrossingDto } from './dto/update-line-crossing.dto';

interface AuthenticatedRequest extends Request {
  user: { role: UserRole; tenantId: string | null };
}

/** Gestão de clientes (tenants). Listar/criar/inativar/excluir é só para o
 * admin global; ver um cliente específico também é permitido ao
 * tenant_admin do próprio tenant (usado pela tela de usuários dele). */
@ApiTags('tenants')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get()
  @Roles('super_admin')
  findAll() {
    return this.tenants.findAll();
  }

  @Post()
  @Roles('super_admin')
  create(@Body() dto: CreateTenantDto) {
    return this.tenants.create(dto);
  }

  @Get(':id')
  @Roles('super_admin', 'tenant_admin', 'viewer')
  async findOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    if (req.user.role !== 'super_admin' && req.user.tenantId !== id) {
      throw new ForbiddenException('Sem permissão para ver outro cliente');
    }
    const tenant = await this.tenants.findById(id);
    if (!tenant) {
      throw new NotFoundException('Cliente não encontrado');
    }
    return tenant;
  }

  @Patch(':id/status')
  @Roles('super_admin')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateTenantStatusDto) {
    return this.tenants.setActive(id, dto.active);
  }

  @Get(':id/hours')
  @Roles('super_admin', 'tenant_admin', 'viewer')
  async getHours(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    if (req.user.role !== 'super_admin' && req.user.tenantId !== id) {
      throw new ForbiddenException('Sem permissão para ver outro cliente');
    }
    return this.tenants.getHours(id);
  }

  @Patch(':id/hours')
  @Roles('super_admin', 'tenant_admin', 'viewer')
  async updateHours(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateOperatingHoursDto,
  ) {
    if (req.user.role !== 'super_admin' && req.user.tenantId !== id) {
      throw new ForbiddenException('Sem permissão para editar outro cliente');
    }
    return this.tenants.setHours(id, dto);
  }

  @Get(':id/store-layout')
  @Roles('super_admin', 'tenant_admin', 'viewer')
  async getStoreLayout(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    if (req.user.role !== 'super_admin' && req.user.tenantId !== id) {
      throw new ForbiddenException('Sem permissão para ver outro cliente');
    }
    return this.tenants.getStoreLayout(id);
  }

  @Patch(':id/store-layout')
  @Roles('super_admin', 'tenant_admin', 'viewer')
  async updateStoreLayout(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateStoreLayoutDto,
  ) {
    if (req.user.role !== 'super_admin' && req.user.tenantId !== id) {
      throw new ForbiddenException('Sem permissão para editar outro cliente');
    }
    return this.tenants.setStoreLayout(id, dto);
  }

  @Get(':id/line-crossing')
  @Roles('super_admin', 'tenant_admin', 'viewer')
  async getAllLineCrossings(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    if (req.user.role !== 'super_admin' && req.user.tenantId !== id) {
      throw new ForbiddenException('Sem permissão para ver outro cliente');
    }
    return this.tenants.getAllLineCrossings(id);
  }

  @Get(':id/line-crossing/:cameraId')
  @Roles('super_admin', 'tenant_admin', 'viewer')
  async getLineCrossing(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('cameraId') cameraId: string,
  ) {
    if (req.user.role !== 'super_admin' && req.user.tenantId !== id) {
      throw new ForbiddenException('Sem permissão para ver outro cliente');
    }
    return this.tenants.getLineCrossing(id, cameraId);
  }

  @Patch(':id/line-crossing/:cameraId')
  @Roles('super_admin', 'tenant_admin', 'viewer')
  async updateLineCrossing(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('cameraId') cameraId: string,
    @Body() dto: UpdateLineCrossingDto,
  ) {
    if (req.user.role !== 'super_admin' && req.user.tenantId !== id) {
      throw new ForbiddenException('Sem permissão para editar outro cliente');
    }
    return this.tenants.setLineCrossing(id, cameraId, dto);
  }

  @Delete(':id')
  @Roles('super_admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @Query('confirm') confirm?: string): Promise<void> {
    // Apaga o tenant em cascata com todos os usuários dele — exige
    // confirmação explícita na query string pra não ser um DELETE por
    // engano; a confirmação "de verdade" (mostrar quantos usuários somem
    // junto) acontece na tela do dashboard antes de chegar aqui.
    if (confirm !== 'true') {
      throw new BadRequestException('Confirme a exclusão com ?confirm=true');
    }
    await this.tenants.remove(id);
  }
}
