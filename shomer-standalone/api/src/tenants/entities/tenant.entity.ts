import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('tenants')
export class Tenant {
  // Slug legível (ex: "loja-centro"), não UUID — é o mesmo valor usado como
  // tenant_id nos eventos do ClickHouse (edge/.env TENANT_ID), então login
  // e dados batem sem precisar de uma tabela de mapeamento.
  @PrimaryColumn()
  id: string;

  @Column()
  name: string;

  // Cliente inativo: usuários do tenant não conseguem mais logar, mas
  // nada é apagado (histórico/eventos continuam intactos).
  @Column({ default: true })
  active: boolean;

  // Horário de funcionamento da loja — o edge consulta isso (endpoint
  // público, ver public-hours.controller.ts) pra pausar o processamento
  // de vídeo fora do horário e economizar CPU/GPU. null = sem horário
  // configurado, processa 24h.
  @Column({ name: 'operating_hours', type: 'jsonb', nullable: true })
  operatingHours: OperatingHours | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

export interface DayHours {
  open: string; // "HH:MM"
  close: string; // "HH:MM"
  closed: boolean;
}

export interface OperatingHours {
  timezone: string; // ex: "America/Sao_Paulo"
  enabled: boolean; // desliga a checagem sem apagar os horários configurados
  monday: DayHours;
  tuesday: DayHours;
  wednesday: DayHours;
  thursday: DayHours;
  friday: DayHours;
  saturday: DayHours;
  sunday: DayHours;
}
