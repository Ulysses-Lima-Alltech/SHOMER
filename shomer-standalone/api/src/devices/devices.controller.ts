import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
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
import { DevicesService, RequesterContext } from './devices.service';
import { CreateDeviceDto } from './dto/create-device.dto';

interface AuthenticatedRequest extends Request {
  user: RequesterContext;
}

/** Registro de câmeras/dispositivos por cliente — configuração
 * operacional da loja, então qualquer papel autenticado do tenant pode
 * ler/criar/remover (não é uma ação de administração de acessos). */
@ApiTags('devices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('devices')
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Get()
  @Roles('super_admin', 'tenant_admin', 'viewer')
  @ApiQuery({ name: 'tenantId', required: false })
  findAll(@Req() req: AuthenticatedRequest, @Query('tenantId') tenantId?: string) {
    return this.devices.findAll(req.user, tenantId);
  }

  @Post()
  @Roles('super_admin', 'tenant_admin', 'viewer')
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateDeviceDto) {
    return this.devices.create(dto, req.user);
  }

  @Delete(':id')
  @Roles('super_admin', 'tenant_admin', 'viewer')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.devices.remove(id, req.user);
  }
}
