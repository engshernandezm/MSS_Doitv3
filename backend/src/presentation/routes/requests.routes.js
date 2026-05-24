const router      = require('express').Router();
const { body, validationResult } = require('express-validator');
const requestRepo = require('../../infrastructure/repositories/RequestRepository');
const notifRepo   = require('../../infrastructure/repositories/NotificationRepository');
const userRepo    = require('../../infrastructure/repositories/UserRepository');
const ocrSvc      = require('../../infrastructure/services/OcrService');
const validEngine = require('../../application/ValidationEngine');
const notifSvc    = require('../../application/NotificationService');
const upload      = require('../middlewares/upload.middleware');
const { authMiddleware, requireRole } = require('../middlewares/auth.middleware');
const pool        = require('../../infrastructure/database/postgres');
const fs          = require('fs');

const validate = (req, res, next) => {
  const e = validationResult(req);
  if (!e.isEmpty()) return res.status(422).json({ errors: e.array() });
  next();
};

router.use(authMiddleware);

// GET /api/requests  — lista según rol
router.get('/', async (req, res) => {
  try {
    const { project_id, status, type, limit = 50, offset = 0 } = req.query;
    const filter = { project_id, status, type, limit: +limit, offset: +offset };

    if (['operative'].includes(req.user.role)) filter.requester_id = req.user.id;
    if (req.user.role === 'validator') filter.validator_id = req.user.id;

    const rows = await requestRepo.findAll(filter);
    res.json({ data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/requests/:id
router.get('/:id', async (req, res) => {
  try {
    const req_ = await requestRepo.findById(req.params.id);
    if (!req_) return res.status(404).json({ error: 'Solicitud no encontrada' });

    // Operativo solo ve sus propias
    if (req.user.role === 'operative' && req_.requester_id !== req.user.id) {
      return res.status(403).json({ error: 'Sin acceso' });
    }

    const validationLog   = await requestRepo.getValidationLog(req.params.id);
    const approvalHistory = await requestRepo.getApprovalHistory(req.params.id);

    res.json({ data: { ...req_, validation_log: validationLog, approval_history: approvalHistory } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno' });
  }
});

const isUuidLike = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

// POST /api/requests — crear solicitud
router.post('/',
  upload.single('comprobante'),
  body('project_id').custom(isUuidLike),
  body('concept_id').custom(isUuidLike),
  body('category_id').custom(isUuidLike),
  body('type').isIn(['REEMBOLSO', 'REQUISICION']),
  body('amount').isFloat({ min: 0.01 }),
  body('currency').optional().isIn(['MXN', 'USD']),
  body('exchange_rate').optional().isFloat({ min: 0.0001 }),
  body('sin_factura').optional().isBoolean(),
  body('observations').optional().isString(),
  validate,
  async (req, res) => {
    try {
      const {
        project_id, concept_id, category_id, type, amount,
        currency = 'MXN', exchange_rate = 1,
        sin_factura = false, observations,
      } = req.body;

      const isSinFactura = sin_factura === true || sin_factura === 'true';

      // Validar observaciones obligatorias para sin_factura
      if (isSinFactura && (!observations || observations.trim().length < 20)) {
        return res.status(422).json({ error: 'Sin factura requiere justificación de al menos 20 caracteres' });
      }

      const now = new Date();
      const newReq = await requestRepo.create({
        requester_id:  req.user.id,
        project_id, concept_id, category_id, type,
        sin_factura:   isSinFactura,
        observations,
        amount: parseFloat(amount),
        currency,
        exchange_rate: parseFloat(exchange_rate),
        comprobante_path: req.file ? req.file.path : null,
        period_year:   now.getFullYear(),
        period_month:  now.getMonth() + 1,
      });

      // OCR si hay archivo y no es sin_factura
      let ocr = null;
      if (req.file && !isSinFactura) {
        const buffer   = fs.readFileSync(req.file.path);
        const mimeType = req.file.mimetype || 'image/jpeg';
        ocr = await ocrSvc.extractFromBuffer(buffer, mimeType);
        await requestRepo.updateOcrData(newReq.id, {
          rfc_emisor: ocr.rfc_emisor,
          uuid_cfdi:  ocr.uuid_cfdi,
          subtotal:   ocr.subtotal,
          iva:        ocr.iva,
          total:      ocr.total,
          fecha_cfdi: ocr.fecha_cfdi,
          confidence: ocr.confidence,
          is_legible: ocr.is_legible,
          raw_text:   ocr.raw_text,
        });
      }

      // Cambiar a PENDIENTE y ejecutar validación
      await requestRepo.updateStatus(newReq.id, 'PENDIENTE');
      const enriched  = { ...newReq, requester_role: req.user.role, amount_mxn: newReq.amount * (newReq.exchange_rate || 1), ...ocr };
      const validation = await validEngine.run(enriched);

      if (!validation.passed) {
        const failDetails = validation.results.filter(r => r.status === 'FAIL').map(r => r.detail).join('; ');
        await requestRepo.updateStatus(newReq.id, 'RECHAZADO', { rejected_reason: failDetails });
        return res.status(200).json({
          data: await requestRepo.findById(newReq.id),
          warning: `Rechazado automáticamente: ${failDetails}`,
        });
      }

      // Asignar validador por routing rules
      const rule = await requestRepo.findRoutingRule({
        project_id, category_id, amount: parseFloat(amount) * parseFloat(exchange_rate),
      });

      const validatorId = rule?.validator_id;
      await requestRepo.updateStatus(newReq.id, 'EN_REVISION', { validator_id: validatorId });

      const fullReq = await requestRepo.findById(newReq.id);

      // Notificar al solicitante
      await notifSvc.notify('SOLICITUD_CREADA', req.user, fullReq);

      // Notificar y programar escalación al validador
      if (validatorId) {
        const validator = await userRepo.findById(validatorId);
        const { rows: [escalRule] } = await pool.query(
          'SELECT * FROM escalation_rules WHERE from_validator_id=$1 LIMIT 1', [validatorId]
        );
        if (validator) {
          await notifSvc.notify('SOLICITUD_CREADA', validator, fullReq);
          await notifSvc.scheduleValidatorReminders(newReq, validatorId, escalRule);
        }
      }

      await requestRepo.addApprovalHistory(newReq.id, req.user.id, 'CREAR', null, null, 'EN_REVISION');

      res.status(201).json({ data: fullReq });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error interno' });
    }
  }
);

// POST /api/requests/:id/resubmit — reenviar corregida tras rechazo
router.post('/:id/resubmit',
  upload.single('comprobante'),
  async (req, res) => {
    try {
      const existing = await requestRepo.findById(req.params.id);
      if (!existing) return res.status(404).json({ error: 'No encontrada' });
      if (existing.requester_id !== req.user.id) return res.status(403).json({ error: 'Sin acceso' });
      if (existing.status !== 'RECHAZADO' || existing.definitive_rejection) {
        return res.status(400).json({ error: 'Solo se puede reenviar si el rechazo no es definitivo' });
      }

      const extra = {};
      if (req.file) extra.comprobante_path = req.file.path;
      if (req.body.observations) extra.observations = req.body.observations;

      await requestRepo.updateStatus(req.params.id, 'PENDIENTE', extra);
      const enriched = { ...existing, ...extra, requester_role: req.user.role };
      const validation = await validEngine.run(enriched);

      if (!validation.passed) {
        const failDetails = validation.results.filter(r => r.status === 'FAIL').map(r => r.detail).join('; ');
        await requestRepo.updateStatus(req.params.id, 'RECHAZADO', { rejected_reason: failDetails });
        return res.json({ data: await requestRepo.findById(req.params.id), warning: failDetails });
      }

      await requestRepo.updateStatus(req.params.id, 'EN_REVISION');
      await requestRepo.addApprovalHistory(req.params.id, req.user.id, 'REENVIAR', null, 'RECHAZADO', 'EN_REVISION');

      res.json({ data: await requestRepo.findById(req.params.id) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error interno' });
    }
  }
);

// GET /api/requests/:id/timeline — historial completo
router.get('/:id/timeline', async (req, res) => {
  try {
    const [valLog, aprLog] = await Promise.all([
      requestRepo.getValidationLog(req.params.id),
      requestRepo.getApprovalHistory(req.params.id),
    ]);
    res.json({ validation_log: valLog, approval_history: aprLog });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
