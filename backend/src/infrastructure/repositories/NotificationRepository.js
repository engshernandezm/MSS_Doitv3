const pool = require('../database/postgres');

class NotificationRepository {
  async getTemplate(eventKey, channel) {
    const { rows } = await pool.query(
      `SELECT t.* FROM notification_templates t
       JOIN notification_events ne ON (
         ($2='email' AND ne.email_template_id=t.id) OR
         ($2='whatsapp' AND ne.whatsapp_template_id=t.id)
       )
       WHERE ne.event_key=$1 AND ne.is_active=true
       LIMIT 1`,
      [eventKey, channel]
    );
    return rows[0] || null;
  }

  async logNotification({ request_id, user_id, event_key, channel, status, message_preview, error_message }) {
    await pool.query(
      `INSERT INTO notification_log
         (request_id, recipient_id, event_key, channel, status, body_excerpt, error_detail)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [request_id, user_id, event_key, channel, status, message_preview, error_message]
    );
  }

  async scheduleReminder({ request_id, validator_id, reminder_type, scheduled_for }) {
    const typeMap = { RECORDATORIO: 'reminder', ESCALACION: 'escalation', reminder: 'reminder', escalation: 'escalation' };
    const dbType = typeMap[reminder_type] || 'reminder';
    await pool.query(
      `INSERT INTO scheduled_reminders (request_id, recipient_id, type, remind_at)
       VALUES ($1,$2,$3,$4)`,
      [request_id, validator_id, dbType, scheduled_for]
    );
  }

  async getPendingReminders() {
    const { rows } = await pool.query(
      `SELECT sr.*, r.folio, r.amount_mxn, r.type AS request_type,
              u.name AS validator_name, u.email AS validator_email,
              u.phone_whatsapp AS validator_phone, u.notification_channel
       FROM scheduled_reminders sr
       JOIN spending_requests r ON r.id=sr.request_id
       JOIN users u ON u.id=sr.recipient_id
       WHERE sr.sent=false AND sr.remind_at <= NOW()
         AND r.status='EN_REVISION'`
    );
    return rows;
  }

  async markReminderSent(id) {
    await pool.query('UPDATE scheduled_reminders SET sent=true, sent_at=NOW() WHERE id=$1', [id]);
  }

  async getEscalationRule(validatorId) {
    const { rows } = await pool.query(
      'SELECT * FROM escalation_rules WHERE from_validator_id=$1 LIMIT 1', [validatorId]
    );
    return rows[0] || null;
  }

  async addProviderReminder({ request_id, provider_email }) {
    await pool.query(
      `INSERT INTO provider_invoice_reminders (request_id, provider_email)
       VALUES ($1,$2) ON CONFLICT (request_id) DO NOTHING`,
      [request_id, provider_email]
    );
  }

  async getPendingProviderReminders() {
    const { rows } = await pool.query(
      `SELECT pir.*, r.folio, r.amount_mxn, p.name AS project_name
       FROM provider_invoice_reminders pir
       JOIN spending_requests r ON r.id=pir.request_id
       JOIN projects p ON p.id=r.project_id
       WHERE pir.is_active=true AND r.status='COMPRADO_PENDIENTE_FACTURA'
       ORDER BY pir.last_sent_at NULLS FIRST`
    );
    return rows;
  }

  async markProviderReminderSent(id) {
    await pool.query(
      'UPDATE provider_invoice_reminders SET last_sent_at=NOW(), send_count=send_count+1 WHERE id=$1', [id]
    );
  }
}

module.exports = new NotificationRepository();
