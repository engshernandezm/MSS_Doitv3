-- FonzControl doitv3 — Analytics, Presupuestos, Ingresos
-- 003: Tablas para PRO-004 (Monitoreo y Analítica)

-- ────────────────────────────────────────────
-- PRESUPUESTOS MENSUALES
-- ────────────────────────────────────────────
CREATE TABLE budgets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id),
  year        SMALLINT NOT NULL,
  month       SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
  amount      NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  currency    VARCHAR(5) DEFAULT 'MXN',
  threshold_yellow NUMERIC(5,2) DEFAULT 70.0,
  threshold_red    NUMERIC(5,2) DEFAULT 90.0,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, category_id, year, month)
);
CREATE TRIGGER trg_budgets_updated_at BEFORE UPDATE ON budgets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ────────────────────────────────────────────
-- INGRESOS MENSUALES POR PROYECTO
-- Para calcular utilidad (PRO-003 CU-010)
-- ────────────────────────────────────────────
CREATE TABLE monthly_income (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  year         SMALLINT NOT NULL,
  month        SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
  amount       NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  currency     VARCHAR(5) DEFAULT 'MXN',
  observations TEXT,
  captured_by  UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, year, month)
);
CREATE TRIGGER trg_income_updated_at BEFORE UPDATE ON monthly_income
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Auditoría de cambios en ingresos
CREATE TABLE monthly_income_audit (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  income_id    UUID NOT NULL REFERENCES monthly_income(id),
  prev_amount  NUMERIC(14,2),
  new_amount   NUMERIC(14,2),
  changed_by   UUID REFERENCES users(id),
  observations TEXT,
  changed_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────
-- VISTA: Consumo presupuestal
-- ────────────────────────────────────────────
CREATE OR REPLACE VIEW v_budget_consumption AS
SELECT
  b.id            AS budget_id,
  b.project_id,
  p.name          AS project_name,
  p.code          AS project_code,
  b.category_id,
  c.name          AS category_name,
  b.year,
  b.month,
  b.amount        AS budgeted,
  b.currency,
  b.threshold_yellow,
  b.threshold_red,
  COALESCE(SUM(
    CASE WHEN sr.status NOT IN ('REJECTED','REJECTED_DEFINITIVE','BLOCKED','DRAFT')
    THEN sr.amount_mxn ELSE 0 END
  ), 0) AS consumed,
  CASE WHEN b.amount > 0 THEN
    ROUND(COALESCE(SUM(
      CASE WHEN sr.status NOT IN ('REJECTED','REJECTED_DEFINITIVE','BLOCKED','DRAFT')
      THEN sr.amount_mxn ELSE 0 END
    ), 0) / b.amount * 100, 2)
  ELSE 0 END AS pct_consumed,
  CASE
    WHEN b.amount = 0 THEN 'sin_presupuesto'
    WHEN COALESCE(SUM(
      CASE WHEN sr.status NOT IN ('REJECTED','REJECTED_DEFINITIVE','BLOCKED','DRAFT')
      THEN sr.amount_mxn ELSE 0 END
    ), 0) / b.amount * 100 >= b.threshold_red    THEN 'rojo'
    WHEN COALESCE(SUM(
      CASE WHEN sr.status NOT IN ('REJECTED','REJECTED_DEFINITIVE','BLOCKED','DRAFT')
      THEN sr.amount_mxn ELSE 0 END
    ), 0) / b.amount * 100 >= b.threshold_yellow THEN 'amarillo'
    ELSE 'verde'
  END AS semaforo
FROM budgets b
JOIN projects p    ON p.id = b.project_id
LEFT JOIN categories c ON c.id = b.category_id
LEFT JOIN spending_requests sr
  ON sr.project_id = b.project_id
  AND (b.category_id IS NULL OR sr.category_id = b.category_id)
  AND sr.period_year  = b.year
  AND sr.period_month = b.month
GROUP BY b.id, b.project_id, p.name, p.code, b.category_id, c.name,
         b.year, b.month, b.amount, b.currency, b.threshold_yellow, b.threshold_red;

-- ────────────────────────────────────────────
-- VISTA: Reporte de solicitudes detallado
-- ────────────────────────────────────────────
CREATE OR REPLACE VIEW v_requests_report AS
SELECT
  sr.id,
  sr.folio,
  sr.type,
  sr.status,
  sr.created_at,
  sr.expense_date,
  sr.amount,
  sr.currency,
  sr.amount_mxn,
  sr.exchange_rate,
  sr.sin_factura,
  sr.alert_possible_duplicate,
  sr.alert_anomaly_ml,
  sr.alert_exceeds_limit,
  u.name         AS requester_name,
  u.email        AS requester_email,
  u.role         AS requester_role,
  p.name         AS project_name,
  p.code         AS project_code,
  cat.name       AS category_name,
  con.name       AS concept_name,
  v.name         AS validator_name,
  ocr.rfc_emisor,
  ocr.uuid_cfdi,
  ocr.subtotal,
  ocr.iva,
  ocr.total      AS ocr_total
FROM spending_requests sr
JOIN users u        ON u.id = sr.requester_id
LEFT JOIN projects p    ON p.id = sr.project_id
LEFT JOIN categories cat ON cat.id = sr.category_id
LEFT JOIN concepts con   ON con.id = sr.concept_id
LEFT JOIN users v        ON v.id = sr.assigned_validator_id
LEFT JOIN LATERAL (
  SELECT * FROM request_ocr_data WHERE request_id = sr.id ORDER BY processed_at DESC LIMIT 1
) ocr ON TRUE;

-- ────────────────────────────────────────────
-- VISTA: Utilidad por proyecto y mes
-- ────────────────────────────────────────────
CREATE OR REPLACE VIEW v_project_utility AS
SELECT
  p.id           AS project_id,
  p.name         AS project_name,
  p.code         AS project_code,
  mi.year,
  mi.month,
  mi.amount      AS income,
  COALESCE(gastos.total_gastos, 0) AS expenses,
  mi.amount - COALESCE(gastos.total_gastos, 0) AS utility,
  CASE WHEN mi.amount > 0 THEN
    ROUND((mi.amount - COALESCE(gastos.total_gastos, 0)) / mi.amount * 100, 2)
  ELSE NULL END AS margin_pct
FROM monthly_income mi
JOIN projects p ON p.id = mi.project_id
LEFT JOIN (
  SELECT
    project_id,
    period_year  AS year,
    period_month AS month,
    SUM(amount_mxn) AS total_gastos
  FROM spending_requests
  WHERE status IN ('APPROVED','EXECUTING','PAID','PURCHASED','CLOSED')
  GROUP BY project_id, period_year, period_month
) gastos ON gastos.project_id = mi.project_id
         AND gastos.year = mi.year
         AND gastos.month = mi.month;

CREATE INDEX idx_budgets_project ON budgets(project_id);
CREATE INDEX idx_income_project  ON monthly_income(project_id);
