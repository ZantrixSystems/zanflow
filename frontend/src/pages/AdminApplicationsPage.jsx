import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { api } from '../api.js';
import { useStaffAuth } from '../components/RequireStaffAuth.jsx';
import { buildTenantAdminNav } from '../lib/navigation.js';

const STATUS_META = {
  submitted:            { label: 'Submitted',            cls: 'badge-submitted' },
  under_review:         { label: 'Under review',         cls: 'badge-under-review' },
  awaiting_information: { label: 'Awaiting information', cls: 'badge-awaiting' },
  approved:             { label: 'Approved',             cls: 'badge-approved' },
  refused:              { label: 'Refused',              cls: 'badge-refused' },
  draft:                { label: 'Draft',                cls: 'badge-draft' },
};

function StatusBadge({ status }) {
  const meta = STATUS_META[status] ?? { label: status?.replace(/_/g, ' ') ?? 'Unknown', cls: 'badge-draft' };
  return <span className={`status-badge ${meta.cls}`}>{meta.label}</span>;
}

function formatRefId(tenantSlug, refNumber) {
  if (!refNumber) return '—';
  const prefix = (tenantSlug || 'APP').slice(0, 4).toUpperCase();
  return `${prefix}-${String(refNumber).padStart(6, '0')}`;
}

function formatShortDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
}

export default function AdminApplicationsPage() {
  const { session, logout } = useStaffAuth();
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewMine, setViewMine] = useState(true);
  const [status, setStatus] = useState('');
  const [typeSlug, setTypeSlug] = useState('');
  const [sort, setSort] = useState('updated');
  const [typeOptions, setTypeOptions] = useState([]);

  useEffect(() => {
    api.getAdminApplicationSetup()
      .then((data) => setTypeOptions(data.enabled_application_types ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    api.listAdminApplications({
      status: status || undefined,
      assigned: viewMine ? 'mine' : undefined,
      type: typeSlug || undefined,
      sort,
    })
      .then((data) => { if (active) setApplications(data.applications ?? []); })
      .catch((err) => { if (active) setError(err.message || 'Could not load applications.'); })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [status, viewMine, typeSlug, sort]);

  return (
    <Layout
      session={session}
      onSignOut={logout}
      brandTarget="/admin/dashboard"
      signOutTarget="/admin"
      breadcrumbs={[
        { to: '/admin/dashboard', label: 'Dashboard' },
        { label: 'Applications' },
      ]}
      navItems={buildTenantAdminNav(session)}
    >
      <section className="form-section">
        <h1 className="page-title">Applications</h1>
        <p className="page-subtitle">Review submitted applications and manage your case queue.</p>
      </section>

      <div className="queue-toolbar">
        <div className="queue-view-toggle">
          <button
            type="button"
            className={`queue-toggle-btn${viewMine ? ' active' : ''}`}
            onClick={() => setViewMine(true)}
          >
            My cases
          </button>
          <button
            type="button"
            className={`queue-toggle-btn${!viewMine ? ' active' : ''}`}
            onClick={() => setViewMine(false)}
          >
            All cases
          </button>
        </div>

        <div className="queue-filters">
          <select
            className="queue-filter-select"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            <option value="submitted">Submitted</option>
            <option value="under_review">Under review</option>
            <option value="awaiting_information">Awaiting information</option>
            <option value="approved">Approved</option>
            <option value="refused">Refused</option>
          </select>

          {typeOptions.length > 0 && (
            <select
              className="queue-filter-select"
              value={typeSlug}
              onChange={(e) => setTypeSlug(e.target.value)}
              aria-label="Filter by type"
            >
              <option value="">All types</option>
              {typeOptions.map((t) => (
                <option key={t.slug} value={t.slug}>{t.name}</option>
              ))}
            </select>
          )}

          <select
            className="queue-filter-select"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label="Sort by"
          >
            <option value="updated">Last updated</option>
            <option value="created">Date created</option>
            <option value="type">Type</option>
            <option value="status">Status</option>
          </select>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="spinner">Loading...</div>
      ) : applications.length === 0 ? (
        <div className="queue-empty">
          <div className="queue-empty-title">
            {viewMine ? 'No cases assigned to you' : 'No applications match this filter'}
          </div>
          {viewMine && (
            <p className="queue-empty-hint">
              <button type="button" className="link-btn" onClick={() => setViewMine(false)}>
                View all cases
              </button>{' '}
              to pick one up.
            </p>
          )}
        </div>
      ) : (
        <div className="queue-table-wrap">
          <table className="queue-table">
            <thead>
              <tr>
                <th>Ref</th>
                <th>Type</th>
                <th>Premises</th>
                <th>Status</th>
                <th>Assigned to</th>
                <th>Updated</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((app) => (
                <tr
                  key={app.id}
                  className="queue-table-row"
                  onClick={() => window.location.href = `/admin/applications/${app.id}`}
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') window.location.href = `/admin/applications/${app.id}`; }}
                  role="link"
                  aria-label={`Application ${formatRefId(app.tenant_slug, app.ref_number)}`}
                >
                  <td className="queue-col-ref">
                    <Link
                      to={`/admin/applications/${app.id}`}
                      className="queue-ref-link"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {formatRefId(app.tenant_slug, app.ref_number)}
                    </Link>
                  </td>
                  <td className="queue-col-type">
                    {app.application_type_name ?? <span className="text-muted">—</span>}
                  </td>
                  <td className="queue-col-premises">
                    <div className="queue-premises-name">{app.premises_name || '—'}</div>
                    {app.premises_postcode && (
                      <div className="queue-premises-postcode">{app.premises_postcode}</div>
                    )}
                  </td>
                  <td className="queue-col-status">
                    <StatusBadge status={app.status} />
                  </td>
                  <td className="queue-col-assigned">
                    {app.assigned_user_id === session.user_id
                      ? <span className="queue-assigned-me">You</span>
                      : app.assigned_user_name
                        ? <span className="queue-assigned-other">{app.assigned_user_name}</span>
                        : <span className="queue-unassigned">Unassigned</span>}
                  </td>
                  <td className="queue-col-date">{formatShortDate(app.updated_at)}</td>
                  <td className="queue-col-date">{formatShortDate(app.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}
