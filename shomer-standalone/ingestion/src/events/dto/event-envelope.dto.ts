import { ApiProperty } from '@nestjs/swagger';
import {
  IsISO8601,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class EventEnvelopeDto {
  @ApiProperty({ example: 'b3f1c2d4-...' })
  @IsString()
  @IsNotEmpty()
  eventId: string;

  @ApiProperty({ example: '2026-08-07T18:00:00.000Z' })
  @IsISO8601()
  timestamp: string;

  @ApiProperty({ example: 'demo-tenant-id' })
  @IsString()
  @IsNotEmpty()
  tenantId: string;

  @ApiProperty({ example: 'store-centro', required: false, nullable: true })
  @IsOptional()
  @IsString()
  storeId?: string | null;

  @ApiProperty({ example: 'person.detected' })
  @IsString()
  @IsNotEmpty()
  type: string;

  @ApiProperty({ example: 'v1' })
  @IsString()
  @IsNotEmpty()
  eventVersion: string;

  @ApiProperty({ type: Object })
  @IsObject()
  payload: Record<string, unknown>;
}
