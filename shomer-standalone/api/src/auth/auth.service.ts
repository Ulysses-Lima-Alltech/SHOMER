import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';

export interface JwtPayload {
  sub: number;
  email: string;
  role: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
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

    return user;
  }

  async login(user: User): Promise<{ accessToken: string; user: Omit<User, 'passwordHash'> }> {
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    const { passwordHash: _passwordHash, ...safeUser } = user;

    return {
      accessToken: await this.jwt.signAsync(payload),
      user: safeUser,
    };
  }

  async findById(id: number): Promise<User | null> {
    return this.users.findOne({ where: { id } });
  }
}
