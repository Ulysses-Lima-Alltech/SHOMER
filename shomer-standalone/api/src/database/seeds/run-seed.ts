/**
 * Cria o usuário admin inicial, se ainda não existir.
 * Uso: npm run seed  (ver package.json)
 */
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import dataSource from '../../config/database.config';
import { User } from '../../auth/entities/user.entity';

dotenv.config();

async function run() {
  await dataSource.initialize();

  const email = process.env.SEED_ADMIN_EMAIL || 'admin@shomer.com';
  const password = process.env.SEED_ADMIN_PASSWORD || 'admin123';

  const repo = dataSource.getRepository(User);
  const existing = await repo.findOne({ where: { email } });

  if (existing) {
    // eslint-disable-next-line no-console
    console.log(`Usuário ${email} já existe, nada a fazer.`);
  } else {
    const passwordHash = await bcrypt.hash(password, 10);
    await repo.save(repo.create({ email, passwordHash, role: 'admin' }));
    // eslint-disable-next-line no-console
    console.log(`Usuário admin criado: ${email}`);
  }

  await dataSource.destroy();
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Falha ao rodar seed:', error);
  process.exit(1);
});
