import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { User } from './entities/user.entity';

describe('AuthService', () => {
  const makeUser = async (password: string): Promise<User> => {
    const user = new User();
    user.id = 1;
    user.email = 'admin@shomer.com';
    user.passwordHash = await bcrypt.hash(password, 4);
    user.role = 'admin';
    user.createdAt = new Date();
    return user;
  };

  it('valida credenciais corretas', async () => {
    const user = await makeUser('admin123');
    const users = { findOne: jest.fn().mockResolvedValue(user) } as any;
    const jwt = { signAsync: jest.fn() } as any;
    const service = new AuthService(users, jwt);

    const result = await service.validateUser('admin@shomer.com', 'admin123');
    expect(result.email).toBe('admin@shomer.com');
  });

  it('rejeita senha incorreta', async () => {
    const user = await makeUser('admin123');
    const users = { findOne: jest.fn().mockResolvedValue(user) } as any;
    const jwt = { signAsync: jest.fn() } as any;
    const service = new AuthService(users, jwt);

    await expect(
      service.validateUser('admin@shomer.com', 'wrong-password'),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejeita usuário inexistente', async () => {
    const users = { findOne: jest.fn().mockResolvedValue(null) } as any;
    const jwt = { signAsync: jest.fn() } as any;
    const service = new AuthService(users, jwt);

    await expect(
      service.validateUser('nobody@shomer.com', 'whatever'),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('login retorna token e usuário sem o hash da senha', async () => {
    const user = await makeUser('admin123');
    const users = {} as any;
    const jwt = { signAsync: jest.fn().mockResolvedValue('signed-jwt') } as any;
    const service = new AuthService(users, jwt);

    const result = await service.login(user);

    expect(result.accessToken).toBe('signed-jwt');
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(jwt.signAsync).toHaveBeenCalledWith({
      sub: 1,
      email: 'admin@shomer.com',
      role: 'admin',
    });
  });
});
