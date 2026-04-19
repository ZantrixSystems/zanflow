import { useEffect, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout.jsx';
import { api } from '../api.js';
import { useStaffAuth } from '../components/RequireStaffAuth.jsx';

// ---------------------------------------------------------------------------
// Status metadata — application statuses + premises verification states
// ---------------------------------------------------------------------------
const STATUS_META = {
  submitted:                 { label: 'Submitted',       cls: 'badge-submitted' },
  under_review:              { label: 'Under review',    cls: 'badge-under-review' },
  awaiting_information:      { label: 'Awaiting info',   cls: 'badge-awaiting' },
  approved:                  { label: 'Approved',        cls: 'badge-approved' },
  refused:                   { label: 'Refused',         cls: 'badge-refused' },
  draft:                     { label: 'Draft',           cls: 'badge-draft' },
  unverified:                { label: 'Not submitted',   cls: 'badge-draft' },
  pending_verification:      { label: 'Awaiting review', cls: 'badge-submitted' },
  verified:                  { label: 'Verified',        cls: 'badge-approved' },
  verification_refused:      { label: 'Refused',         cls: 'badge-refused' },
  more_information_required: { label: 'Info required',   cls: 'badge-awaiting' },
};

function StatusBadge({ status }) {
  const meta = STATUS_META[status] ?? { label: status?.replace(/_/g, ' ') ?? '—', cls: 'badge-draft' };
  return <span className={`status-badge ${meta.cls}`}>{meta.label}</span>;
}

function formatCaseRef(row) {
  if (row.case_type === 'premises_verification') return row.pv_ref || 'PV—';
  if (!row.ref_number) return '—';
  const prefix = (row.tenant_slug || 'APP').slice(0, 4).toUpperCase();
  return `${prefix}-${String(row.ref_number).padStart(6, '0')}`;
}

function caseDetailPath(row) {
  if (row.case_type === 'premises_verification') return `/admin/premises-verifications/${row.case_id}`;
  return `/admin/applications/${row.case_id}`;
}

function formatShortDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
}

// ---------------------------------------------------------------------------
// ActiveFilterTag — shows a dismissible chip for each active filter
// ---------------------------------------------------------------------------
const FILTER_LABELS = {
  assigned:     { mine: 'Assigned to me', unassigned: 'Unassigned' },
  case_type:    { premises_verification: 'Premises verifications', application: 'Applications' },
  status: {
    submitted: 'Submitted', under_review: 'Under review', awaiting_information: 'Awaiting info',
    approved: 'Approved', refused: 'Refused',
    pending_verification: 'Awaiting review', more_information_required: 'Info required',
    verified: 'Verified', verification_refused: 'Refused',
  },
  created_days: { 7: 'Last 7 days', 14: 'Last 14 days', 30: 'Last 30 days', 90: 'Last 90 days' },
};

function ActiveFilterTags({ assigned, status, caseType, typeSlug, createdDays, typeOptions, onClear }) {
  const tags = [];

  if (assigned)    tags.push({ key: 'assigned',     label: FILTER_LABELS.assigned[assigned] || assigned });
  if (caseType)    tags.push({ key: 'case_type',    label: FILTER_LABELS.case_type[caseType] || caseType });
  if (status)      tags.push({ key: 'status',       label: FILTER_LABELS.status[status] || status });
  if (typeSlug) {
    const found = typeOptions.find((t) => t.slug === typeSlug);
    tags.push({ key: 'type', label: found ? found.name : typeSlug });
  }
  if (createdDays) tags.push({ key: 'created_days', label: FILTER_LABELS.created_days[createdDays] || `Last ${createdDays} days` });

  if (tags.length === 0) return null;

  return (
    <div className="active-filter-tags">
      {tags.map((tag) => (
        <span key={tag.key} className="active-filter-tag">
          {tag.label}
          <button
            type="button"
            className="active-filter-tag-remove"
            onClick={() => onClear(tag.key)}
            aria-label={`Remove filter: ${tag.label}`}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SavedFilters — lightweight chip bar above the toolbar
// ---------------------------------------------------------------------------
function SavedFilters({ currentParams, hasActiveFilters, onApply }) {
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
      // silent — non-critical
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    await api.deleteAdminSavedFilter(id).catch(() => {});
    setFilters((prev) => prev.filter((f) => f.id !== id));
  }

  // Don't render the bar at all if there are no saved filters and no active
  // filters to save — keeps the page clean for first-time users.
  if (filters.length === 0 && !hasActiveFilters && !showSave) return null;

  return (
    <div className="saved-filters-bar">
      <span className="saved-filters-label">Saved:</span>
      {filters.map((f) => (
        <span key={f.id} className="saved-filter-chip">
          <button
            type="button"
            className="saved-filter-chip-name"
            onClick={() => onApply(f.filter_json)}
            title={`Apply: ${f.name}`}
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
            placeholder="Name this filter…"
            className="saved-filter-name-input"
            maxLength={80}
            autoFocus
          />
          <button type="submit" className="btn btn-secondary btn-sm" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="link-btn" onClick={() => setShowSave(false)}>
            Cancel
          </button>
        </form>
      ) : hasActiveFilters ? (
        <button type="button" className="link-btn saved-filter-save-trigger" onClick={() => setShowSave(true)}>
          + Save this filter
        </button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function AdminCasesPage() {
  const { session, logout, refresh } = useStaffAuth();
  const [urlParams, setUrlParams] = useSearchParams();

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

  const viewTitle = (() => {
    if (assigned === 'mine') return 'Assigned to me';
    if (assigned === 'unassigned') return 'Unassigned cases';
    if (caseType === 'premises_verification') return 'Premises verifications';
    return 'All cases';
  })();

  const viewSubtitle = (() => {
    if (assigned === 'mine') return 'Cases currently assigned to you.';
    if (assigned === 'unassigned') return 'Cases not yet picked up by an officer.';
    if (caseType === 'premises_verification') return 'Review applicants\' ownership claims before they can submit licence applications.';
    return 'All active cases across applications and premises verifications.';
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
      if (value) { next.set(key, value); } else { next.delete(key); }
      return next;
    });
  }

  function clearParam(key) {
    setParam(key, '');
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

  function clearAllFilters() {
    setUrlParams({});
  }

  const hasActiveFilters = !!(status || assigned || caseType || typeSlug || createdDays);

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
      <div className="queue-page-header">
        <h1 className="queue-page-title">{viewTitle}</h1>
        <p className="queue-page-subtitle">{viewSubtitle}</p>
      </div>

      {/* Saved filter chips — only visible when there are saved filters or active filters */}
      <SavedFilters
        currentParams={urlParams}
        hasActiveFilters={hasActiveFilters}
        onApply={applyFilterJson}
      />

      {/* Filter + sort toolbar */}
      <div className="queue-toolbar">
        <div className="queue-filters">
          <select
            className={`queue-filter-select${caseType ? ' is-active' : ''}`}
            value={caseType}
            onChange={(e) => setParam('case_type', e.target.value)}
            aria-label="Filter by case type"
          >
            <option value="">Case type</option>
            <option value="premises_verification">Premises verification</option>
            <option value="application">Applications</option>
          </select>

          <select
            className={`queue-filter-select${status ? ' is-active' : ''}`}
            value={status}
            onChange={(e) => setParam('status', e.target.value)}
            aria-label="Filter by status"
          >
            <option value="">Status</option>
            <optgroup label="Applications">
              <option value="submitted">Submitted</option>
              <option value="under_review">Under review</option>
              <option value="awaiting_information">Awaiting info</option>
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
            className={`queue-filter-select${assigned ? ' is-active' : ''}`}
            value={assigned}
            onChange={(e) => setParam('assigned', e.target.value)}
            aria-label="Filter by assignment"
          >
            <option value="">Assigned to</option>
            <option value="mine">Me</option>
            <option value="unassigned">Unassigned</option>
          </select>

          {typeOptions.length > 0 && (
            <select
              className={`queue-filter-select${typeSlug ? ' is-active' : ''}`}
              value={typeSlug}
              onChange={(e) => setParam('type', e.target.value)}
              aria-label="Filter by application type"
            >
              <option value="">Licence type</option>
              {typeOptions.map((t) => (
                <option key={t.slug} value={t.slug}>{t.name}</option>
              ))}
            </select>
          )}

          <select
            className={`queue-filter-select${createdDays ? ' is-active' : ''}`}
            value={createdDays}
            onChange={(e) => setParam('created_days', e.target.value)}
            aria-label="Filter by date"
          >
            <option value="">Date range</option>
            <option value="7">Last 7 days</option>
            <option value="14">Last 14 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
        </div>

        <div className="queue-sort">
          <select
            className="queue-filter-select"
            value={sort}
            onChange={(e) => setParam('sort', e.target.value)}
            aria-label="Sort by"
          >
            <option value="updated">Sort: last updated</option>
            <option value="created">Sort: date created</option>
            <option value="type">Sort: case type</option>
            <option value="status">Sort: status</option>
          </select>
        </div>
      </div>

      {/* Active filter tags — dismissible chips showing what's currently filtered */}
      <ActiveFilterTags
        assigned={assigned}
        status={status}
        caseType={caseType}
        typeSlug={typeSlug}
        createdDays={createdDays}
        typeOptions={typeOptions}
        onClear={clearParam}
      />

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
              <button type="button" className="link-btn" onClick={clearAllFilters}>
                Clear all filters
              </button>{' '}
              to see all cases.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="queue-count">{cases.length} case{cases.length === 1 ? '' : 's'}</div>
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
                      <td className="queue-col-applicant">
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
        </>
      )}
    </AdminLayout>
  );
}
