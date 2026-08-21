import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class UpdateEmailDto {
  @ApiProperty({ example: 'novo-email@loja.com' })
  @IsEmail()
  email: string;
}
