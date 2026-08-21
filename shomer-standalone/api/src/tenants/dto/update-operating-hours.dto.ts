import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsString, Matches, ValidateNested } from 'class-validator';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class DayHoursDto {
  @ApiProperty({ example: '08:00' })
  @IsString()
  @Matches(TIME_PATTERN, { message: 'open deve ser HH:MM' })
  open: string;

  @ApiProperty({ example: '22:00' })
  @IsString()
  @Matches(TIME_PATTERN, { message: 'close deve ser HH:MM' })
  close: string;

  @ApiProperty({ example: false })
  @IsBoolean()
  closed: boolean;
}

export class UpdateOperatingHoursDto {
  @ApiProperty({ example: 'America/Sao_Paulo' })
  @IsString()
  timezone: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  enabled: boolean;

  @ValidateNested() @Type(() => DayHoursDto) @ApiProperty({ type: DayHoursDto }) monday: DayHoursDto;
  @ValidateNested() @Type(() => DayHoursDto) @ApiProperty({ type: DayHoursDto }) tuesday: DayHoursDto;
  @ValidateNested() @Type(() => DayHoursDto) @ApiProperty({ type: DayHoursDto }) wednesday: DayHoursDto;
  @ValidateNested() @Type(() => DayHoursDto) @ApiProperty({ type: DayHoursDto }) thursday: DayHoursDto;
  @ValidateNested() @Type(() => DayHoursDto) @ApiProperty({ type: DayHoursDto }) friday: DayHoursDto;
  @ValidateNested() @Type(() => DayHoursDto) @ApiProperty({ type: DayHoursDto }) saturday: DayHoursDto;
  @ValidateNested() @Type(() => DayHoursDto) @ApiProperty({ type: DayHoursDto }) sunday: DayHoursDto;
}
