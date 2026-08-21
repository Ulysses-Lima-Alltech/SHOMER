import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateDeviceDto {
  @ApiProperty({ example: 'Câmera entrada' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @ApiProperty({ required: false, example: 'shomer-edge-01' })
  @IsOptional()
  @IsString()
  edgeDeviceId?: string;

  @ApiProperty({ required: false, example: 'camera-01' })
  @IsOptional()
  @IsString()
  cameraId?: string;

  @ApiProperty({
    required: false,
    example: 'loja-centro',
    description: 'Obrigatório quando quem cria é super_admin (que não tem tenant próprio)',
  })
  @IsOptional()
  @IsString()
  tenantId?: string;
}
