-- FonzControl doitv3 — Solicitudes de Gasto
-- 002: Solicitudes, documentos, OCR, conversaciones WhatsApp

-- ────────────────────────────────────────────
-- SOLICITUDES DE GASTO
-- type: REEMBOLSO | REQUISICION
-- status flow: DRAFT → PENDING_VALIDATION → PENDING_APPROVAL →
--              APPROVED → EXECUTING → PAID/PURCHASED → CLOSED
--              REJECTED | REJECTED_DEFINITIVE | BLOCKED
-- ────────────────────────────────────────────
CREATE TABLE spending_requests (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio                     VARCHAR(20) UNIQUE NOT NULL,
  type                      VARCHAR(20) NOT NULL CHECK (type IN ('REEMBOLSO','REQUISICION')),
  requester_id              UUID NOT NULL REFERENCES users(id),
  project_id                UUID REFERENCES projects(id),
  category_id               UUID REFERENCES categories(id),
  concept_id                UUID REFERENCES concepts(id),
  description               TEXT,
  amount                    NUMERIC(12,2),
  currency                  VARCHAR(5) DEFAULT 'MXN' CHECK (currency IN ('MXN','USD')),
  exchange_rate             NUMERIC(10,4) DEFAULT 1.0,
  amount_mxn                NUMERIC(12,2) GENERATED ALWAYS AS (amount * exchange_rate) STORED,

  -- Sin factura
  sin_factura               BOOLEAN DEFAULT FALSE,
  observaciones_sin_factura TEXT,

  -- Estado
  status                    VARCHAR(40) NOT NULL DEFAULT 'DRAFT',
  is_definitive_rejection   BOOLEAN DEFAULT FALSE,
  rejection_reason          TEXT,

  -- Alertas de validación
  alert_possible_duplicate  BOOLEAN DEFAULT FALSE,
  alert_duplicate_ref_id    UUID REFERENCES spending_requests(id),
  alert_anomaly_ml          BOOLEAN DEFAULT FALSE,
  alert_anomaly_score       NUMERIC(5,2),
  alert_anomaly_reason      TEXT,
  alert_exceeds_limit       BOOLEAN DEFAULT FALSE,

  -- Validador asignado
  assigned_validator_id     UUID REFERENCES users(id),
  assigned_at               TIMESTAMPTZ,

  -- Datos de ejecución (se llenan en PRO-003)
  executed_amount           NUMERIC(12,2),
  executed_currency         VARCHAR(5),
  executed_method           VARCHAR(30) CHECK (executed_method IN ('tarjeta','transferencia','deposito','efectivo')),
  provider_email            VARCHAR(120),
  executed_at               TIMESTAMPTZ,
  executor_id               UUID REFERENCES users(id),

  -- Periodo contable
  expense_date              DATE,
  period_year               SMALLINT,
  period_month              SMALLINT,

  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER trg_requests_updated_at BEFORE UPDATE ON spending_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Secuencia de folios
CREATE SEQUENCE folio_seq START 1000;

-- Función para generar folios: SR-001000, RQ-001000
CREATE OR REPLACE FUNCTION generate_folio(req_type VARCHAR)
RETURNS VARCHAR AS $$
DECLARE
  prefix VARCHAR(3);
  seq_val BIGINT;
BEGIN
  prefix := CASE WHEN req_type = 'REEMBOLSO' THEN 'SR' ELSE 'RQ' END;
  seq_val := nextval('folio_seq');
  RETURN prefix || '-' || LPAD(seq_val::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- ────────────────────────────────────────────
-- DOCUMENTOS ADJUNTOS
-- ────────────────────────────────────────────
CREATE TABLE request_documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  UUID NOT NULL REFERENCES spending_requests(id) ON DELETE CASCADE,
  doc_type    VARCHAR(30) NOT NULL, -- comprobante | factura | cotizacion | comprobante_pago | xml_cfdi | otro
  file_name   VARCHAR(255) NOT NULL,
  file_path   VARCHAR(500) NOT NULL,
  mime_type   VARCHAR(80),
  file_size   INT,
  uploaded_by UUID REFERENCES users(id),
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────
-- DATOS OCR EXTRAÍDOS DEL COMPROBANTE
-- ────────────────────────────────────────────
CREATE TABLE request_ocr_data (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id     UUID NOT NULL REFERENCES spending_requests(id) ON DELETE CASCADE,
  document_id    UUID REFERENCES request_documents(id),
  rfc_emisor     VARCHAR(20),
  rfc_receptor   VARCHAR(20),
  uuid_cfdi      VARCHAR(60),
  folio_fiscal   VARCHAR(40),
  subtotal       NUMERIC(12,2),
  iva            NUMERIC(12,2),
  total          NUMERIC(12,2),
  fecha_cfdi     DATE,
  concepto_cfdi  TEXT,
  is_legible     BOOLEAN DEFAULT TRUE,
  confidence     NUMERIC(5,2), -- 0-100
  raw_json       JSONB,
  processed_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────
-- LOG DE VALIDACIONES AUTOMÁTICAS
-- ────────────────────────────────────────────
CREATE TABLE validation_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  UUID NOT NULL REFERENCES spending_requests(id) ON DELETE CASCADE,
  step        VARCHAR(50) NOT NULL, -- legibility | fiscal | duplicates | period | concept | limits | ml_anomaly
  status      VARCHAR(20) NOT NULL CHECK (status IN ('PASS','FAIL','WARN','SKIP')),
  message     TEXT,
  detail      JSONB,
  checked_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────
-- HISTORIAL DE APROBACIONES
-- ────────────────────────────────────────────
CREATE TABLE approval_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    UUID NOT NULL REFERENCES spending_requests(id) ON DELETE CASCADE,
  actor_id      UUID REFERENCES users(id),
  action        VARCHAR(30) NOT NULL, -- APPROVED | REJECTED | REJECTED_DEFINITIVE | ESCALATED | CORRECTED | RESENT
  reason        TEXT,
  is_definitive BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────
-- REGLAS DE ENRUTAMIENTO (quién aprueba qué)
-- ────────────────────────────────────────────
CREATE TABLE routing_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(80) NOT NULL,
  project_id      UUID REFERENCES projects(id),
  category_id     UUID REFERENCES categories(id),
  min_amount      NUMERIC(12,2),
  max_amount      NUMERIC(12,2),
  requester_role  VARCHAR(30),
  validator_id    UUID NOT NULL REFERENCES users(id),
  priority        INT DEFAULT 10,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────
-- REGLAS DE ESCALACIÓN
-- ────────────────────────────────────────────
CREATE TABLE escalation_rules (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_validator_id   UUID NOT NULL REFERENCES users(id),
  to_validator_id     UUID REFERENCES users(id), -- NULL = superadmin
  reminder_hours      INT DEFAULT 24,
  escalation_hours    INT DEFAULT 48,
  is_active           BOOLEAN DEFAULT TRUE
);

-- ────────────────────────────────────────────
-- RECEPCIÓN EN ALMACÉN (PRO-003 CU-009)
-- ────────────────────────────────────────────
CREATE TABLE warehouse_receipts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id          UUID NOT NULL REFERENCES spending_requests(id),
  receiver_id         UUID REFERENCES users(id),
  received_at         TIMESTAMPTZ DEFAULT NOW(),
  qty_ordered         NUMERIC(10,2),
  qty_received        NUMERIC(10,2),
  status              VARCHAR(30) DEFAULT 'CONFORME' CHECK (status IN ('CONFORME','NO_CONFORME','CON_OBSERVACIONES')),
  observations        TEXT,
  digital_signature   VARCHAR(255),
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────
-- CONVERSACIONES WHATSAPP (máquina de estados)
-- ────────────────────────────────────────────
CREATE TABLE whatsapp_conversations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         VARCHAR(30) NOT NULL,
  user_id       UUID REFERENCES users(id),
  state         VARCHAR(50) DEFAULT 'IDLE',
  -- states: IDLE | WAITING_PROJECT | WAITING_TYPE | WAITING_OBSERVATIONS | WAITING_CONFIRM | DONE
  context       JSONB DEFAULT '{}',
  expires_at    TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 minutes',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER trg_wa_conv_updated_at BEFORE UPDATE ON whatsapp_conversations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Índices
CREATE INDEX idx_requests_requester  ON spending_requests(requester_id);
CREATE INDEX idx_requests_project    ON spending_requests(project_id);
CREATE INDEX idx_requests_status     ON spending_requests(status);
CREATE INDEX idx_requests_folio      ON spending_requests(folio);
CREATE INDEX idx_requests_created    ON spending_requests(created_at DESC);
CREATE INDEX idx_validation_req      ON validation_log(request_id);
CREATE INDEX idx_approval_req        ON approval_history(request_id);
CREATE INDEX idx_wa_phone            ON whatsapp_conversations(phone);
