// Seed: usuarios del sistema
// Ejecutar: node database/seed_users.js
// Requiere que el .env del backend esté configurado

require('dotenv').config({ path: './backend/.env' });
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 5432,
  database: process.env.DB_NAME     || 'doitv3',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || 'Admin1234',
});

const PASSWORD = 'Fonz2024!';
const ROUNDS = 10;

const users = [
  // Superadmin
  {
    id:    '00000001-0000-0000-0000-000000000001',
    name:  'Super Admin',
    email: 'superadmin@fonz.mx',
    role:  'superadmin',
    phone: '+5215500000001',
    projects: [],
  },
  // Validadores
  {
    id:    '00000002-0000-0000-0000-000000000001',
    name:  'Director Operaciones',
    email: 'director.ops@fonz.mx',
    role:  'validator',
    phone: '+5215500000002',
    projects: ['11111111-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000002'],
  },
  {
    id:    '00000002-0000-0000-0000-000000000002',
    name:  'Director Compras',
    email: 'director.compras@fonz.mx',
    role:  'validator',
    phone: '+5215500000003',
    projects: ['11111111-0000-0000-0000-000000000003','11111111-0000-0000-0000-000000000004'],
  },
  {
    id:    '00000002-0000-0000-0000-000000000003',
    name:  'CEO Fonz',
    email: 'ceo@fonz.mx',
    role:  'validator',
    phone: '+5215500000004',
    projects: [
      '11111111-0000-0000-0000-000000000001',
      '11111111-0000-0000-0000-000000000002',
      '11111111-0000-0000-0000-000000000003',
      '11111111-0000-0000-0000-000000000004',
    ],
  },
  // Administrativo (Anna)
  {
    id:    '00000003-0000-0000-0000-000000000001',
    name:  'Anna Administrativo',
    email: 'anna@fonz.mx',
    role:  'administrativo',
    phone: '+5215500000005',
    projects: [
      '11111111-0000-0000-0000-000000000001',
      '11111111-0000-0000-0000-000000000002',
      '11111111-0000-0000-0000-000000000003',
      '11111111-0000-0000-0000-000000000004',
    ],
  },
  // Comprador (Irving)
  {
    id:    '00000004-0000-0000-0000-000000000001',
    name:  'Irving Comprador',
    email: 'irving@fonz.mx',
    role:  'buyer',
    phone: '+5215500000006',
    projects: [
      '11111111-0000-0000-0000-000000000001',
      '11111111-0000-0000-0000-000000000002',
      '11111111-0000-0000-0000-000000000003',
      '11111111-0000-0000-0000-000000000004',
    ],
  },
  // Operativos
  {
    id:    '00000005-0000-0000-0000-000000000001',
    name:  'Juan García',
    email: 'juan.garcia@fonz.mx',
    role:  'operative',
    phone: '+5215500000007',
    projects: ['11111111-0000-0000-0000-000000000001'],
  },
  {
    id:    '00000005-0000-0000-0000-000000000002',
    name:  'María López',
    email: 'maria.lopez@fonz.mx',
    role:  'operative',
    phone: '+5215500000008',
    projects: ['11111111-0000-0000-0000-000000000002'],
  },
  {
    id:    '00000005-0000-0000-0000-000000000003',
    name:  'Carlos Encargado',
    email: 'carlos.enc@fonz.mx',
    role:  'operative',
    phone: '+5215500000009',
    projects: ['11111111-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000002'],
  },
  {
    id:    '00000005-0000-0000-0000-000000000004',
    name:  'Sofía Martínez',
    email: 'sofia.martinez@fonz.mx',
    role:  'operative',
    phone: '+5215500000010',
    projects: ['11111111-0000-0000-0000-000000000003'],
  },
];

async function seed() {
  const hash = await bcrypt.hash(PASSWORD, ROUNDS);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const u of users) {
      await client.query(`
        INSERT INTO users (id, name, email, password_hash, role, phone_whatsapp, phone_verified, notification_channel)
        VALUES ($1,$2,$3,$4,$5,$6,true,'both')
        ON CONFLICT (email) DO UPDATE SET
          name = EXCLUDED.name, role = EXCLUDED.role,
          phone_whatsapp = EXCLUDED.phone_whatsapp
      `, [u.id, u.name, u.email, hash, u.role, u.phone]);

      for (const pid of u.projects) {
        await client.query(`
          INSERT INTO user_projects (user_id, project_id) VALUES ($1,$2)
          ON CONFLICT DO NOTHING
        `, [u.id, pid]);
      }

      console.log(`✓ ${u.role.padEnd(14)} ${u.name} — ${u.email}`);
    }

    // Reglas de enrutamiento (Director Ops → proyectos VWP y ASJ)
    await client.query(`
      INSERT INTO routing_rules (name, project_id, validator_id, priority)
      VALUES
        ('VWP → Director Ops','11111111-0000-0000-0000-000000000001','00000002-0000-0000-0000-000000000001',10),
        ('ASJ → Director Ops','11111111-0000-0000-0000-000000000002','00000002-0000-0000-0000-000000000001',10),
        ('SCH → Director Compras','11111111-0000-0000-0000-000000000003','00000002-0000-0000-0000-000000000002',10),
        ('SCHP → Director Compras','11111111-0000-0000-0000-000000000004','00000002-0000-0000-0000-000000000002',10)
      ON CONFLICT DO NOTHING
    `);

    // Reglas de escalación (Director Ops → CEO después de 48h)
    await client.query(`
      INSERT INTO escalation_rules (from_validator_id, to_validator_id, reminder_hours, escalation_hours)
      VALUES
        ('00000002-0000-0000-0000-000000000001','00000002-0000-0000-0000-000000000003',24,48),
        ('00000002-0000-0000-0000-000000000002','00000002-0000-0000-0000-000000000003',24,48)
      ON CONFLICT DO NOTHING
    `);

    await client.query('COMMIT');
    console.log(`\n✓ Todos los usuarios creados con contraseña: ${PASSWORD}`);
    console.log('\nCredenciales de prueba:');
    console.log('────────────────────────────────────────────');
    users.forEach(u => console.log(`  ${u.email.padEnd(30)} ${u.role}`));
    console.log(`  Contraseña: ${PASSWORD}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
