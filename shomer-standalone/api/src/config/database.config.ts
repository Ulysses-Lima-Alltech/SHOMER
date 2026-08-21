import { DataSource, DataSourceOptions } from 'typeorm';
import * as dotenv from 'dotenv';
import { User } from '../auth/entities/user.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { Device } from '../devices/entities/device.entity';

dotenv.config();

/**
 * Config compartilhada entre o bootstrap do Nest (app.module.ts) e a CLI do
 * TypeORM (scripts migration:generate / migration:run / migration:revert do
 * package.json, que apontam para este arquivo via `-d`).
 */
export const typeOrmConfig: DataSourceOptions = {
  type: 'postgres',
  url:
    process.env.DATABASE_URL ||
    'postgresql://shomer:shomer_dev@localhost:15432/shomer',
  entities: [User, Tenant, Device],
  migrations: [__dirname + '/../database/migrations/*.{js,ts}'],
  synchronize: false,
  logging: process.env.TYPEORM_LOGGING === 'true',
};

const dataSource = new DataSource(typeOrmConfig);
export default dataSource;
