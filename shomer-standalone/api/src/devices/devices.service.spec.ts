import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DevicesService } from './devices.service';
import { Device } from './entities/device.entity';

function makeRepos(overrides: {
  devices?: Partial<Record<string, jest.Mock>>;
  tenants?: Partial<Record<string, jest.Mock>>;
}) {
  const devicesRepo = {
    create: jest.fn((data) => data),
    save: jest.fn(async (data) => ({ id: 1, createdAt: new Date(), active: true, ...data })),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    delete: jest.fn(),
    ...overrides.devices,
  } as unknown as jest.Mocked<any>;
  const tenantsRepo = {
    findOne: jest.fn().mockResolvedValue({ id: 'loja-centro', name: 'Loja Centro' }),
    ...overrides.tenants,
  } as unknown as jest.Mocked<any>;
  return { devicesRepo, tenantsRepo };
}

describe('DevicesService', () => {
  it('tenant_admin cria dispositivo no próprio tenant sem precisar informar tenantId', async () => {
    const { devicesRepo, tenantsRepo } = makeRepos({});
    const service = new DevicesService(devicesRepo, tenantsRepo);

    const result = await service.create(
      { name: 'Câmera entrada' },
      { role: 'tenant_admin', tenantId: 'loja-centro' },
    );

    expect(result.tenantId).toBe('loja-centro');
  });

  it('tenant_admin não pode cadastrar dispositivo em outro tenant', async () => {
    const { devicesRepo, tenantsRepo } = makeRepos({});
    const service = new DevicesService(devicesRepo, tenantsRepo);

    await expect(
      service.create(
        { name: 'Câmera entrada', tenantId: 'outro-tenant' },
        { role: 'tenant_admin', tenantId: 'loja-centro' },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('super_admin precisa informar tenantId', async () => {
    const { devicesRepo, tenantsRepo } = makeRepos({});
    const service = new DevicesService(devicesRepo, tenantsRepo);

    await expect(
      service.create({ name: 'Câmera entrada' }, { role: 'super_admin', tenantId: null }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejeita criar dispositivo em tenant inexistente', async () => {
    const { devicesRepo, tenantsRepo } = makeRepos({
      tenants: { findOne: jest.fn().mockResolvedValue(null) },
    });
    const service = new DevicesService(devicesRepo, tenantsRepo);

    await expect(
      service.create(
        { name: 'Câmera entrada', tenantId: 'nao-existe' },
        { role: 'super_admin', tenantId: null },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('findAll força tenant_admin a ver só o próprio tenant', async () => {
    const find = jest.fn().mockResolvedValue([]);
    const { devicesRepo, tenantsRepo } = makeRepos({ devices: { find } });
    const service = new DevicesService(devicesRepo, tenantsRepo);

    await service.findAll({ role: 'tenant_admin', tenantId: 'loja-centro' }, 'outro-tenant');

    expect(find).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'loja-centro' } }));
  });

  it('remove rejeita dispositivo de outro tenant', async () => {
    const target = { id: 5, tenantId: 'outro-tenant' } as Device;
    const { devicesRepo, tenantsRepo } = makeRepos({
      devices: { findOne: jest.fn().mockResolvedValue(target) },
    });
    const service = new DevicesService(devicesRepo, tenantsRepo);

    await expect(
      service.remove(5, { role: 'tenant_admin', tenantId: 'loja-centro' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('remove rejeita dispositivo inexistente', async () => {
    const { devicesRepo, tenantsRepo } = makeRepos({
      devices: { findOne: jest.fn().mockResolvedValue(null) },
    });
    const service = new DevicesService(devicesRepo, tenantsRepo);

    await expect(
      service.remove(99, { role: 'super_admin', tenantId: null }),
    ).rejects.toThrow(NotFoundException);
  });
});
