import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDevices1755740000000 implements MigrationInterface {
  name = 'CreateDevices1755740000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "devices" (
        "id" SERIAL PRIMARY KEY,
        "tenant_id" VARCHAR NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
        "name" VARCHAR NOT NULL,
        "edge_device_id" VARCHAR NULL,
        "camera_id" VARCHAR NULL,
        "active" BOOLEAN NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_devices_tenant_id" ON "devices" ("tenant_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "devices"`);
  }
}
