const router      = require('express').Router();
const { body, validationResult } = require('express-validator');
const requestRepo = require('../../infrastructure/repositories/RequestRepository');
const notifRepo   = require('../../infrastructure/repositories/NotificationRepository');
const notifSvc    = require('../../application/NotificationService');
const userRepo    = require('../../infrastructure/repositories/UserRepository');
const upload      = require('../middlewares/upload.middleware');
const { authMiddleware, requireRole } = require('../middlewares/auth.middleware');

const validate = (req, res, next) => {
  const e = validationResult(req);
  if (!e.isEmpty()) return res.status(422).json({ errors: e.array() });
  next();
};

router.use(authMiddleware);

// GET /api/payments/pending — solicitudes aprobadas pendientes de pago
router.get('/pending', requireRole('buyer','administrativo','superadmin'), async (req, res) => {
  try {
    const rows = await requestRepo.findAll({ status: 'APROBADO' });
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/payments/pending-factura — compradas pendientes de factura
router.get('/pending-factura', requireRole('buyer','administrativo','superadmin'), async (req, res) => {
  try {
    const rows = await requestRepo.getPendingFactura();
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/payments/:id/execute — ejecutar pago
router.post('/:id/execute',
  requireRole('buyer','administrativo','superadmin'),
  body('payment_method').isIn(['transferencia','efectivo','tarjeta','cheque']),
  body('payment_reference').optional().isString(),
  body('payment_notes').optional().isString(),
  validate,
  async (req, res) => {
    try {
      const request = await requestRepo.findById(req.params.id);
      if (!request) return res.status(404).json({ error: 'No encontrada' });
      if (request.status !== 'APROBADO') {
        return res.status(400).json({ error: `No se puede pagar en estado ${request.status}` });
      }

      // buyer ejecuta REQUISICIONES, administrativo ejecuta REEMBOLSOS
      if (req.user.role === 'buyer' && request.type !== 'REQUISICION') {
        return res.status(403).json({ error: 'Solo puedes ejecutar requisiciones' });
      }
      if (req.user.role === 'administrativo' && request.type !== 'REEMBOLSO') {
        return res.status(403).json({ error: 'Solo puedes ejecutar reembolsos' });
      }

      // Requisición → COMPRADO_PENDIENTE_FACTURA, Reembolso → PAGADO
      const nextStatus = request.type === 'REQUISICION' ? 'COMPRADO_PENDIENTE_FACTURA' : 'PAGADO';

      await requestRepo.markPaymentExecuted(req.params.id, {
        payment_method:    req.body.payment_method,
        payment_reference: req.body.payment_reference,
        payment_notes:     req.body.payment_notes,
        executed_by:       req.user.id,
        next_status:       nextStatus,
      });

      await requestRepo.addApprovalHistory(
        req.params.id, req.user.id, 'PAGAR',
        req.body.payment_notes, 'APROBADO', nextStatus
      );

      const fullReq  = await requestRepo.findById(req.params.id);
      const requester = await userRepo.findById(request.requester_id);
      if (requester) await notifSvc.notify('PAGO_EJECUTADO', requester, fullReq);

      res.json({ data: fullReq });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error interno' });
    }
  }
);

// POST /api/payments/:id/attach-factura — subir factura al comprobante pendiente
router.post('/:id/attach-factura',
  requireRole('buyer','administrativo','superadmin'),
  upload.single('factura'),
  async (req, res) => {
    try {
      const request = await requestRepo.findById(req.params.id);
      if (!request) return res.status(404).json({ error: 'No encontrada' });
      if (request.status !== 'COMPRADO_PENDIENTE_FACTURA') {
        return res.status(400).json({ error: 'Solo aplica para solicitudes con factura pendiente' });
      }

      if (!req.file) return res.status(422).json({ error: 'Archivo de factura requerido' });

      await requestRepo.updateStatus(req.params.id, 'PAGADO', { factura_path: req.file.path });
      await requestRepo.addApprovalHistory(
        req.params.id, req.user.id, 'FACTURA_RECIBIDA',
        null, 'COMPRADO_PENDIENTE_FACTURA', 'PAGADO'
      );

      const fullReq = await requestRepo.findById(req.params.id);
      res.json({ data: fullReq });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error interno' });
    }
  }
);

// POST /api/payments/:id/warehouse-receipt — registrar recepción en almacén
router.post('/:id/warehouse-receipt',
  requireRole('buyer','operative','superadmin'),
  body('status').isIn(['CONFORME','NO_CONFORME','CON_OBSERVACIONES']),
  body('observations').optional().isString(),
  validate,
  async (req, res) => {
    try {
      const request = await requestRepo.findById(req.params.id);
      if (!request) return res.status(404).json({ error: 'No encontrada' });

      const receipt = await requestRepo.addWarehouseReceipt({
        request_id:   req.params.id,
        received_by:  req.user.id,
        status:       req.body.status,
        observations: req.body.observations,
        signature_path: null,
      });

      if (req.body.status === 'CONFORME') {
        await requestRepo.markClosed(req.params.id);
        const fullReq  = await requestRepo.findById(req.params.id);
        const requester = await userRepo.findById(request.requester_id);
        if (requester) await notifSvc.notify('SOLICITUD_CERRADA', requester, fullReq);
      }

      res.json({ data: receipt });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error interno' });
    }
  }
);

// POST /api/payments/provider-reminder  — programar recordatorio proveedor
router.post('/provider-reminder',
  requireRole('buyer','administrativo','superadmin'),
  body('request_id').isUUID(),
  body('provider_email').isEmail(),
  validate,
  async (req, res) => {
    try {
      await notifRepo.addProviderReminder({
        request_id:     req.body.request_id,
        provider_email: req.body.provider_email,
      });
      res.json({ message: 'Recordatorio programado' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error interno' });
    }
  }
);

module.exports = router;
