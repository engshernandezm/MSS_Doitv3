// Cliente API centralizado para FonzControl doitv3

const API = (() => {
  const BASE = window.API_URL || 'http://localhost:3000';

  function token() { return localStorage.getItem('fc_token'); }
  function user()  { return JSON.parse(localStorage.getItem('fc_user') || 'null'); }

  function headers(extra = {}) {
    const h = { 'Content-Type': 'application/json', ...extra };
    if (token()) h['Authorization'] = `Bearer ${token()}`;
    return h;
  }

  async function request(method, path, body, isFormData = false) {
    const opts = { method, headers: headers(isFormData ? {} : {}) };
    if (isFormData) {
      // FormData: quitar Content-Type para que el browser lo ponga con boundary
      delete opts.headers['Content-Type'];
      opts.headers['Authorization'] = `Bearer ${token()}`;
      opts.body = body;
    } else if (body) {
      opts.body = JSON.stringify(body);
    }

    const res = await fetch(`${BASE}${path}`, opts);

    if (res.status === 401) {
      localStorage.clear();
      location.href = '/index.html';
      return;
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw { status: res.status, ...data };
    return data;
  }

  return {
    get:    (path) => request('GET', path),
    post:   (path, body) => request('POST', path, body),
    patch:  (path, body) => request('PATCH', path, body),
    del:    (path) => request('DELETE', path),
    upload: (path, formData) => request('POST', path, formData, true),

    auth: {
      login:          (email, password) => request('POST', '/api/auth/login', { email, password }),
      me:             () => request('GET', '/api/auth/me'),
      forgotPassword: (email) => request('POST', '/api/auth/forgot-password', { email }),
      resetPassword:  (token, password) => request('POST', '/api/auth/reset-password', { token, password }),
      changePassword: (current, next) => request('POST', '/api/auth/change-password', { current_password: current, new_password: next }),
    },

    requests: {
      list:      (params = {}) => request('GET', '/api/requests?' + new URLSearchParams(params)),
      get:       (id) => request('GET', `/api/requests/${id}`),
      create:    (fd) => request('POST', '/api/requests', fd, true),
      resubmit:  (id, fd) => request('POST', `/api/requests/${id}/resubmit`, fd, true),
      timeline:  (id) => request('GET', `/api/requests/${id}/timeline`),
    },

    approval: {
      pending:  () => request('GET', '/api/approval/pending'),
      approve:  (id, comment) => request('POST', `/api/approval/${id}/approve`, { comment }),
      reject:   (id, reason, definitive) => request('POST', `/api/approval/${id}/reject`, { reason, definitive }),
      escalate: (id, to_validator_id, comment) => request('POST', `/api/approval/${id}/escalate`, { to_validator_id, comment }),
    },

    payments: {
      pending:        () => request('GET', '/api/payments/pending'),
      pendingFactura: () => request('GET', '/api/payments/pending-factura'),
      execute:        (id, body) => request('POST', `/api/payments/${id}/execute`, body),
      attachFactura:  (id, fd) => request('POST', `/api/payments/${id}/attach-factura`, fd, true),
      warehouse:      (id, body) => request('POST', `/api/payments/${id}/warehouse-receipt`, body),
    },

    analytics: {
      dashboard:  (project_id) => request('GET', `/api/analytics/dashboard${project_id ? '?project_id=' + project_id : ''}`),
      budgets:    (params) => request('GET', '/api/analytics/budgets?' + new URLSearchParams(params)),
      utility:    (params) => request('GET', '/api/analytics/utility?' + new URLSearchParams(params)),
      income:     (body) => request('POST', '/api/analytics/income', body),
      report:     (params) => request('GET', '/api/analytics/report?' + new URLSearchParams(params)),
      excelUrl:   (params) => `${BASE}/api/analytics/report/excel?${new URLSearchParams(params)}&_token=${token()}`,
    },

    admin: {
      users:           () => request('GET', '/api/admin/users'),
      createUser:      (body) => request('POST', '/api/admin/users', body),
      updateUser:      (id, body) => request('PATCH', `/api/admin/users/${id}`, body),
      resetPassword:   (id, password) => request('POST', `/api/admin/users/${id}/reset-password`, { password }),
      assignProject:   (uid, pid) => request('POST', `/api/admin/users/${uid}/projects`, { project_id: pid }),
      removeProject:   (uid, pid) => request('DELETE', `/api/admin/users/${uid}/projects/${pid}`),

      projects:        () => request('GET', '/api/admin/projects'),
      createProject:   (body) => request('POST', '/api/admin/projects', body),
      updateProject:   (id, body) => request('PATCH', `/api/admin/projects/${id}`, body),

      categories:      () => request('GET', '/api/admin/categories'),
      concepts:        (cat) => request('GET', `/api/admin/concepts${cat ? '?category_id=' + cat : ''}`),
      routingRules:    () => request('GET', '/api/admin/routing-rules'),
      createRule:      (body) => request('POST', '/api/admin/routing-rules', body),
      periods:         () => request('GET', '/api/admin/periods'),
      savePeriod:      (body) => request('POST', '/api/admin/periods', body),
      spendingLimits:  () => request('GET', '/api/admin/spending-limits'),
      saveLimit:       (body) => request('POST', '/api/admin/spending-limits', body),
    },

    // helpers
    user, token,

    saveSession(data) {
      localStorage.setItem('fc_token', data.token);
      localStorage.setItem('fc_user',  JSON.stringify(data.user));
    },
    clearSession() { localStorage.removeItem('fc_token'); localStorage.removeItem('fc_user'); },
    isLoggedIn()   { return !!token(); },
  };
})();
