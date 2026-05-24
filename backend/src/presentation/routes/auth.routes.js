const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const { body, validationResult } = require('express-validator');
const userRepo = require('../../infrastructure/repositories/UserRepository');
const emailSvc = require('../../infrastructure/services/EmailService');
const { authMiddleware } = require('../middlewares/auth.middleware');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  next();
};

// POST /api/auth/login
router.post('/login',
  body('email').isEmail(),
  body('password').notEmpty(),
  validate,
  async (req, res) => {
    try {
      const user = await userRepo.findByEmail(req.body.email);
      if (!user || !user.is_active) return res.status(401).json({ error: 'Credenciales inválidas' });

      const ok = await bcrypt.compare(req.body.password, user.password_hash);
      if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });

      const token = jwt.sign(
        { sub: user.id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
      );

      res.json({
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role,
                phone: user.phone, notification_channel: user.notification_channel },
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error interno' });
    }
  }
);

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// POST /api/auth/forgot-password
router.post('/forgot-password',
  body('email').isEmail(),
  validate,
  async (req, res) => {
    try {
      const user = await userRepo.findByEmail(req.body.email);
      // Siempre respondemos 200 para no revelar si el email existe
      if (!user) return res.json({ message: 'Si el correo existe, recibirás un enlace.' });

      const token     = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 3600 * 1000); // 1h
      await userRepo.saveResetToken(user.id, token, expiresAt);

      const link = `${process.env.APP_URL}/reset-password.html?token=${token}`;
      await emailSvc.send({
        to:      user.email,
        subject: 'Restablecer contraseña — FonzControl',
        html:    `<p>Hola ${user.name},</p><p><a href="${link}">Restablecer contraseña</a></p><p>Expira en 1 hora.</p>`,
        text:    `Restablecer contraseña: ${link}`,
      });

      res.json({ message: 'Si el correo existe, recibirás un enlace.' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error interno' });
    }
  }
);

// POST /api/auth/reset-password
router.post('/reset-password',
  body('token').notEmpty(),
  body('password').isLength({ min: 8 }),
  validate,
  async (req, res) => {
    try {
      const record = await userRepo.findResetToken(req.body.token);
      if (!record) return res.status(400).json({ error: 'Token inválido o expirado' });

      const hash = await bcrypt.hash(req.body.password, 10);
      await userRepo.setPasswordHash(record.user_id, hash);
      await userRepo.markTokenUsed(req.body.token);

      res.json({ message: 'Contraseña actualizada correctamente' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error interno' });
    }
  }
);

// POST /api/auth/change-password  (autenticado)
router.post('/change-password',
  authMiddleware,
  body('current_password').notEmpty(),
  body('new_password').isLength({ min: 8 }),
  validate,
  async (req, res) => {
    try {
      const user = await userRepo.findByEmail(req.user.email);
      const ok   = await bcrypt.compare(req.body.current_password, user.password_hash);
      if (!ok) return res.status(400).json({ error: 'Contraseña actual incorrecta' });

      const hash = await bcrypt.hash(req.body.new_password, 10);
      await userRepo.setPasswordHash(req.user.id, hash);
      res.json({ message: 'Contraseña actualizada' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error interno' });
    }
  }
);

module.exports = router;
