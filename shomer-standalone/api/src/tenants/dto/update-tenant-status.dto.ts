import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateTenantStatusDto {
  @ApiProperty({ example: false })
  @IsBoolean()
  active: boolean;
}
