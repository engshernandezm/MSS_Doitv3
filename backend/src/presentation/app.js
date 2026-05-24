require('dotenv').config();
const express      = require('express');
const cors         = require('cors');
const path         = require('path');
const rateLimit    = require('express-rate-limit');

const authRoutes      = require('./routes/auth.routes');
const requestRoutes   = require('./routes/requests.routes');
const approvalRoutes  = require('./routes/approval.routes');
const paymentRoutes   = require('./routes/payments.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const adminRoutes     = require('./routes/admin.routes');
const catalogRoutes   = require('./routes/catalog.routes');
const whatsappRoutes  = require('./routes/whatsapp.routes');
const cronJobs        = require('../application/CronJobs');

const app = express();

// ─── CORS ────────────────────────────────────────────────────────────────────
app.use(cors({
  origin:      process.env.CORS_ORIGIN || '*',
  credentials: true,
}));

// ─── RATE LIMITING ───────────────────────────────────────────────────────────
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: 'Demasiados intentos' }));
app.use('/api/',     rateLimit({ windowMs: 60 * 1000, max: 120 }));

// ─── BODY PARSING ────────────────────────────────────────────────────────────
// WhatsApp webhook necesita el body crudo — ponerlo antes del json global
app.use('/api/whatsapp/webhook', express.raw({ type: 'application/json' }), (req, res, next) => {
  if (Buffer.isBuffer(req.body)) req.body = JSON.parse(req.body.toString());
  next();
});
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── ARCHIVOS ESTÁTICOS ──────────────────────────────────────────────────────
const uploadsDir = path.resolve(process.env.UPLOADS_DIR || './uploads');
app.use('/uploads', express.static(uploadsDir));

// ─── HEALTH CHECK ────────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok', ts: new Date() }));

// ─── RUTAS API ───────────────────────────────────────────────────────────────
app.use('/api/auth',      authRoutes);
app.use('/api/requests',  requestRoutes);
app.use('/api/approval',  approvalRoutes);
app.use('/api/payments',  paymentRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/admin',     adminRoutes);
app.use('/api/catalog',   catalogRoutes);
app.use('/api/whatsapp',  whatsappRoutes);

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// ─── ERROR HANDLER ───────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[APP ERROR]', err);
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Archivo demasiado grande' });
  res.status(500).json({ error: 'Error interno del servidor' });
});

// ─── START ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[APP] FonzControl doitv3 corriendo en puerto ${PORT}`);
  cronJobs.start();
});

module.exports = app;
