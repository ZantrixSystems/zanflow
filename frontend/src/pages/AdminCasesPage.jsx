import { useEffect, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout.jsx';
import { api } from '../api.js';
import { useStaffAuth } from '../components/RequireStaffAuth.jsx';

// ---------------------------------------------------------------------------
// Status metadata — covers both application statuses and pv states
// ---------------------------------------------------------------------------
const STATUS_META = {
  // Application statuses
  submitted:              { label: 'Submitted',        cls: 'badge-submitted' },
  under_review:           { label: 'Under review',     cls: 'badge-under-review' },
  awaiting_information:   { label: 'Awaiting info',    cls: 'badge-awaiting' },
  approved:               { label: 'Approved',         cls: 'badge-approved' },
  refused:                { label: 'Refused',          cls: 'badge-refused' },
  draft:                  { label: 'Draft',            cls: 'badge-draft' },
  // Premises verification states
  unverified:             { label: 'Not submitted',    cls: 'badge-draft' },
  pending_verification:   { label: 'Awaiting review',  cls: 'badge-submitted' },
  verified:               { label: 'Verified',         cls: 'badge-approved' },
  verification_refused:   { label: 'Refused',          cls: 'badge-refused' },
  more_information_required: { label: 'Info required', cls: 'badge-awaiting' },
};

function StatusBadge({ status }) {
  const meta = STATUS_META[status] ?? { label: status?.replace(/_/g, ' ') ?? '—', cls: 'badge-draft' };
  return <span className={`status-badge ${meta.cls}`}>{meta.label}</span>;
}

function formatCaseRef(row) {
  if (row.case_type === 'premises_verification') {
    return row.pv_ref || 'PV—';
  }
  if (!row.ref_number) return '—';
  const prefix = (row.tenant_slug || 'APP').slice(0, 4).toUpperCase();
  return `${prefix}-${String(row.ref_number).padStart(6, '0')}`;
}

function caseDetailPath(row) {
  if (row.case_type === 'premises_verification') {
    return `/admin/premises-verifications/${row.case_id}`;
  }
  return `/admin/applications/${row.case_id}`;
}

function formatShortDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
}

// ---------------------------------------------------------------------------
// SavedFilters sidebar
// ---------------------------------------------------------------------------
function SavedFilters({ currentParams, onApply }) {
  const [filters, setFilters] = useState([]);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState('');
  const [showSave, setShowSave] = useState(false);

  useEffect(() => {
    api.listAdminSavedFilters()
      .then((d) => setFilters(d.filters ?? []))
      .catch(() => {});
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const filterJson = {};
      for (const [k, v] of currentParams.entries()) {
        filterJson[k] = v;
      }
      const data = await api.createAdminSavedFilter({ name: newName.trim(), filter_json: filterJson });
      setFilters((prev) => [data.filter, ...prev]);
      setNewName('');
      setShowSave(false);
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    await api.deleteAdminSavedFilter(id).catch(() => {});
    setFilters((prev) => prev.filter((f) => f.id !== id));
  }

  if (filters.length === 0 && !showSave) {
    return (
      <div className="saved-filters-bar">
        <button type="button" className="link-btn" onClick={() => setShowSave(true)}>
          Save current filter
        </button>
      </div>
    );
  }

  return (
    <div className="saved-filters-bar">
      {filters.map((f) => (
        <span key={f.id} className="saved-filter-chip">
          <button
            type="button"
            className="saved-filter-chip-name"
            onClick={() => onApply(f.filter_json)}
          >
            {f.name}
          </button>
          <button
            type="button"
            className="saved-filter-chip-remove"
            onClick={() => handleDelete(f.id)}
            aria-label={`Remove saved filter "${f.name}"`}
          >
            ×
          </button>
        </span>
      ))}
      {showSave ? (
        <form onSubmit={handleSave} className="saved-filter-save-form">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Filter name"
            className="saved-filter-name-input"
            maxLength={80}
            autoFocus
          />
          <button type="submit" className="btn btn-secondary" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="link-btn" onClick={() => setShowSave(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <button type="button" className="link-btn" onClick={() => setShowSave(true)}>
          + Save filter
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function AdminCasesPage() {
  const { session, logout, refresh } = useStaffAuth();
  const [urlParams, setUrlParams] = useSearchParams();

  // Mirror all filters in URL so they are bookmarkable and nav-linkable
  const assigned    = urlParams.get('assigned') || '';
  const status      = urlParams.get('status') || '';
  const caseType    = urlParams.get('case_type') || '';
  const typeSlug    = urlParams.get('type') || '';
  const createdDays = urlParams.get('created_days') || '';
  const sort        = urlParams.get('sort') || 'updated';

  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [typeOptions, setTypeOptions] = useState([]);

  // Friendly title based on the active assigned filter from the URL
  const viewTitle = (() => {
    if (assigned === 'mine') return 'Assigned to me';
    if (assigned === 'unassigned') return 'Unassigned cases';
    if (caseType === 'premises_verification') return 'Premises verifications';
    return 'All cases';
  })();

  useEffect(() => {
    api.getAdminApplicationSetup()
      .then((d) => setTypeOptions(d.enabled_application_types ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    api.listAdminCases({
      status:       status || undefined,
      assigned:     assigned || undefined,
      case_type:    caseType || undefined,
      type:         typeSlug || undefined,
      created_days: createdDays || undefined,
      sort,
    })
      .then((data) => { if (active) setCases(data.cases ?? []); })
      .catch((err) => { if (active) setError(err.message || 'Could not load cases.'); })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [status, assigned, caseType, typeSlug, createdDays, sort]);

  function setParam(key, value) {
    setUrlParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) {
        next.set(key, value);
      } else {
        next.delete(key);
      }
      return next;
    });
  }

  const applyFilterJson = useCallback((filterJson) => {
    setUrlParams(() => {
      const next = new URLSearchParams();
      for (const [k, v] of Object.entries(filterJson)) {
        if (v) next.set(k, String(v));
      }
      return next;
    });
  }, [setUrlParams]);

  function clearFilters() {
    setUrlParams({});
  }

  const hasActiveFilters = status || assigned || caseType || typeSlug || createdDays;

  return (
    <AdminLayout
      session={session}
      onSignOut={logout}
      onSessionRefresh={refresh}
      breadcrumbs={[
        { to: '/admin/dashboard', label: 'Dashboard' },
        { label: viewTitle },
      ]}
    >
      <section className="form-section">
        <h1 className="page-title">{viewTitle}</h1>
        <p className="page-subtitle">Review and manage cases across all types.</p>
      </section>

      {/* Saved filters bar */}
      <SavedFilters currentParams={urlParams} onApply={applyFilterJson} />

      {/* Toolbar */}
      <div className="queue-toolbar">
        <div className="queue-filters">
          <select
            className="queue-filter-select"
            value={caseType}
            onChange={(e) => setParam('case_type', e.target.value)}
            aria-label="Filter by case type"
          >
            <option value="">All types</option>
            <option value="premises_verification">Premises verification</option>
            <option value="application">Applications</option>
          </select>

          <select
            className="queue-filter-select"
            value={status}
            onChange={(e) => setParam('status', e.target.value)}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            <optgroup label="Applications">
              <option value="submitted">Submitted</option>
              <option value="under_review">Under review</option>
              <option value="awaiting_information">Awaiting information</option>
              <option value="approved">Approved</option>
              <option value="refused">Refused</option>
            </optgroup>
            <optgroup label="Premises verifications">
              <option value="pending_verification">Awaiting review</option>
              <option value="more_information_required">Info required</option>
              <option value="verified">Verified</option>
              <option value="verification_refused">Refused</option>
            </optgroup>
          </select>

          <select
            className="queue-filter-select"
            value={assigned}
            onChange={(e) => setParam('assigned', e.target.value)}
            aria-label="Filter by assignment"
          >
            <option value="">All assignments</option>
            <option value="mine">Assigned to me</option>
            <option value="unassigned">Unassigned</option>
          </select>

          {typeOptions.length > 0 && (
            <select
              className="queue-filter-select"
              value={typeSlug}
              onChange={(e) => setParam('type', e.target.value)}
              aria-label="Filter by application type"
            >
              <option value="">All application types</option>
              {typeOptions.map((t) => (
                <option key={t.slug} value={t.slug}>{t.name}</option>
              ))}
            </select>
          )}

          <select
            className="queue-filter-select"
            value={createdDays}
            onChange={(e) => setParam('created_days', e.target.value)}
            aria-label="Filter by created date"
          >
            <option value="">Any date</option>
            <option value="7">Last 7 days</option>
            <option value="14">Last 14 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>

          <select
            className="queue-filter-select"
            value={sort}
            onChange={(e) => setParam('sort', e.target.value)}
            aria-label="Sort by"
          >
            <option value="updated">Last updated</option>
            <option value="created">Date created</option>
            <option value="type">Case type</option>
            <option value="status">Status</option>
          </select>

          {hasActiveFilters && (
            <button type="button" className="link-btn queue-clear-btn" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="spinner">Loading...</div>
      ) : cases.length === 0 ? (
        <div className="queue-empty">
          <div className="queue-empty-title">
            {hasActiveFilters ? 'No cases match these filters' : 'No cases found'}
          </div>
          {hasActiveFilters && (
            <p className="queue-empty-hint">
              <button type="button" className="link-btn" onClick={clearFilters}>
                Clear filters
              </button>{' '}
              to see all cases.
            </p>
          )}
        </div>
      ) : (
        <div className="queue-table-wrap">
          <table className="queue-table">
            <thead>
              <tr>
                <th>Ref</th>
                <th>Case type</th>
                <th>Premises</th>
                <th>Status</th>
                <th>Assigned to</th>
                <th>Applicant</th>
                <th>Updated</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((row) => {
                const path = caseDetailPath(row);
                return (
                  <tr
                    key={`${row.case_type}-${row.case_id}`}
                    className="queue-table-row"
                    onClick={() => { window.location.href = path; }}
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter') window.location.href = path; }}
                    role="link"
                    aria-label={`${row.type_name}: ${formatCaseRef(row)}`}
                  >
                    <td className="queue-col-ref">
                      <Link
                        to={path}
                        className="queue-ref-link"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {formatCaseRef(row)}
                      </Link>
                    </td>
                    <td className="queue-col-type">
                      <span className="case-type-pill" data-type={row.case_type}>
                        {row.type_name}
                      </span>
                    </td>
                    <td className="queue-col-premises">
                      <div className="queue-premises-name">{row.premises_name || '—'}</div>
                      {row.premises_postcode && (
                        <div className="queue-premises-postcode">{row.premises_postcode}</div>
                      )}
                    </td>
                    <td className="queue-col-status">
                      <StatusBadge status={row.case_status} />
                    </td>
                    <td className="queue-col-assigned">
                      {row.assigned_user_id === session.user_id
                        ? <span className="queue-assigned-me">You</span>
                        : row.assigned_user_name
                          ? <span className="queue-assigned-other">{row.assigned_user_name}</span>
                          : <span className="queue-unassigned">—</span>}
                    </td>
                    <td className="queue-col-assigned">
                      {row.applicant_name || row.applicant_email || '—'}
                    </td>
                    <td className="queue-col-date">{formatShortDate(row.case_updated_at)}</td>
                    <td className="queue-col-date">{formatShortDate(row.case_created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}
