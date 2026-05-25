const cron      = require('node-cron');
const notifRepo = require('../infrastructure/repositories/NotificationRepository');
const requestRepo = require('../infrastructure/repositories/RequestRepository');
const notifSvc  = require('./NotificationService');
const emailSvc  = require('../infrastructure/services/EmailService');
const userRepo  = require('../infrastructure/repositories/UserRepository');
const pool      = require('../infrastructure/database/postgres');

function start() {
  // Cada 30 minutos: procesar recordatorios y escalaciones programados
  cron.schedule('*/30 * * * *', async () => {
    try {
      const reminders = await notifRepo.getPendingReminders();
      for (const reminder of reminders) {
        const request = await requestRepo.findById(reminder.request_id);
        if (!request) continue;

        const user = {
          id:                   reminder.recipient_id,
          name:                 reminder.validator_name,
          email:                reminder.validator_email,
          phone:                reminder.validator_phone,
          notification_channel: reminder.notification_channel,
        };

        if (reminder.type === 'reminder') {
          await notifSvc.notify('RECORDATORIO_VALIDADOR', user, request);
        } else if (reminder.type === 'escalation') {
          // Reasignar solicitud al validador de escalación
          await requestRepo.updateStatus(request.id, 'EN_REVISION', {
            validator_id: reminder.validator_id,
          });
          await requestRepo.addApprovalHistory(
            request.id, reminder.validator_id, 'ESCALAR_AUTO',
            'Escalado automáticamente por inactividad', 'EN_REVISION', 'EN_REVISION'
          );
          await notifSvc.notify('SOLICITUD_ESCALADA', user, request);
        }

        await notifRepo.markReminderSent(reminder.id);
      }
    } catch (err) {
      console.error('[CRON] Error procesando recordatorios:', err);
    }
  });

  // Cada día a las 8am: recordatorio de factura a proveedores
  cron.schedule('0 8 * * *', async () => {
    try {
      const pending = await notifRepo.getPendingProviderReminders();
      for (const pir of pending) {
        await emailSvc.send({
          to:      pir.provider_email,
          subject: `Factura pendiente — ${pir.project_name} — Folio ${pir.folio}`,
          html:    `<p>Estimado ${pir.provider_name},</p>
                    <p>Le recordamos que tenemos pendiente la factura correspondiente al folio <b>${pir.folio}</b> por un monto de $${pir.amount_mxn} MXN del proyecto ${pir.project_name}.</p>
                    <p>Favor de enviarnos el CFDI a la brevedad.</p>
                    <p>FonzControl</p>`,
          text:    `Recordatorio de factura pendiente - Folio: ${pir.folio}`,
        });
        await notifRepo.markProviderReminderSent(pir.id);
      }

      if (pending.length) console.log(`[CRON] Enviados ${pending.length} recordatorios de factura`);
    } catch (err) {
      console.error('[CRON] Error enviando recordatorios proveedor:', err);
    }
  });

  // Cada día a las 9am: limpiar conversaciones WhatsApp expiradas
  cron.schedule('0 9 * * *', async () => {
    try {
      const { rowCount } = await pool.query(
        `UPDATE whatsapp_conversations SET state='IDLE', context='{}'
         WHERE expires_at < NOW() AND state!='IDLE'`
      );
      if (rowCount) console.log(`[CRON] ${rowCount} conversaciones WhatsApp limpiadas`);
    } catch (err) {
      console.error('[CRON] Error limpiando conversaciones:', err);
    }
  });

  console.log('[CRON] Jobs programados iniciados');
}

module.exports = { start };
