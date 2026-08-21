import { SetMetadata } from '@nestjs/common';
import { UserRole } from './entities/user.entity';

export const ROLES_KEY = 'roles';

/** Usar junto com JwtAuthGuard + RolesGuard: @UseGuards(JwtAuthGuard, RolesGuard) */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
