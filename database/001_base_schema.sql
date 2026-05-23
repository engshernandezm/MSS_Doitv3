-- FonzControl doitv3 — Esquema base
-- 001: Usuarios, Proyectos, Catálogos

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ────────────────────────────────────────────
-- FUNCIÓN: updated_at automático
-- ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- ────────────────────────────────────────────
-- USUARIOS
-- Roles: superadmin | validator | administrativo | buyer | operative
-- ────────────────────────────────────────────
CREATE TABLE users (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    VARCHAR(120) NOT NULL,
  email                   VARCHAR(120) UNIQUE NOT NULL,
  password_hash           VARCHAR(255) NOT NULL,
  role                    VARCHAR(30)  NOT NULL CHECK (role IN ('superadmin','validator','administrativo','buyer','operative')),
  phone_whatsapp          VARCHAR(30),
  phone_verified          BOOLEAN DEFAULT FALSE,
  notification_channel    VARCHAR(20) DEFAULT 'email' CHECK (notification_channel IN ('email','whatsapp','both')),
  is_active               BOOLEAN DEFAULT TRUE,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Tokens reset de contraseña
CREATE TABLE password_reset_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      VARCHAR(100) UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used       BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────
-- PROYECTOS
-- ────────────────────────────────────────────
CREATE TABLE projects (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(120) NOT NULL,
  code       VARCHAR(30)  UNIQUE NOT NULL,
  client     VARCHAR(120),
  is_active  BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER trg_projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Asignación usuario ↔ proyecto (operativos pueden estar en varios proyectos)
CREATE TABLE user_projects (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, project_id)
);

-- ────────────────────────────────────────────
-- CATÁLOGOS: Categorías y Conceptos
-- ────────────────────────────────────────────
CREATE TABLE categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(80) UNIQUE NOT NULL,
  code       VARCHAR(20) UNIQUE NOT NULL,
  is_active  BOOLEAN DEFAULT TRUE
);

CREATE TABLE concepts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name        VARCHAR(120) NOT NULL,
  code        VARCHAR(30)  NOT NULL UNIQUE,
  is_active   BOOLEAN DEFAULT TRUE
);

-- ────────────────────────────────────────────
-- PERMISOS DE CONCEPTO POR ROL
-- Qué conceptos puede usar cada rol
-- ────────────────────────────────────────────
CREATE TABLE concept_permissions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id UUID NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  role       VARCHAR(30) NOT NULL,
  is_allowed BOOLEAN DEFAULT TRUE,
  UNIQUE(concept_id, role)
);

-- ────────────────────────────────────────────
-- TOPES DE GASTO
-- Límite máximo por concepto + rol + proyecto (opcional)
-- action_on_exceed: 'block' | 'escalate'
-- ────────────────────────────────────────────
CREATE TABLE spending_limits (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id       UUID REFERENCES concepts(id) ON DELETE CASCADE,
  role             VARCHAR(30),
  project_id       UUID REFERENCES projects(id) ON DELETE CASCADE,
  max_amount       NUMERIC(12,2) NOT NULL,
  currency         VARCHAR(5) DEFAULT 'MXN',
  action_on_exceed VARCHAR(20) DEFAULT 'block' CHECK (action_on_exceed IN ('block','escalate')),
  UNIQUE(concept_id, role, project_id)
);

-- ────────────────────────────────────────────
-- PERÍODOS CONTABLES
-- ────────────────────────────────────────────
CREATE TABLE accounting_periods (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year        SMALLINT NOT NULL,
  month       SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
  is_closed   BOOLEAN DEFAULT FALSE,
  closed_at   TIMESTAMPTZ,
  closed_by   UUID REFERENCES users(id),
  UNIQUE(year, month)
);

-- Índices útiles
CREATE INDEX idx_users_email          ON users(email);
CREATE INDEX idx_users_role           ON users(role);
CREATE INDEX idx_users_phone          ON users(phone_whatsapp);
CREATE INDEX idx_user_projects_user   ON user_projects(user_id);
CREATE INDEX idx_concepts_category    ON concepts(category_id);
