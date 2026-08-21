import { NotFoundException } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { Tenant } from './entities/tenant.entity';

function makeRepo(queryImpl: jest.Mock, overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    manager: { query: queryImpl },
    save: jest.fn((data) => Promise.resolve({ ...data, createdAt: new Date() })),
    create: jest.fn((data) => data),
    findOne: jest.fn(),
    delete: jest.fn(),
    ...overrides,
  } as unknown as jest.Mocked<any>;
}

describe('TenantsService', () => {
  it('create usa nextval da sequência como código do cliente', async () => {
    const query = jest.fn().mockResolvedValue([{ nextval: '1002' }]);
    const repo = makeRepo(query);
    const service = new TenantsService(repo);

    const tenant = await service.create({ name: 'Loja Centro' });

    expect(query).toHaveBeenCalledWith(`SELECT nextval('tenant_code_seq')`);
    expect(tenant.id).toBe('1002');
    expect(tenant.name).toBe('Loja Centro');
  });

  it('findAll retorna tenants com a contagem de usuários', async () => {
    const rows: Array<Tenant & { userCount: number }> = [
      { id: '1001', name: 'A', createdAt: new Date(), userCount: 3 } as any,
      { id: '1002', name: 'B', createdAt: new Date(), userCount: 0 } as any,
    ];
    const query = jest.fn().mockResolvedValue(rows);
    const repo = makeRepo(query);
    const service = new TenantsService(repo);

    const result = await service.findAll();

    expect(result).toEqual(rows);
    expect(query.mock.calls[0][0]).toContain('LEFT JOIN users');
  });

  it('setActive inativa um cliente existente', async () => {
    const tenant = { id: '1001', name: 'A', active: true } as Tenant;
    const findOne = jest.fn().mockResolvedValue(tenant);
    const repo = makeRepo(jest.fn(), { findOne });
    const service = new TenantsService(repo);

    const result = await service.setActive('1001', false);

    expect(result.active).toBe(false);
  });

  it('setActive rejeita cliente inexistente', async () => {
    const findOne = jest.fn().mockResolvedValue(null);
    const repo = makeRepo(jest.fn(), { findOne });
    const service = new TenantsService(repo);

    await expect(service.setActive('não-existe', false)).rejects.toThrow(NotFoundException);
  });

  it('remove apaga um cliente existente', async () => {
    const del = jest.fn().mockResolvedValue({ affected: 1 });
    const repo = makeRepo(jest.fn(), { delete: del });
    const service = new TenantsService(repo);

    await service.remove('1001');

    expect(del).toHaveBeenCalledWith('1001');
  });

  it('remove rejeita cliente inexistente', async () => {
    const del = jest.fn().mockResolvedValue({ affected: 0 });
    const repo = makeRepo(jest.fn(), { delete: del });
    const service = new TenantsService(repo);

    await expect(service.remove('não-existe')).rejects.toThrow(NotFoundException);
  });

  const sampleHours = {
    timezone: 'America/Sao_Paulo',
    enabled: true,
    monday: { open: '08:00', close: '22:00', closed: false },
    tuesday: { open: '08:00', close: '22:00', closed: false },
    wednesday: { open: '08:00', close: '22:00', closed: false },
    thursday: { open: '08:00', close: '22:00', closed: false },
    friday: { open: '08:00', close: '22:00', closed: false },
    saturday: { open: '08:00', close: '22:00', closed: false },
    sunday: { open: '00:00', close: '00:00', closed: true },
  };

  it('getHours retorna o horário salvo do cliente', async () => {
    const tenant = { id: '1001', operatingHours: sampleHours } as unknown as Tenant;
    const findOne = jest.fn().mockResolvedValue(tenant);
    const repo = makeRepo(jest.fn(), { findOne });
    const service = new TenantsService(repo);

    const result = await service.getHours('1001');

    expect(result).toEqual(sampleHours);
  });

  it('getHours rejeita cliente inexistente', async () => {
    const findOne = jest.fn().mockResolvedValue(null);
    const repo = makeRepo(jest.fn(), { findOne });
    const service = new TenantsService(repo);

    await expect(service.getHours('não-existe')).rejects.toThrow(NotFoundException);
  });

  it('setHours grava o horário no cliente', async () => {
    const tenant = { id: '1001', operatingHours: null } as unknown as Tenant;
    const findOne = jest.fn().mockResolvedValue(tenant);
    const save = jest.fn((data) => Promise.resolve(data));
    const repo = makeRepo(jest.fn(), { findOne, save });
    const service = new TenantsService(repo);

    const result = await service.setHours('1001', sampleHours);

    expect(result).toEqual(sampleHours);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ operatingHours: sampleHours }));
  });
});
