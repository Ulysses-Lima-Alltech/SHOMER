# ClickHouse DDL

Este diretório contém os scripts DDL para criação das tabelas no ClickHouse.

## Execução

Os scripts podem ser executados de duas formas:

### 1. Via Docker (recomendado para desenvolvimento)

```bash
# Conectar ao container
docker exec -it shomer-clickhouse clickhouse-client

# Executar o script
SOURCE /docker-entrypoint-initdb.d/events.sql
```

### 2. Via CLI local

```bash
clickhouse-client --host localhost --port 9000 --user shomer --password shomer_dev < events.sql
```

### 3. Via HTTP

```bash
curl 'http://localhost:8123/' \
  --data-binary @events.sql \
  --user shomer:shomer_dev
```

## Estrutura

- `events.sql`: Tabela principal de eventos com particionamento por data
- `init.sql`: Script de inicialização (placeholder)

## Notas

- A tabela `events` é particionada por data (YYYY-MM-DD)
- TTL de 1 ano configurado (pode ser ajustado)
- Índices bloom filter para queries por store_id e type
- View materializada para analytics agregados




