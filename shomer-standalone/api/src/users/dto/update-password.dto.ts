import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class UpdatePasswordDto {
  @ApiProperty({ example: 'nova-senha-temporaria' })
  @IsString()
  @MinLength(8)
  password: string;
}
