const pool = require('../database/postgres');

class AnalyticsRepository {
  async getBudgetConsumption(projectId, year, month) {
    let q = 'SELECT * FROM v_budget_consumption WHERE 1=1';
    const params = [];
    if (projectId) { params.push(projectId); q += ` AND project_id=$${params.length}`; }
    if (year)      { params.push(year);      q += ` AND year=$${params.length}`; }
    if (month)     { params.push(month);     q += ` AND month=$${params.length}`; }
    const { rows } = await pool.query(q, params);
    return rows;
  }

  async getProjectUtility(projectId, year) {
    let q = 'SELECT * FROM v_project_utility WHERE 1=1';
    const params = [];
    if (projectId) { params.push(projectId); q += ` AND project_id=$${params.length}`; }
    if (year)      { params.push(year);      q += ` AND year=$${params.length}`; }
    q += ' ORDER BY year DESC, month DESC';
    const { rows } = await pool.query(q, params);
    return rows;
  }

  async getRequestsReport({ project_id, status, type, date_from, date_to, limit = 500 }) {
    let q = 'SELECT * FROM v_requests_report WHERE 1=1';
    const params = [];
    if (project_id) { params.push(project_id); q += ` AND project_id=$${params.length}`; }
    if (status)     { params.push(status);     q += ` AND status=$${params.length}`; }
    if (type)       { params.push(type);       q += ` AND type=$${params.length}`; }
    if (date_from)  { params.push(date_from);  q += ` AND created_at >= $${params.length}`; }
    if (date_to)    { params.push(date_to);    q += ` AND created_at <= $${params.length}`; }
    params.push(limit); q += ` ORDER BY created_at DESC LIMIT $${params.length}`;
    const { rows } = await pool.query(q, params);
    return rows;
  }

  async upsertBudget({ project_id, category_id, year, month, amount, threshold_yellow = 70, threshold_red = 90 }) {
    const { rows } = await pool.query(
      `INSERT INTO budgets (project_id, category_id, year, month, amount, threshold_yellow, threshold_red)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (project_id, category_id, year, month)
       DO UPDATE SET amount=$5, threshold_yellow=$6, threshold_red=$7
       RETURNING *`,
      [project_id, category_id, year, month, amount, threshold_yellow, threshold_red]
    );
    return rows[0];
  }

  async upsertMonthlyIncome({ project_id, year, month, amount, notes, created_by }) {
    const { rows } = await pool.query(
      `INSERT INTO monthly_income (project_id, year, month, amount, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (project_id, year, month)
       DO UPDATE SET amount=$4, notes=$5, updated_at=NOW()
       RETURNING *`,
      [project_id, year, month, amount, notes, created_by]
    );
    return rows[0];
  }

  async getDashboardStats(projectId) {
    const params = projectId ? [projectId] : [];
    const filter = projectId ? 'AND project_id=$1' : '';

    const { rows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status='EN_REVISION')            AS pending_approval,
         COUNT(*) FILTER (WHERE status='APROBADO')               AS approved,
         COUNT(*) FILTER (WHERE status='COMPRADO_PENDIENTE_FACTURA') AS pending_factura,
         COUNT(*) FILTER (WHERE status='PAGADO')                 AS paid,
         COALESCE(SUM(amount_mxn) FILTER (WHERE status NOT IN ('RECHAZADO','CANCELADO')), 0) AS total_mxn,
         COUNT(*) FILTER (WHERE possible_duplicate=true)         AS duplicates,
         COUNT(*) FILTER (WHERE anomaly_ml=true)                 AS anomalies
       FROM spending_requests WHERE 1=1 ${filter}`,
      params
    );
    return rows[0];
  }
}

module.exports = new AnalyticsRepository();
