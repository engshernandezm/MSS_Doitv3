const { Pool } = require('pg');

const pool = new Pool({
  host:              process.env.DB_HOST     || 'localhost',
  port:              parseInt(process.env.DB_PORT || '5432'),
  database:          process.env.DB_NAME     || 'doitv3',
  user:              process.env.DB_USER     || 'postgres',
  password:          process.env.DB_PASSWORD || 'Admin1234',
  max:               10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => console.error('[DB] Error inesperado:', err.message));

module.exports = pool;
