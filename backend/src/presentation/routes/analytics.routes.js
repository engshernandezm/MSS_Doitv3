const router      = require('express').Router();
const { body, validationResult } = require('express-validator');
const analyticsRepo = require('../../infrastructure/repositories/AnalyticsRepository');
const { authMiddleware, requireRole } = require('../middlewares/auth.middleware');
const xlsx = require('xlsx');

const validate = (req, res, next) => {
  const e = validationResult(req);
  if (!e.isEmpty()) return res.status(422).json({ errors: e.array() });
  next();
};

router.use(authMiddleware);

// GET /api/analytics/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const projectId = req.query.project_id || null;
    const stats     = await analyticsRepo.getDashboardStats(projectId);
    res.json({ data: stats });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/analytics/budgets — semáforo de presupuesto
router.get('/budgets', async (req, res) => {
  try {
    const { project_id, year, month } = req.query;
    const data = await analyticsRepo.getBudgetConsumption(project_id, year, month);
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/analytics/budgets — crear/actualizar presupuesto
router.post('/budgets',
  requireRole('superadmin','administrativo'),
  body('project_id').isUUID(),
  body('category_id').isUUID(),
  body('year').isInt({ min: 2020, max: 2099 }),
  body('month').isInt({ min: 1, max: 12 }),
  body('amount').isFloat({ min: 0 }),
  body('threshold_yellow').optional().isFloat({ min: 0, max: 100 }),
  body('threshold_red').optional().isFloat({ min: 0, max: 100 }),
  validate,
  async (req, res) => {
    try {
      const result = await analyticsRepo.upsertBudget(req.body);
      res.json({ data: result });
    } catch (err) {
      res.status(500).json({ error: 'Error interno' });
    }
  }
);

// GET /api/analytics/utility — utilidad por proyecto
router.get('/utility', requireRole('superadmin','administrativo','validator'), async (req, res) => {
  try {
    const { project_id, year } = req.query;
    const data = await analyticsRepo.getProjectUtility(project_id, year);
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/analytics/income — registrar ingreso mensual
router.post('/income',
  requireRole('superadmin','administrativo'),
  body('project_id').isUUID(),
  body('year').isInt({ min: 2020 }),
  body('month').isInt({ min: 1, max: 12 }),
  body('amount').isFloat({ min: 0 }),
  body('notes').optional().isString(),
  validate,
  async (req, res) => {
    try {
      const result = await analyticsRepo.upsertMonthlyIncome({
        ...req.body,
        created_by: req.user.id,
      });
      res.json({ data: result });
    } catch (err) {
      res.status(500).json({ error: 'Error interno' });
    }
  }
);

// GET /api/analytics/report — reporte general (JSON)
router.get('/report', requireRole('superadmin','administrativo','validator'), async (req, res) => {
  try {
    const { project_id, status, type, date_from, date_to, limit = 500 } = req.query;
    const data = await analyticsRepo.getRequestsReport({ project_id, status, type, date_from, date_to, limit: +limit });
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/analytics/report/excel — exportar a Excel (Compac)
router.get('/report/excel', requireRole('superadmin','administrativo'), async (req, res) => {
  try {
    const { project_id, status, type, date_from, date_to } = req.query;
    const data = await analyticsRepo.getRequestsReport({ project_id, status, type, date_from, date_to, limit: 5000 });

    // Mapear columnas compatibles Compac
    const rows = data.map(r => ({
      'Folio':          r.folio,
      'Tipo':           r.type,
      'Sin Factura':    r.sin_factura ? 'SÍ' : 'NO',
      'Estatus':        r.status,
      'Proyecto':       r.project_name,
      'Categoría':      r.category_name,
      'Concepto':       r.concept_name,
      'Solicitante':    r.requester_name,
      'Monto':          r.amount,
      'Moneda':         r.currency,
      'T.Cambio':       r.exchange_rate,
      'Monto MXN':      r.amount_mxn,
      'RFC Emisor':     r.ocr_rfc_emisor,
      'UUID CFDI':      r.ocr_uuid_cfdi,
      'IVA':            r.ocr_iva,
      'Subtotal':       r.ocr_subtotal,
      'Fecha CFDI':     r.ocr_fecha_cfdi,
      'Período':        `${r.period_year}-${String(r.period_month).padStart(2,'0')}`,
      'Validador':      r.validator_name,
      'Fecha Creación': r.created_at,
      'Método Pago':    r.payment_method,
      'Ref. Pago':      r.payment_reference,
    }));

    const wb  = xlsx.utils.book_new();
    const ws  = xlsx.utils.json_to_sheet(rows);
    xlsx.utils.book_append_sheet(wb, ws, 'Gastos');

    const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', `attachment; filename="gastos_${Date.now()}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
