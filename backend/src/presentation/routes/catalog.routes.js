const router   = require('express').Router();
const pool     = require('../../infrastructure/database/postgres');
const userRepo = require('../../infrastructure/repositories/UserRepository');
const { authMiddleware } = require('../middlewares/auth.middleware');

router.use(authMiddleware);

// GET /api/catalog/projects — proyectos del usuario (operativo: los suyos; resto: todos)
router.get('/projects', async (req, res) => {
  try {
    let rows;
    if (req.user.role === 'operative') {
      rows = await userRepo.getUserProjects(req.user.id);
    } else {
      const result = await pool.query(
        'SELECT * FROM projects WHERE is_active=true ORDER BY name'
      );
      rows = result.rows;
    }
    res.json({ data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/catalog/categories — categorías activas
router.get('/categories', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM categories WHERE is_active=true ORDER BY name'
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/catalog/concepts?category_id=X — conceptos activos (filtrado por categoría)
router.get('/concepts', async (req, res) => {
  try {
    const { category_id } = req.query;
    let q = `SELECT c.*, cat.name AS category_name
             FROM concepts c
             JOIN categories cat ON cat.id = c.category_id
             WHERE c.is_active=true`;
    const params = [];
    if (category_id) { params.push(category_id); q += ` AND c.category_id=$1`; }
    q += ' ORDER BY cat.name, c.name';
    const { rows } = await pool.query(q, params);
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
