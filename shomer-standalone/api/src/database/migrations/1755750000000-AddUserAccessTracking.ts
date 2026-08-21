import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserAccessTracking1755750000000 implements MigrationInterface {
  name = 'AddUserAccessTracking1755750000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" ADD COLUMN "last_login_at" TIMESTAMPTZ NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "users" ADD COLUMN "password_changed_at" TIMESTAMPTZ NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "password_changed_at"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "last_login_at"`);
  }
}
