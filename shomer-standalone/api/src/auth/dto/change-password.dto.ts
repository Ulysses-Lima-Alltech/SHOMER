import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ example: 'senha-atual' })
  @IsString()
  currentPassword: string;

  @ApiProperty({ example: 'nova-senha-123' })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
