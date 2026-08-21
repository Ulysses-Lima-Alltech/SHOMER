import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantActive1755720000000 implements MigrationInterface {
  name = 'AddTenantActive1755720000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenants" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN "active"`);
  }
}
