const emailSvc = require('../infrastructure/services/EmailService');
const waSvc    = require('../infrastructure/services/WhatsAppService');
const notifRepo = require('../infrastructure/repositories/NotificationRepository');

class NotificationService {
  // Envía notificación según evento y usuario destino
  async notify(eventKey, user, request, extraVars = {}) {
    const channel = user.notification_channel || 'email';
    const channels = channel === 'both' ? ['email', 'whatsapp'] : [channel];

    for (const ch of channels) {
      await this._send(eventKey, ch, user, request, extraVars);
    }
  }

  async _send(eventKey, channel, user, request, extraVars) {
    let status = 'FAILED';
    let preview = '';
    let errorMsg = null;

    try {
      const tpl = await notifRepo.getTemplate(eventKey, channel);
      if (!tpl) {
        console.warn(`[NOTIFY] Sin plantilla: ${eventKey}/${channel}`);
        return;
      }

      const vars = {
        name:           user.name,
        folio:          request?.folio || '',
        amount:         request ? `$${Number(request.amount_mxn || request.amount).toFixed(2)}` : '',
        project:        request?.project_name || '',
        concept:        request?.concept_name || '',
        requester_name: request?.requester_name || user.name,
        reason:         extraVars.reason || '',
        link:           `${process.env.APP_URL || 'http://localhost:5500'}`,
        ...extraVars,
      };

      const body = emailSvc.render(tpl.body, vars);
      preview = body.substring(0, 200);

      if (channel === 'email' && user.email) {
        await emailSvc.send({ to: user.email, subject: tpl.subject || eventKey, html: body, text: body });
        status = 'SENT';
      } else if (channel === 'whatsapp' && user.phone) {
        await waSvc.sendText(user.phone, body);
        status = 'SENT';
      }
    } catch (err) {
      errorMsg = err.message;
      console.error(`[NOTIFY] Error ${eventKey}/${channel}:`, err.message);
    }

    await notifRepo.logNotification({
      request_id:      request?.id || null,
      user_id:         user.id,
      event_key:       eventKey,
      channel,
      status,
      message_preview: preview,
      error_message:   errorMsg,
    });
  }

  async scheduleValidatorReminders(request, validatorId, escalationRule) {
    const now = new Date();

    const reminderHours    = escalationRule?.reminder_hours    || 24;
    const escalationHours  = escalationRule?.escalation_hours  || 48;

    const reminderAt   = new Date(now.getTime() + reminderHours * 3600 * 1000);
    const escalateAt   = new Date(now.getTime() + escalationHours * 3600 * 1000);

    await notifRepo.scheduleReminder({
      request_id:    request.id,
      validator_id:  validatorId,
      reminder_type: 'RECORDATORIO',
      scheduled_for: reminderAt,
    });

    if (escalationRule?.to_validator_id) {
      await notifRepo.scheduleReminder({
        request_id:    request.id,
        validator_id:  escalationRule.to_validator_id,
        reminder_type: 'ESCALACION',
        scheduled_for: escalateAt,
      });
    }
  }
}

module.exports = new NotificationService();
