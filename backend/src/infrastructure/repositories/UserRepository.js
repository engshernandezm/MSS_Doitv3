const pool = require('../database/postgres');

class UserRepository {
  async findByEmail(email) {
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE email=$1', [email.toLowerCase()]
    );
    return rows[0] || null;
  }

  async findById(id) {
    const { rows } = await pool.query(
      'SELECT id,name,email,role,phone,notification_channel,active FROM users WHERE id=$1', [id]
    );
    return rows[0] || null;
  }

  async findAll({ role, active = true } = {}) {
    let q = 'SELECT id,name,email,role,phone,notification_channel,active FROM users WHERE 1=1';
    const params = [];
    if (active !== null) { params.push(active); q += ` AND active=$${params.length}`; }
    if (role)            { params.push(role);   q += ` AND role=$${params.length}`; }
    q += ' ORDER BY name';
    const { rows } = await pool.query(q, params);
    return rows;
  }

  async create({ name, email, password_hash, role, phone, notification_channel = 'email' }) {
    const { rows } = await pool.query(
      `INSERT INTO users (name,email,password_hash,role,phone,notification_channel,phone_verified,active)
       VALUES ($1,$2,$3,$4,$5,$6,true,true) RETURNING id,name,email,role,phone,notification_channel`,
      [name, email.toLowerCase(), password_hash, role, phone, notification_channel]
    );
    return rows[0];
  }

  async update(id, fields) {
    const allowed = ['name','email','phone','role','notification_channel','active'];
    const sets = [];
    const vals = [];
    for (const [k, v] of Object.entries(fields)) {
      if (allowed.includes(k)) { vals.push(v); sets.push(`${k}=$${vals.length}`); }
    }
    if (!sets.length) return null;
    vals.push(id);
    const { rows } = await pool.query(
      `UPDATE users SET ${sets.join(',')} WHERE id=$${vals.length} RETURNING id,name,email,role,phone,notification_channel,active`,
      vals
    );
    return rows[0];
  }

  async setPasswordHash(id, hash) {
    await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, id]);
  }

  async saveResetToken(userId, token, expiresAt) {
    await pool.query(
      `INSERT INTO password_reset_tokens (user_id,token,expires_at)
       VALUES ($1,$2,$3)
       ON CONFLICT (user_id) DO UPDATE SET token=$2, expires_at=$3, used=false`,
      [userId, token, expiresAt]
    );
  }

  async findResetToken(token) {
    const { rows } = await pool.query(
      `SELECT prt.*, u.email FROM password_reset_tokens prt
       JOIN users u ON u.id=prt.user_id
       WHERE prt.token=$1 AND prt.used=false AND prt.expires_at > NOW()`,
      [token]
    );
    return rows[0] || null;
  }

  async markTokenUsed(token) {
    await pool.query('UPDATE password_reset_tokens SET used=true WHERE token=$1', [token]);
  }

  async findProjectUsers(projectId) {
    const { rows } = await pool.query(
      `SELECT u.id,u.name,u.email,u.role,u.phone,u.notification_channel
       FROM users u JOIN user_projects up ON up.user_id=u.id
       WHERE up.project_id=$1 AND u.active=true ORDER BY u.name`,
      [projectId]
    );
    return rows;
  }

  async assignProject(userId, projectId) {
    await pool.query(
      `INSERT INTO user_projects (user_id,project_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [userId, projectId]
    );
  }

  async removeProject(userId, projectId) {
    await pool.query(
      'DELETE FROM user_projects WHERE user_id=$1 AND project_id=$2', [userId, projectId]
    );
  }

  async getUserProjects(userId) {
    const { rows } = await pool.query(
      `SELECT p.* FROM projects p JOIN user_projects up ON up.project_id=p.id
       WHERE up.user_id=$1 AND p.active=true ORDER BY p.name`,
      [userId]
    );
    return rows;
  }
}

module.exports = new UserRepository();
