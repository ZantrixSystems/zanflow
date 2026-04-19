/**
 * API client.
 *
 * The frontend is served from the same Worker as the API,
 * so all requests use relative /api/* paths.
 */

const TENANT_SLUG = import.meta.env.VITE_TENANT_SLUG || '';

function isLiveTenantHost() {
  const hostname = window.location.hostname.toLowerCase();
  return hostname.endsWith('.zanflo.com')
    && hostname !== 'platform.zanflo.com'
    && hostname !== 'zanflo.com'
    && hostname !== 'www.zanflo.com';
}

async function request(method, path, body, options = {}) {
  const { includeTenantHeader = true } = options;
  const opts = {
    method,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (includeTenantHeader && TENANT_SLUG && !isLiveTenantHost()) {
    opts.headers['X-Tenant-Slug'] = TENANT_SLUG;
  }

  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(path, opts);

  let data;
  try {
    data = await res.json();
  } catch {
    data = {};
  }

  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

export const api = {
  platformSignup: (body) => request('POST', '/api/platform/signup', body, { includeTenantHeader: false }),
  register: (body) => request('POST', '/api/applicant/register', body),
  login: (body) => request('POST', '/api/applicant/login', body),
  logout: () => request('POST', '/api/applicant/logout'),
  me: () => request('GET', '/api/applicant/me'),
  getTenantPublicConfig: () => request('GET', '/api/tenant/public-config'),

  getApplicationTypes: () => request('GET', '/api/application-types'),
  listPremises: () => request('GET', '/api/premises'),
  getPremises: (id) => request('GET', `/api/premises/${id}`),
  createPremises: (body) => request('POST', '/api/premises', body),
  updatePremises: (id, body) => request('PUT', `/api/premises/${id}`, body),
  deletePremises: (id) => request('DELETE', `/api/premises/${id}`),
  submitPremisesVerification: (id, body = {}) => request('POST', `/api/premises/${id}/submit-verification`, body),

  listAdminPremisesVerifications: (params = {}) => {
    const search = new URLSearchParams();
    if (params.state) search.set('state', params.state);
    const suffix = search.toString() ? `?${search.toString()}` : '';
    return request('GET', `/api/admin/premises-verifications${suffix}`);
  },
  getAdminPremisesVerification: (id) => request('GET', `/api/admin/premises-verifications/${id}`),
  decideAdminPremisesVerification: (id, body) => request('POST', `/api/admin/premises-verifications/${id}/decision`, body),

  listAdminApplicationTypes: () => request('GET', '/api/admin/application-types'),
  publishAdminApplicationType: (applicationTypeId, body = {}) => request('POST', `/api/admin/application-types/${applicationTypeId}/publish`, body),
  retireAdminApplicationTypeVersion: (versionId) => request('POST', `/api/admin/application-types/${versionId}/retire`),

  createApplication: (body) => request('POST', '/api/applications', body),
  listApplications: () => request('GET', '/api/applications'),
  getApplication: (id) => request('GET', `/api/applications/${id}`),
  updateApplication: (id, body) => request('PUT', `/api/applications/${id}`, body),
  submitApplication: (id) => request('POST', `/api/applications/${id}/submit`),
  deleteApplication: (id) => request('DELETE', `/api/applications/${id}`),

  listAdminCases: (params = {}) => {
    const search = new URLSearchParams();
    if (params.status)      search.set('status', params.status);
    if (params.assigned)    search.set('assigned', params.assigned);
    if (params.case_type)   search.set('case_type', params.case_type);
    if (params.type)        search.set('type', params.type);
    if (params.created_days) search.set('created_days', params.created_days);
    if (params.sort)        search.set('sort', params.sort);
    const suffix = search.toString() ? `?${search.toString()}` : '';
    return request('GET', `/api/admin/cases${suffix}`);
  },
  getAdminCaseStats: () => request('GET', '/api/admin/cases/stats'),
  listAdminSavedFilters: () => request('GET', '/api/admin/saved-filters'),
  createAdminSavedFilter: (body) => request('POST', '/api/admin/saved-filters', body),
  updateAdminSavedFilter: (id, body) => request('PUT', `/api/admin/saved-filters/${id}`, body),
  deleteAdminSavedFilter: (id) => request('DELETE', `/api/admin/saved-filters/${id}`),

  listAdminApplications: (params = {}) => {
    const search = new URLSearchParams();
    if (params.status) search.set('status', params.status);
    if (params.assigned) search.set('assigned', params.assigned);
    if (params.type) search.set('type', params.type);
    if (params.sort) search.set('sort', params.sort);
    const suffix = search.toString() ? `?${search.toString()}` : '';
    return request('GET', `/api/admin/applications${suffix}`);
  },
  getAdminApplication: (id) => request('GET', `/api/admin/applications/${id}`),
  assignAdminApplication: (id, body) => request('POST', `/api/admin/applications/${id}/assign`, body),
  requestAdminApplicationInformation: (id, body) => request('POST', `/api/admin/applications/${id}/request-information`, body),
  decideAdminApplication: (id, body) => request('POST', `/api/admin/applications/${id}/decision`, body),
  listAdminUsers: () => request('GET', '/api/admin/users'),
  createAdminUser: (body) => request('POST', '/api/admin/users', body),
  updateAdminUser: (id, body) => request('PUT', `/api/admin/users/${id}`, body),
  getAdminSettings: () => request('GET', '/api/admin/settings'),
  getAdminOnboarding: () => request('GET', '/api/admin/onboarding'),
  getAdminQueueStats: () => request('GET', '/api/admin/queue-stats'),
  updateAdminSettings: (body) => request('PUT', '/api/admin/settings', body),
  getAdminApplicationSetup: () => request('GET', '/api/admin/application-setup'),
  updateAdminApplicationSetup: (body) => request('PUT', '/api/admin/application-setup', body),
  getAdminAudit: () => request('GET', '/api/admin/audit'),

  listAdminNotifications: () => request('GET', '/api/admin/notifications'),
  markAdminNotificationRead: (id) => request('POST', `/api/admin/notifications/${id}/read`),
  markAllAdminNotificationsRead: () => request('POST', '/api/admin/notifications/read-all'),

  staffLogin: (body) => request('POST', '/api/staff/login', body),
  staffBootstrapExchange: (body) => request('POST', '/api/staff/bootstrap-exchange', body),
  staffLogout: () => request('POST', '/api/staff/logout'),
  staffMe: () => request('GET', '/api/staff/me'),
  getStaffProfile: () => request('GET', '/api/staff/profile'),
  updateStaffProfile: (body) => request('PUT', '/api/staff/profile', body),

  platformLogin: (body) => request('POST', '/api/platform/login', body, { includeTenantHeader: false }),
  platformLogout: () => request('POST', '/api/platform/logout', undefined, { includeTenantHeader: false }),
  platformMe: () => request('GET', '/api/platform/me', undefined, { includeTenantHeader: false }),
  listPlatformTenants: () => request('GET', '/api/platform/tenants', undefined, { includeTenantHeader: false }),
  getPlatformTenant: (id) => request('GET', `/api/platform/tenants/${id}`, undefined, { includeTenantHeader: false }),
  createPlatformTenant: (body) => request('POST', '/api/platform/tenants', body, { includeTenantHeader: false }),
  updatePlatformTenantStatus: (id, body) => request('PUT', `/api/platform/tenants/${id}/status`, body, { includeTenantHeader: false }),
  issuePlatformTenantAdmin: (id, body) => request('POST', `/api/platform/tenants/${id}/admin`, body, { includeTenantHeader: false }),
};
