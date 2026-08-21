import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMultiTenant1755700000000 implements MigrationInterface {
  name = 'AddMultiTenant1755700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "tenants" (
        "id" VARCHAR PRIMARY KEY,
        "name" VARCHAR NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    // Semeia o tenant demo já usado pelo edge/api em dev (edge/.env
    // TENANT_ID e api/.env STATS_TENANT_ID), pra ambiente novo não quebrar.
    await queryRunner.query(`
      INSERT INTO "tenants" ("id", "name") VALUES ('demo-tenant-id', 'Loja Demo')
      ON CONFLICT ("id") DO NOTHING
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN "tenant_id" VARCHAR NULL REFERENCES "tenants"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_users_tenant_id" ON "users" ("tenant_id")
    `);

    // Usuários existentes com role 'admin' (valor antigo, pré multi-tenant)
    // viram super_admin — mantém acesso total sem tenant atribuído.
    await queryRunner.query(`
      UPDATE "users" SET "role" = 'super_admin' WHERE "role" = 'admin'
    `);

    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'viewer'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "users" SET "role" = 'admin' WHERE "role" = 'super_admin'`);
    await queryRunner.query(`DROP INDEX "idx_users_tenant_id"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "tenant_id"`);
    await queryRunner.query(`DROP TABLE "tenants"`);
  }
}
