import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

/**
 * Autenticação de dispositivos edge via headers `x-edge-device-id` / `x-device-key`.
 *
 * MVP: os pares device-id/device-key autorizados vêm da env var EDGE_DEVICES
 * (formato "id1:key1,id2:key2"). Uma implantação real deveria guardar isso
 * numa tabela `devices` no Postgres, com rotação de chave por dispositivo —
 * isso não existe ainda neste repositório.
 */
@Injectable()
export class DeviceAuthGuard implements CanActivate {
  private readonly logger = new Logger(DeviceAuthGuard.name);
  private readonly devices: Map<string, string>;

  constructor(private readonly config: ConfigService) {
    const raw = this.config.get<string>(
      'EDGE_DEVICES',
      'test-device-id:test-device-key',
    );
    this.devices = new Map(
      raw
        .split(',')
        .map((pair) => pair.trim())
        .filter(Boolean)
        .map((pair) => {
          const [id, key] = pair.split(':');
          return [id, key] as [string, string];
        }),
    );
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const deviceId = request.header('x-edge-device-id');
    const deviceKey = request.header('x-device-key');

    if (!deviceId || !deviceKey) {
      throw new UnauthorizedException(
        'Headers x-edge-device-id e x-device-key são obrigatórios',
      );
    }

    const expectedKey = this.devices.get(deviceId);
    if (!expectedKey || expectedKey !== deviceKey) {
      this.logger.warn(`Tentativa de autenticação rejeitada para device ${deviceId}`);
      throw new UnauthorizedException('Credenciais de dispositivo inválidas');
    }

    return true;
  }
}
