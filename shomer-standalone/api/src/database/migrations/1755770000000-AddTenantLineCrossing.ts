import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantLineCrossing1755770000000 implements MigrationInterface {
  name = 'AddTenantLineCrossing1755770000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenants" ADD COLUMN "line_crossing" JSONB NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN "line_crossing"`);
  }
}
