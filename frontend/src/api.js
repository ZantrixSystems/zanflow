/**
 * API client.
 *
 * The frontend is served from the same Worker as the API,
 * so all requests use relative /api/* paths.
 * No VITE_API_URL env var needed — same origin, no CORS.
 *
 * credentials: 'same-origin' is correct and sufficient here.
 * The X-Tenant-Slug header identifies which tenant this portal is for.
 */

const TENANT_SLUG = import.meta.env.VITE_TENANT_SLUG || 'riverside';

async function request(method, path, body) {
  const opts = {
    method,
    credentials: 'same-origin',
    headers: {
      'Content-Type':  'application/json',
      'X-Tenant-Slug': TENANT_SLUG,
    },
  };

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
    err.data   = data;
    throw err;
  }

  return data;
}

export const api = {
  // Applicant auth
  register: (body) => request('POST', '/api/applicant/register', body),
  login:    (body) => request('POST', '/api/applicant/login', body),
  logout:   ()     => request('POST', '/api/applicant/logout'),
  me:       ()     => request('GET',  '/api/applicant/me'),

  // Application types
  getApplicationTypes: () => request('GET', '/api/application-types'),

  // Applications
  createApplication: (body)     => request('POST', '/api/applications', body),
  listApplications:  ()         => request('GET',  '/api/applications'),
  getApplication:    (id)       => request('GET',  `/api/applications/${id}`),
  updateApplication: (id, body) => request('PUT',  `/api/applications/${id}`, body),
  submitApplication: (id)       => request('POST',   `/api/applications/${id}/submit`),
  deleteApplication: (id)       => request('DELETE', `/api/applications/${id}`),
};
