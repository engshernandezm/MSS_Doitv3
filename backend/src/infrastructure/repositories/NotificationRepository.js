const pool = require('../database/postgres');

class NotificationRepository {
  async getTemplate(eventKey, channel) {
    const { rows } = await pool.query(
      `SELECT * FROM notification_templates
       WHERE event_id=(SELECT id FROM notification_events WHERE event_key=$1)
         AND channel=$2 AND active=true
       LIMIT 1`,
      [eventKey, channel]
    );
    return rows[0] || null;
  }

  async logNotification({ request_id, user_id, event_key, channel, status, message_preview, error_message }) {
    await pool.query(
      `INSERT INTO notification_log
         (request_id, user_id, event_id, channel, status, message_preview, error_message)
       VALUES ($1,$2,(SELECT id FROM notification_events WHERE event_key=$3),$4,$5,$6,$7)`,
      [request_id, user_id, event_key, channel, status, message_preview, error_message]
    );
  }

  async scheduleReminder({ request_id, validator_id, reminder_type, scheduled_for }) {
    await pool.query(
      `INSERT INTO scheduled_reminders (request_id, validator_id, reminder_type, scheduled_for)
       VALUES ($1,$2,$3,$4) ON CONFLICT (request_id, reminder_type) DO NOTHING`,
      [request_id, validator_id, reminder_type, scheduled_for]
    );
  }

  async getPendingReminders() {
    const { rows } = await pool.query(
      `SELECT sr.*, r.folio, r.amount_mxn, r.type,
              u.name AS validator_name, u.email AS validator_email,
              u.phone AS validator_phone, u.notification_channel
       FROM scheduled_reminders sr
       JOIN spending_requests r ON r.id=sr.request_id
       JOIN users u ON u.id=sr.validator_id
       WHERE sr.sent=false AND sr.scheduled_for <= NOW()
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

  async addProviderReminder({ request_id, provider_email, provider_name }) {
    await pool.query(
      `INSERT INTO provider_invoice_reminders (request_id, provider_email, provider_name)
       VALUES ($1,$2,$3) ON CONFLICT (request_id) DO NOTHING`,
      [request_id, provider_email, provider_name]
    );
  }

  async getPendingProviderReminders() {
    const { rows } = await pool.query(
      `SELECT pir.*, r.folio, r.amount_mxn, p.name AS project_name
       FROM provider_invoice_reminders pir
       JOIN spending_requests r ON r.id=pir.request_id
       JOIN projects p ON p.id=r.project_id
       WHERE pir.active=true AND r.status='COMPRADO_PENDIENTE_FACTURA'
       ORDER BY pir.last_sent_at NULLS FIRST`
    );
    return rows;
  }

  async markProviderReminderSent(id) {
    await pool.query(
      'UPDATE provider_invoice_reminders SET last_sent_at=NOW(), times_sent=times_sent+1 WHERE id=$1', [id]
    );
  }
}

module.exports = new NotificationRepository();
