# INSTRUCTIVO DE EJECUCIÓN — FonzControl doitv3 v2

**Sistema de Control de Gastos Operativos**
FONZ — Control de Gasto doitv3 v2

---

## Contenido

1. [Prerrequisitos](#1-prerrequisitos)
2. [Instalación paso a paso](#2-instalación-paso-a-paso)
3. [Cómo iniciar el sistema](#3-cómo-iniciar-el-sistema)
4. [Primer acceso y usuarios de prueba](#4-primer-acceso-y-usuarios-de-prueba)
5. [Guía de uso por rol](#5-guía-de-uso-por-rol)
6. [Flujo completo de una solicitud](#6-flujo-completo-de-una-solicitud)
7. [Bot de WhatsApp](#7-bot-de-whatsapp)
8. [Variables de entorno](#8-variables-de-entorno)
9. [Integraciones opcionales](#9-integraciones-opcionales)
10. [Solución de problemas frecuentes](#10-solución-de-problemas-frecuentes)
11. [Comandos de mantenimiento](#11-comandos-de-mantenimiento)
12. [Estructura del proyecto](#12-estructura-del-proyecto)

---

## 1. Prerrequisitos

Instalar antes de comenzar:

| Software | Versión mínima | Descarga |
|----------|---------------|----------|
| Node.js | 18 LTS | https://nodejs.org |
| PostgreSQL | 14 | https://www.postgresql.org/download/windows |

Verificar que estén instalados:

```powershell
node --version    # debe mostrar v18.x o superior
npm --version     # debe mostrar 9.x o superior
psql --version    # debe mostrar psql (PostgreSQL) 14.x o superior
```

---

## 2. Instalación paso a paso

> Ejecutar todos los comandos desde la carpeta raíz del proyecto:
> `C:\Users\samue\OneDrive\Documentos\proyects\doitv3`

### Paso 1 — Crear la base de datos

Abrir **PowerShell** o **CMD** y ejecutar:

```powershell
# Conectar a PostgreSQL y crear la base de datos
psql -U postgres -c "CREATE DATABASE doitv3;"
```

> Si pide contraseña, la predeterminada es `Admin1234` (o la que hayas configurado al instalar PostgreSQL).

### Paso 2 — Aplicar los esquemas (en orden estricto)

```powershell
psql -U postgres -d doitv3 -f database/001_base_schema.sql
psql -U postgres -d doitv3 -f database/002_requests_schema.sql
psql -U postgres -d doitv3 -f database/003_analytics_schema.sql
psql -U postgres -d doitv3 -f database/004_notifications_schema.sql
```

Cada comando debe terminar sin errores. Si aparece `ERROR:` en alguno, detente y revisa que el paso anterior haya corrido correctamente.

### Paso 3 — Cargar catálogos y usuarios de prueba

```powershell
# Cargar proyectos, categorías, conceptos y límites de gasto
psql -U postgres -d doitv3 -f database/seed_catalog.sql

# Crear los 10 usuarios de prueba (requiere Node.js)
node database/seed_users.js
```

El script de usuarios mostrará: `[SEED] 10 usuarios creados correctamente.`

### Paso 4 — Instalar dependencias del backend

```powershell
cd backend
npm install
```

Esto instala: Express, JWT, bcrypt, PostgreSQL driver, Multer, node-cron, Nodemailer, XLSX y más.

### Paso 5 — Configurar variables de entorno

```powershell
# Copiar el archivo de ejemplo
copy .env.example .env
```

Abrir `.env` y verificar/ajustar:

```env
# Base de datos — ajustar si tu contraseña de PostgreSQL es diferente
DB_HOST=localhost
DB_PORT=5432
DB_NAME=doitv3
DB_USER=postgres
DB_PASSWORD=Admin1234

# JWT — cambiar por una cadena larga y aleatoria en producción
JWT_SECRET=doitv3_super_secret_key_fonzcontrol_2024_cambia_esto

# Servidor
PORT=3000
CORS_ORIGIN=http://localhost:5500
```

> Las credenciales de WhatsApp, Email y Google Vision se pueden dejar vacías para desarrollo. El sistema usará modos de simulación automáticamente.

---

## 3. Cómo iniciar el sistema

Se necesitan **dos terminales** abiertas simultáneamente.

### Terminal 1 — Backend (API)

```powershell
cd C:\Users\samue\OneDrive\Documentos\proyects\doitv3\backend
node src/presentation/app.js
```

Debes ver:
```
[APP] FonzControl doitv3 corriendo en puerto 3000
[CRON] Jobs programados iniciados
```

Para desarrollo con recarga automática al guardar cambios:
```powershell
npx nodemon src/presentation/app.js
```

### Terminal 2 — Frontend (interfaz web)

**Opción A — VS Code Live Server** (recomendado):
1. Abrir la carpeta `frontend` en VS Code
2. Clic derecho en `index.html`
3. Seleccionar **"Open with Live Server"**
4. Se abre automáticamente en `http://localhost:5500`

**Opción B — Servidor Node simple:**
```powershell
cd C:\Users\samue\OneDrive\Documentos\proyects\doitv3
npx serve frontend -l 5500
```

**Opción C — Abrir directamente** (solo para pruebas rápidas):
Doble clic en `frontend/index.html` — funciona si el backend está en `localhost:3000`.

### Verificar que todo esté funcionando

Abrir en el navegador: `http://localhost:3000/health`

Debe responder:
```json
{ "status": "ok", "ts": "2025-01-01T00:00:00.000Z" }
```

---

## 4. Primer acceso y usuarios de prueba

Abrir `http://localhost:5500` en el navegador.

**Contraseña de todos los usuarios: `Fonz2024!`**

| Email | Rol | ¿Qué puede hacer? |
|-------|-----|--------------------|
| `superadmin@fonz.mx` | Superadmin | Acceso total al sistema |
| `director.ops@fonz.mx` | Validador | Aprueba solicitudes de VWP y ASJ |
| `director.compras@fonz.mx` | Validador | Aprueba solicitudes de SCHI y SCHP |
| `ceo@fonz.mx` | Validador | Recibe escalaciones de ambos directores |
| `anna@fonz.mx` | Administrativo | Ejecuta reembolsos, reportes, presupuestos |
| `irving@fonz.mx` | Buyer | Ejecuta compras, sube facturas |
| `pedro.op@fonz.mx` | Operativo | Solicitudes campo Puebla (VWP) |
| `maria.op@fonz.mx` | Operativo | Solicitudes campo Audi (ASJ) |
| `juan.op@fonz.mx` | Operativo | Solicitudes campo Schaeffler |
| `carlos.op@fonz.mx` | Operativo | Solicitudes campo general |

> Al iniciar sesión, el sistema redirige automáticamente al dashboard correspondiente al rol.

---

## 5. Guía de uso por rol

### Rol: Operativo (`operative`)

**Accede a:** Dashboard, Nueva Solicitud, Mis Solicitudes

#### Crear una solicitud de gasto

1. Ir a **"Nueva Solicitud"**
2. Seleccionar tipo: **Reembolso** (ya gasté) o **Requisición** (necesito comprar)
3. Si no tienes factura, activar **"Sin factura"** — requiere justificación de mínimo 20 caracteres
4. Seleccionar **Proyecto**, **Categoría** y **Concepto**
5. Capturar el **monto** y la **moneda** (MXN o USD con tipo de cambio)
6. Subir **foto o PDF del comprobante** (arrastrando o haciendo clic)
7. Agregar **observaciones** opcionales
8. Clic en **"Enviar Solicitud"**

El sistema ejecuta automáticamente la validación. Si pasa, la solicitud queda "En Revisión" esperando al validador.

#### Seguimiento

- En **"Mis Solicitudes"** puedes filtrar por estado
- Si una solicitud fue rechazada (no definitivamente), puedes corregirla y reenviarla desde el detalle

---

### Rol: Validador (`validator`)

**Accede a:** Dashboard con lista de solicitudes asignadas

#### Aprobar una solicitud

1. En el dashboard, las solicitudes se muestran ordenadas por antigüedad
2. Solicitudes con fondo naranja llevan más de 2 días esperando
3. Clic en **"Revisar"** para ver el detalle completo:
   - Datos del solicitante y proyecto
   - Datos extraídos del comprobante por OCR (RFC, UUID CFDI, montos)
   - Alertas activas: posible duplicado, anomalía ML, excede límite
   - Historial de validación automática paso a paso
4. Clic en **"Aprobar"** o **"Rechazar"**
   - Al rechazar: el motivo es obligatorio (mínimo 10 caracteres)
   - Marcar **"Rechazo definitivo"** si no se debe permitir reenvío
5. El solicitante recibe notificación automática

#### Escalación automática

- A las **24 horas** sin revisión: el validador recibe un recordatorio
- A las **48 horas** sin revisión: la solicitud escala automáticamente al CEO

---

### Rol: Administrativo — Anna (`administrativo`)

**Accede a:** Dashboard, Reembolsos pendientes, Reportes, Presupuestos

#### Pagar un reembolso

1. En el dashboard, sección **"Reembolsos Aprobados — Pendientes de Pago"**
2. Clic en **"Pagar"**
3. Seleccionar método de pago y agregar referencia
4. Confirmar — el solicitante recibe notificación

#### Exportar reporte para Compac

1. Ir a **"Reportes"**
2. Aplicar filtros (proyecto, período, estado)
3. Clic en **"Exportar Excel (Compac)"**
4. Se descarga un `.xlsx` con todas las columnas requeridas por Compac

#### Registrar ingresos mensuales (para dashboard de utilidad)

1. Ir a **"Presupuestos"**
2. Sección **"Registrar Ingreso Mensual"**
3. Capturar proyecto, año, mes e importe
4. El dashboard de utilidad se actualiza automáticamente

---

### Rol: Comprador — Irving (`buyer`)

**Accede a:** Dashboard, Compras pendientes, Facturas pendientes

#### Ejecutar una compra

1. Dashboard → sección **"Requisiciones Aprobadas — Pendientes de Compra"**
2. Clic en **"Ejecutar"**
3. Ingresar método de pago, referencia y notas
4. Confirmar — la solicitud pasa a estado **"Comprado - Pendiente Factura"**

#### Subir factura del proveedor

1. Ir a **"Pte. Factura"**
2. Las solicitudes en rojo llevan más de 5 días sin factura
3. Clic en **"Subir factura"**
4. Seleccionar el PDF o XML del CFDI
5. Al subir, la solicitud pasa automáticamente a **"Pagado"**

> El sistema envía recordatorios diarios automáticos al proveedor si se configuró su email.

---

### Rol: Superadmin (`superadmin`)

**Accede a:** Todo el sistema

#### Gestión de usuarios

1. Ir a **"Usuarios"**
2. Clic en **"Nuevo Usuario"** para crear
3. Asignar nombre, email, rol, teléfono y canal de notificación
4. La contraseña inicial se puede restablecer desde el panel

#### Configurar presupuestos

1. Ir a **"Presupuestos"**
2. Sección inferior: configurar presupuesto por proyecto + categoría + mes
3. Ajustar umbrales: amarillo (default 70%) y rojo (default 90%)
4. El semáforo del dashboard se actualiza en tiempo real

#### Gestionar catálogos

Desde **"Catálogos"** (admin panel):
- Proyectos: agregar, editar, activar/desactivar
- Categorías y Conceptos: CRUD completo
- Reglas de enrutamiento: a qué validador va cada tipo de solicitud
- Límites de gasto: monto máximo por concepto/rol con acción al exceder (bloquear o escalar)
- Períodos contables: abrir y cerrar períodos mensuales

---

## 6. Flujo completo de una solicitud

```
OPERATIVO crea solicitud
    │
    ▼
[Validación automática — 7 pasos]
    │
    ├─ FALLA → Rechazado automáticamente (notificación al operativo)
    │
    └─ PASA → EN REVISIÓN (asignada al validador según reglas)
                │
                ├─ Recordatorio a 24h si no se revisa
                ├─ Escalación a CEO a 48h si no se revisa
                │
                ├─ VALIDADOR RECHAZA
                │       │
                │       └─ Operativo puede corregir y reenviar
                │           (salvo rechazo definitivo)
                │
                └─ VALIDADOR APRUEBA
                        │
                        ├─ REEMBOLSO → Anna paga → PAGADO
                        │
                        └─ REQUISICIÓN → Irving compra → COMPRADO PENDIENTE FACTURA
                                                │
                                                └─ Irving sube CFDI → PAGADO
                                                                │
                                                                └─ Almacén confirma → CERRADO
```

---

## 7. Bot de WhatsApp

Disponible para operativos en campo. Permite crear solicitudes sin entrar a la web.

### Comandos disponibles

| Mensaje | Respuesta |
|---------|-----------|
| `hola` / `inicio` | Muestra opciones disponibles |
| `SIN FACTURA` | Inicia flujo sin comprobante fiscal |
| Foto / PDF | Inicia flujo normal con OCR automático |

### Flujo del bot

```
1. Enviar foto del comprobante (o escribir "SIN FACTURA")
2. Seleccionar proyecto → botones
3. Seleccionar tipo (Reembolso / Requisición) → botones
4. Escribir observaciones (mínimo 20 caracteres)
5. Confirmar o cancelar → botones
```

La conversación expira tras **30 minutos** de inactividad.

> En modo desarrollo (sin credenciales Meta), los mensajes se imprimen en la consola del backend.

---

## 8. Variables de entorno

Archivo: `backend/.env`

```env
# ── BASE DE DATOS ──────────────────────────────────────
DB_HOST=localhost
DB_PORT=5432
DB_NAME=doitv3
DB_USER=postgres
DB_PASSWORD=Admin1234

# ── JWT ────────────────────────────────────────────────
JWT_SECRET=cambia_esto_por_cadena_larga_minimo_32_chars
JWT_EXPIRES_IN=8h

# ── SERVIDOR ───────────────────────────────────────────
PORT=3000
CORS_ORIGIN=http://localhost:5500

# ── EMAIL (dejar vacío = imprime en consola) ───────────
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=
EMAIL_PASS=
EMAIL_FROM=FonzControl <noreply@fonz.mx>

# ── WHATSAPP (dejar vacío = imprime en consola) ────────
WA_PHONE_ID=
WA_ACCESS_TOKEN=
WA_VERIFY_TOKEN=fonzcontrol_webhook_verify_2024

# ── OCR (dejar vacío = datos mock de prueba) ───────────
GOOGLE_VISION_API_KEY=

# ── ARCHIVOS ───────────────────────────────────────────
UPLOADS_DIR=./uploads
MAX_FILE_SIZE_MB=10

# ── URLS PÚBLICAS ──────────────────────────────────────
APP_URL=http://localhost:5500
API_URL=http://localhost:3000
```

---

## 9. Integraciones opcionales

### Email (Gmail)

1. Activar **verificación en 2 pasos** en tu cuenta Gmail
2. Ir a → Cuenta → Seguridad → **Contraseñas de aplicación**
3. Crear contraseña para "Correo" en "Windows"
4. Copiar la clave de 16 caracteres al `.env`:

```env
EMAIL_USER=tu-correo@gmail.com
EMAIL_PASS=abcd efgh ijkl mnop
```

### WhatsApp Business (Meta Cloud API)

1. Ir a [developers.facebook.com](https://developers.facebook.com)
2. Crear aplicación tipo **Business**
3. Agregar producto **WhatsApp**
4. En "Configuración de API" copiar:
   - **Phone number ID** → `WA_PHONE_ID`
   - **Token de acceso temporal** (o generar token permanente) → `WA_ACCESS_TOKEN`
5. Configurar webhook:
   - URL: `https://tu-dominio.com/api/whatsapp/webhook`
   - Verify token: el valor de `WA_VERIFY_TOKEN`
   - Campo suscrito: `messages`

### OCR — Google Cloud Vision

1. Ir a [console.cloud.google.com](https://console.cloud.google.com)
2. Crear proyecto → habilitar **Cloud Vision API**
3. Credenciales → **Crear clave de API**
4. Copiar al `.env`:

```env
GOOGLE_VISION_API_KEY=AIzaSy...
```

> Sin esta clave el sistema genera datos CFDI simulados (ideal para desarrollo y pruebas).

---

## 10. Solución de problemas frecuentes

### "Error: connect ECONNREFUSED 127.0.0.1:5432"

PostgreSQL no está corriendo. Iniciar el servicio:

```powershell
# En Windows (desde Services o PowerShell como administrador)
Start-Service -Name postgresql*

# Verificar que corre
psql -U postgres -c "SELECT version();"
```

### "relation does not exist" al acceder al sistema

Los esquemas no se aplicaron. Repetir el Paso 2 de instalación. Verificar que la base de datos se llame exactamente `doitv3`.

### El frontend no conecta con el backend (error de CORS)

Asegurarse de que `CORS_ORIGIN` en `.env` coincida exactamente con la URL del frontend:

```env
# Si usas Live Server en puerto 5500:
CORS_ORIGIN=http://localhost:5500

# Si abres el archivo directamente:
CORS_ORIGIN=*
```

Reiniciar el backend después de cambiar el `.env`.

### "Invalid token" al iniciar sesión

El `JWT_SECRET` en `.env` no puede estar vacío. Si se cambió el secret después de crear tokens, los existentes dejan de funcionar — es normal, basta con volver a iniciar sesión.

### La foto del comprobante no sube

1. Verificar que existe la carpeta `backend/uploads/` (se crea automáticamente, pero si se borró hay que recrearla)
2. El archivo no debe superar el límite: `MAX_FILE_SIZE_MB=10`
3. Extensiones permitidas: `.jpg`, `.jpeg`, `.png`, `.pdf`, `.heic`, `.webp`

### El seed de usuarios falla

Asegurarse de que los 4 SQLs se aplicaron antes de correr `node database/seed_users.js`. El script necesita las tablas `users` y `user_projects`.

```powershell
# Verificar que la tabla existe
psql -U postgres -d doitv3 -c "\dt users"
```

---

## 11. Comandos de mantenimiento

### Reiniciar la base de datos (⚠️ borra todos los datos)

```powershell
psql -U postgres -c "DROP DATABASE IF EXISTS doitv3;"
psql -U postgres -c "CREATE DATABASE doitv3;"
psql -U postgres -d doitv3 -f database/001_base_schema.sql
psql -U postgres -d doitv3 -f database/002_requests_schema.sql
psql -U postgres -d doitv3 -f database/003_analytics_schema.sql
psql -U postgres -d doitv3 -f database/004_notifications_schema.sql
psql -U postgres -d doitv3 -f database/seed_catalog.sql
node database/seed_users.js
```

### Consultas de diagnóstico

```powershell
# Ver todas las solicitudes activas
psql -U postgres -d doitv3 -c "SELECT folio, status, type FROM spending_requests ORDER BY created_at DESC LIMIT 20;"

# Ver solicitudes en revisión con validador asignado
psql -U postgres -d doitv3 -c "SELECT r.folio, r.status, u.name as validador FROM spending_requests r LEFT JOIN users u ON u.id=r.validator_id WHERE r.status='EN_REVISION';"

# Ver semáforo presupuestal
psql -U postgres -d doitv3 -c "SELECT * FROM v_budget_consumption;"

# Ver utilidad por proyecto
psql -U postgres -d doitv3 -c "SELECT * FROM v_project_utility;"

# Ver log de notificaciones recientes
psql -U postgres -d doitv3 -c "SELECT event_id, channel, status, created_at FROM notification_log ORDER BY created_at DESC LIMIT 20;"

# Contar por estatus
psql -U postgres -d doitv3 -c "SELECT status, COUNT(*) FROM spending_requests GROUP BY status ORDER BY status;"
```

### Cambiar contraseña de un usuario desde la base de datos

```powershell
# Primero generar el hash desde Node.js
node -e "const b=require('bcryptjs');b.hash('NuevaPass123!',10).then(h=>console.log(h))"

# Copiar el hash y actualizar:
psql -U postgres -d doitv3 -c "UPDATE users SET password_hash='HASH_AQUI' WHERE email='usuario@fonz.mx';"
```

---

## 12. Estructura del proyecto

```
doitv3/
├── INSTRUCTIVO.md                       ← Este archivo
│
├── database/
│   ├── 001_base_schema.sql              ← Usuarios, proyectos, catálogos, períodos
│   ├── 002_requests_schema.sql          ← Solicitudes, validación, bot WA
│   ├── 003_analytics_schema.sql         ← Presupuestos, ingresos, vistas BI
│   ├── 004_notifications_schema.sql     ← Plantillas y log de notificaciones
│   ├── seed_catalog.sql                 ← Datos iniciales: proyectos y catálogos
│   └── seed_users.js                    ← 10 usuarios de prueba
│
├── backend/
│   ├── .env                             ← Variables de entorno (NO subir a git)
│   ├── .env.example                     ← Plantilla de configuración
│   ├── package.json
│   └── src/
│       ├── infrastructure/
│       │   ├── database/postgres.js     ← Pool de conexiones PostgreSQL
│       │   └── services/
│       │       ├── EmailService.js      ← Nodemailer / fallback consola
│       │       ├── WhatsAppService.js   ← Meta Cloud API / fallback consola
│       │       └── OcrService.js        ← Google Vision / mock CFDI
│       ├── infrastructure/repositories/
│       │   ├── UserRepository.js        ← CRUD usuarios y proyectos
│       │   ├── RequestRepository.js     ← Solicitudes, validación, aprobación
│       │   ├── NotificationRepository.js← Plantillas, log, recordatorios
│       │   └── AnalyticsRepository.js  ← Presupuestos, ingresos, reportes
│       ├── application/
│       │   ├── ValidationEngine.js      ← Pipeline 7 pasos automático
│       │   ├── NotificationService.js   ← Envío de notificaciones por evento
│       │   ├── WhatsAppBot.js           ← Máquina de estados del bot
│       │   └── CronJobs.js              ← Recordatorios, escalaciones, limpieza
│       └── presentation/
│           ├── app.js                   ← Punto de entrada del servidor
│           ├── middlewares/
│           │   ├── auth.middleware.js   ← Verificación JWT
│           │   └── upload.middleware.js ← Multer para archivos
│           └── routes/
│               ├── auth.routes.js       ← Login, recuperar contraseña
│               ├── requests.routes.js   ← CRUD solicitudes + OCR
│               ├── approval.routes.js   ← Aprobar, rechazar, escalar
│               ├── payments.routes.js   ← Pagar, facturas, almacén
│               ├── analytics.routes.js  ← Dashboard, reportes, Excel
│               ├── admin.routes.js      ← Usuarios, proyectos, catálogos
│               └── whatsapp.routes.js   ← Webhook Meta
│
└── frontend/
    ├── index.html                       ← Login → redirige por rol
    ├── assets/
    │   ├── css/main.css                 ← Estilos globales
    │   └── js/
    │       ├── api.js                   ← Cliente HTTP centralizado
    │       └── ui.js                    ← Helpers de interfaz
    └── pages/
        ├── operative-dashboard.html     ← Dashboard operativo
        ├── nueva-solicitud.html         ← Crear solicitud + upload + OCR
        ├── mis-solicitudes.html         ← Lista con filtros rápidos
        ├── solicitud-detalle.html       ← Detalle + aprobar/rechazar
        ├── validator-dashboard.html     ← Cola de aprobación
        ├── admin-dashboard.html         ← Reembolsos + utilidad
        ├── buyer-dashboard.html         ← Compras + facturas
        ├── superadmin-dashboard.html    ← Vista global + semáforo
        ├── usuarios.html                ← CRUD usuarios
        ├── reportes.html                ← Reportes + exportar Excel
        ├── presupuestos.html            ← Presupuestos + ingresos
        ├── pending-factura.html         ← Subir CFDI de proveedor
        └── forgot-password.html         ← Recuperar contraseña
```

---

## Resumen rápido de inicio (checklist)

- [ ] PostgreSQL corriendo
- [ ] Base de datos `doitv3` creada
- [ ] 4 archivos SQL aplicados en orden
- [ ] `seed_catalog.sql` cargado
- [ ] `node database/seed_users.js` ejecutado
- [ ] `backend/.env` configurado con datos de DB correctos
- [ ] `npm install` en carpeta `backend`
- [ ] Backend corriendo: `node src/presentation/app.js`
- [ ] Frontend abierto en navegador
- [ ] Login con `superadmin@fonz.mx` / `Fonz2024!`
