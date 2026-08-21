import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantOperatingHours1755730000000 implements MigrationInterface {
  name = 'AddTenantOperatingHours1755730000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenants" ADD COLUMN "operating_hours" JSONB NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN "operating_hours"`);
  }
}
