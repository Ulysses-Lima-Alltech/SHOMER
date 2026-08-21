/**
 * Cria o usuário admin inicial, se ainda não existir.
 * Uso: npm run seed  (ver package.json)
 */
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import dataSource from '../../config/database.config';
import { User } from '../../auth/entities/user.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';

dotenv.config();

async function run() {
  await dataSource.initialize();

  const email = process.env.SEED_ADMIN_EMAIL || 'admin@shomer.com';
  const password = process.env.SEED_ADMIN_PASSWORD || 'admin123';

  const tenants = dataSource.getRepository(Tenant);
  const existingTenant = await tenants.findOne({ where: { id: 'demo-tenant-id' } });
  if (!existingTenant) {
    await tenants.save(tenants.create({ id: 'demo-tenant-id', name: 'Loja Demo' }));
    // eslint-disable-next-line no-console
    console.log('Tenant demo-tenant-id criado.');
  }

  const users = dataSource.getRepository(User);
  const existing = await users.findOne({ where: { email } });

  if (existing) {
    // eslint-disable-next-line no-console
    console.log(`Usuário ${email} já existe, nada a fazer.`);
  } else {
    const passwordHash = await bcrypt.hash(password, 10);
    // super_admin: sem tenant, gerencia todos os clientes/tenants.
    await users.save(users.create({ email, passwordHash, role: 'super_admin', tenantId: null }));
    // eslint-disable-next-line no-console
    console.log(`Usuário super_admin criado: ${email}`);
  }

  await dataSource.destroy();
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Falha ao rodar seed:', error);
  process.exit(1);
});
