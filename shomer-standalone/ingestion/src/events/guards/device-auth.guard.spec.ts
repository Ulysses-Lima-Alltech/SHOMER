import { ConfigService } from '@nestjs/config';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { DeviceAuthGuard } from './device-auth.guard';

function makeContext(headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        header: (name: string) => headers[name.toLowerCase()],
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('DeviceAuthGuard', () => {
  const config = {
    get: () => 'device-1:secret-1,device-2:secret-2',
  } as unknown as ConfigService;

  const guard = new DeviceAuthGuard(config);

  it('permite acesso com credenciais válidas', () => {
    const ctx = makeContext({
      'x-edge-device-id': 'device-1',
      'x-device-key': 'secret-1',
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('rejeita quando a chave não bate', () => {
    const ctx = makeContext({
      'x-edge-device-id': 'device-1',
      'x-device-key': 'wrong-key',
    });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('rejeita quando o device não está cadastrado', () => {
    const ctx = makeContext({
      'x-edge-device-id': 'unknown-device',
      'x-device-key': 'secret-1',
    });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('rejeita quando faltam headers', () => {
    const ctx = makeContext({});
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });
});
