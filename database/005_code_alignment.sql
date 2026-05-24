-- Migración 005: Alinear esquema con el código del backend
-- Ejecutar UNA sola vez sobre la BD existente

-- ─── spending_requests: columnas que el código usa pero no existen ───────────
ALTER TABLE spending_requests
  ADD COLUMN IF NOT EXISTS observations           TEXT,
  ADD COLUMN IF NOT EXISTS comprobante_path       VARCHAR(500),
  ADD COLUMN IF NOT EXISTS factura_path           VARCHAR(500),
  ADD COLUMN IF NOT EXISTS validator_id           UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS rejected_reason        TEXT,
  ADD COLUMN IF NOT EXISTS definitive_rejection   BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS possible_duplicate     BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS anomaly_ml             BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS exceeds_limit          BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ocr_rfc_emisor         VARCHAR(20),
  ADD COLUMN IF NOT EXISTS ocr_uuid_cfdi          VARCHAR(60),
  ADD COLUMN IF NOT EXISTS ocr_subtotal           NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS ocr_iva                NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS ocr_total              NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS ocr_fecha_cfdi         DATE,
  ADD COLUMN IF NOT EXISTS ocr_confidence         NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS ocr_is_legible         BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS ocr_raw_text           TEXT,
  ADD COLUMN IF NOT EXISTS payment_method         VARCHAR(30),
  ADD COLUMN IF NOT EXISTS payment_reference      VARCHAR(100),
  ADD COLUMN IF NOT EXISTS payment_notes          TEXT,
  ADD COLUMN IF NOT EXISTS payment_executed_by    UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS payment_date           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS warehouse_received     BOOLEAN DEFAULT FALSE;

-- folio: necesita default automático (la función ya existe)
ALTER TABLE spending_requests ALTER COLUMN folio DROP NOT NULL;
ALTER TABLE spending_requests ALTER COLUMN folio SET DEFAULT '';

CREATE OR REPLACE FUNCTION auto_generate_folio()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.folio IS NULL OR NEW.folio = '' THEN
    NEW.folio := generate_folio(NEW.type);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_folio ON spending_requests;
CREATE TRIGGER trg_auto_folio
  BEFORE INSERT ON spending_requests
  FOR EACH ROW EXECUTE FUNCTION auto_generate_folio();

-- ─── approval_history: columnas que el código usa pero no existen ────────────
ALTER TABLE approval_history
  ADD COLUMN IF NOT EXISTS user_id      UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS comment      TEXT,
  ADD COLUMN IF NOT EXISTS from_status  VARCHAR(40),
  ADD COLUMN IF NOT EXISTS to_status    VARCHAR(40);

-- ─── validation_log: columna 'value' que el código usa ───────────────────────
ALTER TABLE validation_log
  ADD COLUMN IF NOT EXISTS value NUMERIC;

-- ─── warehouse_receipts: columnas que el código usa ──────────────────────────
ALTER TABLE warehouse_receipts
  ADD COLUMN IF NOT EXISTS received_by    UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS signature_path VARCHAR(255);

-- ─── routing_rules: name era NOT NULL pero el código no lo envía ─────────────
ALTER TABLE routing_rules ALTER COLUMN name DROP NOT NULL;
ALTER TABLE routing_rules ALTER COLUMN name SET DEFAULT '';
