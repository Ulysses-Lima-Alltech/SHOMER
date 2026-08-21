import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsNumber, IsString, Max, Min, ValidateNested } from 'class-validator';

export class StoreLayoutPointDto {
  @ApiProperty({ example: 0.42 })
  @IsNumber()
  @Min(0)
  @Max(1)
  x: number;

  @ApiProperty({ example: 0.18 })
  @IsNumber()
  @Min(0)
  @Max(1)
  y: number;
}

export class StoreBarrierDto {
  @ApiProperty({ example: 'balcao-1' })
  @IsString()
  id: string;

  @ApiProperty({ example: 'Balcão' })
  @IsString()
  label: string;

  @ApiProperty({ type: [StoreLayoutPointDto] })
  @IsArray()
  @ArrayMinSize(3, { message: 'Cada barreira precisa de pelo menos 3 pontos' })
  @ValidateNested({ each: true })
  @Type(() => StoreLayoutPointDto)
  points: StoreLayoutPointDto[];
}

export class UpdateStoreLayoutDto {
  @ApiProperty({ type: [StoreBarrierDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StoreBarrierDto)
  barriers: StoreBarrierDto[];
}
