const router   = require('express').Router();
const bcrypt   = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const userRepo = require('../../infrastructure/repositories/UserRepository');
const pool     = require('../../infrastructure/database/postgres');
const { authMiddleware, requireRole } = require('../middlewares/auth.middleware');

const validate = (req, res, next) => {
  const e = validationResult(req);
  if (!e.isEmpty()) return res.status(422).json({ errors: e.array() });
  next();
};

router.use(authMiddleware, requireRole('superadmin'));

// ─── USUARIOS ───────────────────────────────────────────────────────────────

router.get('/users', async (req, res) => {
  try {
    const users = await userRepo.findAll({ active: null });
    res.json({ data: users });
  } catch (err) { res.status(500).json({ error: 'Error interno' }); }
});

router.post('/users',
  body('name').notEmpty(),
  body('email').isEmail(),
  body('password').isLength({ min: 8 }),
  body('role').isIn(['superadmin','validator','administrativo','buyer','operative']),
  body('phone').optional().isMobilePhone(),
  body('notification_channel').optional().isIn(['email','whatsapp','both']),
  validate,
  async (req, res) => {
    try {
      const existing = await userRepo.findByEmail(req.body.email);
      if (existing) return res.status(409).json({ error: 'Email ya registrado' });

      const hash = await bcrypt.hash(req.body.password, 10);
      const user  = await userRepo.create({ ...req.body, password_hash: hash });
      res.status(201).json({ data: user });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error interno' });
    }
  }
);

router.patch('/users/:id',
  body('name').optional().notEmpty(),
  body('email').optional().isEmail(),
  body('role').optional().isIn(['superadmin','validator','administrativo','buyer','operative']),
  body('is_active').optional().isBoolean(),
  validate,
  async (req, res) => {
    try {
      const user = await userRepo.update(req.params.id, req.body);
      if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
      res.json({ data: user });
    } catch (err) { res.status(500).json({ error: 'Error interno' }); }
  }
);

router.post('/users/:id/reset-password',
  body('password').isLength({ min: 8 }),
  validate,
  async (req, res) => {
    try {
      const hash = await bcrypt.hash(req.body.password, 10);
      await userRepo.setPasswordHash(req.params.id, hash);
      res.json({ message: 'Contraseña restablecida' });
    } catch (err) { res.status(500).json({ error: 'Error interno' }); }
  }
);

router.post('/users/:id/projects', body('project_id').isUUID(), validate, async (req, res) => {
  try {
    await userRepo.assignProject(req.params.id, req.body.project_id);
    res.json({ message: 'Proyecto asignado' });
  } catch (err) { res.status(500).json({ error: 'Error interno' }); }
});

router.delete('/users/:id/projects/:pid', async (req, res) => {
  try {
    await userRepo.removeProject(req.params.id, req.params.pid);
    res.json({ message: 'Proyecto removido' });
  } catch (err) { res.status(500).json({ error: 'Error interno' }); }
});

// ─── PROYECTOS ──────────────────────────────────────────────────────────────

router.get('/projects', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM projects ORDER BY name');
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: 'Error interno' }); }
});

router.post('/projects',
  body('name').notEmpty(),
  body('code').notEmpty().isLength({ max: 10 }),
  body('client').optional().isString(),
  validate,
  async (req, res) => {
    try {
      const { rows } = await pool.query(
        `INSERT INTO projects (name, code, client, is_active) VALUES ($1,$2,$3,true) RETURNING *`,
        [req.body.name, req.body.code.toUpperCase(), req.body.client]
      );
      res.status(201).json({ data: rows[0] });
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'Código de proyecto duplicado' });
      res.status(500).json({ error: 'Error interno' });
    }
  }
);

router.patch('/projects/:id', async (req, res) => {
  try {
    const allowed = ['name','client','is_active'];
    const sets = []; const vals = [];
    for (const [k, v] of Object.entries(req.body)) {
      if (allowed.includes(k)) { vals.push(v); sets.push(`${k}=$${vals.length}`); }
    }
    if (!sets.length) return res.status(422).json({ error: 'Sin campos a actualizar' });
    vals.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE projects SET ${sets.join(',')} WHERE id=$${vals.length} RETURNING *`, vals
    );
    res.json({ data: rows[0] });
  } catch (err) { res.status(500).json({ error: 'Error interno' }); }
});

// ─── CATÁLOGOS ──────────────────────────────────────────────────────────────

router.get('/categories', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM categories WHERE is_active=true ORDER BY name');
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: 'Error interno' }); }
});

router.get('/concepts', async (req, res) => {
  try {
    const { category_id } = req.query;
    let q = `SELECT c.*, cat.name AS category_name FROM concepts c JOIN categories cat ON cat.id=c.category_id WHERE c.is_active=true`;
    const params = [];
    if (category_id) { params.push(category_id); q += ` AND c.category_id=$1`; }
    q += ' ORDER BY cat.name, c.name';
    const { rows } = await pool.query(q, params);
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: 'Error interno' }); }
});

// ─── REGLAS DE ENRUTAMIENTO ─────────────────────────────────────────────────

router.get('/routing-rules', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT rr.*, u.name AS validator_name, p.name AS project_name, cat.name AS category_name
       FROM routing_rules rr
       LEFT JOIN users u ON u.id=rr.validator_id
       LEFT JOIN projects p ON p.id=rr.project_id
       LEFT JOIN categories cat ON cat.id=rr.category_id
       ORDER BY rr.priority`
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: 'Error interno' }); }
});

router.post('/routing-rules',
  body('validator_id').isUUID(),
  body('priority').isInt({ min: 1 }),
  validate,
  async (req, res) => {
    try {
      const { validator_id, project_id, category_id, amount_min, amount_max, priority } = req.body;
      const { rows } = await pool.query(
        `INSERT INTO routing_rules (validator_id,project_id,category_id,min_amount,max_amount,priority,is_active)
         VALUES ($1,$2,$3,$4,$5,$6,true) RETURNING *`,
        [validator_id, project_id || null, category_id || null, amount_min || null, amount_max || null, priority]
      );
      res.status(201).json({ data: rows[0] });
    } catch (err) { res.status(500).json({ error: 'Error interno' }); }
  }
);

// ─── PERÍODOS CONTABLES ─────────────────────────────────────────────────────

router.get('/periods', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM accounting_periods ORDER BY year DESC, month DESC'
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: 'Error interno' }); }
});

router.post('/periods',
  body('year').isInt({ min: 2020 }),
  body('month').isInt({ min: 1, max: 12 }),
  body('status').isIn(['ABIERTO','CERRADO']),
  validate,
  async (req, res) => {
    try {
      const { rows } = await pool.query(
        `INSERT INTO accounting_periods (year, month, status, project_id)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (year, month, COALESCE(project_id, '00000000-0000-0000-0000-000000000000'))
         DO UPDATE SET status=$3
         RETURNING *`,
        [req.body.year, req.body.month, req.body.status, req.body.project_id || null]
      );
      res.json({ data: rows[0] });
    } catch (err) { res.status(500).json({ error: 'Error interno' }); }
  }
);

// ─── LÍMITES DE GASTO ───────────────────────────────────────────────────────

router.get('/spending-limits', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT sl.*, c.name AS concept_name, p.name AS project_name
       FROM spending_limits sl
       JOIN concepts c ON c.id=sl.concept_id
       LEFT JOIN projects p ON p.id=sl.project_id
       ORDER BY c.name`
    );
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: 'Error interno' }); }
});

router.post('/spending-limits',
  body('concept_id').isUUID(),
  body('max_amount').isFloat({ min: 0.01 }),
  body('action_on_exceed').isIn(['block','escalate']),
  validate,
  async (req, res) => {
    try {
      const { concept_id, role, project_id, max_amount, action_on_exceed } = req.body;
      const { rows } = await pool.query(
        `INSERT INTO spending_limits (concept_id, role, project_id, max_amount, action_on_exceed)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [concept_id, role || null, project_id || null, max_amount, action_on_exceed]
      );
      res.status(201).json({ data: rows[0] });
    } catch (err) { res.status(500).json({ error: 'Error interno' }); }
  }
);

module.exports = router;
