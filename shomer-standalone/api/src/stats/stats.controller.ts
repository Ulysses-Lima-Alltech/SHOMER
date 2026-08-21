import { Controller, ForbiddenException, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StatsService } from './stats.service';

function parseDays(value: string | undefined): number {
  const parsed = value ? parseInt(value, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 7;
}

interface AuthenticatedRequest extends Request {
  user: { tenantId: string | null; role: string };
}

@ApiTags('stats')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('stats')
export class StatsController {
  constructor(
    private readonly stats: StatsService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Usuários de tenant (tenant_admin/viewer) sempre veem o próprio tenant —
   * um ?tenantId= na query é ignorado para eles. super_admin não tem tenant
   * próprio, então pode escolher via ?tenantId=; sem isso, cai no
   * STATS_TENANT_ID de config (mantém o fluxo de dev de antes do
   * multi-tenant funcionando sem precisar passar o parâmetro toda vez).
   */
  private resolveTenantId(req: AuthenticatedRequest, queryTenantId?: string): string {
    if (req.user.tenantId) {
      return req.user.tenantId;
    }
    return queryTenantId || this.config.get<string>('STATS_TENANT_ID', 'demo-tenant-id');
  }

  @Get('overview')
  @ApiQuery({ name: 'tenantId', required: false })
  overview(@Req() req: AuthenticatedRequest, @Query('tenantId') tenantId?: string) {
    return this.stats.getOverview(this.resolveTenantId(req, tenantId));
  }

  @Get('hourly')
  @ApiQuery({ name: 'tenantId', required: false })
  hourly(@Req() req: AuthenticatedRequest, @Query('tenantId') tenantId?: string) {
    return this.stats.getHourly(this.resolveTenantId(req, tenantId));
  }

  @Get('movement')
  @ApiQuery({ name: 'tenantId', required: false })
  movement(@Req() req: AuthenticatedRequest, @Query('tenantId') tenantId?: string) {
    return this.stats.getMovement(this.resolveTenantId(req, tenantId));
  }

  @Get('daily')
  @ApiQuery({ name: 'days', required: false, example: 7 })
  @ApiQuery({ name: 'from', required: false, example: '2026-08-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-08-20' })
  @ApiQuery({ name: 'tenantId', required: false })
  daily(
    @Req() req: AuthenticatedRequest,
    @Query('days') days?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.stats.getDaily(this.resolveTenantId(req, tenantId), parseDays(days), from, to);
  }

  @Get('hourly-pattern')
  @ApiQuery({ name: 'days', required: false, example: 7 })
  @ApiQuery({ name: 'from', required: false, example: '2026-08-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-08-20' })
  @ApiQuery({ name: 'tenantId', required: false })
  hourlyPattern(
    @Req() req: AuthenticatedRequest,
    @Query('days') days?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.stats.getHourlyPattern(this.resolveTenantId(req, tenantId), parseDays(days), from, to);
  }

  @Get('daily-hourly-matrix')
  @ApiQuery({ name: 'days', required: false, example: 7 })
  @ApiQuery({ name: 'from', required: false, example: '2026-08-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-08-20' })
  @ApiQuery({ name: 'tenantId', required: false })
  dailyHourlyMatrix(
    @Req() req: AuthenticatedRequest,
    @Query('days') days?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.stats.getDailyHourlyMatrix(this.resolveTenantId(req, tenantId), parseDays(days), from, to);
  }

  @Get('heatmap')
  @ApiQuery({ name: 'from', required: false, example: '2026-08-20T00:00:00.000Z' })
  @ApiQuery({ name: 'to', required: false, example: '2026-08-20T23:59:59.000Z' })
  @ApiQuery({ name: 'cameraId', required: false })
  @ApiQuery({ name: 'gridSize', required: false, example: 20 })
  @ApiQuery({ name: 'tenantId', required: false })
  heatmap(
    @Req() req: AuthenticatedRequest,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('cameraId') cameraId?: string,
    @Query('gridSize') gridSize?: string,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.stats.getHeatmap(this.resolveTenantId(req, tenantId), {
      from,
      to,
      cameraId,
      gridSize: gridSize ? parseInt(gridSize, 10) : undefined,
    });
  }

  /** Relatório "por cliente" pro admin global — não faz sentido pra
   * tenant_admin/viewer, que já têm o relatório da própria loja. */
  @Get('tenant-summaries')
  @ApiQuery({ name: 'days', required: false, example: 30 })
  @ApiQuery({ name: 'from', required: false, example: '2026-08-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-08-20' })
  tenantSummaries(
    @Req() req: AuthenticatedRequest,
    @Query('days') days?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    if (req.user.role !== 'super_admin') {
      throw new ForbiddenException('Somente o admin global vê o resumo de todos os clientes');
    }
    return this.stats.getTenantSummaries(days ? parseDays(days) : 30, from, to);
  }

  @Get('edge-health')
  @ApiQuery({ name: 'tenantId', required: false })
  edgeHealth(@Req() req: AuthenticatedRequest, @Query('tenantId') tenantId?: string) {
    return this.stats.getEdgeHealth(this.resolveTenantId(req, tenantId));
  }

  @Get('events')
  @ApiQuery({ name: 'type', required: false, example: 'person.detected' })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  @ApiQuery({ name: 'tenantId', required: false })
  events(
    @Req() req: AuthenticatedRequest,
    @Query('type') type?: string,
    @Query('limit') limit?: string,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.stats.getRecentEvents(this.resolveTenantId(req, tenantId), {
      type,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }
}
