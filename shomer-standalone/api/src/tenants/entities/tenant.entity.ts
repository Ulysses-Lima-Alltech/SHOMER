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

  // Barreiras físicas da loja (balcão, prateleira, gôndola...) desenhadas
  // manualmente pelo cliente sobre o snapshot da câmera (ver
  // configuracoes -> "Desenhar loja"). Usado só pra overlay visual no mapa
  // de calor - não afeta o cálculo das células, é referência humana.
  @Column({ name: 'store_layout', type: 'jsonb', nullable: true })
  storeLayout: StoreBarrier[] | null;

  // Linha de entrada/saída desenhada pelo cliente sobre o snapshot de uma
  // câmera (ver configuracoes -> "Linha de entrada/saída"), uma por
  // cameraId - normalmente só uma câmera da loja enquadra a porta, as
  // demais ficam de fora deste mapa e continuam servindo só o mapa de
  // calor. Cada processo de edge busca a entrada correspondente ao seu
  // próprio CAMERA_ID num endpoint público (ver
  // public-line-crossing.controller.ts) uma única vez, na inicialização -
  // uma linha salva aqui só passa a valer no próximo restart daquele
  // processo, não em tempo real.
  @Column({ name: 'line_crossing', type: 'jsonb', nullable: true })
  lineCrossingByCamera: Record<string, CameraLineCrossing> | null;

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

export interface StoreLayoutPoint {
  x: number; // 0..1, normalizado pela largura do snapshot da câmera
  y: number; // 0..1, normalizado pela altura do snapshot da câmera
}

export interface StoreBarrier {
  id: string;
  label: string; // ex: "Balcão", "Prateleira 3"
  points: StoreLayoutPoint[]; // polígono, mínimo 3 pontos
}

export interface LineCrossingPoint {
  x: number; // 0..1, normalizado pela largura/altura do snapshot da câmera
  y: number; // 0..1
}

export interface CameraLineCrossing {
  enabled: boolean;
  pointA: LineCrossingPoint;
  pointB: LineCrossingPoint;
  // Lado A->B conta como ENTER; B->A como EXIT (mesma convenção do edge,
  // ver edge/src/analytics/line_crossing.py EnterDirection).
  enterDirection: 'A_TO_B' | 'B_TO_A';
}
