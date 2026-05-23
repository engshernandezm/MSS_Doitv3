const jwt = require('jsonwebtoken');
const pool = require('../../infrastructure/database/postgres');

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

  // Allow token via query string for file downloads (Excel)
  const qToken = req.query._token;
  const finalToken = token || qToken;
  if (!finalToken) return res.status(401).json({ error: 'Token requerido' });

  try {
    const payload = jwt.verify(finalToken, process.env.JWT_SECRET);
    const { rows } = await pool.query(
      'SELECT id, name, email, role, phone, notification_channel FROM users WHERE id=$1 AND active=true',
      [payload.sub]
    );
    if (!rows.length) return res.status(401).json({ error: 'Usuario inactivo o no encontrado' });
    req.user = rows[0];
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ error: 'Sin permisos para esta acción' });
    }
    next();
  };
}

module.exports = { authMiddleware, requireRole };
