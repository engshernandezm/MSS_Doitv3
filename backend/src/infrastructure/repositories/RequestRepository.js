const pool = require('../database/postgres');

class RequestRepository {
  async create(data) {
    const {
      requester_id, project_id, concept_id, category_id,
      type, sin_factura = false, observations = null,
      amount, currency = 'MXN', exchange_rate = 1,
      comprobante_path = null, period_year, period_month,
    } = data;

    const { rows } = await pool.query(
      `INSERT INTO spending_requests
         (requester_id, project_id, concept_id, category_id,
          type, sin_factura, observations,
          amount, currency, exchange_rate,
          comprobante_path, period_year, period_month, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'BORRADOR')
       RETURNING *`,
      [requester_id, project_id, concept_id, category_id,
       type, sin_factura, observations,
       amount, currency, exchange_rate,
       comprobante_path, period_year, period_month]
    );
    return rows[0];
  }

  async findById(id) {
    const { rows } = await pool.query(
      `SELECT r.*,
         u.name  AS requester_name, u.email AS requester_email, u.phone AS requester_phone,
         p.name  AS project_name,   p.code  AS project_code,
         c.name  AS concept_name,
         cat.name AS category_name,
         v.name  AS validator_name, v.email AS validator_email
       FROM spending_requests r
       JOIN users u    ON u.id   = r.requester_id
       JOIN projects p ON p.id   = r.project_id
       JOIN concepts c ON c.id   = r.concept_id
       JOIN categories cat ON cat.id = r.category_id
       LEFT JOIN users v ON v.id = r.validator_id
       WHERE r.id=$1`,
      [id]
    );
    return rows[0] || null;
  }

  async findByFolio(folio) {
    const { rows } = await pool.query(
      'SELECT * FROM spending_requests WHERE folio=$1', [folio]
    );
    return rows[0] || null;
  }

  async findAll({ requester_id, project_id, status, type, sin_factura, validator_id, limit = 50, offset = 0 } = {}) {
    let q = `SELECT r.id, r.folio, r.type, r.sin_factura, r.status,
               r.amount, r.amount_mxn, r.currency, r.created_at,
               u.name AS requester_name, p.name AS project_name, p.code AS project_code,
               c.name AS concept_name, cat.name AS category_name,
               r.possible_duplicate, r.anomaly_ml, r.exceeds_limit
             FROM spending_requests r
             JOIN users u    ON u.id  = r.requester_id
             JOIN projects p ON p.id  = r.project_id
             JOIN concepts c ON c.id  = r.concept_id
             JOIN categories cat ON cat.id = r.category_id
             WHERE 1=1`;
    const params = [];

    if (requester_id)  { params.push(requester_id);  q += ` AND r.requester_id=$${params.length}`; }
    if (project_id)    { params.push(project_id);    q += ` AND r.project_id=$${params.length}`; }
    if (validator_id)  { params.push(validator_id);  q += ` AND r.validator_id=$${params.length}`; }
    if (status)        { params.push(status);        q += ` AND r.status=$${params.length}`; }
    if (type)          { params.push(type);          q += ` AND r.type=$${params.length}`; }
    if (sin_factura !== undefined) { params.push(sin_factura); q += ` AND r.sin_factura=$${params.length}`; }

    params.push(limit);  q += ` ORDER BY r.created_at DESC LIMIT $${params.length}`;
    params.push(offset); q += ` OFFSET $${params.length}`;

    const { rows } = await pool.query(q, params);
    return rows;
  }

  async updateStatus(id, status, extra = {}) {
    const allowed = ['validator_id','rejected_reason','definitive_rejection','comprobante_path',
                     'factura_path','ocr_rfc_emisor','ocr_uuid_cfdi','ocr_subtotal','ocr_iva',
                     'ocr_total','ocr_fecha_cfdi','ocr_confidence','ocr_is_legible','ocr_raw_text',
                     'possible_duplicate','anomaly_ml','exceeds_limit'];
    const sets = [`status=$1`];
    const vals = [status];

    for (const [k, v] of Object.entries(extra)) {
      if (allowed.includes(k)) { vals.push(v); sets.push(`${k}=$${vals.length}`); }
    }
    vals.push(id);
    const { rows } = await pool.query(
      `UPDATE spending_requests SET ${sets.join(',')} WHERE id=$${vals.length} RETURNING *`, vals
    );
    return rows[0];
  }

  async logValidationStep(requestId, step, status, detail = null, value = null) {
    await pool.query(
      `INSERT INTO validation_log (request_id, step, status, detail, value)
       VALUES ($1,$2,$3,$4,$5)`,
      [requestId, step, status, detail, value]
    );
  }

  async getValidationLog(requestId) {
    const { rows } = await pool.query(
      'SELECT * FROM validation_log WHERE request_id=$1 ORDER BY created_at', [requestId]
    );
    return rows;
  }

  async addApprovalHistory(requestId, userId, action, comment = null, fromStatus = null, toStatus = null) {
    await pool.query(
      `INSERT INTO approval_history (request_id, user_id, action, comment, from_status, to_status)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [requestId, userId, action, comment, fromStatus, toStatus]
    );
  }

  async getApprovalHistory(requestId) {
    const { rows } = await pool.query(
      `SELECT ah.*, u.name AS user_name, u.role AS user_role
       FROM approval_history ah JOIN users u ON u.id=ah.user_id
       WHERE ah.request_id=$1 ORDER BY ah.created_at`,
      [requestId]
    );
    return rows;
  }

  async findRoutingRule({ project_id, category_id, amount }) {
    const { rows } = await pool.query(
      `SELECT * FROM routing_rules
       WHERE (project_id IS NULL OR project_id=$1)
         AND (category_id IS NULL OR category_id=$2)
         AND (amount_min IS NULL OR $3 >= amount_min)
         AND (amount_max IS NULL OR $3 <= amount_max)
         AND active=true
       ORDER BY priority ASC LIMIT 1`,
      [project_id, category_id, amount]
    );
    return rows[0] || null;
  }

  async findSpendingLimit({ concept_id, role, project_id }) {
    const { rows } = await pool.query(
      `SELECT * FROM spending_limits
       WHERE concept_id=$1
         AND (role=$2 OR role IS NULL)
         AND (project_id=$3 OR project_id IS NULL)
       ORDER BY (role IS NOT NULL) DESC, (project_id IS NOT NULL) DESC
       LIMIT 1`,
      [concept_id, role, project_id]
    );
    return rows[0] || null;
  }

  async findConceptPermission(concept_id, role) {
    const { rows } = await pool.query(
      'SELECT * FROM concept_permissions WHERE concept_id=$1 AND role=$2',
      [concept_id, role]
    );
    return rows[0] || null;
  }

  async checkDuplicate(data) {
    const { sin_factura, rfc_emisor, uuid_cfdi, amount, requester_id, project_id, concept_id } = data;
    if (sin_factura) {
      const { rows } = await pool.query(
        `SELECT id FROM spending_requests
         WHERE sin_factura=true AND requester_id=$1 AND project_id=$2
           AND concept_id=$3 AND amount=$4
           AND created_at > NOW() - INTERVAL '7 days'
           AND status NOT IN ('RECHAZADO','CANCELADO')
         LIMIT 1`,
        [requester_id, project_id, concept_id, amount]
      );
      return rows[0] || null;
    } else {
      if (!rfc_emisor && !uuid_cfdi) return null;
      let q = `SELECT id FROM spending_requests WHERE sin_factura=false AND status NOT IN ('RECHAZADO','CANCELADO')`;
      const params = [];
      if (uuid_cfdi) { params.push(uuid_cfdi); q += ` AND ocr_uuid_cfdi=$${params.length}`; }
      else if (rfc_emisor) { params.push(rfc_emisor); params.push(amount); q += ` AND ocr_rfc_emisor=$${params.length-1} AND amount=$${params.length}`; }
      q += ' LIMIT 1';
      const { rows } = await pool.query(q, params);
      return rows[0] || null;
    }
  }

  async findPendingByValidator(validatorId) {
    const { rows } = await pool.query(
      `SELECT r.id, r.folio, r.type, r.sin_factura, r.amount, r.amount_mxn, r.currency,
              r.status, r.created_at, r.possible_duplicate, r.anomaly_ml, r.exceeds_limit,
              u.name AS requester_name, p.name AS project_name, c.name AS concept_name
       FROM spending_requests r
       JOIN users u    ON u.id=r.requester_id
       JOIN projects p ON p.id=r.project_id
       JOIN concepts c ON c.id=r.concept_id
       WHERE r.validator_id=$1 AND r.status='EN_REVISION'
       ORDER BY r.created_at`,
      [validatorId]
    );
    return rows;
  }

  // Para pago
  async markPaymentExecuted(id, { payment_method, payment_reference, payment_notes, executed_by }) {
    const { rows } = await pool.query(
      `UPDATE spending_requests
       SET status='PAGADO', payment_method=$2, payment_reference=$3,
           payment_notes=$4, payment_executed_by=$5, payment_date=NOW()
       WHERE id=$1 RETURNING *`,
      [id, payment_method, payment_reference, payment_notes, executed_by]
    );
    return rows[0];
  }

  async markClosed(id) {
    const { rows } = await pool.query(
      `UPDATE spending_requests SET status='CERRADO', closed_at=NOW() WHERE id=$1 RETURNING *`, [id]
    );
    return rows[0];
  }

  async addWarehouseReceipt({ request_id, received_by, status, observations, signature_path }) {
    const { rows } = await pool.query(
      `INSERT INTO warehouse_receipts (request_id, received_by, status, observations, signature_path)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [request_id, received_by, status, observations, signature_path]
    );
    await pool.query(`UPDATE spending_requests SET warehouse_received=true WHERE id=$1`, [request_id]);
    return rows[0];
  }

  async updateOcrData(id, ocr) {
    const { rows } = await pool.query(
      `UPDATE spending_requests SET
         ocr_rfc_emisor=$2, ocr_uuid_cfdi=$3, ocr_subtotal=$4, ocr_iva=$5,
         ocr_total=$6, ocr_fecha_cfdi=$7, ocr_confidence=$8, ocr_is_legible=$9, ocr_raw_text=$10
       WHERE id=$1 RETURNING *`,
      [id, ocr.rfc_emisor, ocr.uuid_cfdi, ocr.subtotal, ocr.iva,
           ocr.total, ocr.fecha_cfdi, ocr.confidence, ocr.is_legible, ocr.raw_text]
    );
    return rows[0];
  }

  async getPendingFactura() {
    const { rows } = await pool.query(
      `SELECT r.*, u.name AS requester_name, p.name AS project_name
       FROM spending_requests r
       JOIN users u ON u.id=r.requester_id
       JOIN projects p ON p.id=r.project_id
       WHERE r.status='COMPRADO_PENDIENTE_FACTURA'
       ORDER BY r.payment_date`
    );
    return rows;
  }
}

module.exports = new RequestRepository();
