import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { UserRole } from '../../auth/entities/user.entity';

export class CreateUserDto {
  @ApiProperty({ example: 'cliente@loja.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'senha-temporaria-123' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ enum: ['super_admin', 'tenant_admin', 'viewer'], example: 'tenant_admin' })
  @IsIn(['super_admin', 'tenant_admin', 'viewer'])
  role: UserRole;

  @ApiProperty({
    example: 'loja-centro',
    required: false,
    description: 'Obrigatório salvo quando role=super_admin (que não tem tenant)',
  })
  @IsOptional()
  @IsString()
  tenantId?: string | null;
}
