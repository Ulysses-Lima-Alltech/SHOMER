import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { Tenant } from '../tenants/entities/tenant.entity';

export interface JwtPayload {
  sub: number;
  email: string;
  role: string;
  tenantId: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    private readonly jwt: JwtService,
  ) {}

  async validateUser(email: string, password: string): Promise<User> {
    const user = await this.users.findOne({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    // super_admin não tem tenant, então não há status pra checar. Um
    // token já emitido continua valido até expirar mesmo se o tenant for
    // inativado depois — não há invalidação de sessão ativa nesta versão.
    if (user.tenantId) {
      const tenant = await this.tenants.findOne({ where: { id: user.tenantId } });
      if (tenant && !tenant.active) {
        throw new UnauthorizedException('Este cliente está inativo. Fale com o administrador.');
      }
    }

    return user;
  }

  async login(user: User): Promise<{ accessToken: string; user: Omit<User, 'passwordHash'> }> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    };

    const lastLoginAt = new Date();
    await this.users.update(user.id, { lastLoginAt });
    const { passwordHash: _passwordHash, ...safeUser } = user;

    return {
      accessToken: await this.jwt.signAsync(payload),
      user: { ...safeUser, lastLoginAt },
    };
  }

  async changeOwnPassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado');
    }
    const matches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Senha atual incorreta');
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.users.update(userId, { passwordHash, passwordChangedAt: new Date() });
  }

  async findById(id: number): Promise<User | null> {
    return this.users.findOne({ where: { id } });
  }
}
