-- Schema do modo histórico no Cloudflare D1.
-- Aplicar no D1 REMOTO (sem --remote aplica so no local e o Worker em producao nao ve a tabela):
--   wrangler d1 execute dashboard-db --remote --file=db/schema.sql
-- Rodar de novo é seguro (IF NOT EXISTS). Quem instalou até a 3.8 precisa rodar de novo para ganhar a
-- tabela snapshot_dias.

-- 3.9.0: o histórico de verdade. UM registro por painel e por dia, com as linhas daquele dia.
-- O cron substitui os dias que a foto nova cobre, mantém os que saíram da janela da fonte e apaga os
-- mais velhos que HISTORICO_DIAS (400 por padrão). O painel lê a série inteira, ou um período.
CREATE TABLE IF NOT EXISTS snapshot_dias (
  dashboard_id  TEXT NOT NULL,        -- id lógico do dashboard (chave no KV)
  dia           TEXT NOT NULL,        -- AAAA-MM-DD; '' para as linhas sem data reconhecível
  captured_at   TEXT NOT NULL,        -- quando a foto que gravou este dia foi tirada (ISO)
  fonte         TEXT NOT NULL,        -- tipo da fonte (sheets, meta)
  columns_json  TEXT NOT NULL,        -- colunas da foto (JSON)
  rows_json     TEXT NOT NULL,        -- linhas deste dia (JSON)
  PRIMARY KEY (dashboard_id, dia)
);

-- Até a 3.8: uma "foto" inteira do DataSet a cada hora. A 3.9.0 não grava mais aqui; o cron apaga as
-- fotos antigas de cada painel na primeira rodada, e o painel só lê esta tabela enquanto o painel ainda
-- não tem nenhum dia em snapshot_dias.
CREATE TABLE IF NOT EXISTS snapshots (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  dashboard_id  TEXT NOT NULL,        -- id lógico do dashboard (chave no KV)
  captured_at   TEXT NOT NULL,        -- data da captura em ISO (ex: 2026-07-06T10:00:00.000Z)
  dataset_json  TEXT NOT NULL         -- DataSet completo (Contrato 1) serializado em JSON
);

CREATE INDEX IF NOT EXISTS idx_snapshots_dashboard_captured
  ON snapshots (dashboard_id, captured_at);
