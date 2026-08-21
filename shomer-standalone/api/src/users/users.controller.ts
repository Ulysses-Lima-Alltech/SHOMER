import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
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
import { UsersService, RequesterContext } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdatePasswordDto } from './dto/update-password.dto';
import { UpdateEmailDto } from './dto/update-email.dto';

interface AuthenticatedRequest extends Request {
  user: RequesterContext;
}

/** Gestão de usuários/acessos — super_admin gerencia qualquer tenant, tenant_admin só o próprio. */
@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Roles('super_admin', 'tenant_admin')
  @ApiQuery({ name: 'tenantId', required: false })
  findAll(@Req() req: AuthenticatedRequest, @Query('tenantId') tenantId?: string) {
    return this.users.findAll(req.user, tenantId);
  }

  @Post()
  @Roles('super_admin', 'tenant_admin')
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateUserDto) {
    return this.users.create(dto, req.user);
  }

  @Patch(':id/password')
  @Roles('super_admin', 'tenant_admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async updatePassword(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePasswordDto,
  ): Promise<void> {
    await this.users.updatePassword(id, dto.password, req.user);
  }

  @Patch(':id/email')
  @Roles('super_admin', 'tenant_admin')
  async updateEmail(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEmailDto,
  ) {
    return this.users.updateEmail(id, dto.email, req.user);
  }

  @Delete(':id')
  @Roles('super_admin', 'tenant_admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.users.remove(id, req.user);
  }
}
