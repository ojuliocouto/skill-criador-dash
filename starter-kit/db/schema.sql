-- Schema do modo histórico (snapshots) no Cloudflare D1.
-- Cada linha é uma "foto" do DataSet de um dashboard num instante.
-- O dashboard lê o snapshot mais recente; o cron grava novos periodicamente.
-- Aplicar com: wrangler d1 execute <DB> --file=db/schema.sql

CREATE TABLE IF NOT EXISTS snapshots (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  dashboard_id  TEXT NOT NULL,        -- id lógico do dashboard (chave no KV)
  captured_at   TEXT NOT NULL,        -- data da captura em ISO (ex: 2026-07-06T10:00:00.000Z)
  dataset_json  TEXT NOT NULL         -- DataSet completo (Contrato 1) serializado em JSON
);

-- Índice para achar rápido o snapshot mais recente de um dashboard.
CREATE INDEX IF NOT EXISTS idx_snapshots_dashboard_captured
  ON snapshots (dashboard_id, captured_at);
