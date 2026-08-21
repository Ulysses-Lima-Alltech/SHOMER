import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantCodeSequence1755710000000 implements MigrationInterface {
  name = 'AddTenantCodeSequence1755710000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Código do cliente vira automático a partir daqui (1001, 1002, ...) —
    // começa depois do maior código numérico já usado, pra não colidir com
    // tenants criados manualmente antes dessa migration.
    await queryRunner.query(`
      DO $$
      DECLARE
        next_start bigint;
      BEGIN
        SELECT GREATEST(1001, COALESCE(MAX(id::bigint), 0) + 1) INTO next_start
        FROM tenants
        WHERE id ~ '^[0-9]+$';
        EXECUTE format('CREATE SEQUENCE tenant_code_seq START WITH %s', next_start);
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP SEQUENCE IF EXISTS tenant_code_seq`);
  }
}
