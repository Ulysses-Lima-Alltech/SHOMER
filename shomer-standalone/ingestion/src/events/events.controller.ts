import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { EventsService } from './events.service';
import { EventEnvelopeDto } from './dto/event-envelope.dto';
import { DeviceAuthGuard } from './guards/device-auth.guard';

@ApiTags('events')
@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  @HttpCode(202)
  @UseGuards(DeviceAuthGuard)
  @ApiHeader({ name: 'x-edge-device-id', required: true })
  @ApiHeader({ name: 'x-device-key', required: true })
  async receive(@Body() event: EventEnvelopeDto) {
    await this.eventsService.ingest(event);
    return { accepted: true, eventId: event.eventId };
  }
}
