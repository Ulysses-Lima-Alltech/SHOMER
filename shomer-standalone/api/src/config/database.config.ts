import { DataSource, DataSourceOptions } from 'typeorm';
import * as dotenv from 'dotenv';
import { User } from '../auth/entities/user.entity';

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
    'postgresql://shomer:shomer_dev@localhost:5432/shomer',
  entities: [User],
  migrations: [__dirname + '/../database/migrations/*.{js,ts}'],
  synchronize: false,
  logging: process.env.TYPEORM_LOGGING === 'true',
};

const dataSource = new DataSource(typeOrmConfig);
export default dataSource;
