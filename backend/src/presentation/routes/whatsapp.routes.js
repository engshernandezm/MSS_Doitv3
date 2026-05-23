const router = require('express').Router();
const bot    = require('../../application/WhatsAppBot');

// GET /api/whatsapp/webhook — verificación de webhook Meta
router.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WA_VERIFY_TOKEN) {
    console.log('[WA] Webhook verificado');
    return res.status(200).send(challenge);
  }
  res.status(403).send('Forbidden');
});

// POST /api/whatsapp/webhook — mensajes entrantes
router.post('/webhook', async (req, res) => {
  // Responder 200 inmediatamente a Meta (dentro de 20s)
  res.sendStatus(200);

  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue;

        const value    = change.value;
        const messages = value?.messages || [];

        for (const msg of messages) {
          const from = msg.from; // número del remitente
          await bot.handle(from, msg);
        }
      }
    }
  } catch (err) {
    console.error('[WA] Error procesando webhook:', err);
  }
});

module.exports = router;
