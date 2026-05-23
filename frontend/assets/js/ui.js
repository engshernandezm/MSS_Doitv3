// Helpers de UI reutilizables para FonzControl doitv3

const UI = (() => {

  // Toast notifications
  let toastEl = null;
  function toast(msg, type = 'info', duration = 3500) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.style.cssText = `
        position:fixed;bottom:24px;right:24px;z-index:9999;
        display:flex;flex-direction:column;gap:8px;`;
      document.body.appendChild(toastEl);
    }
    const colors = { info:'#1d4ed8', success:'#059669', warning:'#d97706', error:'#dc2626' };
    const t = document.createElement('div');
    t.style.cssText = `
      background:${colors[type]||colors.info};color:#fff;
      padding:10px 16px;border-radius:8px;font-size:13px;
      box-shadow:0 4px 12px rgba(0,0,0,.2);max-width:320px;
      animation:slideIn .2s ease;`;
    t.textContent = msg;
    toastEl.appendChild(t);
    setTimeout(() => t.remove(), duration);
  }

  // Formatea fecha
  function fmt(dateStr, withTime = false) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d)) return '—';
    const date = d.toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' });
    if (!withTime) return date;
    return `${date} ${d.toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' })}`;
  }

  // Formatea moneda
  function money(val, currency = 'MXN') {
    if (val == null || val === '') return '—';
    return new Intl.NumberFormat('es-MX', { style:'currency', currency }).format(val);
  }

  // Badge de estatus
  function statusBadge(status) {
    const labels = {
      BORRADOR: 'Borrador', PENDIENTE: 'Pendiente',
      EN_REVISION: 'En revisión', APROBADO: 'Aprobado',
      RECHAZADO: 'Rechazado', PAGADO: 'Pagado',
      CERRADO: 'Cerrado', CANCELADO: 'Cancelado',
      COMPRADO_PENDIENTE_FACTURA: 'Pte. Factura',
    };
    return `<span class="badge-status badge-${status}">${labels[status] || status}</span>`;
  }

  // Semáforo presupuesto
  function semaforo(tipo) {
    return `<span class="semaforo ${tipo}" title="${tipo}"></span>`;
  }

  // Flags de alertas
  function alertFlags(row) {
    const flags = [];
    if (row.possible_duplicate) flags.push('<span class="flag-icon" title="Posible duplicado">⚠️ Dup</span>');
    if (row.anomaly_ml)         flags.push('<span class="flag-icon" title="Anomalía detectada">🔍 ML</span>');
    if (row.exceeds_limit)      flags.push('<span class="flag-icon" title="Excede límite">🚫 Límite</span>');
    if (row.sin_factura)        flags.push('<span class="badge-status badge-sin-factura">SIN FACT.</span>');
    return flags.join(' ');
  }

  // Confirmar acción destructiva
  function confirm(msg) {
    return window.confirm(msg);
  }

  // Spinner en botón
  function loading(btn, on = true) {
    if (!btn) return;
    if (on) {
      btn._original = btn.innerHTML;
      btn.disabled  = true;
      btn.innerHTML = '<span class="spin">⟳</span> Procesando...';
    } else {
      btn.disabled  = false;
      btn.innerHTML = btn._original || btn.innerHTML;
    }
  }

  // Renderizar sidebar según rol
  function renderSidebar(role) {
    const user = API.user();
    const navLinks = {
      operative: [
        { href: '/pages/operative-dashboard.html',  icon: '🏠', label: 'Dashboard' },
        { href: '/pages/nueva-solicitud.html',       icon: '➕', label: 'Nueva Solicitud' },
        { href: '/pages/mis-solicitudes.html',       icon: '📋', label: 'Mis Solicitudes' },
      ],
      validator: [
        { href: '/pages/validator-dashboard.html',  icon: '🏠', label: 'Dashboard' },
        { href: '/pages/pending-approval.html',     icon: '📋', label: 'Por Aprobar' },
      ],
      administrativo: [
        { href: '/pages/admin-dashboard.html',      icon: '🏠', label: 'Dashboard' },
        { href: '/pages/reembolsos.html',           icon: '💵', label: 'Reembolsos' },
        { href: '/pages/reportes.html',             icon: '📊', label: 'Reportes' },
        { href: '/pages/presupuestos.html',         icon: '💰', label: 'Presupuestos' },
      ],
      buyer: [
        { href: '/pages/buyer-dashboard.html',      icon: '🏠', label: 'Dashboard' },
        { href: '/pages/compras.html',              icon: '🛒', label: 'Compras' },
        { href: '/pages/pending-factura.html',      icon: '🧾', label: 'Pte. Factura' },
      ],
      superadmin: [
        { href: '/pages/superadmin-dashboard.html', icon: '🏠', label: 'Dashboard' },
        { href: '/pages/solicitudes-admin.html',    icon: '📋', label: 'Solicitudes' },
        { href: '/pages/usuarios.html',             icon: '👥', label: 'Usuarios' },
        { href: '/pages/proyectos.html',            icon: '🏗️', label: 'Proyectos' },
        { href: '/pages/catalogos.html',            icon: '📁', label: 'Catálogos' },
        { href: '/pages/presupuestos.html',         icon: '💰', label: 'Presupuestos' },
        { href: '/pages/reportes.html',             icon: '📊', label: 'Reportes' },
        { href: '/pages/configuracion.html',        icon: '⚙️', label: 'Configuración' },
      ],
    };

    const links = navLinks[role] || navLinks.operative;
    const currentPage = location.pathname.split('/').pop();

    const nav = links.map(l => {
      const active = l.href.includes(currentPage) ? 'active' : '';
      return `<a href="${l.href}" class="${active}">${l.icon} ${l.label}</a>`;
    }).join('');

    return `
      <div class="sidebar-logo">
        <h1>FonzControl</h1>
        <span>Control de Gastos v3</span>
      </div>
      <nav class="sidebar-nav">${nav}</nav>
      <div class="sidebar-footer">
        <strong>${user?.name || ''}</strong>
        <span>${user?.role || ''}</span>
        <a href="#" onclick="API.clearSession();location.href='/index.html'" style="color:#ef4444;display:block;margin-top:8px;font-size:12px;">Cerrar sesión</a>
      </div>`;
  }

  // Guard de autenticación + rol
  function guard(allowedRoles) {
    if (!API.isLoggedIn()) { location.href = '/index.html'; return false; }
    const user = API.user();
    if (allowedRoles && !allowedRoles.includes(user?.role)) {
      location.href = '/index.html';
      return false;
    }
    return user;
  }

  // Poblar select con opciones
  function populateSelect(select, items, valueKey, labelKey, placeholder = 'Selecciona...') {
    select.innerHTML = `<option value="">— ${placeholder} —</option>` +
      items.map(i => `<option value="${i[valueKey]}">${i[labelKey]}</option>`).join('');
  }

  // Leer FormData como objeto
  function formToObj(form) {
    return Object.fromEntries(new FormData(form));
  }

  return { toast, fmt, money, statusBadge, semaforo, alertFlags, confirm, loading, renderSidebar, guard, populateSelect, formToObj };
})();

// Inyectar estilos de animación una vez
const style = document.createElement('style');
style.textContent = '@keyframes slideIn{from{transform:translateX(20px);opacity:0}to{transform:translateX(0);opacity:1}}';
document.head.appendChild(style);
