const pool        = require('../infrastructure/database/postgres');
const waSvc       = require('../infrastructure/services/WhatsAppService');
const ocrSvc      = require('../infrastructure/services/OcrService');
const requestRepo = require('../infrastructure/repositories/RequestRepository');
const validEngine = require('./ValidationEngine');
const notifSvc    = require('./NotificationService');
const userRepo    = require('../infrastructure/repositories/UserRepository');

// Máquina de estados del bot de WhatsApp
// Estados: IDLE → WAITING_PROJECT → WAITING_TYPE → WAITING_OBSERVATIONS → WAITING_CONFIRM → DONE

class WhatsAppBot {
  // Punto de entrada — procesa cada mensaje entrante
  async handle(from, message) {
    const user = await this._findUserByPhone(from);
    if (!user) {
      await waSvc.sendText(from, 'Tu número no está registrado en FonzControl. Contacta al administrador.');
      return;
    }

    const conv = await this._getOrCreateConversation(from, user.id);

    // Mensaje de texto
    if (message.type === 'text') {
      await this._handleText(conv, user, message.text?.body || '');
      return;
    }

    // Imagen / PDF — solo se acepta en estado IDLE o WAITING_CONFIRM
    if (message.type === 'image' || message.type === 'document') {
      const mediaId = message.image?.id || message.document?.id;
      const mimeType = message.image?.mime_type || message.document?.mime_type || 'image/jpeg';
      await this._handleMedia(conv, user, mediaId, mimeType);
      return;
    }

    // Respuesta de botones interactivos
    if (message.type === 'interactive') {
      const btnId = message.interactive?.button_reply?.id;
      await this._handleButtonReply(conv, user, btnId);
      return;
    }

    await waSvc.sendText(from, 'Tipo de mensaje no reconocido. Envía una foto del comprobante o escribe un comando.');
  }

  async _handleText(conv, user, text) {
    const txt = text.trim();

    if (/^(hola|inicio|start|ayuda|help)$/i.test(txt)) {
      await this._resetConversation(conv);
      await waSvc.sendText(user.phone,
        `Hola ${user.name} 👋\n` +
        `FonzControl Bot activo.\n\n` +
        `Envía la *foto del comprobante* para crear una solicitud de gasto.\n` +
        `O escribe *SIN FACTURA* para registrar un gasto sin comprobante fiscal.`
      );
      return;
    }

    if (/^sin\s?factura$/i.test(txt) && conv.state === 'IDLE') {
      await this._updateConv(conv.id, { state: 'WAITING_PROJECT', sin_factura: true });
      await this._askProject(user.phone);
      return;
    }

    if (conv.state === 'WAITING_OBSERVATIONS') {
      if (txt.length < 20) {
        await waSvc.sendText(user.phone, 'La justificación debe tener al menos 20 caracteres. Por favor, sé más específico.');
        return;
      }
      await this._updateConv(conv.id, { state: 'WAITING_CONFIRM', observations: txt });
      await this._sendConfirmation(conv, user, txt);
      return;
    }

    await waSvc.sendText(user.phone, 'Envía la foto del comprobante o escribe "HOLA" para comenzar.');
  }

  async _handleMedia(conv, user, mediaId, mimeType) {
    await waSvc.sendText(user.phone, '📷 Procesando comprobante...');

    const buffer = await waSvc.downloadMedia(mediaId);
    const ocr    = buffer
      ? await ocrSvc.extractFromBuffer(buffer, mimeType)
      : ocrSvc._mockExtract();

    // Guardar datos OCR en la conversación
    await this._updateConv(conv.id, {
      state:       'WAITING_PROJECT',
      ocr_data:    JSON.stringify(ocr),
      sin_factura: false,
    });

    const msg = ocr.is_legible
      ? `✅ Comprobante leído (confianza: ${ocr.confidence}%)\n` +
        (ocr.rfc_emisor ? `RFC: ${ocr.rfc_emisor}\n` : '') +
        (ocr.total      ? `Total: $${ocr.total}\n`   : '') +
        `\nAhora selecciona el *proyecto*:`
      : '⚠️ No pude leer bien el comprobante. Continúa con captura manual.\n\nSelecciona el *proyecto*:';

    await waSvc.sendText(user.phone, msg);
    await this._askProject(user.phone);
  }

  async _handleButtonReply(conv, user, btnId) {
    switch (conv.state) {
      case 'WAITING_PROJECT': {
        const { rows: [project] } = await pool.query('SELECT * FROM projects WHERE id=$1', [btnId]);
        if (!project) { await waSvc.sendText(user.phone, 'Proyecto no encontrado.'); return; }
        await this._updateConv(conv.id, { state: 'WAITING_TYPE', project_id: btnId });
        await waSvc.sendButtons(user.phone, `Proyecto: *${project.name}*\n¿Qué tipo de solicitud?`, [
          { id: 'REEMBOLSO',  title: '💵 Reembolso' },
          { id: 'REQUISICION', title: '🛒 Requisición' },
        ]);
        break;
      }

      case 'WAITING_TYPE': {
        if (!['REEMBOLSO', 'REQUISICION'].includes(btnId)) return;
        await this._updateConv(conv.id, { state: 'WAITING_OBSERVATIONS', request_type: btnId });

        if (conv.sin_factura) {
          await waSvc.sendText(user.phone,
            '📝 *Solicitud sin factura*\n' +
            'Escribe la justificación del gasto (mínimo 20 caracteres):'
          );
        } else {
          await waSvc.sendText(user.phone,
            '📝 Agrega observaciones o el concepto del gasto (mínimo 20 caracteres):'
          );
        }
        break;
      }

      case 'WAITING_CONFIRM': {
        if (btnId === 'CONFIRMAR') {
          await this._createRequest(conv, user);
        } else if (btnId === 'CANCELAR') {
          await this._resetConversation(conv);
          await waSvc.sendText(user.phone, '❌ Solicitud cancelada. Envía foto para comenzar de nuevo.');
        }
        break;
      }

      default:
        await waSvc.sendText(user.phone, 'Por favor envía la foto del comprobante para comenzar.');
    }
  }

  async _createRequest(conv, user) {
    try {
      const ocr = conv.ocr_data ? JSON.parse(conv.ocr_data) : null;
      const now  = new Date();

      // Obtener primer concepto del proyecto (simplificado para bot)
      const { rows: concepts } = await pool.query(
        `SELECT c.id FROM concepts c
         JOIN categories cat ON cat.id=c.category_id
         WHERE c.active=true LIMIT 1`
      );
      const conceptId = concepts[0]?.id;

      const { rows: [cat] } = await pool.query(
        `SELECT category_id FROM concepts WHERE id=$1`, [conceptId]
      );

      const req = await requestRepo.create({
        requester_id:  user.id,
        project_id:    conv.project_id,
        concept_id:    conceptId,
        category_id:   cat?.category_id,
        type:          conv.request_type || 'REEMBOLSO',
        sin_factura:   conv.sin_factura || false,
        observations:  conv.observations,
        amount:        ocr?.total || 0,
        currency:      'MXN',
        exchange_rate: 1,
        period_year:   now.getFullYear(),
        period_month:  now.getMonth() + 1,
      });

      // Guardar datos OCR
      if (ocr) {
        await requestRepo.updateOcrData(req.id, {
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

      // Cambiar status a PENDIENTE y ejecutar validación
      const enriched = { ...req, requester_role: user.role };
      await requestRepo.updateStatus(req.id, 'PENDIENTE');
      const validation = await validEngine.run(enriched);

      if (!validation.passed) {
        await requestRepo.updateStatus(req.id, 'RECHAZADO', { rejected_reason: 'Falló validación automática' });
        await waSvc.sendText(user.phone,
          `❌ Solicitud *${req.folio}* rechazada automáticamente.\n` +
          validation.results.filter(r => r.status === 'FAIL').map(r => `• ${r.detail}`).join('\n')
        );
      } else {
        // Asignar validador
        const rule = await requestRepo.findRoutingRule({
          project_id:  conv.project_id,
          category_id: cat?.category_id,
          amount:      ocr?.total || 0,
        });

        const validatorId = rule?.validator_id;
        await requestRepo.updateStatus(req.id, 'EN_REVISION', { validator_id: validatorId });

        await waSvc.sendText(user.phone,
          `✅ Solicitud *${req.folio}* enviada a revisión.\n` +
          `Monto: $${(ocr?.total || 0).toFixed(2)} MXN\n` +
          `Recibirás notificación cuando sea aprobada.`
        );

        // Notificar al validador
        if (validatorId) {
          const validator = await userRepo.findById(validatorId);
          const escalRule = await pool.query(
            'SELECT * FROM escalation_rules WHERE from_validator_id=$1 LIMIT 1', [validatorId]
          ).then(r => r.rows[0]);

          if (validator) {
            const fullReq = await requestRepo.findById(req.id);
            await notifSvc.notify('SOLICITUD_CREADA', validator, fullReq);
            await notifSvc.scheduleValidatorReminders(req, validatorId, escalRule);
          }
        }
      }

      await this._updateConv(conv.id, { state: 'DONE' });

    } catch (err) {
      console.error('[BOT] Error creando solicitud:', err);
      await waSvc.sendText(user.phone, 'Error al crear la solicitud. Por favor intenta desde la web.');
    }
  }

  async _askProject(phone) {
    const { rows: projects } = await pool.query(
      'SELECT id, name FROM projects WHERE active=true ORDER BY name LIMIT 3'
    );
    if (!projects.length) {
      await waSvc.sendText(phone, 'No hay proyectos activos configurados. Contacta al administrador.');
      return;
    }
    await waSvc.sendButtons(phone, 'Selecciona el proyecto:', projects.map(p => ({
      id: p.id, title: p.code || p.name.substring(0, 20),
    })));
  }

  async _sendConfirmation(conv, user, observations) {
    const ocr = conv.ocr_data ? JSON.parse(conv.ocr_data) : null;
    const { rows: [project] } = await pool.query('SELECT name FROM projects WHERE id=$1', [conv.project_id]);

    const summary =
      `📋 *Resumen de solicitud*\n` +
      `Proyecto: ${project?.name || '—'}\n` +
      `Tipo: ${conv.request_type || '—'}\n` +
      (conv.sin_factura ? `Sin factura ⚠️\n` : '') +
      (ocr?.total ? `Monto: $${ocr.total} MXN\n` : '') +
      `Observaciones: ${observations}\n\n` +
      `¿Confirmas el envío?`;

    await waSvc.sendButtons(user.phone, summary, [
      { id: 'CONFIRMAR', title: '✅ Confirmar' },
      { id: 'CANCELAR',  title: '❌ Cancelar' },
    ]);
  }

  async _findUserByPhone(phone) {
    const digits = phone.replace(/\D/g, '');
    const { rows } = await pool.query(
      `SELECT * FROM users WHERE REGEXP_REPLACE(phone,'\\D','','g')=$1 AND active=true LIMIT 1`,
      [digits]
    );
    return rows[0] || null;
  }

  async _getOrCreateConversation(phone, userId) {
    const { rows } = await pool.query(
      `SELECT * FROM whatsapp_conversations WHERE phone=$1`, [phone]
    );

    const expired = rows[0] && new Date(rows[0].expires_at) < new Date();
    if (!rows[0] || expired) {
      const { rows: [conv] } = await pool.query(
        `INSERT INTO whatsapp_conversations (phone, user_id, state, expires_at)
         VALUES ($1,$2,'IDLE', NOW() + INTERVAL '30 minutes')
         ON CONFLICT (phone)
         DO UPDATE SET state='IDLE', user_id=$2,
           project_id=NULL, request_type=NULL, sin_factura=false,
           ocr_data=NULL, observations=NULL,
           expires_at=NOW() + INTERVAL '30 minutes'
         RETURNING *`,
        [phone, userId]
      );
      return conv;
    }
    return rows[0];
  }

  async _updateConv(id, fields) {
    const allowed = ['state','project_id','request_type','sin_factura','ocr_data','observations'];
    const sets = [`expires_at = NOW() + INTERVAL '30 minutes'`];
    const vals = [];
    for (const [k, v] of Object.entries(fields)) {
      if (allowed.includes(k)) { vals.push(v); sets.push(`${k}=$${vals.length}`); }
    }
    vals.push(id);
    await pool.query(
      `UPDATE whatsapp_conversations SET ${sets.join(',')} WHERE id=$${vals.length}`, vals
    );
  }

  async _resetConversation(conv) {
    await pool.query(
      `UPDATE whatsapp_conversations
       SET state='IDLE', project_id=NULL, request_type=NULL,
           sin_factura=false, ocr_data=NULL, observations=NULL,
           expires_at=NOW() + INTERVAL '30 minutes'
       WHERE id=$1`,
      [conv.id]
    );
  }
}

module.exports = new WhatsAppBot();
