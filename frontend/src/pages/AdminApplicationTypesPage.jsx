import { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import { api } from '../api.js';
import { useStaffAuth } from '../components/RequireStaffAuth.jsx';
import { buildTenantAdminNav } from '../lib/navigation.js';

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export default function AdminApplicationTypesPage() {
  const { session, logout } = useStaffAuth();
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [working, setWorking] = useState(null);
  const [publishingTypeId, setPublishingTypeId] = useState(null);
  const [publishForm, setPublishForm] = useState({ name_override: '', description_override: '', review_mode: 'single_officer' });

  async function load() {
    try {
      const data = await api.listAdminApplicationTypes();
      setTypes(data.application_types ?? []);
    } catch (err) {
      setError(err.message || 'Could not load application types.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handlePublish(applicationTypeId) {
    setWorking(applicationTypeId);
    setError('');
    setNotice('');
    try {
      await api.publishAdminApplicationType(applicationTypeId, {
        name_override: publishForm.name_override.trim() || undefined,
        description_override: publishForm.description_override.trim() || undefined,
        review_mode: publishForm.review_mode,
      });
      setNotice('Application type published successfully.');
      setPublishingTypeId(null);
      setPublishForm({ name_override: '', description_override: '', review_mode: 'single_officer' });
      await load();
    } catch (err) {
      setError(err.message || 'Could not publish application type.');
    } finally {
      setWorking(null);
    }
  }

  async function handleRetire(versionId) {
    if (!window.confirm('Retire this version? Applicants will no longer be able to start new applications of this type. Existing applications are not affected.')) return;
    setWorking(versionId);
    setError('');
    setNotice('');
    try {
      await api.retireAdminApplicationTypeVersion(versionId);
      setNotice('Application type version retired.');
      await load();
    } catch (err) {
      setError(err.message || 'Could not retire version.');
    } finally {
      setWorking(null);
    }
  }

  return (
    <Layout
      session={session}
      onSignOut={logout}
      brandTarget="/admin/dashboard"
      signOutTarget="/admin"
      breadcrumbs={[
        { to: '/admin/dashboard', label: 'Council admin' },
        { label: 'Application types' },
      ]}
      navItems={buildTenantAdminNav(session)}
    >
      <section className="form-section">
        <div className="form-section-title">Application types</div>
        <h1 className="page-title">Manage application types</h1>
        <p className="page-subtitle">
          Control which application types are available to applicants on your portal.
          Publishing a new version of a type will retire the previous one automatically.
          Retiring a type does not affect applications already submitted.
        </p>
      </section>

      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      {loading ? (
        <div className="spinner">Loading...</div>
      ) : types.length === 0 ? (
        <section className="form-section">
          <p className="empty-state">No application types are available on this platform yet.</p>
        </section>
      ) : (
        <section className="form-section">
          <div className="application-list">
            {types.map((row) => {
              const isPublished = row.publication_status === 'published';
              const hasDraft = row.publication_status === 'draft';
              const isNotPublished = !row.version_id || (!isPublished && !hasDraft);
              const isExpanded = publishingTypeId === row.application_type_id;

              return (
                <div key={row.application_type_id} className="application-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                    <div className="application-row-main">
                      <div className="application-row-title">
                        {row.name_override || row.platform_name}
                      </div>
                      <div className="application-row-meta">
                        {row.description_override || row.platform_description}
                      </div>
                      {row.version_id && (
                        <div className="application-row-meta">
                          Version {row.version_number}
                          {isPublished && ` · Published ${formatDate(row.published_at)}`}
                          {row.publication_status === 'retired' && ` · Retired ${formatDate(row.retired_at)}`}
                          {row.review_mode && ` · ${row.review_mode === 'manager_signoff_required' ? 'Manager sign-off required' : 'Single officer review'}`}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      {row.version_id && (
                        <span className={`status-tag status-${isPublished ? 'verified' : 'unverified'}`}>
                          {row.publication_status === 'published' ? 'Published' : row.publication_status}
                        </span>
                      )}
                      {!row.version_id && (
                        <span className="status-tag status-unverified">Not published</span>
                      )}
                      {isPublished && (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => handleRetire(row.version_id)}
                          disabled={working === row.version_id}
                        >
                          {working === row.version_id ? 'Working...' : 'Retire'}
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setPublishingTypeId(isExpanded ? null : row.application_type_id);
                          setPublishForm({
                            name_override: row.name_override ?? '',
                            description_override: row.description_override ?? '',
                            review_mode: row.review_mode ?? 'single_officer',
                          });
                        }}
                      >
                        {isExpanded ? 'Cancel' : isPublished ? 'Republish' : 'Publish'}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="soft-panel" style={{ marginTop: 16 }}>
                      <div className="form-section-title">Publish settings</div>
                      <p className="platform-body-copy" style={{ marginBottom: 16 }}>
                        You can optionally override the public display name and description for your council.
                        Leave blank to use the platform defaults.
                      </p>
                      <div className="form-group">
                        <label>Display name override</label>
                        <input
                          value={publishForm.name_override}
                          onChange={(e) => setPublishForm((f) => ({ ...f, name_override: e.target.value }))}
                          placeholder={row.platform_name}
                        />
                      </div>
                      <div className="form-group">
                        <label>Description override</label>
                        <textarea
                          rows={3}
                          value={publishForm.description_override}
                          onChange={(e) => setPublishForm((f) => ({ ...f, description_override: e.target.value }))}
                          placeholder={row.platform_description}
                        />
                      </div>
                      <div className="form-group">
                        <label>Review mode</label>
                        <select
                          value={publishForm.review_mode}
                          onChange={(e) => setPublishForm((f) => ({ ...f, review_mode: e.target.value }))}
                        >
                          <option value="single_officer">Single officer review</option>
                          <option value="manager_signoff_required">Manager sign-off required</option>
                        </select>
                        <span className="form-hint">
                          Manager sign-off mode is noted on the application but full enforcement is coming in a later release.
                        </span>
                      </div>
                      <div className="platform-hero-actions">
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => handlePublish(row.application_type_id)}
                          disabled={working === row.application_type_id}
                        >
                          {working === row.application_type_id ? 'Publishing...' : 'Confirm publish'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => setPublishingTypeId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </Layout>
  );
}
