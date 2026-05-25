# INSTRUCTIVO DE EJECUCIÓN — FonzControl doitv3

**Sistema de Control de Gastos Operativos**

---

## Contenido

0. [Inicio rápido con Docker (recomendado)](#0-inicio-rápido-con-docker)
1. [Instalación manual sin Docker](#1-instalación-manual-sin-docker)
2. [Escenarios de operación](#2-escenarios-de-operación)
3. [Primer acceso y usuarios de prueba](#3-primer-acceso-y-usuarios-de-prueba)
4. [Guía de uso por rol](#4-guía-de-uso-por-rol)
5. [Variables de entorno](#5-variables-de-entorno)
6. [Integraciones opcionales](#6-integraciones-opcionales)
7. [Solución de problemas](#7-solución-de-problemas)
8. [Comandos de mantenimiento](#8-comandos-de-mantenimiento)
9. [Estructura del proyecto](#9-estructura-del-proyecto)

---

## 0. Inicio rápido con Docker

> Recomendado. Levanta PostgreSQL + backend + frontend con un solo comando.

### Prerrequisito

Instalar **Docker Desktop**: https://www.docker.com/products/docker-desktop

Verificar instalación:
```bash
docker --version
docker compose version
```

---

### Escenario A — Primera vez (instalación limpia)

**Paso 1.** Clonar o descomprimir el proyecto en el servidor.

**Paso 2.** Entrar a la carpeta raíz del proyecto:
```bash
cd /ruta/al/proyecto/MSS_Doitv3
```

**Paso 3.** Construir e iniciar todos los servicios:
```bash
docker compose up --build
```

**Paso 4.** Esperar a que aparezcan estas líneas en consola:
```
fonzcontrol-db   | database system is ready to accept connections
fonzcontrol-api  | [DOCKER] PostgreSQL listo.
fonzcontrol-api  | [DOCKER] Usuarios creados exitosamente.
fonzcontrol-api  | [APP] FonzControl doitv3 corriendo en puerto 3000
```

**Paso 5.** Abrir el navegador:
- Local: `http://localhost:5500`
- En red: `http://IP_DEL_SERVIDOR:5500`

Lo que ocurre automáticamente en la primera ejecución:
- Se descargan las imágenes de Node.js 20 y PostgreSQL 16
- Se crean las tablas y esquemas (archivos SQL 001 al 005)
- Se cargan los catálogos (proyectos, categorías, conceptos)
- Se crean 10 usuarios de prueba con contraseña `Fonz2024!`

---

### Escenario B — Reiniciar el sistema (ya instalado)

**Paso 1.** Iniciar en segundo plano:
```bash
docker compose up -d
```

**Paso 2.** Verificar que los tres contenedores estén corriendo:
```bash
docker compose ps
```
Debe mostrar `running` en los tres: `fonzcontrol-db`, `fonzcontrol-api`, `fonzcontrol-web`.

**Paso 3.** (Opcional) Ver logs del backend:
```bash
docker compose logs -f backend
```

Los datos de la base de datos **persisten** entre reinicios gracias al volumen `pgdata`.

---

### Escenario C — Actualizar código del backend

**Paso 1.** Hacer los cambios en los archivos fuente del proyecto.

**Paso 2.** Reconstruir e reiniciar solo el backend:
```bash
docker compose up -d --build backend
```

**Paso 3.** Confirmar que arrancó sin errores:
```bash
docker compose logs --tail=30 backend
```

> El frontend es estático — cambios en HTML/CSS/JS se reflejan sin reconstruir.

---

### Escenario D — Aplicar migración a base de datos existente

Cuando se agrega un nuevo archivo SQL y el volumen ya existe (los init scripts no vuelven a correr):

**Paso 1.** Verificar que el contenedor de DB esté corriendo:
```bash
docker compose ps
```

**Paso 2.** Ejecutar el script de migración directamente en el contenedor:
```bash
docker exec -i fonzcontrol-db psql -U postgres -d doitv3 \
  < database/005_code_alignment.sql
```

**Paso 3.** Reiniciar el backend para que use el esquema actualizado:
```bash
docker compose restart backend
```

**Paso 4.** Confirmar que no hay errores:
```bash
docker compose logs --tail=20 backend
```

---

### Escenario E — Reset total (borra todos los datos)

> Usar solo si se quiere partir desde cero.

**Paso 1.** Detener y eliminar contenedores + volúmenes:
```bash
docker compose down -v
```

**Paso 2.** Reconstruir e iniciar desde cero:
```bash
docker compose up --build
```

Todo vuelve a crearse: esquemas, catálogos y usuarios de prueba.

---

### Comandos Docker de referencia rápida

```bash
# Iniciar en primer plano (ver logs en tiempo real)
docker compose up --build

# Iniciar en segundo plano
docker compose up -d --build

# Ver estado de los contenedores
docker compose ps

# Ver logs en tiempo real (todos)
docker compose logs -f

# Ver logs solo del backend
docker compose logs -f backend

# Ver últimas 50 líneas del backend
docker compose logs --tail=50 backend

# Detener (conserva datos)
docker compose down

# Detener y borrar base de datos (reset total)
docker compose down -v

# Reconstruir solo el backend
docker compose up -d --build backend

# Reiniciar un servicio sin reconstruir
docker compose restart backend

# Entrar al contenedor del backend
docker exec -it fonzcontrol-api sh

# Entrar al contenedor de la base de datos
docker exec -it fonzcontrol-db psql -U postgres -d doitv3
```

---

## 1. Instalación manual sin Docker

### Prerrequisitos

| Software | Versión mínima | Descarga |
|----------|---------------|----------|
| Node.js | 18 LTS | https://nodejs.org |
| PostgreSQL | 14 | https://www.postgresql.org/download |

Verificar:
```bash
node --version    # v18.x o superior
npm --version     # 9.x o superior
psql --version    # PostgreSQL 14.x o superior
```

---

### Paso 1 — Crear la base de datos

```bash
psql -U postgres -c "CREATE DATABASE doitv3;"
```

---

### Paso 2 — Aplicar los esquemas (en orden estricto)

```bash
psql -U postgres -d doitv3 -f database/001_base_schema.sql
psql -U postgres -d doitv3 -f database/002_requests_schema.sql
psql -U postgres -d doitv3 -f database/003_analytics_schema.sql
psql -U postgres -d doitv3 -f database/004_notifications_schema.sql
psql -U postgres -d doitv3 -f database/005_code_alignment.sql
```

Cada comando debe terminar sin errores `ERROR:`.

---

### Paso 3 — Cargar catálogos y usuarios

```bash
# Catálogos: proyectos, categorías, conceptos, límites
psql -U postgres -d doitv3 -f database/seed_catalog.sql

# Usuarios de prueba (requiere Node.js)
node database/seed_users.js
```

Salida esperada: `[SEED] 10 usuarios creados correctamente.`

---

### Paso 4 — Instalar dependencias del backend

```bash
cd backend
npm install
cd ..
```

---

### Paso 5 — Configurar variables de entorno

```bash
# Linux/Mac
cp backend/.env.example backend/.env

# Windows
copy backend\.env.example backend\.env
```

Abrir `backend/.env` y ajustar:
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=doitv3
DB_USER=postgres
DB_PASSWORD=Admin1234
JWT_SECRET=cambia_esto_por_cadena_larga
PORT=3000
```

---

### Paso 6 — Iniciar el backend

```bash
node backend/src/presentation/app.js
```

Salida esperada:
```
[APP] FonzControl doitv3 corriendo en puerto 3000
[CRON] Jobs programados iniciados
```

---

### Paso 7 — Servir el frontend

**Opción A — VS Code Live Server:**
1. Abrir carpeta `frontend` en VS Code
2. Clic derecho en `index.html` → "Open with Live Server"

**Opción B — npx serve:**
```bash
npx serve frontend -l 5500
```

---

### Paso 8 — Verificar que todo funciona

```bash
curl http://localhost:3000/health
```

Respuesta esperada:
```json
{ "status": "ok", "ts": "..." }
```

---

## 2. Escenarios de operación

### Despliegue en servidor con IP fija

Si el frontend está en `http://192.168.1.80:5500` y el backend en `http://192.168.1.80:3000`:

```bash
# La URL se detecta automáticamente desde el hostname del navegador
docker compose up -d --build

# O forzar explícitamente la URL del API:
API_URL=http://192.168.1.80:3000 docker compose up -d --build
```

### Despliegue con dominio (Cloudflare Tunnel u otro proxy)

Si el backend está detrás de un dominio como `https://api.miempresa.com`:

```bash
API_URL=https://api.miempresa.com docker compose up -d --build
```

---

## 3. Primer acceso y usuarios de prueba

Abrir en el navegador: `http://localhost:5500` (o la IP del servidor).

**Contraseña para todos los usuarios: `Fonz2024!`**

| Email | Rol | Acceso |
|-------|-----|--------|
| `superadmin@fonz.mx` | Superadmin | Acceso total |
| `director.ops@fonz.mx` | Validador | Aprueba VWP y ASJ |
| `director.compras@fonz.mx` | Validador | Aprueba SCHI y SCHP |
| `ceo@fonz.mx` | Validador | Escalaciones |
| `anna@fonz.mx` | Administrativo | Reembolsos, reportes, presupuestos |
| `irving@fonz.mx` | Buyer | Compras, facturas |
| `pedro.op@fonz.mx` | Operativo | Solicitudes campo VWP |
| `maria.op@fonz.mx` | Operativo | Solicitudes campo ASJ |
| `juan.op@fonz.mx` | Operativo | Solicitudes campo Schaeffler |
| `carlos.op@fonz.mx` | Operativo | Solicitudes general |

---

## 4. Guía de uso por rol

### Operativo

**Crear solicitud:**
1. Ir a "Nueva Solicitud"
2. Elegir tipo: **Reembolso** (ya gasté) o **Requisición** (necesito comprar)
3. Si tienes factura, cargar el XML del CFDI — se auto-llena monto y moneda
4. Si no tienes factura, seleccionar "No, es un gasto sin comprobante" y escribir justificación
5. Seleccionar Proyecto, Categoría y Concepto
6. Capturar monto y moneda (si es USD aparece el campo de tipo de cambio)
7. Subir foto o PDF del comprobante
8. Agregar observaciones opcionales
9. Clic en "Enviar Solicitud"

**Seguimiento:**
1. Ir a "Mis Solicitudes"
2. Filtrar por estado si es necesario
3. Si fue rechazado (no definitivo), corregir desde el detalle y reenviar

---

### Validador

**Revisar solicitud:**
1. En el dashboard aparece la cola de solicitudes pendientes
2. Las solicitudes en naranja llevan más de 2 días esperando
3. Clic en "Revisar" para ver:
   - Datos del solicitante y proyecto
   - Datos extraídos del CFDI (RFC, UUID, montos)
   - Alertas: posible duplicado, anomalía, excede límite
4. Clic en "Aprobar" o "Rechazar"
   - Rechazo requiere motivo mínimo de 10 caracteres
   - "Rechazo definitivo" impide que se reenvíe

**Escalación automática:**
- 24 horas sin revisión → recordatorio al validador
- 48 horas sin revisión → escalación automática al CEO

---

### Administrativo (Anna)

**Pagar reembolso:**
1. Dashboard → "Reembolsos Aprobados — Pendientes de Pago"
2. Clic en "Pagar"
3. Seleccionar método de pago y agregar referencia
4. Confirmar

**Exportar a Compac:**
1. Ir a "Reportes"
2. Aplicar filtros (proyecto, período, estado)
3. Clic en "Exportar Excel (Compac)"

---

### Buyer (Irving)

**Ejecutar compra:**
1. Dashboard → "Requisiciones Aprobadas — Pendientes de Compra"
2. Clic en "Ejecutar"
3. Ingresar método, referencia y notas
4. Confirmar → pasa a "Comprado - Pendiente Factura"

**Subir factura del proveedor:**
1. Ir a "Pte. Factura"
2. Las rojas llevan más de 5 días sin factura
3. Clic en "Subir factura" → seleccionar PDF o XML CFDI
4. Al subir → pasa automáticamente a "Pagado"

---

### Superadmin

**Gestión de usuarios:**
1. Ir a "Usuarios" → "Nuevo Usuario"
2. Asignar nombre, email, rol, teléfono
3. La contraseña se puede restablecer desde el panel

**Catálogos:**
1. Ir a "Catálogos"
2. Gestionar: Proyectos, Categorías, Conceptos, Reglas de enrutamiento, Límites de gasto, Períodos contables

---

## 5. Variables de entorno

### Docker (`backend/.env.docker`)

```env
DB_HOST=postgres          # Nombre del servicio Docker, NO localhost
DB_PORT=5432
DB_NAME=doitv3
DB_USER=postgres
DB_PASSWORD=Admin1234

JWT_SECRET=doitv3_super_secret_key_fonzcontrol_2024_cambia_esto
JWT_EXPIRES_IN=8h

PORT=3000
CORS_ORIGIN=*

EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=
EMAIL_PASS=
EMAIL_FROM=FonzControl <noreply@fonz.mx>

WA_PHONE_ID=
WA_ACCESS_TOKEN=
WA_VERIFY_TOKEN=fonzcontrol_webhook_verify_2024

GOOGLE_VISION_API_KEY=

UPLOADS_DIR=/app/uploads
MAX_FILE_SIZE_MB=10

APP_URL=http://localhost:5500
API_URL=http://localhost:3000
```

### Manual (`backend/.env`)

Igual que arriba pero con:
```env
DB_HOST=localhost
UPLOADS_DIR=./uploads
```

---

## 6. Integraciones opcionales

### Email (Gmail)

1. Activar verificación en 2 pasos en Gmail
2. Cuenta → Seguridad → Contraseñas de aplicación
3. Crear contraseña para "Correo" → copiar al `.env`:

```env
EMAIL_USER=tu-correo@gmail.com
EMAIL_PASS=abcd efgh ijkl mnop
```

### WhatsApp Business

1. Ir a developers.facebook.com → crear app tipo Business
2. Agregar producto WhatsApp
3. Copiar valores al `.env`:

```env
WA_PHONE_ID=123456789
WA_ACCESS_TOKEN=EAABsbCS...
WA_VERIFY_TOKEN=fonzcontrol_webhook_verify_2024
```

4. Configurar webhook: `https://tu-dominio.com/api/whatsapp/webhook`

### OCR — Google Cloud Vision

1. console.cloud.google.com → habilitar Cloud Vision API
2. Credenciales → Crear clave de API

```env
GOOGLE_VISION_API_KEY=AIzaSy...
```

> Sin ninguna de estas credenciales el sistema funciona en modo simulación (notificaciones en consola, OCR con datos mock).

---

## 7. Solución de problemas

### CORS bloqueado en el navegador

El backend ya tiene `origin: '*'` configurado. Si sigue fallando:

**Paso 1.** Verificar que el backend está corriendo:
```bash
curl http://IP_DEL_SERVIDOR:3000/health
```

**Paso 2.** Verificar que el preflight OPTIONS responde:
```bash
curl -I -X OPTIONS http://IP_DEL_SERVIDOR:3000/api/auth/login \
  -H "Origin: http://IP_DEL_SERVIDOR:5500" \
  -H "Access-Control-Request-Method: POST"
```
Debe aparecer `Access-Control-Allow-Origin: *`.

**Paso 3.** Si el backend no responde, revisar logs:
```bash
docker compose logs --tail=50 backend
```

---

### Error "column X does not exist"

El archivo `005_code_alignment.sql` no se ejecutó (el volumen ya existía).

**Paso 1.** Aplicar la migración manualmente:
```bash
docker exec -i fonzcontrol-db psql -U postgres -d doitv3 \
  < database/005_code_alignment.sql
```

**Paso 2.** Reiniciar el backend:
```bash
docker compose restart backend
```

---

### El backend no arranca / crashea al iniciar

**Paso 1.** Ver el error exacto:
```bash
docker compose logs --tail=50 backend
```

**Paso 2.** Si dice "connect ECONNREFUSED" a postgres, la DB no está lista:
```bash
docker compose restart backend
```

**Paso 3.** Si dice "relation does not exist":
```bash
# Aplicar esquemas faltantes (ver sección anterior)
docker exec -i fonzcontrol-db psql -U postgres -d doitv3 \
  < database/005_code_alignment.sql
docker compose restart backend
```

---

### Login dice "Credenciales inválidas"

La contraseña correcta es `Fonz2024!` (mayúscula F, números y signo).

Si los usuarios no existen, verificar que el seed corrió:
```bash
docker exec -it fonzcontrol-db psql -U postgres -d doitv3 \
  -c "SELECT email, role FROM users ORDER BY role;"
```

Si la tabla está vacía:
```bash
docker exec -it fonzcontrol-api node /app/database/seed_users.js
```

---

### PostgreSQL no arranca (instalación manual)

```bash
# Windows — iniciar servicio
Start-Service -Name postgresql*

# Linux
sudo systemctl start postgresql

# Verificar conexión
psql -U postgres -c "SELECT version();"
```

---

### El seed de usuarios falla

Los 5 SQLs deben haberse aplicado antes. Verificar:
```bash
psql -U postgres -d doitv3 -c "\dt"
```
Debe listar al menos 15 tablas. Si no, aplicar los esquemas primero.

---

## 8. Comandos de mantenimiento

### Reiniciar base de datos (borra todo)

```bash
# Con Docker
docker compose down -v
docker compose up --build

# Sin Docker
psql -U postgres -c "DROP DATABASE IF EXISTS doitv3;"
psql -U postgres -c "CREATE DATABASE doitv3;"
psql -U postgres -d doitv3 -f database/001_base_schema.sql
psql -U postgres -d doitv3 -f database/002_requests_schema.sql
psql -U postgres -d doitv3 -f database/003_analytics_schema.sql
psql -U postgres -d doitv3 -f database/004_notifications_schema.sql
psql -U postgres -d doitv3 -f database/005_code_alignment.sql
psql -U postgres -d doitv3 -f database/seed_catalog.sql
node database/seed_users.js
```

---

### Consultas de diagnóstico

```bash
# Entrar a la DB
docker exec -it fonzcontrol-db psql -U postgres -d doitv3

# Ver solicitudes recientes
SELECT folio, status, type, amount FROM spending_requests ORDER BY created_at DESC LIMIT 20;

# Ver solicitudes en revisión
SELECT r.folio, r.status, u.name AS validador
FROM spending_requests r
LEFT JOIN users u ON u.id = r.validator_id
WHERE r.status = 'EN_REVISION';

# Contar por estatus
SELECT status, COUNT(*) FROM spending_requests GROUP BY status ORDER BY status;

# Ver semáforo presupuestal
SELECT * FROM v_budget_consumption;

# Ver log de notificaciones recientes
SELECT event_key, channel, status, created_at
FROM notification_log
ORDER BY created_at DESC LIMIT 20;
```

---

### Cambiar contraseña de un usuario

**Paso 1.** Generar el hash:
```bash
node -e "const b=require('bcryptjs'); b.hash('NuevaPass123!',10).then(h=>console.log(h))"
```

**Paso 2.** Actualizar en la base de datos:
```bash
docker exec -it fonzcontrol-db psql -U postgres -d doitv3 -c \
  "UPDATE users SET password_hash='HASH_AQUI' WHERE email='usuario@fonz.mx';"
```

---

## 9. Estructura del proyecto

```
MSS_Doitv3/
├── INSTRUCTIVO.md
├── docker-compose.yml
│
├── database/
│   ├── 001_base_schema.sql          ← Usuarios, proyectos, catálogos, períodos
│   ├── 002_requests_schema.sql      ← Solicitudes, validación, bot WA
│   ├── 003_analytics_schema.sql     ← Presupuestos, ingresos, vistas BI
│   ├── 004_notifications_schema.sql ← Plantillas y log de notificaciones
│   ├── 005_code_alignment.sql       ← Columnas extra para alinear código y DB
│   ├── seed_catalog.sql             ← Catálogos iniciales
│   └── seed_users.js                ← 10 usuarios de prueba
│
├── backend/
│   ├── Dockerfile
│   ├── docker-entrypoint.sh         ← Espera DB, siembra usuarios, arranca app
│   ├── .env.docker                  ← Variables para Docker
│   ├── package.json
│   └── src/
│       ├── infrastructure/
│       │   ├── database/postgres.js
│       │   └── services/
│       │       ├── EmailService.js
│       │       ├── WhatsAppService.js
│       │       └── OcrService.js
│       ├── infrastructure/repositories/
│       │   ├── UserRepository.js
│       │   ├── RequestRepository.js
│       │   ├── NotificationRepository.js
│       │   └── AnalyticsRepository.js
│       ├── application/
│       │   ├── ValidationEngine.js
│       │   ├── NotificationService.js
│       │   ├── WhatsAppBot.js
│       │   └── CronJobs.js
│       └── presentation/
│           ├── app.js
│           ├── middlewares/
│           └── routes/
│
└── frontend/
    ├── index.html                   ← Login
    ├── nginx.conf                   ← Servidor nginx (Docker)
    ├── assets/
    │   └── js/
    │       ├── env.js               ← URL del API (punto de configuración único)
    │       ├── api.js               ← Cliente HTTP centralizado
    │       └── ui.js
    └── pages/
        ├── operative-dashboard.html
        ├── nueva-solicitud.html
        ├── mis-solicitudes.html
        ├── solicitud-detalle.html
        ├── validator-dashboard.html
        ├── admin-dashboard.html
        ├── buyer-dashboard.html
        ├── superadmin-dashboard.html
        ├── usuarios.html
        ├── reportes.html
        ├── presupuestos.html
        ├── pending-factura.html
        └── forgot-password.html
```
