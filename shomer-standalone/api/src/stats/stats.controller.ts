import { Body, Controller, ForbiddenException, Get, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CalibrateOccupancyDto } from './dto/calibrate-occupancy.dto';
import { StatsService } from './stats.service';

function parseDays(value: string | undefined): number {
  const parsed = value ? parseInt(value, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 7;
}

interface AuthenticatedRequest extends Request {
  user: { tenantId: string | null; role: string };
}

interface EdgeCamera {
  id: string;
  label: string;
  url: string;
}

/**
 * Layout fixo das 4 câmeras de produção (tenant 1005) - cada uma roda seu
 * próprio processo de edge nesta máquina (ver shomer-standalone/start-1005.bat).
 * Sobrescrevível via EDGE_CAMERAS (JSON) se o layout de câmeras mudar ou
 * outro tenant precisar de um conjunto diferente. camera-04 vem primeiro
 * porque é a câmera de referência usada até aqui no mapa de calor.
 */
const DEFAULT_EDGE_CAMERAS: EdgeCamera[] = [
  { id: 'camera-04', label: 'Joias', url: 'http://localhost:8003' },
  { id: 'camera-01', label: 'Caixa', url: 'http://localhost:8004' },
  { id: 'camera-02', label: 'Roupas', url: 'http://localhost:8001' },
  { id: 'camera-03', label: 'Roupas 2', url: 'http://localhost:8002' },
];

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

  /** Corrige "Agora" pra bater com a contagem real feita à mão na loja -
   * ver StatsService.calibrateOccupancy pro motivo (saldo entradas-saídas
   * zera a cada restart do tracking, mesmo com gente já dentro). */
  @Post('occupancy-calibration')
  @ApiQuery({ name: 'tenantId', required: false })
  async calibrateOccupancy(
    @Req() req: AuthenticatedRequest,
    @Body() body: CalibrateOccupancyDto,
    @Query('tenantId') tenantId?: string,
  ) {
    await this.stats.calibrateOccupancy(this.resolveTenantId(req, tenantId), body.count);
    return { ok: true };
  }

  @Get('hourly')
  @ApiQuery({ name: 'tenantId', required: false })
  hourly(@Req() req: AuthenticatedRequest, @Query('tenantId') tenantId?: string) {
    return this.stats.getHourly(this.resolveTenantId(req, tenantId));
  }

  /** Volume por hora numa janela deslizante das últimas 24h (não reseta à
   * meia-noite como /hourly) — usado pelo gráfico de Relatórios. */
  @Get('last-24h')
  @ApiQuery({ name: 'tenantId', required: false })
  last24Hours(@Req() req: AuthenticatedRequest, @Query('tenantId') tenantId?: string) {
    return this.stats.getLast24Hours(this.resolveTenantId(req, tenantId));
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

  /** Lê EDGE_CAMERAS (JSON) se configurado, senão usa o layout fixo padrão. */
  private getEdgeCameras(): EdgeCamera[] {
    const raw = this.config.get<string>('EDGE_CAMERAS');
    if (!raw) return DEFAULT_EDGE_CAMERAS;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as EdgeCamera[];
    } catch {
      // JSON invalido no .env - cai pro layout padrao em vez de derrubar o serviço.
    }
    return DEFAULT_EDGE_CAMERAS;
  }

  private resolveCamera(cameraId?: string): EdgeCamera {
    const cameras = this.getEdgeCameras();
    return cameras.find((c) => c.id === cameraId) ?? cameras[0];
  }

  /** Lista de câmeras pra popular o seletor no dashboard - so id/label, a
   * URL interna (localhost) não é exposta. */
  @Get('cameras')
  cameras(): Array<{ id: string; label: string }> {
    return this.getEdgeCameras().map(({ id, label }) => ({ id, label }));
  }

  /**
   * Proxeia o snapshot ao vivo (imagem única, não stream) de uma câmera do
   * edge (localhost, so acessivel desta maquina) pro navegador de quem esta
   * logado no dashboard - o dashboard roda no Vercel, entao nao tem como o
   * navegador do cliente chegar direto no edge. Usado só como imagem de
   * fundo do mapa de calor e na tela de calibração da linha de
   * entrada/saída - não existe mais stream/preview ao vivo contínuo (ver
   * histórico: consumia banda do túnel e não era necessário pra contagem).
   */
  @Get('snapshot')
  @ApiQuery({ name: 'cameraId', required: false })
  async snapshot(@Res() res: Response, @Query('cameraId') cameraId?: string): Promise<void> {
    const camera = this.resolveCamera(cameraId);
    try {
      const edgeRes = await fetch(`${camera.url}/vision/snapshot`);
      if (!edgeRes.ok) {
        res.status(502).json({ message: 'Câmera indisponível' });
        return;
      }
      const buffer = Buffer.from(await edgeRes.arrayBuffer());
      res.setHeader('Content-Type', edgeRes.headers.get('content-type') ?? 'image/jpeg');
      res.setHeader('Cache-Control', 'no-store');
      res.send(buffer);
    } catch {
      res.status(502).json({ message: 'Câmera indisponível' });
    }
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
