import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from '../auth/entities/user.entity';

function makeRepos(overrides: {
  users?: Partial<Record<string, jest.Mock>>;
  tenants?: Partial<Record<string, jest.Mock>>;
}) {
  const usersRepo = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((data) => data),
    save: jest.fn(async (data) => ({ id: 42, createdAt: new Date(), ...data })),
    delete: jest.fn(),
    update: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    ...overrides.users,
  } as unknown as jest.Mocked<any>;
  const tenantsRepo = {
    findOne: jest.fn().mockResolvedValue({ id: 'loja-centro', name: 'Loja Centro' }),
    ...overrides.tenants,
  } as unknown as jest.Mocked<any>;
  return { usersRepo, tenantsRepo };
}

describe('UsersService', () => {
  it('super_admin cria tenant_admin em qualquer tenant existente', async () => {
    const { usersRepo, tenantsRepo } = makeRepos({});
    const service = new UsersService(usersRepo, tenantsRepo);

    const result = await service.create(
      { email: 'a@b.com', password: 'senha1234', role: 'tenant_admin', tenantId: 'loja-centro' },
      { userId: 1, role: 'super_admin', tenantId: null },
    );

    expect(result.role).toBe('tenant_admin');
    expect(result.tenantId).toBe('loja-centro');
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('super_admin não pode criar usuário em tenant inexistente', async () => {
    const { usersRepo, tenantsRepo } = makeRepos({ tenants: { findOne: jest.fn().mockResolvedValue(null) } });
    const service = new UsersService(usersRepo, tenantsRepo);

    await expect(
      service.create(
        { email: 'a@b.com', password: 'senha1234', role: 'viewer', tenantId: 'nao-existe' },
        { userId: 1, role: 'super_admin', tenantId: null },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('tenant_admin não pode criar super_admin', async () => {
    const { usersRepo, tenantsRepo } = makeRepos({});
    const service = new UsersService(usersRepo, tenantsRepo);

    await expect(
      service.create(
        { email: 'a@b.com', password: 'senha1234', role: 'super_admin' },
        { userId: 1, role: 'tenant_admin', tenantId: 'loja-centro' },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('tenant_admin não pode criar usuário em outro tenant', async () => {
    const { usersRepo, tenantsRepo } = makeRepos({});
    const service = new UsersService(usersRepo, tenantsRepo);

    await expect(
      service.create(
        { email: 'a@b.com', password: 'senha1234', role: 'viewer', tenantId: 'outro-tenant' },
        { userId: 1, role: 'tenant_admin', tenantId: 'loja-centro' },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('tenant_admin cria viewer forçado no próprio tenant, mesmo sem tenantId no body', async () => {
    const { usersRepo, tenantsRepo } = makeRepos({});
    const service = new UsersService(usersRepo, tenantsRepo);

    const result = await service.create(
      { email: 'a@b.com', password: 'senha1234', role: 'viewer' },
      { userId: 1, role: 'tenant_admin', tenantId: 'loja-centro' },
    );

    expect(result.tenantId).toBe('loja-centro');
  });

  it('findAll força tenant_admin a ver apenas o próprio tenant, mesmo pedindo outro', async () => {
    const find = jest.fn().mockResolvedValue([]);
    const { usersRepo, tenantsRepo } = makeRepos({ users: { find } });
    const service = new UsersService(usersRepo, tenantsRepo);

    await service.findAll({ userId: 1, role: 'tenant_admin', tenantId: 'loja-centro' }, 'outro-tenant');

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'loja-centro' } }),
    );
  });

  it('findAll permite super_admin filtrar por qualquer tenant', async () => {
    const find = jest.fn().mockResolvedValue([]);
    const { usersRepo, tenantsRepo } = makeRepos({ users: { find } });
    const service = new UsersService(usersRepo, tenantsRepo);

    await service.findAll({ userId: 1, role: 'super_admin', tenantId: null }, 'loja-centro');

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'loja-centro' } }),
    );
  });

  it('remove rejeita remover o próprio usuário', async () => {
    const { usersRepo, tenantsRepo } = makeRepos({});
    const service = new UsersService(usersRepo, tenantsRepo);

    await expect(
      service.remove(1, { userId: 1, role: 'super_admin', tenantId: null }),
    ).rejects.toThrow(BadRequestException);
  });

  it('remove rejeita usuário inexistente', async () => {
    const { usersRepo, tenantsRepo } = makeRepos({ users: { findOne: jest.fn().mockResolvedValue(null) } });
    const service = new UsersService(usersRepo, tenantsRepo);

    await expect(
      service.remove(99, { userId: 1, role: 'super_admin', tenantId: null }),
    ).rejects.toThrow(NotFoundException);
  });

  it('tenant_admin não pode remover usuário de outro tenant', async () => {
    const target = { id: 5, tenantId: 'outro-tenant' } as User;
    const { usersRepo, tenantsRepo } = makeRepos({ users: { findOne: jest.fn().mockResolvedValue(target) } });
    const service = new UsersService(usersRepo, tenantsRepo);

    await expect(
      service.remove(5, { userId: 1, role: 'tenant_admin', tenantId: 'loja-centro' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('updatePassword grava o hash da nova senha para um usuário do próprio tenant', async () => {
    const target = { id: 5, tenantId: 'loja-centro' } as User;
    const update = jest.fn();
    const { usersRepo, tenantsRepo } = makeRepos({
      users: { findOne: jest.fn().mockResolvedValue(target), update },
    });
    const service = new UsersService(usersRepo, tenantsRepo);

    await service.updatePassword(5, 'nova-senha-123', {
      userId: 1,
      role: 'tenant_admin',
      tenantId: 'loja-centro',
    });

    expect(update).toHaveBeenCalledWith(5, {
      passwordHash: expect.any(String),
      passwordChangedAt: expect.any(Date),
    });
    const [, { passwordHash }] = update.mock.calls[0];
    expect(passwordHash).not.toBe('nova-senha-123');
  });

  it('updatePassword rejeita usuário inexistente', async () => {
    const { usersRepo, tenantsRepo } = makeRepos({ users: { findOne: jest.fn().mockResolvedValue(null) } });
    const service = new UsersService(usersRepo, tenantsRepo);

    await expect(
      service.updatePassword(99, 'nova-senha-123', { userId: 1, role: 'super_admin', tenantId: null }),
    ).rejects.toThrow(NotFoundException);
  });

  it('tenant_admin não pode alterar senha de usuário de outro tenant', async () => {
    const target = { id: 5, tenantId: 'outro-tenant' } as User;
    const { usersRepo, tenantsRepo } = makeRepos({ users: { findOne: jest.fn().mockResolvedValue(target) } });
    const service = new UsersService(usersRepo, tenantsRepo);

    await expect(
      service.updatePassword(5, 'nova-senha-123', { userId: 1, role: 'tenant_admin', tenantId: 'loja-centro' }),
    ).rejects.toThrow(ForbiddenException);
  });
});
