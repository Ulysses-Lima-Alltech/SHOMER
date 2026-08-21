import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from '../auth/entities/user.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { CreateUserDto } from './dto/create-user.dto';

export interface RequesterContext {
  userId: number;
  role: UserRole;
  tenantId: string | null;
}

const SALT_ROUNDS = 10;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
  ) {}

  async create(dto: CreateUserDto, requester: RequesterContext): Promise<Omit<User, 'passwordHash'>> {
    const { role, tenantId } = this.resolveRoleAndTenant(dto, requester);

    if (tenantId !== null) {
      const tenant = await this.tenants.findOne({ where: { id: tenantId } });
      if (!tenant) {
        throw new BadRequestException(`Tenant "${tenantId}" não existe`);
      }
    }

    const existing = await this.users.findOne({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Já existe um usuário com este email');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const saved = await this.users.save(
      this.users.create({ email: dto.email, passwordHash, role, tenantId }),
    );
    const { passwordHash: _hash, ...safe } = saved;
    return safe;
  }

  async findAll(
    requester: RequesterContext,
    filterTenantId?: string,
  ): Promise<Array<Omit<User, 'passwordHash'>>> {
    const tenantId = requester.role === 'super_admin' ? filterTenantId : requester.tenantId ?? undefined;

    const users = await this.users.find({
      where: tenantId ? { tenantId } : {},
      order: { createdAt: 'DESC' },
    });
    return users.map(({ passwordHash: _hash, ...safe }) => safe);
  }

  async remove(id: number, requester: RequesterContext): Promise<void> {
    if (id === requester.userId) {
      throw new BadRequestException('Não é possível remover o próprio usuário');
    }
    await this.findTargetInScope(id, requester, 'remover');
    await this.users.delete(id);
  }

  async updatePassword(id: number, password: string, requester: RequesterContext): Promise<void> {
    await this.findTargetInScope(id, requester, 'alterar a senha de');
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    await this.users.update(id, { passwordHash, passwordChangedAt: new Date() });
  }

  async updateEmail(id: number, email: string, requester: RequesterContext): Promise<Omit<User, 'passwordHash'>> {
    const target = await this.findTargetInScope(id, requester, 'alterar o email de');
    if (email !== target.email) {
      const existing = await this.users.findOne({ where: { email } });
      if (existing) {
        throw new ConflictException('Já existe um usuário com este email');
      }
    }
    await this.users.update(id, { email });
    const { passwordHash: _hash, ...safe } = { ...target, email };
    return safe;
  }

  /** Confirma que o usuário-alvo existe e está dentro do escopo de tenant do requester. */
  private async findTargetInScope(
    id: number,
    requester: RequesterContext,
    action: string,
  ): Promise<User> {
    const target = await this.users.findOne({ where: { id } });
    if (!target) {
      throw new NotFoundException('Usuário não encontrado');
    }
    if (requester.role === 'tenant_admin' && target.tenantId !== requester.tenantId) {
      throw new ForbiddenException(`Sem permissão para ${action} usuários de outro tenant`);
    }
    return target;
  }

  private resolveRoleAndTenant(
    dto: CreateUserDto,
    requester: RequesterContext,
  ): { role: UserRole; tenantId: string | null } {
    if (requester.role === 'super_admin') {
      if (dto.role === 'super_admin') {
        return { role: 'super_admin', tenantId: null };
      }
      if (!dto.tenantId) {
        throw new BadRequestException('tenantId é obrigatório para role tenant_admin/viewer');
      }
      return { role: dto.role, tenantId: dto.tenantId };
    }

    // tenant_admin: só pode criar usuários dentro do próprio tenant, sem
    // conceder super_admin.
    if (dto.role === 'super_admin') {
      throw new ForbiddenException('Sem permissão para criar super_admin');
    }
    if (dto.tenantId && dto.tenantId !== requester.tenantId) {
      throw new ForbiddenException('Sem permissão para criar usuários em outro tenant');
    }
    return { role: dto.role, tenantId: requester.tenantId };
  }
}
