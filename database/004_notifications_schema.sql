-- FonzControl doitv3 — Notificaciones
-- 004: Plantillas, eventos, log de auditoría (PRO-006)

-- ────────────────────────────────────────────
-- PLANTILLAS DE MENSAJES
-- ────────────────────────────────────────────
CREATE TABLE notification_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(80) UNIQUE NOT NULL,
  channel     VARCHAR(20) NOT NULL CHECK (channel IN ('email','whatsapp')),
  subject     VARCHAR(200), -- solo email
  body        TEXT NOT NULL,
  -- Variables disponibles: {{folio}} {{amount}} {{requester_name}} {{project}} {{reason}} {{link}}
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER trg_templates_updated_at BEFORE UPDATE ON notification_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ────────────────────────────────────────────
-- EVENTOS DISPARADORES
-- ────────────────────────────────────────────
CREATE TABLE notification_events (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key            VARCHAR(50) UNIQUE NOT NULL,
  -- SOLICITUD_CREADA | SOLICITUD_APROBADA | SOLICITUD_RECHAZADA | SOLICITUD_ESCALADA
  -- COMPRA_APROBADA | REEMBOLSO_APROBADO | RECORDATORIO_VALIDADOR
  -- PAGO_EJECUTADO | SOLICITUD_CERRADA
  description          VARCHAR(200),
  recipient_roles      TEXT[], -- e.g. ARRAY['validator','operative']
  email_template_id    UUID REFERENCES notification_templates(id),
  whatsapp_template_id UUID REFERENCES notification_templates(id),
  is_active            BOOLEAN DEFAULT TRUE,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────
-- LOG DE AUDITORÍA DE NOTIFICACIONES (inmutable)
-- ────────────────────────────────────────────
CREATE TABLE notification_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    UUID REFERENCES spending_requests(id),
  event_key     VARCHAR(50),
  recipient_id  UUID REFERENCES users(id),
  channel       VARCHAR(20) NOT NULL,
  destination   VARCHAR(200), -- email o número WA
  subject       VARCHAR(200),
  body_excerpt  TEXT,
  status        VARCHAR(20) DEFAULT 'SENT' CHECK (status IN ('SENT','FAILED','PENDING')),
  error_detail  TEXT,
  sent_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────
-- RECORDATORIOS PROGRAMADOS (para escalación)
-- ────────────────────────────────────────────
CREATE TABLE scheduled_reminders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    UUID NOT NULL REFERENCES spending_requests(id) ON DELETE CASCADE,
  recipient_id  UUID NOT NULL REFERENCES users(id),
  remind_at     TIMESTAMPTZ NOT NULL,
  type          VARCHAR(30) DEFAULT 'reminder' CHECK (type IN ('reminder','escalation')),
  sent          BOOLEAN DEFAULT FALSE,
  sent_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────
-- COLA DE NOTIFICACIONES A PROVEEDORES (facturas pendientes)
-- ────────────────────────────────────────────
CREATE TABLE provider_invoice_reminders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    UUID NOT NULL REFERENCES spending_requests(id) ON DELETE CASCADE,
  provider_email VARCHAR(120) NOT NULL,
  last_sent_at  TIMESTAMPTZ,
  send_count    INT DEFAULT 0,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notif_log_request   ON notification_log(request_id);
CREATE INDEX idx_notif_log_recipient ON notification_log(recipient_id);
CREATE INDEX idx_reminders_at        ON scheduled_reminders(remind_at) WHERE sent = FALSE;
CREATE INDEX idx_provider_rem_active ON provider_invoice_reminders(is_active) WHERE is_active = TRUE;
