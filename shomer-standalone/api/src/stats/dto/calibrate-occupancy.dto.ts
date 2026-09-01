import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class CalibrateOccupancyDto {
  @ApiProperty({ example: 3, description: 'Contagem real de pessoas na loja agora' })
  @IsInt()
  @Min(0)
  count: number;
}
