const router      = require('express').Router();
const { body, validationResult } = require('express-validator');
const requestRepo = require('../../infrastructure/repositories/RequestRepository');
const userRepo    = require('../../infrastructure/repositories/UserRepository');
const notifSvc    = require('../../application/NotificationService');
const { authMiddleware, requireRole } = require('../middlewares/auth.middleware');
const pool        = require('../../infrastructure/database/postgres');

const validate = (req, res, next) => {
  const e = validationResult(req);
  if (!e.isEmpty()) return res.status(422).json({ errors: e.array() });
  next();
};

router.use(authMiddleware);

// GET /api/approval/pending — solicitudes pendientes del validador
router.get('/pending', requireRole('validator','superadmin'), async (req, res) => {
  try {
    const rows = req.user.role === 'superadmin'
      ? await requestRepo.findAll({ status: 'EN_REVISION' })
      : await requestRepo.findPendingByValidator(req.user.id);
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/approval/:id/approve
router.post('/:id/approve',
  requireRole('validator', 'superadmin'),
  body('comment').optional().isString(),
  validate,
  async (req, res) => {
    try {
      const request = await requestRepo.findById(req.params.id);
      if (!request) return res.status(404).json({ error: 'No encontrada' });
      if (request.status !== 'EN_REVISION') {
        return res.status(400).json({ error: `No se puede aprobar en estado ${request.status}` });
      }

      // Validador solo aprueba sus asignadas (superadmin puede aprobar cualquier)
      if (req.user.role === 'validator' && request.validator_id !== req.user.id) {
        return res.status(403).json({ error: 'Esta solicitud no está asignada a ti' });
      }

      const newStatus = request.type === 'REEMBOLSO' ? 'APROBADO' : 'APROBADO';
      await requestRepo.updateStatus(req.params.id, newStatus);
      await requestRepo.addApprovalHistory(
        req.params.id, req.user.id, 'APROBAR',
        req.body.comment, 'EN_REVISION', newStatus
      );

      const fullReq  = await requestRepo.findById(req.params.id);
      const requester = await userRepo.findById(request.requester_id);

      // Notificar al solicitante
      const eventKey = request.type === 'REEMBOLSO' ? 'REEMBOLSO_APROBADO' : 'COMPRA_APROBADA';
      if (requester) await notifSvc.notify(eventKey, requester, fullReq);

      // Para reembolsos: notificar a Anna (administrativo)
      if (request.type === 'REEMBOLSO') {
        const { rows: admins } = await pool.query(
          `SELECT * FROM users WHERE role='administrativo' AND active=true`
        );
        for (const admin of admins) {
          await notifSvc.notify('REEMBOLSO_APROBADO', admin, fullReq);
        }
      }

      // Para requisiciones: notificar a Irving (buyer)
      if (request.type === 'REQUISICION') {
        const { rows: buyers } = await pool.query(
          `SELECT * FROM users WHERE role='buyer' AND active=true`
        );
        for (const buyer of buyers) {
          await notifSvc.notify('COMPRA_APROBADA', buyer, fullReq);
        }
      }

      res.json({ data: fullReq });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error interno' });
    }
  }
);

// POST /api/approval/:id/reject
router.post('/:id/reject',
  requireRole('validator', 'superadmin'),
  body('reason').isString().isLength({ min: 10 }),
  body('definitive').optional().isBoolean(),
  validate,
  async (req, res) => {
    try {
      const request = await requestRepo.findById(req.params.id);
      if (!request) return res.status(404).json({ error: 'No encontrada' });
      if (request.status !== 'EN_REVISION') {
        return res.status(400).json({ error: `No se puede rechazar en estado ${request.status}` });
      }
      if (req.user.role === 'validator' && request.validator_id !== req.user.id) {
        return res.status(403).json({ error: 'Sin acceso' });
      }

      const definitive = req.body.definitive === true || req.body.definitive === 'true';
      await requestRepo.updateStatus(req.params.id, 'RECHAZADO', {
        rejected_reason:      req.body.reason,
        definitive_rejection: definitive,
      });
      await requestRepo.addApprovalHistory(
        req.params.id, req.user.id, definitive ? 'RECHAZAR_DEFINITIVO' : 'RECHAZAR',
        req.body.reason, 'EN_REVISION', 'RECHAZADO'
      );

      const fullReq   = await requestRepo.findById(req.params.id);
      const requester  = await userRepo.findById(request.requester_id);
      if (requester) await notifSvc.notify('SOLICITUD_RECHAZADA', requester, fullReq, { reason: req.body.reason });

      res.json({ data: fullReq });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error interno' });
    }
  }
);

// POST /api/approval/:id/escalate  — escalar manualmente
router.post('/:id/escalate',
  requireRole('validator', 'superadmin'),
  body('to_validator_id').isUUID(),
  body('comment').optional().isString(),
  validate,
  async (req, res) => {
    try {
      const request = await requestRepo.findById(req.params.id);
      if (!request) return res.status(404).json({ error: 'No encontrada' });

      const newValidator = await userRepo.findById(req.body.to_validator_id);
      if (!newValidator) return res.status(404).json({ error: 'Validador no encontrado' });

      await requestRepo.updateStatus(req.params.id, 'EN_REVISION', { validator_id: req.body.to_validator_id });
      await requestRepo.addApprovalHistory(
        req.params.id, req.user.id, 'ESCALAR',
        req.body.comment, 'EN_REVISION', 'EN_REVISION'
      );

      const fullReq = await requestRepo.findById(req.params.id);
      await notifSvc.notify('SOLICITUD_ESCALADA', newValidator, fullReq);

      res.json({ data: fullReq });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error interno' });
    }
  }
);

module.exports = router;
