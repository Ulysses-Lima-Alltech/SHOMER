import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Registro de câmeras/dispositivos edge do cliente — pra referência e
 * acompanhamento no dashboard. Não guarda credenciais de câmera (usuário/
 * senha RTSP): isso continua só no edge/.env de cada instalação, nunca
 * sai da rede do cliente. edgeDeviceId/cameraId aqui são só pra
 * correlacionar com os eventos que chegam com esses mesmos campos.
 */
@Entity('devices')
export class Device {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column()
  name: string;

  @Column({ name: 'edge_device_id', nullable: true })
  edgeDeviceId: string | null;

  @Column({ name: 'camera_id', nullable: true })
  cameraId: string | null;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
