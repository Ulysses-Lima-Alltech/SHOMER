import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StatsService } from './stats.service';

function parseDays(value: string | undefined): number {
  const parsed = value ? parseInt(value, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 7;
}

@ApiTags('stats')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get('overview')
  overview() {
    return this.stats.getOverview();
  }

  @Get('hourly')
  hourly() {
    return this.stats.getHourly();
  }

  @Get('movement')
  movement() {
    return this.stats.getMovement();
  }

  @Get('daily')
  @ApiQuery({ name: 'days', required: false, example: 7 })
  daily(@Query('days') days?: string) {
    return this.stats.getDaily(parseDays(days));
  }

  @Get('hourly-pattern')
  @ApiQuery({ name: 'days', required: false, example: 7 })
  hourlyPattern(@Query('days') days?: string) {
    return this.stats.getHourlyPattern(parseDays(days));
  }
}
