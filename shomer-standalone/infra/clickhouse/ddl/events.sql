-- ClickHouse DDL para tabela de eventos
-- Particionamento por data (YYYY-MM-DD)
-- TTL de 1 ano para dados antigos (opcional, pode ser ajustado)

CREATE DATABASE IF NOT EXISTS shomer;

USE shomer;

CREATE TABLE IF NOT EXISTS events
(
    event_id String,
    timestamp DateTime64(3),
    tenant_id String,
    store_id Nullable(String),
    type String,
    event_version String DEFAULT 'v1',
    payload String,  -- JSON como string
    created_at DateTime DEFAULT now()
)
ENGINE = MergeTree()
PARTITION BY toYYYYMMDD(timestamp)
ORDER BY (tenant_id, timestamp, type)
TTL toDate(timestamp) + INTERVAL 1 YEAR
SETTINGS index_granularity = 8192;

-- Índices secundários para queries comuns
ALTER TABLE events ADD INDEX idx_store_id store_id TYPE bloom_filter GRANULARITY 1;
ALTER TABLE events ADD INDEX idx_type type TYPE bloom_filter GRANULARITY 1;

-- View materializada para eventos por tipo (opcional, para analytics)
CREATE MATERIALIZED VIEW IF NOT EXISTS events_by_type
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMMDD(hour)
ORDER BY (tenant_id, store_id, type, hour)
AS SELECT
    tenant_id,
    coalesce(store_id, '') as store_id,
    type,
    toStartOfHour(timestamp) as hour,
    count() as event_count
FROM events
GROUP BY tenant_id, store_id, type, hour;




