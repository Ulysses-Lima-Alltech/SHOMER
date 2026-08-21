import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateTenantDto {
  @ApiProperty({ example: 'Loja Centro' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;
}
