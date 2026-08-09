import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsers1754582400000 implements MigrationInterface {
  name = 'CreateUsers1754582400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" SERIAL PRIMARY KEY,
        "email" VARCHAR NOT NULL UNIQUE,
        "password_hash" VARCHAR NOT NULL,
        "role" VARCHAR NOT NULL DEFAULT 'admin',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
