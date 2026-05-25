#!/bin/sh
set -e

echo "[DOCKER] Esperando a PostgreSQL en $DB_HOST:$DB_PORT..."

# Esperar a que PostgreSQL acepte conexiones
until node -e "
const {Pool}=require('pg');
const p=new Pool({host:process.env.DB_HOST,port:process.env.DB_PORT,database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD});
p.query('SELECT 1').then(()=>{p.end();process.exit(0)}).catch(()=>{p.end();process.exit(1)});
" 2>/dev/null; do
  echo "[DOCKER] PostgreSQL no disponible, reintentando en 2s..."
  sleep 2
done

echo "[DOCKER] PostgreSQL listo."

# Sembrar usuarios solo si la tabla está vacía
USERS=$(node -e "
const {Pool}=require('pg');
const p=new Pool({host:process.env.DB_HOST,port:process.env.DB_PORT,database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD});
p.query('SELECT COUNT(*) AS n FROM users')
  .then(r=>{console.log(r.rows[0].n);p.end();process.exit(0)})
  .catch(()=>{console.log('0');p.end();process.exit(0)});
" 2>/dev/null || echo "0")

if [ "$USERS" = "0" ]; then
  echo "[DOCKER] Creando usuarios de prueba..."
  node /app/database/seed_users.js
  echo "[DOCKER] Usuarios creados exitosamente."
else
  echo "[DOCKER] Ya existen $USERS usuarios registrados, saltando seed."
fi

echo "[DOCKER] Iniciando FonzControl API..."
exec node src/presentation/app.js
