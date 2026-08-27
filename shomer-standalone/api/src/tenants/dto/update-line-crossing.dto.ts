import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsNumber, Max, Min, ValidateNested } from 'class-validator';

export class LineCrossingPointDto {
  @ApiProperty({ example: 0.12 })
  @IsNumber()
  @Min(0)
  @Max(1)
  x: number;

  @ApiProperty({ example: 0.83 })
  @IsNumber()
  @Min(0)
  @Max(1)
  y: number;
}

export class UpdateLineCrossingDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({ type: LineCrossingPointDto })
  @ValidateNested()
  @Type(() => LineCrossingPointDto)
  pointA: LineCrossingPointDto;

  @ApiProperty({ type: LineCrossingPointDto })
  @ValidateNested()
  @Type(() => LineCrossingPointDto)
  pointB: LineCrossingPointDto;

  @ApiProperty({ enum: ['A_TO_B', 'B_TO_A'], example: 'A_TO_B' })
  @IsIn(['A_TO_B', 'B_TO_A'])
  enterDirection: 'A_TO_B' | 'B_TO_A';
}
