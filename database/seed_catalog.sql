-- Seed: Catálogos base (categorías, conceptos, períodos)

-- ────────────────────────────────────────────
-- PERÍODOS CONTABLES (año actual)
-- ────────────────────────────────────────────
INSERT INTO accounting_periods (year, month, is_closed) VALUES
(2026,1,true),(2026,2,true),(2026,3,true),(2026,4,false),
(2026,5,false),(2026,6,false),(2026,7,false),(2026,8,false),
(2026,9,false),(2026,10,false),(2026,11,false),(2026,12,false)
ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────
-- PROYECTOS DE EJEMPLO
-- ────────────────────────────────────────────
INSERT INTO projects (id, name, code, client, is_active) VALUES
('11111111-0000-0000-0000-000000000001','VW Puebla','VWP','Volkswagen de México',true),
('11111111-0000-0000-0000-000000000002','Audi San José','ASJ','Audi México',true),
('11111111-0000-0000-0000-000000000003','Schaeffler Irapuato','SCHI','Schaeffler México',true),
('11111111-0000-0000-0000-000000000004','Schaeffler Puebla','SCHP','Schaeffler Puebla',true)
ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────
-- CATEGORÍAS
-- ────────────────────────────────────────────
INSERT INTO categories (id, name, code) VALUES
('22222222-0001-0000-0000-000000000001','Transporte','TRANS'),
('22222222-0002-0000-0000-000000000001','Alimentación','ALIM'),
('22222222-0003-0000-0000-000000000001','Herramientas/Material','HERR'),
('22222222-0004-0000-0000-000000000001','Servicios','SERV'),
('22222222-0005-0000-0000-000000000001','Viáticos','VIAT'),
('22222222-0006-0000-0000-000000000001','Oficina','OFIC'),
('22222222-0007-0000-0000-000000000001','Tecnología','TECH'),
('22222222-0008-0000-0000-000000000001','Uniformes/EPP','EPP'),
('22222222-0009-0000-0000-000000000001','Otro','OTRO')
ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────
-- CONCEPTOS
-- ────────────────────────────────────────────
-- Transporte
INSERT INTO concepts (id, category_id, name, code) VALUES
('33333333-0001-0001-0000-000000000001','22222222-0001-0000-0000-000000000001','Gasolina','GAS'),
('33333333-0001-0002-0000-000000000001','22222222-0001-0000-0000-000000000001','Casetas','CASETA'),
('33333333-0001-0003-0000-000000000001','22222222-0001-0000-0000-000000000001','Taxi/Uber','TAXI'),
('33333333-0001-0004-0000-000000000001','22222222-0001-0000-0000-000000000001','Autobús','BUS');
-- Alimentación
INSERT INTO concepts (id, category_id, name, code) VALUES
('33333333-0002-0001-0000-000000000001','22222222-0002-0000-0000-000000000001','Comida personal','COMIDA'),
('33333333-0002-0002-0000-000000000001','22222222-0002-0000-0000-000000000001','Consumibles (agua/hielo)','CONSUMIBLE');
-- Herramientas/Material
INSERT INTO concepts (id, category_id, name, code) VALUES
('33333333-0003-0001-0000-000000000001','22222222-0003-0000-0000-000000000001','Material de oficina','PAPELERIA'),
('33333333-0003-0002-0000-000000000001','22222222-0003-0000-0000-000000000001','Herramientas','HERRAMIENTA'),
('33333333-0003-0003-0000-000000000001','22222222-0003-0000-0000-000000000001','Materiales de construcción','MAT_CONST');
-- Servicios
INSERT INTO concepts (id, category_id, name, code) VALUES
('33333333-0004-0001-0000-000000000001','22222222-0004-0000-0000-000000000001','Licencias de software','LIC_SW'),
('33333333-0004-0002-0000-000000000001','22222222-0004-0000-0000-000000000001','Renta de equipo','RENTA_EQ'),
('33333333-0004-0003-0000-000000000001','22222222-0004-0000-0000-000000000001','Mantenimiento','MANT');
-- Viáticos
INSERT INTO concepts (id, category_id, name, code) VALUES
('33333333-0005-0001-0000-000000000001','22222222-0005-0000-0000-000000000001','Viáticos foráneos','VIAT_FOR'),
('33333333-0005-0002-0000-000000000001','22222222-0005-0000-0000-000000000001','Hospedaje','HOSP');
-- Oficina
INSERT INTO concepts (id, category_id, name, code) VALUES
('33333333-0006-0001-0000-000000000001','22222222-0006-0000-0000-000000000001','Papelería','PAP_OF'),
('33333333-0006-0002-0000-000000000001','22222222-0006-0000-0000-000000000001','Limpieza','LIMP');
-- Tecnología
INSERT INTO concepts (id, category_id, name, code) VALUES
('33333333-0007-0001-0000-000000000001','22222222-0007-0000-0000-000000000001','Equipos de cómputo','COMPUTO'),
('33333333-0007-0002-0000-000000000001','22222222-0007-0000-0000-000000000001','Accesorios tech','ACCES_TECH');
-- Uniformes/EPP
INSERT INTO concepts (id, category_id, name, code) VALUES
('33333333-0008-0001-0000-000000000001','22222222-0008-0000-0000-000000000001','Uniformes','UNIFORME'),
('33333333-0008-0002-0000-000000000001','22222222-0008-0000-0000-000000000001','Equipo de protección (EPP)','EPP_EQ')
ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────
-- PERMISOS DE CONCEPTO POR ROL
-- Operativos: Gasolina, Casetas, Taxi, Comida, Consumibles, Papelería, Uniformes, EPP
-- Encargados/Buyers/Admin: todo
-- ────────────────────────────────────────────
-- Operativo: solo gastos básicos de campo
INSERT INTO concept_permissions (concept_id, role, is_allowed)
SELECT c.id, 'operative', true
FROM concepts c
WHERE c.code IN ('GAS','CASETA','TAXI','BUS','COMIDA','CONSUMIBLE','UNIFORME','EPP_EQ','PAP_OF')
ON CONFLICT DO NOTHING;

-- Validator y Buyer: pueden aprobar/solicitar todo
INSERT INTO concept_permissions (concept_id, role, is_allowed)
SELECT c.id, r.role, true
FROM concepts c
CROSS JOIN (VALUES ('validator'),('buyer'),('administrativo'),('superadmin')) r(role)
ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────
-- TOPES DE GASTO (ejemplos)
-- ────────────────────────────────────────────
INSERT INTO spending_limits (concept_id, role, project_id, max_amount, action_on_exceed)
SELECT '33333333-0001-0001-0000-000000000001', 'operative', NULL, 500.00, 'block'  -- Gasolina: max 500 MXN para operativos
UNION ALL
SELECT '33333333-0005-0001-0000-000000000001', 'operative', NULL, 1000.00, 'escalate' -- Viáticos: max 1000, escalar si excede
ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────
-- EVENTOS DE NOTIFICACIÓN
-- ────────────────────────────────────────────
INSERT INTO notification_events (event_key, description, recipient_roles, is_active) VALUES
('SOLICITUD_CREADA',       'Nueva solicitud registrada',          ARRAY['validator'],                  true),
('SOLICITUD_APROBADA',     'Solicitud aprobada por validador',     ARRAY['operative'],                  true),
('SOLICITUD_RECHAZADA',    'Solicitud rechazada por validador',    ARRAY['operative'],                  true),
('SOLICITUD_ESCALADA',     'Solicitud escalada a validador',       ARRAY['validator','operative'],      true),
('COMPRA_APROBADA',        'Requisición aprobada para compra',     ARRAY['buyer'],                      true),
('REEMBOLSO_APROBADO',     'Reembolso aprobado para pago',         ARRAY['administrativo'],             true),
('RECORDATORIO_VALIDADOR', 'Recordatorio a validador pendiente',   ARRAY['validator'],                  true),
('PAGO_EJECUTADO',         'Pago/compra ejecutada',                ARRAY['operative'],                  true),
('SOLICITUD_CERRADA',      'Solicitud cerrada oficialmente',       ARRAY['operative','administrativo'], true),
('FACTURA_PENDIENTE',      'Recordatorio a proveedor por factura', ARRAY['buyer'],                      true)
ON CONFLICT DO NOTHING;
