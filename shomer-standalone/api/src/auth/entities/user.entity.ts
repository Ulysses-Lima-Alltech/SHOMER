import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

// 'super_admin': sem tenant, gerencia todos os clientes (cria tenants e
// usuários de qualquer tenant). 'tenant_admin': gerencia usuários dentro do
// próprio tenant. 'viewer': acesso somente leitura ao dashboard do tenant.
export type UserRole = 'super_admin' | 'tenant_admin' | 'viewer';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  @Column({ default: 'viewer' })
  role: UserRole;

  // Null apenas para super_admin — todo usuário de tenant precisa de um.
  @Column({ name: 'tenant_id', nullable: true })
  tenantId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  @Column({ name: 'password_changed_at', type: 'timestamptz', nullable: true })
  passwordChangedAt: Date | null;
}
