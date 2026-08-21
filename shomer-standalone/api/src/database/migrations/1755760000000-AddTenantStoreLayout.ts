import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantStoreLayout1755760000000 implements MigrationInterface {
  name = 'AddTenantStoreLayout1755760000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenants" ADD COLUMN "store_layout" JSONB NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN "store_layout"`);
  }
}
